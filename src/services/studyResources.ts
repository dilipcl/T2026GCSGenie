import { db } from '../db';
import {
  StudyResource,
  SubjectConfig,
  SubjectId,
  SyllabusTopic,
  Task,
  TopicResourceMark,
  UserRole,
} from '../types';
import { logAuditEvent } from './auditService';
import { toLocalISODate, todayISO } from '../utils/date';

/**
 * What Tejas works from in each subject, and which topics each has covered.
 *
 * Asked for on 19 Oct 2026: he has his school notebook, the CGP revision
 * guides, Sparx for homework, practical write-ups and coursework, and none of
 * them appeared anywhere in the app - so "has bonding been done in the CGP
 * book?" had no answer short of asking him.
 *
 * Kept deliberately cheap to record. A resource is ticked per topic in one tap,
 * and a resource with match words ticks itself whenever finished homework on
 * the topic names it - closing "Sparx Maths" homework tagged to a topic ticks
 * Sparx there without anybody touching the tick. A parent sets the list per
 * subject; a subject nobody has set up gets the defaults below, derived on
 * read rather than written, so changing a default changes it for everyone who
 * has not chosen otherwise.
 */

const SCIENCES: SubjectId[] = ['biology', 'chemistry', 'physics'];
const CGP_SUBJECTS: SubjectId[] = [
  ...SCIENCES,
  'maths',
  'computer_science',
  'english_lit',
  'english_lang',
  'history',
];

/**
 * The starting list for a subject. Ids are fixed strings so ticks made against
 * a default survive the parent later saving the list as their own.
 */
export function defaultResourcesFor(subjectId: SubjectId): StudyResource[] {
  if (subjectId === 'general' || subjectId === 'revision') return [];
  const list: StudyResource[] = [{ id: 'notebook', name: 'Notebook', appliesTo: 'ALL' }];
  if (CGP_SUBJECTS.includes(subjectId))
    list.push({ id: 'cgp', name: 'CGP guide', appliesTo: 'ALL', matches: 'cgp' });
  if (subjectId === 'maths')
    list.push({ id: 'sparx', name: 'Sparx Maths', appliesTo: 'ALL', matches: 'sparx' });
  if (SCIENCES.includes(subjectId)) {
    list.push({ id: 'sparx', name: 'Sparx Science', appliesTo: 'ALL', matches: 'sparx' });
    list.push({
      id: 'practical',
      name: 'Practical write-up',
      appliesTo: 'PRACTICALS',
      matches: 'practical, req prac',
    });
  }
  if (subjectId === 'art')
    list.push({ id: 'sketchbook', name: 'Sketchbook', appliesTo: 'ALL', matches: 'sketchbook' });
  return list;
}

/** The resources in use for a subject: the parent's list, else the defaults. */
export function resourcesFor(subject?: Pick<SubjectConfig, 'id' | 'resources'>): StudyResource[] {
  if (!subject) return [];
  return (subject.resources ?? defaultResourcesFor(subject.id)).filter((r) => !r.archived);
}

export function appliesTo(resource: StudyResource, topic: Pick<SyllabusTopic, 'isRequiredPractical'>) {
  return resource.appliesTo === 'ALL' || !!topic.isRequiredPractical;
}

const words = (matches?: string) =>
  (matches ?? '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

export interface ResourceState {
  resource: StudyResource;
  done: boolean;
  /** Ticked by finished homework naming it, rather than by a tap. */
  auto: boolean;
  on?: string;
  ref?: string;
}

/**
 * Whether a topic has been done in a resource.
 *
 * A tap wins over the homework match, because it carries the page reference
 * somebody chose to write down; the match only fills a gap nobody tapped.
 */
export function resourceState(
  topic: Pick<SyllabusTopic, 'resources'>,
  resource: StudyResource,
  workOnTopic: Pick<Task, 'title' | 'completed' | 'completedAt'>[]
): ResourceState {
  const mark: TopicResourceMark | undefined = topic.resources?.[resource.id];
  if (mark) return { resource, done: true, auto: false, on: mark.on, ref: mark.ref };

  const match = words(resource.matches);
  if (match.length) {
    const done = workOnTopic
      .filter((t) => t.completed && t.completedAt)
      .filter((t) => match.some((w) => t.title.toLowerCase().includes(w)))
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];
    if (done)
      return {
        resource,
        done: true,
        auto: true,
        on: toLocalISODate(new Date(done.completedAt!)),
      };
  }
  return { resource, done: false, auto: false };
}

/**
 * Ticks or unticks a resource on a topic.
 *
 * Written by key path, so ticking the CGP guide on a phone and the notebook on
 * a laptop while offline both survive the merge - a whole-object write of
 * `resources` would let the second device's copy erase the first's tick.
 */
export async function setTopicResource(
  topicId: string,
  resourceId: string,
  done: boolean,
  user: UserRole = 'STUDENT',
  ref?: string
): Promise<void> {
  const topic = await db.syllabusTopics.get(topicId);
  if (!topic) return;
  const before = topic.resources?.[resourceId];
  const mark: TopicResourceMark | undefined = done
    ? {
        on: before?.on ?? todayISO(),
        // A ref passed in replaces the old one, an empty one clears it; none
        // passed (a plain tap) keeps whatever was written before.
        ref: ref === undefined ? before?.ref : ref.trim() || undefined,
      }
    : undefined;
  if (!before && !mark) return;
  if (before && mark && before.ref === mark.ref) return;

  await db.syllabusTopics.update(topicId, { [`resources.${resourceId}`]: mark });
  await logAuditEvent({
    user,
    action: 'UPDATE',
    entity: 'SyllabusTopic',
    entityId: topicId,
    fieldChanged: `resource ${resourceId}`,
    oldValue: before ? `done${before.ref ? ` (${before.ref})` : ''}` : 'not done',
    newValue: mark ? `done${mark.ref ? ` (${mark.ref})` : ''}` : 'not done',
  });
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || 'resource';

/** A new resource's id: readable, and unique within the subject's list. */
export function resourceId(name: string, taken: string[]): string {
  const base = slug(name);
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Saves a subject's list as the parent's own.
 *
 * Archived rather than removed when a resource goes, so the ticks against it
 * are still there if it comes back; a list that drops a resource and loses
 * its history makes trying a change expensive.
 */
export async function saveSubjectResources(
  subjectId: SubjectId,
  list: StudyResource[],
  user: UserRole = 'PARENT'
): Promise<void> {
  const subject = await db.subjects.get(subjectId);
  if (!subject) return;
  const clean = list
    .map((r) => ({ ...r, name: r.name.trim(), matches: r.matches?.trim() || undefined }))
    .filter((r) => r.name.length > 0);

  await db.subjects.update(subjectId, { resources: clean });
  await logAuditEvent({
    user,
    action: 'UPDATE',
    entity: 'SubjectConfig',
    entityId: subjectId,
    fieldChanged: 'resources',
    oldValue: resourcesFor(subject)
      .map((r) => r.name)
      .join(', '),
    newValue: clean
      .filter((r) => !r.archived)
      .map((r) => r.name)
      .join(', '),
  });
}

/** Back to the defaults: the parent's list is removed, ticks are untouched. */
export async function resetSubjectResources(
  subjectId: SubjectId,
  user: UserRole = 'PARENT'
): Promise<void> {
  await db.subjects.update(subjectId, { resources: undefined });
  await logAuditEvent({
    user,
    action: 'UPDATE',
    entity: 'SubjectConfig',
    entityId: subjectId,
    fieldChanged: 'resources',
    newValue: 'defaults',
  });
}

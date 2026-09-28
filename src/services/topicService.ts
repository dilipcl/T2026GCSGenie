import { db } from '../db';
import { SubjectId, SyllabusTopic, UserRole } from '../types';
import { logAuditEvent } from './auditService';
import { newId } from '../utils/id';
import { todayISO } from '../utils/date';

export interface NewTopicInput {
  subjectId: SubjectId;
  title: string;
  unit?: string;
  isRequiredPractical?: boolean;
  driveNotesUrl?: string;
  /** Defaults to today. A topic added from Tuesday's lesson was taught on Tuesday. */
  dateTaught?: string;
  specRef?: string;
  isImportantForGrade9?: boolean;
  confidenceRating?: SyllabusTopic['confidenceRating'];
  yearGroup?: SyllabusTopic['yearGroup'];
}

/**
 * Adds a syllabus topic, with the defaults a Year 10 topic starts from.
 *
 * Topics can now be created from two places - the subject screen and the lesson
 * row, where somebody tagging a lesson finds the topic it covered is not on the
 * list yet. Two copies of these defaults would drift the first time either was
 * tuned, and the drift would show up as topics from one screen sorting or
 * scoring differently from the other.
 */
export async function addSyllabusTopic(
  input: NewTopicInput,
  user: UserRole = 'STUDENT'
): Promise<SyllabusTopic> {
  const topic: SyllabusTopic = {
    id: newId('topic'),
    subjectId: input.subjectId,
    unit: input.unit?.trim() || 'Year 10',
    title: input.title.trim(),
    isCompleted: false,
    confidenceRating: input.confidenceRating ?? 3,
    isImportantForGrade9: input.isImportantForGrade9 ?? true,
    isRequiredPractical: input.isRequiredPractical ?? false,
    yearGroup: input.yearGroup ?? 'YEAR_10',
    dateTaught: input.dateTaught ?? todayISO(),
    driveNotesUrl: input.driveNotesUrl?.trim() || undefined,
    specRef: input.specRef?.trim() || undefined,
  };

  await db.syllabusTopics.add(topic);
  await logAuditEvent({
    user,
    action: 'INSERT',
    entity: 'SyllabusTopic',
    entityId: topic.id,
    newValue: `Added Year 10 Topic: ${topic.title} [${topic.unit}]`,
  });

  return topic;
}

/**
 * Says which topic a check-in's note was about.
 *
 * A focus block chooses its topic as it starts; an evening "what I took away"
 * never had anywhere to say it. Both are notes worth finding from the topic, so
 * both can be tagged afterwards, with the same audit line as a file or a lesson.
 */
export async function tagCheckInToTopic(
  id: string,
  topicId: string | undefined,
  user: UserRole = 'STUDENT'
): Promise<void> {
  const existing = await db.checkIns.get(id);
  if (!existing) return;

  await db.checkIns.update(id, { topicId });
  await logAuditEvent({
    user,
    action: 'UPDATE',
    entity: 'DailyCheckIn',
    entityId: id,
    fieldChanged: 'topicId',
    oldValue: existing.topicId ?? '(none)',
    newValue: topicId ?? '(cleared)',
  });
}

/**
 * Says which topic a piece of work was about.
 *
 * Work counts on a topic's page by `linkedTopicId`, and until this nothing but
 * a focus block's question ever set it - no creation path asks, and the inbox
 * listed lessons, notes and photos but never work. So a topic read "Nothing
 * recorded yet" beside homework on exactly that topic, photos and all. The
 * work's photos follow it (see `library`), so tagging the homework files its
 * pictures too.
 */
export async function tagTaskToTopic(
  id: string,
  topicId: string | undefined,
  user: UserRole = 'STUDENT'
): Promise<void> {
  const existing = await db.tasks.get(id);
  if (!existing) return;

  await db.tasks.update(id, { linkedTopicId: topicId });
  await logAuditEvent({
    user,
    action: 'UPDATE',
    entity: 'Task',
    entityId: id,
    fieldChanged: 'linkedTopicId',
    oldValue: existing.linkedTopicId ?? '(none)',
    newValue: topicId ?? '(cleared)',
  });
}

/**
 * How sure he is about a topic, set from the topic's own page.
 *
 * The same field the subject screen's stars and the focus wrap-up both move,
 * so all three show one number. Logged, because a rating that drifts from 2 to
 * 5 in a week is worth being able to trace back to what moved it.
 */
export async function setTopicConfidence(
  id: string,
  rating: SyllabusTopic['confidenceRating'],
  user: UserRole = 'STUDENT'
): Promise<void> {
  const existing = await db.syllabusTopics.get(id);
  if (!existing || existing.confidenceRating === rating) return;

  await db.syllabusTopics.update(id, { confidenceRating: rating });
  await logAuditEvent({
    user,
    action: 'UPDATE',
    entity: 'SyllabusTopic',
    entityId: id,
    fieldChanged: 'confidenceRating',
    oldValue: String(existing.confidenceRating),
    newValue: String(rating),
  });
}

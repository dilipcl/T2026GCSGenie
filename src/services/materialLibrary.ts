import { db } from '../db';
import { SubjectConfig, SubjectId, SyllabusTopic } from '../types';
import { EvidenceEntity, EvidenceRef, evidenceIndex } from './evidenceService';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { toLocalISODate } from '../utils/date';
import { isTimerBlock } from './focusSessionService';

/**
 * Everything Tejas has captured, in one list, whatever kind of thing it is.
 *
 * The report that prompted this found four substantial pieces of work sitting in
 * Drive - a Jekyll & Hyde homework, a page of RAM/ROM notes, crude oil notes,
 * USA 1920s notes - while the app showed the subjects they belong to as red and
 * empty. The material existed. What did not exist was any screen that could be
 * opened with the question "what is in here?" rather than "what is missing?".
 *
 * That distinction is the whole of this module. `evidenceService` answers
 * whether a piece of *work* can show its working, and is organised by the work.
 * A photograph is a leaf on that tree. Here the photograph is the subject of the
 * sentence and the work it proves is context, because "show me everything we
 * have for Chemistry" cannot be answered by walking a list of tasks - the
 * material is spread across six kinds of record plus two kinds of note, and four
 * of those eight have never been rendered anywhere at all.
 *
 * Derived on read, like the XP total and the day record. There is no materials
 * table and there must not be one: every item here is a view of a row that
 * something else owns, and a second copy would be wrong the first time a photo
 * was deleted.
 */

export type MaterialKind = 'FILE' | 'LINK' | 'NOTE' | 'PAPER';

/** What the material hangs off. The last two have no record of their own. */
export type MaterialOwner = EvidenceEntity | 'Lesson' | 'Check-in';

export interface Material {
  /** Stable across reads, so a list can be keyed and a selection survives one. */
  id: string;
  kind: MaterialKind;
  subjectId?: SubjectId;
  topicId?: string;
  /** The topic's unit, for grouping. Only known once something is tagged. */
  unit?: string;
  /** Local ISO date it was captured. Never `toISOString()` - see utils/date. */
  capturedOn: string;
  title: string;
  /** A note in full, or a caption. Notes are never truncated here. */
  excerpt?: string;
  /** What `MaterialLink` opens. Absent on a note, which has nothing to open. */
  ref?: EvidenceRef;
  owner: { entity: MaterialOwner; id: string; title: string };
}

export interface SubjectCoverage {
  subjectId: SubjectId;
  name: string;
  shortName: string;
  icon: string;
  materials: number;
  files: number;
  links: number;
  notes: number;
  papers: number;
  /** Newest capture, so a subject that has gone quiet says so. */
  lastCapturedOn?: string;
  finishedTopics: number;
  /**
   * Finished topics with nothing attached anywhere.
   *
   * The honest gap, and the number this screen exists to show. A topic ticked
   * off with no notes is the classic "covered it, cannot revise from it", and
   * it is invisible on every other screen because each one only knows about its
   * own kind of record.
   */
  finishedTopicsWithoutMaterial: number;
  /** Captured but attached to no topic, so nothing can be built from it yet. */
  untagged: number;
}

/**
 * Which date a piece of material belongs to.
 *
 * A file knows when it was captured. A link does not - it is a field on a
 * record - so it takes the date of the work it belongs to, and failing that the
 * day the record was closed. Falling back to today would put every untagged
 * link at the top of the list forever, which is the one answer that is always
 * wrong.
 */
function refDate(ref: EvidenceRef, completedAt?: number, dueDate?: string): string {
  if (ref.capturedAt) return toLocalISODate(new Date(ref.capturedAt));
  if (completedAt) return toLocalISODate(new Date(completedAt));
  return dueDate ?? toLocalISODate(new Date(0));
}

export interface LibrarySnapshot {
  materials: Material[];
  coverage: SubjectCoverage[];
  /** Topics by id, so a screen can name a tag without a second read. */
  topics: SyllabusTopic[];
}

/**
 * One read, both answers.
 *
 * The coverage grid and the list underneath it are the same data counted two
 * ways, and computing them in separate queries is how two panes of one screen
 * end up disagreeing about how many photos there are.
 */
export async function library(): Promise<LibrarySnapshot> {
  const [subjects, topics, occurrences, checkIns, tasks, index] = await Promise.all([
    db.subjects.toArray(),
    db.syllabusTopics.toArray(),
    db.checkInOccurrences.toArray(),
    db.checkIns.toArray(),
    db.tasks.toArray(),
    evidenceIndex(),
  ]);

  const topicById = new Map(topics.map((t) => [t.id, t]));
  const workTopic = new Map(tasks.map((t) => [t.id, t.linkedTopicId]));
  const materials: Material[] = [];

  for (const work of index) {
    for (const ref of work.evidence) {
      /**
       * Where the topic comes from, in order of how much somebody meant it.
       *
       * A tag put on the file itself wins. Failing that, evidence hanging off a
       * syllabus topic is about that topic by construction - which is what
       * makes the notes link on a topic useful without anybody tagging
       * anything. And a photo of homework is about whatever the homework is
       * about: tagging the work once files its pictures with it, rather than
       * leaving them in the inbox to be tagged one by one to the same topic.
       */
      const topicId =
        ref.topicId ??
        (work.entity === 'Syllabus topic'
          ? work.entityId
          : work.entity === 'Task'
          ? workTopic.get(work.entityId)
          : undefined);
      const topic = topicId ? topicById.get(topicId) : undefined;

      materials.push({
        id: ref.attachmentId ?? `${work.entity}__${work.entityId}__${ref.source}`,
        kind:
          ref.kind === 'LINK' ? 'LINK' : work.entity === 'Assessment' ? 'PAPER' : 'FILE',
        subjectId: work.subjectId ?? topic?.subjectId,
        topicId,
        unit: topic?.unit,
        capturedOn: refDate(ref, work.completedAt, work.dueDate),
        /**
         * A link is named by what it is, not by what it hangs off.
         *
         * `evidenceService` labels a link with the title of the record carrying
         * it, which is right for a chip sitting on that record's row and wrong
         * here: the library already prints the owner underneath, so the row read
         * "Physics Energy Transfer Safety Step Problems · task · Physics Energy
         * Transfer Safety Step Problems". The source - "Drive proof link" - is
         * the part that says anything new, and it is what the activity feed has
         * always shown for the same reason.
         */
        title: ref.kind === 'LINK' ? ref.source : ref.label,
        ref,
        owner: { entity: work.entity, id: work.entityId, title: work.title },
      });
    }
  }

  /**
   * What was covered in a lesson, which is material even though it is only a
   * sentence. For three weeks in September it was the *only* record that any
   * teaching had happened, and it has never been listed anywhere but the day it
   * was typed on.
   */
  for (const occurrence of occurrences) {
    const text = occurrence.notes?.trim();
    if (!text) continue;

    const topic = occurrence.topicId ? topicById.get(occurrence.topicId) : undefined;

    materials.push({
      id: `occ__${occurrence.id}`,
      kind: 'NOTE',
      subjectId: occurrence.subjectId ?? topic?.subjectId,
      topicId: occurrence.topicId,
      unit: topic?.unit,
      capturedOn: occurrence.date,
      title: occurrence.label,
      excerpt: text,
      owner: { entity: 'Lesson', id: occurrence.id, title: occurrence.label },
    });
  }

  /**
   * The evening's takeaway. `keyLearning` only - a blocker is a question for a
   * teacher rather than something to revise from, and the Record tab already
   * shows those in full. A library that lists questions alongside answers makes
   * both harder to find.
   */
  for (const checkIn of checkIns) {
    const text = checkIn.structuredNotes?.keyLearning?.trim();
    if (!text) continue;

    // A focus block's note knows its topic, so it files under it rather than
    // joining the untagged pile at the bottom of the subject.
    const topic = checkIn.topicId ? topicById.get(checkIn.topicId) : undefined;

    materials.push({
      id: `checkin__${checkIn.id}`,
      kind: 'NOTE',
      subjectId: checkIn.studySubjectId ?? topic?.subjectId,
      topicId: topic?.id,
      unit: topic?.unit,
      capturedOn: checkIn.date,
      title: isTimerBlock(checkIn) ? 'Focus block' : 'What I took away',
      excerpt: text,
      owner: { entity: 'Check-in', id: checkIn.id, title: `Check-in ${checkIn.date}` },
    });
  }

  materials.sort((a, b) => b.capturedOn.localeCompare(a.capturedOn));

  return {
    materials,
    coverage: coverage(materials, topics, subjects.length ? subjects : INITIAL_SUBJECTS),
    topics,
  };
}

/**
 * The per-subject counts, as a pure function of what was read.
 *
 * Pure so it can be tested against a fixture rather than a database, and so the
 * one screen that shows both a grid and a list cannot compute them from two
 * different reads.
 */
export function coverage(
  materials: Material[],
  topics: SyllabusTopic[],
  subjects: SubjectConfig[]
): SubjectCoverage[] {
  const tagged = new Set(materials.map((m) => m.topicId).filter(Boolean));

  return subjects.map((subject) => {
    const mine = materials.filter((m) => m.subjectId === subject.id);
    const finished = topics.filter((t) => t.subjectId === subject.id && t.isCompleted);

    return {
      subjectId: subject.id,
      name: subject.name,
      shortName: subject.shortName,
      icon: subject.icon,
      materials: mine.length,
      files: mine.filter((m) => m.kind === 'FILE' || m.kind === 'PAPER').length,
      links: mine.filter((m) => m.kind === 'LINK').length,
      notes: mine.filter((m) => m.kind === 'NOTE').length,
      papers: mine.filter((m) => m.kind === 'PAPER').length,
      // Already sorted newest first, so the first one is the answer.
      lastCapturedOn: mine[0]?.capturedOn,
      finishedTopics: finished.length,
      finishedTopicsWithoutMaterial: finished.filter((t) => !tagged.has(t.id)).length,
      untagged: mine.filter((m) => !m.topicId).length,
    };
  });
}

/**
 * Free-text lookup across everything captured.
 *
 * Every term must appear, for the same reason it must in `evidenceService`:
 * "chemistry crude" asking for anything mentioning either word returns most of
 * the library and answers nothing.
 */
export function materialMatches(item: Material, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = [
    item.title,
    item.excerpt ?? '',
    item.unit ?? '',
    item.subjectId ?? '',
    item.owner.title,
    item.owner.entity,
  ]
    .join(' ')
    .toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

export interface MaterialGroup {
  /** The unit, or the one bucket that matters most: nothing tagged yet. */
  unit: string;
  untagged: boolean;
  items: Material[];
}

/**
 * A subject's material, grouped the way it will be revised from.
 *
 * Untagged material goes last rather than into a unit called "Other". It is not
 * a unit, it is a to-do: nothing can be built out of a photograph that is not
 * attached to anything, and burying that among the real units is how it stays
 * that way.
 */
export function groupByUnit(materials: Material[]): MaterialGroup[] {
  const byUnit = new Map<string, Material[]>();
  const untagged: Material[] = [];

  for (const item of materials) {
    if (!item.unit) {
      untagged.push(item);
      continue;
    }
    const list = byUnit.get(item.unit) ?? [];
    list.push(item);
    byUnit.set(item.unit, list);
  }

  const groups: MaterialGroup[] = [...byUnit.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([unit, items]) => ({ unit, untagged: false, items }));

  if (untagged.length) {
    groups.push({ unit: 'Not tagged to a topic yet', untagged: true, items: untagged });
  }

  return groups;
}

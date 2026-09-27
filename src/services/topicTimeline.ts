import { db } from '../db';
import {
  CheckInOccurrence,
  DailyCheckIn,
  Goal,
  OccurrenceOutcome,
  SubjectId,
  SyllabusTopic,
  UserRole,
} from '../types';
import { Material, library } from './materialLibrary';
import { isTimerBlock } from './focusSessionService';
import { entryFromTask } from './studyLedger';
import { tagOccurrenceToTopic, teachesTopics } from './checkInOccurrenceService';
import { tagAttachmentToTopic } from './attachmentService';
import { tagCheckInToTopic } from './topicService';

/**
 * A subject seen through its topics: what was taught, what was done about it,
 * and what was captured - one list per topic, in date order.
 *
 * The Library answered "what have we got for Chemistry" with photos and notes.
 * It could not answer "when was bonding taught, and what has he done on it
 * since", because the lessons themselves were never in it - only lessons that
 * happened to carry a note, which in September was none of them. A topic's
 * story is its lessons, the focus blocks spent on it, the work set on it and
 * the material captured about it, and those live in four tables.
 *
 * Derived on read, like the Library it sits inside. Every entry is a view of a
 * row something else owns; there is nothing here to keep in step.
 *
 * Material comes from `library()` rather than being re-read, so the two views
 * cannot disagree about what a photo is, what it is tagged to, or when it
 * arrived.
 */

export type TopicEntryKind = 'LESSON' | 'FOCUS' | 'WORK' | 'MATERIAL';

export interface TopicEntry {
  /** Stable across reads, for keys. */
  id: string;
  kind: TopicEntryKind;
  /** Local ISO date. */
  date: string;
  title: string;
  /** A note in full. Never truncated - see RecordView. */
  detail?: string;
  outcome?: OccurrenceOutcome;
  minutes?: number;
  completed?: boolean;
  /** Present on MATERIAL entries, so the row can open the thing itself. */
  material?: Material;
}

export interface TopicSummary {
  topic: SyllabusTopic;
  lessons: number;
  /** Focus blocks and check-ins tagged to the topic, plus time on its finished work. */
  studyMinutes: number;
  work: number;
  materials: number;
  /** Newest entry, so a topic that has gone quiet says so. */
  lastDate?: string;
  entries: TopicEntry[];
}

/** Something that could be tagged to a topic and has not been. */
export interface UntaggedItem {
  id: string;
  kind: 'LESSON' | 'FILE' | 'NOTE';
  date: string;
  title: string;
  detail?: string;
  /** What `tagUntagged` writes to. */
  target: { table: 'occurrence' | 'attachment' | 'checkIn'; id: string };
}

export interface SubjectTopics {
  subjectId: SubjectId;
  /** Goals on this subject, locked ones first. */
  goals: Goal[];
  topics: TopicSummary[];
  /** Every unit already in use, for the add-topic picker. */
  units: string[];
  /** Lessons that happened (not missed) and so covered something. */
  lessonsAnswered: number;
  lessonsTagged: number;
  untagged: UntaggedItem[];
}

/**
 * A missed lesson covered nothing, and PE covered no syllabus - neither is
 * counted as teaching or asked which topic it was.
 */
function coveredSomething(row: CheckInOccurrence): boolean {
  return teachesTopics(row) && row.outcome !== 'MISSED';
}

export async function subjectTopics(subjectId: SubjectId): Promise<SubjectTopics> {
  const [snapshot, occurrences, checkIns, tasks, goals] = await Promise.all([
    library(),
    db.checkInOccurrences.toArray(),
    db.checkIns.toArray(),
    db.tasks.toArray(),
    db.goals.toArray(),
  ]);

  const topics = snapshot.topics
    .filter((t) => t.subjectId === subjectId)
    .sort((a, b) => a.unit.localeCompare(b.unit) || a.title.localeCompare(b.title));
  const topicIds = new Set(topics.map((t) => t.id));
  const entries = new Map<string, TopicEntry[]>(topics.map((t) => [t.id, []]));
  const push = (topicId: string | undefined, entry: TopicEntry) => {
    if (topicId && topicIds.has(topicId)) entries.get(topicId)!.push(entry);
  };

  const lessons = occurrences.filter((o) => o.subjectId === subjectId && coveredSomething(o));
  for (const lesson of lessons) {
    push(lesson.topicId, {
      id: `lesson__${lesson.id}`,
      kind: 'LESSON',
      date: lesson.date,
      title: lesson.label,
      detail: lesson.notes,
      outcome: lesson.outcome,
    });
  }

  for (const checkIn of checkIns) {
    if (!checkIn.topicId) continue;
    const timer = isTimerBlock(checkIn);
    push(checkIn.topicId, {
      id: `checkin__${checkIn.id}`,
      kind: 'FOCUS',
      date: checkIn.date,
      title: timer ? 'Focus block' : 'Check-in',
      detail: checkIn.structuredNotes?.keyLearning,
      minutes: checkIn.completedRevisionMinutes || undefined,
    });
  }

  for (const task of tasks) {
    push(task.linkedTopicId, {
      id: `task__${task.id}`,
      kind: 'WORK',
      date: task.dueDate,
      title: task.title,
      completed: task.completed,
      // Counted by the ledger's rule, so the cut-over and the timer's own
      // minutes are respected here exactly as on the goal cards.
      minutes: entryFromTask(task)?.minutes,
    });
  }

  /**
   * Notes from lessons and check-ins are already entries of their own above,
   * with the note as their detail. Listing them again as material would show
   * every lesson note twice on the page for its topic.
   */
  const standalone = snapshot.materials.filter(
    (m) => !(m.kind === 'NOTE' && (m.owner.entity === 'Lesson' || m.owner.entity === 'Check-in'))
  );
  for (const material of standalone) {
    push(material.topicId, {
      id: `material__${material.id}`,
      kind: 'MATERIAL',
      date: material.capturedOn,
      title: material.title,
      detail: material.excerpt,
      material,
    });
  }

  const summaries: TopicSummary[] = topics.map((topic) => {
    const list = entries.get(topic.id)!.sort((a, b) => b.date.localeCompare(a.date));
    return {
      topic,
      lessons: list.filter((e) => e.kind === 'LESSON').length,
      studyMinutes: list
        .filter((e) => e.kind === 'FOCUS' || e.kind === 'WORK')
        .reduce((sum, e) => sum + (e.minutes ?? 0), 0),
      work: list.filter((e) => e.kind === 'WORK').length,
      materials: list.filter((e) => e.kind === 'MATERIAL').length,
      lastDate: list[0]?.date,
      entries: list,
    };
  });

  return {
    subjectId,
    goals: goals
      .filter((g) => g.subjectId === subjectId)
      .sort(
        (a, b) =>
          Number(b.status === 'APPROVED_LOCKED') - Number(a.status === 'APPROVED_LOCKED')
      ),
    topics: summaries,
    units: [...new Set(topics.map((t) => t.unit))].sort(),
    lessonsAnswered: lessons.length,
    lessonsTagged: lessons.filter((l) => l.topicId && topicIds.has(l.topicId)).length,
    untagged: untaggedFor(subjectId, lessons, checkIns, snapshot.materials, topicIds),
  };
}

/**
 * The inbox: everything on this subject that could say which topic it is about
 * and does not.
 *
 * Only things with somewhere to store a tag are listed. A link is a field on
 * the record that carries it, so there is nothing to write a topic onto - the
 * Library's detail panel says so, and offering a checkbox here that did nothing
 * would be worse.
 */
function untaggedFor(
  subjectId: SubjectId,
  lessons: CheckInOccurrence[],
  checkIns: DailyCheckIn[],
  materials: Material[],
  topicIds: Set<string>
): UntaggedItem[] {
  const isTagged = (id: string | undefined) => !!id && topicIds.has(id);
  const items: UntaggedItem[] = [];

  for (const lesson of lessons) {
    if (isTagged(lesson.topicId)) continue;
    items.push({
      id: `lesson__${lesson.id}`,
      kind: 'LESSON',
      date: lesson.date,
      title: lesson.label,
      detail: lesson.notes,
      target: { table: 'occurrence', id: lesson.id },
    });
  }

  for (const checkIn of checkIns) {
    const note = checkIn.structuredNotes?.keyLearning?.trim();
    if (!note || checkIn.studySubjectId !== subjectId || isTagged(checkIn.topicId)) continue;
    items.push({
      id: `checkin__${checkIn.id}`,
      kind: 'NOTE',
      date: checkIn.date,
      title: isTimerBlock(checkIn) ? 'Focus block' : 'What I took away',
      detail: note,
      target: { table: 'checkIn', id: checkIn.id },
    });
  }

  for (const material of materials) {
    const attachmentId = material.ref?.attachmentId;
    if (material.subjectId !== subjectId || !attachmentId || isTagged(material.topicId)) continue;
    if (material.kind !== 'FILE' && material.kind !== 'PAPER') continue;
    items.push({
      id: `file__${attachmentId}`,
      kind: 'FILE',
      date: material.capturedOn,
      title: material.title,
      detail: material.excerpt,
      target: { table: 'attachment', id: attachmentId },
    });
  }

  return items.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Tags several things to one topic at once.
 *
 * Sixty-four lessons arrived untagged from September. One at a time, through a
 * detail panel each, is an evening nobody is going to spend; ticking the six
 * Chemistry lessons that were all on bonding and choosing the topic once is a
 * minute. Each write still goes through its own tagger, so each one leaves its
 * own audit line.
 */
export async function tagUntagged(
  items: UntaggedItem[],
  topicId: string,
  user: UserRole = 'STUDENT'
): Promise<void> {
  for (const item of items) {
    if (item.target.table === 'occurrence') {
      await tagOccurrenceToTopic(item.target.id, topicId, user);
    } else if (item.target.table === 'attachment') {
      await tagAttachmentToTopic(item.target.id, topicId, user);
    } else {
      await tagCheckInToTopic(item.target.id, topicId, user);
    }
  }
}

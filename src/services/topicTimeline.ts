import { db } from '../db';
import {
  CheckInOccurrence,
  DailyCheckIn,
  Goal,
  OccurrenceOutcome,
  SubjectConfig,
  SubjectId,
  SyllabusTopic,
  Task,
  UserRole,
} from '../types';
import { Material, library } from './materialLibrary';
import { isTimerBlock } from './focusSessionService';
import { entryFromTask } from './studyLedger';
import { tagOccurrenceToTopic, teachesTopics } from './checkInOccurrenceService';
import { tagAttachmentToTopic } from './attachmentService';
import { tagCheckInToTopic, tagTaskToTopic } from './topicService';
import { Curriculum, Placement, SpecSection, curriculumFor, placeTopic } from './curriculum';
import { isTopicSecure } from './ragCalculator';
import { addDaysISO, parseISODate, toLocalISODate, todayISO } from '../utils/date';

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
  /** Local date a piece of work was closed, when it has been. */
  completedOn?: string;
  /** What a piece of work was for. Only on WORK entries. */
  workKind?: WorkKind;
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
  journey: TopicJourney;
  /** Where it sits in the board's outline, when that is known or can be guessed. */
  section?: SpecSection;
  placement?: Placement;
}

/**
 * What a piece of work on a topic was for.
 *
 * Homework is set by school, a fix-up comes from a lost mark, and everything
 * else Tejas did on a topic by choice is revision. The three answer different
 * questions - is he keeping up, is he closing gaps, is he going back over it -
 * so they are not added together anywhere a topic is summarised.
 */
export type WorkKind = 'HOMEWORK' | 'FIX_UP' | 'REVISION';

function workKindOf(task: Task): WorkKind {
  if (task.isRemediation) return 'FIX_UP';
  return task.isHomework ? 'HOMEWORK' : 'REVISION';
}

/**
 * One topic's progress in the same five steps every time: taught, homework,
 * revised, notes, secure.
 *
 * Asked for on 19 Oct 2026, after the topic list could say "3 lessons · 45 min
 * studied · 2 work" and still not answer "has he revised it since it was
 * taught?" or "are there notes to revise from?". The steps are fixed so any
 * two topics - or the same topic a month apart - can be read side by side.
 *
 * Built only from what is already recorded. Nothing here asks for a new field
 * to be filled in: a topic with nothing tagged to it shows its steps empty,
 * which is the truth, and tagging a lesson or a photo fills them in.
 */
export interface TopicJourney {
  /** The date it was taught: the one entered, or else its first lesson. */
  taught?: string;
  lessons: number;
  homework: { set: number; done: number; lastDone?: string };
  /** Focus blocks and check-ins on it, and revision work finished on it. */
  revision: { sessions: number; minutes: number; last?: string };
  /** Files, links and notes captured on it, and lesson answers with a note. */
  notes: { captured: number; lessonNotes: number };
  fixUps: { open: number; done: number };
  secure: boolean;
  confidence: SyllabusTopic['confidenceRating'];
  /**
   * The one thing most worth knowing next, stated as a fact rather than an
   * instruction - or nothing, when the topic is in hand.
   */
  gap?: string;
}

/** How long after teaching a topic can go unrevised before saying so. */
export const REVISE_WITHIN_DAYS = 14;

function journeyOf(topic: SyllabusTopic, list: TopicEntry[], today: string): TopicJourney {
  const lessons = list.filter((e) => e.kind === 'LESSON');
  const work = list.filter((e) => e.kind === 'WORK');
  const homework = work.filter((e) => e.workKind === 'HOMEWORK');
  const fixUps = work.filter((e) => e.workKind === 'FIX_UP');
  const revisions = [
    ...list.filter((e) => e.kind === 'FOCUS'),
    ...work.filter((e) => e.workKind === 'REVISION' && e.completed),
  ];
  const revisedOn = (e: TopicEntry) => e.completedOn ?? e.date;
  const latest = (dates: string[]) => [...dates].sort().at(-1);

  const firstLesson = lessons.map((e) => e.date).sort()[0];
  const taught = topic.dateTaught || firstLesson;
  const captured = list.filter((e) => e.kind === 'MATERIAL').length;
  const lessonNotes = lessons.filter((e) => e.detail?.trim()).length;
  const lastRevised = latest(revisions.map(revisedOn));
  const secure = isTopicSecure(topic);
  const openFixUps = fixUps.filter((e) => !e.completed).length;

  /**
   * One line at most, and only a fact. A list of everything missing on every
   * topic is the evidence nag over again - fifty-nine reminders nobody reads.
   * An open fix-up comes first because it is a mark already lost once.
   */
  let gap: string | undefined;
  if (openFixUps > 0) gap = `${openFixUps} fix-up${openFixUps === 1 ? '' : 's'} open`;
  else if (taught && !secure) {
    const stale = addDaysISO(-REVISE_WITHIN_DAYS, parseISODate(today));
    if (captured + lessonNotes === 0) gap = 'No notes captured yet';
    else if (!lastRevised && taught <= stale) gap = 'Not revised since it was taught';
  }

  return {
    taught,
    lessons: lessons.length,
    homework: {
      set: homework.length,
      done: homework.filter((e) => e.completed).length,
      lastDone: latest(homework.filter((e) => e.completed).map(revisedOn)),
    },
    revision: {
      sessions: revisions.length,
      minutes: revisions.reduce((sum, e) => sum + (e.minutes ?? 0), 0),
      last: lastRevised,
    },
    notes: { captured, lessonNotes },
    fixUps: { open: openFixUps, done: fixUps.length - openFixUps },
    secure,
    confidence: topic.confidenceRating,
    gap,
  };
}

/** One section of the board's outline, and how far into it the topics have gone. */
export interface SectionCoverage {
  section: SpecSection;
  topics: number;
  taught: number;
  secure: number;
  /** Earliest teaching date in it, so the outline reads in the order it was met. */
  firstTaught?: string;
}

export function sectionCoverage(outline: Curriculum, rows: TopicSummary[]): SectionCoverage[] {
  return outline.sections.map((section) => {
    const inIt = rows.filter((r) => r.section?.ref === section.ref);
    return {
      section,
      topics: inIt.length,
      taught: inIt.filter((r) => r.journey.taught).length,
      secure: inIt.filter((r) => r.journey.secure).length,
      firstTaught: inIt
        .map((r) => r.journey.taught)
        .filter((d): d is string => !!d)
        .sort()[0],
    };
  });
}

/** Something that could be tagged to a topic and has not been. */
export interface UntaggedItem {
  id: string;
  kind: 'LESSON' | 'FILE' | 'NOTE' | 'WORK';
  date: string;
  title: string;
  detail?: string;
  /** What `tagUntagged` writes to. */
  target: { table: 'occurrence' | 'attachment' | 'checkIn' | 'task'; id: string };
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
  /** The board's outline, when there is one for this subject and board. */
  outline?: Curriculum;
  coverage: SectionCoverage[];
}

/**
 * A missed lesson covered nothing, and PE covered no syllabus - neither is
 * counted as teaching or asked which topic it was.
 */
function coveredSomething(row: CheckInOccurrence): boolean {
  return teachesTopics(row) && row.outcome !== 'MISSED';
}

/**
 * Every topic's entries and journey, from rows read once.
 *
 * Shared by one subject's page and the log across all subjects, so the two can
 * never count a topic differently - which they would, the first time either was
 * tuned, if each had its own loop.
 */
function buildSummaries(
  topics: SyllabusTopic[],
  materials: Material[],
  occurrences: CheckInOccurrence[],
  checkIns: DailyCheckIn[],
  tasks: Task[],
  subjects: SubjectConfig[],
  today: string
): TopicSummary[] {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const entries = new Map<string, TopicEntry[]>(topics.map((t) => [t.id, []]));
  const push = (topicId: string | undefined, entry: TopicEntry, subjectId?: SubjectId) => {
    const topic = topicId ? byId.get(topicId) : undefined;
    if (!topic) return;
    // A lesson counts towards a topic of its own subject only, as it always has.
    if (subjectId && topic.subjectId !== subjectId) return;
    entries.get(topic.id)!.push(entry);
  };

  for (const lesson of occurrences.filter(coveredSomething)) {
    push(
      lesson.topicId,
      {
        id: `lesson__${lesson.id}`,
        kind: 'LESSON',
        date: lesson.date,
        title: lesson.label,
        detail: lesson.notes,
        outcome: lesson.outcome,
      },
      lesson.subjectId
    );
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
      completedOn:
        task.completed && task.completedAt ? toLocalISODate(new Date(task.completedAt)) : undefined,
      workKind: workKindOf(task),
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
  const standalone = materials.filter(
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

  const outlines = new Map(subjects.map((s) => [s.id as string, curriculumFor(s)]));

  return topics.map((topic) => {
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
      journey: journeyOf(topic, list, today),
      ...placeTopic(topic, outlines.get(topic.subjectId)),
    };
  });
}

export async function subjectTopics(subjectId: SubjectId): Promise<SubjectTopics> {
  const [snapshot, occurrences, checkIns, tasks, goals, subjects] = await Promise.all([
    library(),
    db.checkInOccurrences.toArray(),
    db.checkIns.toArray(),
    db.tasks.toArray(),
    db.goals.toArray(),
    db.subjects.toArray(),
  ]);

  const topics = snapshot.topics
    .filter((t) => t.subjectId === subjectId)
    .sort((a, b) => a.unit.localeCompare(b.unit) || a.title.localeCompare(b.title));
  const topicIds = new Set(topics.map((t) => t.id));
  const lessons = occurrences.filter((o) => o.subjectId === subjectId && coveredSomething(o));
  const summaries = buildSummaries(
    topics,
    snapshot.materials,
    lessons,
    checkIns,
    tasks,
    subjects,
    todayISO()
  );
  const subject = subjects.find((s) => s.id === subjectId);
  const outline = curriculumFor(subject);

  return {
    subjectId,
    goals: goals
      .filter((g) => g.subjectId === subjectId)
      .sort(
        (a, b) => Number(b.status === 'APPROVED_LOCKED') - Number(a.status === 'APPROVED_LOCKED')
      ),
    topics: summaries,
    units: [...new Set(topics.map((t) => t.unit))].sort(),
    lessonsAnswered: lessons.length,
    lessonsTagged: lessons.filter((l) => l.topicId && topicIds.has(l.topicId)).length,
    untagged: untaggedFor(subjectId, lessons, checkIns, tasks, snapshot.materials, topicIds),
    outline,
    coverage: outline ? sectionCoverage(outline, summaries) : [],
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
  tasks: Task[],
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

  /**
   * Work was never here, and nothing else can give it a topic after the fact -
   * so a topic's work count stayed at nothing however much was done on it.
   */
  for (const task of tasks) {
    if (task.subjectId !== subjectId || isTagged(task.linkedTopicId)) continue;
    items.push({
      id: `task__${task.id}`,
      kind: 'WORK',
      date: task.dueDate,
      title: task.title,
      detail: task.whatWentWrong ?? task.description,
      target: { table: 'task', id: task.id },
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
    } else if (item.target.table === 'task') {
      await tagTaskToTopic(item.target.id, topicId, user);
    } else {
      await tagCheckInToTopic(item.target.id, topicId, user);
    }
  }
}

/** One subject in the log: its outline, and every topic in teaching order. */
export interface SubjectLog {
  subject: SubjectConfig;
  outline?: Curriculum;
  coverage: SectionCoverage[];
  /** Newest taught first; topics with no teaching date last. */
  topics: TopicSummary[];
}

/**
 * Every topic in every subject, for the log.
 *
 * The same summaries a subject's page builds, so a topic reads identically in
 * both. Lessons are filtered to their own subject inside the builder, which is
 * the rule the subject page has always applied.
 */
export async function topicLog(): Promise<SubjectLog[]> {
  const [snapshot, occurrences, checkIns, tasks, subjects] = await Promise.all([
    library(),
    db.checkInOccurrences.toArray(),
    db.checkIns.toArray(),
    db.tasks.toArray(),
    db.subjects.toArray(),
  ]);
  const summaries = buildSummaries(
    snapshot.topics,
    snapshot.materials,
    occurrences,
    checkIns,
    tasks,
    subjects,
    todayISO()
  );

  const newestFirst = (a: TopicSummary, b: TopicSummary) =>
    (b.journey.taught ?? '').localeCompare(a.journey.taught ?? '') ||
    a.topic.title.localeCompare(b.topic.title);

  return [...subjects]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((subject) => {
      const outline = curriculumFor(subject);
      const rows = summaries.filter((r) => r.topic.subjectId === subject.id).sort(newestFirst);
      return {
        subject,
        outline,
        coverage: outline ? sectionCoverage(outline, rows) : [],
        topics: rows,
      };
    })
    .filter((log) => log.topics.length > 0 || !!log.outline);
}

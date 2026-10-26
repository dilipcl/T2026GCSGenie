import { db } from '../db';
import { SubjectId, Task, WeekPlanBaseline } from '../types';
import { amendmentsFor, loadBaseline } from './planBaselineService';
import { taskHours } from './planService';
import { TimeAccount, accountForTime } from './progressReport';
import { studyEntries } from './studyLedger';
import { weekExecution } from './weekExecution';
import { WeekWindow, weekContaining } from './weekWindow';
import { SOURCE_LABEL, XpSource, xpStatement } from './xpLedgerService';
import { toLocalISODate } from '../utils/date';

/**
 * One week opened up: what was promised, what happened, and how the app was
 * used to record it.
 *
 * The week strip on Progress gave each week one line, and the questions a
 * Sunday review actually asks sat behind it with nowhere to go: which pieces of
 * the plan got done, which slipped, what was finished that nobody planned, and
 * whether the week was recorded at all. The 18 Oct 2026 report answered them
 * from an export, a card a week, and that card was the part read most closely.
 * This is that card, from the live rows.
 *
 * Nothing here is a new rule. The promise is the baseline's `taskIds`, delivery
 * and the lesson-answer rate are `weekExecution`'s, time is `studyLedger`'s and
 * its attribution `accountForTime`'s, points are `xpStatement`'s lines. The
 * tests hold the delivered count here to `weekExecution`'s, so this card and the
 * week bonus cannot describe the same week differently.
 */

/**
 * Where a week's plan stood.
 *
 * "Sent, never agreed" is kept apart from "no plan": the week of 5 Oct 2026 was
 * sent back with questions and never re-sent, and calling that "no plan" would
 * erase the work of making one and the reason it stalled.
 */
export type WeekPlanState = 'AGREED' | 'NOT_AGREED' | 'NONE';

/**
 * What became of one planned piece.
 *
 * "Done later" is separate because the week bonus counts it as delivered - the
 * promise was kept, just late - and a reader comparing this card with the XP
 * statement needs to see why a piece finished on Tuesday of the next week still
 * counts for this one.
 */
export type WorkOutcome = 'DONE_IN_WEEK' | 'DONE_LATER' | 'NOT_DONE';

export interface WeekWorkItem {
  id: string;
  title: string;
  subjectId: SubjectId;
  outcome: WorkOutcome;
  /** Local date it was closed, when it was. */
  doneOn?: string;
  isFixUp: boolean;
  /**
   * Its size, by the reckoning the plan's load bar used when the week was
   * agreed - so a burn-down drawn from these items starts from the same number
   * the family looked at when they said yes.
   */
  hours: number;
  /** For a piece brought in by an amendment: the local date it came in. */
  addedOn?: string;
}

export interface SubjectTime {
  subjectId?: SubjectId;
  minutes: number;
}

export interface WeekPoints {
  /** Everything earned, newest source first by size. */
  earned: number;
  bySource: { source: XpSource; label: string; amount: number }[];
  /** Spent on rewards or taken by a sanction. Never negative here; shown as spent. */
  spent: number;
}

export interface WeekUsage {
  checkIns: number;
  daysCheckedIn: number;
  lessonsAnswered: number;
  lessonsExpected: number;
  /** Lesson answers with something written about what was taught. */
  lessonNotes: number;
  topicsAdded: { id: string; title: string; subjectId: SubjectId }[];
  filesAttached: number;
  filesCaptioned: number;
  marksLogged: number;
}

export interface WeekDetail {
  week: WeekWindow;
  plan: WeekPlanState;
  /** Hours promised when the plan was sent. */
  plannedHours?: number;
  /** What a parent wrote when sending it back, reviewing it or writing it off. */
  notes: { label: string; text: string }[];
  /** The plan as sent. Empty when there was none. */
  committed: WeekWorkItem[];
  /** Brought in after approval, through an amendment. */
  added: WeekWorkItem[];
  /** Planned pieces since deleted, so the counts still add up. */
  committedGone: number;
  /** Finished inside the week and on neither list. */
  extra: WeekWorkItem[];
  /** Same as `weekExecution.delivered`: done at any time. */
  delivered: number;
  time: TimeAccount;
  timeBySubject: SubjectTime[];
  usage: WeekUsage;
  points: WeekPoints;
}

const dateOf = (epochMs: number) => toLocalISODate(new Date(epochMs));

function planState(baseline?: WeekPlanBaseline): WeekPlanState {
  if (!baseline) return 'NONE';
  if (baseline.status === 'BASELINED') return 'AGREED';
  // A row with nothing in it was written to hold a decision - a write-off, a
  // review - not because a plan was made.
  return baseline.taskIds.length > 0 ? 'NOT_AGREED' : 'NONE';
}

function notesFrom(baseline?: WeekPlanBaseline): { label: string; text: string }[] {
  if (!baseline) return [];
  const notes: { label: string; text: string }[] = [];
  if (baseline.returnedNote) notes.push({ label: 'Sent back', text: baseline.returnedNote });
  if (baseline.reviewedNote) notes.push({ label: 'Review', text: baseline.reviewedNote });
  if (baseline.writtenOffNote) notes.push({ label: 'Written off', text: baseline.writtenOffNote });
  return notes;
}

function itemFrom(task: Task, week: WeekWindow): WeekWorkItem {
  const doneOn = task.completed && task.completedAt ? dateOf(task.completedAt) : undefined;
  const outcome: WorkOutcome = !task.completed
    ? 'NOT_DONE'
    : doneOn && doneOn > week.end
      ? 'DONE_LATER'
      : 'DONE_IN_WEEK';
  return {
    id: task.id,
    title: task.title,
    subjectId: task.subjectId,
    outcome,
    doneOn,
    isFixUp: !!task.isRemediation,
    hours: taskHours(task),
  };
}

const OUTCOME_ORDER: Record<WorkOutcome, number> = { NOT_DONE: 0, DONE_LATER: 1, DONE_IN_WEEK: 2 };
/** What slipped first: that is what a review is for. */
const byOutcome = (a: WeekWorkItem, b: WeekWorkItem) =>
  OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome] || a.title.localeCompare(b.title);

export async function readWeekDetail(weekStart: string): Promise<WeekDetail> {
  const week = weekContaining(weekStart);
  const inWeek = (date?: string) => !!date && date >= week.start && date <= week.end;

  const [
    baseline,
    amendments,
    execution,
    tasks,
    entries,
    goals,
    subjects,
    checkIns,
    occurrences,
    topics,
    proofs,
    assessments,
    xp,
  ] = await Promise.all([
    loadBaseline(week.start),
    amendmentsFor(week.start),
    weekExecution(week.start),
    db.tasks.toArray(),
    studyEntries({ start: week.start, end: week.end }),
    db.goals.toArray(),
    db.subjects.toArray(),
    db.checkIns.where('date').between(week.start, week.end, true, true).toArray(),
    db.checkInOccurrences.where('date').between(week.start, week.end, true, true).toArray(),
    db.syllabusTopics.toArray(),
    db.attachments.toArray(),
    db.assessments.where('date').between(week.start, week.end, true, true).toArray(),
    xpStatement(),
  ]);

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const plan = planState(baseline);
  const committedIds = plan === 'NONE' ? [] : (baseline?.taskIds ?? []);
  const committedSet = new Set(committedIds);
  const committed = committedIds
    .map((id) => byId.get(id))
    .filter((t): t is Task => !!t)
    .map((t) => itemFrom(t, week))
    .sort(byOutcome);

  const addedIds = [
    ...new Set(amendments.map((a) => a.addedTaskId).filter((id) => !committedSet.has(id))),
  ];
  const added = addedIds
    .map((id) => byId.get(id))
    .filter((t): t is Task => !!t)
    .map((t) => itemFrom(t, week))
    .sort(byOutcome);
  /**
   * The first amendment that brought a piece in dates it. A piece added,
   * displaced and added again came in once as far as the week is concerned.
   */
  const firstAdded = new Map<string, string>();
  for (const a of [...amendments].sort((x, y) => x.at - y.at)) {
    if (!firstAdded.has(a.addedTaskId)) firstAdded.set(a.addedTaskId, dateOf(a.at));
  }
  for (const item of added) item.addedOn = firstAdded.get(item.id);
  const onAList = new Set([...committedIds, ...addedIds]);

  const extra = tasks
    .filter((t) => t.completed && t.completedAt && inWeek(dateOf(t.completedAt)))
    .filter((t) => !onAList.has(t.id))
    .map((t) => itemFrom(t, week))
    .sort((a, b) => a.title.localeCompare(b.title));

  /* Time ------------------------------------------------------------------ */
  const time = accountForTime(entries, goals, subjects);
  const minutesBySubject = new Map<string, number>();
  for (const e of entries) {
    const key = e.subjectId ?? '';
    minutesBySubject.set(key, (minutesBySubject.get(key) ?? 0) + e.minutes);
  }
  const timeBySubject = [...minutesBySubject.entries()]
    .map(([subjectId, minutes]) => ({
      subjectId: (subjectId || undefined) as SubjectId | undefined,
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  /* Using the app --------------------------------------------------------- */
  const weekProofs = proofs.filter((p) => inWeek(dateOf(p.createdAt)));
  const usage: WeekUsage = {
    checkIns: checkIns.length,
    daysCheckedIn: new Set(checkIns.map((c) => c.date)).size,
    lessonsAnswered: execution.occurrencesAnswered,
    lessonsExpected: execution.occurrencesExpected,
    lessonNotes: occurrences.filter((o) => o.kind === 'LESSON' && o.notes?.trim()).length,
    topicsAdded: topics
      .filter((t) => inWeek(t.dateTaught))
      .map((t) => ({ id: t.id, title: t.title, subjectId: t.subjectId })),
    filesAttached: weekProofs.length,
    filesCaptioned: weekProofs.filter((p) => p.caption?.trim()).length,
    marksLogged: assessments.length,
  };

  /* Points ---------------------------------------------------------------- */
  const weekLines = xp.filter((line) => {
    if (line.source === 'RESERVED') return false;
    const on = line.on ?? (line.at ? dateOf(line.at) : undefined);
    return inWeek(on);
  });
  const earnedBySource = new Map<XpSource, number>();
  let spent = 0;
  for (const line of weekLines) {
    if (line.amount > 0)
      earnedBySource.set(line.source, (earnedBySource.get(line.source) ?? 0) + line.amount);
    else spent -= line.amount;
  }
  const bySource = [...earnedBySource.entries()]
    .map(([source, amount]) => ({ source, label: SOURCE_LABEL[source], amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    week,
    plan,
    plannedHours: plan === 'NONE' ? undefined : baseline?.hours,
    notes: notesFrom(baseline),
    committed,
    added,
    committedGone: committedIds.length - committed.length,
    extra,
    delivered: execution.delivered,
    time,
    timeBySubject,
    usage,
    points: {
      earned: bySource.reduce((sum, s) => sum + s.amount, 0),
      bySource,
      spent,
    },
  };
}

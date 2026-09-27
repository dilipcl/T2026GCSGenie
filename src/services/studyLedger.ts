import { db } from '../db';
import { DailyCheckIn, Goal, SubjectId, Task } from '../types';
import { isTimerBlock } from './focusSessionService';
import { toLocalISODate } from '../utils/date';

/**
 * Every minute of study the app counts, from wherever it was recorded.
 *
 * Until this existed, study time meant check-in minutes and nothing else. The
 * week of 21 September showed what that cost: thirteen pieces of homework
 * finished, about nine hours by his own estimates, and the app reported 3.3h
 * of 21.5h - "7 of 9 goals behind" - because finished work counted towards no
 * goal, and each check-in's minutes went to one subject however many subjects
 * the evening had covered. A good week read as a failing one, which is the
 * argument this app exists to prevent.
 *
 * Three sources now, and seven screens that used to add up check-in minutes
 * each in their own way read them from here instead:
 *
 *  - a check-in's minutes, against the subject or goal it names;
 *  - a focus block's minutes, the same way - it is a check-in row;
 *  - a finished piece of work's `loggedMinutes`, against its subject and goal.
 *
 * `loggedMinutes` is time on the work that no focus block recorded, confirmed
 * when the work was closed. A block run on the work has already counted its
 * own minutes, so the two never overlap.
 *
 * Work time counts only for work *closed* from `WORK_TIME_FROM`, the day this
 * shipped. Before that, the evening's check-in minutes were the only place
 * homework time could go - Monday 21 September's "75 minutes, Maths" *was* the
 * Sparx, the quadratics and the History flashcards - so counting old work too
 * would pay the same hour twice. The cut is on when the work was closed, not on
 * the day it is dated to: a catch-up check-in written tonight about Friday
 * records Friday's work time through the new screens, where nothing else has
 * counted it. The old weeks keep the numbers they had.
 *
 * Derived on read, like everything else that counts: there is no ledger table.
 */

/** The day the work-time rule shipped. Work closed before it counts nothing. */
export const WORK_TIME_FROM = '2026-09-27';

export type StudySource = 'CHECK_IN' | 'TIMER' | 'WORK';

export interface StudyEntry {
  /** The row it came from, for tracing a number back. */
  id: string;
  source: StudySource;
  /** Local ISO date the time was spent. */
  date: string;
  minutes: number;
  subjectId?: SubjectId;
  /** Set when the time was spent against one specific goal. */
  goalId?: string;
}

export function entryFromCheckIn(checkIn: DailyCheckIn): StudyEntry | undefined {
  const minutes = checkIn.completedRevisionMinutes || 0;
  if (minutes <= 0) return undefined;
  return {
    id: checkIn.id,
    source: isTimerBlock(checkIn) ? 'TIMER' : 'CHECK_IN',
    date: checkIn.date,
    minutes,
    subjectId: checkIn.studySubjectId,
    goalId: checkIn.studyGoalId,
  };
}

/**
 * A finished piece of work as study time, dated the day the time was spent -
 * the day a catch-up check-in describes, or else the day it was closed.
 * Reopened work is not finished, so its time stops counting until it is
 * closed again.
 */
export function entryFromTask(task: Task): StudyEntry | undefined {
  const minutes = task.loggedMinutes || 0;
  if (!task.completed || !task.completedAt || minutes <= 0) return undefined;
  const closedOn = toLocalISODate(new Date(task.completedAt));
  if (closedOn < WORK_TIME_FROM) return undefined;
  return {
    id: task.id,
    source: 'WORK',
    date: task.workedOn ?? closedOn,
    minutes,
    subjectId: task.subjectId,
    goalId: task.linkedGoalId,
  };
}

/** The pure half, so tests and callers holding rows already need no second read. */
export function studyEntriesFrom(checkIns: DailyCheckIn[], tasks: Task[]): StudyEntry[] {
  const entries: StudyEntry[] = [];
  for (const checkIn of checkIns) {
    const entry = entryFromCheckIn(checkIn);
    if (entry) entries.push(entry);
  }
  for (const task of tasks) {
    const entry = entryFromTask(task);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Every study entry, optionally only those dated inside a range (inclusive). */
export async function studyEntries(range?: { start: string; end: string }): Promise<StudyEntry[]> {
  const [checkIns, tasks] = await Promise.all([
    range
      ? db.checkIns.where('date').between(range.start, range.end, true, true).toArray()
      : db.checkIns.toArray(),
    // Tasks are dated by completion, which is not indexed; filtered below.
    db.tasks.toArray(),
  ]);
  const entries = studyEntriesFrom(checkIns, tasks);
  return range ? entries.filter((e) => e.date >= range.start && e.date <= range.end) : entries;
}

export function totalMinutes(entries: StudyEntry[]): number {
  return entries.reduce((sum, e) => sum + e.minutes, 0);
}

/**
 * Minutes on one entry that belong to one goal.
 *
 * The single definition of attribution in the app - moved here from
 * `goalProgress` when finished work became a second kind of entry, so a weekly
 * card and the long-range burndown cannot disagree about the same hours.
 *
 * Goal-level tagging wins outright. Subject-level only counts when the entry
 * names no goal at all - otherwise an hour tagged to the Maths goal would also
 * be credited to every other Maths goal, and a portfolio total would report
 * more hours than the day contained.
 */
export function minutesForGoal(entry: StudyEntry, goal: Goal): number {
  if (entry.minutes <= 0) return 0;
  if (entry.goalId === goal.id) return entry.minutes;
  if (goal.subjectId && entry.subjectId === goal.subjectId && !entry.goalId) return entry.minutes;
  return 0;
}

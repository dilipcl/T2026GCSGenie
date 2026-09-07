import { db } from '../db';
import { DayOfWeek, SubjectId, TimetableEntry, WeekType } from '../types';
import { dayOfWeekFor, occasionsOn } from './commitmentService';
import { todayISO } from '../utils/date';
import { inferBucket } from './planService';

/**
 * What a single day actually consists of, as things that either happened or did
 * not, each tied to its own date.
 *
 * The check-in used to ask one question per week: "did these happen?", against
 * a list of activities carrying a count. Air Cadets is Tuesday and Friday, so
 * the honest answer was "one of them" - and the app had nowhere to put which.
 * A plan that cannot say which Tuesday was missed cannot tell anybody why the
 * week went the way it did, and a count is not evidence of anything.
 *
 * So the unit becomes the occurrence: this lesson, on this date; this parade
 * night, on this date. Every occurrence carries a key built from what it is
 * rather than a generated id, so the same day answered twice on two devices
 * produces one row - the `${commitmentId}__${date}` idiom that
 * `CommitmentException` and `ChoreCompletion` already use for exactly this
 * reason.
 */

export type OccurrenceKind = 'LESSON' | 'COMMITMENT' | 'STUDY' | 'WORK';

export interface DayOccurrence {
  /**
   * Stable and derived, never generated. Two devices logging the same lesson
   * offline must land on one row rather than two, and the same lesson must
   * still be recognisable after a reload.
   */
  key: string;
  kind: OccurrenceKind;
  label: string;
  /** Where it sits in the day, for ordering and for showing a time on screen. */
  startTime?: string;
  endTime?: string;
  subjectId?: SubjectId;
  /** Set on COMMITMENT rows, so an absence can be logged against the real thing. */
  commitmentId?: string;
  /** Set on WORK rows, so ticking one through can complete the task. */
  taskId?: string;
  /** What this occurrence is worth if it is answered. */
  xp: number;
}

export interface DayShape {
  date: string;
  dayOfWeek: DayOfWeek;
  weekType: WeekType;
  /** Whether school runs on this date at all, for wording and for the empty case. */
  isSchoolDay: boolean;
  occurrences: DayOccurrence[];
}

/**
 * XP per answered occurrence.
 *
 * Small on purpose. The reward for checking in is meant to come from finishing
 * the day's list, not from any single row - a per-row value large enough to be
 * worth farming turns the check-in into a form to be gamed rather than a record
 * of what happened.
 */
export const XP_PER_OCCURRENCE = 2;

/** Answering every occurrence on the day. This is the number worth chasing. */
export const XP_FULL_DAY_BONUS = 15;

/**
 * Logged on the day itself rather than backfilled later.
 *
 * Deliberately a bonus for promptness and never a penalty for lateness. A
 * check-in written three days after the fact is still the truth about that day,
 * and the plan still needs it - charging for it would buy tidier timestamps at
 * the cost of the record itself.
 */
export const XP_PROMPT_BONUS = 5;

const SUBJECT_LESSON_XP = XP_PER_OCCURRENCE;

/** Whether a timetable row belongs to the given day and week type. */
function fallsOn(entry: TimetableEntry, day: DayOfWeek, weekType: WeekType): boolean {
  return entry.dayOfWeek === day && (entry.weekType === 'BOTH' || entry.weekType === weekType);
}

/**
 * Everything the day is made of, in the order it happens.
 *
 * Lessons and commitments come from the timetable, so the list is the same one
 * Tejas is looking at on the schedule card. Committed work is included because
 * a plan that promised three pieces of work on Wednesday should ask about them
 * on Wednesday - that is the whole point of finalising a week.
 */
export async function dayShape(
  date: string = todayISO(),
  weekType: WeekType = 'ODD'
): Promise<DayShape> {
  const day = dayOfWeekFor(date);

  const [entries, occasions, tasks] = await Promise.all([
    db.timetableEntries.toArray(),
    occasionsOn(date, weekType),
    db.tasks.where('dueDate').equals(date).toArray(),
  ]);

  const todays = entries.filter((entry) => fallsOn(entry, day, weekType));

  /**
   * A commitment's own timetable rows are already listed as commitment
   * occasions, which carry the absence machinery. Listing them again as lessons
   * would ask about the same parade twice.
   */
  const claimed = new Set(
    occasions.map((occasion) => occasion.entry?.id).filter((id): id is string => !!id)
  );

  const occurrences: DayOccurrence[] = [];

  for (const entry of todays) {
    if (claimed.has(entry.id)) continue;
    occurrences.push({
      key: `lesson__${entry.id}`,
      kind: 'LESSON',
      label: entry.activityName || entry.slotName,
      startTime: entry.startTime,
      endTime: entry.endTime,
      subjectId: entry.subjectId,
      xp: SUBJECT_LESSON_XP,
    });
  }

  for (const occasion of occasions) {
    occurrences.push({
      key: `commitment__${occasion.commitment.id}`,
      kind: 'COMMITMENT',
      label: occasion.title,
      startTime: occasion.entry?.startTime,
      endTime: occasion.entry?.endTime,
      commitmentId: occasion.commitment.id,
      xp: XP_PER_OCCURRENCE,
    });
  }

  /**
   * Only work that was actually committed to this week. Backlog due-dates are
   * intentions rather than promises, and asking about them every evening is how
   * a check-in turns into a chore nobody completes.
   */
  for (const task of tasks) {
    if (task.completed) continue;
    // Through `inferBucket`, not the raw field: work planned for "next week"
    // reads as committed once that week arrives, and a day plan that missed it
    // would leave the board and the day disagreeing about the same task.
    if (inferBucket(task) !== 'THIS_WEEK') continue;
    occurrences.push({
      key: `work__${task.id}`,
      kind: 'WORK',
      label: task.title,
      subjectId: task.subjectId,
      taskId: task.id,
      xp: XP_PER_OCCURRENCE,
    });
  }

  // Timed things first and in clock order, then the untimed work, so the list
  // reads like the day did rather than like the tables it came from.
  occurrences.sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
    if (a.startTime) return -1;
    if (b.startTime) return 1;
    return a.label.localeCompare(b.label);
  });

  return {
    date,
    dayOfWeek: day,
    weekType,
    isSchoolDay: day !== 'SAT' && day !== 'SUN',
    occurrences,
  };
}

/**
 * The most XP a day could pay if every occurrence were answered on the day.
 *
 * Shown next to what has actually been earned, because "you have 12 of a
 * possible 31 today" is a reason to open the check-in and "+2 XP" is not.
 */
export function dayXpCeiling(shape: DayShape): number {
  if (shape.occurrences.length === 0) return 0;
  const perRow = shape.occurrences.reduce((sum, occurrence) => sum + occurrence.xp, 0);
  return perRow + XP_FULL_DAY_BONUS + XP_PROMPT_BONUS;
}

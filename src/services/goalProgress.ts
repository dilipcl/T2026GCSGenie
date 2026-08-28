import { db } from '../db';
import { Goal } from '../types';
import { currentWeek, WeekWindow } from './weekWindow';

/**
 * Whether a locked goal is getting the time it reserved.
 *
 * A locked goal already had two things tracked: its status, and its weekly
 * hours inside the burnout capacity model. What it never had was an *actual*.
 * "3.5 hrs/week" was a budget the app reserved and then never checked, so a
 * goal could sit locked for a month with nothing logged against it and every
 * screen would still read green.
 *
 * The measure itself - smartMeasurable, "14-day homework streak + 90% on
 * quizzes" - is still free text and deliberately stays that way. Parsing an
 * English sentence into a tracker is a different and much worse product than
 * asking a person to say what the number should be.
 */

/**
 * How a goal is tracking against its weekly budget.
 *
 * - `AHEAD`    - at or past the share of the budget due by the end of today.
 * - `BEHIND`   - short of that share, from Wednesday onwards.
 * - `STALLED`  - nothing at all logged, and the week is nearly gone.
 *
 * Three tiers rather than two because "behind by twenty minutes on Wednesday"
 * and "not started by Friday" are different situations that deserve different
 * volumes. A single amber for both trains people to ignore amber.
 */
export type GoalPace = 'AHEAD' | 'BEHIND' | 'STALLED';

export interface GoalWeekProgress {
  goal: Goal;
  /** Hours actually logged against this goal's subject this week, to 1dp. */
  actualHours: number;
  /** The goal's full weekly budget. */
  targetHours: number;
  /**
   * The share of the budget that should be done by the end of today.
   *
   * Without this a goal is "behind" at one minute past midnight on Monday,
   * which is both true and useless. A week is seven days; by Wednesday evening
   * three sevenths of the time is fairly expected.
   */
  proRatedTargetHours: number;
  /** 0-100, actual against the full week. Capped for rendering. */
  percentOfWeek: number;
  /** 0-100, where the pro-rata marker sits on that same bar. */
  proRatedPercent: number;
  pace: GoalPace;
  /**
   * Behind the pro-rated pace, and late enough in the week for that to mean
   * something. Never true before Wednesday.
   */
  needsAction: boolean;
  /** No subject on the goal, so logged time can never be attributed to it. */
  isUnattributable: boolean;
  /** The week these figures describe. */
  week: WeekWindow;
}

/** Nothing is called "behind" before this weekday - Wed = 3. */
const EARLIEST_NUDGE_WEEKDAY = 3;

/** Nothing is called "stalled" before this weekday - Fri = 5. */
const EARLIEST_STALL_WEEKDAY = 5;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Check-ins inside a Monday-to-Sunday week.
 *
 * The upper bound is new and matters: this used to filter with
 * `.aboveOrEqual(weekStart)` alone, so a check-in dated into next week - a
 * phone whose clock had run ahead, or a restored backup - counted towards this
 * week's budget and kept counting.
 */
async function checkInsInWeek(window: WeekWindow) {
  return db.checkIns.where('date').between(window.start, window.end, true, true).toArray();
}

/**
 * Minutes logged per subject during a week.
 *
 * Reads check-ins rather than a separate log table: the focus timer and the
 * daily check-in both already write their minutes there, so attribution is one
 * new field on a row that exists rather than a second source of truth that can
 * disagree with the first.
 */
export async function weeklyMinutesBySubject(
  window: WeekWindow = currentWeek()
): Promise<Record<string, number>> {
  const checkIns = await checkInsInWeek(window);

  const totals: Record<string, number> = {};
  for (const entry of checkIns) {
    const minutes = entry.completedRevisionMinutes || 0;
    if (minutes <= 0 || !entry.studySubjectId) continue;
    totals[entry.studySubjectId] = (totals[entry.studySubjectId] || 0) + minutes;
  }
  return totals;
}

/**
 * Minutes logged against one goal during a week.
 *
 * Time attributed to the goal directly wins; otherwise time on the goal's
 * subject counts towards it. Two locked goals sharing a subject would each be
 * credited the same subject minutes, which is generous rather than wrong - the
 * alternative is asking a fourteen year old to split a revision session across
 * goals, and a number nobody enters is worse than one that is slightly kind.
 *
 * It does mean per-goal hours must never be presented as summing to a weekly
 * total; the capacity gauge is the only total.
 */
export async function weeklyMinutesForGoal(
  goal: Goal,
  window: WeekWindow = currentWeek()
): Promise<number> {
  const checkIns = await checkInsInWeek(window);

  let minutes = 0;
  for (const entry of checkIns) {
    const logged = entry.completedRevisionMinutes || 0;
    if (logged <= 0) continue;

    if (entry.studyGoalId === goal.id) minutes += logged;
    else if (goal.subjectId && entry.studySubjectId === goal.subjectId && !entry.studyGoalId)
      minutes += logged;
  }
  return minutes;
}

/** Turns hours against a budget into a pace, given how far into the week it is. */
export function paceFor(
  actualHours: number,
  proRatedTargetHours: number,
  weekday: number
): GoalPace {
  if (actualHours <= 0 && weekday >= EARLIEST_STALL_WEEKDAY) return 'STALLED';
  if (weekday >= EARLIEST_NUDGE_WEEKDAY && actualHours < proRatedTargetHours) return 'BEHIND';
  return 'AHEAD';
}

export async function goalWeekProgress(
  goal: Goal,
  window: WeekWindow = currentWeek()
): Promise<GoalWeekProgress> {
  const minutes = await weeklyMinutesForGoal(goal, window);
  const actualHours = round1(minutes / 60);
  const targetHours = goal.weeklyHoursRequired || 0;

  const proRatedTargetHours = round1((targetHours * window.weekday) / 7);
  const isUnattributable = !goal.subjectId;

  const pace: GoalPace =
    targetHours > 0 && !isUnattributable
      ? paceFor(actualHours, proRatedTargetHours, window.weekday)
      : 'AHEAD';

  return {
    goal,
    actualHours,
    targetHours,
    proRatedTargetHours,
    percentOfWeek:
      targetHours > 0 ? Math.min(100, Math.round((actualHours / targetHours) * 100)) : 0,
    proRatedPercent:
      targetHours > 0
        ? Math.min(100, Math.round((proRatedTargetHours / targetHours) * 100))
        : 0,
    pace,
    needsAction: pace !== 'AHEAD',
    isUnattributable,
    week: window,
  };
}

/** Progress for every locked goal, in the order they were created. */
export async function lockedGoalProgress(
  window: WeekWindow = currentWeek()
): Promise<GoalWeekProgress[]> {
  const goals = (await db.goals.toArray())
    .filter((g) => g.status === 'APPROVED_LOCKED')
    .sort((a, b) => a.createdAt - b.createdAt);

  return Promise.all(goals.map((g) => goalWeekProgress(g, window)));
}

/** Just the locked goals that are behind their pro-rated pace. */
export async function goalsNeedingAction(
  window: WeekWindow = currentWeek()
): Promise<GoalWeekProgress[]> {
  return (await lockedGoalProgress(window)).filter((p) => p.needsAction);
}

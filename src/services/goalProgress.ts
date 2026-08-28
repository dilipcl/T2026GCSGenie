import { db } from '../db';
import { Goal } from '../types';
import { startOfWeekISO, isoWeekdayNumber, todayISO } from '../utils/date';

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
  /**
   * Behind the pro-rated pace, and late enough in the week for that to mean
   * something. Never true before Wednesday.
   */
  needsAction: boolean;
  /** No subject on the goal, so logged time can never be attributed to it. */
  isUnattributable: boolean;
}

/** Nothing is called "behind" before this weekday - Wed = 3. */
const EARLIEST_NUDGE_WEEKDAY = 3;

/**
 * Minutes logged per subject since the start of the current week.
 *
 * Reads check-ins rather than a separate log table: the focus timer and the
 * daily check-in both already write their minutes there, so attribution is one
 * new field on a row that exists rather than a second source of truth that can
 * disagree with the first.
 */
export async function weeklyMinutesBySubject(
  weekStart: string = startOfWeekISO()
): Promise<Record<string, number>> {
  const checkIns = await db.checkIns.where('date').aboveOrEqual(weekStart).toArray();

  const totals: Record<string, number> = {};
  for (const entry of checkIns) {
    const minutes = entry.completedRevisionMinutes || 0;
    if (minutes <= 0 || !entry.studySubjectId) continue;
    totals[entry.studySubjectId] = (totals[entry.studySubjectId] || 0) + minutes;
  }
  return totals;
}

/**
 * Minutes logged against one goal this week.
 *
 * Time attributed to the goal directly wins; otherwise time on the goal's
 * subject counts towards it. Two locked goals sharing a subject would each be
 * credited the same subject minutes, which is generous rather than wrong - the
 * alternative is asking a fourteen year old to split a revision session across
 * goals, and a number nobody enters is worse than one that is slightly kind.
 */
export async function weeklyMinutesForGoal(
  goal: Goal,
  weekStart: string = startOfWeekISO()
): Promise<number> {
  const checkIns = await db.checkIns.where('date').aboveOrEqual(weekStart).toArray();

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

export async function goalWeekProgress(
  goal: Goal,
  weekStart: string = startOfWeekISO()
): Promise<GoalWeekProgress> {
  const minutes = await weeklyMinutesForGoal(goal, weekStart);
  const actualHours = Math.round((minutes / 60) * 10) / 10;
  const targetHours = goal.weeklyHoursRequired || 0;

  const weekday = isoWeekdayNumber(todayISO());
  const proRatedTargetHours = Math.round(((targetHours * weekday) / 7) * 10) / 10;
  const isUnattributable = !goal.subjectId;

  return {
    goal,
    actualHours,
    targetHours,
    proRatedTargetHours,
    percentOfWeek: targetHours > 0 ? Math.min(100, Math.round((actualHours / targetHours) * 100)) : 0,
    needsAction:
      targetHours > 0 &&
      !isUnattributable &&
      weekday >= EARLIEST_NUDGE_WEEKDAY &&
      actualHours < proRatedTargetHours,
    isUnattributable,
  };
}

/** Progress for every locked goal, in the order they were created. */
export async function lockedGoalProgress(
  weekStart: string = startOfWeekISO()
): Promise<GoalWeekProgress[]> {
  const goals = (await db.goals.toArray())
    .filter((g) => g.status === 'APPROVED_LOCKED')
    .sort((a, b) => a.createdAt - b.createdAt);

  return Promise.all(goals.map((g) => goalWeekProgress(g, weekStart)));
}

/** Just the locked goals that are behind their pro-rated pace. */
export async function goalsNeedingAction(
  weekStart: string = startOfWeekISO()
): Promise<GoalWeekProgress[]> {
  return (await lockedGoalProgress(weekStart)).filter((p) => p.needsAction);
}

import { db } from '../db';
import { DailyCheckIn, Goal } from '../types';
import { minutesForGoalFromCheckIn } from './goalProgress';
import { addDaysISO, parseISODate, startOfWeekISO, todayISO } from '../utils/date';

/**
 * Target against actual, over the whole life of a goal.
 *
 * The app could already say what this week looked like (`goalProgress`) and
 * which way the last four weeks were pointing (`goalTrend`). Neither answers
 * the question a parent actually asks in September about an exam in June: at
 * this rate, does the plan still add up?
 *
 * The shape is a burn-down. A goal that reserves 4 hrs/week until 15 June has
 * committed a definite number of hours; every hour logged burns one off. The
 * planned line falls at the promised rate, the actual line falls at the real
 * one, and the gap between them is the answer - in hours, which can be made up,
 * rather than in a RAG colour, which cannot be acted on.
 *
 * Three things this deliberately refuses to do:
 *
 *  - **Count unapproved goals.** A goal in `PENDING_DISCUSSION` is a proposal.
 *    Burning it down would report a family as behind on hours nobody has agreed
 *    to spend.
 *  - **Blame the current week.** It is partial by definition. Counted as a
 *    miss, every Monday morning looks like a collapse - the same false alarm
 *    `goalTrend` already avoids.
 *  - **Silently drop unattributed time.** Half an hour logged against no
 *    subject is half an hour of real work. It cannot be credited to a goal, but
 *    reporting it as nothing done is a lie about the student, so it is carried
 *    out separately and named.
 */

const MINUTES_PER_HOUR = 60;

/** Below this many completed weeks, the lines are noise and are not drawn. */
export const MIN_WEEKS_FOR_CHART = 2;

/** Hours of slippage that still counts as on track. */
const TOLERANCE_HOURS = 1;

export type BurndownStatus =
  | 'NOT_STARTED'
  | 'ON_TRACK'
  | 'SLIPPING'
  | 'BEHIND'
  | 'DONE'
  | 'OVERDUE';

export interface BurndownPoint {
  /** Monday of the week, local ISO. */
  weekStart: string;
  /** Hours that would remain had the weekly budget been met every week. */
  plannedRemaining: number;
  /**
   * Hours that actually remain. Undefined for weeks that have not happened,
   * so the chart stops the actual line at today rather than drawing it flat
   * into the future as though nothing more will ever be done.
   */
  actualRemaining?: number;
  /** Hours logged in this week alone. */
  hoursThisWeek: number;
  isCurrent: boolean;
}

export interface GoalBurndown {
  goal: Goal;
  /** Monday the goal started being counted from. */
  startWeek: string;
  targetDate: string;
  totalWeeks: number;
  /** Completed weeks since the start, excluding the one in progress. */
  weeksElapsed: number;
  weeksRemaining: number;
  /** `weeklyHoursRequired` x `totalWeeks` - the whole commitment. */
  committedHours: number;
  /** What should have been done by the end of last week. */
  plannedToDateHours: number;
  loggedHours: number;
  /** Logged minus planned. Negative is behind. */
  varianceHours: number;
  /**
   * Hours per week needed from here to still finish on time.
   *
   * The actionable number, and the reason this is a burn-down rather than a
   * percentage. "31% complete" prompts nothing; "you would need 5.2 hrs/week
   * instead of 4" prompts either more hours or a smaller goal.
   */
  requiredHoursPerWeek: number;
  status: BurndownStatus;
  /** No subject and nothing goal-tagged, so time can never reach this goal. */
  isUnattributable: boolean;
  points: BurndownPoint[];
}

export interface PortfolioBurndown {
  goals: GoalBurndown[];
  committedHours: number;
  plannedToDateHours: number;
  loggedHours: number;
  varianceHours: number;
  /** The same curve, summed across every approved goal. */
  points: BurndownPoint[];
  /**
   * Study time that reached no approved goal - untagged, or tagged to a subject
   * no approved goal covers. Real work that the burn-down cannot credit.
   */
  unattributedHours: number;
  /** Completed weeks of history that exist at all. */
  weeksOfHistory: number;
  /** Whether there is enough history for the lines to mean anything. */
  hasEnoughData: boolean;
  /** Approved goals carrying no weekly budget, so nothing to burn down. */
  goalsWithoutBudget: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Mondays from `startWeek` up to and including the week holding `endISO`. */
function weekStartsBetween(startWeek: string, endISO: string): string[] {
  const weeks: string[] = [];
  const last = startOfWeekISO(endISO);
  let cursor = startWeek;

  // Bounded rather than while(true): a corrupt target date decades out would
  // otherwise allocate until the tab died.
  for (let i = 0; i < 520 && cursor <= last; i++) {
    weeks.push(cursor);
    cursor = addDaysISO(7, parseISODate(cursor));
  }
  return weeks;
}

/**
 * When a goal started counting.
 *
 * Approval, not creation. A goal drafted in June and approved in September has
 * not been quietly accruing a deficit all summer, and dating it from creation
 * would open it with a shortfall nobody could ever make up.
 */
function startWeekOf(goal: Goal): string {
  const anchor = goal.lockedAt ?? goal.createdAt;
  return startOfWeekISO(new Date(anchor).toISOString().slice(0, 10));
}

function statusOf(
  varianceHours: number,
  loggedHours: number,
  weeksElapsed: number,
  isOverdue: boolean,
  isComplete: boolean
): BurndownStatus {
  if (isComplete) return 'DONE';
  if (isOverdue) return 'OVERDUE';
  // Nothing has been asked of a goal approved this week, so nothing is wrong
  // with it yet.
  if (weeksElapsed === 0) return 'NOT_STARTED';
  if (loggedHours === 0) return 'BEHIND';
  if (varianceHours >= -TOLERANCE_HOURS) return 'ON_TRACK';
  // One week's budget behind is slipping; more than that is behind.
  return varianceHours >= -(TOLERANCE_HOURS * 4) ? 'SLIPPING' : 'BEHIND';
}

function buildGoal(goal: Goal, checkIns: DailyCheckIn[], today: string): GoalBurndown {
  const startWeek = startWeekOf(goal);
  const targetDate = goal.targetDate || today;
  const currentWeekStart = startOfWeekISO(today);

  const weeks = weekStartsBetween(startWeek, targetDate);
  const totalWeeks = Math.max(weeks.length, 1);
  const weeklyHours = goal.weeklyHoursRequired || 0;
  const committedHours = round1(weeklyHours * totalWeeks);

  // Minutes bucketed by the Monday of the week they fall in.
  const byWeek = new Map<string, number>();
  let loggedMinutes = 0;
  for (const entry of checkIns) {
    const minutes = minutesForGoalFromCheckIn(entry, goal);
    if (minutes <= 0) continue;
    const week = startOfWeekISO(entry.date);
    byWeek.set(week, (byWeek.get(week) ?? 0) + minutes);
    loggedMinutes += minutes;
  }

  const elapsed = weeks.filter((w) => w < currentWeekStart).length;
  const weeksElapsed = Math.min(elapsed, totalWeeks);
  const plannedToDateHours = round1(weeklyHours * weeksElapsed);
  const loggedHours = round1(loggedMinutes / MINUTES_PER_HOUR);
  const varianceHours = round1(loggedHours - plannedToDateHours);

  const weeksRemaining = Math.max(totalWeeks - weeksElapsed, 0);
  const outstanding = Math.max(committedHours - loggedHours, 0);
  const requiredHoursPerWeek = weeksRemaining > 0 ? round1(outstanding / weeksRemaining) : 0;

  let cumulative = 0;
  const points: BurndownPoint[] = weeks.map((weekStart, index) => {
    const hoursThisWeek = round1((byWeek.get(weekStart) ?? 0) / MINUTES_PER_HOUR);
    const isFuture = weekStart > currentWeekStart;
    if (!isFuture) cumulative = round1(cumulative + hoursThisWeek);

    return {
      weekStart,
      plannedRemaining: round1(Math.max(committedHours - weeklyHours * (index + 1), 0)),
      actualRemaining: isFuture ? undefined : round1(Math.max(committedHours - cumulative, 0)),
      hoursThisWeek,
      isCurrent: weekStart === currentWeekStart,
    };
  });

  return {
    goal,
    startWeek,
    targetDate,
    totalWeeks,
    weeksElapsed,
    weeksRemaining,
    committedHours,
    plannedToDateHours,
    loggedHours,
    varianceHours,
    requiredHoursPerWeek,
    status: statusOf(
      varianceHours,
      loggedHours,
      weeksElapsed,
      targetDate < today && goal.status !== 'COMPLETED',
      goal.status === 'COMPLETED' || loggedHours >= committedHours
    ),
    isUnattributable: !goal.subjectId && loggedMinutes === 0,
    points,
  };
}

/**
 * Sums the per-goal curves onto one timeline.
 *
 * Goals start and end on different dates, so a week is the sum of whichever
 * goals are running in it. A goal that has not started yet contributes its full
 * commitment to both lines - it is outstanding, not behind.
 */
function aggregate(goals: GoalBurndown[], today: string): BurndownPoint[] {
  const currentWeekStart = startOfWeekISO(today);
  const allWeeks = [...new Set(goals.flatMap((g) => g.points.map((p) => p.weekStart)))].sort();

  return allWeeks.map((weekStart) => {
    let plannedRemaining = 0;
    let actualRemaining = 0;
    let hoursThisWeek = 0;
    const isFuture = weekStart > currentWeekStart;

    for (const goal of goals) {
      const point = goal.points.find((p) => p.weekStart === weekStart);
      if (point) {
        plannedRemaining += point.plannedRemaining;
        actualRemaining += point.actualRemaining ?? 0;
        hoursThisWeek += point.hoursThisWeek;
        continue;
      }
      // Before this goal's first week it is entirely outstanding; after its
      // target date it contributes nothing.
      if (weekStart < goal.startWeek) {
        plannedRemaining += goal.committedHours;
        actualRemaining += goal.committedHours;
      }
    }

    return {
      weekStart,
      plannedRemaining: round1(plannedRemaining),
      actualRemaining: isFuture ? undefined : round1(actualRemaining),
      hoursThisWeek: round1(hoursThisWeek),
      isCurrent: weekStart === currentWeekStart,
    };
  });
}

/**
 * The whole picture and each goal within it.
 *
 * One pass over check-ins for every goal rather than a query per goal per week,
 * which over a school year would be hundreds of round trips to draw one chart.
 */
export async function portfolioBurndown(today: string = todayISO()): Promise<PortfolioBurndown> {
  const [allGoals, checkIns] = await Promise.all([
    db.goals.toArray(),
    db.checkIns.toArray(),
  ]);

  const approved = allGoals
    .filter((g) => g.status === 'APPROVED_LOCKED' || g.status === 'COMPLETED')
    .sort((a, b) => a.createdAt - b.createdAt);

  const budgeted = approved.filter((g) => (g.weeklyHoursRequired || 0) > 0);
  const goals = budgeted.map((goal) => buildGoal(goal, checkIns, today));

  const sum = (pick: (g: GoalBurndown) => number) => round1(goals.reduce((a, g) => a + pick(g), 0));

  // Time that reached no approved goal. Counted per check-in rather than by
  // subtracting totals: subject-level attribution can credit one entry to
  // several goals, so a subtraction would under-report the orphaned time.
  let unattributedMinutes = 0;
  for (const entry of checkIns) {
    const logged = entry.completedRevisionMinutes || 0;
    if (logged <= 0) continue;
    const reached = budgeted.some((goal) => minutesForGoalFromCheckIn(entry, goal) > 0);
    if (!reached) unattributedMinutes += logged;
  }

  const currentWeekStart = startOfWeekISO(today);
  const historyWeeks = new Set(
    checkIns
      .filter((c) => (c.completedRevisionMinutes || 0) > 0)
      .map((c) => startOfWeekISO(c.date))
      .filter((w) => w < currentWeekStart)
  );

  return {
    goals,
    committedHours: sum((g) => g.committedHours),
    plannedToDateHours: sum((g) => g.plannedToDateHours),
    loggedHours: sum((g) => g.loggedHours),
    varianceHours: sum((g) => g.varianceHours),
    points: aggregate(goals, today),
    unattributedHours: round1(unattributedMinutes / MINUTES_PER_HOUR),
    weeksOfHistory: historyWeeks.size,
    hasEnoughData: goals.length > 0 && historyWeeks.size >= MIN_WEEKS_FOR_CHART,
    goalsWithoutBudget: approved.length - budgeted.length,
  };
}

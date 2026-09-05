import { db } from '../db';
import { Task, WeekPlanBaseline } from '../types';
import { loadBaseline } from './planBaselineService';
import { occurrencesBetween } from './checkInOccurrenceService';
import { dayShape } from './dayPlan';
import { addDaysISO, parseISODate, todayISO } from '../utils/date';

/**
 * How well a week was actually executed, and what that is worth.
 *
 * The rule that shapes this file: **a bad week never costs XP that was already
 * earned.** The lever is a bonus paid at the end of a week, scaled by how much
 * of the promise was kept - so a poor week earns little or none of it, and a
 * strong week is paid properly. Clawing back banked XP would punish twice, and
 * a run of bad weeks would strip the rewards earned in the good ones, which is
 * how a motivation system becomes a spiral. Genuine sanctions already exist and
 * are a deliberate, visible, human decision.
 *
 * Two things are measured, because either alone can be gamed. Delivery is what
 * fraction of the committed work got done - the promise. Evidence is what
 * fraction of the week's occurrences were answered at all - without it, the
 * cheapest way to a perfect delivery score is to stop recording anything.
 */

/** The most a single week can pay for execution. */
export const XP_WEEK_BONUS_MAX = 100;

/**
 * Below this, the week pays nothing.
 *
 * A bonus that still pays out on a week that went badly says the promise did
 * not matter. Half is the point where "most of it happened" stops being true.
 */
export const WEEK_BONUS_FLOOR = 0.5;

/**
 * Work finished that was never committed to - pulled from the prioritised
 * backlog mid-week.
 *
 * Paid separately and on top, because it is genuinely additional: the week's
 * promise was met and then some. Deliberately smaller than the week bonus, so
 * hoovering up easy backlog items never beats keeping the actual commitment.
 */
export const XP_EXTRA_STORY = 20;

export interface WeekExecution {
  weekStart: string;
  weekEnd: string;
  /** Whether the week is over. A live week is reported but never paid. */
  isClosed: boolean;
  /** Whether there was an agreed plan at all. No baseline, no bonus. */
  wasBaselined: boolean;
  committed: number;
  delivered: number;
  /** Finished this week but never promised - backlog pulled in. */
  extra: number;
  occurrencesExpected: number;
  occurrencesAnswered: number;
  /** Fraction of the promise kept, 0..1. */
  deliveryRate: number;
  /** Fraction of the week's occurrences answered, 0..1. */
  evidenceRate: number;
  /** The two combined, 0..100, which is what the bonus scales on. */
  score: number;
  /** Never negative. Zero is the worst a week can do. */
  bonusXp: number;
  extraXp: number;
}

/** Every date in the week, Monday first. */
function datesOf(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(i, parseISODate(weekStart)));
}

function rate(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.min(1, part / whole);
}

/**
 * What a week came to.
 *
 * Delivery is weighted more heavily than evidence: keeping the promise is the
 * point, and answering the check-ins is how we know. Evidence still carries
 * real weight, because a week nobody recorded cannot be called a good one.
 */
export async function weekExecution(weekStart: string): Promise<WeekExecution> {
  const weekEnd = addDaysISO(6, parseISODate(weekStart));
  const baseline: WeekPlanBaseline | undefined = await loadBaseline(weekStart);

  const committedIds = baseline?.taskIds ?? [];
  const committedTasks = (await db.tasks.bulkGet(committedIds)).filter(
    (task): task is Task => !!task
  );
  const delivered = committedTasks.filter((task) => task.completed).length;

  /**
   * Extra work is counted from what was completed inside the week and was not
   * on the agreed list. Dated by completion rather than by due date, because
   * pulling a backlog item forward and finishing it on Thursday is exactly the
   * behaviour being rewarded.
   */
  const allTasks = await db.tasks.toArray();
  const committedSet = new Set(committedIds);
  const extra = allTasks.filter((task) => {
    if (!task.completed || !task.completedAt) return false;
    if (committedSet.has(task.id)) return false;
    const on = new Date(task.completedAt);
    const iso = `${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, '0')}-${String(
      on.getDate()
    ).padStart(2, '0')}`;
    return iso >= weekStart && iso <= weekEnd;
  }).length;

  const shapes = await Promise.all(datesOf(weekStart).map((date) => dayShape(date)));
  const occurrencesExpected = shapes.reduce((sum, shape) => sum + shape.occurrences.length, 0);
  const answered = await occurrencesBetween(weekStart, weekEnd);
  const occurrencesAnswered = answered.length;

  const deliveryRate = rate(delivered, committedTasks.length);
  const evidenceRate = rate(occurrencesAnswered, occurrencesExpected);
  const score = Math.round((deliveryRate * 0.7 + evidenceRate * 0.3) * 100);

  const isClosed = weekEnd < todayISO();
  const wasBaselined = baseline?.status === 'BASELINED';

  /**
   * Paid only for a finished week that was actually agreed. An unplanned week
   * has no promise to have kept, and paying it anyway would make finalising the
   * plan the optional step it used to be.
   */
  const earnsBonus = isClosed && wasBaselined && committedTasks.length > 0;
  const fraction = score / 100;
  const bonusXp =
    earnsBonus && fraction >= WEEK_BONUS_FLOOR ? Math.round(XP_WEEK_BONUS_MAX * fraction) : 0;

  return {
    weekStart,
    weekEnd,
    isClosed,
    wasBaselined,
    committed: committedTasks.length,
    delivered,
    extra,
    occurrencesExpected,
    occurrencesAnswered,
    deliveryRate,
    evidenceRate,
    score,
    bonusXp,
    extraXp: extra * XP_EXTRA_STORY,
  };
}

/**
 * Execution across the finished weeks, for the XP total.
 *
 * Recomputed rather than stored. A stored award would need invalidating every
 * time a task from a past week was ticked or a check-in backfilled, and the
 * version that forgets to invalidate pays the wrong number for ever.
 */
export async function closedWeekBonuses(weeks = 12): Promise<number> {
  const baselines = await db.planBaselines.toArray();
  const closed = baselines
    .map((baseline) => baseline.weekStart)
    .filter((weekStart) => addDaysISO(6, parseISODate(weekStart)) < todayISO())
    .sort()
    .slice(-weeks);

  const executions = await Promise.all(closed.map((weekStart) => weekExecution(weekStart)));
  return executions.reduce((sum, execution) => sum + execution.bonusXp + execution.extraXp, 0);
}

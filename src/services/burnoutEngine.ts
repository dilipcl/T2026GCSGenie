import { db } from '../db';
import { CommitmentException, FixedCommitment, RAGStatus } from '../types';
import { todayISO } from '../utils/date';
import { currentWeek, isInWeek, WeekWindow } from './weekWindow';
import { bespokeActivityHours } from './activityPlanService';

/** One commitment's contribution to the week, after any absences. */
export interface CommitmentLoad {
  id: string;
  label: string;
  /** The full weekly budget, before deductions. */
  scheduledHours: number;
  /** Hours excused this week. */
  excusedHours: number;
  /** What actually counts: scheduled minus excused, never below zero. */
  netHours: number;
  exceptionCount: number;
  accentColor?: string;
}

export interface BurnoutCapacityResult {
  safeWeeklyHoursLimit: number;
  totalScheduledHours: number;
  /** Per-commitment breakdown, in seeded order. */
  commitmentBreakdown: CommitmentLoad[];
  /** Baseline commitment hours before any absence is deducted. */
  baselineHours: number;
  /** Hours excused this week across every commitment. */
  excusedHours: number;
  /** This week's exceptions, so a caller can show what was excused and why. */
  exceptions: CommitmentException[];
  customGoalsHours: number;
  /**
   * One-off things planned for this week that are not recurring commitments -
   * the party, the film, the afternoon with friends. Real hours the week does
   * not have for study, and until now completely invisible to this gauge.
   *
   * Only bespoke rows count. Activities standing in for a fixed commitment
   * carry `fromCommitmentId` and are already inside `netBaselineHours`;
   * counting them here would charge the week twice for the same Tuesday.
   */
  plannedActivityHours: number;
  loggedRevisionHours: number;
  overdueTaskCount: number;
  highPriorityTaskCount: number;
  remainingSafeCapacity: number;
  stressIndex: number;
  stressStatus: RAGStatus;
  formulaExplanation: string;
  warningMessage?: string;
  moscowRecommendations: string[];
  /** The week these figures describe. */
  week: WeekWindow;
}

/**
 * Weekly hours ceiling. This is a TOTAL and includes the 32.5h already spent at
 * school, so it is not a homework budget.
 *
 * Baseline commitments come to 44h. A ceiling of 45h left under an hour a week
 * for all homework and revision, which meant the gauge sat at CRITICAL
 * permanently and stopped carrying any signal. 60h leaves roughly 16h of study
 * headroom: ~10h/week keeps the status GREEN, and only a genuinely excessive
 * load pushes it RED.
 */
const SAFE_WEEKLY_HOURS_LIMIT = 60.0;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * How much of a commitment this week's exceptions excuse.
 *
 * Only rows that actually deduct are counted - an ATTENDED row exists so the
 * weekly review can show that the parade night happened, and must not move the
 * total. Capped at the commitment's own weekly hours so a mis-entered absence
 * cannot drive the week's load negative.
 */
function excusedFor(
  commitment: FixedCommitment,
  exceptions: CommitmentException[]
): { hours: number; count: number } {
  const mine = exceptions.filter(
    (e) => e.commitmentId === commitment.id && e.deductsFromCapacity
  );
  const hours = mine.reduce((sum, e) => sum + (e.scheduledHours || 0), 0);
  return { hours: Math.min(commitment.weeklyHours, round1(hours)), count: mine.length };
}

export async function calculateBurnoutCapacity(): Promise<BurnoutCapacityResult> {
  const safeLimit = SAFE_WEEKLY_HOURS_LIMIT;
  const week = currentWeek();

  const [allCommitments, allExceptions, activeGoals] = await Promise.all([
    db.commitments.toArray(),
    db.commitmentExceptions.where('date').between(week.start, week.end, true, true).toArray(),
    db.goals.where('status').equals('APPROVED_LOCKED').toArray(),
  ]);

  // `isActive` is a boolean and therefore never indexed - filter in memory.
  const commitments = allCommitments
    .filter((c) => c.isActive)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  const exceptions = allExceptions.filter((e) => isInWeek(e.date, week));

  const commitmentBreakdown: CommitmentLoad[] = commitments.map((c) => {
    const { hours, count } = excusedFor(c, exceptions);
    return {
      id: c.id,
      label: c.label,
      scheduledHours: c.weeklyHours,
      excusedHours: hours,
      netHours: round1(Math.max(0, c.weeklyHours - hours)),
      exceptionCount: count,
      accentColor: c.accentColor,
    };
  });

  const baselineHours = round1(
    commitmentBreakdown.reduce((sum, c) => sum + c.scheduledHours, 0)
  );
  const excusedHours = round1(
    commitmentBreakdown.reduce((sum, c) => sum + c.excusedHours, 0)
  );
  const netBaselineHours = round1(
    commitmentBreakdown.reduce((sum, c) => sum + c.netHours, 0)
  );

  // Goals whose hours a commitment already accounts for. Air Cadets is both a
  // commitment and a locked goal; counting both charges the week twice for one
  // Tuesday evening.
  const goalIdsAlreadyInBaseline = new Set(
    commitments.flatMap((c) => (c.coveredByGoalId ? [c.coveredByGoalId] : []))
  );

  const customGoalsHours = round1(
    activeGoals
      .filter((g) => g.category === 'CO_CURRICULAR' || g.category === 'PERSONAL')
      .filter((g) => !goalIdsAlreadyInBaseline.has(g.id))
      .reduce((sum, g) => sum + (g.weeklyHoursRequired || 0), 0)
  );

  /**
   * Study time logged inside this Monday-to-Sunday week.
   *
   * This used to read a rolling seven days from the current timestamp while
   * `goalProgress` read from the Monday, so the two never agreed. Once both
   * appear in one cockpit the discrepancy is arithmetic anyone can check, and
   * the capacity gauge is the last number in the app that can afford to look
   * wrong.
   */
  const weekCheckIns = await db.checkIns
    .where('date')
    .between(week.start, week.end, true, true)
    .toArray();
  const loggedRevisionMinutes = weekCheckIns.reduce(
    (sum, c) => sum + (c.completedRevisionMinutes || 0),
    0
  );
  const loggedRevisionHours = round1(loggedRevisionMinutes / 60);

  const todayStr = todayISO();
  const allTasks = await db.tasks.toArray();
  const pendingTasks = allTasks.filter((t) => !t.completed);
  const overdueTasks = pendingTasks.filter((t) => t.dueDate < todayStr);
  const highPriorityTasks = pendingTasks.filter((t) => t.priority === 'HIGH');

  /**
   * Typed-in activities only. The recurring commitments reach this function
   * through `commitmentBreakdown` above, and asking the activity panel for them
   * as well would charge the week twice for the same Tuesday evening.
   */
  const plannedActivityHours = await bespokeActivityHours(week.start);

  const totalScheduled = round1(
    netBaselineHours + customGoalsHours + plannedActivityHours + loggedRevisionHours
  );
  const remaining = round1(safeLimit - totalScheduled);

  const baseStressPercent = (totalScheduled / safeLimit) * 100;
  const workloadSurcharge =
    overdueTasks.length * 2.0 + Math.max(0, highPriorityTasks.length - 2) * 1.5;
  const stressIndex = Math.min(150, Math.round(baseStressPercent + workloadSurcharge));

  let stressStatus: RAGStatus = 'GREEN';
  let warningMessage: string | undefined;
  const moscowRecommendations: string[] = [];

  /**
   * The deduction is spelled out rather than folded silently into the total.
   *
   * The burnout panel's whole credibility rests on its arithmetic being
   * checkable; a figure that quietly drops by three hours between Monday and
   * Tuesday reads as a bug, and a gauge nobody believes is a gauge nobody acts
   * on.
   */
  const excusedClause =
    excusedHours > 0
      ? `Commitments ${baselineHours}h less ${excusedHours}h excused this week = ${netBaselineHours}h. `
      : '';

  const formulaExplanation =
    `${excusedClause}Formula: (Scheduled Hours (${totalScheduled}h) / Safe Limit (${safeLimit}h)) × 100% ${
      workloadSurcharge > 0 ? `+ ${Math.round(workloadSurcharge)}% Task Pressure Surcharge` : ''
    } = ${stressIndex}% Stress Index.`;

  if (totalScheduled > safeLimit || stressIndex > 100) {
    stressStatus = 'RED';
    warningMessage = `CRITICAL BURNOUT RISK! Scheduled load (${totalScheduled}h) exceeds the safe ${safeLimit}h threshold by ${Math.abs(remaining)}h (${stressIndex}% Stress Index).`;
    moscowRecommendations.push("MoSCoW (Must/Should/Could/Won't): Defer non-essential personal goals.");
    moscowRecommendations.push('During mock exams or major Art deadlines, temporarily reduce DofE and Drum practice by 50%.');
    moscowRecommendations.push('Maintain strict 22:00 sleep cutoff (8.5+ hours rest needed).');
  } else if (stressIndex >= 90) {
    stressStatus = 'AMBER';
    warningMessage = `High load warning: Scheduled commitments (${totalScheduled}h) leave only ${remaining}h of safe weekly buffer.`;
    moscowRecommendations.push('Avoid adding new co-curricular clubs until current Year 10 topic assessments conclude.');
    moscowRecommendations.push('Focus on clearing high-priority homework on the day it is set.');
  } else {
    stressStatus = 'GREEN';
    moscowRecommendations.push('Schedule is well-balanced with safe rest capacity.');
  }

  return {
    safeWeeklyHoursLimit: safeLimit,
    totalScheduledHours: totalScheduled,
    commitmentBreakdown,
    baselineHours,
    excusedHours,
    exceptions,
    customGoalsHours,
    plannedActivityHours,
    loggedRevisionHours,
    overdueTaskCount: overdueTasks.length,
    highPriorityTaskCount: highPriorityTasks.length,
    remainingSafeCapacity: remaining,
    stressIndex,
    stressStatus,
    formulaExplanation,
    warningMessage,
    moscowRecommendations,
    week,
  };
}

/**
 * The study headroom a plan can actually occupy: the ceiling less the fixed
 * commitments and locked goals, ignoring whatever has already been logged.
 *
 * Was computed inline in PlanView by subtracting logged hours back out of the
 * total, which is the same sum written backwards and drifted the moment the
 * total gained a term.
 */
export function safeStudyHours(result: BurnoutCapacityResult): number {
  return round1(
    result.safeWeeklyHoursLimit -
      (result.totalScheduledHours - result.loggedRevisionHours)
  );
}

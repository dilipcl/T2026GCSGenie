import { db } from '../db';
import { RAGStatus } from '../types';
import { todayISO } from '../utils/date';

export interface BurnoutCapacityResult {
  safeWeeklyHoursLimit: number; // 45.0
  totalScheduledHours: number;
  schoolHours: number; // 32.5
  cadetsHours: number; // 6.0
  artSupportHours: number; // 1.5
  drumsHours: number; // 2.0
  dofeHours: number; // 2.0
  customGoalsHours: number;
  loggedRevisionHours: number;
  overdueTaskCount: number;
  highPriorityTaskCount: number;
  remainingSafeCapacity: number; // safeWeeklyHoursLimit - totalScheduledHours
  stressIndex: number; // % of capacity
  stressStatus: RAGStatus;
  formulaExplanation: string;
  warningMessage?: string;
  moscowRecommendations: string[];
}

/**
 * Fixed weekly commitments that are already known, so they do not need to be
 * re-entered as goals.
 *
 * `coveredByGoalId` matters: an approved goal representing the same real-world
 * commitment must NOT be added on top, or the same hours are counted twice.
 */
const BASELINE_COMMITMENTS = [
  { key: 'school', label: 'School', hours: 32.5 },
  { key: 'cadets', label: 'Air Cadets', hours: 6.0, coveredByGoalId: 'g-cadets' },
  { key: 'artSupport', label: 'Art Support', hours: 1.5 },
  { key: 'drums', label: 'Drums', hours: 2.0 },
  { key: 'dofe', label: 'Bronze DofE', hours: 2.0 },
] as const;

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

export async function calculateBurnoutCapacity(): Promise<BurnoutCapacityResult> {
  const safeLimit = SAFE_WEEKLY_HOURS_LIMIT;

  // Base commitments
  const hoursFor = (key: string) =>
    BASELINE_COMMITMENTS.find((c) => c.key === key)?.hours ?? 0;

  const schoolHours = hoursFor('school');
  const cadetsHours = hoursFor('cadets'); // Tue & Fri 19:00 - 22:00
  const artSupportHours = hoursFor('artSupport');
  const drumsHours = hoursFor('drums');
  const dofeHours = hoursFor('dofe');

  const baselineHours = BASELINE_COMMITMENTS.reduce((sum, c) => sum + c.hours, 0);
  const goalIdsAlreadyInBaseline = new Set<string>(
    BASELINE_COMMITMENTS.flatMap((c) => ('coveredByGoalId' in c ? [c.coveredByGoalId] : []))
  );

  // Additional active goals hours
  const activeGoals = await db.goals
    .where('status')
    .equals('APPROVED_LOCKED')
    .toArray();

  const customGoalsHours = activeGoals
    .filter((g) => g.category === 'CO_CURRICULAR' || g.category === 'PERSONAL')
    // Skip goals whose hours are already in the baseline above, or Air Cadets
    // (and anything like it) gets counted twice.
    .filter((g) => !goalIdsAlreadyInBaseline.has(g.id))
    .reduce((sum, g) => sum + (g.weeklyHoursRequired || 0), 0);

  // Revision hours logged this week from daily check-ins
  const oneWeekAgo = Date.now() - 7 * 86400000;
  const recentCheckIns = await db.checkIns
    .where('timestamp')
    .aboveOrEqual(oneWeekAgo)
    .toArray();
  const loggedRevisionMinutes = recentCheckIns.reduce(
    (sum, c) => sum + (c.completedRevisionMinutes || 0),
    0
  );
  const loggedRevisionHours = Math.round((loggedRevisionMinutes / 60) * 10) / 10;

  // Check overdue and high priority tasks
  const todayStr = todayISO();
  const allTasks = await db.tasks.toArray();
  const pendingTasks = allTasks.filter((t) => !t.completed);
  const overdueTasks = pendingTasks.filter((t) => t.dueDate < todayStr);
  const highPriorityTasks = pendingTasks.filter((t) => t.priority === 'HIGH');

  const baseScheduled = baselineHours + customGoalsHours + loggedRevisionHours;

  const totalScheduled = Math.round(baseScheduled * 10) / 10;
  const remaining = Math.round((safeLimit - totalScheduled) * 10) / 10;

  // Stress Index calculation: Base % + slight surcharge for overdue workload pressure
  const baseStressPercent = (totalScheduled / safeLimit) * 100;
  const workloadSurcharge = overdueTasks.length * 2.0 + Math.max(0, highPriorityTasks.length - 2) * 1.5;
  const stressIndex = Math.min(150, Math.round(baseStressPercent + workloadSurcharge));

  let stressStatus: RAGStatus = 'GREEN';
  let warningMessage: string | undefined;
  const moscowRecommendations: string[] = [];

  const formulaExplanation = `Formula: (Scheduled Hours (${totalScheduled}h) / Safe Limit (${safeLimit}h)) × 100% ${
    workloadSurcharge > 0 ? `+ ${Math.round(workloadSurcharge)}% Task Pressure Surcharge` : ''
  } = ${stressIndex}% Stress Index.`;

  if (totalScheduled > safeLimit || stressIndex > 100) {
    stressStatus = 'RED';
    warningMessage = `CRITICAL BURNOUT RISK! Scheduled load (${totalScheduled}h) exceeds the safe ${safeLimit}h threshold by ${Math.abs(remaining)}h (${stressIndex}% Stress Index).`;
    moscowRecommendations.push('MoSCoW (Must/Should/Could/Won\'t): Defer non-essential personal goals.');
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
    schoolHours,
    cadetsHours,
    artSupportHours,
    drumsHours,
    dofeHours,
    customGoalsHours,
    loggedRevisionHours,
    overdueTaskCount: overdueTasks.length,
    highPriorityTaskCount: highPriorityTasks.length,
    remainingSafeCapacity: remaining,
    stressIndex,
    stressStatus,
    formulaExplanation,
    warningMessage,
    moscowRecommendations,
  };
}

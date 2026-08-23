import { db } from '../db';
import { RAGStatus } from '../types';

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

export async function calculateBurnoutCapacity(): Promise<BurnoutCapacityResult> {
  const safeLimit = 45.0;

  // Base commitments
  const schoolHours = 32.5;
  const cadetsHours = 6.0; // Tue & Fri 19:00 - 22:00
  const artSupportHours = 1.5;
  const drumsHours = 2.0;
  const dofeHours = 2.0;

  // Additional active goals hours
  const activeGoals = await db.goals
    .where('status')
    .equals('APPROVED_LOCKED')
    .toArray();

  const customGoalsHours = activeGoals
    .filter((g) => g.category === 'CO_CURRICULAR' || g.category === 'PERSONAL')
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
  const todayStr = new Date().toISOString().split('T')[0];
  const allTasks = await db.tasks.toArray();
  const pendingTasks = allTasks.filter((t) => !t.completed);
  const overdueTasks = pendingTasks.filter((t) => t.dueDate < todayStr);
  const highPriorityTasks = pendingTasks.filter((t) => t.priority === 'HIGH');

  const baseScheduled =
    schoolHours +
    cadetsHours +
    artSupportHours +
    drumsHours +
    dofeHours +
    customGoalsHours +
    loggedRevisionHours;

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
    warningMessage = `CRITICAL BURNOUT RISK! Scheduled load (${totalScheduled}h) exceeds the safe 45h threshold by ${Math.abs(remaining)}h (${stressIndex}% Stress Index).`;
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

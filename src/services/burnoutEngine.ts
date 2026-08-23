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
  remainingSafeCapacity: number; // safeWeeklyHoursLimit - totalScheduledHours
  stressIndex: number; // % of capacity
  stressStatus: RAGStatus;
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

  const totalScheduled =
    schoolHours +
    cadetsHours +
    artSupportHours +
    drumsHours +
    dofeHours +
    customGoalsHours +
    loggedRevisionHours;

  const remaining = Math.round((safeLimit - totalScheduled) * 10) / 10;
  const stressIndex = Math.round((totalScheduled / safeLimit) * 100);

  let stressStatus: RAGStatus = 'GREEN';
  let warningMessage: string | undefined;
  const moscowRecommendations: string[] = [];

  if (totalScheduled > safeLimit) {
    stressStatus = 'RED';
    warningMessage = `CRITICAL BURNOUT RISK! Total scheduled commitments (${totalScheduled}h) exceed the safe 45h limit by ${Math.abs(remaining)}h. Immediate MoSCoW prioritization required.`;
    moscowRecommendations.push('Pause non-essential personal goals and gaming blocks.');
    moscowRecommendations.push('During exam mocks or Art deadline periods, reduce DofE and Drum practice blocks by 50%.');
    moscowRecommendations.push('Ensure 8+ hours of uninterrupted sleep every night.');
  } else if (stressIndex >= 90) {
    stressStatus = 'AMBER';
    warningMessage = `High load warning! Scheduled commitments (${totalScheduled}h) leave only ${remaining}h of safe weekly buffer.`;
    moscowRecommendations.push('Avoid adding new co-curricular commitments until Year 10 mock exams conclude.');
  } else {
    stressStatus = 'GREEN';
    moscowRecommendations.push('Schedule is well balanced with healthy rest capacity.');
  }

  return {
    safeWeeklyHoursLimit: safeLimit,
    totalScheduledHours: Math.round(totalScheduled * 10) / 10,
    schoolHours,
    cadetsHours,
    artSupportHours,
    drumsHours,
    dofeHours,
    customGoalsHours,
    remainingSafeCapacity: remaining,
    stressIndex,
    stressStatus,
    warningMessage,
    moscowRecommendations,
  };
}

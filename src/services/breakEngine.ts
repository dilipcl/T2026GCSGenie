import { db } from '../db';
import { addDaysISO, todayISO } from '../utils/date';
import { calculateStreakStats } from './habitEngine';

/**
 * Rest, and the two ways a plan quietly fails.
 *
 * The app already guards the top end - a weekly ceiling and a high-load warning
 * for over-scheduling. It had nothing for the opposite failures: a plan that
 * evaporates, or breaks that swallow the study they were meant to punctuate.
 * Both are gentler than burnout and far more common.
 *
 * Everything here is phrased as a suggestion. A nudge that reads as a telling-off
 * gets the app closed, which costs more than the missed session did.
 */

/** Pomodoro-ish. Long break after four blocks. */
export const FOCUS_MINUTES = 25;
export const SHORT_BREAK_MINUTES = 5;
export const LONG_BREAK_MINUTES = 20;
export const BLOCKS_BEFORE_LONG_BREAK = 4;

export type TimerPhase = 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK';

export function nextPhase(completedBlocks: number): { phase: TimerPhase; minutes: number } {
  const isLong = completedBlocks > 0 && completedBlocks % BLOCKS_BEFORE_LONG_BREAK === 0;
  return isLong
    ? { phase: 'LONG_BREAK', minutes: LONG_BREAK_MINUTES }
    : { phase: 'SHORT_BREAK', minutes: SHORT_BREAK_MINUTES };
}

export interface PlanPulse {
  /** Study minutes logged since Monday. */
  studiedThisWeek: number;
  /** Weekly hours from goals a parent has locked. */
  plannedHours: number;
  /** Study logged as a fraction of what was planned. */
  ratio: number;
  /**
   * Thursday-or-later with under half the planned study done. The mirror of the
   * high-load warning - it catches the plan slipping rather than the week being
   * too full.
   */
  slipping: boolean;
  /**
   * A day where logged rest dwarfs logged study. Not a judgement about resting -
   * only a prompt that one 25-minute block would change the shape of the day.
   */
  breaksEatingThePlan: boolean;
  message?: string;
}

/** Rest may exceed study by this much before it is worth mentioning. */
const BREAK_RATIO_LIMIT = 3;

export async function readPlanPulse(): Promise<PlanPulse> {
  const checkIns = await db.checkIns.toArray();
  const goals = await db.goals.toArray();

  // Monday as the start of the week, in local dates throughout
  const dow = new Date().getDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const weekStart = addDaysISO(-daysSinceMonday);

  const thisWeek = checkIns.filter((c) => c.date >= weekStart);
  const studiedThisWeek = thisWeek.reduce((sum, c) => sum + (c.completedRevisionMinutes || 0), 0);

  const plannedHours = goals
    .filter((g) => g.status === 'APPROVED_LOCKED' && g.category === 'ACADEMIC_GRADE_9')
    .reduce((sum, g) => sum + (g.weeklyHoursRequired || 0), 0);

  const plannedMinutes = plannedHours * 60;
  const ratio = plannedMinutes > 0 ? studiedThisWeek / plannedMinutes : 1;

  const lateInWeek = dow >= 4 || dow === 0;
  const slipping = plannedMinutes > 0 && lateInWeek && ratio < 0.5;

  // Today: rest logged against study logged
  const today = todayISO();
  const todayCheckIns = checkIns.filter((c) => c.date === today);
  const studyToday = todayCheckIns.reduce((s, c) => s + (c.completedRevisionMinutes || 0), 0);
  const restToday = todayCheckIns
    .filter((c) => c.structuredNotes?.category === 'WELL_BEING')
    .length * 30; // a logged rest check-in stands for roughly half an hour

  const breaksEatingThePlan = restToday > 0 && studyToday * BREAK_RATIO_LIMIT < restToday;

  let message: string | undefined;
  if (slipping) {
    const done = Math.round(studiedThisWeek / 6) / 10;
    message = `${done}h studied against about ${plannedHours}h planned, and the week is nearly gone. One 25-minute block now is worth more than a perfect plan on Sunday.`;
  } else if (breaksEatingThePlan) {
    message = 'Plenty of rest logged today and not much study. No judgement - but one 25-minute block would change the shape of the day.';
  }

  return {
    studiedThisWeek,
    plannedHours,
    ratio: Math.round(ratio * 100) / 100,
    slipping,
    breaksEatingThePlan,
    message,
  };
}

export interface StreakRepair {
  /** A repair is on the table: exactly one day was missed and today is still open. */
  available: boolean;
  missedDate?: string;
  currentStreak: number;
}

/**
 * Losing a streak is the biggest quit-moment there is, so the app already
 * absorbs a single missed day. This surfaces that grace explicitly rather than
 * leaving it as silent arithmetic: on the day after a miss, say plainly that
 * one check-in still saves the run.
 *
 * It offers no way to fabricate a past day - the repair is doing today's work,
 * not editing history.
 */
export async function checkStreakRepair(): Promise<StreakRepair> {
  const stats = await calculateStreakStats();

  return {
    available: stats.atRisk && !stats.doneToday,
    missedDate: stats.atRisk ? addDaysISO(-1) : undefined,
    currentStreak: stats.current,
  };
}

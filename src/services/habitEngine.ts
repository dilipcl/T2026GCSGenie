import { db } from '../db';
import { todayISO, addDaysISO, daysBetween, toLocalISODate, parseISODate } from '../utils/date';

export interface StreakStats {
  /** Days checked in during the current unbroken run. */
  current: number;
  /** Longest run ever achieved. Never decreases. */
  best: number;
  /** Total distinct days ever checked in. */
  totalDays: number;
  lastCheckInDate: string | null;
  /** Whole days since the last check-in. null when there has never been one. */
  daysSinceLastCheckIn: number | null;
  /** Already checked in today. */
  doneToday: boolean;
  /**
   * Exactly one day has been missed. This is the moment that decides whether the
   * habit survives, so it gets its own flag rather than being folded into a
   * generic "streak broken" state.
   */
  atRisk: boolean;
  /** Single missed days absorbed by the never-miss-twice rule in the current run. */
  graceDaysUsed: number;
}

export interface EffortStats {
  /**
   * "Every action is a vote for the person you wish to become" - one vote per
   * completed task, completed quest, and day checked in.
   */
  votes: number;
  tasksCompleted: number;
  questsCompleted: number;
  checkInDays: number;
  /** Total study time ever logged, in hours to 1dp. */
  hoursLogged: number;
  /** Study time logged in the last 7 days, in hours to 1dp. */
  hoursThisWeek: number;
}

export interface HeatmapDay {
  date: string;
  /** 0 = nothing logged, 1-3 = increasing amount of work that day. */
  level: 0 | 1 | 2 | 3;
  checkIns: number;
  minutes: number;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * Groups check-in dates into runs under the "never miss twice" rule: a single
 * missed day is absorbed and the chain continues, two consecutive missed days
 * end the run.
 *
 * Resetting a three week streak to zero after one bad Saturday punishes hardest
 * at the exact moment re-engagement matters most, which is the opposite of what
 * the streak is for.
 */
function buildRuns(datesDescending: string[]): { days: number; graceDays: number }[] {
  if (datesDescending.length === 0) return [];

  const runs: { days: number; graceDays: number }[] = [];
  let days = 1;
  let graceDays = 0;

  for (let i = 1; i < datesDescending.length; i++) {
    const gap = daysBetween(datesDescending[i], datesDescending[i - 1]);

    if (gap === 1) {
      days++;
    } else if (gap === 2) {
      // Exactly one missed day - absorbed, chain survives
      days++;
      graceDays++;
    } else {
      runs.push({ days, graceDays });
      days = 1;
      graceDays = 0;
    }
  }

  runs.push({ days, graceDays });
  return runs;
}

export async function calculateStreakStats(): Promise<StreakStats> {
  const checkIns = await db.checkIns.toArray();
  const uniqueDates = Array.from(new Set(checkIns.map((c) => c.date))).sort().reverse();

  if (uniqueDates.length === 0) {
    return {
      current: 0,
      best: 0,
      totalDays: 0,
      lastCheckInDate: null,
      daysSinceLastCheckIn: null,
      doneToday: false,
      atRisk: false,
      graceDaysUsed: 0,
    };
  }

  const runs = buildRuns(uniqueDates);
  const best = runs.reduce((max, r) => Math.max(max, r.days), 0);

  const lastCheckInDate = uniqueDates[0];
  const daysSince = daysBetween(lastCheckInDate, todayISO());

  // 0 = checked in today, 1 = yesterday (still live), 2 = one day missed and
  // still recoverable today, 3+ = two consecutive misses, the run has ended.
  const runIsLive = daysSince <= 2;

  return {
    current: runIsLive ? runs[0].days : 0,
    best,
    totalDays: uniqueDates.length,
    lastCheckInDate,
    daysSinceLastCheckIn: daysSince,
    doneToday: daysSince === 0,
    atRisk: daysSince === 2,
    graceDaysUsed: runIsLive ? runs[0].graceDays : 0,
  };
}

export async function calculateEffortStats(): Promise<EffortStats> {
  const [checkIns, tasks, remediations] = await Promise.all([
    db.checkIns.toArray(),
    db.tasks.toArray(),
    db.remediations.toArray(),
  ]);

  const tasksCompleted = tasks.filter((t) => t.completed).length;
  const questsCompleted = remediations.filter((r) => r.isCompleted).length;
  const checkInDays = new Set(checkIns.map((c) => c.date)).size;

  const totalMinutes = checkIns.reduce((sum, c) => sum + (c.completedRevisionMinutes || 0), 0);

  const weekAgo = addDaysISO(-7);
  const weekMinutes = checkIns
    .filter((c) => c.date >= weekAgo)
    .reduce((sum, c) => sum + (c.completedRevisionMinutes || 0), 0);

  return {
    votes: tasksCompleted + questsCompleted + checkInDays,
    tasksCompleted,
    questsCompleted,
    checkInDays,
    hoursLogged: Math.round((totalMinutes / 60) * 10) / 10,
    hoursThisWeek: Math.round((weekMinutes / 60) * 10) / 10,
  };
}

/**
 * A calendar grid of recent activity. A single number can be reset to zero; a
 * visible history of 40 days with a few gaps still reads as success, which is
 * the point of tracking the habit visually.
 *
 * Starts on the Monday on or before the first day so that columns line up as
 * whole weeks.
 */
export async function buildCheckInHeatmap(weeks = 12): Promise<HeatmapDay[]> {
  const checkIns = await db.checkIns.toArray();

  const byDate = new Map<string, { checkIns: number; minutes: number }>();
  for (const c of checkIns) {
    const entry = byDate.get(c.date) || { checkIns: 0, minutes: 0 };
    entry.checkIns++;
    entry.minutes += c.completedRevisionMinutes || 0;
    byDate.set(c.date, entry);
  }

  const today = todayISO();
  const todayDate = parseISODate(today);

  // Wind back to the Monday of the week containing the first day of the window
  const start = parseISODate(addDaysISO(-(weeks * 7 - 1), todayDate));
  const weekday = (start.getDay() + 6) % 7; // Mon = 0
  start.setDate(start.getDate() - weekday);

  // Run to the end of the current week so the final column is not ragged
  const end = new Date(todayDate);
  end.setDate(end.getDate() + (6 - ((todayDate.getDay() + 6) % 7)));

  const days: HeatmapDay[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const date = toLocalISODate(cursor);
    const entry = byDate.get(date);

    let level: HeatmapDay['level'] = 0;
    if (entry) {
      if (entry.minutes >= 60 || entry.checkIns >= 3) level = 3;
      else if (entry.minutes >= 30 || entry.checkIns >= 2) level = 2;
      else level = 1;
    }

    days.push({
      date,
      level,
      checkIns: entry?.checkIns || 0,
      minutes: entry?.minutes || 0,
      isToday: date === today,
      isFuture: date > today,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

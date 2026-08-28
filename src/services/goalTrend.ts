import { db } from '../db';
import { Goal, SubjectId } from '../types';
import { weeklyMinutesForGoal } from './goalProgress';
import { lastWeeks, WeekWindow } from './weekWindow';

/**
 * Four weeks of hours per subject, so drift is visible before it is a grade.
 *
 * The film's Act 1 turns on one idea: "the knowledge gap doesn't open up
 * suddenly. It drifts. And it stays completely invisible right up until the
 * moment it isn't." The app could already say a subject was amber today, and
 * it could say this week's goal was behind - but nothing anywhere could show
 * four weeks of quietly declining effort while every status still read green.
 *
 * Derived entirely from check-ins that already exist. No new writes, no schema
 * change, and therefore no chance of the trend and the weekly figure
 * disagreeing.
 */

export interface TrendPoint {
  week: WeekWindow;
  /** Hours logged in that week, to 1dp. */
  hours: number;
  /** True for the week in progress, which is necessarily incomplete. */
  isCurrent: boolean;
}

export type TrendDirection = 'RISING' | 'STEADY' | 'FALLING' | 'UNKNOWN';

export interface Trend {
  points: TrendPoint[];
  direction: TrendDirection;
  /** Mean weekly hours across the completed weeks only. */
  averageHours: number;
  /** Completed weeks with nothing logged at all. */
  emptyWeeks: number;
  /** Human sentence for the card, or undefined when there is nothing to say. */
  message?: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Below this weekly change, a trend is flat rather than moving. */
const MEANINGFUL_HOURS_DELTA = 0.5;

/**
 * Which way the completed weeks are pointing.
 *
 * The current week is deliberately excluded. It is partial by definition, so
 * including it makes every subject look like it is collapsing on a Monday
 * morning - a false alarm every seven days is how a signal gets ignored.
 */
function directionOf(completed: TrendPoint[]): TrendDirection {
  if (completed.length < 2) return 'UNKNOWN';

  const half = Math.floor(completed.length / 2);
  const older = completed.slice(0, half);
  const newer = completed.slice(completed.length - half);

  const mean = (points: TrendPoint[]) =>
    points.reduce((sum, p) => sum + p.hours, 0) / (points.length || 1);

  const delta = mean(newer) - mean(older);
  if (delta <= -MEANINGFUL_HOURS_DELTA) return 'FALLING';
  if (delta >= MEANINGFUL_HOURS_DELTA) return 'RISING';
  return 'STEADY';
}

function summarise(points: TrendPoint[], label: string): Trend {
  const completed = points.filter((p) => !p.isCurrent);
  const direction = directionOf(completed);
  const averageHours = round1(
    completed.reduce((sum, p) => sum + p.hours, 0) / (completed.length || 1)
  );
  const emptyWeeks = completed.filter((p) => p.hours === 0).length;

  // Empty weeks are reported ahead of a falling trend, because they are the
  // more specific claim. "3h then nothing for a fortnight" is both falling and
  // empty; the second sentence tells you something the first only implies.
  let message: string | undefined;
  if (emptyWeeks >= 2) {
    message = `${label} has had ${emptyWeeks} weeks with nothing logged in the last month.`;
  } else if (direction === 'FALLING') {
    message = `${label} has been getting less time each week — ${completed
      .map((p) => `${p.hours}h`)
      .join(' → ')}. Worth a look before it shows up in a test.`;
  } else if (direction === 'RISING') {
    message = `${label} is getting more time than it was a month ago.`;
  }

  return { points, direction, averageHours, emptyWeeks, message };
}

/**
 * Minutes logged per subject across several weeks, in one pass.
 *
 * One query for the whole span rather than one per week: four weeks times nine
 * subjects is thirty-six round trips through IndexedDB for data that fits in a
 * single range read.
 */
async function minutesByWeekAndSubject(
  windows: WeekWindow[]
): Promise<Map<string, Map<string, number>>> {
  const span = { start: windows[0].start, end: windows[windows.length - 1].end };
  const checkIns = await db.checkIns.where('date').between(span.start, span.end, true, true).toArray();

  const byWeek = new Map<string, Map<string, number>>();
  for (const window of windows) byWeek.set(window.start, new Map());

  for (const entry of checkIns) {
    const minutes = entry.completedRevisionMinutes || 0;
    if (minutes <= 0 || !entry.studySubjectId) continue;

    const window = windows.find((w) => entry.date >= w.start && entry.date <= w.end);
    if (!window) continue;

    const subjects = byWeek.get(window.start)!;
    subjects.set(entry.studySubjectId, (subjects.get(entry.studySubjectId) || 0) + minutes);
  }

  return byWeek;
}

/** One subject's last `weeks` weeks, oldest first, ending with the week in progress. */
export async function subjectTrend(
  subjectId: SubjectId,
  weeks = 4,
  reference?: string
): Promise<Trend> {
  const windows = lastWeeks(weeks, reference);
  const byWeek = await minutesByWeekAndSubject(windows);

  const points: TrendPoint[] = windows.map((week, i) => ({
    week,
    hours: round1((byWeek.get(week.start)?.get(subjectId) || 0) / 60),
    isCurrent: i === windows.length - 1,
  }));

  const subject = await db.subjects.get(subjectId);
  return summarise(points, subject?.shortName || subjectId);
}

/** Every subject that has had any time logged in the window, worst trend first. */
export async function allSubjectTrends(
  weeks = 4,
  reference?: string
): Promise<{ subjectId: SubjectId; trend: Trend }[]> {
  const subjects = await db.subjects.toArray();
  const results = await Promise.all(
    subjects.map(async (s) => ({ subjectId: s.id, trend: await subjectTrend(s.id, weeks, reference) }))
  );

  const rank: Record<TrendDirection, number> = { FALLING: 0, UNKNOWN: 1, STEADY: 2, RISING: 3 };
  return results.sort(
    (a, b) =>
      rank[a.trend.direction] - rank[b.trend.direction] ||
      a.trend.averageHours - b.trend.averageHours
  );
}

/**
 * One goal's last `weeks` weeks against its weekly budget.
 *
 * Uses the same attribution as the weekly figure - time booked to the goal
 * directly, otherwise time on its subject - so the sparkline and the bar above
 * it can never tell different stories.
 */
export async function goalTrend(goal: Goal, weeks = 4, reference?: string): Promise<Trend> {
  const windows = lastWeeks(weeks, reference);

  const points: TrendPoint[] = [];
  for (const [i, week] of windows.entries()) {
    points.push({
      week,
      hours: round1((await weeklyMinutesForGoal(goal, week)) / 60),
      isCurrent: i === windows.length - 1,
    });
  }

  return summarise(points, goal.title);
}

/** Locked goals whose four-week trend is falling. */
export async function goalsDrifting(weeks = 4, reference?: string): Promise<{ goal: Goal; trend: Trend }[]> {
  const goals = (await db.goals.toArray()).filter((g) => g.status === 'APPROVED_LOCKED');

  const results = await Promise.all(
    goals.map(async (goal) => ({ goal, trend: await goalTrend(goal, weeks, reference) }))
  );
  return results.filter((r) => r.trend.direction === 'FALLING');
}

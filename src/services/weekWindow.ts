import { addDaysISO, isoWeekdayNumber, parseISODate, startOfWeekISO, todayISO } from '../utils/date';

/**
 * One definition of "this week", for everything that reports a weekly figure.
 *
 * There used to be two. `burnoutEngine` measured a rolling seven days from the
 * current timestamp; `goalProgress` measured from the Monday. On separate cards
 * nobody noticed. Side by side in one cockpit the arithmetic visibly fails -
 * the per-goal hours do not add up to the "revision logged" total, and the
 * first person to spot it stops believing the capacity gauge, which is the one
 * number the whole burnout model rests on.
 *
 * A weekly *budget* has to reset on a known day or the same session keeps
 * counting for a week and a goal never looks behind, so Monday-start wins.
 * A rolling window is still the right shape for "how hard have you been working
 * lately" - it is kept, but named `rolling7Days` so the two can never be
 * confused at a call site.
 */
export interface WeekWindow {
  /** Monday, local YYYY-MM-DD, inclusive. */
  start: string;
  /** Sunday, local YYYY-MM-DD, inclusive. */
  end: string;
  /** 1 on Monday through 7 on Sunday, for the reference date. */
  weekday: number;
  /** Fraction of the week elapsed by the end of the reference day, 1/7 .. 1. */
  elapsedFraction: number;
}

/** The Monday-to-Sunday week containing `reference`. */
export function weekContaining(reference: string = todayISO()): WeekWindow {
  const start = startOfWeekISO(reference);
  const weekday = isoWeekdayNumber(reference);
  return {
    start,
    end: addDaysISO(6, parseISODate(start)),
    weekday,
    elapsedFraction: weekday / 7,
  };
}

/** The current week. */
export function currentWeek(): WeekWindow {
  return weekContaining(todayISO());
}

/**
 * A past week, counting back from the current one. `weeksAgo(0)` is this week,
 * `weeksAgo(1)` the week before, and so on.
 */
export function weeksAgo(count: number, reference: string = todayISO()): WeekWindow {
  const thisMonday = startOfWeekISO(reference);
  const target = addDaysISO(-7 * count, parseISODate(thisMonday));
  return weekContaining(target);
}

/**
 * The last `count` complete weeks plus the current one, oldest first.
 * `lastWeeks(4)` gives three finished weeks and the one in progress.
 */
export function lastWeeks(count: number, reference: string = todayISO()): WeekWindow[] {
  const windows: WeekWindow[] = [];
  for (let i = count - 1; i >= 0; i--) windows.push(weeksAgo(i, reference));
  return windows;
}

/**
 * Whether a local date falls inside a window.
 *
 * The upper bound matters and used to be missing: `goalProgress` filtered with
 * `.aboveOrEqual(weekStart)` alone, so a check-in dated into next week - easy
 * enough to produce by logging on a phone whose clock has run ahead, or by
 * importing a backup - counted towards this week's budget and never stopped.
 */
export function isInWeek(dateISO: string, window: WeekWindow): boolean {
  return dateISO >= window.start && dateISO <= window.end;
}

/**
 * The trailing seven days ending today, inclusive.
 *
 * Deliberately a different shape from `WeekWindow` so the two cannot be passed
 * to the same function by accident.
 */
export function rolling7Days(reference: string = todayISO()): { start: string; end: string } {
  return { start: addDaysISO(-6, parseISODate(reference)), end: reference };
}

import { db } from '../db';
import { WeekType } from '../types';
import { startOfWeekISO, parseISODate, todayISO } from '../utils/date';

/**
 * Which timetable week a date falls in.
 *
 * The odd/even week was a toggle in the header and nothing else. That is fine
 * for the day you are looking at and useless for every other one: the check-in
 * asking what lessons a Tuesday held, or a finished week being looked back at,
 * had to assume ODD and was wrong half the time. Nothing recorded was wrong,
 * but the lessons offered could be - which is the same thing to whoever is
 * ticking them off.
 *
 * A fortnightly timetable is a strict alternation, so one date settles every
 * other date. `termStartDate` is the Monday of the first ODD week; an even
 * number of whole weeks after it is ODD, an odd number is EVEN.
 *
 * Set from the Monday rather than from any day in the week, so that the answer
 * does not depend on which day of that first week somebody happened to pick.
 */

/**
 * The week type for a date, given the Monday that term started.
 *
 * Pure, and the whole rule lives here. Returns ODD when there is no term start
 * to reckon from - the app's previous behaviour, kept deliberately: a guess
 * that alternates would be wrong just as often and would look authoritative
 * while doing it.
 */
export function weekTypeOn(date: string, termStartDate?: string): WeekType {
  if (!termStartDate) return 'ODD';

  const termMonday = startOfWeekISO(termStartDate);
  const thisMonday = startOfWeekISO(date);

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  /**
   * Both ends are local midnight on a Monday, so this division is whole weeks.
   * Rounded rather than floored because a clock change puts an hour into one
   * fortnight a year, and 25.96 weeks must not read as 25.
   */
  const weeks = Math.round(
    (parseISODate(thisMonday).getTime() - parseISODate(termMonday).getTime()) / msPerWeek
  );

  /**
   * A date before term started still gets an answer, and the alternation runs
   * backwards exactly as it runs forwards. `%` alone would return -1 for an odd
   * number of weeks before term, so the result is normalised into 0 or 1.
   */
  return ((weeks % 2) + 2) % 2 === 0 ? 'ODD' : 'EVEN';
}

/**
 * The week type for a date, reading the term start from settings.
 *
 * The term calendar is authoritative whenever it is set, and the header toggle
 * becomes the fallback rather than a competing answer. Two sources that can
 * disagree is worse than either one alone: the check-in would offer Tuesday's
 * lessons from the toggle while the week review scored them from the calendar,
 * and nothing on screen would say which had been believed.
 */
export async function resolveWeekType(
  date: string = todayISO(),
  fallback: WeekType = 'ODD'
): Promise<WeekType> {
  const settings = await db.parentSettings.get('active_settings');
  if (!settings?.termStartDate) return fallback;
  return weekTypeOn(date, settings.termStartDate);
}

/** Whether the app can work a week type out at all, or is still guessing. */
export async function hasTermCalendar(): Promise<boolean> {
  const settings = await db.parentSettings.get('active_settings');
  return !!settings?.termStartDate;
}

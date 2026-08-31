import { formatPastDate, formatFriendlyDate, addDaysISO, todayISO } from '../utils/date';
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  currentWeek,
  isInWeek,
  lastWeeks,
  rolling7Days,
  weekContaining,
  weeksAgo,
} from './weekWindow';

/**
 * Only `Date` is faked. Faking timers wholesale deadlocks Dexie, which waits on
 * real microtask scheduling to settle a transaction.
 */
function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

afterEach(() => {
  vi.useRealTimers();
});

// 2026-08-31 is a Monday, 2026-09-06 the Sunday that closes the same week.
const MONDAY = '2026-08-31';
const WEDNESDAY = '2026-09-02';
const FRIDAY = '2026-09-04';
const SUNDAY = '2026-09-06';
const NEXT_MONDAY = '2026-09-07';

describe('weekContaining', () => {
  it('starts on Monday and ends on the following Sunday', () => {
    const week = weekContaining(WEDNESDAY);
    expect(week.start).toBe(MONDAY);
    expect(week.end).toBe(SUNDAY);
  });

  it('puts every day of one week in the same window', () => {
    for (const day of [MONDAY, WEDNESDAY, FRIDAY, SUNDAY]) {
      expect(weekContaining(day).start).toBe(MONDAY);
    }
  });

  it('rolls over on Monday, not on Sunday', () => {
    expect(weekContaining(SUNDAY).start).toBe(MONDAY);
    expect(weekContaining(NEXT_MONDAY).start).toBe(NEXT_MONDAY);
  });

  it('numbers Monday 1 through Sunday 7', () => {
    expect(weekContaining(MONDAY).weekday).toBe(1);
    expect(weekContaining(WEDNESDAY).weekday).toBe(3);
    expect(weekContaining(FRIDAY).weekday).toBe(5);
    expect(weekContaining(SUNDAY).weekday).toBe(7);
  });

  it('reports the fraction of the week elapsed', () => {
    expect(weekContaining(WEDNESDAY).elapsedFraction).toBeCloseTo(3 / 7);
    expect(weekContaining(SUNDAY).elapsedFraction).toBe(1);
  });
});

describe('isInWeek', () => {
  const week = weekContaining(WEDNESDAY);

  it('includes both endpoints', () => {
    expect(isInWeek(MONDAY, week)).toBe(true);
    expect(isInWeek(SUNDAY, week)).toBe(true);
  });

  it('excludes the days either side', () => {
    expect(isInWeek('2026-08-30', week)).toBe(false);
    expect(isInWeek(NEXT_MONDAY, week)).toBe(false);
  });

  /**
   * The bound that was missing. `goalProgress` filtered with `aboveOrEqual`
   * alone, so a check-in dated into next week counted towards this week's
   * budget - and kept counting, because it never fell out of range.
   */
  it('excludes a date in the future', () => {
    expect(isInWeek('2026-12-25', week)).toBe(false);
  });
});

describe('weeksAgo and lastWeeks', () => {
  it('counts back whole weeks from the current one', () => {
    expect(weeksAgo(0, WEDNESDAY).start).toBe(MONDAY);
    expect(weeksAgo(1, WEDNESDAY).start).toBe('2026-08-24');
    expect(weeksAgo(3, WEDNESDAY).start).toBe('2026-08-10');
  });

  it('returns four consecutive windows, oldest first, ending with this week', () => {
    const windows = lastWeeks(4, WEDNESDAY);
    expect(windows.map((w) => w.start)).toEqual([
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
    ]);
    expect(windows.at(-1)!.end).toBe(SUNDAY);
  });

  it('leaves no gap or overlap between adjacent windows', () => {
    const windows = lastWeeks(4, WEDNESDAY);
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i - 1].end < windows[i].start).toBe(true);
      expect(isInWeek(windows[i].start, windows[i - 1])).toBe(false);
    }
  });
});

describe('rolling7Days', () => {
  it('is the trailing seven days including today', () => {
    expect(rolling7Days(WEDNESDAY)).toEqual({ start: '2026-08-27', end: WEDNESDAY });
  });

  /**
   * The whole reason both exist. On a Wednesday the trailing window reaches
   * back into the previous week; the Monday-start window does not. Anything
   * reporting "this week" has to pick one, and they must not be swapped.
   */
  it('differs from the Monday-start week mid-week', () => {
    const week = weekContaining(WEDNESDAY);
    const trailing = rolling7Days(WEDNESDAY);
    expect(trailing.start < week.start).toBe(true);
    expect(isInWeek(trailing.start, week)).toBe(false);
  });
});

describe('currentWeek', () => {
  it('reads the frozen clock', () => {
    freezeAt(FRIDAY);
    const week = currentWeek();
    expect(week.start).toBe(MONDAY);
    expect(week.end).toBe(SUNDAY);
    expect(week.weekday).toBe(5);
  });
});

describe('formatPastDate', () => {
  it('never phrases a past date as a deadline', () => {
    // Seen live: an activity day heading read "OVERDUE BY 1 DAY - 21 CHANGES",
    // which says something alarming and untrue about work done on Sunday.
    const yesterday = addDaysISO(-1);
    expect(formatFriendlyDate(yesterday)).toBe('Overdue by 1 day');
    expect(formatPastDate(yesterday)).toBe('Yesterday');
  });

  it('says Today for today', () => {
    expect(formatPastDate(todayISO())).toBe('Today');
  });

  it('uses the weekday within the last week', () => {
    expect(formatPastDate(addDaysISO(-3))).toMatch(
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/
    );
  });

  it('falls back to an absolute date further back', () => {
    expect(formatPastDate(addDaysISO(-30))).toMatch(/\d{1,2} \w{3}$/);
  });
});

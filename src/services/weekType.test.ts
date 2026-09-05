import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { weekTypeOn, resolveWeekType, hasTermCalendar } from './weekType';

/**
 * The odd/even week used to be a toggle and nothing more, so any part of the
 * app reasoning about a date other than the one on screen had to assume ODD -
 * and was wrong half the time. The check-in offering Tuesday's lessons is the
 * case that matters: nothing recorded was wrong, but the rows offered could be,
 * which amounts to the same thing for whoever is ticking them off.
 *
 * Term starts Monday 1 September 2026, which is an ODD week.
 */

const TERM_START = '2026-09-07';

describe('working the week type out from the term start', () => {
  it('calls the first week ODD', () => {
    expect(weekTypeOn('2026-09-07', TERM_START)).toBe('ODD');
    expect(weekTypeOn('2026-09-11', TERM_START)).toBe('ODD');
  });

  it('calls the second week EVEN', () => {
    expect(weekTypeOn('2026-09-14', TERM_START)).toBe('EVEN');
    expect(weekTypeOn('2026-09-18', TERM_START)).toBe('EVEN');
  });

  it('keeps alternating across a term', () => {
    expect(weekTypeOn('2026-09-21', TERM_START)).toBe('ODD');
    expect(weekTypeOn('2026-09-28', TERM_START)).toBe('EVEN');
    expect(weekTypeOn('2026-10-05', TERM_START)).toBe('ODD');
    expect(weekTypeOn('2026-12-14', TERM_START)).toBe('ODD');
  });

  it('gives every day of one week the same answer', () => {
    // Monday to Sunday of the second week. A timetable that changed type
    // midweek would be unusable, and the Sunday is what a week-close review
    // reads.
    const week = [
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ];
    for (const day of week) {
      expect(weekTypeOn(day, TERM_START)).toBe('EVEN');
    }
  });

  it('runs backwards for a date before term started', () => {
    // Looking back at a week from last term must not throw or land on ODD by
    // accident - the alternation is the same in both directions.
    expect(weekTypeOn('2026-08-31', TERM_START)).toBe('EVEN');
    expect(weekTypeOn('2026-08-24', TERM_START)).toBe('ODD');
  });

  it('does not care which day of the first week was entered', () => {
    // Whoever sets this will pick a day, not necessarily the Monday, and the
    // answer must not depend on which one.
    for (const given of ['2026-09-07', '2026-09-09', '2026-09-13']) {
      expect(weekTypeOn('2026-09-14', given)).toBe('EVEN');
    }
  });

  it('survives the clock change', () => {
    // British Summer Time ends on 25 October 2026, putting a 25-hour day inside
    // one fortnight. Flooring rather than rounding the week count would slip
    // every week after it by one.
    expect(weekTypeOn('2026-10-19', TERM_START)).toBe('ODD');
    expect(weekTypeOn('2026-10-26', TERM_START)).toBe('EVEN');
    expect(weekTypeOn('2026-11-02', TERM_START)).toBe('ODD');
  });
});

describe('when nobody has said when term started', () => {
  it('falls back to ODD rather than inventing an alternation', () => {
    // The app's previous behaviour, kept on purpose. A guess that alternates is
    // wrong just as often and looks authoritative while being so.
    expect(weekTypeOn('2026-09-14', undefined)).toBe('ODD');
    expect(weekTypeOn('2026-09-21', '')).toBe('ODD');
  });
});

describe('reading it from settings', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('says so when there is no term calendar yet', async () => {
    await db.parentSettings.put({ id: 'active_settings' } as never);

    expect(await hasTermCalendar()).toBe(false);
    expect(await resolveWeekType('2026-09-14')).toBe('ODD');
  });

  it('uses the term start once it is set', async () => {
    await db.parentSettings.put({
      id: 'active_settings',
      termStartDate: TERM_START,
    } as never);

    expect(await hasTermCalendar()).toBe(true);
    expect(await resolveWeekType('2026-09-14')).toBe('EVEN');
    expect(await resolveWeekType('2026-09-21')).toBe('ODD');
  });
});

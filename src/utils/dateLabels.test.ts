import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { formatFriendlyDate, formatPastDate, formatShortDate } from './date';

/**
 * Three date formatters, each answering a different question, and picking the
 * wrong one is the single most repeated mistake in this codebase.
 *
 *   `formatFriendlyDate` answers "how soon?" - "Tomorrow", "Overdue by 11 days"
 *   `formatPastDate`     answers "how long ago?" - "Yesterday", "Tue 2 Sep"
 *   `formatShortDate`    answers "which date?" - "2 Sep", always
 *
 * The friendly one is the trap, because it returns a plausible-looking string
 * everywhere and a wrong one nearly everywhere. It has produced "due Overdue by
 * 11 days" on the task close sheet, "due Overdue by 12 days" on the evidence
 * rows, "for the week of Today" on the approval panel, and "Overdue by 4 days"
 * as the heading of a diary entry about a day that had already happened.
 *
 * These pin the behaviours, and then check the two places where the mistake
 * keeps recurring: after the word "due", and as a heading for something past.
 */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-07T12:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('what each formatter is for', () => {
  it('formatFriendlyDate answers how soon, which is why it is wrong for the past', () => {
    expect(formatFriendlyDate('2026-09-08')).toBe('Tomorrow');
    expect(formatFriendlyDate('2026-09-07')).toBe('Today');
    // The string that keeps escaping into places it makes no sense.
    expect(formatFriendlyDate('2026-08-27')).toBe('Overdue by 11 days');
  });

  it('formatPastDate answers how long ago, and never says overdue', () => {
    expect(formatPastDate('2026-09-07')).toBe('Today');
    expect(formatPastDate('2026-09-06')).toBe('Yesterday');
    expect(formatPastDate('2026-08-27')).not.toMatch(/overdue/i);
  });

  it('formatShortDate answers only which date, so it is safe anywhere', () => {
    // Matched rather than compared: en-GB abbreviates September as "Sept", and
    // which abbreviation ICU picks has changed between Node versions. What
    // matters is that it is a plain date and never a relative phrase.
    expect(formatShortDate('2026-09-07')).toMatch(/^7 Sept?$/);
    expect(formatShortDate('2026-08-27')).toBe('27 Aug');
    expect(formatShortDate('2026-09-07')).not.toMatch(/today|tomorrow|overdue/i);
  });
});

/**
 * The two shapes that have actually shipped broken, checked against the source
 * because no type can see them: a relative phrase reads as a plausible sentence
 * right up until the day it does not.
 */
describe('the places the wrong formatter keeps reaching', () => {
  const SOURCES = [
    'src/components/tasks/TaskCloseModal.tsx',
    'src/components/updates/EvidenceCheck.tsx',
    'src/components/record/RecordView.tsx',
    'src/components/parent/PlanApprovalPanel.tsx',
  ];

  it('never puts a "how soon" phrase after the word "due"', () => {
    for (const path of SOURCES) {
      const source = readFileSync(path, 'utf8');
      expect(source, `${path} renders "due {formatFriendlyDate(...)}"`).not.toMatch(
        /due\s*\{?'?\s*\}?\s*\{formatFriendlyDate/
      );
    }
  });

  it('does not head a record of something past with a deadline phrase', () => {
    const source = readFileSync('src/components/record/RecordView.tsx', 'utf8');
    /**
     * The call, not the name. The record is entirely about days that have
     * happened, so there is no correct use of the countdown formatter anywhere
     * in it - but the file explains in a comment why it must not be used, and
     * matching the bare word would fail on the explanation.
     */
    expect(source).not.toMatch(/formatFriendlyDate\s*\(/);
  });
});

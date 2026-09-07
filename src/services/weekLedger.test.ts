import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { Task, WeekPlanBaseline } from '../types';
import {
  markWeekReviewed,
  openWeeks,
  reopenWeek,
  weekRecord,
  writeOffWeek,
} from './weekLedger';
import { addDaysISO, parseISODate, startOfWeekISO } from '../utils/date';
import { calculateTotalXP } from './ragCalculator';

/**
 * Tejas committed the current week and left the one before it, because by the
 * time he came back to it there was nothing to be gained from finalising it.
 * That is a reasonable decision, and the app had nowhere to put it - the week
 * simply stayed unfinished, forever, indistinguishable from one he had
 * forgotten about.
 *
 * These pin down the two halves of the fix: a finished week has a standing that
 * says what became of it, and there are exactly two ways to close one, neither
 * of which is "leave it".
 */

/** A fixed Monday, so nothing here depends on the day the suite happens to run. */
const TODAY = '2026-09-09';
const THIS_WEEK = startOfWeekISO(TODAY);
const LAST_WEEK = addDaysISO(-7, parseISODate(THIS_WEEK));
const THREE_WEEKS_AGO = addDaysISO(-21, parseISODate(THIS_WEEK));

beforeEach(async () => {
  await emptyDatabase();
});

let seq = 0;
function task(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `task_${seq}`,
    subjectId: 'maths',
    title: `Task ${seq}`,
    dueDate: TODAY,
    priority: 'MEDIUM',
    completed: false,
    isHomework: true,
    xpValue: 50,
    estimatedHours: 1,
    bucket: 'THIS_WEEK',
    createdAt: Date.now(),
    ...overrides,
  } as Task;
}

function baseline(overrides: Partial<WeekPlanBaseline> = {}): WeekPlanBaseline {
  const weekStart = overrides.weekStart ?? LAST_WEEK;
  return {
    id: weekStart,
    weekStart,
    status: 'BASELINED',
    taskIds: [],
    hours: 0,
    approvedAt: Date.parse(weekStart),
    createdAt: Date.parse(weekStart),
    ...overrides,
  };
}

/** A check-in inside a week, which is enough to count as having used the app. */
async function checkInOn(date: string) {
  await db.checkIns.add({
    id: `ci_${date}`,
    date,
    mood: 'OK',
    energy: 3,
    createdAt: Date.parse(date),
  } as never);
}

describe('what became of a week', () => {
  it('calls a finished week that was never agreed abandoned', async () => {
    await checkInOn(LAST_WEEK);

    const record = await weekRecord(LAST_WEEK, TODAY);
    expect(record.standing).toBe('ABANDONED');
    expect(record.needsClosing).toBe(true);
  });

  it('calls a finished week that was agreed but never closed NEEDS_REVIEW', async () => {
    await db.planBaselines.add(baseline());

    const record = await weekRecord(LAST_WEEK, TODAY);
    expect(record.standing).toBe('NEEDS_REVIEW');
    expect(record.needsClosing).toBe(true);
  });

  it('leaves the week in progress alone', async () => {
    await db.planBaselines.add(baseline({ weekStart: THIS_WEEK }));

    const record = await weekRecord(THIS_WEEK, TODAY);
    expect(record.standing).toBe('RUNNING');
    expect(record.needsClosing).toBe(false);
  });

  it('does not ask about a week the app was never used in', async () => {
    // No baseline, no check-in, no completed work. Not a week anybody
    // abandoned - a week before they started.
    const record = await weekRecord(LAST_WEEK, TODAY);
    expect(record.hadActivity).toBe(false);
    expect(record.needsClosing).toBe(false);
  });

  it('counts work finished in the week as having used the app', async () => {
    await db.tasks.add(
      task({ completed: true, completedAt: Date.parse(`${LAST_WEEK}T12:00:00`) })
    );

    const record = await weekRecord(LAST_WEEK, TODAY);
    expect(record.hadActivity).toBe(true);
    expect(record.standing).toBe('ABANDONED');
  });
});

describe('closing a week', () => {
  it('stops an abandoned week asking once it is written off', async () => {
    await checkInOn(LAST_WEEK);
    await writeOffWeek(LAST_WEEK, 'Too late to be worth reconstructing');

    const record = await weekRecord(LAST_WEEK, TODAY);
    expect(record.standing).toBe('WRITTEN_OFF');
    expect(record.needsClosing).toBe(false);
  });

  it('creates the row a never-planned week never had', async () => {
    await checkInOn(LAST_WEEK);
    expect(await db.planBaselines.get(LAST_WEEK)).toBeUndefined();

    await writeOffWeek(LAST_WEEK, 'Skipped it');

    const row = await db.planBaselines.get(LAST_WEEK);
    expect(row?.writtenOffNote).toBe('Skipped it');
    // Honest about what it is: a week that was never agreed.
    expect(row?.status).toBe('DRAFT');
    expect(row?.taskIds).toEqual([]);
  });

  it('refuses to write a week off without a reason', async () => {
    await expect(writeOffWeek(LAST_WEEK, '   ')).rejects.toThrow(/why/i);
  });

  it('keeps the reason where a parent can read it', async () => {
    await writeOffWeek(LAST_WEEK, 'Half term, nothing was set');

    const record = await weekRecord(LAST_WEEK, TODAY);
    expect(record.baseline?.writtenOffNote).toBe('Half term, nothing was set');
  });

  it('records the write-off in the audit log', async () => {
    await writeOffWeek(LAST_WEEK, 'Skipped it');

    const rows = await db.auditLogs.toArray();
    expect(rows.some((row) => row.newValue?.includes('written off'))).toBe(true);
  });

  it('stops a run week asking once it is reviewed', async () => {
    await db.planBaselines.add(baseline());
    await markWeekReviewed(LAST_WEEK, '3 of 4 done');

    const record = await weekRecord(LAST_WEEK, TODAY);
    expect(record.standing).toBe('REVIEWED');
    expect(record.needsClosing).toBe(false);
  });

  it('lets a reviewed week supersede a write-off, because the later act wins', async () => {
    await writeOffWeek(LAST_WEEK, 'Not worth it');
    await markWeekReviewed(LAST_WEEK, 'Actually went through it');

    const record = await weekRecord(LAST_WEEK, TODAY);
    expect(record.standing).toBe('REVIEWED');
    expect(record.baseline?.writtenOffAt).toBeUndefined();
  });

  it('puts a week back on the list when it is reopened', async () => {
    await checkInOn(LAST_WEEK);
    await writeOffWeek(LAST_WEEK, 'Skipped it');
    await reopenWeek(LAST_WEEK);

    const record = await weekRecord(LAST_WEEK, TODAY);
    expect(record.standing).toBe('ABANDONED');
    expect(record.needsClosing).toBe(true);
  });
});

describe('the weeks still waiting on a decision', () => {
  it('finds a week that has no row anywhere', async () => {
    // The whole trick: an abandoned week has nothing in `planBaselines`, so
    // reading that table would find every week except the ones worth finding.
    await checkInOn(LAST_WEEK);

    const open = await openWeeks(4, TODAY);
    expect(open.map((w) => w.weekStart)).toEqual([LAST_WEEK]);
  });

  it('never includes the week in progress', async () => {
    await checkInOn(TODAY);

    const open = await openWeeks(4, TODAY);
    expect(open.map((w) => w.weekStart)).not.toContain(THIS_WEEK);
  });

  it('lists the most recent open week first', async () => {
    await checkInOn(LAST_WEEK);
    await checkInOn(THREE_WEEKS_AGO);

    const open = await openWeeks(4, TODAY);
    expect(open.map((w) => w.weekStart)).toEqual([LAST_WEEK, THREE_WEEKS_AGO]);
  });

  it('stops looking beyond the lookback, so the list can always be cleared', async () => {
    await checkInOn(addDaysISO(-70, parseISODate(THIS_WEEK)));

    expect(await openWeeks(4, TODAY)).toEqual([]);
  });

  it('is empty on a database nobody has used yet', async () => {
    expect(await openWeeks(4, TODAY)).toEqual([]);
  });

  it('drops a week as soon as it is closed', async () => {
    await checkInOn(LAST_WEEK);
    expect(await openWeeks(4, TODAY)).toHaveLength(1);

    await writeOffWeek(LAST_WEEK, 'Skipped it');
    expect(await openWeeks(4, TODAY)).toEqual([]);
  });

  it('names the action rather than the state, so a row can be acted on', async () => {
    await db.planBaselines.add(baseline());

    const [week] = await openWeeks(4, TODAY);
    expect(week.todo).toBe('Close this week');
    expect(week.because).toContain('nobody has looked back at it');
  });
});

/**
 * Closing a week is an administrative act. It must not move a single point.
 *
 * Worth pinning explicitly because `writeOffWeek` creates a `planBaselines` row
 * for a week that never had one, and the XP total walks that very table to
 * decide which weeks paid.
 */
describe('closing a week never touches the balance', () => {
  it('pays nothing extra for writing off a week that had work in it', async () => {
    await db.tasks.add(
      task({
        id: 'done_in_abandoned_week',
        completed: true,
        completedAt: Date.parse(`${LAST_WEEK}T12:00:00`),
      })
    );

    const before = (await calculateTotalXP()).totalXP;
    await writeOffWeek(LAST_WEEK, 'Too late to be worth reconstructing');
    const after = (await calculateTotalXP()).totalXP;

    expect(after).toBe(before);
  });

  it('pays nothing extra for marking a week reviewed', async () => {
    await db.tasks.add(
      task({
        id: 'done_in_reviewed_week',
        completed: true,
        completedAt: Date.parse(`${LAST_WEEK}T12:00:00`),
      })
    );

    const before = (await calculateTotalXP()).totalXP;
    await markWeekReviewed(LAST_WEEK, 'Went through it');
    const after = (await calculateTotalXP()).totalXP;

    expect(after).toBe(before);
  });
});

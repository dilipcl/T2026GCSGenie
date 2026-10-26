import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { Task, WeekPlanBaseline } from '../types';
import { readWeekDetail } from './weekDetail';
import { weekBurndown } from './weekBurndown';

/**
 * The week of 12 Oct 2026, burned down. A plan of three two-hour pieces: one
 * done on the Wednesday, one done the following Monday, one never. A one-hour
 * piece brought in by amendment on the Thursday. A three-hour piece finished on
 * the Friday that was on neither list.
 */

const MONDAY = '2026-10-12';
const at = (iso: string) => new Date(`${iso}T18:00:00`).getTime();

const task = (extra: Partial<Task>): Task => ({
  id: Math.random().toString(36),
  subjectId: 'maths',
  title: 'Homework',
  dueDate: MONDAY,
  priority: 'MEDIUM',
  isHomework: true,
  isRemediation: false,
  xpValue: 50,
  completed: false,
  createdAt: 0,
  estimatedHours: 2,
  ...extra,
});

const baseline = (extra: Partial<WeekPlanBaseline> = {}): WeekPlanBaseline => ({
  id: MONDAY,
  weekStart: MONDAY,
  status: 'BASELINED',
  taskIds: ['in-week', 'later', 'not-done'],
  hours: 6,
  createdAt: 0,
  ...extra,
});

const burndownOf = async (today = '2026-10-21') => weekBurndown(await readWeekDetail(MONDAY), today);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T12:00:00'));
  await emptyDatabase();
  await db.subjects.bulkPut(INITIAL_SUBJECTS);
  await db.tasks.bulkPut([
    task({ id: 'in-week', title: 'Sparx', completed: true, completedAt: at('2026-10-14') }),
    task({ id: 'later', title: 'Surds', completed: true, completedAt: at('2026-10-19') }),
    task({ id: 'not-done', title: 'Venn proofs' }),
    task({ id: 'amended', title: 'Storage rev', estimatedHours: 1 }),
    task({
      id: 'extra',
      title: 'Eng HW',
      estimatedHours: 3,
      completed: true,
      completedAt: at('2026-10-16'),
    }),
  ]);
  await db.planAmendments.put({
    id: 'a1',
    weekStart: MONDAY,
    addedTaskId: 'amended',
    addedTitle: 'Storage rev',
    hoursAdded: 1,
    at: at('2026-10-15'),
    by: 'STUDENT',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a finished week, burned down', () => {
  beforeEach(async () => {
    await db.planBaselines.put(baseline());
  });

  it('draws the plan falling evenly from what was committed to nothing by Sunday', async () => {
    const b = await burndownOf();
    expect(b.committedHours).toBe(6);
    expect(b.days.map((d) => d.idealRemaining)).toEqual([5.1, 4.3, 3.4, 2.6, 1.7, 0.9, 0]);
  });

  it('burns planned work on the day it closed, and rises on the day work was added', async () => {
    const b = await burndownOf();
    expect(b.days.map((d) => d.actualRemaining)).toEqual([6, 6, 4, 5, 5, 5, 5]);
    expect(b.days[3].arrived.map((i) => i.id)).toEqual(['amended']);
    expect(b.days[3].addedHours).toBe(1);
  });

  it('keeps unplanned work beside the plan rather than burning the plan with it', async () => {
    const b = await burndownOf();
    expect(b.unplannedHours).toBe(3);
    expect(b.days[4].unplannedHours).toBe(3);
    expect(b.days[4].closed).toEqual([
      expect.objectContaining({ kind: 'UNPLANNED', item: expect.objectContaining({ id: 'extra' }) }),
    ]);
    expect(b.days[4].actualRemaining).toBe(5);
  });

  it('does not burn a piece finished after the week, though the bonus counts it as kept', async () => {
    const b = await burndownOf();
    expect(b.deliveredHours).toBe(2);
    expect(b.remainingHours).toBe(5);
    expect(b.days.flatMap((d) => d.closed).map((c) => c.item.id)).not.toContain('later');
  });

  it('adds up to the same totals the chart is drawn from', async () => {
    const b = await burndownOf();
    expect(b.startRemaining + b.addedHours - b.deliveredHours).toBe(b.remainingHours);
  });

  it('starts lower when part of the plan was done before Monday', async () => {
    await db.tasks.update('not-done', { completed: true, completedAt: at('2026-10-10') });
    const b = await burndownOf();
    expect(b.doneBeforeHours).toBe(2);
    expect(b.startRemaining).toBe(4);
    expect(b.days[0].actualRemaining).toBe(4);
    expect(b.days[0].closed).toEqual([]);
  });
});

describe('a week still running', () => {
  it('stops the line at today instead of drawing a flat prediction', async () => {
    await db.planBaselines.put(baseline());
    const b = await burndownOf('2026-10-14');
    expect(b.days.map((d) => d.actualRemaining)).toEqual([6, 6, 4, undefined, undefined, undefined, undefined]);
    expect(b.days.map((d) => d.isFuture)).toEqual([false, false, false, true, true, true, true]);
    expect(b.remainingHours).toBe(4);
  });
});

describe('a week with no agreed plan', () => {
  it('has nothing to burn down, and still shows the work that was done', async () => {
    const b = await burndownOf();
    expect(b.hasPlan).toBe(false);
    expect(b.committedHours).toBe(0);
    // With no plan, everything finished inside the week was unplanned.
    expect(b.unplannedHours).toBe(5);
    expect(b.days[2].unplannedHours).toBe(2);
    expect(b.days[4].unplannedHours).toBe(3);
  });
});

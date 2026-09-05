import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import {
  WEEK_BONUS_FLOOR,
  XP_EXTRA_STORY,
  XP_WEEK_BONUS_MAX,
  weekExecution,
} from './weekExecution';
import { PlanBaselineStatus, Task } from '../types';

/**
 * A week that went badly forfeits its bonus. It never costs XP that was already
 * earned.
 *
 * That choice is the whole design. Clawing back banked XP punishes twice, and a
 * run of hard weeks would strip the rewards earned in the good ones - which is
 * how a motivation system turns into a spiral. Real sanctions still exist and
 * are a deliberate, visible, human decision; this is arithmetic, and arithmetic
 * should not be able to take anything away on its own.
 */

const WEEK = '2026-01-05';
const LONG_PAST = '2026-01-11';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    subjectId: 'maths',
    bucket: 'THIS_WEEK',
    title: id,
    dueDate: WEEK,
    priority: 'MEDIUM',
    isHomework: true,
    isRemediation: false,
    xpValue: 20,
    completed: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

async function baseline(taskIds: string[], status: PlanBaselineStatus = 'BASELINED') {
  await db.planBaselines.put({
    id: WEEK,
    weekStart: WEEK,
    status,
    taskIds,
    hours: 5,
    createdAt: Date.now(),
    submittedAt: Date.now(),
    approvedAt: status === 'BASELINED' ? Date.now() : undefined,
  });
}

/** Epoch ms for midday on a date inside the test week. */
const inWeek = (day: number) => Date.parse(`2026-01-0${day}T12:00:00`);

describe('a week that went badly', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('never returns a negative bonus', async () => {
    await db.tasks.bulkAdd([task('a'), task('b'), task('c'), task('d')]);
    await baseline(['a', 'b', 'c', 'd']);

    const execution = await weekExecution(WEEK);

    expect(execution.delivered).toBe(0);
    expect(execution.bonusXp).toBe(0);
    expect(execution.bonusXp).toBeGreaterThanOrEqual(0);
  });

  it('pays nothing below the floor rather than a consolation amount', async () => {
    // One of four delivered: 25% delivery, no evidence. Well under the floor.
    await db.tasks.bulkAdd([
      task('a', { completed: true, completedAt: inWeek(6) }),
      task('b'),
      task('c'),
      task('d'),
    ]);
    await baseline(['a', 'b', 'c', 'd']);

    const execution = await weekExecution(WEEK);

    expect(execution.deliveryRate).toBeCloseTo(0.25);
    expect(execution.score / 100).toBeLessThan(WEEK_BONUS_FLOOR);
    expect(execution.bonusXp).toBe(0);
  });
});

describe('a week that went well', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('pays a bonus scaled to what was actually delivered', async () => {
    await db.tasks.bulkAdd([
      task('a', { completed: true, completedAt: inWeek(6) }),
      task('b', { completed: true, completedAt: inWeek(7) }),
      task('c', { completed: true, completedAt: inWeek(8) }),
      task('d', { completed: true, completedAt: inWeek(9) }),
    ]);
    await baseline(['a', 'b', 'c', 'd']);

    const execution = await weekExecution(WEEK);

    expect(execution.deliveryRate).toBe(1);
    expect(execution.bonusXp).toBeGreaterThan(0);
    expect(execution.bonusXp).toBeLessThanOrEqual(XP_WEEK_BONUS_MAX);
  });

  it('rewards work pulled from the backlog on top of the commitment', async () => {
    await db.tasks.bulkAdd([
      task('a', { completed: true, completedAt: inWeek(6) }),
      task('extra1', { bucket: 'BACKLOG', completed: true, completedAt: inWeek(7) }),
      task('extra2', { bucket: 'BACKLOG', completed: true, completedAt: inWeek(8) }),
    ]);
    await baseline(['a']);

    const execution = await weekExecution(WEEK);

    expect(execution.extra).toBe(2);
    expect(execution.extraXp).toBe(2 * XP_EXTRA_STORY);
  });

  it('does not count work finished outside the week as extra', async () => {
    await db.tasks.bulkAdd([
      task('a', { completed: true, completedAt: inWeek(6) }),
      task('later', {
        bucket: 'BACKLOG',
        completed: true,
        completedAt: Date.parse('2026-02-01T12:00:00'),
      }),
    ]);
    await baseline(['a']);

    const execution = await weekExecution(WEEK);
    expect(execution.extra).toBe(0);
  });
});

describe('which weeks get paid at all', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('pays nothing for a week that was never agreed', async () => {
    await db.tasks.bulkAdd([
      task('a', { completed: true, completedAt: inWeek(6) }),
      task('b', { completed: true, completedAt: inWeek(7) }),
    ]);
    await baseline(['a', 'b'], 'DRAFT');

    const execution = await weekExecution(WEEK);

    // An unplanned week has no promise to have kept. Paying it anyway would make
    // finalising the plan the optional step it used to be.
    expect(execution.wasBaselined).toBe(false);
    expect(execution.bonusXp).toBe(0);
  });

  it('pays nothing for a week that is still running', async () => {
    const thisWeek = '2099-01-05';
    await db.tasks.bulkAdd([task('a', { completed: true, completedAt: Date.now() })]);
    await db.planBaselines.put({
      id: thisWeek,
      weekStart: thisWeek,
      status: 'BASELINED',
      taskIds: ['a'],
      hours: 2,
      createdAt: Date.now(),
      approvedAt: Date.now(),
    });

    const execution = await weekExecution(thisWeek);

    expect(execution.isClosed).toBe(false);
    expect(execution.bonusXp).toBe(0);
  });

  it('reports a finished week as closed', async () => {
    await baseline([]);
    const execution = await weekExecution(WEEK);

    expect(execution.isClosed).toBe(true);
    expect(execution.weekEnd).toBe(LONG_PAST);
  });
});

describe('evidence counts as well as delivery', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('holds back part of the bonus from a week nobody recorded', async () => {
    await db.tasks.bulkAdd([
      task('a', { completed: true, completedAt: inWeek(6) }),
      task('b', { completed: true, completedAt: inWeek(7) }),
    ]);
    await baseline(['a', 'b']);

    const execution = await weekExecution(WEEK);

    // Everything delivered but nothing checked in: the cheapest route to a
    // perfect delivery score is to stop recording anything, so it must not be
    // worth full marks.
    expect(execution.deliveryRate).toBe(1);
    expect(execution.evidenceRate).toBe(0);
    expect(execution.score).toBeLessThan(100);
  });
});

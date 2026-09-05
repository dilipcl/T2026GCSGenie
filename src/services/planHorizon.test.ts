import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { Task } from '../types';
import { loadWeekCommitment } from './planService';
import {
  horizonWeekStart,
  loadBaseline,
  readFinalisationState,
  readinessChecks,
  submitForApproval,
  weekStartISO,
} from './planBaselineService';

/**
 * Planning the week that has not started yet.
 *
 * The planner could only finalise the week it was inside, so from Saturday the
 * only week on offer was the one about to end - Tejas reported seeing last
 * week's plan with no way to set up the next one. These fix the boundary: the
 * horizon picks the week, the checks read the matching column, and the two
 * weeks keep separate baselines.
 */

// A Saturday. The old behaviour would offer the week ending tomorrow.
const SATURDAY = '2026-09-05';
const THIS_MONDAY = '2026-08-31';
const NEXT_MONDAY = '2026-09-07';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

let seq = 0;
function makeTask(over: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `task_${seq}`,
    subjectId: 'maths',
    bucket: 'THIS_WEEK',
    title: `Task ${seq}`,
    dueDate: SATURDAY,
    priority: 'MEDIUM',
    isHomework: true,
    isRemediation: false,
    xpValue: 50,
    completed: false,
    createdAt: Date.now(),
    estimatedHours: 1,
    linkedGoalId: 'goal_1',
    ...over,
  };
}

beforeEach(async () => {
  await emptyDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('horizonWeekStart', () => {
  it('resolves this week to the Monday just gone', () => {
    freezeAt(SATURDAY);
    expect(horizonWeekStart('THIS_WEEK')).toBe(THIS_MONDAY);
  });

  it('resolves next week to the Monday coming', () => {
    freezeAt(SATURDAY);
    expect(horizonWeekStart('NEXT_WEEK')).toBe(NEXT_MONDAY);
  });

  it('keeps the two horizons exactly a week apart', () => {
    freezeAt('2026-09-09');
    const a = new Date(`${horizonWeekStart('THIS_WEEK')}T00:00:00`).getTime();
    const b = new Date(`${horizonWeekStart('NEXT_WEEK')}T00:00:00`).getTime();
    expect((b - a) / 86400000).toBe(7);
  });

  it('agrees with weekStartISO for the current week', () => {
    freezeAt(SATURDAY);
    expect(horizonWeekStart('THIS_WEEK')).toBe(weekStartISO());
  });
});

describe('readinessChecks across horizons', () => {
  it('reads this week’s column by default', async () => {
    freezeAt(SATURDAY);
    await db.tasks.add(makeTask({ bucket: 'THIS_WEEK' }));

    const checks = readinessChecks({
      commitment: await loadWeekCommitment(),
      safeStudyHours: 10,
      milestones: [],
      allTasks: await db.tasks.toArray(),
    });

    expect(checks.find((c) => c.id === 'HAS_COMMITMENT')?.ok).toBe(true);
  });

  it('finds next week empty when everything sits in this week', async () => {
    freezeAt(SATURDAY);
    await db.tasks.add(makeTask({ bucket: 'THIS_WEEK' }));

    const checks = readinessChecks({
      horizon: 'NEXT_WEEK',
      commitment: await loadWeekCommitment(),
      safeStudyHours: 10,
      milestones: [],
      allTasks: await db.tasks.toArray(),
    });

    expect(checks.find((c) => c.id === 'HAS_COMMITMENT')?.ok).toBe(false);
  });

  it('passes next week once work is placed in it', async () => {
    freezeAt(SATURDAY);
    await db.tasks.add(makeTask({ bucket: 'NEXT_WEEK', dueDate: '2026-09-10' }));

    const checks = readinessChecks({
      horizon: 'NEXT_WEEK',
      commitment: await loadWeekCommitment(),
      safeStudyHours: 10,
      milestones: [],
      allTasks: await db.tasks.toArray(),
    });

    expect(checks.find((c) => c.id === 'HAS_COMMITMENT')?.ok).toBe(true);
  });

  it('spots a next-week task with no estimate', async () => {
    freezeAt(SATURDAY);
    await db.tasks.add(
      makeTask({ bucket: 'NEXT_WEEK', dueDate: '2026-09-10', estimatedHours: undefined })
    );

    const checks = readinessChecks({
      horizon: 'NEXT_WEEK',
      commitment: await loadWeekCommitment(),
      safeStudyHours: 10,
      milestones: [],
      allTasks: await db.tasks.toArray(),
    });

    expect(checks.find((c) => c.id === 'ESTIMATES_SET')?.ok).toBe(false);
  });
});

describe('submitting each week separately', () => {
  it('writes next week’s baseline against next Monday', async () => {
    freezeAt(SATURDAY);
    await db.tasks.add(makeTask({ bucket: 'NEXT_WEEK', dueDate: '2026-09-10' }));

    await submitForApproval(
      await loadWeekCommitment(),
      undefined,
      horizonWeekStart('NEXT_WEEK'),
      'NEXT_WEEK'
    );

    expect((await loadBaseline(NEXT_MONDAY))?.status).toBe('AWAITING_APPROVAL');
    expect(await loadBaseline(THIS_MONDAY)).toBeUndefined();
  });

  it('captures the next-week column, not this week’s', async () => {
    freezeAt(SATURDAY);
    await db.tasks.bulkAdd([
      makeTask({ id: 'now', bucket: 'THIS_WEEK' }),
      makeTask({ id: 'later', bucket: 'NEXT_WEEK', dueDate: '2026-09-10' }),
    ]);

    await submitForApproval(
      await loadWeekCommitment(),
      undefined,
      horizonWeekStart('NEXT_WEEK'),
      'NEXT_WEEK'
    );

    expect((await loadBaseline(NEXT_MONDAY))?.taskIds).toEqual(['later']);
  });

  it('lets both weeks be agreed at once without collision', async () => {
    freezeAt(SATURDAY);
    await db.tasks.bulkAdd([
      makeTask({ id: 'now', bucket: 'THIS_WEEK' }),
      makeTask({ id: 'later', bucket: 'NEXT_WEEK', dueDate: '2026-09-10' }),
    ]);

    const commitment = await loadWeekCommitment();
    await submitForApproval(commitment, undefined, THIS_MONDAY, 'THIS_WEEK');
    await submitForApproval(commitment, undefined, NEXT_MONDAY, 'NEXT_WEEK');

    expect((await loadBaseline(THIS_MONDAY))?.taskIds).toEqual(['now']);
    expect((await loadBaseline(NEXT_MONDAY))?.taskIds).toEqual(['later']);
  });
});

describe('readFinalisationState', () => {
  it('reports the week it is talking about', async () => {
    freezeAt(SATURDAY);
    const state = await readFinalisationState('NEXT_WEEK');
    expect(state.weekStart).toBe(NEXT_MONDAY);
  });

  it('does not read this week’s baseline when asked about next week', async () => {
    freezeAt(SATURDAY);
    await db.tasks.add(makeTask({ bucket: 'THIS_WEEK' }));
    await submitForApproval(await loadWeekCommitment(), undefined, THIS_MONDAY, 'THIS_WEEK');

    const nextWeek = await readFinalisationState('NEXT_WEEK');

    expect(nextWeek.status).toBe('DRAFT');
    expect(nextWeek.baseline).toBeUndefined();
  });

  it('still defaults to this week when nothing is passed', async () => {
    freezeAt(SATURDAY);
    expect((await readFinalisationState()).weekStart).toBe(THIS_MONDAY);
  });
});

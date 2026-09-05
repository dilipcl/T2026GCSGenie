import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { goalWorkload, goalsMissingWork } from './goalWorkload';
import { Goal, GoalStatus, Task } from '../types';

/**
 * Goals and tasks could always be linked, but only ever in one direction: a
 * task named its goal, and nothing asked a goal what work it had. A goal with
 * nothing behind it therefore looked exactly like a goal going well - target
 * date, weekly hours, and not one piece of work ever aimed at it.
 */

let seq = 0;

async function goal(id: string, status: GoalStatus = 'APPROVED_LOCKED'): Promise<Goal> {
  const row = {
    id,
    title: `Goal ${id}`,
    category: 'ACADEMIC_GRADE_9',
    smartSpecific: '',
    smartMeasurable: '',
    smartAchievable: '',
    smartRealistic: '',
    smartTimeBound: '',
    status,
    ragStatus: 'GREEN',
    weeklyHoursRequired: 2,
    createdAt: Date.now(),
  } as Goal;
  await db.goals.add(row);
  return row;
}

async function task(overrides: Partial<Task> = {}): Promise<void> {
  seq += 1;
  await db.tasks.add({
    id: `task_${seq}`,
    subjectId: 'maths',
    title: `Task ${seq}`,
    dueDate: '2026-09-10',
    priority: 'MEDIUM',
    isHomework: true,
    isRemediation: false,
    xpValue: 20,
    completed: false,
    createdAt: Date.now(),
    ...overrides,
  } as Task);
}

beforeEach(async () => {
  await emptyDatabase();
});

describe('counting the work aimed at a goal', () => {
  it('counts linked tasks by what state they are in', async () => {
    await goal('g1');
    await task({ linkedGoalId: 'g1', bucket: 'THIS_WEEK' });
    await task({ linkedGoalId: 'g1', bucket: 'BACKLOG' });
    await task({ linkedGoalId: 'g1', bucket: 'THIS_WEEK', completed: true });

    const [row] = await goalWorkload();

    expect(row.total).toBe(3);
    expect(row.open).toBe(2);
    expect(row.done).toBe(1);
    // Only open work in the current week is actually moving.
    expect(row.committed).toBe(1);
  });

  it('ignores work aimed at a different goal', async () => {
    await goal('g1');
    await goal('g2');
    await task({ linkedGoalId: 'g2' });

    const rows = await goalWorkload();

    expect(rows.find((r) => r.goal.id === 'g1')?.total).toBe(0);
    expect(rows.find((r) => r.goal.id === 'g2')?.total).toBe(1);
  });

  it('ignores work linked to nothing at all', async () => {
    await goal('g1');
    await task({ linkedGoalId: undefined });

    expect((await goalWorkload())[0].total).toBe(0);
  });

  it('reports every goal, not only the troubled ones', async () => {
    await goal('g1');
    await goal('g2');
    await task({ linkedGoalId: 'g1', bucket: 'THIS_WEEK' });

    // "6 tasks, 2 this week" is how a goal being worked is told from one being
    // watched, so a healthy goal still needs its count.
    expect(await goalWorkload()).toHaveLength(2);
  });
});

describe('goals that need work aiming at them', () => {
  it('flags a live goal with nothing behind it', async () => {
    await goal('g1');

    const [row] = await goalWorkload();
    expect(row.hasNoWork).toBe(true);
  });

  it('separates "no work" from "none of it committed"', async () => {
    await goal('empty');
    await goal('parked');
    await task({ linkedGoalId: 'parked', bucket: 'BACKLOG' });

    const rows = await goalWorkload();
    const empty = rows.find((r) => r.goal.id === 'empty')!;
    const parked = rows.find((r) => r.goal.id === 'parked')!;

    // Different problems: one needs breaking down, the other needs pulling in.
    expect(empty.hasNoWork).toBe(true);
    expect(empty.hasNoCommittedWork).toBe(false);
    expect(parked.hasNoWork).toBe(false);
    expect(parked.hasNoCommittedWork).toBe(true);
  });

  it('says nothing about a goal that is finished', async () => {
    await goal('done', 'COMPLETED');

    const [row] = await goalWorkload();

    // A completed goal needs no more work aimed at it, and nagging about one is
    // how a warning list stops being read.
    expect(row.hasNoWork).toBe(false);
  });

  it('says nothing about a goal that was deferred', async () => {
    await goal('later', 'DEFERRED');
    expect((await goalWorkload())[0].hasNoWork).toBe(false);
  });

  it('stays quiet about a goal with work in the week', async () => {
    await goal('g1');
    await task({ linkedGoalId: 'g1', bucket: 'THIS_WEEK' });

    const [row] = await goalWorkload();
    expect(row.hasNoWork).toBe(false);
    expect(row.hasNoCommittedWork).toBe(false);
  });

  it('puts empty goals ahead of merely parked ones', async () => {
    await goal('parked');
    await goal('empty');
    await task({ linkedGoalId: 'parked', bucket: 'BACKLOG' });

    const missing = goalsMissingWork(await goalWorkload());

    expect(missing.map((r) => r.goal.id)).toEqual(['empty', 'parked']);
  });

  it('returns nothing when every live goal is being worked', async () => {
    await goal('g1');
    await task({ linkedGoalId: 'g1', bucket: 'THIS_WEEK' });

    expect(goalsMissingWork(await goalWorkload())).toHaveLength(0);
  });
});

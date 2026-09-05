import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { Task } from '../types';
import { loadOutstanding } from './outstandingService';
import { todayISO, addDaysISO } from '../utils/date';

/**
 * The Updates tab said "nothing pending" while the week was unfinalised, work
 * was overdue and a reward sat unapproved. These pin down the opposite: every
 * source appears, each row knows where it is done, and the list is quiet only
 * when there is genuinely nothing to do.
 */

beforeEach(async () => {
  await emptyDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

let seq = 0;
function task(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `task_${seq}`,
    subjectId: 'maths',
    title: `Task ${seq}`,
    dueDate: todayISO(),
    priority: 'MEDIUM',
    completed: false,
    isHomework: true,
    xpValue: 50,
    estimatedHours: 1,
    bucket: 'THIS_WEEK',
    ...overrides,
  } as Task;
}

/** Today's check-in, so the check-in row drops out of tests about other things. */
async function checkInDone() {
  await db.checkIns.add({
    id: 'ci_today',
    date: todayISO(),
    timestamp: Date.now(),
  } as never);
}

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe('loadOutstanding — student', () => {
  it('asks for the check-in when none has been done today', async () => {
    const items = await loadOutstanding('STUDENT');
    expect(ids(items)).toContain('checkin:today');
  });

  it('drops the check-in row once today’s check-in exists', async () => {
    await checkInDone();
    const items = await loadOutstanding('STUDENT');
    expect(ids(items)).not.toContain('checkin:today');
  });

  it('surfaces overdue work with the titles named', async () => {
    await checkInDone();
    await db.tasks.bulkAdd([
      task({ title: 'Venn diagrams', dueDate: addDaysISO(-3) }),
      task({ title: 'Energy questions', dueDate: addDaysISO(-1) }),
    ]);

    const items = await loadOutstanding('STUDENT');
    const overdue = items.find((i) => i.id === 'tasks:overdue');

    expect(overdue).toBeDefined();
    expect(overdue?.count).toBe(2);
    expect(overdue?.detail).toContain('Venn diagrams');
    expect(overdue?.tab).toBe('TASKS');
  });

  it('separates work due today from work already overdue', async () => {
    await checkInDone();
    await db.tasks.bulkAdd([
      task({ dueDate: addDaysISO(-1) }),
      task({ dueDate: todayISO() }),
    ]);

    const items = await loadOutstanding('STUDENT');
    expect(ids(items)).toContain('tasks:overdue');
    expect(ids(items)).toContain('tasks:today');
  });

  it('ignores completed work entirely', async () => {
    await checkInDone();
    await db.tasks.add(task({ dueDate: addDaysISO(-5), completed: true }));

    const items = await loadOutstanding('STUDENT');
    expect(ids(items)).not.toContain('tasks:overdue');
  });

  it('lists active fix-up quests and points at Fix Ups', async () => {
    await checkInDone();
    await db.remediations.add({
      id: 'rem_1',
      subjectId: 'maths',
      sourceDoc: 'yr9 maths paper',
      diagnosticError: 'Independence proofs',
      taskTitle: 'Venn diagram probability proofs',
      taskInstructions: 'Redo Q12-14',
      xpReward: 200,
      isCompleted: false,
    } as never);

    const items = await loadOutstanding('STUDENT');
    const quest = items.find((i) => i.id === 'remediations:active');

    expect(quest?.tab).toBe('REMEDIATIONS');
    expect(quest?.detail).toContain('Venn diagram probability proofs');
  });

  it('puts overdue work above everything less urgent', async () => {
    await db.tasks.add(task({ dueDate: addDaysISO(-2) }));
    const items = await loadOutstanding('STUDENT');
    expect(items[0].id).toBe('tasks:overdue');
  });

  it('never shows a student something only a parent can do', async () => {
    await db.redemptions.add({
      id: 'red_1',
      rewardId: 'rw_1',
      rewardTitle: 'Weekend film',
      costXP: 50,
      requestedAt: Date.now(),
      status: 'PENDING',
    } as never);

    const items = await loadOutstanding('STUDENT');
    expect(ids(items)).not.toContain('rewards:pending');
  });

  it('gives every row somewhere to go', async () => {
    await db.tasks.add(task({ dueDate: addDaysISO(-1) }));
    const items = await loadOutstanding('STUDENT');

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.tab).toBeTruthy();
      expect(item.action).toBeTruthy();
    }
  });
});

describe('loadOutstanding — parent', () => {
  it('surfaces a reward request waiting on a decision', async () => {
    await db.redemptions.add({
      id: 'red_1',
      rewardId: 'rw_1',
      rewardTitle: 'Weekend film',
      costXP: 50,
      requestedAt: Date.now(),
      status: 'PENDING',
    } as never);

    const items = await loadOutstanding('PARENT');
    const reward = items.find((i) => i.id === 'rewards:pending');

    expect(reward?.tab).toBe('REWARDS');
    expect(reward?.detail).toContain('Weekend film');
  });

  it('ignores a request that has already been decided', async () => {
    await db.redemptions.add({
      id: 'red_1',
      rewardId: 'rw_1',
      rewardTitle: 'Weekend film',
      costXP: 50,
      requestedAt: Date.now(),
      status: 'APPROVED',
    } as never);

    const items = await loadOutstanding('PARENT');
    expect(ids(items)).not.toContain('rewards:pending');
  });

  it('surfaces a goal still waiting to be agreed', async () => {
    await db.goals.add({
      id: 'goal_1',
      title: 'Grade 9 in Maths',
      category: 'ACADEMIC',
      status: 'PENDING_DISCUSSION',
      weeklyHours: 4,
    } as never);

    const items = await loadOutstanding('PARENT');
    expect(items.find((i) => i.id === 'goals:pending')?.tab).toBe('GOALS');
  });

  it('never shows a parent the student’s own homework', async () => {
    await db.tasks.add(task({ dueDate: addDaysISO(-1) }));
    const items = await loadOutstanding('PARENT');
    expect(ids(items)).not.toContain('tasks:overdue');
  });
});

describe('loadOutstanding — resilience', () => {
  it('returns the other rows when one source throws', async () => {
    await db.tasks.add(task({ dueDate: addDaysISO(-1) }));
    vi.spyOn(db.redemptions, 'toArray').mockRejectedValue(new Error('table unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const items = await loadOutstanding('STUDENT');

    expect(ids(items)).toContain('tasks:overdue');
  });

  it('is empty when there is genuinely nothing to do', async () => {
    await checkInDone();
    // A week with a committed, estimated, on-time task and no key dates has no
    // blocking steps left, so the plan contributes a single "send it" row.
    const items = await loadOutstanding('STUDENT');
    const nonPlan = items.filter((i) => !i.id.startsWith('plan:'));
    expect(nonPlan).toEqual([]);
  });
});

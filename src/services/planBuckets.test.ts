import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { resetDatabase } from '../test/harness';
import { Task } from '../types';
import {
  hasEstimate,
  inferBucket,
  isKnownBucket,
  loadWeekCommitment,
  moveTaskToBucket,
  taskHours,
} from './planService';
import { addDaysISO } from '../utils/date';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

const TUESDAY = '2026-09-01';

let seq = 0;
function makeTask(over: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `task_${seq}`,
    subjectId: 'maths',
    title: `Task ${seq}`,
    dueDate: TUESDAY,
    priority: 'MEDIUM',
    isHomework: true,
    isRemediation: false,
    xpValue: 50,
    completed: false,
    createdAt: Date.now(),
    ...over,
  };
}

beforeEach(async () => {
  await resetDatabase();
  await db.tasks.clear();
  seq = 0;
  freezeAt(TUESDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('where an unfiled task lands', () => {
  it('puts work due inside the week into the current sprint', () => {
    expect(inferBucket(makeTask({ dueDate: addDaysISO(3) }))).toBe('THIS_WEEK');
  });

  it('puts the following week into its own sprint', () => {
    // The whole point of the split: "next week" is the one you can actually
    // plan into, and it used to disappear into a vague month-long pile.
    expect(inferBucket(makeTask({ dueDate: addDaysISO(10) }))).toBe('NEXT_WEEK');
  });

  it('treats anything dated beyond that as future, not backlog', () => {
    expect(inferBucket(makeTask({ dueDate: addDaysISO(40) }))).toBe('FUTURE');
  });

  it('files a date so far out that it was never a schedule as backlog', () => {
    expect(inferBucket(makeTask({ dueDate: addDaysISO(200) }))).toBe('BACKLOG');
  });

  it('respects an explicit bucket over the due date', () => {
    // A deliberate choice must never be overwritten by arithmetic.
    expect(inferBucket(makeTask({ bucket: 'BACKLOG', dueDate: addDaysISO(1) }))).toBe('BACKLOG');
  });

  it('treats overdue work as this week, because it effectively is', () => {
    expect(inferBucket(makeTask({ dueDate: addDaysISO(-5) }))).toBe('THIS_WEEK');
  });
});

describe('the four columns', () => {
  it('sorts every task into exactly one of them', async () => {
    await db.tasks.bulkAdd([
      makeTask({ dueDate: addDaysISO(2) }),
      makeTask({ dueDate: addDaysISO(10) }),
      makeTask({ dueDate: addDaysISO(40) }),
      makeTask({ dueDate: addDaysISO(200) }),
    ]);

    const { columns } = await loadWeekCommitment();
    expect(columns.THIS_WEEK).toHaveLength(1);
    expect(columns.NEXT_WEEK).toHaveLength(1);
    expect(columns.FUTURE).toHaveLength(1);
    expect(columns.BACKLOG).toHaveLength(1);
  });

  it('counts only the current sprint as committed', async () => {
    await db.tasks.bulkAdd([
      makeTask({ dueDate: addDaysISO(2), estimatedHours: 2 }),
      makeTask({ dueDate: addDaysISO(10), estimatedHours: 5 }),
    ]);

    const commitment = await loadWeekCommitment();
    // Next week's sprint is planned, not promised, so it must not weigh on
    // this week's load or any nudge derived from it.
    expect(commitment.committedCount).toBe(1);
    expect(commitment.committedHours).toBe(2);
  });
});

describe('moving between sprints', () => {
  it('pulls a far-off due date back when committing to this week', async () => {
    const task = makeTask({ dueDate: addDaysISO(40) });
    await db.tasks.add(task);
    await moveTaskToBucket(task, 'THIS_WEEK');

    const stored = await db.tasks.get(task.id);
    // Promising something this week while it still says "due in October" is
    // the contradiction that makes the whole list untrustworthy.
    expect(stored?.dueDate).toBe(addDaysISO(7));
    expect(stored?.committedAt).toBeTypeOf('number');
  });

  it('pulls it back to a fortnight when committing to next week', async () => {
    const task = makeTask({ dueDate: addDaysISO(90) });
    await db.tasks.add(task);
    await moveTaskToBucket(task, 'NEXT_WEEK');

    const stored = await db.tasks.get(task.id);
    expect(stored?.dueDate).toBe(addDaysISO(14));
  });

  it('leaves a date alone when it already fits the sprint', async () => {
    const task = makeTask({ dueDate: addDaysISO(10) });
    await db.tasks.add(task);
    await moveTaskToBucket(task, 'NEXT_WEEK');

    expect((await db.tasks.get(task.id))?.dueDate).toBe(addDaysISO(10));
  });

  it('drops the commitment stamp on the way out of this week', async () => {
    const task = makeTask({ bucket: 'THIS_WEEK', committedAt: Date.now() });
    await db.tasks.add(task);
    await moveTaskToBucket(task, 'BACKLOG');

    expect((await db.tasks.get(task.id))?.committedAt).toBeUndefined();
  });

  it('records the move, and the reason when there is one', async () => {
    const task = makeTask({ bucket: 'THIS_WEEK' });
    await db.tasks.add(task);
    await moveTaskToBucket(task, 'NEXT_WEEK', 'Ran out of time');

    const rows = await db.auditLogs.toArray();
    const row = rows.find((r) => r.entityId === task.id);
    expect(row?.newValue).toContain('Next week');
    expect(row?.newValue).toContain('Ran out of time');
  });
});

describe('a bucket written by another version', () => {
  /**
   * The database syncs. A second device still on the previous build writes
   * `LATER` into a shared table long after this one has upgraded, so migrating
   * on open is not enough - the row arrives afterwards, naming a column that
   * does not exist. This crashed the entire planner in production.
   */
  it('recognises only the four that exist', () => {
    expect(isKnownBucket('THIS_WEEK')).toBe(true);
    expect(isKnownBucket('BACKLOG')).toBe(true);
    expect(isKnownBucket('LATER')).toBe(false);
    expect(isKnownBucket('NEXT_UP')).toBe(false);
    expect(isKnownBucket(undefined)).toBe(false);
    expect(isKnownBucket(42)).toBe(false);
  });

  it('falls back to the due date rather than trusting the stored name', () => {
    const legacy = { ...makeTask({ dueDate: addDaysISO(2) }), bucket: 'LATER' } as unknown as Task;
    expect(inferBucket(legacy)).toBe('THIS_WEEK');
  });

  it('does not crash the planner', async () => {
    // `columns[bucket].push(task)` on an undefined column took down the whole
    // screen. One unrecognised string must never cost the planner.
    await db.tasks.bulkAdd([
      { ...makeTask({ dueDate: addDaysISO(2) }), bucket: 'LATER' } as unknown as Task,
      { ...makeTask({ dueDate: addDaysISO(40) }), bucket: 'NEXT_UP' } as unknown as Task,
      makeTask({ dueDate: addDaysISO(1), bucket: 'THIS_WEEK' }),
    ]);

    const { columns, committedCount } = await loadWeekCommitment();
    // The legacy row due in two days lands where its date says, not in a void.
    expect(committedCount).toBe(2);
    expect(columns.FUTURE).toHaveLength(1);
  });

  it('files every task somewhere, whatever it says', async () => {
    await db.tasks.bulkAdd([
      { ...makeTask(), bucket: 'ATLANTIS' } as unknown as Task,
      { ...makeTask(), bucket: '' } as unknown as Task,
    ]);

    const { columns } = await loadWeekCommitment();
    const total =
      columns.THIS_WEEK.length +
      columns.NEXT_WEEK.length +
      columns.FUTURE.length +
      columns.BACKLOG.length;
    expect(total).toBe(2);
  });
});

/**
 * "Next week" is a relative label written at a moment in time, and nothing ever
 * rewrote it. Work planned on a Saturday for the week ahead was still sitting
 * in the Next week column on the Monday that week began, with This week reading
 * as empty - and because `HAS_COMMITMENT` blocks submission, the week could not
 * be sent for approval at all and stayed a draft indefinitely.
 */
describe('next week becomes this week when it arrives', () => {
  it('reads work promised for the week we are now in as committed', () => {
    // Planned on the Saturday for the week beginning Monday 7 Sept.
    freezeAt('2026-09-09');
    const task = makeTask({ bucket: 'NEXT_WEEK', dueDate: '2026-09-11' });

    expect(inferBucket(task)).toBe('THIS_WEEK');
  });

  it('leaves work still genuinely a week out where it is', () => {
    freezeAt('2026-09-09');
    const task = makeTask({ bucket: 'NEXT_WEEK', dueDate: '2026-09-16' });

    expect(inferBucket(task)).toBe('NEXT_WEEK');
  });

  it('resolves against the Monday week, not a rolling seven days', () => {
    // Wednesday 9 Sept. Next Monday is 6 days away - inside a rolling week, and
    // firmly in the week after this one. Two definitions of "this week" is a
    // mistake this codebase has made before; see weekWindow.
    freezeAt('2026-09-09');
    const task = makeTask({ bucket: 'NEXT_WEEK', dueDate: '2026-09-14' });

    expect(inferBucket(task)).toBe('NEXT_WEEK');
  });

  it('does not sweep in work whose promised week has already gone', () => {
    // Overdue next-week work would both flood the committed column and trip the
    // "nothing overdue" gate, blocking the week again.
    freezeAt('2026-09-09');
    const task = makeTask({ bucket: 'NEXT_WEEK', dueDate: '2026-08-28' });

    expect(inferBucket(task)).toBe('NEXT_WEEK');
  });

  it('leaves the other stored buckets alone', () => {
    freezeAt('2026-09-09');
    const soon = { dueDate: '2026-09-11' };

    expect(inferBucket(makeTask({ bucket: 'BACKLOG', ...soon }))).toBe('BACKLOG');
    expect(inferBucket(makeTask({ bucket: 'FUTURE', ...soon }))).toBe('FUTURE');
    expect(inferBucket(makeTask({ bucket: 'THIS_WEEK', ...soon }))).toBe('THIS_WEEK');
  });

  it('unblocks the week it used to strand', async () => {
    freezeAt('2026-09-09');
    await db.tasks.add(makeTask({ bucket: 'NEXT_WEEK', dueDate: '2026-09-11' }));

    const commitment = await loadWeekCommitment();

    // The whole symptom: This week read as empty while the work sat one column
    // over, and the readiness checklist refused to let the week be agreed.
    expect(commitment.columns.THIS_WEEK).toHaveLength(1);
    expect(commitment.columns.NEXT_WEEK).toHaveLength(0);
    expect(commitment.committedCount).toBe(1);
  });

  it('still lets the work be pulled across explicitly', async () => {
    freezeAt('2026-09-09');
    const task = makeTask({ bucket: 'NEXT_WEEK', dueDate: '2026-09-11' });
    await db.tasks.add(task);

    // It already reads as committed, but the stored value should still settle
    // when somebody moves it, rather than the move being swallowed as a no-op.
    await moveTaskToBucket(task, 'THIS_WEEK');

    expect((await db.tasks.get(task.id))?.bucket).toBe('THIS_WEEK');
  });
});

/**
 * `taskHours` substitutes a priority default so a week's load always adds up.
 * That is right for a total and wrong for a question: the plan board rendered
 * an unestimated MEDIUM task as "1h", indistinguishable from a real estimate,
 * while the readiness checklist blocked the week over that very task.
 */
describe('telling a real estimate from a default', () => {
  it('still counts hours for work nobody has estimated', () => {
    expect(taskHours(makeTask({ priority: 'MEDIUM' }))).toBe(1);
    expect(taskHours(makeTask({ priority: 'HIGH' }))).toBe(1.5);
  });

  it('but says plainly that there is no estimate behind them', () => {
    expect(hasEstimate(makeTask({ priority: 'MEDIUM' }))).toBe(false);
    expect(hasEstimate(makeTask({ estimatedHours: 0 }))).toBe(false);
    expect(hasEstimate(makeTask({ estimatedHours: undefined }))).toBe(false);
  });

  it('recognises one that has been set', () => {
    const task = makeTask({ estimatedHours: 2.5 });
    expect(hasEstimate(task)).toBe(true);
    expect(taskHours(task)).toBe(2.5);
  });
});

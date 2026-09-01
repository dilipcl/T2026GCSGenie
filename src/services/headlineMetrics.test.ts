import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { resetDatabase } from '../test/harness';
import { Task } from '../types';
import { Headline, readHeadlines } from './headlineMetrics';
import { saveActivity, confirmAttendance } from './activityPlanService';
import { logSanction } from './sanctionService';
import { submitForApproval, approveBaseline } from './planBaselineService';
import { loadWeekCommitment } from './planService';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

// Week of Mon 2026-08-31.
const MONDAY = '2026-08-31';
const WEDNESDAY = '2026-09-02';
const FRIDAY = '2026-09-04';

let seq = 0;
function makeTask(over: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `task_${seq}`,
    subjectId: 'maths',
    bucket: 'THIS_WEEK',
    title: `Task ${seq}`,
    dueDate: FRIDAY,
    priority: 'MEDIUM',
    isHomework: true,
    isRemediation: false,
    xpValue: 50,
    completed: false,
    createdAt: Date.now(),
    estimatedHours: 1,
    ...over,
  };
}

const idsOf = (rows: Headline[]) => rows.map((r) => r.id);
const find = (rows: Headline[], id: string) => rows.find((r) => r.id === id);

beforeEach(async () => {
  await resetDatabase();
  await db.tasks.clear();
  await db.milestones.clear();
  seq = 0;
  freezeAt(WEDNESDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the line always has something to say', () => {
  it('reports XP even on a completely empty week', async () => {
    const rows = await readHeadlines(WEDNESDAY);
    expect(find(rows, 'xp')?.text).toContain('XP to spend');
  });

  it('gives every item a distinct id, so the marquee can key them', async () => {
    await db.tasks.bulkAdd([makeTask(), makeTask({ completed: true })]);
    const rows = await readHeadlines(WEDNESDAY);
    expect(new Set(idsOf(rows)).size).toBe(rows.length);
  });

  it('keeps each headline short enough to read as it passes', async () => {
    await db.tasks.bulkAdd([makeTask({ dueDate: '2026-08-20' })]);
    for (const row of await readHeadlines(WEDNESDAY)) {
      expect(row.text.length).toBeLessThanOrEqual(60);
    }
  });
});

describe('the week in progress', () => {
  it('counts what has been committed and finished', async () => {
    await db.tasks.bulkAdd([makeTask({ completed: true }), makeTask(), makeTask()]);
    const rows = await readHeadlines(WEDNESDAY);
    expect(find(rows, 'committed')?.text).toBe('1 of 3 committed tasks done');
  });

  it('says nothing about commitments when nothing is committed', async () => {
    // "0 of 0 done" every day for a month is noise wearing the costume of
    // information.
    const rows = await readHeadlines(WEDNESDAY);
    expect(find(rows, 'committed')).toBeUndefined();
  });

  it('calls out overdue committed work', async () => {
    await db.tasks.bulkAdd([makeTask({ dueDate: '2026-08-20' })]);
    const rows = await readHeadlines(WEDNESDAY);

    expect(find(rows, 'overdue')?.text).toContain('1 committed task is overdue');
    expect(find(rows, 'overdue')?.tone).toBe('BAD');
  });

  it('turns good news green', async () => {
    await db.tasks.bulkAdd([makeTask({ completed: true })]);
    expect(find(await readHeadlines(WEDNESDAY), 'committed')?.tone).toBe('GOOD');
  });
});

describe('whether the week has been agreed', () => {
  it('says a week nobody has sent is still a draft', async () => {
    const rows = await readHeadlines(WEDNESDAY);
    expect(find(rows, 'baseline')?.text).toContain('still a draft');
    expect(find(rows, 'baseline')?.tone).toBe('WATCH');
  });

  it('says when it is waiting on a parent', async () => {
    await db.tasks.add(makeTask());
    await submitForApproval(await loadWeekCommitment(), undefined, MONDAY);

    const rows = await readHeadlines(WEDNESDAY);
    expect(find(rows, 'baseline')?.text).toContain('waiting on a parent');
  });

  it('says when it is agreed', async () => {
    await db.tasks.add(makeTask());
    await submitForApproval(await loadWeekCommitment(), undefined, MONDAY);
    await approveBaseline(MONDAY);

    const rows = await readHeadlines(WEDNESDAY);
    expect(find(rows, 'baseline')?.text).toContain('agreed');
    expect(find(rows, 'baseline')?.tone).toBe('GOOD');
  });
});

describe('time, and what the week spends it on', () => {
  it('always reports the study time left', async () => {
    expect(find(await readHeadlines(WEDNESDAY), 'headroom')?.text).toContain(
      'study time left this week'
    );
  });

  it('mentions booked activities once there are any', async () => {
    expect(find(await readHeadlines(WEDNESDAY), 'activities')).toBeUndefined();

    await saveActivity({
      weekStart: MONDAY,
      label: 'Birthday party',
      category: 'FUN',
      plannedOccasions: 1,
      hoursEach: 4,
    });

    expect(find(await readHeadlines(WEDNESDAY), 'activities')?.text).toContain('4h booked');
  });

  it('celebrates hours handed back when plans change', async () => {
    const party = await saveActivity({
      weekStart: MONDAY,
      label: 'Party',
      category: 'FUN',
      plannedOccasions: 1,
      hoursEach: 3,
    });
    await confirmAttendance(party, 0);

    const row = find(await readHeadlines(WEDNESDAY), 'freed');
    expect(row?.text).toContain('3h came back');
    expect(row?.tone).toBe('GOOD');
  });

  it('reports study logged this week, and only this week', async () => {
    await db.checkIns.bulkAdd([
      {
        id: 'ci_now',
        date: WEDNESDAY,
        timestamp: Date.now(),
        session: 'EVENING',
        energyLevel: 4,
        focusRating: 'NORMAL',
        completedHomeworkIds: [],
        completedRevisionMinutes: 90,
        xpEarned: 10,
        isDailyBaseXPAwarded: true,
      },
      {
        id: 'ci_old',
        date: '2026-08-10',
        timestamp: Date.now(),
        session: 'EVENING',
        energyLevel: 4,
        focusRating: 'NORMAL',
        completedHomeworkIds: [],
        completedRevisionMinutes: 600,
        xpEarned: 10,
        isDailyBaseXPAwarded: true,
      },
    ]);

    expect(find(await readHeadlines(WEDNESDAY), 'studied')?.text).toBe(
      '1.5h studied so far this week'
    );
  });
});

describe('behaviour and what is coming', () => {
  it('stays silent about sanctions when there are none', async () => {
    expect(find(await readHeadlines(WEDNESDAY), 'sanctions')).toBeUndefined();
  });

  it('reports recent sanctions without editorialising', async () => {
    await logSanction({ severity: 'MINOR', reason: 'Late' });
    const row = find(await readHeadlines(WEDNESDAY), 'sanctions');

    expect(row?.text).toBe('1 sanction in the last fortnight');
    expect(row?.tone).toBe('BAD');
  });

  it('flags a frozen shop', async () => {
    await logSanction({ severity: 'SERIOUS', reason: 'Removed', remediation: 'Catch up' });
    expect(find(await readHeadlines(WEDNESDAY), 'shop')?.text).toContain('frozen');
  });

  it('counts down to the next key date', async () => {
    await db.milestones.add({
      id: 'ms_1',
      title: 'Physics mock',
      date: '2026-09-09',
      category: 'EXAM_MOCK',
      priority: 'HIGH',
      isCompleted: false,
      createdAt: Date.now(),
    });

    expect(find(await readHeadlines(WEDNESDAY), 'next')?.text).toBe('Physics mock in 7 days');
  });

  it('says "tomorrow" rather than "in 1 days"', async () => {
    await db.milestones.add({
      id: 'ms_1',
      title: 'DT deadline',
      date: '2026-09-03',
      category: 'COURSEWORK',
      priority: 'HIGH',
      isCompleted: false,
      createdAt: Date.now(),
    });

    expect(find(await readHeadlines(WEDNESDAY), 'next')?.text).toBe('DT deadline is tomorrow');
  });

  it('ignores a key date that has passed or is done', async () => {
    await db.milestones.bulkAdd([
      {
        id: 'ms_past',
        title: 'Gone',
        date: '2026-08-01',
        category: 'COURSEWORK',
        priority: 'HIGH',
        isCompleted: false,
        createdAt: Date.now(),
      },
      {
        id: 'ms_done',
        title: 'Finished',
        date: '2026-09-10',
        category: 'COURSEWORK',
        priority: 'HIGH',
        isCompleted: true,
        createdAt: Date.now(),
      },
    ]);

    expect(find(await readHeadlines(WEDNESDAY), 'next')).toBeUndefined();
  });
});

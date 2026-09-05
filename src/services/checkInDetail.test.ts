import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { checkInDetail, checkInNotes } from './checkInDetail';
import { logAuditEvent } from './auditService';
import { buildActivityFeed } from './activityService';
import { CheckInOccurrence, DailyCheckIn, Task } from '../types';

/**
 * Updates said a check-in happened and summarised it in one line - energy,
 * focus, a count of tasks, some minutes, the XP. That is a receipt, not an
 * answer: which two tasks, what was studied, and what was written down are all
 * missing, and the notes are the part somebody meant to be read later.
 */

async function checkIn(overrides: Partial<DailyCheckIn> = {}): Promise<DailyCheckIn> {
  const row = {
    id: 'ci1',
    date: '2026-09-04',
    timestamp: Date.now(),
    session: 'EVENING',
    energyLevel: 4,
    focusRating: 'HIGH',
    completedHomeworkIds: [],
    completedRevisionMinutes: 0,
    xpEarned: 20,
    isDailyBaseXPAwarded: true,
    ...overrides,
  } as DailyCheckIn;
  await db.checkIns.add(row);
  return row;
}

async function task(id: string, title: string): Promise<void> {
  await db.tasks.add({
    id,
    subjectId: 'maths',
    title,
    dueDate: '2026-09-05',
    priority: 'MEDIUM',
    isHomework: true,
    isRemediation: false,
    xpValue: 50,
    completed: true,
    createdAt: Date.now(),
  } as Task);
}

async function occurrence(overrides: Partial<CheckInOccurrence> = {}): Promise<void> {
  await db.checkInOccurrences.add({
    id: `occ_${Math.random()}`,
    date: '2026-09-04',
    occurrenceKey: 'k',
    kind: 'LESSON',
    label: 'Maths',
    outcome: 'HAPPENED',
    xpAwarded: 2,
    ...overrides,
  } as CheckInOccurrence);
}

beforeEach(async () => {
  await emptyDatabase();
});

describe('reading back what a check-in said', () => {
  it('names the work that was ticked off rather than counting it', async () => {
    await task('t1', 'Maths past paper Q12-18');
    await task('t2', 'History essay plan');
    await checkIn({ completedHomeworkIds: ['t1', 't2'] });

    const detail = (await checkInDetail('ci1'))!;

    expect(detail.completedWork.map((w) => w.title)).toEqual([
      'Maths past paper Q12-18',
      'History essay plan',
    ]);
  });

  it('says so when a ticked-off task has since been deleted', async () => {
    await checkIn({ completedHomeworkIds: ['gone'] });

    const [work] = (await checkInDetail('ci1'))!.completedWork;

    // The feed row outlives the task it named, and a blank line explains less
    // than saying what happened to it.
    expect(work.missing).toBe(true);
    expect(work.title).toContain('deleted');
  });

  it('puts the studied subject and goal into words', async () => {
    await db.subjects.add({ id: 'maths', name: 'Maths (Linear 9-1)' } as never);
    await db.goals.add({ id: 'g1', title: 'Achieve Grade 9 in Maths' } as never);
    await checkIn({
      completedRevisionMinutes: 45,
      studySubjectId: 'maths',
      studyGoalId: 'g1',
    });

    const detail = (await checkInDetail('ci1'))!;

    expect(detail.studySubjectName).toBe('Maths (Linear 9-1)');
    expect(detail.studyGoalTitle).toBe('Achieve Grade 9 in Maths');
  });

  it('carries the day the check-in was scoring', async () => {
    await checkIn();
    await occurrence({ label: 'Maths', outcome: 'HAPPENED' });
    await occurrence({ label: 'Physics', outcome: 'MISSED' });

    const detail = (await checkInDetail('ci1'))!;

    // The day is where "did this happen" was answered; the check-in is where
    // the day was scored. One without the other explains half an evening.
    expect(detail.occurrences.map((o) => o.label).sort()).toEqual(['Maths', 'Physics']);
  });

  it('ignores a day that is not this check-instance day', async () => {
    await checkIn({ date: '2026-09-04' });
    await occurrence({ date: '2026-09-03', label: 'Yesterday' });

    expect((await checkInDetail('ci1'))!.occurrences).toHaveLength(0);
  });

  it('picks out the answers that raised something to do', async () => {
    await checkIn();
    await occurrence({ label: 'Maths', followUp: 'Ask about surds' });
    await occurrence({ label: 'Physics' });

    const detail = (await checkInDetail('ci1'))!;

    expect(detail.followUps.map((o) => o.followUp)).toEqual(['Ask about surds']);
  });

  it('treats a blank follow-up as no follow-up', async () => {
    await checkIn();
    await occurrence({ followUp: '   ' });

    expect((await checkInDetail('ci1'))!.followUps).toHaveLength(0);
  });

  it('totals the day XP including the bonus', async () => {
    await checkIn();
    await occurrence({ xpAwarded: 2 });
    await occurrence({ xpAwarded: 3, dayBonusXp: 10 });

    expect((await checkInDetail('ci1'))!.occurrenceXp).toBe(15);
  });

  it('returns nothing for a check-in that is gone', async () => {
    // A feed row outlives the record it describes, and an expander that
    // explodes on a deleted check-in is worse than one saying it is gone.
    expect(await checkInDetail('never-existed')).toBeNull();
  });
});

describe('the notes somebody meant to be read again', () => {
  it('labels each note it has', async () => {
    const row = await checkIn({
      structuredNotes: {
        keyLearning: 'Completing the square',
        blockersAndQuestions: 'Ask Mr A about surds',
        actionForTomorrow: 'Redo Q14',
      },
    });

    expect(checkInNotes(row)).toEqual([
      { label: 'What I learned', text: 'Completing the square' },
      { label: 'To ask about', text: 'Ask Mr A about surds' },
      { label: 'Tomorrow', text: 'Redo Q14' },
    ]);
  });

  it('skips the ones that were left empty', async () => {
    const row = await checkIn({
      structuredNotes: { keyLearning: 'Trig identities', actionForTomorrow: '  ' },
    });

    expect(checkInNotes(row).map((n) => n.label)).toEqual(['What I learned']);
  });

  it('falls back to the older single notes field', async () => {
    const row = await checkIn({ notes: 'Tired but got through it' });

    expect(checkInNotes(row)).toEqual([
      { label: 'Notes', text: 'Tired but got through it' },
    ]);
  });

  it('says nothing when nothing was written', async () => {
    expect(checkInNotes(await checkIn())).toEqual([]);
  });
});

describe('the feed row the detail hangs off', () => {
  it('gives a check-in the entity type and id the expander keys on', async () => {
    await checkIn({ id: 'ci-feed' });
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'DailyCheckIn',
      entityId: 'ci-feed',
      newValue: '[EVENING] Energy: 4, Focus: HIGH, Tasks Done: 0, Study: 0m',
    });

    const feed = await buildActivityFeed('PARENT');
    const row = feed.items.find((item) => item.entityId === 'ci-feed');

    // The expander renders on `entityType === 'Check-in'` and loads by
    // `entityId`. If either drifts, the detail silently never appears - which
    // is indistinguishable from not having built it.
    expect(row?.entityType).toBe('Check-in');
    expect(await checkInDetail(row!.entityId)).not.toBeNull();
  });
});

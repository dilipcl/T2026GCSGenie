import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase, resetDatabase } from '../test/harness';
import { calculateBurnoutCapacity, safeStudyHours } from './burnoutEngine';
import { logException, slotHours } from './commitmentService';
import { CommitmentException, DailyCheckIn, FixedCommitment } from '../types';

/** Only `Date` is faked; faking timers wholesale deadlocks Dexie. */
function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

// Week of Mon 2026-08-31 to Sun 2026-09-06.
const WEDNESDAY = '2026-09-02';
const TUESDAY = '2026-09-01';
const LAST_SUNDAY = '2026-08-30';

function commitment(over: Partial<FixedCommitment> & { id: string }): FixedCommitment {
  return {
    label: over.id,
    weeklyHours: 1,
    isActive: true,
    timetableEntryIds: [],
    hoursPerOccasion: 1,
    createdAt: 0,
    createdBy: 'SYSTEM_AGENT',
    ...over,
  };
}

function checkIn(over: Partial<DailyCheckIn> & { id: string; date: string }): DailyCheckIn {
  return {
    timestamp: new Date(`${over.date}T18:00:00`).getTime(),
    session: 'EVENING',
    energyLevel: 4,
    focusRating: 'NORMAL',
    completedHomeworkIds: [],
    completedRevisionMinutes: 0,
    xpEarned: 0,
    isDailyBaseXPAwarded: false,
    ...over,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the seeded baseline (DAT-2)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('carries the previous hardcoded hours over unchanged', async () => {
    const rows = await db.commitments.toArray();
    const byId = Object.fromEntries(rows.map((c) => [c.id, c.weeklyHours]));

    // The exact values that used to live in BASELINE_COMMITMENTS. Nobody's
    // capacity total is allowed to move on the day the migration runs.
    expect(byId).toMatchObject({
      school: 32.5,
      cadets: 6.0,
      artSupport: 1.5,
      drums: 2.0,
      dofe: 2.0,
    });
  });

  it('still totals 44h of baseline commitments', async () => {
    const result = await calculateBurnoutCapacity();
    expect(result.baselineHours).toBe(44);
  });

  it('reads the commitments table rather than a constant', async () => {
    await db.commitments.update('dofe', { weeklyHours: 5 });
    const result = await calculateBurnoutCapacity();
    expect(result.baselineHours).toBe(47);
    expect(result.commitmentBreakdown.find((c) => c.id === 'dofe')!.scheduledHours).toBe(5);
  });

  it('drops an archived commitment out of the total', async () => {
    await db.commitments.update('drums', { isActive: false });
    const result = await calculateBurnoutCapacity();
    expect(result.baselineHours).toBe(42);
    expect(result.commitmentBreakdown.map((c) => c.id)).not.toContain('drums');
  });

  /**
   * DAT-3. The capacity model counted 2.0h of drums against a single 1.0h
   * lesson in the timetable. Now that an absence is logged against the linked
   * rows, the two sources have to agree or a missed lesson deducts the wrong
   * number.
   */
  it('agrees with the timetable about how long each commitment runs', async () => {
    const entries = await db.timetableEntries.toArray();
    const byId = new Map(entries.map((e) => [e.id, e]));

    for (const c of await db.commitments.toArray()) {
      if (c.timetableEntryIds.length === 0) continue; // school: generated periods

      const scheduled = c.timetableEntryIds.reduce((sum, id) => {
        const entry = byId.get(id);
        expect(entry, `${c.id} points at a timetable row "${id}" that does not exist`).toBeTruthy();
        return sum + slotHours(entry!.startTime, entry!.endTime);
      }, 0);

      expect(Math.round(scheduled * 10) / 10, `${c.label} hours`).toBe(c.weeklyHours);
    }
  });

  it('does not count a goal whose hours a commitment already covers', async () => {
    // Air Cadets is both a commitment (6h) and a locked goal. Counting both
    // charges the week twice for one Tuesday evening.
    await db.goals.update('g-cadets', { status: 'APPROVED_LOCKED', weeklyHoursRequired: 6 });
    const result = await calculateBurnoutCapacity();
    expect(result.customGoalsHours).toBe(0);
  });
});

describe('excusing an occasion (EXC-3)', () => {
  beforeEach(async () => {
    await resetDatabase();
    freezeAt(WEDNESDAY);
  });

  it('moves the baseline 44h to 41h and says why', async () => {
    const cadets = (await db.commitments.get('cadets'))!;

    await logException({
      commitment: cadets,
      date: TUESDAY,
      title: 'Air Cadets Training',
      scheduledHours: 3,
      status: 'EXCUSED_ABSENT',
      reasonCategory: 'FAMILY',
      reasonNotes: 'Family dinner',
    });

    const result = await calculateBurnoutCapacity();
    const net = result.commitmentBreakdown.reduce((sum, c) => sum + c.netHours, 0);

    expect(result.baselineHours).toBe(44);
    expect(result.excusedHours).toBe(3);
    expect(Math.round(net * 10) / 10).toBe(41);

    // A number that silently drops by three hours reads as a bug. The panel's
    // credibility rests on the arithmetic being checkable.
    expect(result.formulaExplanation).toContain('44h less 3h excused this week = 41h');
  });

  it('shows the deduction against the commitment it belongs to', async () => {
    const cadets = (await db.commitments.get('cadets'))!;
    await logException({
      commitment: cadets,
      date: TUESDAY,
      title: 'Air Cadets Training',
      scheduledHours: 3,
      status: 'EXCUSED_ABSENT',
      reasonCategory: 'ILLNESS',
    });

    const result = await calculateBurnoutCapacity();
    const row = result.commitmentBreakdown.find((c) => c.id === 'cadets')!;
    expect(row).toMatchObject({ scheduledHours: 6, excusedHours: 3, netHours: 3, exceptionCount: 1 });

    // Everything else is untouched.
    expect(result.commitmentBreakdown.find((c) => c.id === 'drums')!.excusedHours).toBe(0);
  });

  it('says nothing about deductions when there are none', async () => {
    const result = await calculateBurnoutCapacity();
    expect(result.excusedHours).toBe(0);
    expect(result.formulaExplanation).not.toContain('excused');
  });

  it('ignores an absence logged in a different week', async () => {
    const cadets = (await db.commitments.get('cadets'))!;
    await logException({
      commitment: cadets,
      date: LAST_SUNDAY,
      title: 'Air Cadets Training',
      scheduledHours: 3,
      status: 'EXCUSED_ABSENT',
      reasonCategory: 'FAMILY',
    });

    const result = await calculateBurnoutCapacity();
    expect(result.excusedHours).toBe(0);
    expect(result.exceptions).toHaveLength(0);
  });

  it('records an attendance without moving the total', async () => {
    const cadets = (await db.commitments.get('cadets'))!;
    await logException({
      commitment: cadets,
      date: TUESDAY,
      title: 'Air Cadets Training',
      scheduledHours: 3,
      status: 'ATTENDED',
      reasonCategory: 'OTHER',
    });

    const result = await calculateBurnoutCapacity();
    expect(result.excusedHours).toBe(0);
    // The row still exists, so the weekly review can show the parade happened.
    expect(result.exceptions).toHaveLength(1);
  });

  it('cannot drive a commitment below zero on a mis-entered absence', async () => {
    const drums = (await db.commitments.get('drums'))!;
    await logException({
      commitment: drums,
      date: TUESDAY,
      title: 'Drum Lesson',
      scheduledHours: 99,
      status: 'EXCUSED_ABSENT',
      reasonCategory: 'OTHER',
    });

    const result = await calculateBurnoutCapacity();
    const row = result.commitmentBreakdown.find((c) => c.id === 'drums')!;
    expect(row.netHours).toBe(0);
    expect(row.excusedHours).toBe(2);
  });

  it('writes the absence to the audit log', async () => {
    const cadets = (await db.commitments.get('cadets'))!;
    await logException({
      commitment: cadets,
      date: TUESDAY,
      title: 'Air Cadets Training',
      scheduledHours: 3,
      status: 'EXCUSED_ABSENT',
      reasonCategory: 'FAMILY',
    });

    const logs = await db.auditLogs.where('entity').equals('CommitmentException').toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].newValue).toContain('3h off this week');
  });
});

describe('one occasion is one row (DAT-4)', () => {
  beforeEach(async () => {
    await resetDatabase();
    freezeAt(WEDNESDAY);
  });

  /**
   * Two devices logging the same missed parade night offline, then syncing.
   * The composite key means they merge into a single row and the hours come
   * off once; a generated id would have deducted them twice and read as a sync
   * fault rather than the modelling mistake it would have been.
   */
  it('merges the same absence logged twice into one deduction', async () => {
    const cadets = (await db.commitments.get('cadets'))!;
    const input = {
      commitment: cadets,
      date: TUESDAY,
      title: 'Air Cadets Training',
      scheduledHours: 3,
      status: 'EXCUSED_ABSENT' as const,
      reasonCategory: 'FAMILY' as const,
    };

    const first = await logException(input);
    const second = await logException({ ...input, reasonCategory: 'ILLNESS' });

    expect(first.id).toBe(second.id);
    expect(await db.commitmentExceptions.count()).toBe(1);

    const result = await calculateBurnoutCapacity();
    expect(result.excusedHours).toBe(3);

    // The later write wins the reason, rather than producing a second row.
    const stored = await db.commitmentExceptions.get(first.id);
    expect(stored!.reasonCategory).toBe('ILLNESS');
  });

  it('keeps absences on different days apart', async () => {
    const cadets = (await db.commitments.get('cadets'))!;
    for (const date of [TUESDAY, '2026-09-04']) {
      await logException({
        commitment: cadets,
        date,
        title: 'Air Cadets',
        scheduledHours: 3,
        status: 'EXCUSED_ABSENT',
        reasonCategory: 'FAMILY',
      });
    }

    expect(await db.commitmentExceptions.count()).toBe(2);
    const result = await calculateBurnoutCapacity();
    // Both parade nights gone, so cadets contributes nothing this week.
    expect(result.commitmentBreakdown.find((c) => c.id === 'cadets')!.netHours).toBe(0);
    expect(result.excusedHours).toBe(6);
  });
});

describe('one definition of this week (DAT-1)', () => {
  beforeEach(async () => {
    await emptyDatabase();
    await db.commitments.add(commitment({ id: 'school', label: 'School', weeklyHours: 10 }));
    freezeAt(WEDNESDAY);
  });

  /**
   * The defect this requirement exists for. The capacity gauge used to read a
   * rolling seven days while the goal budgets read from the Monday, so on a
   * Wednesday a session logged the previous Sunday counted towards one and not
   * the other. Side by side in one cockpit that discrepancy is arithmetic
   * anyone can check.
   */
  it('excludes a session logged in the previous week', async () => {
    await db.checkIns.bulkAdd([
      checkIn({ id: 'a', date: LAST_SUNDAY, completedRevisionMinutes: 120, studySubjectId: 'maths' }),
      checkIn({ id: 'b', date: TUESDAY, completedRevisionMinutes: 60, studySubjectId: 'maths' }),
    ]);

    const result = await calculateBurnoutCapacity();
    expect(result.loggedRevisionHours).toBe(1);
    expect(result.week.start).toBe('2026-08-31');
  });

  it('counts a session logged today', async () => {
    await db.checkIns.add(
      checkIn({ id: 'c', date: WEDNESDAY, completedRevisionMinutes: 90, studySubjectId: 'maths' })
    );
    const result = await calculateBurnoutCapacity();
    expect(result.loggedRevisionHours).toBe(1.5);
  });

  it('ignores a check-in dated into next week', async () => {
    await db.checkIns.add(
      checkIn({ id: 'd', date: '2026-09-09', completedRevisionMinutes: 600, studySubjectId: 'maths' })
    );
    const result = await calculateBurnoutCapacity();
    expect(result.loggedRevisionHours).toBe(0);
  });
});

describe('safeStudyHours', () => {
  beforeEach(async () => {
    await emptyDatabase();
    await db.commitments.add(commitment({ id: 'school', label: 'School', weeklyHours: 40 }));
    freezeAt(WEDNESDAY);
  });

  it('is the ceiling less the fixed load, and does not move as study is logged', async () => {
    const before = safeStudyHours(await calculateBurnoutCapacity());

    await db.checkIns.add(
      checkIn({ id: 'e', date: WEDNESDAY, completedRevisionMinutes: 180, studySubjectId: 'maths' })
    );
    const after = safeStudyHours(await calculateBurnoutCapacity());

    expect(before).toBe(20);
    expect(after).toBe(20);
  });

  it('grows when an occasion is excused', async () => {
    const school = (await db.commitments.get('school'))!;
    await logException({
      commitment: school,
      date: TUESDAY,
      title: 'School',
      scheduledHours: 6.5,
      status: 'EXCUSED_ABSENT',
      reasonCategory: 'ILLNESS',
    });

    expect(safeStudyHours(await calculateBurnoutCapacity())).toBe(26.5);
  });
});

describe('exception rows', () => {
  it('names itself by commitment and date', async () => {
    await resetDatabase();
    freezeAt(WEDNESDAY);
    const drums = (await db.commitments.get('drums'))!;
    const row: CommitmentException = await logException({
      commitment: drums,
      date: TUESDAY,
      title: 'Drum Lesson',
      scheduledHours: 1,
      status: 'POSTPONED',
      reasonCategory: 'MOCK_PREP',
    });
    expect(row.id).toBe(`drums__${TUESDAY}`);
    expect(row.deductsFromCapacity).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { resetDatabase } from '../test/harness';
import {
  archiveCommitment,
  exceptionId,
  listCommitments,
  logException,
  occasionsOn,
  removeException,
  saveCommitment,
  slotHours,
  weekExceptions,
} from './commitmentService';
import { calculateBurnoutCapacity } from './burnoutEngine';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

// Week of Mon 2026-08-31.
const TUESDAY = '2026-09-01';
const WEDNESDAY = '2026-09-02';
const THURSDAY = '2026-09-03';
const SATURDAY = '2026-09-05';
const SUNDAY = '2026-09-06';

beforeEach(async () => {
  await resetDatabase();
  freezeAt(WEDNESDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('slotHours', () => {
  it('measures a timetable slot', () => {
    expect(slotHours('19:00', '22:00')).toBe(3);
    expect(slotHours('15:15', '16:45')).toBe(1.5);
    expect(slotHours('16:00', '17:00')).toBe(1);
  });
});

describe('exceptionId', () => {
  it('is derived from the commitment and the date', () => {
    expect(exceptionId('cadets', '2026-09-01')).toBe('cadets__2026-09-01');
  });
});

describe('occasionsOn', () => {
  it('finds the cadets parade on a Tuesday and not on a Wednesday', async () => {
    const tuesday = await occasionsOn(TUESDAY, 'ODD');
    expect(tuesday.map((o) => o.commitment.id)).toContain('cadets');

    const wednesday = await occasionsOn(WEDNESDAY, 'ODD');
    expect(wednesday.map((o) => o.commitment.id)).not.toContain('cadets');
  });

  /**
   * The hours come from the timetable row, not the weekly total. A cadets
   * absence is three hours; deducting the whole six would wipe out a Friday
   * that has not happened yet.
   */
  it('costs one occasion, not the whole week', async () => {
    const cadets = (await occasionsOn(TUESDAY, 'ODD')).find((o) => o.commitment.id === 'cadets')!;
    expect(cadets.hours).toBe(3);
    expect(cadets.commitment.weeklyHours).toBe(6);
    expect(cadets.title).toBe('Air Cadets Training');
  });

  it('finds art support on a Wednesday and DofE on a Saturday', async () => {
    expect(
      (await occasionsOn(WEDNESDAY, 'ODD')).find((o) => o.commitment.id === 'artSupport')?.hours
    ).toBe(1.5);
    expect(
      (await occasionsOn(SATURDAY, 'ODD')).find((o) => o.commitment.id === 'dofe')?.hours
    ).toBe(2);
  });

  /**
   * DAT-3 from the other side: the drums commitment counts two hours and now
   * has two occasions to match - the Thursday lesson and the Sunday practice.
   */
  it('splits drums across its lesson and its practice block', async () => {
    const lesson = (await occasionsOn(THURSDAY, 'ODD')).find((o) => o.commitment.id === 'drums');
    const practice = (await occasionsOn(SUNDAY, 'ODD')).find((o) => o.commitment.id === 'drums');

    expect(lesson?.hours).toBe(1);
    expect(practice?.hours).toBe(1);
    expect((lesson!.hours + practice!.hours)).toBe(lesson!.commitment.weeklyHours);
  });

  /**
   * School has no enumerated rows - its periods are generated - so it falls
   * back to a day's worth, and only on a day school actually happens.
   */
  it('offers school on a weekday and not at the weekend', async () => {
    expect(
      (await occasionsOn(WEDNESDAY, 'ODD')).find((o) => o.commitment.id === 'school')?.hours
    ).toBe(6.5);
    expect(
      (await occasionsOn(SATURDAY, 'ODD')).find((o) => o.commitment.id === 'school')
    ).toBeUndefined();
  });

  it('attaches an exception that has already been logged', async () => {
    const cadets = (await db.commitments.get('cadets'))!;
    await logException({
      commitment: cadets,
      date: TUESDAY,
      title: 'Air Cadets Training',
      scheduledHours: 3,
      status: 'EXCUSED_ABSENT',
      reasonCategory: 'FAMILY',
    });

    const occasion = (await occasionsOn(TUESDAY, 'ODD')).find((o) => o.commitment.id === 'cadets')!;
    expect(occasion.exception?.reasonCategory).toBe('FAMILY');
  });

  it('leaves an archived commitment out entirely', async () => {
    await db.commitments.update('cadets', { isActive: false });
    expect(
      (await occasionsOn(TUESDAY, 'ODD')).find((o) => o.commitment.id === 'cadets')
    ).toBeUndefined();
  });
});

describe('removeException', () => {
  it('puts the hours back and records the undo', async () => {
    const cadets = (await db.commitments.get('cadets'))!;
    const row = await logException({
      commitment: cadets,
      date: TUESDAY,
      title: 'Air Cadets Training',
      scheduledHours: 3,
      status: 'EXCUSED_ABSENT',
      reasonCategory: 'FAMILY',
    });

    expect((await calculateBurnoutCapacity()).excusedHours).toBe(3);

    await removeException(row);

    expect((await calculateBurnoutCapacity()).excusedHours).toBe(0);
    expect(await db.commitmentExceptions.count()).toBe(0);

    const logs = await db.auditLogs.where('entity').equals('CommitmentException').toArray();
    expect(logs.some((l) => l.action === 'DELETE')).toBe(true);
  });
});

describe('weekExceptions', () => {
  it('returns this week only, most recent first', async () => {
    const cadets = (await db.commitments.get('cadets'))!;
    for (const date of [TUESDAY, '2026-09-04', '2026-08-25']) {
      await logException({
        commitment: cadets,
        date,
        title: 'Air Cadets',
        scheduledHours: 3,
        status: 'EXCUSED_ABSENT',
        reasonCategory: 'FAMILY',
      });
    }

    const rows = await weekExceptions();
    expect(rows.map((r) => r.date)).toEqual(['2026-09-04', TUESDAY]);
  });
});

describe('editing commitments', () => {
  it('adds one a parent invents', async () => {
    await saveCommitment({
      id: 'swimming',
      label: 'Swimming club',
      weeklyHours: 2,
      hoursPerOccasion: 2,
      timetableEntryIds: [],
      isActive: true,
    });

    expect((await calculateBurnoutCapacity()).baselineHours).toBe(46);
    expect((await listCommitments()).map((c) => c.id)).toContain('swimming');
  });

  /**
   * Archived rather than deleted, following the chore precedent: seeding
   * re-inserts any absent row it knows about, so a deleted commitment would
   * come back on the next open and past exceptions would point at nothing.
   */
  it('archives rather than deletes, and keeps past absences pointing at something', async () => {
    const drums = (await db.commitments.get('drums'))!;
    await logException({
      commitment: drums,
      date: THURSDAY,
      title: 'Drum Lesson',
      scheduledHours: 1,
      status: 'EXCUSED_ABSENT',
      reasonCategory: 'ILLNESS',
    });

    await archiveCommitment(drums);

    // Still there, so the exception logged above still refers to a real row.
    const stored = await db.commitments.get('drums');
    expect(stored).toBeTruthy();
    expect(stored!.isActive).toBe(false);

    // Out of the weekly load, out of the default listing, still in the full one.
    const capacity = await calculateBurnoutCapacity();
    expect(capacity.baselineHours).toBe(42);
    expect(capacity.commitmentBreakdown.map((c) => c.id)).not.toContain('drums');
    expect((await listCommitments()).map((c) => c.id)).not.toContain('drums');
    expect((await listCommitments(true)).map((c) => c.id)).toContain('drums');
  });

  it('can be switched back on', async () => {
    const drums = (await db.commitments.get('drums'))!;
    await archiveCommitment(drums);
    await saveCommitment({ ...drums, isActive: true });

    expect((await calculateBurnoutCapacity()).baselineHours).toBe(44);
  });

  it('keeps a deliberately-set occasion cost when the weekly total changes', async () => {
    const cadets = (await db.commitments.get('cadets'))!;
    expect(cadets.hoursPerOccasion).toBe(3);

    await saveCommitment({ ...cadets, weeklyHours: 9 });

    const updated = (await db.commitments.get('cadets'))!;
    expect(updated.weeklyHours).toBe(9);
    expect(updated.hoursPerOccasion).toBe(3);
  });

  it('writes commitment edits to the audit log', async () => {
    const dofe = (await db.commitments.get('dofe'))!;
    await saveCommitment({ ...dofe, weeklyHours: 4 });

    const logs = await db.auditLogs.where('entity').equals('Commitment').toArray();
    expect(logs.at(-1)!.newValue).toContain('4 hrs/wk');
  });
});

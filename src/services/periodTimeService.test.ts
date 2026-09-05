import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { TimetableEntry, TimetableSlotConfig } from '../types';
import { applyPeriodTimeToLessons, previewPeriodTimeChange } from './periodTimeService';

/**
 * Tejas moved a period time and every day kept the old one. These cover both
 * halves of the fix: the lessons following the period move, and the ones
 * somebody deliberately gave their own times do not.
 */

beforeEach(async () => {
  await emptyDatabase();
});

const SLOT: TimetableSlotConfig = {
  id: 'slot_p1',
  name: 'Period 1',
  defaultStartTime: '08:50',
  defaultEndTime: '09:50',
  isBreakOrLunch: false,
};

let seq = 0;
function entry(overrides: Partial<TimetableEntry> = {}): TimetableEntry {
  seq += 1;
  return {
    id: `entry_${seq}`,
    weekType: 'ODD',
    dayOfWeek: 'MON',
    slotName: 'Period 1',
    startTime: '08:50',
    endTime: '09:50',
    subjectId: 'maths',
    isHardLocked: true,
    ...overrides,
  } as TimetableEntry;
}

async function seed(slot: TimetableSlotConfig, entries: TimetableEntry[]) {
  await db.timetableSlots.add(slot);
  await db.timetableEntries.bulkAdd(entries);
}

describe('previewPeriodTimeChange', () => {
  it('counts every day and both week types as following the period', async () => {
    await seed(SLOT, [
      entry({ dayOfWeek: 'MON', weekType: 'ODD' }),
      entry({ dayOfWeek: 'TUE', weekType: 'ODD' }),
      entry({ dayOfWeek: 'MON', weekType: 'EVEN' }),
      entry({ dayOfWeek: 'FRI', weekType: 'BOTH' }),
    ]);

    const impact = await previewPeriodTimeChange(SLOT);

    expect(impact.following).toHaveLength(4);
    expect(impact.outliers).toHaveLength(0);
  });

  it('treats a lesson with its own times as an outlier', async () => {
    await seed(SLOT, [
      entry({ dayOfWeek: 'MON' }),
      entry({ dayOfWeek: 'FRI', startTime: '09:00', endTime: '09:40' }),
    ]);

    const impact = await previewPeriodTimeChange(SLOT);

    expect(impact.following.map((e) => e.dayOfWeek)).toEqual(['MON']);
    expect(impact.outliers.map((e) => e.dayOfWeek)).toEqual(['FRI']);
  });

  it('counts a lesson as an outlier when only its end time differs', async () => {
    await seed(SLOT, [entry({ endTime: '09:30' })]);

    const impact = await previewPeriodTimeChange(SLOT);

    expect(impact.following).toHaveLength(0);
    expect(impact.outliers).toHaveLength(1);
  });

  it('ignores lessons belonging to a different period', async () => {
    await seed(SLOT, [
      entry({ slotName: 'Period 2', startTime: '08:50', endTime: '09:50' }),
      entry({ slotName: 'Period 1' }),
    ]);

    const impact = await previewPeriodTimeChange(SLOT);

    expect(impact.following).toHaveLength(1);
    expect(impact.outliers).toHaveLength(0);
  });
});

describe('applyPeriodTimeToLessons', () => {
  it('moves every following lesson to the new times', async () => {
    await seed(SLOT, [
      entry({ dayOfWeek: 'MON' }),
      entry({ dayOfWeek: 'TUE' }),
      entry({ dayOfWeek: 'WED' }),
    ]);

    const impact = await previewPeriodTimeChange(SLOT);
    const moved = await applyPeriodTimeToLessons(impact, {
      startTime: '09:00',
      endTime: '10:00',
    });

    expect(moved).toBe(3);
    const after = await db.timetableEntries.toArray();
    expect(after.every((e) => e.startTime === '09:00' && e.endTime === '10:00')).toBe(true);
  });

  it('leaves an outlier exactly as it was', async () => {
    await seed(SLOT, [
      entry({ dayOfWeek: 'MON' }),
      entry({ id: 'outlier', dayOfWeek: 'FRI', startTime: '09:00', endTime: '09:40' }),
    ]);

    const impact = await previewPeriodTimeChange(SLOT);
    await applyPeriodTimeToLessons(impact, { startTime: '10:00', endTime: '11:00' });

    const outlier = await db.timetableEntries.get('outlier');
    expect(outlier?.startTime).toBe('09:00');
    expect(outlier?.endTime).toBe('09:40');
  });

  it('keeps the subject and day of each lesson it moves', async () => {
    await seed(SLOT, [entry({ id: 'keep', dayOfWeek: 'THU', subjectId: 'physics' })]);

    const impact = await previewPeriodTimeChange(SLOT);
    await applyPeriodTimeToLessons(impact, { startTime: '11:10', endTime: '12:10' });

    const moved = await db.timetableEntries.get('keep');
    expect(moved?.subjectId).toBe('physics');
    expect(moved?.dayOfWeek).toBe('THU');
    expect(moved?.slotName).toBe('Period 1');
  });

  it('does nothing, and says so, when no lesson follows the period', async () => {
    await seed(SLOT, [entry({ startTime: '07:00', endTime: '07:30' })]);

    const impact = await previewPeriodTimeChange(SLOT);
    const moved = await applyPeriodTimeToLessons(impact, {
      startTime: '09:00',
      endTime: '10:00',
    });

    expect(moved).toBe(0);
    const untouched = await db.timetableEntries.toArray();
    expect(untouched[0].startTime).toBe('07:00');
  });
});

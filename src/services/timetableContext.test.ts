import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { currentSubjectId } from './timetableContext';
import { TimetableEntry } from '../types';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

// 2026-09-02 is a Wednesday.
const WEDNESDAY = '2026-09-02';

function at(hour: number, minute = 0) {
  return new Date(`${WEDNESDAY}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
}

const LESSONS: TimetableEntry[] = [
  {
    id: 'p1',
    weekType: 'BOTH',
    dayOfWeek: 'WED',
    slotName: 'Period 1',
    startTime: '08:50',
    endTime: '09:50',
    subjectId: 'maths',
    activityName: 'Maths',
    isHardLocked: false,
  },
  {
    id: 'p2',
    weekType: 'BOTH',
    dayOfWeek: 'WED',
    slotName: 'Period 2',
    startTime: '09:50',
    endTime: '10:50',
    subjectId: 'physics',
    activityName: 'Physics',
    isHardLocked: false,
  },
  {
    id: 'lunch',
    weekType: 'BOTH',
    dayOfWeek: 'WED',
    slotName: 'Lunch',
    startTime: '12:00',
    endTime: '13:00',
    activityName: 'Lunch',
    isHardLocked: false,
  },
  {
    id: 'p5-odd',
    weekType: 'ODD',
    dayOfWeek: 'WED',
    slotName: 'Period 5',
    startTime: '13:55',
    endTime: '14:55',
    subjectId: 'history',
    activityName: 'History',
    isHardLocked: false,
  },
];

beforeEach(async () => {
  await emptyDatabase();
  freezeAt(WEDNESDAY);
  await db.timetableEntries.bulkAdd(LESSONS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('currentSubjectId', () => {
  it('returns the lesson in progress', async () => {
    expect(await currentSubjectId('ODD', at(9, 20))).toBe('maths');
    expect(await currentSubjectId('ODD', at(10, 0))).toBe('physics');
  });

  it('treats the end time as exclusive, so back-to-back periods do not overlap', async () => {
    expect(await currentSubjectId('ODD', at(9, 50))).toBe('physics');
  });

  /**
   * Homework is written down after the lesson, not before it. The period that
   * just finished is a far better guess than the one still to come.
   */
  it('falls back to the lesson that just finished', async () => {
    expect(await currentSubjectId('ODD', at(11, 30))).toBe('physics');
    expect(await currentSubjectId('ODD', at(12, 30))).toBe('physics');
  });

  it('returns nothing before the school day starts', async () => {
    expect(await currentSubjectId('ODD', at(7, 0))).toBeUndefined();
  });

  it('ignores periods with no subject, like lunch', async () => {
    // Inside the lunch slot, the answer is still the last real lesson.
    expect(await currentSubjectId('ODD', at(12, 15))).toBe('physics');
  });

  it('respects the week type', async () => {
    expect(await currentSubjectId('ODD', at(14, 30))).toBe('history');
    // The same slot does not exist in an even week, so the morning stands.
    expect(await currentSubjectId('EVEN', at(14, 30))).toBe('physics');
  });

  it('returns nothing on a day with no lessons', async () => {
    await db.timetableEntries.clear();
    expect(await currentSubjectId('ODD', at(10, 0))).toBeUndefined();
  });
});

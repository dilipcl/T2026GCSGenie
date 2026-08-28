import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase, resetDatabase } from '../test/harness';
import { readDoors } from './doorsOpen';
import { CareerGuidanceResource, SubjectConfig, SubjectId } from '../types';

function subject(id: SubjectId, currentEstimatedGrade: number): SubjectConfig {
  return {
    id,
    name: id,
    shortName: id,
    examBoard: 'AQA',
    targetGrade: 9,
    currentEstimatedGrade,
    color: '',
    icon: '',
    teacherName: '',
    examStructure: '',
  };
}

function route(
  id: string,
  requiredGCSEGrade: number,
  relevantSubjectIds: SubjectId[]
): CareerGuidanceResource {
  return {
    id,
    title: id,
    category: 'A_LEVELS',
    requiredGCSEGrade,
    relevantSubjectIds,
    description: '',
    icon: '',
  };
}

beforeEach(async () => {
  await emptyDatabase();
});

describe('readDoors', () => {
  it('says nothing with no routes listed', async () => {
    const doors = await readDoors();
    expect(doors.total).toBe(0);
    expect(doors.open).toBe(0);
  });

  it('counts a route open when every relevant subject already meets it', async () => {
    await db.subjects.bulkAdd([subject('maths', 8), subject('physics', 8)]);
    await db.careerResources.add(route('further-maths', 7, ['maths', 'physics']));

    const doors = await readDoors();
    expect(doors.open).toBe(1);
    expect(doors.doors[0].status).toBe('OPEN');
  });

  it('counts a route one grade short as within reach, not closed', async () => {
    await db.subjects.bulkAdd([subject('maths', 8), subject('physics', 7)]);
    await db.careerResources.add(route('engineering', 8, ['maths', 'physics']));

    const doors = await readDoors();
    expect(doors.open).toBe(0);
    expect(doors.withinReach).toBe(1);
    expect(doors.doors[0].status).toBe('CLOSE');
    expect(doors.doors[0].shortfall.map((s) => s.subject.id)).toEqual(['physics']);
  });

  it('calls a two-grade gap a stretch', async () => {
    await db.subjects.add(subject('maths', 6));
    await db.careerResources.add(route('further-maths', 8, ['maths']));

    expect((await readDoors()).doors[0].status).toBe('STRETCH');
  });

  /**
   * The number has to match the list the guidance hub renders, or it reads as
   * wrong sitting above it. A route naming no subject we hold cannot be judged,
   * so it counts as open rather than disappearing from the total.
   */
  it('keeps the total equal to the number of routes listed', async () => {
    await db.subjects.add(subject('maths', 5));
    await db.careerResources.bulkAdd([
      route('a', 9, ['maths']),
      route('b', 4, ['maths']),
      route('c', 9, []),
    ]);

    const doors = await readDoors();
    expect(doors.total).toBe(3);
    expect(doors.doors).toHaveLength(3);
    expect(doors.doors.find((d) => d.resource.id === 'c')!.status).toBe('OPEN');
  });

  describe('the best next step', () => {
    it('names the subject that would open the most doors', async () => {
      await db.subjects.bulkAdd([subject('maths', 7), subject('physics', 7)]);
      await db.careerResources.bulkAdd([
        route('r1', 8, ['maths']),
        route('r2', 8, ['maths']),
        route('r3', 8, ['physics']),
      ]);

      const doors = await readDoors();
      expect(doors.bestNextStep?.subject.id).toBe('maths');
      expect(doors.bestNextStep?.unlocks).toBe(2);
    });

    /**
     * Advice that does not survive being acted on is worse than none. A door
     * blocked by two subjects does not open by moving one of them.
     */
    it('ignores doors that one grade would not actually open', async () => {
      await db.subjects.bulkAdd([subject('maths', 7), subject('physics', 5)]);
      await db.careerResources.add(route('r1', 8, ['maths', 'physics']));

      expect((await readDoors()).bestNextStep).toBeUndefined();
    });

    it('is absent when everything is already open', async () => {
      await db.subjects.add(subject('maths', 9));
      await db.careerResources.add(route('r1', 7, ['maths']));

      const doors = await readDoors();
      expect(doors.open).toBe(1);
      expect(doors.bestNextStep).toBeUndefined();
    });
  });

  it('reads the real seeded catalogue without falling over', async () => {
    await resetDatabase();
    const doors = await readDoors();

    expect(doors.total).toBeGreaterThan(0);
    expect(doors.open + doors.withinReach).toBeLessThanOrEqual(doors.total);
    for (const door of doors.doors) {
      expect(['OPEN', 'CLOSE', 'STRETCH']).toContain(door.status);
    }
  });
});

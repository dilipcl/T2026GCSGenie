import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { resetDatabase } from '../test/harness';
import { Goal } from '../types';
import { assessFeasibility } from './goalBurndown';
import { saveActivity, confirmAttendance } from './activityPlanService';
import { calculateBurnoutCapacity, safeStudyHours } from './burnoutEngine';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

// Week of Mon 2026-08-31.
const MONDAY = '2026-08-31';
const WEDNESDAY = '2026-09-02';

/** An approved goal that started well before today and is behind. */
async function behindGoal(weeklyHours: number): Promise<Goal> {
  const goal: Goal = {
    id: 'goal_behind',
    title: 'Grade 9 Maths',
    category: 'ACADEMIC_GRADE_9',
    subjectId: 'maths',
    targetDate: '2026-12-18',
    smartSpecific: '',
    smartMeasurable: '',
    smartAchievable: '',
    smartRealistic: '',
    smartTimeBound: '',
    status: 'APPROVED_LOCKED',
    ragStatus: 'AMBER',
    weeklyHoursRequired: weeklyHours,
    lockedAt: new Date('2026-06-01T00:00:00').getTime(),
    createdAt: new Date('2026-06-01T00:00:00').getTime(),
  };
  await db.goals.add(goal);
  return goal;
}

beforeEach(async () => {
  await resetDatabase();
  await db.goals.clear();
  freezeAt(WEDNESDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('is catching up even possible this week', () => {
  it('says there is no rate to check when no goal has a budget', async () => {
    const out = await assessFeasibility(WEDNESDAY);
    expect(out.hasGoals).toBe(false);
    expect(out.requiredHoursPerWeek).toBe(0);
    expect(out.message).toContain('no rate to check');
  });

  it('asks for nothing from a goal that is ahead of its line', async () => {
    await behindGoal(2);

    // Twelve weeks of generous Maths study, so the goal is comfortably ahead
    // and demands no catching up. Only goals behind their line set a rate;
    // counting a healthy goal's steady budget would manufacture a shortfall
    // out of a plan that is going well.
    for (let week = 0; week < 12; week++) {
      const date = new Date('2026-06-01T00:00:00');
      date.setDate(date.getDate() + week * 7);
      await db.checkIns.add({
        id: `ci_${week}`,
        date: date.toISOString().slice(0, 10),
        timestamp: date.getTime(),
        session: 'EVENING',
        energyLevel: 4,
        focusRating: 'NORMAL',
        completedHomeworkIds: [],
        completedRevisionMinutes: 600,
        studySubjectId: 'maths',
        xpEarned: 10,
        isDailyBaseXPAwarded: true,
      });
    }

    const out = await assessFeasibility(WEDNESDAY);
    expect(out.requiredHoursPerWeek).toBe(0);
    expect(out.isAchievable).toBe(true);
    expect(out.message).toContain('on or ahead of its line');
  });

  it('demands a rate once a goal has fallen behind', async () => {
    await behindGoal(3);
    const out = await assessFeasibility(WEDNESDAY);

    // Months locked with nothing logged: the required rate must exceed the
    // original budget, or the burn-down is not burning anything down.
    expect(out.requiredHoursPerWeek).toBeGreaterThan(3);
  });

  it('measures the rate against the headroom the week actually has', async () => {
    await behindGoal(3);
    const out = await assessFeasibility(WEDNESDAY);
    const expected = Math.max(0, safeStudyHours(await calculateBurnoutCapacity()));

    expect(out.studyHeadroomHours).toBeCloseTo(expected, 1);
  });
});

describe('what planned activities do to it', () => {
  it('reports the activity hours it took into account', async () => {
    await behindGoal(2);
    await saveActivity({
      weekStart: MONDAY,
      label: 'Birthday party',
      category: 'FUN',
      plannedOccasions: 1,
      hoursEach: 4,
    });

    expect((await assessFeasibility(WEDNESDAY)).activityHours).toBe(4);
  });

  it('shrinks the headroom by the hours a party costs', async () => {
    await behindGoal(2);
    const before = (await assessFeasibility(WEDNESDAY)).studyHeadroomHours;

    await saveActivity({
      weekStart: MONDAY,
      label: 'Birthday party',
      category: 'FUN',
      plannedOccasions: 1,
      hoursEach: 4,
    });

    const after = (await assessFeasibility(WEDNESDAY)).studyHeadroomHours;
    expect(before - after).toBeCloseTo(4, 1);
  });

  it('can turn a feasible week into an impossible one', async () => {
    await behindGoal(3);
    const before = await assessFeasibility(WEDNESDAY);

    // Enough life in the week to swallow whatever headroom there was.
    await saveActivity({
      weekStart: MONDAY,
      label: 'Festival weekend',
      category: 'FUN',
      plannedOccasions: 3,
      hoursEach: Math.max(4, before.studyHeadroomHours),
    });

    const after = await assessFeasibility(WEDNESDAY);
    expect(after.isAchievable).toBe(false);
    expect(after.shortfallHours).toBeGreaterThan(0);
  });

  it('says a shortfall is not a try-harder problem', async () => {
    await behindGoal(3);
    await saveActivity({
      weekStart: MONDAY,
      label: 'Festival weekend',
      category: 'FUN',
      plannedOccasions: 4,
      hoursEach: 12,
    });

    const out = await assessFeasibility(WEDNESDAY);
    // The two failures have opposite remedies, and saying "try harder" at
    // something that does not fit is how a plan stops being believed.
    expect(out.message).toContain('later target or a smaller goal');
    expect(out.message).toContain('planned activities');
  });

  it('gives the week back when the activity did not happen', async () => {
    await behindGoal(2);
    const party = await saveActivity({
      weekStart: MONDAY,
      label: 'Birthday party',
      category: 'FUN',
      plannedOccasions: 1,
      hoursEach: 4,
    });
    const withParty = (await assessFeasibility(WEDNESDAY)).studyHeadroomHours;

    await confirmAttendance(party, 0);
    const without = (await assessFeasibility(WEDNESDAY)).studyHeadroomHours;

    expect(without - withParty).toBeCloseTo(4, 1);
  });

  it('never reports a negative shortfall', async () => {
    await behindGoal(1);
    const out = await assessFeasibility(WEDNESDAY);
    expect(out.shortfallHours).toBeGreaterThanOrEqual(0);
  });
});

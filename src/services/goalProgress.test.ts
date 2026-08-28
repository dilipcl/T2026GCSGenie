import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { goalWeekProgress, lockedGoalProgress, paceFor, goalsNeedingAction } from './goalProgress';
import { calculateBurnoutCapacity } from './burnoutEngine';
import { DailyCheckIn, Goal } from '../types';
import { weekContaining } from './weekWindow';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

// Week of Mon 2026-08-31 to Sun 2026-09-06.
const MONDAY = '2026-08-31';
const TUESDAY = '2026-09-01';
const WEDNESDAY = '2026-09-02';
const FRIDAY = '2026-09-04';
const LAST_SUNDAY = '2026-08-30';

function goal(over: Partial<Goal> & { id: string }): Goal {
  return {
    title: over.id,
    category: 'ACADEMIC_GRADE_9',
    smartSpecific: '',
    smartMeasurable: '',
    smartAchievable: '',
    smartRealistic: '',
    smartTimeBound: '',
    status: 'APPROVED_LOCKED',
    ragStatus: 'GREEN',
    weeklyHoursRequired: 4,
    subjectId: 'maths',
    createdAt: 1,
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

beforeEach(async () => {
  await emptyDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('paceFor', () => {
  it('is ahead when the pro-rated share is met', () => {
    expect(paceFor(2, 1.7, 3)).toBe('AHEAD');
    expect(paceFor(1.7, 1.7, 3)).toBe('AHEAD');
  });

  /**
   * A weekly budget is arithmetically "behind" at one minute past midnight on
   * Monday, which is true and completely useless. Nothing is called behind
   * before Wednesday.
   */
  it('says nothing before Wednesday', () => {
    expect(paceFor(0, 0.6, 1)).toBe('AHEAD');
    expect(paceFor(0, 1.1, 2)).toBe('AHEAD');
  });

  it('is behind once Wednesday has passed and the share is short', () => {
    expect(paceFor(0.5, 1.7, 3)).toBe('BEHIND');
  });

  /**
   * "Behind by twenty minutes on Wednesday" and "not started by Friday" are
   * different situations. One amber for both trains people to ignore amber.
   */
  it('is stalled only with nothing logged and the week nearly gone', () => {
    expect(paceFor(0, 2.9, 5)).toBe('STALLED');
    expect(paceFor(0, 1.7, 3)).toBe('BEHIND');
    expect(paceFor(0.1, 2.9, 5)).toBe('BEHIND');
  });
});

describe('goalWeekProgress', () => {
  it('pro-rates the target by the day of the week', async () => {
    freezeAt(WEDNESDAY);
    const g = goal({ id: 'g1', weeklyHoursRequired: 4 });
    await db.goals.add(g);

    const progress = await goalWeekProgress(g);
    // 4h × 3/7 = 1.714 -> 1.7
    expect(progress.proRatedTargetHours).toBe(1.7);
    expect(progress.targetHours).toBe(4);
  });

  it('places the pro-rata marker on the same scale as the bar', async () => {
    freezeAt(WEDNESDAY);
    const g = goal({ id: 'g1', weeklyHoursRequired: 4 });
    await db.goals.add(g);
    await db.checkIns.add(
      checkIn({ id: 'c1', date: TUESDAY, completedRevisionMinutes: 120, studySubjectId: 'maths' })
    );

    const progress = await goalWeekProgress(g);
    expect(progress.actualHours).toBe(2);
    expect(progress.percentOfWeek).toBe(50); // 2 of 4
    expect(progress.proRatedPercent).toBe(43); // 1.7 of 4
  });

  it('counts time booked to the goal directly', async () => {
    freezeAt(WEDNESDAY);
    const g = goal({ id: 'g1', subjectId: undefined, weeklyHoursRequired: 2 });
    await db.goals.add(g);
    await db.checkIns.add(
      checkIn({ id: 'c1', date: TUESDAY, completedRevisionMinutes: 60, studyGoalId: 'g1' })
    );

    const progress = await goalWeekProgress(g);
    expect(progress.actualHours).toBe(1);
  });

  it('flags a goal with no subject as unattributable rather than behind', async () => {
    freezeAt(FRIDAY);
    const g = goal({ id: 'g1', subjectId: undefined });
    await db.goals.add(g);

    const progress = await goalWeekProgress(g);
    expect(progress.isUnattributable).toBe(true);
    expect(progress.needsAction).toBe(false);
    expect(progress.pace).toBe('AHEAD');
  });

  /**
   * The missing upper bound. This used to filter with `aboveOrEqual(weekStart)`
   * alone, so a check-in dated into the future counted towards the budget and
   * never fell out of range again.
   */
  it('ignores study logged outside the week in both directions', async () => {
    freezeAt(WEDNESDAY);
    const g = goal({ id: 'g1' });
    await db.goals.add(g);
    await db.checkIns.bulkAdd([
      checkIn({ id: 'a', date: LAST_SUNDAY, completedRevisionMinutes: 300, studySubjectId: 'maths' }),
      checkIn({ id: 'b', date: '2026-09-09', completedRevisionMinutes: 300, studySubjectId: 'maths' }),
      checkIn({ id: 'c', date: MONDAY, completedRevisionMinutes: 60, studySubjectId: 'maths' }),
    ]);

    expect((await goalWeekProgress(g)).actualHours).toBe(1);
  });

  it('reports progress for an explicitly given past week', async () => {
    freezeAt(WEDNESDAY);
    const g = goal({ id: 'g1' });
    await db.goals.add(g);
    await db.checkIns.add(
      checkIn({ id: 'a', date: LAST_SUNDAY, completedRevisionMinutes: 120, studySubjectId: 'maths' })
    );

    const previous = weekContaining(LAST_SUNDAY);
    expect((await goalWeekProgress(g, previous)).actualHours).toBe(2);
  });
});

describe('goalsNeedingAction', () => {
  it('returns only locked goals that are behind or stalled', async () => {
    freezeAt(FRIDAY);
    await db.goals.bulkAdd([
      goal({ id: 'behind', subjectId: 'maths', weeklyHoursRequired: 4 }),
      goal({ id: 'ontrack', subjectId: 'physics', weeklyHoursRequired: 1 }),
      goal({ id: 'draft', subjectId: 'history', status: 'DRAFT', weeklyHoursRequired: 9 }),
    ]);
    await db.checkIns.add(
      checkIn({ id: 'a', date: TUESDAY, completedRevisionMinutes: 90, studySubjectId: 'physics' })
    );

    const behind = await goalsNeedingAction();
    expect(behind.map((p) => p.goal.id)).toEqual(['behind']);
    expect(behind[0].pace).toBe('STALLED');
  });

  it('is quiet on a Monday even with nothing logged', async () => {
    freezeAt(MONDAY);
    await db.goals.add(goal({ id: 'g1' }));
    expect(await goalsNeedingAction()).toHaveLength(0);
  });
});

describe('reconciling with the capacity gauge (DAT-1)', () => {
  /**
   * The acceptance criterion for the shared week window: per-goal hours must
   * never exceed the total the capacity gauge reports, and both must turn over
   * on the same Monday. Before this they were computed from different windows,
   * so on a Wednesday the goals could legitimately add up to more than the
   * total that was meant to contain them.
   */
  it('never lets per-goal hours exceed the logged total', async () => {
    freezeAt(WEDNESDAY);
    await db.goals.bulkAdd([
      goal({ id: 'maths', subjectId: 'maths', weeklyHoursRequired: 4 }),
      goal({ id: 'physics', subjectId: 'physics', weeklyHoursRequired: 3 }),
    ]);
    await db.checkIns.bulkAdd([
      checkIn({ id: 'a', date: LAST_SUNDAY, completedRevisionMinutes: 240, studySubjectId: 'maths' }),
      checkIn({ id: 'b', date: MONDAY, completedRevisionMinutes: 60, studySubjectId: 'maths' }),
      checkIn({ id: 'c', date: TUESDAY, completedRevisionMinutes: 30, studySubjectId: 'physics' }),
    ]);

    const goals = await lockedGoalProgress();
    const perGoal = goals.reduce((sum, p) => sum + p.actualHours, 0);
    const capacity = await calculateBurnoutCapacity();

    expect(capacity.loggedRevisionHours).toBe(1.5);
    expect(perGoal).toBeLessThanOrEqual(capacity.loggedRevisionHours);
  });

  it('turns both windows over on the same Monday', async () => {
    freezeAt(WEDNESDAY);
    await db.goals.add(goal({ id: 'g1' }));

    const goals = await lockedGoalProgress();
    const capacity = await calculateBurnoutCapacity();

    expect(goals[0].week.start).toBe(capacity.week.start);
    expect(goals[0].week.end).toBe(capacity.week.end);
    expect(capacity.week.start).toBe(MONDAY);
  });
});

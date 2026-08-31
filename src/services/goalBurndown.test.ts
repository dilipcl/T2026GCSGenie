import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { Goal, DailyCheckIn } from '../types';
import { portfolioBurndown, MIN_WEEKS_FOR_CHART } from './goalBurndown';

/**
 * The cases that matter here are the ones where a naive burn-down lies: an
 * unapproved goal, a partial current week, and work that was really done but
 * tagged to nothing.
 */

// A Monday, so week boundaries in these tests are unambiguous.
const TODAY = '2026-09-28';

beforeEach(async () => {
  await emptyDatabase();
});

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal_maths',
    title: 'Achieve Grade 8 in Maths',
    category: 'ACADEMIC_GRADE_9',
    subjectId: 'maths',
    targetDate: '2026-10-25',
    smartSpecific: '',
    smartMeasurable: '',
    smartAchievable: '',
    smartRealistic: '',
    smartTimeBound: '',
    status: 'APPROVED_LOCKED',
    ragStatus: 'GREEN',
    weeklyHoursRequired: 4,
    // Approved four weeks before TODAY.
    lockedAt: new Date('2026-08-31T09:00:00Z').getTime(),
    createdAt: new Date('2026-08-31T09:00:00Z').getTime(),
    ...overrides,
  };
}

function checkIn(date: string, minutes: number, extra: Partial<DailyCheckIn> = {}): DailyCheckIn {
  return {
    id: `ci_${date}_${minutes}_${extra.studyGoalId ?? extra.studySubjectId ?? 'none'}`,
    date,
    timestamp: new Date(`${date}T18:00:00Z`).getTime(),
    session: 'EVENING',
    energyLevel: 3,
    focusRating: 'NORMAL',
    completedHomeworkIds: [],
    completedRevisionMinutes: minutes,
    xpEarned: 0,
    isDailyBaseXPAwarded: false,
    ...extra,
  };
}

describe('what counts as a commitment', () => {
  it('ignores a goal still under discussion', async () => {
    await db.goals.add(goal({ status: 'PENDING_DISCUSSION' }));

    const report = await portfolioBurndown(TODAY);

    // A proposal is not a debt. Burning it down would report the family as
    // behind on hours nobody has agreed to spend.
    expect(report.goals).toHaveLength(0);
    expect(report.committedHours).toBe(0);
  });

  it('ignores an approved goal with no weekly budget, but says so', async () => {
    await db.goals.add(goal({ weeklyHoursRequired: 0 }));

    const report = await portfolioBurndown(TODAY);

    expect(report.goals).toHaveLength(0);
    expect(report.goalsWithoutBudget).toBe(1);
  });

  it('counts hours from approval, not from creation', async () => {
    await db.goals.add(
      goal({
        createdAt: new Date('2026-06-01T09:00:00Z').getTime(),
        lockedAt: new Date('2026-09-21T09:00:00Z').getTime(),
      })
    );

    const report = await portfolioBurndown(TODAY);

    // Drafted in June, approved a week ago: one elapsed week of expectation,
    // not seventeen.
    expect(report.goals[0].weeksElapsed).toBe(1);
    expect(report.goals[0].plannedToDateHours).toBe(4);
  });
});

describe('target against actual', () => {
  it('reports the gap in hours', async () => {
    await db.goals.add(goal());
    // Four elapsed weeks at 4 hrs/week expected = 16. Six hours done.
    await db.checkIns.bulkAdd([
      checkIn('2026-09-01', 180, { studyGoalId: 'goal_maths' }),
      checkIn('2026-09-08', 180, { studyGoalId: 'goal_maths' }),
    ]);

    const report = await portfolioBurndown(TODAY);
    const maths = report.goals[0];

    expect(maths.plannedToDateHours).toBe(16);
    expect(maths.loggedHours).toBe(6);
    expect(maths.varianceHours).toBe(-10);
    expect(maths.status).toBe('BEHIND');
  });

  it('gives the rate needed to still finish on time', async () => {
    await db.goals.add(goal());
    await db.checkIns.add(checkIn('2026-09-01', 120, { studyGoalId: 'goal_maths' }));

    const maths = (await portfolioBurndown(TODAY)).goals[0];

    // The actionable number: what it now takes per week, against the 4 promised.
    expect(maths.requiredHoursPerWeek).toBeGreaterThan(maths.goal.weeklyHoursRequired);
    expect(maths.requiredHoursPerWeek).toBe(
      Math.round(((maths.committedHours - maths.loggedHours) / maths.weeksRemaining) * 10) / 10
    );
  });

  it('does not blame the week in progress', async () => {
    // Approved this Monday: nothing has been asked of it yet.
    await db.goals.add(
      goal({ lockedAt: new Date('2026-09-28T09:00:00Z').getTime() })
    );

    const maths = (await portfolioBurndown(TODAY)).goals[0];

    expect(maths.weeksElapsed).toBe(0);
    expect(maths.plannedToDateHours).toBe(0);
    expect(maths.status).toBe('NOT_STARTED');
  });

  it('stops the actual line at today rather than running it flat into the future', async () => {
    await db.goals.add(goal());

    const points = (await portfolioBurndown(TODAY)).goals[0].points;
    const future = points.filter((p) => p.weekStart > '2026-09-28');

    expect(future.length).toBeGreaterThan(0);
    expect(future.every((p) => p.actualRemaining === undefined)).toBe(true);
    // The planned line keeps going, because that is the promise.
    expect(future.every((p) => typeof p.plannedRemaining === 'number')).toBe(true);
  });

  it('treats a goal as on track when it is within tolerance', async () => {
    await db.goals.add(goal());
    await db.checkIns.bulkAdd([
      checkIn('2026-09-01', 240, { studyGoalId: 'goal_maths' }),
      checkIn('2026-09-08', 240, { studyGoalId: 'goal_maths' }),
      checkIn('2026-09-15', 240, { studyGoalId: 'goal_maths' }),
      checkIn('2026-09-22', 210, { studyGoalId: 'goal_maths' }),
    ]);

    expect((await portfolioBurndown(TODAY)).goals[0].status).toBe('ON_TRACK');
  });
});

describe('attribution', () => {
  it('credits subject-tagged time to a goal on that subject', async () => {
    await db.goals.add(goal());
    await db.checkIns.add(checkIn('2026-09-01', 120, { studySubjectId: 'maths' }));

    expect((await portfolioBurndown(TODAY)).goals[0].loggedHours).toBe(2);
  });

  it('does not double-credit goal-tagged time to a sibling goal', async () => {
    await db.goals.bulkAdd([
      goal(),
      goal({ id: 'goal_maths_2', title: 'Second maths goal' }),
    ]);
    await db.checkIns.add(checkIn('2026-09-01', 120, { studyGoalId: 'goal_maths' }));

    const report = await portfolioBurndown(TODAY);
    const totals = report.goals.map((g) => g.loggedHours);

    // An hour spent once must not appear twice in the portfolio total.
    expect(totals).toEqual([2, 0]);
    expect(report.loggedHours).toBe(2);
  });

  it('carries work that reached no goal instead of dropping it', async () => {
    await db.goals.add(goal());
    await db.checkIns.bulkAdd([
      checkIn('2026-09-01', 120, { studyGoalId: 'goal_maths' }),
      // Real work, tagged to nothing - the shape of every check-in in the
      // family's first backup.
      checkIn('2026-09-02', 30),
      checkIn('2026-09-03', 45, { studySubjectId: 'history' }),
    ]);

    const report = await portfolioBurndown(TODAY);

    expect(report.loggedHours).toBe(2);
    // 75 minutes, reported to 1dp like every other hour figure in the app.
    expect(report.unattributedHours).toBe(1.3);
  });
});

describe('the holistic view', () => {
  it('sums goals that start and end on different dates', async () => {
    await db.goals.bulkAdd([
      goal(),
      goal({
        id: 'goal_cs',
        title: 'Grade 7 in Computer Science',
        subjectId: 'computer_science',
        weeklyHoursRequired: 3,
        targetDate: '2026-11-01',
      }),
    ]);

    const report = await portfolioBurndown(TODAY);

    expect(report.goals).toHaveLength(2);
    expect(report.committedHours).toBe(
      report.goals[0].committedHours + report.goals[1].committedHours
    );
    // The aggregate spans the union of both timelines.
    expect(report.points.at(-1)!.weekStart).toBe('2026-10-26');
  });

  it('never lets the aggregate remaining rise as time passes', async () => {
    await db.goals.bulkAdd([
      goal(),
      goal({ id: 'goal_cs', subjectId: 'computer_science', weeklyHoursRequired: 3 }),
    ]);
    await db.checkIns.add(checkIn('2026-09-08', 120, { studyGoalId: 'goal_maths' }));

    const points = (await portfolioBurndown(TODAY)).points;
    const actual = points
      .filter((p) => p.actualRemaining !== undefined)
      .map((p) => p.actualRemaining!);

    for (let i = 1; i < actual.length; i++) {
      expect(actual[i]).toBeLessThanOrEqual(actual[i - 1]);
    }
  });
});

describe('refusing to draw noise', () => {
  it('withholds the chart until there is history to draw', async () => {
    await db.goals.add(goal());
    await db.checkIns.add(checkIn('2026-09-22', 60, { studyGoalId: 'goal_maths' }));

    const report = await portfolioBurndown(TODAY);

    expect(report.weeksOfHistory).toBe(1);
    expect(report.hasEnoughData).toBe(false);
  });

  it('draws it once enough weeks exist', async () => {
    await db.goals.add(goal());
    await db.checkIns.bulkAdd([
      checkIn('2026-09-08', 60, { studyGoalId: 'goal_maths' }),
      checkIn('2026-09-15', 60, { studyGoalId: 'goal_maths' }),
    ]);

    const report = await portfolioBurndown(TODAY);

    expect(report.weeksOfHistory).toBeGreaterThanOrEqual(MIN_WEEKS_FOR_CHART);
    expect(report.hasEnoughData).toBe(true);
  });

  it('has nothing to draw with no approved goals at all', async () => {
    // The family's real position on 31 August 2026: four goals, none approved.
    await db.goals.bulkAdd([
      goal({ id: 'g1', status: 'PENDING_DISCUSSION' }),
      goal({ id: 'g2', status: 'PENDING_DISCUSSION' }),
    ]);
    await db.checkIns.add(checkIn('2026-09-08', 30));

    const report = await portfolioBurndown(TODAY);

    expect(report.hasEnoughData).toBe(false);
    expect(report.goals).toHaveLength(0);
    // The half hour is still reported, so the screen does not read as "nothing
    // has been done" when something has.
    expect(report.unattributedHours).toBe(0.5);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { resetDatabase } from '../test/harness';
import { Goal, Task } from '../types';
import {
  AT_RISK_RED_SHARE,
  EFFORT_RED_SHARE,
  HealthSignal,
  headlineFor,
  overallStatus,
  readWeekHealth,
  weightedScore,
} from './weekHealth';
import { currentWeek } from './weekWindow';
import { submitForApproval, approveBaseline } from './planBaselineService';
import { loadWeekCommitment } from './planService';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

// Week of Mon 2026-08-31.
const MONDAY = '2026-08-31';
const THURSDAY = '2026-09-03';
const FRIDAY = '2026-09-04';

let seq = 0;

function makeGoal(over: Partial<Goal> = {}): Goal {
  seq += 1;
  return {
    id: `goal_${seq}`,
    title: `Goal ${seq}`,
    category: 'ACADEMIC_GRADE_9',
    subjectId: 'maths',
    smartSpecific: '',
    smartMeasurable: '',
    smartAchievable: '',
    smartRealistic: '',
    smartTimeBound: '',
    status: 'APPROVED_LOCKED',
    ragStatus: 'GREEN',
    weeklyHoursRequired: 7,
    createdAt: Date.now(),
    ...over,
  };
}

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

async function logStudy(date: string, minutes: number, subjectId = 'maths') {
  seq += 1;
  await db.checkIns.add({
    id: `ci_${seq}`,
    date,
    timestamp: Date.now(),
    session: 'EVENING',
    energyLevel: 4,
    focusRating: 'NORMAL',
    completedHomeworkIds: [],
    completedRevisionMinutes: minutes,
    studySubjectId: subjectId as Task['subjectId'],
    xpEarned: 10,
    isDailyBaseXPAwarded: true,
  });
}

const signalOf = (health: { signals: HealthSignal[] }, id: string) =>
  health.signals.find((s) => s.id === id)!;

beforeEach(async () => {
  await resetDatabase();
  await db.goals.clear();
  await db.tasks.clear();
  await db.checkIns.clear();
  seq = 0;
  freezeAt(THURSDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the overall letter', () => {
  const signal = (status: 'RED' | 'AMBER' | 'GREEN', score: number): HealthSignal => ({
    id: 'CAPACITY',
    label: 'x',
    status,
    score,
    detail: '',
    weight: 10,
  });

  it('is green when everything is green and the score is high', () => {
    expect(overallStatus(90, [signal('GREEN', 90), signal('GREEN', 90)])).toBe('GREEN');
  });

  it('never reports green while something is red', () => {
    // Averaging one genuine failure away is how a dashboard reassures people
    // about the exact thing that is wrong.
    expect(overallStatus(95, [signal('GREEN', 100), signal('RED', 10)])).toBe('AMBER');
  });

  it('is red once two things are red, whatever the arithmetic says', () => {
    expect(overallStatus(95, [signal('RED', 10), signal('RED', 10)])).toBe('RED');
  });

  it('bands a middling score as amber', () => {
    expect(overallStatus(55, [signal('AMBER', 55)])).toBe('AMBER');
  });
});

describe('the weighted score', () => {
  const s = (weight: number, score: number, notApplicable = false): HealthSignal => ({
    id: 'CAPACITY',
    label: 'x',
    status: 'GREEN',
    score,
    detail: '',
    weight,
    notApplicable,
  });

  it('weights the signals against each other', () => {
    // 100 at weight 30, 0 at weight 10 -> 75.
    expect(weightedScore([s(30, 100), s(10, 0)])).toBe(75);
  });

  it('leaves out what does not apply, rather than scoring it zero', () => {
    // A family with no approved goals has one problem, not three.
    expect(weightedScore([s(30, 100), s(10, 0, true)])).toBe(100);
  });

  it('returns zero rather than dividing by nothing', () => {
    expect(weightedScore([s(10, 0, true)])).toBe(0);
  });
});

describe('effort against the goals', () => {
  it('is red when barely any of the expected hours are done', async () => {
    await db.goals.add(makeGoal({ weeklyHoursRequired: 7 }));
    // Thursday: 4/7 of 7h ≈ 4h expected. 15 minutes is nowhere near.
    await logStudy(THURSDAY, 15);

    const signal = signalOf(await readWeekHealth(), 'GOAL_EFFORT');
    expect(signal.status).toBe('RED');
    expect(signal.detail).toContain('%');
  });

  it('is green once the week is broadly keeping up', async () => {
    await db.goals.add(makeGoal({ weeklyHoursRequired: 7 }));
    await logStudy(THURSDAY, 240);

    expect(signalOf(await readWeekHealth(), 'GOAL_EFFORT').status).toBe('GREEN');
  });

  it('does not call a slow start red on Monday', async () => {
    freezeAt(MONDAY);
    await db.goals.add(makeGoal({ weeklyHoursRequired: 7 }));

    // Judging a full week's target at Monday lunchtime is true and useless.
    expect(signalOf(await readWeekHealth(), 'GOAL_EFFORT').status).not.toBe('RED');
  });

  it('drops out entirely when no goal is asking for hours', async () => {
    const signal = signalOf(await readWeekHealth(), 'GOAL_EFFORT');
    expect(signal.notApplicable).toBe(true);
    expect(signal.score).toBeUndefined();
  });

  it('uses the threshold the constant declares', () => {
    expect(EFFORT_RED_SHARE).toBe(0.2);
  });
});

describe('goals at risk', () => {
  it('is green when every goal is on pace', async () => {
    await db.goals.add(makeGoal({ weeklyHoursRequired: 1 }));
    await logStudy(THURSDAY, 120);

    const signal = signalOf(await readWeekHealth(), 'GOALS_AT_RISK');
    expect(signal.status).toBe('GREEN');
    expect(signal.detail).toContain('on pace');
  });

  it('is red once half the portfolio is off pace', async () => {
    await db.goals.bulkAdd([
      makeGoal({ weeklyHoursRequired: 7 }),
      makeGoal({ weeklyHoursRequired: 7, subjectId: 'physics' }),
    ]);

    const signal = signalOf(await readWeekHealth(), 'GOALS_AT_RISK');
    expect(signal.status).toBe('RED');
    expect(signal.detail).toContain('2 of 2');
  });

  it('scores the share that is still healthy', async () => {
    await db.goals.bulkAdd([
      makeGoal({ weeklyHoursRequired: 7 }),
      makeGoal({ weeklyHoursRequired: 7, subjectId: 'physics' }),
    ]);
    expect(signalOf(await readWeekHealth(), 'GOALS_AT_RISK').score).toBe(0);
  });

  it('uses the threshold the constant declares', () => {
    expect(AT_RISK_RED_SHARE).toBe(0.5);
  });
});

describe('the promise actually made', () => {
  it('is green when the week is keeping up with itself', async () => {
    await db.tasks.bulkAdd([
      makeTask({ completed: true }),
      makeTask({ completed: true }),
      makeTask(),
    ]);
    // Thursday is 4/7 through; 2 of 3 is ahead of that.
    expect(signalOf(await readWeekHealth(), 'COMMITMENT_KEPT').status).toBe('GREEN');
  });

  it('is red once committed work has gone overdue', async () => {
    await db.tasks.add(makeTask({ dueDate: '2026-08-25' }));
    const signal = signalOf(await readWeekHealth(), 'COMMITMENT_KEPT');

    expect(signal.status).toBe('RED');
    expect(signal.detail).toContain('overdue');
  });

  it('does not apply when nothing was committed', async () => {
    expect(signalOf(await readWeekHealth(), 'COMMITMENT_KEPT').notApplicable).toBe(true);
  });
});

describe('whether the week was ever agreed', () => {
  it('is red midweek while the plan is still a draft', async () => {
    const signal = signalOf(await readWeekHealth(), 'WEEK_TARGET');
    expect(signal.status).toBe('RED');
    expect(signal.detail).toContain('draft');
  });

  it('is only amber on Monday, when there is still time', async () => {
    freezeAt(MONDAY);
    expect(signalOf(await readWeekHealth(), 'WEEK_TARGET').status).toBe('AMBER');
  });

  it('is amber while a parent has it', async () => {
    await db.tasks.add(makeTask());
    await submitForApproval(await loadWeekCommitment(), undefined, MONDAY);
    expect(signalOf(await readWeekHealth(), 'WEEK_TARGET').status).toBe('AMBER');
  });

  it('is green once it is approved', async () => {
    await db.tasks.add(makeTask());
    await submitForApproval(await loadWeekCommitment(), undefined, MONDAY);
    await approveBaseline(MONDAY);

    const signal = signalOf(await readWeekHealth(), 'WEEK_TARGET');
    expect(signal.status).toBe('GREEN');
    expect(signal.score).toBe(100);
  });
});

describe('whether the goals are settled', () => {
  it('is red when nothing has been approved at all', async () => {
    await db.goals.add(makeGoal({ status: 'DRAFT' }));
    const signal = signalOf(await readWeekHealth(), 'GOALS_FINALISED');

    expect(signal.status).toBe('RED');
    expect(signal.detail).toContain('nothing is reserving time');
  });

  it('is amber while some are still under discussion', async () => {
    await db.goals.bulkAdd([makeGoal(), makeGoal({ status: 'DRAFT' })]);
    expect(signalOf(await readWeekHealth(), 'GOALS_FINALISED').status).toBe('AMBER');
  });

  it('is green when they are all approved', async () => {
    await db.goals.add(makeGoal());
    expect(signalOf(await readWeekHealth(), 'GOALS_FINALISED').status).toBe('GREEN');
  });
});

describe('the whole picture', () => {
  it('reports every signal, always', async () => {
    const health = await readWeekHealth();
    expect(health.signals).toHaveLength(6);
  });

  it('lists concerns worst first, and never lists a green one', async () => {
    await db.goals.add(makeGoal({ status: 'DRAFT' }));
    const health = await readWeekHealth();

    expect(health.concerns.every((c) => c.status !== 'GREEN')).toBe(true);
    if (health.concerns.length > 1) {
      expect(health.concerns[0].status).toBe('RED');
    }
  });

  it('is red for a week that has been abandoned', async () => {
    await db.goals.add(makeGoal({ status: 'DRAFT' }));
    await db.tasks.add(makeTask({ dueDate: '2026-08-25' }));

    const health = await readWeekHealth();
    expect(health.status).toBe('RED');
    expect(health.score).toBeLessThan(50);
  });

  it('is green for a week doing what it said it would', async () => {
    await db.goals.add(makeGoal({ weeklyHoursRequired: 1 }));
    await logStudy(THURSDAY, 180);
    await db.tasks.bulkAdd([makeTask({ completed: true }), makeTask({ completed: true })]);
    await submitForApproval(await loadWeekCommitment(), undefined, MONDAY);
    await approveBaseline(MONDAY);

    const health = await readWeekHealth();
    expect(health.status).toBe('GREEN');
    expect(health.concerns).toHaveLength(0);
  });

  it('carries the week it describes', async () => {
    const health = await readWeekHealth();
    expect(health.week.start).toBe(currentWeek().start);
  });
});

describe('the sentence under the letter', () => {
  const concern = (label: string, status: 'RED' | 'AMBER'): HealthSignal => ({
    id: 'WEEK_TARGET',
    label,
    status,
    score: 0,
    detail: 'because of a thing',
    weight: 10,
  });

  it('names the problem rather than the colour', () => {
    // "Amber" tells nobody what to do.
    const text = headlineFor('AMBER', 55, [concern('Week target set', 'AMBER')], 4);
    expect(text).toContain('week target set');
    expect(text).toContain('because of a thing');
  });

  it('names both when two things are red', () => {
    const text = headlineFor(
      'RED',
      20,
      [concern('Effort against your goals', 'RED'), concern('Week target set', 'RED')],
      4
    );
    expect(text).toContain('Effort against your goals');
    expect(text).toContain('week target set');
  });

  it('does not congratulate a green Monday as though the week were done', () => {
    expect(headlineFor('GREEN', 100, [], 1)).toContain('clean start');
    expect(headlineFor('GREEN', 100, [], 5)).toContain('On track');
  });
});

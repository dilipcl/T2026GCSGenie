import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { Task } from '../types';
import {
  autoFix,
  inspectData,
  isTitleTooThin,
  normaliseTitle,
  withTaskDefaults,
} from './dataQualityService';

/**
 * Every case here is a defect that was actually present in the family's
 * 31 August export, or a boundary next to one.
 */

beforeEach(async () => {
  await emptyDatabase();
});

let seq = 0;
function task(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `task_${seq}`,
    subjectId: 'physics',
    title: 'Finish the energy questions',
    dueDate: '2026-09-03',
    priority: 'MEDIUM',
    isHomework: true,
    isRemediation: false,
    xpValue: 50,
    completed: false,
    createdAt: Date.now(),
    bucket: 'THIS_WEEK',
    estimatedHours: 1,
    ...overrides,
  };
}

describe('normalising a title', () => {
  it('closes a bracket that was opened and never shut', () => {
    expect(
      normaliseTitle('Lock in Physic Session(Electricity,Circuits,Energy,Forces and matter')
    ).toBe('Lock in Physic Session (Electricity, Circuits, Energy, Forces and matter)');
  });

  it('collapses runs of whitespace', () => {
    expect(normaliseTitle('  Maths   past   paper ')).toBe('Maths past paper');
  });

  it('leaves numbers containing commas alone', () => {
    expect(normaliseTitle('Read 1,000 words')).toBe('Read 1,000 words');
  });

  it('never truncates or rewords a title that is already fine', () => {
    const original = 'Edexcel Paper 1 Past Paper Questions (Venn & Trig)';
    expect(normaliseTitle(original)).toBe(original);
  });
});

describe('titles too thin to identify later', () => {
  it('flags "Art Hw"', () => {
    expect(isTitleTooThin('Art Hw')).toBe(true);
  });

  it('flags a single word', () => {
    expect(isTitleTooThin('Revision')).toBe(true);
  });

  it('accepts real titles', () => {
    expect(isTitleTooThin('Logic Gate revision')).toBe(false);
    expect(isTitleTooThin('Physics Energy Transfer Safety Step Problems')).toBe(false);
  });
});

describe('defaults applied on the way in', () => {
  it('gives every task a real bucket instead of undefined', () => {
    expect(withTaskDefaults({}).bucket).toBe('LATER');
  });

  it('keeps a bucket that was chosen', () => {
    expect(withTaskDefaults({ bucket: 'THIS_WEEK' }).bucket).toBe('THIS_WEEK');
  });

  it('never invents a time estimate', () => {
    // A guessed estimate is a wrong number that looks right.
    expect(withTaskDefaults({}).estimatedHours).toBeUndefined();
  });
});

describe('inspecting existing data', () => {
  it('reports an unplanned task as blocking analysis', async () => {
    await db.tasks.add(task({ bucket: undefined }));

    const report = await inspectData();
    expect(report.issues.find((i) => i.id.startsWith('task-bucket'))?.severity).toBe(
      'BLOCKS_ANALYSIS'
    );
  });

  it('reports study minutes logged against no subject', async () => {
    await db.checkIns.add({
      id: 'checkin_1',
      date: '2026-08-30',
      timestamp: Date.now(),
      session: 'EVENING',
      energyLevel: 2,
      focusRating: 'NORMAL',
      completedHomeworkIds: [],
      completedRevisionMinutes: 30,
      xpEarned: 20,
      isDailyBaseXPAwarded: true,
    });

    const report = await inspectData();
    const issue = report.issues.find((i) => i.entity === 'DailyCheckIn');

    expect(issue?.severity).toBe('BLOCKS_ANALYSIS');
    expect(issue?.problem).toContain('30 minutes');
  });

  it('says nothing about a check-in that logged no study time', async () => {
    await db.checkIns.add({
      id: 'checkin_2',
      date: '2026-08-30',
      timestamp: Date.now(),
      session: 'MORNING',
      energyLevel: 4,
      focusRating: 'HIGH',
      completedHomeworkIds: [],
      completedRevisionMinutes: 0,
      xpEarned: 10,
      isDailyBaseXPAwarded: true,
    });

    const report = await inspectData();
    expect(report.issues.filter((i) => i.entity === 'DailyCheckIn')).toHaveLength(0);
  });

  it('spots two tasks that are probably the same work', async () => {
    await db.tasks.add(task({ title: 'Physics Energy Transfer Safety Step Problems' }));
    await db.tasks.add(task({ title: 'Finish physics energy questions' }));

    const report = await inspectData();
    expect(report.issues.some((i) => i.id.startsWith('task-dupe'))).toBe(true);
  });

  it('does not call two genuinely different tasks duplicates', async () => {
    await db.tasks.add(task({ title: 'Physics Energy Transfer Safety Step Problems' }));
    await db.tasks.add(task({ title: 'Revise refraction and lenses diagrams' }));

    const report = await inspectData();
    expect(report.issues.some((i) => i.id.startsWith('task-dupe'))).toBe(false);
  });

  it('only nags about an unlinked task when a goal exists to link it to', async () => {
    await db.tasks.add(task({ subjectId: 'art', linkedGoalId: undefined }));

    const before = await inspectData();
    expect(before.issues.some((i) => i.id.startsWith('task-goal'))).toBe(false);

    await db.goals.add({
      id: 'goal_art',
      title: 'Get a 7 or higher in Art',
      category: 'ACADEMIC_GRADE_9',
      subjectId: 'art',
      smartSpecific: '',
      smartMeasurable: '',
      smartAchievable: '',
      smartRealistic: '',
      smartTimeBound: '',
      status: 'APPROVED_LOCKED',
      ragStatus: 'GREEN',
      weeklyHoursRequired: 3,
      createdAt: Date.now(),
    });

    const after = await inspectData();
    expect(after.issues.some((i) => i.id.startsWith('task-goal'))).toBe(true);
  });

  it('ignores General, which has no goal to link to by design', async () => {
    await db.tasks.add(task({ subjectId: 'general' }));

    const report = await inspectData();
    expect(report.issues.some((i) => i.id.startsWith('task-goal'))).toBe(false);
  });

  it('flags a goal stuck awaiting approval', async () => {
    await db.goals.add({
      id: 'goal_cs',
      title: 'Achieve Grade 7+ in Computer Science',
      category: 'ACADEMIC_GRADE_9',
      smartSpecific: '',
      smartMeasurable: '',
      smartAchievable: '',
      smartRealistic: '',
      smartTimeBound: '',
      status: 'PENDING_DISCUSSION',
      ragStatus: 'AMBER',
      weeklyHoursRequired: 3,
      createdAt: Date.now() - 10 * 86_400_000,
    });

    const report = await inspectData();
    expect(report.issues.some((i) => i.id.startsWith('goal-stuck'))).toBe(true);
  });

  it('distinguishes a clean database from an empty one', async () => {
    expect((await inspectData()).rowsExamined).toBe(0);

    await db.tasks.add(task());
    const clean = await inspectData();

    expect(clean.rowsExamined).toBe(1);
    expect(clean.issues).toHaveLength(0);
  });
});

describe('auto-fixing only what cannot be wrong', () => {
  it('fills a missing bucket and tidies a title', async () => {
    await db.tasks.add(
      task({
        id: 'task_messy',
        bucket: undefined,
        title: 'Lock in Physic Session(Electricity,Circuits',
      })
    );

    const result = await autoFix();
    const fixed = await db.tasks.get('task_messy');

    expect(result.fixed).toBe(1);
    expect(fixed?.bucket).toBe('LATER');
    expect(fixed?.title).toBe('Lock in Physic Session (Electricity, Circuits)');
  });

  it('leaves a missing estimate alone rather than guessing', async () => {
    await db.tasks.add(task({ id: 'task_noest', estimatedHours: undefined }));

    await autoFix();
    expect((await db.tasks.get('task_noest'))?.estimatedHours).toBeUndefined();
  });

  it('does nothing to data that is already clean', async () => {
    await db.tasks.add(task());
    expect((await autoFix()).fixed).toBe(0);
  });
});

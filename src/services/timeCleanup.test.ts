import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { DailyCheckIn, Goal, Task } from '../types';
import { applyCleanup, planCleanup, readCleanupPlan } from './timeCleanup';

/**
 * The family's data on 19 Oct 2026, cut down: the duplicate Maths goal deleted
 * with two check-ins and a piece of work still pointing at it, and the
 * Chemistry goal agreed with no subject.
 */

const goal = (extra: Partial<Goal>): Goal => ({
  id: 'g',
  title: 'A goal',
  category: 'ACADEMIC_GRADE_9',
  smartSpecific: '',
  smartMeasurable: '',
  smartAchievable: '',
  smartRealistic: '',
  smartTimeBound: '',
  status: 'APPROVED_LOCKED',
  ragStatus: 'GREEN',
  weeklyHoursRequired: 2,
  createdAt: 0,
  ...extra,
});

const checkIn = (extra: Partial<DailyCheckIn>): DailyCheckIn => ({
  id: Math.random().toString(36),
  date: '2026-10-13',
  timestamp: 0,
  session: 'EVENING',
  energyLevel: 4,
  focusRating: 'NORMAL',
  completedHomeworkIds: [],
  completedRevisionMinutes: 60,
  xpEarned: 20,
  isDailyBaseXPAwarded: true,
  ...extra,
});

const task = (extra: Partial<Task>): Task => ({
  id: Math.random().toString(36),
  subjectId: 'maths',
  title: 'Sparx Maths',
  dueDate: '2026-10-13',
  priority: 'MEDIUM',
  isHomework: true,
  isRemediation: false,
  xpValue: 50,
  completed: false,
  createdAt: 0,
  ...extra,
});

const MATHS = goal({ id: 'g-maths', title: 'Grade 9 In Maths', subjectId: 'maths' });
const CHEMISTRY = goal({ id: 'g-chem', title: 'Grade 9 In Chemistry' });
const ORGANISED = goal({ id: 'g-org', title: 'Organised' });
const DELETED = 'g-academic-maths';

beforeEach(async () => {
  await emptyDatabase();
  await db.subjects.bulkPut(INITIAL_SUBJECTS);
});

describe('what the tidy offers', () => {
  it('moves rows off a deleted goal onto the only agreed goal for their subject', () => {
    const plan = planCleanup(
      [MATHS],
      INITIAL_SUBJECTS,
      [checkIn({ id: 'c1', studySubjectId: 'maths', studyGoalId: DELETED })],
      [task({ id: 't1', linkedGoalId: DELETED })]
    );
    expect(plan.relinks.map((r) => [r.id, r.to.id])).toEqual([
      ['c1', 'g-maths'],
      ['t1', 'g-maths'],
    ]);
  });

  it('leaves the choice to a person when two agreed goals share the subject', () => {
    const second = goal({ id: 'g-maths-2', title: 'Maths fluency', subjectId: 'maths' });
    const plan = planCleanup(
      [MATHS, second],
      INITIAL_SUBJECTS,
      [checkIn({ studySubjectId: 'maths', studyGoalId: DELETED })],
      []
    );
    expect(plan.relinks).toEqual([]);
  });

  it('does not move time off a goal that still exists, agreed or not', () => {
    const waiting = goal({ id: 'g-cs', subjectId: 'computer_science', status: 'PENDING_DISCUSSION' });
    const plan = planCleanup(
      [MATHS, waiting],
      INITIAL_SUBJECTS,
      [checkIn({ studySubjectId: 'computer_science', studyGoalId: 'g-cs' })],
      []
    );
    expect(plan.relinks).toEqual([]);
  });

  it('gives an agreed goal the one subject its title names, and leaves vague ones alone', () => {
    const plan = planCleanup([CHEMISTRY, ORGANISED], INITIAL_SUBJECTS, [], []);
    expect(plan.subjectFixes.map((f) => [f.goal.id, f.subject.id])).toEqual([
      ['g-chem', 'chemistry'],
    ]);
  });

  it('sends a deleted-goal row to the goal that is about to get its subject', () => {
    const plan = planCleanup(
      [CHEMISTRY],
      INITIAL_SUBJECTS,
      [],
      [task({ subjectId: 'chemistry', linkedGoalId: 'g-gone' })]
    );
    expect(plan.relinks.map((r) => r.to.id)).toEqual(['g-chem']);
  });
});

describe('making the changes', () => {
  beforeEach(async () => {
    await db.goals.bulkPut([MATHS, CHEMISTRY]);
    await db.checkIns.put(checkIn({ id: 'c1', studySubjectId: 'maths', studyGoalId: DELETED }));
    await db.tasks.put(task({ id: 't1', linkedGoalId: DELETED }));
  });

  it('re-files the rows, sets the subject, and records each change', async () => {
    expect(await applyCleanup('PARENT')).toBe(3);

    expect((await db.checkIns.get('c1'))?.studyGoalId).toBe('g-maths');
    expect((await db.tasks.get('t1'))?.linkedGoalId).toBe('g-maths');
    expect((await db.goals.get('g-chem'))?.subjectId).toBe('chemistry');

    const audits = await db.auditLogs.toArray();
    expect(audits.map((a) => [a.entity, a.fieldChanged]).sort()).toEqual([
      ['DailyCheckIn', 'goal'],
      ['Goal', 'subject'],
      ['Task', 'goal'],
    ]);
  });

  it('has nothing left to offer afterwards, so a second tap changes nothing', async () => {
    await applyCleanup('PARENT');
    const plan = await readCleanupPlan();
    expect(plan.relinks.length + plan.subjectFixes.length).toBe(0);
    expect(await applyCleanup('PARENT')).toBe(0);
  });
});

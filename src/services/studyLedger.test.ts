import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { DailyCheckIn, Goal, Task } from '../types';
import {
  WORK_TIME_FROM,
  entryFromTask,
  minutesForGoal,
  studyEntries,
  studyEntriesFrom,
  totalMinutes,
} from './studyLedger';
import { weeklyMinutesForGoal, weeklyMinutesBySubject } from './goalProgress';
import { logFocusBlock } from './focusSessionService';
import { setTaskCompleted } from './taskCompletionService';
import { defaultWorkMinutes } from '../components/shared/WorkTimeChips';

/**
 * Study time from every source, counted once.
 *
 * The week of 21 September finished thirteen pieces of work and reported 15%
 * of its goal hours, because only check-in minutes counted. These hold the
 * rules that fixed it: finished work counts from the cut-over, never before it;
 * time the timer recorded is never counted a second time through the work; and
 * reopened work stops counting.
 */

const MONDAY = '2026-09-28';

const task = (extra: Partial<Task>): Task => ({
  id: 'hw',
  subjectId: 'chemistry',
  title: 'Crude oil worksheet',
  dueDate: MONDAY,
  priority: 'MEDIUM',
  isHomework: true,
  isRemediation: false,
  xpValue: 50,
  completed: false,
  createdAt: 0,
  ...extra,
});

const checkIn = (extra: Partial<DailyCheckIn>): DailyCheckIn => ({
  id: 'c1',
  date: MONDAY,
  timestamp: 0,
  session: 'EVENING',
  energyLevel: 4,
  focusRating: 'NORMAL',
  completedHomeworkIds: [],
  completedRevisionMinutes: 30,
  studySubjectId: 'maths',
  xpEarned: 20,
  isDailyBaseXPAwarded: true,
  ...extra,
});

const goal = (extra: Partial<Goal>): Goal => ({
  id: 'g-chem',
  title: 'Grade 9 in Chemistry',
  category: 'ACADEMIC_GRADE_9',
  subjectId: 'chemistry',
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

describe('the study ledger', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${MONDAY}T19:00:00`));
    await emptyDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts finished work from the cut-over, against its subject and goal', () => {
    const done = task({
      completed: true,
      completedAt: new Date(`${MONDAY}T18:00:00`).getTime(),
      loggedMinutes: 45,
      linkedGoalId: 'g-chem',
    });
    expect(entryFromTask(done)).toMatchObject({
      source: 'WORK',
      date: MONDAY,
      minutes: 45,
      subjectId: 'chemistry',
      goalId: 'g-chem',
    });
  });

  it('never counts work finished before the cut-over - its check-in already did', () => {
    const before = task({
      completed: true,
      completedAt: new Date('2026-09-21T20:00:00').getTime(),
      loggedMinutes: 45,
    });
    expect(WORK_TIME_FROM > '2026-09-21').toBe(true);
    expect(entryFromTask(before)).toBeUndefined();
  });

  it('dates catch-up work time to the day it describes', () => {
    // Closed tonight by a check-in catching up Friday: the time is Friday's.
    const caughtUp = task({
      completed: true,
      completedAt: new Date(`${MONDAY}T21:00:00`).getTime(),
      loggedMinutes: 30,
      workedOn: '2026-09-25',
    });
    expect(entryFromTask(caughtUp)?.date).toBe('2026-09-25');
  });

  it('cuts over on the day work was closed, not the day it is dated to', () => {
    // Recorded through the new screens after the cut-over, so nothing else
    // counted it - even though it is about a day before the cut-over.
    const caughtUp = task({
      completed: true,
      completedAt: new Date(`${WORK_TIME_FROM}T21:00:00`).getTime(),
      loggedMinutes: 30,
      workedOn: '2026-09-23',
    });
    expect(entryFromTask(caughtUp)).toMatchObject({ date: '2026-09-23', minutes: 30 });
  });

  it('stops counting work that is reopened', () => {
    const reopened = task({ completed: false, loggedMinutes: 45 });
    expect(entryFromTask(reopened)).toBeUndefined();
  });

  it('counts check-ins and work side by side, each once', () => {
    const entries = studyEntriesFrom(
      [checkIn({})],
      [task({ completed: true, completedAt: new Date(`${MONDAY}T18:00:00`).getTime(), loggedMinutes: 45 })]
    );
    expect(totalMinutes(entries)).toBe(75);
    expect(entries.map((e) => e.source).sort()).toEqual(['CHECK_IN', 'WORK']);
  });

  it('credits a goal by the one attribution rule', () => {
    const chem = goal({});
    expect(minutesForGoal({ id: 'a', source: 'WORK', date: MONDAY, minutes: 30, subjectId: 'chemistry' }, chem)).toBe(30);
    // Tagged to a different goal: not this one's, even on the same subject.
    expect(
      minutesForGoal(
        { id: 'b', source: 'WORK', date: MONDAY, minutes: 30, subjectId: 'chemistry', goalId: 'other' },
        chem
      )
    ).toBe(0);
  });

  it('shows finished work on the goal card for the week', async () => {
    await db.tasks.add(task({ linkedGoalId: 'g-chem' }));
    await setTaskCompleted((await db.tasks.get('hw'))!, true, 'STUDENT', 45);

    expect(await weeklyMinutesForGoal(goal({}))).toBe(45);
    expect((await weeklyMinutesBySubject()).chemistry).toBe(45);
  });

  it('never counts the same hour twice when the work was done on the timer', async () => {
    await db.tasks.add(task({}));
    await logFocusBlock({ subjectId: 'chemistry', taskId: 'hw' });
    await logFocusBlock({ subjectId: 'chemistry', taskId: 'hw' });
    // Closed with "no more" beyond the timer, which is what the sheet offers.
    await setTaskCompleted((await db.tasks.get('hw'))!, true, 'STUDENT', 0);

    const week = await studyEntries({ start: MONDAY, end: '2026-10-04' });
    expect(totalMinutes(week)).toBe(50);
    expect((await weeklyMinutesBySubject()).chemistry).toBe(50);
  });

  it('keeps the time when work is reopened and closed again without being asked', async () => {
    await db.tasks.add(task({}));
    await setTaskCompleted((await db.tasks.get('hw'))!, true, 'STUDENT', 45);
    await setTaskCompleted((await db.tasks.get('hw'))!, false, 'STUDENT');
    expect((await weeklyMinutesBySubject()).chemistry).toBeUndefined();

    await setTaskCompleted((await db.tasks.get('hw'))!, true, 'STUDENT');
    expect((await weeklyMinutesBySubject()).chemistry).toBe(45);
  });
});

describe('the time chips start where the answer probably is', () => {
  it('starts on the nearest chip to the estimate', () => {
    expect(defaultWorkMinutes(0.5, 0)).toBe(30);
    expect(defaultWorkMinutes(1.2, 0)).toBe(60);
    expect(defaultWorkMinutes(3, 0)).toBe(120);
  });

  it('starts on "no more" when the timer has the time already', () => {
    expect(defaultWorkMinutes(1, 50)).toBe(0);
  });

  it('chooses nothing when there is no estimate, rather than inventing one', () => {
    expect(defaultWorkMinutes(undefined, 0)).toBeUndefined();
  });
});

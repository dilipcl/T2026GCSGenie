import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase, resetDatabase } from '../test/harness';
import { allSubjectTrends, goalTrend, goalsDrifting, subjectTrend } from './goalTrend';
import { calculateSubjectRAG } from './ragCalculator';
import { DailyCheckIn, Goal } from '../types';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

// Wednesday. The four windows are the weeks starting 08-10, 08-17, 08-24, 08-31.
const WEDNESDAY = '2026-09-02';
const WEEK_STARTS = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'];

let nextId = 0;

/** Logs `hours` against a subject on the Tuesday of the given week. */
async function log(weekStart: string, subjectId: string, hours: number) {
  const date = new Date(`${weekStart}T12:00:00`);
  date.setDate(date.getDate() + 1); // Tuesday
  const iso = date.toISOString().slice(0, 10);

  const row: DailyCheckIn = {
    id: `c${nextId++}`,
    date: iso,
    timestamp: new Date(`${iso}T18:00:00`).getTime(),
    session: 'EVENING',
    energyLevel: 4,
    focusRating: 'NORMAL',
    completedHomeworkIds: [],
    completedRevisionMinutes: hours * 60,
    studySubjectId: subjectId as DailyCheckIn['studySubjectId'],
    xpEarned: 0,
    isDailyBaseXPAwarded: false,
  };
  await db.checkIns.add(row);
}

beforeEach(async () => {
  await emptyDatabase();
  nextId = 0;
  freezeAt(WEDNESDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('subjectTrend', () => {
  it('returns four weeks, oldest first, ending with the week in progress', async () => {
    const trend = await subjectTrend('maths');
    expect(trend.points).toHaveLength(4);
    expect(trend.points.map((p) => p.week.start)).toEqual(WEEK_STARTS);
    expect(trend.points.map((p) => p.isCurrent)).toEqual([false, false, false, true]);
  });

  it('attributes each session to the week it falls in', async () => {
    await log(WEEK_STARTS[0], 'maths', 4);
    await log(WEEK_STARTS[2], 'maths', 1.5);

    const trend = await subjectTrend('maths');
    expect(trend.points.map((p) => p.hours)).toEqual([4, 0, 1.5, 0]);
  });

  it('does not mix subjects', async () => {
    await log(WEEK_STARTS[1], 'maths', 3);
    await log(WEEK_STARTS[1], 'physics', 2);

    expect((await subjectTrend('maths')).points[1].hours).toBe(3);
    expect((await subjectTrend('physics')).points[1].hours).toBe(2);
  });

  /**
   * The acceptance criterion, and the film's Act 1 thesis: four weeks of
   * declining effort must be visible while every other status still reads
   * green.
   */
  it('shows a falling line before the RAG status has moved', async () => {
    // A subject in good standing: homework kept up, no outstanding fix-ups.
    // The RAG score is built from those, so it reads green - and stays green
    // through a month of quietly declining effort, because effort over time is
    // not one of its inputs.
    await db.subjects.add({
      id: 'maths',
      name: 'Mathematics',
      shortName: 'Maths',
      examBoard: 'Edexcel',
      targetGrade: 9,
      currentEstimatedGrade: 8,
      color: '',
      icon: '📐',
      teacherName: '',
      examStructure: '',
    });

    await log(WEEK_STARTS[0], 'maths', 4);
    await log(WEEK_STARTS[1], 'maths', 3);
    await log(WEEK_STARTS[2], 'maths', 1);
    await log(WEEK_STARTS[3], 'maths', 0.5);

    const trend = await subjectTrend('maths');
    const rag = await calculateSubjectRAG('maths');

    expect(trend.direction).toBe('FALLING');
    expect(trend.message).toContain('getting less time each week');
    // Nothing else in the app has noticed yet - which is the whole point.
    expect(rag.ragStatus).toBe('GREEN');
  });

  it('calls a rising trend rising', async () => {
    await log(WEEK_STARTS[0], 'maths', 0.5);
    await log(WEEK_STARTS[1], 'maths', 1);
    await log(WEEK_STARTS[2], 'maths', 3);
    await log(WEEK_STARTS[3], 'maths', 4);

    expect((await subjectTrend('maths')).direction).toBe('RISING');
  });

  it('treats a small wobble as steady', async () => {
    await log(WEEK_STARTS[0], 'maths', 2);
    await log(WEEK_STARTS[1], 'maths', 2.2);
    await log(WEEK_STARTS[2], 'maths', 1.9);

    expect((await subjectTrend('maths')).direction).toBe('STEADY');
  });

  /**
   * The current week is partial by definition. Counting it would make every
   * subject look like it was collapsing every Monday morning, and a false
   * alarm once a week is how a signal stops being read.
   */
  it('ignores the incomplete current week when judging direction', async () => {
    await log(WEEK_STARTS[0], 'maths', 3);
    await log(WEEK_STARTS[1], 'maths', 3);
    await log(WEEK_STARTS[2], 'maths', 3);
    // Nothing logged this week yet.

    const trend = await subjectTrend('maths');
    expect(trend.points[3].hours).toBe(0);
    expect(trend.direction).toBe('STEADY');
    expect(trend.averageHours).toBe(3);
  });

  it('reports weeks with nothing logged', async () => {
    await log(WEEK_STARTS[0], 'maths', 3);

    const trend = await subjectTrend('maths');
    expect(trend.emptyWeeks).toBe(2);
    expect(trend.message).toContain('2 weeks with nothing logged');
  });
});

describe('allSubjectTrends', () => {
  it('sorts the falling subjects to the front', async () => {
    await resetDatabase();
    await db.checkIns.clear();

    await log(WEEK_STARTS[0], 'physics', 4);
    await log(WEEK_STARTS[1], 'physics', 3);
    await log(WEEK_STARTS[2], 'physics', 0.5);

    await log(WEEK_STARTS[0], 'maths', 1);
    await log(WEEK_STARTS[1], 'maths', 1);
    await log(WEEK_STARTS[2], 'maths', 3);

    const trends = await allSubjectTrends();
    expect(trends[0].subjectId).toBe('physics');
    expect(trends[0].trend.direction).toBe('FALLING');
    expect(trends.at(-1)!.subjectId).toBe('maths');
  });
});

describe('goalTrend', () => {
  const goal: Goal = {
    id: 'g1',
    title: 'Grade 9 Maths',
    category: 'ACADEMIC_GRADE_9',
    subjectId: 'maths',
    smartSpecific: '',
    smartMeasurable: '',
    smartAchievable: '',
    smartRealistic: '',
    smartTimeBound: '',
    status: 'APPROVED_LOCKED',
    ragStatus: 'GREEN',
    weeklyHoursRequired: 4,
    createdAt: 1,
  };

  it('uses the same attribution as the weekly bar', async () => {
    await db.goals.add(goal);
    await log(WEEK_STARTS[1], 'maths', 2);

    const trend = await goalTrend(goal);
    expect(trend.points.map((p) => p.hours)).toEqual([0, 2, 0, 0]);
  });

  it('finds locked goals whose four weeks are falling', async () => {
    await db.goals.add(goal);
    await log(WEEK_STARTS[0], 'maths', 4);
    await log(WEEK_STARTS[1], 'maths', 3.5);
    await log(WEEK_STARTS[2], 'maths', 0.5);

    const drifting = await goalsDrifting();
    expect(drifting.map((d) => d.goal.id)).toEqual(['g1']);
  });

  it('leaves a steady goal alone', async () => {
    await db.goals.add(goal);
    await log(WEEK_STARTS[0], 'maths', 3);
    await log(WEEK_STARTS[1], 'maths', 3);
    await log(WEEK_STARTS[2], 'maths', 3);

    expect(await goalsDrifting()).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { DailyCheckIn, ProofAttachment, SyllabusTopic, Task, WeekPlanBaseline } from '../types';
import { readWeekDetail } from './weekDetail';
import { weekExecution } from './weekExecution';

/**
 * One week opened on Progress, read the Wednesday after it closed. The week of
 * 12 Oct 2026: a plan of three, one done in the week, one done the following
 * Monday, one not done; one piece brought in by an amendment; one finished that
 * was on neither list.
 */

const MONDAY = '2026-10-12';
const at = (iso: string) => new Date(`${iso}T18:00:00`).getTime();

const task = (extra: Partial<Task>): Task => ({
  id: Math.random().toString(36),
  subjectId: 'maths',
  title: 'Homework',
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
  id: Math.random().toString(36),
  date: '2026-10-13',
  timestamp: at('2026-10-13'),
  session: 'EVENING',
  energyLevel: 4,
  focusRating: 'NORMAL',
  completedHomeworkIds: [],
  completedRevisionMinutes: 60,
  studySubjectId: 'maths',
  xpEarned: 20,
  isDailyBaseXPAwarded: true,
  ...extra,
});

const baseline = (extra: Partial<WeekPlanBaseline>): WeekPlanBaseline => ({
  id: MONDAY,
  weekStart: MONDAY,
  status: 'BASELINED',
  taskIds: ['in-week', 'later', 'not-done'],
  hours: 7,
  createdAt: 0,
  ...extra,
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T12:00:00'));
  await emptyDatabase();
  await db.subjects.bulkPut(INITIAL_SUBJECTS);
  await db.tasks.bulkPut([
    task({ id: 'in-week', title: 'Sparx', completed: true, completedAt: at('2026-10-14') }),
    task({ id: 'later', title: 'Surds', completed: true, completedAt: at('2026-10-19') }),
    task({ id: 'not-done', title: 'Venn proofs', isRemediation: true }),
    task({ id: 'amended', title: 'Storage rev', subjectId: 'computer_science' }),
    task({ id: 'extra', title: 'Eng HW', subjectId: 'english_lit', completed: true, completedAt: at('2026-10-16') }),
    task({ id: 'next-week', title: 'Art', completed: true, completedAt: at('2026-10-20') }),
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the plan against what happened', () => {
  beforeEach(async () => {
    await db.planBaselines.put(baseline({}));
    await db.planAmendments.put({
      id: 'a1',
      weekStart: MONDAY,
      addedTaskId: 'amended',
      addedTitle: 'Storage rev',
      hoursAdded: 1,
      at: at('2026-10-15'),
      by: 'STUDENT',
    });
  });

  it('marks each planned piece done in the week, done later, or not done - slipped first', async () => {
    const detail = await readWeekDetail(MONDAY);
    expect(detail.plan).toBe('AGREED');
    expect(detail.committed.map((i) => [i.id, i.outcome])).toEqual([
      ['not-done', 'NOT_DONE'],
      ['later', 'DONE_LATER'],
      ['in-week', 'DONE_IN_WEEK'],
    ]);
    expect(detail.committed[0].isFixUp).toBe(true);
  });

  it('agrees with the week bonus about how much of the promise was kept', async () => {
    const detail = await readWeekDetail(MONDAY);
    expect(detail.delivered).toBe((await weekExecution(MONDAY)).delivered);
    expect(detail.delivered).toBe(2);
  });

  it('lists amended-in work apart, and extra work as finished on neither list', async () => {
    const detail = await readWeekDetail(MONDAY);
    expect(detail.added.map((i) => i.id)).toEqual(['amended']);
    // Finished the next week, so not this week's extra.
    expect(detail.extra.map((i) => i.id)).toEqual(['extra']);
  });

  it('still counts a planned piece that was deleted', async () => {
    await db.tasks.delete('not-done');
    const detail = await readWeekDetail(MONDAY);
    expect(detail.committed).toHaveLength(2);
    expect(detail.committedGone).toBe(1);
  });
});

describe('weeks without an agreed plan', () => {
  it('keeps a plan that was sent back, with its note', async () => {
    await db.planBaselines.put(
      baseline({ status: 'DRAFT', returnedNote: 'What about other subjects?' })
    );
    const detail = await readWeekDetail(MONDAY);
    expect(detail.plan).toBe('NOT_AGREED');
    expect(detail.committed).toHaveLength(3);
    expect(detail.notes).toEqual([{ label: 'Sent back', text: 'What about other subjects?' }]);
  });

  it('calls a week with no row, or an empty one, a week with no plan', async () => {
    expect((await readWeekDetail(MONDAY)).plan).toBe('NONE');
    await db.planBaselines.put(baseline({ status: 'DRAFT', taskIds: [], writtenOffNote: 'Away' }));
    const detail = await readWeekDetail(MONDAY);
    expect(detail.plan).toBe('NONE');
    expect(detail.extra.map((i) => i.id).sort()).toEqual(['extra', 'in-week']);
  });
});

describe('how the week was recorded, and what it earned', () => {
  it('counts check-ins, days, topics and files inside the week only', async () => {
    await db.checkIns.bulkPut([
      checkIn({ id: 'c1' }),
      checkIn({ id: 'c2', session: 'MORNING' }),
      checkIn({ id: 'c3', date: '2026-10-15', studySubjectId: 'chemistry' }),
      checkIn({ id: 'c-out', date: '2026-10-19' }),
    ]);
    await db.syllabusTopics.bulkPut([
      { id: 't1', subjectId: 'maths', title: 'Geometric sequences', dateTaught: '2026-10-12' },
      { id: 't2', subjectId: 'maths', title: 'Surds', dateTaught: '2026-10-05' },
    ] as SyllabusTopic[]);
    await db.attachments.bulkPut([
      { id: 'p1', createdAt: at('2026-10-13'), caption: 'Notes' },
      { id: 'p2', createdAt: at('2026-10-14') },
      { id: 'p3', createdAt: at('2026-10-01') },
    ] as ProofAttachment[]);

    const { usage, timeBySubject, time } = await readWeekDetail(MONDAY);
    expect(usage.checkIns).toBe(3);
    expect(usage.daysCheckedIn).toBe(2);
    expect(usage.topicsAdded.map((t) => t.id)).toEqual(['t1']);
    expect([usage.filesAttached, usage.filesCaptioned]).toEqual([2, 1]);
    expect(timeBySubject).toEqual([
      { subjectId: 'maths', minutes: 120 },
      { subjectId: 'chemistry', minutes: 60 },
    ]);
    expect(time.loggedMinutes).toBe(180);
  });

  it('adds up the points earned inside the week from the XP statement', async () => {
    const { points } = await readWeekDetail(MONDAY);
    // Two pieces closed inside the week (in-week, extra), 50 XP each.
    expect(points.earned).toBeGreaterThanOrEqual(100);
    expect(points.bySource.find((s) => s.source === 'TASK')?.amount).toBe(100);
  });
});

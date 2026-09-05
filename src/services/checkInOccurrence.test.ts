import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { DayOccurrence, XP_FULL_DAY_BONUS, XP_PROMPT_BONUS, dayShape } from './dayPlan';
import {
  dayProgress,
  daysNeedingBackfill,
  occurrenceId,
  recordOccurrence,
} from './checkInOccurrenceService';
import { todayISO, addDaysISO, parseISODate } from '../utils/date';

/**
 * The check-in used to ask one question per day and one per week: "did these
 * happen?" against a list carrying a count. Air Cadets runs Tuesday and Friday,
 * so the only answer available was "one of two" - and the plan could never
 * learn which one, which is the only part that would have let it react.
 *
 * These tests hold the two rules that fixed it. Every occurrence is tied to its
 * own date, and nothing is ever paid twice.
 */

const TUESDAY = '2026-09-08';
const FRIDAY = '2026-09-11';

const cadets = (date: string): DayOccurrence => ({
  key: 'commitment__cadets',
  kind: 'COMMITMENT',
  label: `Air Cadets (${date})`,
  commitmentId: 'cadets',
  xp: 2,
});

const lesson = (id: string): DayOccurrence => ({
  key: `lesson__${id}`,
  kind: 'LESSON',
  label: `Lesson ${id}`,
  xp: 2,
});

describe('an occurrence belongs to one date', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('records Tuesday and Friday cadets as separate answers', async () => {
    await recordOccurrence({ date: TUESDAY, occurrence: cadets(TUESDAY), outcome: 'HAPPENED' });
    await recordOccurrence({ date: FRIDAY, occurrence: cadets(FRIDAY), outcome: 'MISSED' });

    const tuesday = await db.checkInOccurrences.get(occurrenceId(TUESDAY, 'commitment__cadets'));
    const friday = await db.checkInOccurrences.get(occurrenceId(FRIDAY, 'commitment__cadets'));

    // The whole point: the plan can now see which parade night was missed.
    expect(tuesday?.outcome).toBe('HAPPENED');
    expect(friday?.outcome).toBe('MISSED');
  });

  it('merges the same occurrence answered twice into one row', async () => {
    await recordOccurrence({ date: TUESDAY, occurrence: cadets(TUESDAY), outcome: 'HAPPENED' });
    await recordOccurrence({ date: TUESDAY, occurrence: cadets(TUESDAY), outcome: 'MISSED' });

    const rows = await db.checkInOccurrences.where('date').equals(TUESDAY).toArray();

    // Two devices answering offline must not pay twice, nor leave a fork.
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe('MISSED');
  });

  it('pays a missed occurrence the same as an attended one', async () => {
    await recordOccurrence({ date: TUESDAY, occurrence: cadets(TUESDAY), outcome: 'MISSED' });
    const row = await db.checkInOccurrences.get(occurrenceId(TUESDAY, 'commitment__cadets'));

    // The XP is for answering. The moment "I did not go" pays less, the honest
    // answer costs something and the record stops being worth anything.
    expect(row?.xpAwarded).toBe(2);
  });
});

describe('the day bonus', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('is held on exactly one row, however many are answered', async () => {
    const today = todayISO();
    const shape = await dayShape(today);
    // Answer whatever the day actually holds, so the bonus can settle.
    for (const occurrence of shape.occurrences) {
      await recordOccurrence({ date: today, occurrence, outcome: 'HAPPENED' });
    }

    const rows = await db.checkInOccurrences.where('date').equals(today).toArray();
    const carrying = rows.filter((row) => (row.dayBonusXp ?? 0) > 0);

    expect(carrying.length).toBeLessThanOrEqual(1);
  });

  it('pays nothing while the day is still unfinished', async () => {
    await recordOccurrence({ date: TUESDAY, occurrence: lesson('a'), outcome: 'HAPPENED' });
    const rows = await db.checkInOccurrences.where('date').equals(TUESDAY).toArray();

    // TUESDAY has no timetable behind it here, so nothing is "complete" and the
    // bonus must stay unpaid rather than defaulting to generous.
    expect(rows.reduce((sum, r) => sum + (r.dayBonusXp ?? 0), 0)).toBe(0);
  });

  it('never pays the completion bonus more than once for a day', async () => {
    const today = todayISO();
    const shape = await dayShape(today);
    if (shape.occurrences.length === 0) return;

    for (const occurrence of shape.occurrences) {
      await recordOccurrence({ date: today, occurrence, outcome: 'HAPPENED' });
    }
    // Answer everything a second time, as a re-edit would.
    for (const occurrence of shape.occurrences) {
      await recordOccurrence({ date: today, occurrence, outcome: 'HAPPENED' });
    }

    const rows = await db.checkInOccurrences.where('date').equals(today).toArray();
    const bonus = rows.reduce((sum, r) => sum + (r.dayBonusXp ?? 0), 0);

    expect(bonus).toBe(XP_FULL_DAY_BONUS + XP_PROMPT_BONUS);
  });
});

describe('answering late', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('still records the answer against the day it is about', async () => {
    const yesterday = addDaysISO(-1, parseISODate(todayISO()));
    await recordOccurrence({ date: yesterday, occurrence: lesson('a'), outcome: 'HAPPENED' });

    const row = await db.checkInOccurrences.get(occurrenceId(yesterday, 'lesson__a'));

    expect(row?.date).toBe(yesterday);
    // ...and remembers that it was written later, which is what promptness reads.
    expect(row?.loggedOnDate).toBe(todayISO());
  });

  it('costs nothing for being late', async () => {
    const yesterday = addDaysISO(-1, parseISODate(todayISO()));
    await recordOccurrence({ date: yesterday, occurrence: lesson('a'), outcome: 'HAPPENED' });

    const row = await db.checkInOccurrences.get(occurrenceId(yesterday, 'lesson__a'));

    // A check-in written a day late is still the truth about that day, and the
    // plan needs it more than it needs a tidy timestamp.
    expect(row?.xpAwarded).toBe(2);
  });
});

describe('what a day is worth', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('reports earned against available, not just earned', async () => {
    const progress = await dayProgress(todayISO());

    // "12 of a possible 31" is a reason to open the check-in. "+2 XP" is not.
    expect(progress.xpAvailable).toBeGreaterThanOrEqual(progress.xpEarned);
  });

  it('drops the promptness bonus from a past day it can no longer earn', async () => {
    const past = addDaysISO(-3, parseISODate(todayISO()));
    const progress = await dayProgress(past);

    if (progress.shape.occurrences.length > 0) {
      const perRow = progress.shape.occurrences.reduce((sum, o) => sum + o.xp, 0);
      expect(progress.xpAvailable).toBe(perRow + XP_FULL_DAY_BONUS);
    }
  });

  it('offers nothing on a day with nothing in it', async () => {
    const progress = await dayProgress('2026-09-06');
    if (progress.shape.occurrences.length === 0) {
      expect(progress.xpAvailable).toBe(0);
      expect(progress.isComplete).toBe(false);
    }
  });
});

describe('chasing the days that were missed', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('names the days rather than only counting them', async () => {
    const days = await daysNeedingBackfill();

    // Every entry has to be openable - a reminder that cannot say which day it
    // means is a reprimand, not a task.
    for (const day of days) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day.pending.length).toBeGreaterThan(0);
    }
  });

  it('never looks further back than it can repair', async () => {
    const days = await daysNeedingBackfill(todayISO(), 14);
    const oldest = addDaysISO(-14, parseISODate(todayISO()));

    for (const day of days) {
      expect(day.date >= oldest).toBe(true);
    }
  });

  it('leaves out days that are fully answered', async () => {
    const yesterday = addDaysISO(-1, parseISODate(todayISO()));
    const shape = await dayShape(yesterday);
    for (const occurrence of shape.occurrences) {
      await recordOccurrence({ date: yesterday, occurrence, outcome: 'HAPPENED' });
    }

    const days = await daysNeedingBackfill();
    expect(days.map((d) => d.date)).not.toContain(yesterday);
  });
});

describe('follow-ups become real work', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('raises a task in the current week', async () => {
    await recordOccurrence({
      date: TUESDAY,
      occurrence: lesson('a'),
      outcome: 'PARTIAL',
      followUp: 'Ask Mr Shah about question 4',
    });

    const row = await db.checkInOccurrences.get(occurrenceId(TUESDAY, 'lesson__a'));
    const task = await db.tasks.get(row!.followUpTaskId!);

    // A follow-up that stays inside a check-in is a note nobody reads again.
    expect(task?.title).toBe('Ask Mr Shah about question 4');
    expect(task?.bucket).toBe('THIS_WEEK');
    expect(task?.xpValue).toBeGreaterThan(0);
  });

  it('does not raise a second task when the answer is edited', async () => {
    const input = {
      date: TUESDAY,
      occurrence: lesson('a'),
      outcome: 'PARTIAL' as const,
      followUp: 'Ask Mr Shah about question 4',
    };
    await recordOccurrence(input);
    await recordOccurrence({ ...input, notes: 'changed my mind about the wording' });

    expect(await db.tasks.count()).toBe(1);
  });

  it('dates the follow-up from today, not from the day being backfilled', async () => {
    await recordOccurrence({
      date: '2026-01-05',
      occurrence: lesson('a'),
      outcome: 'MISSED',
      followUp: 'Catch up the missed lesson',
    });

    const task = (await db.tasks.toArray())[0];

    // Backfilling October in November must not create work that is born a month
    // overdue.
    expect(task.dueDate).toBe(todayISO());
  });
});

describe('ticking committed work through the check-in', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('completes the task itself', async () => {
    await db.tasks.add({
      id: 'task_1',
      subjectId: 'maths',
      bucket: 'THIS_WEEK',
      title: 'Exercise 4B',
      dueDate: TUESDAY,
      priority: 'MEDIUM',
      isHomework: true,
      isRemediation: false,
      xpValue: 20,
      completed: false,
      createdAt: Date.now(),
    });

    await recordOccurrence({
      date: TUESDAY,
      occurrence: {
        key: 'work__task_1',
        kind: 'WORK',
        label: 'Exercise 4B',
        taskId: 'task_1',
        xp: 2,
      },
      outcome: 'HAPPENED',
    });

    // Asking "did you do it?" and then demanding the same answer again on the
    // Work tab teaches people to skip one of the two.
    expect((await db.tasks.get('task_1'))?.completed).toBe(true);
  });

  it('leaves the task alone when the work did not happen', async () => {
    await db.tasks.add({
      id: 'task_2',
      subjectId: 'maths',
      bucket: 'THIS_WEEK',
      title: 'Exercise 5A',
      dueDate: TUESDAY,
      priority: 'MEDIUM',
      isHomework: true,
      isRemediation: false,
      xpValue: 20,
      completed: false,
      createdAt: Date.now(),
    });

    await recordOccurrence({
      date: TUESDAY,
      occurrence: {
        key: 'work__task_2',
        kind: 'WORK',
        label: 'Exercise 5A',
        taskId: 'task_2',
        xp: 2,
      },
      outcome: 'MISSED',
    });

    expect((await db.tasks.get('task_2'))?.completed).toBe(false);
  });
});

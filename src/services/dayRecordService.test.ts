import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { Task } from '../types';
import { dayMatches, dayRecords, summarise } from './dayRecordService';

/**
 * The app recorded a great deal and showed almost none of it back. A note typed
 * against a Physics lesson was stored faithfully and rendered nowhere
 * afterwards; the Evidence tab knew about attachments but not notes; the
 * activity feed knew about changes but not what was said. These pin the
 * assembling of a day into one readable thing.
 */

const TODAY = '2026-09-07';
const YESTERDAY = '2026-09-06';

beforeEach(async () => {
  await emptyDatabase();
});

async function lesson(date: string, over: Record<string, unknown> = {}) {
  await db.checkInOccurrences.add({
    id: `${date}__lesson__x${Math.random()}`,
    date,
    occurrenceKey: `lesson__${Math.random()}`,
    kind: 'LESSON',
    label: 'Physics',
    subjectId: 'physics',
    outcome: 'HAPPENED',
    xpAwarded: 2,
    dayBonusXp: 0,
    loggedOnDate: date,
    loggedAt: Date.parse(`${date}T18:00:00`),
    loggedBy: 'STUDENT',
    ...over,
  } as never);
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: `task_${Math.random()}`,
    subjectId: 'maths',
    title: 'Past paper questions',
    dueDate: TODAY,
    priority: 'MEDIUM',
    completed: true,
    isHomework: true,
    isRemediation: false,
    xpValue: 50,
    createdAt: Date.parse('2026-09-01T09:00:00'),
    completedAt: Date.parse(`${TODAY}T19:00:00`),
    ...over,
  } as Task;
}

describe('assembling a day', () => {
  it('says nothing about days where nothing happened', async () => {
    expect(await dayRecords(14, TODAY)).toEqual([]);
  });

  it('gathers the day a lesson was answered on', async () => {
    await lesson(TODAY);

    const [day] = await dayRecords(14, TODAY);
    expect(day.date).toBe(TODAY);
    expect(day.occurrences).toHaveLength(1);
    expect(day.answered).toBe(1);
  });

  it('puts the most recent day first', async () => {
    await lesson(YESTERDAY);
    await lesson(TODAY);

    expect((await dayRecords(14, TODAY)).map((d) => d.date)).toEqual([TODAY, YESTERDAY]);
  });

  it('files work under the day it was finished, not the day it was due', async () => {
    // Dated by completion: work due Monday and finished Tuesday belongs to
    // Tuesday's record, which is the day somebody is trying to remember.
    await db.tasks.add(
      task({ dueDate: '2026-09-01', completedAt: Date.parse(`${TODAY}T19:00:00`) })
    );

    const [day] = await dayRecords(14, TODAY);
    expect(day.date).toBe(TODAY);
    expect(day.work).toHaveLength(1);
  });

  it('ignores work that is not finished', async () => {
    await db.tasks.add(task({ completed: false, completedAt: undefined }));
    expect(await dayRecords(14, TODAY)).toEqual([]);
  });

  it('stops at the window it was asked for', async () => {
    await lesson('2026-08-01');
    expect(await dayRecords(14, TODAY)).toEqual([]);
    expect((await dayRecords(60, TODAY)).map((d) => d.date)).toEqual(['2026-08-01']);
  });
});

/**
 * The notes are the half that was rendered nowhere. Gathered onto the day
 * rather than left on the rows they came from, because "what did we say about
 * Tuesday" is a question about the day.
 */
describe('everything anybody wrote', () => {
  it('surfaces a note left against a lesson', async () => {
    await lesson(TODAY, { notes: 'Did not follow the circuit diagram' });

    const [day] = await dayRecords(14, TODAY);
    expect(day.notes).toHaveLength(1);
    expect(day.notes[0].kind).toBe('OCCURRENCE');
    expect(day.notes[0].text).toBe('Did not follow the circuit diagram');
    expect(day.notes[0].about).toBe('Physics');
  });

  it('keeps a follow-up apart from an ordinary note', async () => {
    await lesson(TODAY, { notes: 'Struggled', followUp: 'Ask Mr Smith on Tuesday' });

    const [day] = await dayRecords(14, TODAY);
    expect(day.notes.map((n) => n.kind).sort()).toEqual(['FOLLOW_UP', 'OCCURRENCE']);
  });

  it('unpacks the structured check-in fields, each under its own heading', async () => {
    await db.checkIns.add({
      id: 'ci_1',
      date: TODAY,
      timestamp: Date.parse(`${TODAY}T21:00:00`),
      energyLevel: 4,
      focusRating: 'HIGH',
      completedHomeworkIds: [],
      completedRevisionMinutes: 30,
      xpEarned: 20,
      isDailyBaseXPAwarded: true,
      structuredNotes: {
        keyLearning: 'Ohms law finally made sense',
        actionForTomorrow: 'Redo question 4',
      },
    } as never);

    const [day] = await dayRecords(14, TODAY);
    const headings = day.notes.map((n) => n.about);
    expect(headings).toContain('What I learned');
    expect(headings).toContain('For tomorrow');
    expect(day.notes.every((n) => n.kind === 'CHECK_IN')).toBe(true);
  });

  it('falls back to the legacy notes field on an older check-in', async () => {
    await db.checkIns.add({
      id: 'ci_old',
      date: TODAY,
      timestamp: Date.parse(`${TODAY}T21:00:00`),
      energyLevel: 3,
      focusRating: 'NORMAL',
      completedHomeworkIds: [],
      completedRevisionMinutes: 0,
      xpEarned: 10,
      isDailyBaseXPAwarded: true,
      notes: 'Quiet evening',
    } as never);

    const [day] = await dayRecords(14, TODAY);
    expect(day.notes[0].text).toBe('Quiet evening');
  });

  it('ignores a note that is only whitespace', async () => {
    await lesson(TODAY, { notes: '   ' });
    const [day] = await dayRecords(14, TODAY);
    expect(day.notes).toEqual([]);
  });
});

describe('searching the record', () => {
  it('finds a day by a word from a note, not just by title', async () => {
    await lesson(TODAY, { notes: 'circuit diagram was confusing' });
    const [day] = await dayRecords(14, TODAY);

    expect(dayMatches(day, 'circuit')).toBe(true);
    expect(dayMatches(day, 'trigonometry')).toBe(false);
  });

  it('requires every term, so two words narrow rather than widen', async () => {
    await lesson(TODAY, { notes: 'circuit diagram' });
    const [day] = await dayRecords(14, TODAY);

    expect(dayMatches(day, 'physics circuit')).toBe(true);
    expect(dayMatches(day, 'physics trigonometry')).toBe(false);
  });

  it('matches everything on an empty query', async () => {
    await lesson(TODAY);
    const [day] = await dayRecords(14, TODAY);
    expect(dayMatches(day, '   ')).toBe(true);
  });
});

describe('the totals across the record', () => {
  it('counts what is actually there', async () => {
    await lesson(TODAY, { notes: 'a note' });
    await db.tasks.add(task());

    const totals = summarise(await dayRecords(14, TODAY));
    expect(totals.days).toBe(1);
    expect(totals.occurrencesAnswered).toBe(1);
    expect(totals.workFinished).toBe(1);
    expect(totals.notesWritten).toBe(1);
    expect(totals.xp).toBe(52);
  });
});

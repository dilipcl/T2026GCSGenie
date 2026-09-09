import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { Task } from '../types';
import { dayMatches, dayRecords, notesForWeek, summarise } from './dayRecordService';

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

/**
 * The weekly review had every number about the week and not one word from it,
 * so "how did it go?" was answered by four statistics while the sentences
 * somebody wrote at the time sat unread.
 */
describe('the notes from one week', () => {
  const WEEK_START = '2026-08-31'; // Monday
  const WEEK_END = '2026-09-06'; // Sunday

  it('gathers what was written inside the week', async () => {
    await lesson(WEEK_START, { notes: 'Monday note' });
    await lesson(WEEK_END, { notes: 'Sunday note' });

    const days = await notesForWeek(WEEK_START);
    expect(days.flatMap((d) => d.notes.map((n) => n.text)).sort()).toEqual([
      'Monday note',
      'Sunday note',
    ]);
  });

  it('leaves out the week either side of it', async () => {
    await lesson('2026-08-30', { notes: 'the Sunday before' });
    await lesson('2026-09-07', { notes: 'the Monday after' });

    expect(await notesForWeek(WEEK_START)).toEqual([]);
  });

  it('keeps the day a note was written on', async () => {
    // A note is about a moment. Stripping the day off it turns a record into a
    // pile of sentences.
    await lesson('2026-09-02', { notes: 'Wednesday' });

    const [day] = await notesForWeek(WEEK_START);
    expect(day.date).toBe('2026-09-02');
  });

  it('says nothing for a week nobody wrote in', async () => {
    await lesson(WEEK_START);
    expect(await notesForWeek(WEEK_START)).toEqual([]);
  });
});

/**
 * A reason is tapped rather than typed, which makes it the commonest thing
 * anybody will ever say about a lesson - a review showing only free text would
 * show almost nothing.
 */
describe('reasons as part of what was said', () => {
  it('records the reason behind a missed lesson', async () => {
    await lesson(TODAY, { outcome: 'MISSED', reasonCategory: 'ILLNESS' });

    const [day] = await dayRecords(14, TODAY);
    const reason = day.notes.find((n) => n.kind === 'REASON');
    expect(reason?.text).toBe('Illness or rest');
    expect(reason?.about).toBe('Physics');
  });

  it('carries it into the weekly review alongside anything typed', async () => {
    await lesson('2026-09-02', {
      outcome: 'PARTIAL',
      reasonCategory: 'MOCK_PREP',
      notes: 'only got halfway',
    });

    const [day] = await notesForWeek('2026-08-31');
    expect(day.notes.map((n) => n.kind).sort()).toEqual(['OCCURRENCE', 'REASON']);
  });

  it('says nothing where no reason was given', async () => {
    await lesson(TODAY, { outcome: 'MISSED' });

    const [day] = await dayRecords(14, TODAY);
    expect(day.notes.filter((n) => n.kind === 'REASON')).toEqual([]);
  });

  it('does not count a tapped reason as a note somebody wrote', async () => {
    await lesson(TODAY, { outcome: 'MISSED', reasonCategory: 'ILLNESS' });

    // It belongs in the record, but reporting it as a written note would claim
    // somebody sat down and wrote something.
    expect(summarise(await dayRecords(14, TODAY)).notesWritten).toBe(0);
  });

  it('still counts what was actually written', async () => {
    await lesson(TODAY, { outcome: 'MISSED', reasonCategory: 'ILLNESS', notes: 'off sick' });
    expect(summarise(await dayRecords(14, TODAY)).notesWritten).toBe(1);
  });
});

/**
 * A conversation about a piece of work is as much a part of the day as a note
 * typed against a lesson. Left out, the record showed everything anybody wrote
 * except the half addressed to another person - which is the half most likely
 * to matter when somebody reads a week back.
 */
describe('the conversation about a piece of work', () => {
  const askedAt = Date.parse(`${TODAY}T20:00:00`);

  async function comment(over: Record<string, unknown> = {}) {
    await db.activityComments.add({
      id: `cmt_${Math.random()}`,
      activityId: 'a1',
      subjectEntityId: 'task_x',
      kind: 'COMMENT',
      createdAt: askedAt,
      authorRole: 'PARENT',
      authorDeviceId: 'd1',
      text: 'Which questions did you actually do?',
      needsResponse: true,
      ...over,
    } as never);
  }

  it('shows a comment on the day it was written', async () => {
    await db.tasks.add(task({ id: 'task_x', title: 'Physics past paper' }));
    await comment();

    const [day] = await dayRecords(14, TODAY);
    const found = day.notes.find((n) => n.kind === 'COMMENT');
    expect(found?.text).toBe('Which questions did you actually do?');
  });

  it('names the work it is about, so it reads on its own', async () => {
    await db.tasks.add(task({ id: 'task_x', title: 'Physics past paper' }));
    await comment();

    const [day] = await dayRecords(14, TODAY);
    expect(day.notes.find((n) => n.kind === 'COMMENT')?.about).toBe('Physics past paper');
  });

  it('files it by when it was written, not by the work it is about', async () => {
    // A question asked on Thursday about Tuesday's homework belongs to
    // Thursday - that is the day somebody is trying to remember.
    await db.tasks.add(
      task({ id: 'task_x', completedAt: Date.parse('2026-09-02T10:00:00') })
    );
    await comment();

    const withComment = (await dayRecords(14, TODAY)).find((d) =>
      d.notes.some((n) => n.kind === 'COMMENT')
    );
    expect(withComment?.date).toBe(TODAY);
  });

  it('tells an evidence request apart from an ordinary remark', async () => {
    await db.tasks.add(task({ id: 'task_x' }));
    await comment({ kind: 'EVIDENCE_REQUEST', text: 'Send the notebook link' });
    await comment({ kind: 'EVIDENCE_NOTE', text: 'Classwork, book at school' });

    const [day] = await dayRecords(14, TODAY);
    expect(day.notes.map((n) => n.kind).sort()).toEqual(['ASKED', 'EXPLAINED']);
  });

  it('counts comments, and still counts a tapped reason as neither', async () => {
    await db.tasks.add(task({ id: 'task_x' }));
    await comment();
    await lesson(TODAY, { outcome: 'MISSED', reasonCategory: 'ILLNESS' });

    const totals = summarise(await dayRecords(14, TODAY));
    expect(totals.comments).toBe(1);
    expect(totals.notesWritten).toBe(1);
  });

  it('survives a comment about a record that no longer exists', async () => {
    await comment();

    const [day] = await dayRecords(14, TODAY);
    expect(day.notes.find((n) => n.kind === 'COMMENT')?.about).toBe('a piece of work');
  });
});

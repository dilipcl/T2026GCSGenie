import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { DayOccurrence } from './dayPlan';
import { recordOccurrence } from './checkInOccurrenceService';
import { addSyllabusTopic } from './topicService';
import {
  addPlannedTopics,
  currentHalfTerm,
  halfTermWindow,
  markTopicTaught,
  planState,
  removePlannedTopic,
  topicLines,
  yearNumber,
} from './schoolPlan';
import { subjectTopics } from './topicTimeline';

/**
 * The school's plan, entered from a scheme of work: half-terms placed in real
 * dates, a topic moving from planned to taught by nothing more than a lesson
 * tagged to it, and pasting a list that overlaps what is already logged.
 * Clock pinned to Monday 19 Oct 2026, Autumn 1, Tejas in Year 10.
 */

const TODAY = '2026-10-19';

const lesson = (id: string): DayOccurrence => ({
  key: `lesson__${id}`,
  kind: 'LESSON',
  label: 'Chemistry',
  subjectId: 'chemistry',
  xp: 2,
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T18:00:00`));
  await emptyDatabase();
  await db.subjects.bulkPut(INITIAL_SUBJECTS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('half-terms as dates', () => {
  it('places a Year 10 half-term in this school year, and Year 11 in the next', () => {
    expect(halfTermWindow('AUT1', 'YEAR_10', 10, TODAY)).toEqual({
      start: '2026-09-01',
      end: '2026-10-31',
    });
    expect(halfTermWindow('SPR1', 'YEAR_10', 10, TODAY).start).toBe('2027-01-01');
    expect(halfTermWindow('AUT1', 'YEAR_11', 10, TODAY).start).toBe('2027-09-01');
  });

  it('knows which half-term today is in', () => {
    expect(currentHalfTerm('2026-10-19')).toBe('AUT1');
    expect(currentHalfTerm('2026-11-02')).toBe('AUT2');
    expect(currentHalfTerm('2027-03-01')).toBe('SPR2');
  });

  it('reads the year group however the profile writes it', () => {
    expect(yearNumber('Year 10')).toBe(10);
    expect(yearNumber('Y11')).toBe(11);
    expect(yearNumber(undefined)).toBe(10);
    expect(yearNumber('Sixth form')).toBe(10);
  });

  it('calls a topic behind only once its half-term is over', () => {
    const topic = (plannedTerm: 'AUT1' | 'AUT2', yearGroup: 'YEAR_10' | 'YEAR_11' = 'YEAR_10') => ({
      plannedTerm,
      yearGroup,
    });
    expect(planState(topic('AUT1'), false, 10, '2026-10-19')).toBe('DUE_NOW');
    expect(planState(topic('AUT1'), false, 10, '2026-11-02')).toBe('BEHIND');
    expect(planState(topic('AUT2'), false, 10, '2026-10-19')).toBe('LATER');
    expect(planState(topic('AUT1'), true, 10, '2026-11-02')).toBe('TAUGHT');
    expect(planState({ yearGroup: 'YEAR_10' }, false, 10, TODAY)).toBeUndefined();
  });
});

describe('entering the plan', () => {
  it('takes one topic per line, bullets and numbers stripped, blanks dropped', () => {
    expect(topicLines('- Atomic structure\n\n2. Periodic table\n• Ionic bonding\r\n  ')).toEqual([
      'Atomic structure',
      'Periodic table',
      'Ionic bonding',
    ]);
  });

  it('adds planned topics untaught, with their half-term, in one audit line', async () => {
    const result = await addPlannedTopics({
      subjectId: 'chemistry',
      term: 'AUT2',
      text: 'Ionic bonding\nCovalent bonding\nCovalent bonding',
    });
    expect(result).toEqual({ added: 2, matched: 0 });

    const topics = await db.syllabusTopics.where('subjectId').equals('chemistry').toArray();
    expect(topics.map((t) => [t.title, t.plannedTerm, t.dateTaught, t.unit])).toEqual(
      expect.arrayContaining([
        ['Ionic bonding', 'AUT2', undefined, 'Autumn 2'],
        ['Covalent bonding', 'AUT2', undefined, 'Autumn 2'],
      ])
    );
    expect(await db.auditLogs.count()).toBe(1);
  });

  it('lines up a topic already logged rather than adding it twice', async () => {
    const logged = await addSyllabusTopic({
      subjectId: 'chemistry',
      title: 'Cracking Hydrocarbons',
      unit: 'Organic',
      dateTaught: '2026-10-07',
    });
    const result = await addPlannedTopics({
      subjectId: 'chemistry',
      term: 'AUT1',
      text: 'cracking  hydrocarbons\nAlkenes',
    });
    expect(result).toEqual({ added: 1, matched: 1 });
    const again = await db.syllabusTopics.get(logged.id);
    expect(again).toMatchObject({ plannedTerm: 'AUT1', dateTaught: '2026-10-07' });
  });
});

describe('planned to taught', () => {
  it('counts as taught once a lesson is tagged, with no date entered', async () => {
    await addPlannedTopics({ subjectId: 'chemistry', term: 'AUT1', text: 'Electrolysis' });
    const topic = (await db.syllabusTopics.toArray())[0];
    let row = (await subjectTopics('chemistry')).topics[0];
    expect(row.plan).toBe('DUE_NOW');
    expect(row.journey.taught).toBeUndefined();

    await recordOccurrence({
      date: '2026-10-16',
      occurrence: lesson('a'),
      outcome: 'HAPPENED',
      topicId: topic.id,
    });
    row = (await subjectTopics('chemistry')).topics[0];
    expect(row.plan).toBe('TAUGHT');
    expect(row.journey.taught).toBe('2026-10-16');
  });

  it('can be marked taught without a lesson', async () => {
    await addPlannedTopics({ subjectId: 'chemistry', term: 'AUT1', text: 'Electrolysis' });
    const topic = (await db.syllabusTopics.toArray())[0];
    await markTopicTaught(topic.id);
    expect((await db.syllabusTopics.get(topic.id))?.dateTaught).toBe(TODAY);
    expect((await subjectTopics('chemistry')).topics[0].plan).toBe('TAUGHT');
  });
});

describe('taking a topic off the plan', () => {
  it('deletes a planned topic nothing points at', async () => {
    await addPlannedTopics({ subjectId: 'chemistry', term: 'AUT2', text: 'Electrolysis' });
    const topic = (await db.syllabusTopics.toArray())[0];
    expect(await removePlannedTopic(topic.id)).toBe('DELETED');
    expect(await db.syllabusTopics.get(topic.id)).toBeUndefined();
  });

  it('keeps a topic something is tagged to, and only clears its half-term', async () => {
    await addPlannedTopics({ subjectId: 'chemistry', term: 'AUT2', text: 'Electrolysis' });
    const topic = (await db.syllabusTopics.toArray())[0];
    await db.tasks.add({
      id: 'hw',
      subjectId: 'chemistry',
      title: 'Electrolysis sheet',
      dueDate: TODAY,
      priority: 'MEDIUM',
      isHomework: true,
      isRemediation: false,
      linkedTopicId: topic.id,
      xpValue: 20,
      completed: false,
      createdAt: 0,
    });
    expect(await removePlannedTopic(topic.id)).toBe('UNPLANNED');
    const kept = await db.syllabusTopics.get(topic.id);
    expect(kept?.title).toBe('Electrolysis');
    expect(kept?.plannedTerm).toBeUndefined();
  });
});

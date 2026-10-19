import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { DayOccurrence } from './dayPlan';
import { recordOccurrence } from './checkInOccurrenceService';
import { addSyllabusTopic, setTopicSpecRef } from './topicService';
import { logFocusBlock, wrapUpFocusBlock } from './focusSessionService';
import { REVISE_WITHIN_DAYS, subjectTopics, topicLog } from './topicTimeline';
import { Task } from '../types';

/**
 * The five steps every topic is shown in - taught, homework, revised, notes,
 * secure - and the log that lists every topic that way.
 *
 * Nothing here is entered for the purpose. Each step is filled by something
 * that already happens: a lesson answered in the check-in, homework closed, a
 * focus block, a photo or a note. These tests pin that each source lands in
 * the right step and no other, because a revision session counted as homework
 * would make "is he keeping up?" and "is he going back over it?" the same
 * question.
 */

const TODAY = '2026-10-19';

const lesson = (id: string): DayOccurrence => ({
  key: `lesson__${id}`,
  kind: 'LESSON',
  label: 'Biology',
  subjectId: 'biology',
  xp: 2,
});

const task = (extra: Partial<Task>): Task => ({
  id: Math.random().toString(36),
  subjectId: 'biology',
  title: 'Work',
  dueDate: '2026-10-10',
  priority: 'MEDIUM',
  isHomework: true,
  isRemediation: false,
  xpValue: 20,
  completed: false,
  createdAt: 0,
  ...extra,
});

const journeyOf = async (topicId: string) =>
  (await subjectTopics('biology')).topics.find((t) => t.topic.id === topicId)!.journey;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T18:00:00`));
  await emptyDatabase();
  await db.subjects.bulkPut(INITIAL_SUBJECTS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('each source lands in its own step', () => {
  it('takes the teaching date entered, or else the first lesson', async () => {
    const dated = await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Pathogens',
      unit: 'Infection',
      dateTaught: '2026-10-07',
    });
    const undated = await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Vaccines',
      unit: 'Infection',
    });
    await db.syllabusTopics.update(undated.id, { dateTaught: undefined });
    await recordOccurrence({
      date: '2026-10-09',
      occurrence: lesson('a'),
      outcome: 'HAPPENED',
      topicId: undated.id,
    });
    await recordOccurrence({
      date: '2026-10-14',
      occurrence: lesson('b'),
      outcome: 'HAPPENED',
      topicId: undated.id,
    });

    expect((await journeyOf(dated.id)).taught).toBe('2026-10-07');
    const j = await journeyOf(undated.id);
    expect(j.taught).toBe('2026-10-09');
    expect(j.lessons).toBe(2);
  });

  it('keeps homework, revision and fix-ups apart', async () => {
    const topic = await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Pathogens',
      unit: 'Infection',
      dateTaught: '2026-10-07',
    });
    const done = new Date('2026-10-12T19:00:00').getTime();
    await db.tasks.bulkPut([
      task({ id: 'hw1', linkedTopicId: topic.id, completed: true, completedAt: done }),
      task({ id: 'hw2', linkedTopicId: topic.id }),
      task({
        id: 'rev',
        isHomework: false,
        linkedTopicId: topic.id,
        completed: true,
        completedAt: new Date('2026-10-15T19:00:00').getTime(),
      }),
      // Revision planned and not done is not revision yet.
      task({ id: 'rev-open', isHomework: false, linkedTopicId: topic.id }),
      task({ id: 'fix', isHomework: false, isRemediation: true, linkedTopicId: topic.id }),
    ]);
    const block = await logFocusBlock({ subjectId: 'biology', topicId: topic.id });
    await wrapUpFocusBlock(block, { note: 'Pathogen types table' });

    const j = await journeyOf(topic.id);
    expect(j.homework).toEqual({ set: 2, done: 1, lastDone: '2026-10-12' });
    expect(j.revision.sessions).toBe(2);
    expect(j.revision.last).toBe(TODAY);
    expect(j.fixUps).toEqual({ open: 1, done: 0 });
  });

  it('counts a lesson note as notes, and a lesson with no note as nothing', async () => {
    const topic = await addSyllabusTopic({ subjectId: 'biology', title: 'Cells', unit: 'Cells' });
    await recordOccurrence({
      date: '2026-10-13',
      occurrence: lesson('a'),
      outcome: 'HAPPENED',
      topicId: topic.id,
    });
    expect((await journeyOf(topic.id)).notes.lessonNotes).toBe(0);
    await recordOccurrence({
      date: '2026-10-14',
      occurrence: lesson('b'),
      outcome: 'HAPPENED',
      notes: 'Eukaryotic vs prokaryotic',
      topicId: topic.id,
    });
    expect((await journeyOf(topic.id)).notes.lessonNotes).toBe(1);
  });

  it('never counts a missed lesson as teaching', async () => {
    const topic = await addSyllabusTopic({ subjectId: 'biology', title: 'Cells', unit: 'Cells' });
    await db.syllabusTopics.update(topic.id, { dateTaught: undefined });
    await recordOccurrence({
      date: '2026-10-13',
      occurrence: lesson('a'),
      outcome: 'MISSED',
      topicId: topic.id,
    });
    const j = await journeyOf(topic.id);
    expect(j.taught).toBeUndefined();
    expect(j.lessons).toBe(0);
  });
});

describe('the one line worth saying', () => {
  it('names an open fix-up before anything else', async () => {
    const topic = await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Pathogens',
      unit: 'Infection',
      dateTaught: '2026-09-01',
    });
    await db.tasks.put(task({ isRemediation: true, isHomework: false, linkedTopicId: topic.id }));
    expect((await journeyOf(topic.id)).gap).toBe('1 fix-up open');
  });

  it('says there are no notes, then that it has not been revised, then nothing', async () => {
    const topic = await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Pathogens',
      unit: 'Infection',
      // Three weeks back: well past the revision window.
      dateTaught: '2026-09-28',
    });
    expect(REVISE_WITHIN_DAYS).toBeLessThan(21);
    expect((await journeyOf(topic.id)).gap).toBe('No notes captured yet');

    await recordOccurrence({
      date: '2026-09-28',
      occurrence: lesson('a'),
      outcome: 'HAPPENED',
      notes: 'Bacteria, viruses, fungi, protists',
      topicId: topic.id,
    });
    expect((await journeyOf(topic.id)).gap).toBe('Not revised since it was taught');

    const block = await logFocusBlock({ subjectId: 'biology', topicId: topic.id });
    await wrapUpFocusBlock(block, { note: 'Flashcards' });
    expect((await journeyOf(topic.id)).gap).toBeUndefined();
  });

  it('does not call a topic taught this week unrevised', async () => {
    const topic = await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Pathogens',
      unit: 'Infection',
      dateTaught: '2026-10-16',
    });
    await recordOccurrence({
      date: '2026-10-16',
      occurrence: lesson('a'),
      outcome: 'HAPPENED',
      notes: 'Notes',
      topicId: topic.id,
    });
    expect((await journeyOf(topic.id)).gap).toBeUndefined();
  });

  it('says nothing about a secure topic', async () => {
    const topic = await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Pathogens',
      unit: 'Infection',
      dateTaught: '2026-09-01',
      confidenceRating: 5,
    });
    const j = await journeyOf(topic.id);
    expect(j.secure).toBe(true);
    expect(j.gap).toBeUndefined();
  });
});

describe('the log across subjects', () => {
  it('reads each topic exactly as its subject page does', async () => {
    const topic = await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Vaccines and Antibiotics',
      unit: 'Infection',
      dateTaught: '2026-10-07',
    });
    await recordOccurrence({
      date: '2026-10-07',
      occurrence: lesson('a'),
      outcome: 'HAPPENED',
      notes: 'Herd immunity',
      topicId: topic.id,
    });
    await db.tasks.put(task({ linkedTopicId: topic.id, completed: true, completedAt: Date.now() }));

    const page = (await subjectTopics('biology')).topics.find((t) => t.topic.id === topic.id)!;
    const log = (await topicLog())
      .find((l) => l.subject.id === 'biology')!
      .topics.find((t) => t.topic.id === topic.id)!;
    expect(log.journey).toEqual(page.journey);
    expect(log.section?.ref).toBe('4.3');
  });

  it('lists newest taught first, and counts the outline sections reached', async () => {
    await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Cell Division',
      unit: 'Cells',
      dateTaught: '2026-09-07',
    });
    await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Pathogen Types',
      unit: 'Infection',
      dateTaught: '2026-10-07',
    });
    await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Microscopy',
      unit: 'Cells',
      dateTaught: '2026-09-26',
      confidenceRating: 5,
    });

    const biology = (await topicLog()).find((l) => l.subject.id === 'biology')!;
    expect(biology.topics.map((t) => t.topic.title)).toEqual([
      'Pathogen Types',
      'Microscopy',
      'Cell Division',
    ]);
    const cells = biology.coverage.find((c) => c.section.ref === '4.1')!;
    expect(cells).toMatchObject({ topics: 2, taught: 2, secure: 1, firstTaught: '2026-09-07' });
    expect(biology.coverage.filter((c) => c.topics > 0)).toHaveLength(2);
    expect(biology.coverage).toHaveLength(7);
  });

  it('shows a subject with an outline even before its first topic', async () => {
    const physics = (await topicLog()).find((l) => l.subject.id === 'physics');
    expect(physics?.topics).toEqual([]);
    expect(physics?.coverage.every((c) => c.topics === 0)).toBe(true);
  });
});

describe('correcting the section', () => {
  it('writes the section, records it, and wins over the title from then on', async () => {
    const topic = await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Health and disease revision',
      unit: 'Health',
    });
    await setTopicSpecRef(topic.id, '4.3', 'STUDENT');

    const row = (await subjectTopics('biology')).topics.find((t) => t.topic.id === topic.id)!;
    expect(row).toMatchObject({ placement: 'SPEC_REF', section: { ref: '4.3' } });
    const audit = (await db.auditLogs.toArray()).find((a) => a.fieldChanged === 'specRef');
    expect(audit).toMatchObject({ oldValue: 'none', newValue: '4.3' });
  });

  it('keeps a more precise reference inside the chosen section', async () => {
    const topic = await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Vaccination',
      unit: 'Infection',
      specRef: '4.3.1.6',
    });
    await setTopicSpecRef(topic.id, '4.3');
    expect((await db.syllabusTopics.get(topic.id))?.specRef).toBe('4.3.1.6');
    const audits = await db.auditLogs.toArray();
    expect(audits.filter((a) => a.fieldChanged === 'specRef')).toEqual([]);
  });

  it('hands the topic back to the guess when cleared', async () => {
    const topic = await addSyllabusTopic({
      subjectId: 'biology',
      title: 'Pathogen Types',
      unit: 'Infection',
      specRef: '4.1',
    });
    await setTopicSpecRef(topic.id, '');
    const row = (await subjectTopics('biology')).topics.find((t) => t.topic.id === topic.id)!;
    expect(row).toMatchObject({ placement: 'SUGGESTED', section: { ref: '4.3' } });
  });
});

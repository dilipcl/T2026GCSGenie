import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { DayOccurrence } from './dayPlan';
import {
  occurrenceId,
  recordOccurrence,
  suggestLessonTopic,
  tagOccurrenceToTopic,
  teachesTopics,
} from './checkInOccurrenceService';
import { addSyllabusTopic } from './topicService';

/**
 * A lesson says which topic it covered, from the lesson row itself.
 *
 * Sixty-four lessons were answered in September and none carried a topic,
 * because tagging was only possible later, in the Library. These hold the two
 * things the lesson row now depends on: that a tag, once given, survives the
 * answer being changed, and that the one-tap suggestion is the topic the last
 * lesson in the subject covered.
 */

const MONDAY = '2026-09-21';
const WEDNESDAY = '2026-09-23';

const physics = (id: string): DayOccurrence => ({
  key: `lesson__${id}`,
  kind: 'LESSON',
  label: 'Physics',
  subjectId: 'physics',
  xp: 2,
});

describe('a lesson and its topic', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('keeps the topic when the answer is changed afterwards', async () => {
    const topic = await addSyllabusTopic({ subjectId: 'physics', title: 'Energy stores' });
    await recordOccurrence({ date: MONDAY, occurrence: physics('p1'), outcome: 'HAPPENED' });
    const id = occurrenceId(MONDAY, 'lesson__p1');
    await tagOccurrenceToTopic(id, topic.id);

    // The row is replaced on every write. Before the topic was carried over,
    // this is the tap that silently untagged the lesson.
    await recordOccurrence({
      date: MONDAY,
      occurrence: physics('p1'),
      outcome: 'PARTIAL',
      notes: 'Ran out of time on the practical',
    });

    expect((await db.checkInOccurrences.get(id))?.topicId).toBe(topic.id);
  });

  it('suggests the topic the last lesson in the subject covered', async () => {
    await addSyllabusTopic({
      subjectId: 'physics',
      title: 'Energy stores',
      dateTaught: '2026-09-01',
    });
    const latest = await addSyllabusTopic({
      subjectId: 'physics',
      title: 'Specific heat capacity',
      dateTaught: '2026-09-01',
    });

    await recordOccurrence({ date: MONDAY, occurrence: physics('p1'), outcome: 'HAPPENED' });
    await tagOccurrenceToTopic(occurrenceId(MONDAY, 'lesson__p1'), latest.id);

    await recordOccurrence({ date: WEDNESDAY, occurrence: physics('p2'), outcome: 'HAPPENED' });
    const wednesday = occurrenceId(WEDNESDAY, 'lesson__p2');

    expect(await suggestLessonTopic('physics', WEDNESDAY, wednesday)).toBe(latest.id);
  });

  it('never suggests from a later lesson', async () => {
    const topic = await addSyllabusTopic({
      subjectId: 'physics',
      title: 'Specific heat capacity',
      dateTaught: WEDNESDAY,
    });
    await recordOccurrence({ date: WEDNESDAY, occurrence: physics('p2'), outcome: 'HAPPENED' });
    await tagOccurrenceToTopic(occurrenceId(WEDNESDAY, 'lesson__p2'), topic.id);

    // Backfilling Monday must not be offered what Wednesday covered.
    expect(await suggestLessonTopic('physics', MONDAY)).toBeUndefined();
  });

  it('falls back to the most recently taught unfinished topic', async () => {
    await addSyllabusTopic({ subjectId: 'physics', title: 'Old', dateTaught: '2026-09-02' });
    const recent = await addSyllabusTopic({
      subjectId: 'physics',
      title: 'Recent',
      dateTaught: '2026-09-15',
    });

    expect(await suggestLessonTopic('physics', MONDAY)).toBe(recent.id);
  });
});

describe('which lessons teach topics', () => {
  it('asks a subject lesson, and not registration, PE or a chore', () => {
    expect(teachesTopics({ kind: 'LESSON', subjectId: 'physics' })).toBe(true);
    // Tutor, PE, PSHE and "Clean up" are all timetabled under General.
    expect(teachesTopics({ kind: 'LESSON', subjectId: 'general' })).toBe(false);
    expect(teachesTopics({ kind: 'LESSON', subjectId: 'revision' })).toBe(false);
    expect(teachesTopics({ kind: 'LESSON' })).toBe(false);
    expect(teachesTopics({ kind: 'COMMITMENT', subjectId: 'physics' })).toBe(false);
  });
});

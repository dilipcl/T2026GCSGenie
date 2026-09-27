import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { DayOccurrence } from './dayPlan';
import { occurrenceId, recordOccurrence } from './checkInOccurrenceService';
import { addSyllabusTopic } from './topicService';
import { logFocusBlock, wrapUpFocusBlock } from './focusSessionService';
import { subjectTopics, tagUntagged } from './topicTimeline';

/**
 * A subject seen through its topics. These hold the promises the topic page
 * makes: that a lesson appears under the topic it was tagged to and nowhere
 * else, that a missed lesson is never counted as teaching, that nothing is
 * listed twice, and that the inbox empties as things are tagged.
 */

const physics = (id: string): DayOccurrence => ({
  key: `lesson__${id}`,
  kind: 'LESSON',
  label: 'Physics',
  subjectId: 'physics',
  xp: 2,
});

describe('a subject by its topics', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T18:00:00'));
    await emptyDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the lessons, study and work on a topic, newest first', async () => {
    const topic = await addSyllabusTopic({
      subjectId: 'physics',
      title: 'Specific heat capacity',
      unit: 'Energy',
    });

    await recordOccurrence({
      date: '2026-09-21',
      occurrence: physics('a'),
      outcome: 'HAPPENED',
      notes: 'Did the SHC practical',
      topicId: topic.id,
    });
    const block = await logFocusBlock({ subjectId: 'physics', topicId: topic.id });
    await wrapUpFocusBlock(block, { note: 'Rearranging E = mcΔθ' });
    await db.tasks.add({
      id: 'hw',
      subjectId: 'physics',
      title: 'SHC worksheet',
      dueDate: '2026-09-30',
      priority: 'MEDIUM',
      isHomework: true,
      isRemediation: false,
      linkedTopicId: topic.id,
      xpValue: 20,
      completed: false,
      createdAt: 0,
    });

    const data = await subjectTopics('physics');
    const row = data.topics.find((t) => t.topic.id === topic.id)!;

    expect(row.lessons).toBe(1);
    expect(row.studyMinutes).toBe(25);
    expect(row.work).toBe(1);
    expect(row.entries.map((e) => e.kind)).toEqual(['WORK', 'FOCUS', 'LESSON']);
    // The lesson note is the lesson's own detail - not listed again as material.
    expect(row.materials).toBe(0);
    expect(row.entries.find((e) => e.kind === 'LESSON')?.detail).toBe('Did the SHC practical');
  });

  it('never counts a missed lesson as teaching', async () => {
    await recordOccurrence({ date: '2026-09-21', occurrence: physics('a'), outcome: 'MISSED' });
    await recordOccurrence({ date: '2026-09-22', occurrence: physics('b'), outcome: 'HAPPENED' });

    const data = await subjectTopics('physics');
    expect(data.lessonsAnswered).toBe(1);
    expect(data.untagged.map((u) => u.id)).toEqual([
      `lesson__${occurrenceId('2026-09-22', 'lesson__b')}`,
    ]);
  });

  it('empties the inbox as lessons are tagged in bulk', async () => {
    const topic = await addSyllabusTopic({ subjectId: 'physics', title: 'Energy stores' });
    for (const [id, date] of [
      ['a', '2026-09-21'],
      ['b', '2026-09-22'],
      ['c', '2026-09-23'],
    ]) {
      await recordOccurrence({ date, occurrence: physics(id), outcome: 'HAPPENED' });
    }

    const before = await subjectTopics('physics');
    expect(before.untagged).toHaveLength(3);
    expect(before.lessonsTagged).toBe(0);

    await tagUntagged(before.untagged.slice(0, 2), topic.id);

    const after = await subjectTopics('physics');
    expect(after.untagged).toHaveLength(1);
    expect(after.lessonsTagged).toBe(2);
    expect(after.topics[0].lessons).toBe(2);
  });

  it('offers an untagged evening takeaway for tagging too', async () => {
    const topic = await addSyllabusTopic({ subjectId: 'physics', title: 'Energy stores' });
    await db.checkIns.add({
      id: 'evening',
      date: '2026-09-27',
      timestamp: 0,
      session: 'EVENING',
      energyLevel: 4,
      focusRating: 'NORMAL',
      completedHomeworkIds: [],
      completedRevisionMinutes: 60,
      studySubjectId: 'physics',
      structuredNotes: { keyLearning: 'Kinetic store depends on v squared' },
      xpEarned: 20,
      isDailyBaseXPAwarded: true,
    });

    const before = await subjectTopics('physics');
    expect(before.untagged.map((u) => u.kind)).toEqual(['NOTE']);

    await tagUntagged(before.untagged, topic.id);
    const after = await subjectTopics('physics');
    expect(after.untagged).toHaveLength(0);
    expect(after.topics[0].entries[0].detail).toBe('Kinetic store depends on v squared');
  });
});

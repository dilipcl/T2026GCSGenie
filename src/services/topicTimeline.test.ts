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

  /**
   * History's "Economic Boom USA 1920s" read "Nothing recorded yet" while
   * homework on exactly that, with photos, sat in My Work. Work was never in
   * the inbox and nothing else could give it a topic, so a topic could only
   * ever count work that a focus block had raised.
   */
  it('offers untagged work for tagging, and its photos go with it', async () => {
    const topic = await addSyllabusTopic({ subjectId: 'history', title: 'Economic Boom USA 1920s' });
    await db.tasks.add({
      id: 'hw-boom',
      subjectId: 'history',
      title: 'Ecenomic Boom USA',
      dueDate: '2026-09-24',
      priority: 'MEDIUM',
      isHomework: true,
      isRemediation: false,
      xpValue: 50,
      completed: true,
      completedAt: Date.parse('2026-09-24T19:00:00'),
      createdAt: 0,
    });
    await db.attachments.add({
      id: 'photo-boom',
      ownerType: 'TASK',
      ownerId: 'hw-boom',
      fileName: 'IMG_4821.jpg',
      mimeType: 'image/jpeg',
      byteSize: 3,
      blob: new Blob(['jpg']),
      createdAt: Date.parse('2026-09-24T19:00:00'),
    });

    const before = await subjectTopics('history');
    expect(before.topics[0].work).toBe(0);
    expect(before.untagged.map((u) => u.kind).sort()).toEqual(['FILE', 'WORK']);

    await tagUntagged(
      before.untagged.filter((u) => u.kind === 'WORK'),
      topic.id
    );

    const after = await subjectTopics('history');
    expect(after.topics[0].work).toBe(1);
    // Tagged with the work, not left behind to be tagged to the same topic again.
    expect(after.topics[0].materials).toBe(1);
    expect(after.untagged).toHaveLength(0);

    const logged = (await db.auditLogs.toArray()).find(
      (a) => a.entityId === 'hw-boom' && a.fieldChanged === 'linkedTopicId'
    );
    expect(logged?.newValue).toBe(topic.id);
  });

  it('keeps a tag put on the photo itself over the one its work carries', async () => {
    const onWork = await addSyllabusTopic({ subjectId: 'history', title: 'Economic Boom USA 1920s' });
    const onPhoto = await addSyllabusTopic({ subjectId: 'history', title: 'Prohibition' });
    await db.tasks.add({
      id: 'hw-boom',
      subjectId: 'history',
      title: 'Ecenomic Boom USA',
      dueDate: '2026-09-24',
      priority: 'MEDIUM',
      isHomework: true,
      isRemediation: false,
      linkedTopicId: onWork.id,
      xpValue: 50,
      completed: true,
      createdAt: 0,
    });
    await db.attachments.add({
      id: 'photo-speakeasy',
      ownerType: 'TASK',
      ownerId: 'hw-boom',
      fileName: 'IMG_4822.jpg',
      mimeType: 'image/jpeg',
      byteSize: 3,
      blob: new Blob(['jpg']),
      topicId: onPhoto.id,
      createdAt: 0,
    });

    const data = await subjectTopics('history');
    const count = (id: string) => data.topics.find((t) => t.topic.id === id)!.materials;
    expect(count(onPhoto.id)).toBe(1);
    expect(count(onWork.id)).toBe(0);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import {
  focusThreads,
  isTimerBlock,
  logFocusBlock,
  timerBlocksOn,
  wrapUpFocusBlock,
} from './focusSessionService';
import { readEnergySignal } from './energySignal';
import { library } from './materialLibrary';
import { addSyllabusTopic } from './topicService';
import { DailyCheckIn, Task } from '../types';

/**
 * The focus block became the place detail is written down: what it was on,
 * one line about it, a question for the teacher. These hold what the rest of
 * the app now relies on - that the minutes never depend on the wrap-up, that a
 * question becomes work exactly once, that the note files under its topic, and
 * that the timer's placeholder energy is never read as somebody's answer.
 */

const TODAY = '2026-09-28';

const task = (id: string, dueDate: string, extra: Partial<Task> = {}): Task => ({
  id,
  subjectId: 'chemistry',
  title: `Task ${id}`,
  dueDate,
  priority: 'MEDIUM',
  isHomework: true,
  isRemediation: false,
  xpValue: 20,
  completed: false,
  createdAt: 0,
  ...extra,
});

describe('a focus block', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T18:00:00`));
    await emptyDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is logged in full before anything is asked about it', async () => {
    const id = await logFocusBlock({ subjectId: 'chemistry' });
    const row = await db.checkIns.get(id);

    expect(row?.completedRevisionMinutes).toBe(25);
    expect(row?.source).toBe('FOCUS_TIMER');
    expect(await timerBlocksOn(TODAY)).toHaveLength(1);
  });

  it('recognises the timer rows written before they were marked', () => {
    const legacy: DailyCheckIn = {
      id: 'old',
      date: TODAY,
      timestamp: 0,
      session: 'STUDY_SESSION',
      energyLevel: 3,
      focusRating: 'NORMAL',
      completedHomeworkIds: [],
      completedRevisionMinutes: 25,
      xpEarned: 10,
      isDailyBaseXPAwarded: false,
    };
    const answered: DailyCheckIn = { ...legacy, id: 'real', completedRevisionMinutes: 30 };

    expect(isTimerBlock(legacy)).toBe(true);
    // Somebody choosing "Study" by hand cannot land on 25 with 15-minute steps.
    expect(isTimerBlock(answered)).toBe(false);
  });

  it('raises the question as work once, however often it is edited', async () => {
    const id = await logFocusBlock({ subjectId: 'chemistry' });

    await wrapUpFocusBlock(id, { question: 'why is Rf always below 1?' });
    await wrapUpFocusBlock(id, { question: 'why is Rf always below 1?', note: 'chromatography' });

    const asks = (await db.tasks.toArray()).filter((t) => t.title.startsWith('Ask:'));
    expect(asks).toHaveLength(1);
    expect(asks[0].subjectId).toBe('chemistry');
    expect((await db.checkIns.get(id))?.structuredNotes?.keyLearning).toBe('chromatography');
  });

  it('moves the topic’s own confidence, and files the note under it', async () => {
    const topic = await addSyllabusTopic({ subjectId: 'chemistry', title: 'Chromatography' });
    const id = await logFocusBlock({ subjectId: 'chemistry' });

    await wrapUpFocusBlock(id, { topicId: topic.id, confidence: 5, note: 'Rf = spot / solvent' });

    expect((await db.syllabusTopics.get(topic.id))?.confidenceRating).toBe(5);
    const note = (await library()).materials.find((m) => m.id === `checkin__${id}`);
    expect(note?.topicId).toBe(topic.id);
    expect(note?.title).toBe('Focus block');
  });

  it('is never read as an energy answer', async () => {
    // One real, exhausted evening...
    for (const hour of [19, 20, 21]) {
      await db.checkIns.add({
        id: `real-${hour}`,
        date: TODAY,
        timestamp: new Date(`${TODAY}T${hour}:00:00`).getTime(),
        session: 'EVENING',
        energyLevel: 1,
        focusRating: 'LOW',
        completedHomeworkIds: [],
        completedRevisionMinutes: 0,
        xpEarned: 0,
        isDailyBaseXPAwarded: false,
      });
    }
    // ...followed by four blocks, each carrying a placeholder 3.
    vi.setSystemTime(new Date(`${TODAY}T22:00:00`));
    for (let i = 0; i < 4; i++) await logFocusBlock({ subjectId: 'chemistry' });

    const signal = await readEnergySignal();
    expect(signal.sampleSize).toBe(3);
    expect(signal.isLow).toBe(true);
  });

  it('offers work due soon, not everything open', async () => {
    await db.tasks.bulkAdd([
      task('tomorrow', '2026-09-29'),
      task('october', '2026-10-20'),
      task('promised', '2026-10-20', { id: 'promised', bucket: 'THIS_WEEK' }),
      task('done', '2026-09-28', { completed: true }),
    ]);

    const keys = (await focusThreads(TODAY)).map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(['task:tomorrow', 'task:promised']));
    expect(keys).not.toContain('task:october');
    expect(keys).not.toContain('task:done');
  });
});

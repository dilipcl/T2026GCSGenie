import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { RemediationAction } from '../types';
import { convertQuestsToFixUps, dueDateFor, fixUpIdFor, pulledFromCloud } from './fixUpConversion';
import { calculateTotalXP, calculateSubjectRAG } from './ragCalculator';
import { closeTask } from './taskCompletionService';

/**
 * Fix-up quests become fix-up tasks, once, losing nothing.
 *
 * Eleven quests lived on a screen of their own with no due date, and none was
 * ever done. These hold what the conversion promises: the same row however
 * many devices run it, nothing overwritten, photos moved, sub-quests told
 * apart, XP untouched - and that closing a fix-up can still do what the quest
 * dialog did.
 */

const TODAY = '2026-09-27';

const quest = (extra: Partial<RemediationAction> = {}): RemediationAction => ({
  id: 'rem-maths-1',
  subjectId: 'maths',
  sourceDoc: 'yr9- maths.pdf (Score: 60/75)',
  diagnosticError: 'Scored 0/2 on proving event independence on a Venn diagram.',
  taskTitle: 'Venn Diagram Probability Proofs',
  taskInstructions: 'Redo Q12-14 and compare P(A and B) with P(A)P(B).',
  formulaOrHint: 'Independent if P(A∩B) = P(A)P(B)',
  xpReward: 200,
  isCompleted: false,
  ...extra,
});

describe('converting fix-up quests', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T21:00:00`));
    await emptyDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns a quest into a fix-up task with everything it carried', async () => {
    await db.goals.add({
      id: 'g-maths',
      title: 'Grade 9 In Maths',
      category: 'ACADEMIC_GRADE_9',
      subjectId: 'maths',
      smartSpecific: '',
      smartMeasurable: '',
      smartAchievable: '',
      smartRealistic: '',
      smartTimeBound: '',
      status: 'APPROVED_LOCKED',
      ragStatus: 'GREEN',
      weeklyHoursRequired: 3,
      createdAt: 0,
    });
    await db.remediations.add(quest());

    expect(await convertQuestsToFixUps()).toBe(1);

    const task = await db.tasks.get(fixUpIdFor('rem-maths-1'));
    expect(task).toMatchObject({
      subjectId: 'maths',
      title: 'Venn Diagram Probability Proofs',
      isRemediation: true,
      isHomework: false,
      xpValue: 200,
      whatWentWrong: 'Scored 0/2 on proving event independence on a Venn diagram.',
      fixSteps: 'Redo Q12-14 and compare P(A and B) with P(A)P(B).',
      hint: 'Independent if P(A∩B) = P(A)P(B)',
      remediationSourceDoc: 'yr9- maths.pdf (Score: 60/75)',
      linkedGoalId: 'g-maths',
      completed: false,
    });
    expect(await db.remediations.count()).toBe(0);
  });

  it('writes the same row however many times, and never overwrites work done since', async () => {
    await db.remediations.add(quest());
    await convertQuestsToFixUps();
    await db.tasks.update(fixUpIdFor('rem-maths-1'), { workingNotes: 'Done on the phone' });

    // The other device, which had not seen the conversion, converts it again.
    await db.remediations.add(quest());
    await convertQuestsToFixUps();

    const fixUps = (await db.tasks.toArray()).filter((t) => t.isRemediation);
    expect(fixUps).toHaveLength(1);
    expect(fixUps[0].workingNotes).toBe('Done on the phone');
  });

  it('moves the quest’s photos onto the fix-up', async () => {
    await db.remediations.add(quest());
    await db.attachments.add({
      id: 'att-1',
      ownerType: 'REMEDIATION',
      ownerId: 'rem-maths-1',
      fileName: 'working.jpg',
      mimeType: 'image/jpeg',
      byteSize: 10,
      blob: new Blob(['x']),
      createdAt: 0,
    });

    await convertQuestsToFixUps();

    expect(await db.attachments.get('att-1')).toMatchObject({
      ownerType: 'TASK',
      ownerId: fixUpIdFor('rem-maths-1'),
    });
  });

  it('tells sub-quests apart by the weak area Tejas named', async () => {
    await db.remediations.bulkAdd([
      quest({ id: 'rem-history-1', subjectId: 'history', taskTitle: 'Reparations Keyword Mastery' }),
      quest({
        id: 'remsub_a',
        subjectId: 'history',
        taskTitle: 'Reparations Keyword Mastery (Targeted Sub-Quest)',
        diagnosticError: 'Identified deficit during self-study: Lebensraum definition',
        parentQuestId: 'rem-history-1',
      }),
    ]);

    await convertQuestsToFixUps();

    expect(await db.tasks.get(fixUpIdFor('remsub_a'))).toMatchObject({
      title: 'Reparations Keyword Mastery: Lebensraum definition',
      parentTaskId: fixUpIdFor('rem-history-1'),
    });
  });

  it('keeps practice questions a quest still carried, as text', async () => {
    await db.remediations.add({
      ...quest(),
      sampleQuestions: [{ question: 'Show A and B are independent.' }],
    } as RemediationAction);

    await convertQuestsToFixUps();

    expect((await db.tasks.get(fixUpIdFor('rem-maths-1')))?.description).toContain(
      'Show A and B are independent.'
    );
  });

  it('dates a fix-up to the day before the next mock, or four weeks out', () => {
    const mock = {
      id: 'ir1',
      title: 'IR1',
      date: '2026-10-18',
      category: 'EXAM_MOCK' as const,
      priority: 'HIGH' as const,
      isCompleted: false,
      createdAt: 0,
    };
    expect(dueDateFor([mock], TODAY)).toBe('2026-10-17');
    expect(dueDateFor([], TODAY)).toBe('2026-10-25');
  });

  it('leaves total XP exactly where it was', async () => {
    await db.remediations.bulkAdd([
      quest({ id: 'rem-a', isCompleted: true, completedAt: 1, xpReward: 150 }),
      quest({ id: 'rem-b' }),
    ]);
    const before = (await calculateTotalXP()).totalXP;

    await convertQuestsToFixUps();

    expect((await calculateTotalXP()).totalXP).toBe(before);
  });

  it('counts fix-up tasks in subject health', async () => {
    await db.remediations.bulkAdd([quest({ id: 'rem-a', isCompleted: true, completedAt: 1 }), quest({ id: 'rem-b' })]);
    await convertQuestsToFixUps();

    const rag = await calculateSubjectRAG('maths');
    // Half the maths fix-ups done: 50% of the fix-up component.
    expect(rag.healthScore).toBe(Math.round(100 * 0.4 + 50 * 0.35 + 80 * 0.25));
  });

  it('raises a follow-up fix-up from what still feels shaky at the close', async () => {
    await db.remediations.add(quest());
    await convertQuestsToFixUps();
    const fixUp = (await db.tasks.get(fixUpIdFor('rem-maths-1')))!;

    const followUpId = await closeTask(fixUp, 'STUDENT', false, 30, {
      score: { scored: 5, total: 6 },
      weakAreas: 'part (b) comparison',
    });

    expect(await db.tasks.get(fixUp.id)).toMatchObject({
      completed: true,
      score: { scored: 5, total: 6 },
      weakAreas: 'part (b) comparison',
    });
    expect(await db.tasks.get(followUpId!)).toMatchObject({
      title: 'Venn Diagram Probability Proofs: part (b) comparison',
      isRemediation: true,
      parentTaskId: fixUp.id,
      dueDate: '2026-10-04',
    });
  });

  it('raises one follow-up per fix-up, however often it is closed', async () => {
    await db.remediations.add(quest());
    await convertQuestsToFixUps();
    const fixUp = (await db.tasks.get(fixUpIdFor('rem-maths-1')))!;

    await closeTask(fixUp, 'STUDENT', false, undefined, { weakAreas: 'part (b)' });
    await closeTask({ ...fixUp, completed: false }, 'STUDENT', false, undefined, { weakAreas: 'part (b)' });

    const followUps = (await db.tasks.toArray()).filter((t) => t.parentTaskId === fixUp.id);
    expect(followUps).toHaveLength(1);
  });

  it('updates the open follow-up when a later close names a different shaky part', async () => {
    await db.remediations.add(quest());
    await convertQuestsToFixUps();
    const fixUp = (await db.tasks.get(fixUpIdFor('rem-maths-1')))!;

    await closeTask(fixUp, 'STUDENT', false, undefined, { weakAreas: 'part (b)' });
    await closeTask({ ...fixUp, completed: false }, 'STUDENT', false, undefined, { weakAreas: 'part (c)' });

    const followUps = (await db.tasks.toArray()).filter((t) => t.parentTaskId === fixUp.id);
    expect(followUps).toHaveLength(1);
    expect(followUps[0].whatWentWrong).toBe('part (c)');
  });

  it('parks converted fix-ups in "later", so they do not all land in one week', async () => {
    await db.remediations.add(quest());
    await convertQuestsToFixUps();
    expect((await db.tasks.get(fixUpIdFor('rem-maths-1')))?.bucket).toBe('FUTURE');
  });
});

/**
 * Converting stale copies would overwrite work: Dexie Cloud treats an insert as
 * a whole-row upsert. A signed-in device converts only after a pull that
 * actually moved data.
 */
describe('when it is safe to convert', () => {
  const realCloud = (db as unknown as { cloud?: unknown }).cloud;
  const fakeCloud = (options: {
    userId?: string;
    sync?: () => Promise<void>;
    license?: string;
    phase?: string;
  }) => {
    (db as unknown as { cloud: unknown }).cloud = {
      currentUser: { value: options.userId ? { userId: options.userId } : undefined },
      sync: options.sync ?? (() => Promise.resolve()),
      syncState: { value: { license: options.license, phase: options.phase ?? 'in-sync' } },
    };
  };

  afterEach(() => {
    (db as unknown as { cloud?: unknown }).cloud = realCloud;
  });

  it('never converts on a signed-out device - signing in later would upload its rows over the family’s', async () => {
    fakeCloud({ userId: 'unauthorized' });
    expect(await pulledFromCloud()).toBe(false);
  });

  it('converts after a good pull on a signed-in device', async () => {
    fakeCloud({ userId: 'family', license: 'ok' });
    expect(await pulledFromCloud()).toBe(true);
  });

  it('waits when the pull fails', async () => {
    fakeCloud({ userId: 'family', sync: () => Promise.reject(new Error('offline')) });
    expect(await pulledFromCloud()).toBe(false);
  });

  it('waits when the licence has expired, because sync then moves nothing', async () => {
    fakeCloud({ userId: 'family', license: 'expired' });
    expect(await pulledFromCloud()).toBe(false);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { Task } from '../types';
import { calculateTotalXP } from './ragCalculator';
import {
  BURST_MIN,
  BURST_WINDOW_MS,
  burstClosures,
  reconcileXp,
  xpStatement,
} from './xpLedgerService';
import { addEvidenceNote } from './activityCommentService';
import { evidenceOnCloseFrom, markEvidenceOnCloseAvailable } from './evidenceService';
import { todayISO } from '../utils/date';
import { workNeedingEvidence } from './evidenceService';

/**
 * The balance has only ever been a single number, derived on every read. These
 * pin the two things that makes it trustworthy: the statement adds up to it,
 * and the lines that rest on a close worth checking are named rather than
 * silently adjusted away.
 */

beforeEach(async () => {
  await emptyDatabase();
});

let seq = 0;
function task(overrides: Partial<Task> = {}): Task {
  seq += 1;
  const created = Date.parse('2026-09-01T09:00:00');
  return {
    id: `task_${seq}`,
    subjectId: 'maths',
    title: `Task ${seq}`,
    dueDate: todayISO(),
    priority: 'MEDIUM',
    completed: false,
    isHomework: true,
    isRemediation: false,
    xpValue: 50,
    estimatedHours: 1,
    bucket: 'THIS_WEEK',
    createdAt: created,
    ...overrides,
  } as Task;
}

/** A close at a specific moment, well clear of any other. */
function closedAt(iso: string, overrides: Partial<Task> = {}): Task {
  return task({ completed: true, completedAt: Date.parse(iso), ...overrides });
}

/**
 * Marks the moment this family's app began offering to capture evidence when
 * work is closed. Missing-evidence is only ever held against work closed after
 * it, so most of these tests have to say where the line is.
 */
async function evidenceStepAvailableFrom(iso: string) {
  await db.parentSettings.put({ id: 'active_settings' } as never);
  await markEvidenceOnCloseAvailable(Date.parse(iso));
}

describe('the statement explains the balance', () => {
  it('adds up to the headline total on an empty database', async () => {
    const { earned } = await reconcileXp();
    expect(earned).toBe((await calculateTotalXP()).totalXP);
  });

  it('adds up to the headline total across every source', async () => {
    await db.tasks.bulkAdd([
      closedAt('2026-09-01T10:00:00'),
      closedAt('2026-09-02T10:00:00', { xpValue: 30 }),
      task(), // not finished, pays nothing
    ]);
    await db.remediations.add({
      id: 'rem_1',
      taskTitle: 'Redo the circuits question',
      subjectId: 'physics',
      xpReward: 75,
      isCompleted: true,
      completedAt: Date.parse('2026-09-03T10:00:00'),
    } as never);
    await db.checkIns.add({
      id: 'ci_1',
      date: '2026-09-01',
      timestamp: Date.parse('2026-09-01T20:00:00'),
      xpEarned: 10,
    } as never);
    await db.checkInOccurrences.add({
      id: 'occ_1',
      date: '2026-09-01',
      label: 'Maths',
      xpAwarded: 5,
      dayBonusXp: 15,
      loggedAt: Date.parse('2026-09-01T21:00:00'),
    } as never);
    await db.choreCompletions.add({
      id: 'chore_1',
      choreId: 'c1',
      date: '2026-09-01',
      completedAt: Date.parse('2026-09-01T18:00:00'),
      xpAwarded: 20,
    } as never);

    const ledger = await calculateTotalXP();
    const { earned } = await reconcileXp();

    expect(earned).toBe(ledger.totalXP);
    // And it is a real number, not two zeroes agreeing with each other.
    expect(earned).toBe(50 + 30 + 75 + 10 + 20 + 20);
  });

  it('accounts for what has been spent, held and penalised', async () => {
    await db.tasks.add(closedAt('2026-09-01T10:00:00', { xpValue: 500 }));
    await db.sanctions.add({
      id: 's1',
      type: 'DETENTION',
      reason: 'Late to registration',
      date: '2026-09-02',
      penaltyXP: -100,
      shopFrozen: false,
      loggedBy: 'PARENT',
    } as never);
    await db.redemptions.bulkAdd([
      {
        id: 'r1',
        rewardId: 'x',
        rewardTitle: 'An hour of screen time',
        costXP: 120,
        requestedAt: Date.parse('2026-09-03T10:00:00'),
        status: 'APPROVED',
      },
      {
        id: 'r2',
        rewardId: 'y',
        rewardTitle: 'A trip out',
        costXP: 80,
        requestedAt: Date.parse('2026-09-04T10:00:00'),
        status: 'PENDING',
      },
    ] as never);

    const ledger = await calculateTotalXP();
    const { earned, deducted, balance } = await reconcileXp();

    expect(earned).toBe(ledger.totalXP);
    expect(deducted).toBe(ledger.penaltyXP + ledger.redeemedXP + ledger.reservedXP);
    expect(balance).toBe(500 - 100 - 120 - 80);
    expect(balance).toBe(ledger.availableXP);
  });

  it('ignores a request that was withdrawn or denied, exactly as the balance does', async () => {
    await db.redemptions.bulkAdd([
      {
        id: 'r1',
        rewardId: 'x',
        rewardTitle: 'Withdrawn',
        costXP: 100,
        requestedAt: Date.now(),
        status: 'WITHDRAWN',
      },
      {
        id: 'r2',
        rewardId: 'y',
        rewardTitle: 'Denied',
        costXP: 100,
        requestedAt: Date.now(),
        status: 'DENIED',
      },
    ] as never);

    expect((await reconcileXp()).deducted).toBe(0);
  });

  it('loses the XP as soon as work is reopened, because nothing was ever banked', async () => {
    await db.tasks.add(closedAt('2026-09-01T10:00:00', { id: 'reopened' }));
    expect((await reconcileXp()).earned).toBe(50);

    await db.tasks.update('reopened', { completed: false, completedAt: undefined });

    expect((await reconcileXp()).earned).toBe(0);
    expect((await calculateTotalXP()).totalXP).toBe(0);
  });
});

/**
 * The signature of a list scrolling under a thumb: several things closed within
 * seconds of each other. It is the accident Tejas reported, and the one the
 * confirmation sheet now makes impossible - so it can only appear in data that
 * predates the fix.
 */
describe('closes that look like an accident', () => {
  it('flags a run of closes inside the window', async () => {
    const base = Date.parse('2026-09-01T10:00:00');
    await db.tasks.bulkAdd([
      task({ id: 'a', completed: true, completedAt: base }),
      task({ id: 'b', completed: true, completedAt: base + 1000 }),
      task({ id: 'c', completed: true, completedAt: base + 2000 }),
    ]);

    const { questionable, questionableXp } = await reconcileXp();
    expect(questionable.map((e) => e.entityId).sort()).toEqual(['a', 'b', 'c']);
    expect(questionableXp).toBe(150);
    for (const entry of questionable) expect(entry.concerns).toContain('BURST');
  });

  it('leaves two close together alone, because two is not a pattern', async () => {
    const base = Date.parse('2026-09-01T10:00:00');
    const burst = burstClosures([
      task({ id: 'a', completed: true, completedAt: base }),
      task({ id: 'b', completed: true, completedAt: base + 500 }),
    ]);
    expect(burst.size).toBe(0);
    expect(BURST_MIN).toBe(3);
  });

  it('leaves work finished across a real evening alone', async () => {
    const base = Date.parse('2026-09-01T17:00:00');
    const burst = burstClosures([
      task({ id: 'a', completed: true, completedAt: base }),
      task({ id: 'b', completed: true, completedAt: base + 20 * 60_000 }),
      task({ id: 'c', completed: true, completedAt: base + 55 * 60_000 }),
    ]);
    expect(burst.size).toBe(0);
  });

  it('catches a burst that straddles a wall-clock boundary', async () => {
    // The reason this slides rather than buckets: a run at 09:59:58 would be
    // split across two fixed buckets and missed entirely.
    const base = Date.parse('2026-09-01T09:59:58');
    const burst = burstClosures([
      task({ id: 'a', completed: true, completedAt: base }),
      task({ id: 'b', completed: true, completedAt: base + 1500 }),
      task({ id: 'c', completed: true, completedAt: base + 3000 }),
    ]);
    expect([...burst].sort()).toEqual(['a', 'b', 'c']);
  });

  it('breaks a run at the window, so a long steady session is not one burst', async () => {
    const base = Date.parse('2026-09-01T10:00:00');
    const burst = burstClosures([
      task({ id: 'a', completed: true, completedAt: base }),
      task({ id: 'b', completed: true, completedAt: base + BURST_WINDOW_MS + 1 }),
      task({ id: 'c', completed: true, completedAt: base + 2 * (BURST_WINDOW_MS + 1) }),
    ]);
    expect(burst.size).toBe(0);
  });

  it('flags homework closed with nothing attached and nothing said', async () => {
    await evidenceStepAvailableFrom('2026-08-01T00:00:00');
    await db.tasks.add(closedAt('2026-09-01T10:00:00', { id: 'silent', isHomework: true }));

    const { questionable } = await reconcileXp();
    expect(questionable[0].concerns).toContain('NO_EVIDENCE');
  });

  it('stops flagging it once somebody explains why there is nothing', async () => {
    await evidenceStepAvailableFrom('2026-08-01T00:00:00');
    await db.tasks.add(closedAt('2026-09-01T10:00:00', { id: 'silent', isHomework: true }));
    await addEvidenceNote({
      entityId: 'silent',
      title: 'Task',
      text: 'Classwork, the book stayed in school',
      authorRole: 'STUDENT',
    });

    const { questionable } = await reconcileXp();
    expect(questionable).toEqual([]);
  });

  it('flags a row closed at the instant it was created', async () => {
    const at = Date.parse('2026-09-01T10:00:00');
    await db.tasks.add(task({ id: 'seeded', completed: true, createdAt: at, completedAt: at }));

    const { questionable } = await reconcileXp();
    expect(questionable[0].concerns).toContain('CLOSED_ON_CREATION');
  });

  it('flags work marked done with no record of when', async () => {
    await db.tasks.add(task({ id: 'undated', completed: true, completedAt: undefined }));

    const { questionable } = await reconcileXp();
    expect(questionable[0].concerns).toContain('UNDATED');
  });

  it('never adjusts the balance, only sizes the question', async () => {
    const base = Date.parse('2026-09-01T10:00:00');
    await db.tasks.bulkAdd([
      task({ id: 'a', completed: true, completedAt: base }),
      task({ id: 'b', completed: true, completedAt: base + 1000 }),
      task({ id: 'c', completed: true, completedAt: base + 2000 }),
    ]);

    const { earned, questionableXp } = await reconcileXp();
    // The app has no standing to decide a close was not real. A balance that
    // silently differed from the one in the header would be the worst of both.
    expect(earned).toBe(150);
    expect(questionableXp).toBe(150);
    expect((await calculateTotalXP()).totalXP).toBe(150);
  });

  it('says nothing about a properly closed piece of work', async () => {
    await db.tasks.add(
      closedAt('2026-09-01T10:00:00', {
        id: 'clean',
        driveProofUrl: 'https://drive.google.com/x',
      })
    );

    const { questionable, entries } = await reconcileXp();
    expect(questionable).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0].concerns).toEqual([]);
  });
});

/**
 * The flag reads as "you skipped the step you were offered". Before the app
 * offered one, a task could not carry a photo or a link at all - so applied to
 * a term of history it does not produce a few false positives, it produces
 * nothing but false positives, and the real cases are lost in them.
 */
describe('the missing-evidence flag only reaches back as far as the step does', () => {
  it('says nothing about work closed before the step existed', async () => {
    await evidenceStepAvailableFrom('2026-09-05T00:00:00');
    await db.tasks.add(closedAt('2026-09-01T10:00:00', { id: 'before', isHomework: true }));

    const { questionable } = await reconcileXp();
    expect(questionable).toEqual([]);
  });

  it('flags work closed after it', async () => {
    await evidenceStepAvailableFrom('2026-09-05T00:00:00');
    await db.tasks.add(closedAt('2026-09-06T10:00:00', { id: 'after', isHomework: true }));

    const { questionable } = await reconcileXp();
    expect(questionable[0].concerns).toContain('NO_EVIDENCE');
  });

  it('counts a close at the very moment the step arrived as inside it', async () => {
    await evidenceStepAvailableFrom('2026-09-05T00:00:00');
    await db.tasks.add(closedAt('2026-09-05T00:00:00', { id: 'boundary', isHomework: true }));

    const { questionable } = await reconcileXp();
    expect(questionable[0].concerns).toContain('NO_EVIDENCE');
  });

  it('says nothing at all when the step has never been marked available', async () => {
    // Silence is the right failure mode for an accusation: with no record that
    // the step existed, there is nothing to have skipped.
    await db.tasks.add(closedAt('2026-09-01T10:00:00', { id: 'unknown', isHomework: true }));

    const { questionable } = await reconcileXp();
    expect(questionable).toEqual([]);
  });

  it('does not add it to work that cannot be placed in time at all', async () => {
    await evidenceStepAvailableFrom('2026-08-01T00:00:00');
    await db.tasks.add(task({ id: 'undated', completed: true, completedAt: undefined }));

    const { questionable } = await reconcileXp();
    // UNDATED is the honest thing to say. A second accusation derived from a
    // date the row does not have would be inventing certainty.
    expect(questionable[0].concerns).toEqual(['UNDATED']);
  });

  it('still leaves the burst signal reaching back over old data', async () => {
    // The point of the gate is that the app once offered no way to attach
    // evidence. It never offered a way to close three things in four seconds
    // on purpose, so that signal is as true of August as of today.
    const base = Date.parse('2026-06-01T10:00:00');
    await db.tasks.bulkAdd([
      task({ id: 'a', completed: true, completedAt: base }),
      task({ id: 'b', completed: true, completedAt: base + 1000 }),
      task({ id: 'c', completed: true, completedAt: base + 2000 }),
    ]);

    const { questionable } = await reconcileXp();
    expect(questionable).toHaveLength(3);
    for (const entry of questionable) expect(entry.concerns).toEqual(['BURST']);
  });

  it('still lists the gap on the Evidence tab, which audits every one', async () => {
    // Only the XP accusation is gated. A gap is a gap, and old work can still
    // have its photo added retroactively.
    await evidenceStepAvailableFrom('2026-09-05T00:00:00');
    await db.tasks.add(closedAt('2026-09-01T10:00:00', { id: 'before', isHomework: true }));

    expect(await workNeedingEvidence()).toHaveLength(1);
    expect((await reconcileXp()).questionable).toEqual([]);
  });
});

describe('when the step became available', () => {
  it('is written the first time the app runs a build that has it', async () => {
    await db.parentSettings.put({ id: 'active_settings' } as never);
    await markEvidenceOnCloseAvailable(Date.parse('2026-09-05T09:00:00'));

    expect(await evidenceOnCloseFrom()).toBe(Date.parse('2026-09-05T09:00:00'));
  });

  it('never moves once set, so a later device cannot un-flag real gaps', async () => {
    await db.parentSettings.put({ id: 'active_settings' } as never);
    await markEvidenceOnCloseAvailable(Date.parse('2026-09-05T09:00:00'));
    await markEvidenceOnCloseAvailable(Date.parse('2026-09-20T09:00:00'));

    expect(await evidenceOnCloseFrom()).toBe(Date.parse('2026-09-05T09:00:00'));
  });

  it('waits rather than inventing a settings row that does not exist yet', async () => {
    await markEvidenceOnCloseAvailable(Date.parse('2026-09-05T09:00:00'));

    expect(await evidenceOnCloseFrom()).toBeUndefined();
    expect(await db.parentSettings.get('active_settings')).toBeUndefined();
  });
});

describe('reading the statement', () => {
  it('puts the most recent line first', async () => {
    await db.tasks.bulkAdd([
      closedAt('2026-09-01T10:00:00', { id: 'older' }),
      closedAt('2026-09-05T10:00:00', { id: 'newer' }),
    ]);

    const entries = await xpStatement();
    expect(entries.map((e) => e.entityId)).toEqual(['newer', 'older']);
  });

  it('groups the totals by where the points came from', async () => {
    await db.tasks.add(closedAt('2026-09-01T10:00:00', { xpValue: 40 }));
    await db.choreCompletions.add({
      id: 'chore_1',
      choreId: 'c1',
      date: '2026-09-01',
      completedAt: Date.parse('2026-09-01T18:00:00'),
      xpAwarded: 25,
    } as never);

    const { bySource } = await reconcileXp();
    expect(bySource.find((row) => row.source === 'TASK')?.total).toBe(40);
    expect(bySource.find((row) => row.source === 'CHORE')?.total).toBe(25);
  });

  it('separates a fix-up from ordinary homework', async () => {
    await db.tasks.add(
      closedAt('2026-09-01T10:00:00', { isRemediation: true, isHomework: false })
    );

    const entries = await xpStatement();
    expect(entries[0].source).toBe('FIX_UP');
  });
});

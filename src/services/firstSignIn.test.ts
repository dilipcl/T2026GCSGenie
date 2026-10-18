import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { db, isUntouchedSeed, seedLedgerKey } from '../db';
import { resetDatabase } from '../test/harness';
import { INITIAL_GOALS, INITIAL_SYLLABUS_TOPICS, INITIAL_TASKS } from '../db/seedData';
import { Goal } from '../types';
import { signInWithoutOverwriting } from './firstSignIn';

/**
 * A new device joining the family must not undo the family's decisions.
 *
 * On 11 October 2026 one did. It had seeded the starter content while signed
 * out, and its first sign-in uploaded every row it held as an upsert: the
 * Computer Science goal approved on 27 September went back to "waiting for
 * discussion", and the duplicate Maths goal and starter topics Tejas had
 * deleted came back. These stand a fresh, seeded device in for that one, with
 * `login` and `pull` standing in for Dexie Cloud.
 *
 * What gets uploaded is whatever is on the device when `login` runs, so that
 * is the moment the first test inspects.
 */

const CS_GOAL = 'g-academic-cs';
const MATHS_GOAL = 'g-academic-maths';
const familyCsGoal = (): Goal =>
  ({ ...INITIAL_GOALS.find((g) => g.id === CS_GOAL)!, status: 'APPROVED_LOCKED' }) as Goal;

/** The family's realm: CS approved, the duplicate Maths goal long deleted. */
async function familyArrives(): Promise<boolean> {
  await db.goals.put(familyCsGoal());
  return true;
}

beforeEach(async () => {
  await resetDatabase();
});

describe('signing a new device in to an existing family', () => {
  it('has no untouched starter row on the device when the upload is taken', async () => {
    let atLogin: unknown[] = [];
    await signInWithoutOverwriting({
      login: async () => {
        atLogin = await Promise.all([db.goals.get(CS_GOAL), db.goals.get(MATHS_GOAL)]);
      },
      pull: familyArrives,
    });

    expect(atLogin).toEqual([undefined, undefined]);
  });

  it('keeps the family approval and the family deletions', async () => {
    await signInWithoutOverwriting({ login: async () => {}, pull: familyArrives });

    expect((await db.goals.get(CS_GOAL))?.status).toBe('APPROVED_LOCKED');
    expect(await db.goals.get(MATHS_GOAL)).toBeUndefined();
    expect(await db.syllabusTopics.get(INITIAL_SYLLABUS_TOPICS[0].id)).toBeUndefined();
  });

  it('still remembers the starter rows as offered, so a reload does not reseed them', async () => {
    await signInWithoutOverwriting({ login: async () => {}, pull: familyArrives });
    await (db as unknown as { seedMissingRows(): Promise<void> }).seedMissingRows();

    expect(await db.goals.get(MATHS_GOAL)).toBeUndefined();
    expect(await db.seedLedger.get(seedLedgerKey('goals', MATHS_GOAL))).toBeDefined();
  });

  it('uploads a starter row this device has already worked on', async () => {
    const topic = INITIAL_SYLLABUS_TOPICS[0];
    await db.syllabusTopics.update(topic.id, { isCompleted: !topic.isCompleted });

    let atLogin: unknown;
    await signInWithoutOverwriting({
      login: async () => {
        atLogin = await db.syllabusTopics.get(topic.id);
      },
      pull: familyArrives,
    });

    expect(atLogin).toBeDefined();
  });
});

describe('when there is no family to join, or no sign-in', () => {
  it('puts everything back if sign-in is cancelled', async () => {
    const goalsBefore = await db.goals.toArray();
    const topicsBefore = await db.syllabusTopics.count();

    await expect(
      signInWithoutOverwriting({
        login: async () => {
          throw new Error('Cancelled');
        },
        pull: async () => true,
      })
    ).rejects.toThrow('Cancelled');

    expect(await db.goals.toArray()).toEqual(goalsBefore);
    expect(await db.syllabusTopics.count()).toBe(topicsBefore);
  });

  it('restores the starter content when the account turns out to be empty', async () => {
    const topicsBefore = await db.syllabusTopics.count();

    await signInWithoutOverwriting({ login: async () => {}, pull: async () => true });

    expect(await db.syllabusTopics.count()).toBe(topicsBefore);
    expect(await db.goals.get(CS_GOAL)).toBeDefined();
  });

  it('leaves the starter content off when the first pull does not finish', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await signInWithoutOverwriting({ login: async () => {}, pull: async () => false });

    // Restoring here would upload them over a family not yet heard from.
    expect(await db.goals.get(CS_GOAL)).toBeUndefined();
    warn.mockRestore();
  });
});

describe('what counts as untouched', () => {
  it('ignores the clock the seed was built with', () => {
    const seed = INITIAL_TASKS[0];
    const seededOnMonday = { ...seed, createdAt: 1, dueDate: '2026-09-01' };
    expect(isUntouchedSeed(seededOnMonday, seed)).toBe(true);
  });

  it('ignores what the sync layer stamps on a row', () => {
    const seed = INITIAL_GOALS[0];
    expect(isUntouchedSeed({ ...seed, owner: 'unauthorized', realmId: 'x' }, seed)).toBe(true);
  });

  it('counts any real change, and any added field, as touched', () => {
    const seed = INITIAL_TASKS[0];
    expect(isUntouchedSeed({ ...seed, completed: true }, seed)).toBe(false);
    expect(isUntouchedSeed({ ...seed, loggedMinutes: 30 }, seed)).toBe(false);
  });
});

/**
 * The fix only holds if every sign-in goes through it. A bare
 * `db.cloud.login()` added anywhere later would upload the starter rows again,
 * and nothing would fail until a new device met a family.
 */
describe('every sign-in goes through the guarded path', () => {
  it('has no bare cloud login in the header control', () => {
    const source = readFileSync('src/components/layout/SyncStatus.tsx', 'utf8');
    expect(source).not.toMatch(/cloud\??\.login\s*\(/);
    expect(source).toMatch(/signInWithoutOverwriting\(\)/);
  });
});

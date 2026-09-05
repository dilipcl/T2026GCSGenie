import { describe, it, expect, beforeEach } from 'vitest';
import { db, seedLedgerKey } from '.';
import { emptyDatabase, resetDatabase } from '../test/harness';
import { INITIAL_SYLLABUS_TOPICS, INITIAL_SUBJECTS, INITIAL_REWARDS } from './seedData';
import { SyllabusTopic } from '../types';

/**
 * Deleting seeded content used to be impossible.
 *
 * Seeding inserted any seed row whose primary key was absent, on every load, so
 * a deliberate deletion was undone by the next refresh. Tejas reported it
 * against the Art topics: he deleted them, saved, reloaded, and they were all
 * back. These tests hold the line on both halves of the fix - deletions stick,
 * and genuinely new seed rows still arrive.
 */

const seedTopics = (subjectId: string) =>
  INITIAL_SYLLABUS_TOPICS.filter((t) => t.subjectId === subjectId);

async function reopenApp(): Promise<void> {
  // `seedMissingRows` is private; this is what the `ready` hook calls on every
  // open, which is the event the bug was reported against.
  await (db as unknown as { seedMissingRows(): Promise<void> }).seedMissingRows();
}

describe('seed ledger', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('seeds starter content into a database that has never seen it', async () => {
    expect(await db.subjects.count()).toBe(INITIAL_SUBJECTS.length);
    expect(await db.syllabusTopics.count()).toBe(INITIAL_SYLLABUS_TOPICS.length);
  });

  it('records every row it offers, whether or not it inserted one', async () => {
    const entry = await db.seedLedger.get(
      seedLedgerKey('syllabusTopics', INITIAL_SYLLABUS_TOPICS[0].id)
    );
    expect(entry).toBeDefined();
  });

  it('does not bring a deleted topic back on the next load', async () => {
    const art = seedTopics('art');
    expect(art.length).toBeGreaterThan(0);

    await db.syllabusTopics.bulkDelete(art.map((t) => t.id));
    expect(await db.syllabusTopics.where('subjectId').equals('art').count()).toBe(0);

    await reopenApp();

    expect(await db.syllabusTopics.where('subjectId').equals('art').count()).toBe(0);
  });

  it('leaves other subjects untouched when one subject is cleared', async () => {
    const before = await db.syllabusTopics.where('subjectId').equals('biology').count();
    await db.syllabusTopics.bulkDelete(seedTopics('art').map((t) => t.id));

    await reopenApp();

    expect(await db.syllabusTopics.where('subjectId').equals('biology').count()).toBe(before);
  });

  it('survives many reloads, not just the first', async () => {
    await db.syllabusTopics.bulkDelete(seedTopics('art').map((t) => t.id));

    await reopenApp();
    await reopenApp();
    await reopenApp();

    expect(await db.syllabusTopics.where('subjectId').equals('art').count()).toBe(0);
  });

  it('keeps deletions of every other seeded table too', async () => {
    const reward = INITIAL_REWARDS[0];
    await db.rewards.delete(reward.id);

    await reopenApp();

    expect(await db.rewards.get(reward.id)).toBeUndefined();
  });

  it('still delivers a seed row this database has never been offered', async () => {
    // Stands in for a row added by a later app version: present in the seed
    // list, absent from both the table and the ledger.
    const topic = seedTopics('art')[0];
    await db.syllabusTopics.delete(topic.id);
    await db.seedLedger.delete(seedLedgerKey('syllabusTopics', topic.id));

    await reopenApp();

    expect(await db.syllabusTopics.get(topic.id)).toBeDefined();
  });

  it('never overwrites edits a family has made to a seeded row', async () => {
    const topic = seedTopics('art')[0];
    await db.syllabusTopics.update(topic.id, { title: 'Renamed by Tejas', isCompleted: true });

    await reopenApp();

    const after = (await db.syllabusTopics.get(topic.id)) as SyllabusTopic;
    expect(after.title).toBe('Renamed by Tejas');
    expect(after.isCompleted).toBe(true);
  });

  it('does not re-offer a row on a database whose ledger is already complete', async () => {
    const countBefore = await db.syllabusTopics.count();
    await reopenApp();
    expect(await db.syllabusTopics.count()).toBe(countBefore);
  });
});

describe('seed ledger on an empty database', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('treats a cleared ledger as a fresh install and seeds again', async () => {
    expect(await db.syllabusTopics.count()).toBe(0);

    await reopenApp();

    expect(await db.syllabusTopics.count()).toBe(INITIAL_SYLLABUS_TOPICS.length);
  });
});

/**
 * The upgrade path, which is the one that carries the family's real data.
 *
 * A database created before v19 arrives with content and no ledger. It has been
 * seeded on every load for months, so anything absent from it is absent because
 * somebody deleted it - and re-offering the set now would resurrect exactly what
 * the ledger exists to keep buried.
 *
 * Deliberately decided on every open rather than in a one-shot `upgrade`
 * callback, so that a device which never ran the migration - restored from a
 * backup, or arriving over sync with rows but no ledger - settles itself rather
 * than re-seeding for ever.
 */
describe('a database that predates the ledger', () => {
  beforeEach(async () => {
    await resetDatabase();
    // What a pre-v19 database looks like the moment v19 first opens it:
    // fully seeded content, and nothing recorded as offered.
    await db.seedLedger.clear();
  });

  it('does not re-offer anything, so deletions made before the upgrade stick', async () => {
    await db.syllabusTopics.bulkDelete(seedTopics('art').map((t) => t.id));

    await reopenApp();

    expect(await db.syllabusTopics.where('subjectId').equals('art').count()).toBe(0);
  });

  it('records the whole seed set as already offered', async () => {
    await reopenApp();

    const entry = await db.seedLedger.get(
      seedLedgerKey('syllabusTopics', INITIAL_SYLLABUS_TOPICS[0].id)
    );
    expect(entry).toBeDefined();
  });

  it('leaves the content it already has exactly alone', async () => {
    const before = await db.syllabusTopics.count();

    await reopenApp();

    expect(await db.syllabusTopics.count()).toBe(before);
  });

  it('stays settled across later loads', async () => {
    await db.rewards.delete(INITIAL_REWARDS[0].id);

    await reopenApp();
    await reopenApp();

    expect(await db.rewards.get(INITIAL_REWARDS[0].id)).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import {
  exportDatabaseToJSON,
  importDatabaseFromJSON,
  isInternalCloudTable,
} from './backupService';

/**
 * These exist because a real backup file, opened after it was written, turned
 * out to contain a live Dexie Cloud refresh token. `exportDatabaseToJSON`
 * walks `db.tables` - which was the fix for a bug that lost every milestone -
 * and after the cloud addon loads, that walk includes the addon's own tables.
 */

beforeEach(async () => {
  await emptyDatabase();
});

describe('what counts as the addon’s own table', () => {
  it('excludes every $-prefixed table', () => {
    // The credential one, the sync bookkeeping, and the mutation queues.
    for (const name of ['$logins', '$syncState', '$baseRevs', '$jobs', '$tasks_mutations']) {
      expect(isInternalCloudTable(name)).toBe(true);
    }
  });

  it('excludes the server-managed access tables', () => {
    for (const name of ['members', 'roles', 'realms']) {
      expect(isInternalCloudTable(name)).toBe(true);
    }
  });

  it('keeps the family’s own tables', () => {
    for (const name of ['tasks', 'goals', 'checkIns', 'auditLogs', 'attachments', 'driveSync']) {
      expect(isInternalCloudTable(name)).toBe(false);
    }
  });

  it('excludes an unknown $-table by default', () => {
    // Identified by prefix so a table a future addon version adds is excluded
    // without waiting for somebody to notice it in a file.
    expect(isInternalCloudTable('$somethingAddedLater')).toBe(true);
  });
});

describe('the exported bundle', () => {
  it('carries no cloud-internal table at all', async () => {
    const bundle = JSON.parse(await exportDatabaseToJSON());

    const leaked = Object.keys(bundle).filter(isInternalCloudTable);
    expect(leaked).toEqual([]);
  });

  it('carries no credential field, whatever the table', async () => {
    await db.tasks.add({
      id: 'task_1',
      subjectId: 'maths',
      title: 'Algebra practice',
      dueDate: '2026-09-30',
      priority: 'MEDIUM',
      isHomework: true,
      isRemediation: false,
      xpValue: 10,
      completed: false,
      createdAt: Date.now(),
    });

    const raw = await exportDatabaseToJSON();

    // A blunt check on the whole file on purpose: the defect was a field
    // arriving through a table nobody had listed, so this asserts on the bytes
    // that actually leave the device rather than on a table we remembered.
    for (const secret of ['refreshToken', 'accessToken', 'nonExportablePrivateKey', 'llmApiKey']) {
      expect(raw).not.toContain(secret);
    }
  });

  it('still carries the family’s data', async () => {
    await db.goals.add({
      id: 'goal_1',
      title: 'Grade 8 Maths',
      category: 'ACADEMIC_GRADE_9',
      subjectId: 'maths',
      smartSpecific: '',
      smartMeasurable: '',
      smartAchievable: '',
      smartRealistic: '',
      smartTimeBound: '',
      status: 'APPROVED_LOCKED',
      ragStatus: 'GREEN',
      weeklyHoursRequired: 4,
      createdAt: Date.now(),
    });

    const bundle = JSON.parse(await exportDatabaseToJSON());

    expect(bundle.goals).toHaveLength(1);
    // Present as a key even when empty - the harness clears the seed rows, and
    // an absent table would make the importer preserve rather than replace.
    expect(Array.isArray(bundle.subjects)).toBe(true);
    expect(Array.isArray(bundle.milestones)).toBe(true);
  });
});

describe('restoring one', () => {
  it('ignores cloud-internal tables carried by an older bundle', async () => {
    const bundle = JSON.parse(await exportDatabaseToJSON());

    // A file written before the fix: it carries the addon's tables.
    bundle.$logins = [{ userId: 'someone', refreshToken: 'stale-token' }];
    bundle.$baseRevs = [{ rev: 1 }];
    bundle.realms = [{ realmId: 'rlm-old' }];

    const result = await importDatabaseFromJSON(JSON.stringify(bundle));

    // Not restored, and not reported as preserved either - they are not part
    // of the backup's business in the first place.
    expect(result.restored.$logins).toBeUndefined();
    expect(result.restored.$baseRevs).toBeUndefined();
    expect(result.preserved).not.toContain('$logins');
    expect(result.preserved).not.toContain('realms');
  });

  it('round-trips the data tables', async () => {
    await db.tasks.add({
      id: 'task_rt',
      subjectId: 'physics',
      title: 'Energy questions',
      dueDate: '2026-10-01',
      priority: 'HIGH',
      isHomework: true,
      isRemediation: false,
      xpValue: 20,
      completed: false,
      createdAt: Date.now(),
    });

    const bundle = await exportDatabaseToJSON();
    await db.tasks.clear();
    expect(await db.tasks.count()).toBe(0);

    await importDatabaseFromJSON(bundle);

    expect(await db.tasks.count()).toBe(1);
    expect((await db.tasks.get('task_rt'))?.title).toBe('Energy questions');
  });
});

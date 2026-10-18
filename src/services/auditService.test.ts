import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { logFieldChanges } from './auditService';

/**
 * Field values have to survive being read by a person months later. Seen live:
 * a WhatsApp contact list rendered as "[object Object],[object Object]", which
 * is a row in the activity feed that tells a parent nothing at all.
 */

beforeEach(async () => {
  await emptyDatabase();
});

async function change(before: Record<string, unknown>, after: Record<string, unknown>) {
  await logFieldChanges({
    user: 'PARENT',
    entity: 'StudentProfile',
    entityId: 'profile_1',
    before,
    after,
  });
  return (await db.auditLogs.toArray())[0];
}

describe('writing a field value a person can read', () => {
  it('summarises a list of objects instead of printing [object Object]', async () => {
    const row = await change(
      { numbers: [{ id: '1', e164: '447700900123' }] },
      { numbers: [{ id: '1', e164: '447700900123' }, { id: '2', e164: '447700900124' }] }
    );

    expect(row.oldValue).toBe('1 item');
    expect(row.newValue).toBe('2 items');
    expect(row.newValue).not.toContain('[object Object]');
  });

  it('joins a list of plain values', async () => {
    const row = await change({ subjects: ['maths'] }, { subjects: ['maths', 'physics'] });
    expect(row.newValue).toBe('maths, physics');
  });

  it('prefers a name on a single object', async () => {
    const row = await change({ reward: { name: 'Old' } }, { reward: { name: 'Film night' } });
    expect(row.newValue).toBe('Film night');
  });

  it('says (none) for an emptied list', async () => {
    const row = await change({ numbers: [{ id: '1' }] }, { numbers: [] });
    expect(row.newValue).toBe('(none)');
  });

  it('leaves ordinary values alone', async () => {
    const row = await change({ hours: 3.5 }, { hours: 3 });
    expect(row.oldValue).toBe('3.5');
    expect(row.newValue).toBe('3');
  });

  describe('a field whose value is a key', () => {
    async function changeSecret(before: Record<string, unknown>, after: Record<string, unknown>) {
      await logFieldChanges({
        user: 'PARENT',
        entity: 'StudentProfile',
        entityId: 'profile_1',
        before,
        after,
        secret: ['link'],
      });
      return db.auditLogs.toArray();
    }

    /** The log syncs, the student reads it, and its rows cannot be scrubbed. */
    it('records that it was set, never the value', async () => {
      const [row] = await changeSecret({}, { link: 'https://chat.whatsapp.com/SECRET' });
      expect(row.oldValue).toBe('(blank)');
      expect(row.newValue).toBe('(set)');
      expect(JSON.stringify(row)).not.toContain('SECRET');
    });

    it('still records one link replacing another', async () => {
      const rows = await changeSecret(
        { link: 'https://chat.whatsapp.com/OLD' },
        { link: 'https://chat.whatsapp.com/NEW' }
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].oldValue).toBe('(set)');
      expect(rows[0].newValue).toBe('(replaced)');
      expect(JSON.stringify(rows[0])).not.toMatch(/OLD|NEW/);
    });

    it('records it being cleared', async () => {
      const [row] = await changeSecret({ link: 'https://chat.whatsapp.com/OLD' }, { link: undefined });
      expect(row.newValue).toBe('(blank)');
    });
  });

  it('writes nothing when a list is unchanged', async () => {
    await logFieldChanges({
      user: 'PARENT',
      entity: 'StudentProfile',
      entityId: 'profile_1',
      before: { numbers: [{ id: '1' }, { id: '2' }] },
      after: { numbers: [{ id: '1' }, { id: '2' }] },
    });
    expect(await db.auditLogs.count()).toBe(0);
  });
});

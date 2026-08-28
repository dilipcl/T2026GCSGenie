import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../db';
import { resetDatabase } from './harness';

describe('database harness', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it('opens without the cloud addon outside a browser', () => {
    expect(db.isOpen()).toBe(true);
    expect(db.cloud).toBeUndefined();
  });

  it('seeds the starter content', async () => {
    expect(await db.subjects.count()).toBeGreaterThan(0);
    expect(await db.timetableEntries.count()).toBeGreaterThan(0);
    expect(await db.parentSettings.get('active_settings')).toBeTruthy();
  });
});

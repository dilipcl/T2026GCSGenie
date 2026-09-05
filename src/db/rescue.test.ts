import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '.';
import { resetDatabase } from '../test/harness';
import { readRescueCounts, exportRescueBundle } from './rescue';
import { setDatabaseStatus, getDatabaseStatus, startOpenWatchdog } from './databaseStatus';

/**
 * The rescue path is the one piece of this app that has to work on the day
 * everything else does not. It runs when the database will not open, which is
 * exactly when nothing can be verified by hand - so it is verified here.
 *
 * Two promises are being kept. That a stuck app can still say how much data is
 * on the device, because "is it all gone?" is the question that makes people
 * clear their site data. And that the copy it offers carries no credentials,
 * because a bundle written mid-panic is the one most likely to be mailed
 * around.
 */

describe('reading the data without Dexie', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('counts the rows that are actually on the device', async () => {
    const reading = await readRescueCounts();

    // Seeded content is present, so a stuck app can say so rather than
    // showing an empty screen and letting the family draw the obvious
    // and wrong conclusion.
    expect(reading.rowsFound).toBeGreaterThan(0);
    expect(reading.counts.subjects).toBeGreaterThan(0);
  });

  it('leaves empty tables out of the reading', async () => {
    const reading = await readRescueCounts();

    for (const count of Object.values(reading.counts)) {
      expect(count).toBeGreaterThan(0);
    }
  });

  it('reads the database that is really on disk, whatever it is called', async () => {
    const reading = await readRescueCounts();
    // dexie-cloud renames the store to `GCSEGenieDB-<databaseId>`, so the name
    // in the constructor is not the name to open.
    expect(reading.databaseName).toMatch(/^GCSEGenieDB/);
  });

  it('does not need the app database to be open', async () => {
    db.close();

    const reading = await readRescueCounts();
    expect(reading.rowsFound).toBeGreaterThan(0);

    await db.open();
  });
});

describe('the copy it offers to save', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('carries the family content', async () => {
    const bundle = JSON.parse(await exportRescueBundle());

    expect(bundle.format).toBe('gcse-genie-rescue/1');
    expect(bundle.tables.subjects.length).toBeGreaterThan(0);
  });

  it('never carries the login tokens', async () => {
    const bundle = JSON.parse(await exportRescueBundle());

    // `$logins` holds a live refresh token, which outlives the access token it
    // came with - an old rescue file would stay dangerous long after it stopped
    // being useful.
    for (const table of Object.keys(bundle.tables)) {
      expect(table.startsWith('$')).toBe(false);
    }
    expect(bundle.tables.members).toBeUndefined();
    expect(bundle.tables.realms).toBeUndefined();
  });

  it('strips the parent API key', async () => {
    await db.parentSettings.put({
      id: 'default',
      llmApiKey: 'sk-should-never-be-written-to-a-file',
    } as never);

    const bundle = JSON.parse(await exportRescueBundle());

    for (const row of bundle.tables.parentSettings ?? []) {
      expect(row.llmApiKey).toBeUndefined();
    }
    expect(await exportRescueBundle()).not.toContain('sk-should-never');
  });
});

describe('noticing that opening has stalled', () => {
  beforeEach(() => {
    setDatabaseStatus({ state: 'OPENING' });
  });

  it('says so once the deadline passes with nothing settled', async () => {
    startOpenWatchdog(1);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(getDatabaseStatus().state).toBe('STALLED');
  });

  it('stays quiet when the database opens in time', async () => {
    const settled = startOpenWatchdog(50);
    setDatabaseStatus({ state: 'OPEN' });
    settled();
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(getDatabaseStatus().state).toBe('OPEN');
  });

  it('does not overrule a database that already named its problem', async () => {
    setDatabaseStatus({ state: 'BLOCKED' });
    startOpenWatchdog(1);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // BLOCKED is actionable - close the other tab - and STALLED is not. The
    // more specific message has to survive.
    expect(getDatabaseStatus().state).toBe('BLOCKED');
  });

  it('clears once a slow open finally succeeds', async () => {
    startOpenWatchdog(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getDatabaseStatus().state).toBe('STALLED');

    setDatabaseStatus({ state: 'OPEN' });
    expect(getDatabaseStatus().state).toBe('OPEN');
  });
});

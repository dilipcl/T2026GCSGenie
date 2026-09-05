import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Nothing that writes may run before the database is open.
 *
 * Dexie awaits every `ready` handler before `open()` resolves. Almost every
 * table in this app is synced, and a write to a synced table goes through
 * dexie-cloud to be stamped with `owner` and `realmId` - work that waits on an
 * open database. Put a write in `ready` and the three wait on each other:
 * ready waits for the write, the write waits for open, open waits for ready.
 *
 * This shipped, and it cost a day. Seeding was called from `ready`, and it
 * deadlocked only on a load that actually had something to write - a new
 * settings default to fill in, a seed row not yet offered. The same device
 * would start perfectly well for a week and then hang. Nothing threw and
 * nothing logged; every screen sat on its loading placeholder, and those
 * placeholders are zeroes and dashes, so the app looked exactly like an app
 * whose data had been deleted. The family's first instinct was to clear the
 * site data, which is the one action that would have made it true.
 *
 * The invariant is structural and a one-line edit restores the bug, so it is
 * checked against the source rather than against behaviour that only
 * misbehaves against a real cloud backend.
 */

const source = readFileSync('src/db/index.ts', 'utf8');

describe('opening the database', () => {
  it('registers no ready handler at all', () => {
    // The safe uses of `ready` are hard to tell from the fatal ones, and there
    // is no reason to need it here: work that wants an open database can say so
    // by running after `open()` resolves.
    expect(source).not.toMatch(/this\.on\(\s*['"]ready['"]/);
  });

  it('seeds only once the database is open', () => {
    const opened = source.indexOf('this.open()');
    const seeded = source.indexOf('this.seedMissingRows()');

    expect(opened).toBeGreaterThan(-1);
    expect(seeded).toBeGreaterThan(opened);
  });

  it('does not make opening wait for seeding to finish', () => {
    // Awaited, the seed would be back inside the open path in all but name.
    expect(source).toMatch(/void this\.seedMissingRows\(\)/);
    expect(source).not.toMatch(/await this\.seedMissingRows\(\)/);
  });

  it('reports a seeding failure instead of failing the open', () => {
    // A database that could not seed still holds the family's own data.
    // Refusing to open over it would be the more expensive failure.
    const call = source.slice(source.indexOf('this.seedMissingRows()'));
    expect(call.slice(0, 300)).toMatch(/\.catch\(/);
  });

  it('still starts the stall watchdog before opening', () => {
    const watchdog = source.indexOf('startOpenWatchdog()');
    const opened = source.indexOf('this.open()');

    // The failure being guarded against is the one where neither handler on
    // `open()` ever runs, so the deadline has to be set before the call.
    expect(watchdog).toBeGreaterThan(-1);
    expect(watchdog).toBeLessThan(opened);
  });
});

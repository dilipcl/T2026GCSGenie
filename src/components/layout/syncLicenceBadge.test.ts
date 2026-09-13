import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * The badge must never call a licence problem "Offline" again.
 *
 * dexie-cloud reports `phase: 'offline'` for two unrelated things: one device
 * losing signal, and a licence that is expired or deactivated. The second is
 * server-side, so it arrives on every device in the family at once, and the
 * word "Offline" sent everyone to check a wifi connection that was working
 * perfectly. It took an evening to find, and the field that distinguishes the
 * two - `SyncState.license` - was on the object the whole time.
 *
 * Nothing here is visible to the type checker: the `license` field is optional,
 * so dropping it in a refactor compiles, renders, and silently restores the
 * fault. There is no component-rendering harness in this project either, so the
 * source is what gets read - the deliberate pattern documented in CLAUDE.md.
 *
 * If this component moves, move this test with it. A guard pointed at the old
 * path still passes, which is worse than no guard.
 */

const source = readFileSync('src/components/layout/SyncStatus.tsx', 'utf8');

describe('the sync badge separates a licence fault from a lost signal', () => {
  it('reads the licence off the sync state at all', () => {
    // The whole bug in one line: the field was being thrown away.
    expect(source).toMatch(/syncState\?\.license/);
  });

  it('names both licence states dexie-cloud can report', () => {
    // 'ok' | 'expired' | 'deactivated'. A state with no branch falls through to
    // the phase lookup, which says "Offline" - the exact fault this guards.
    expect(source).toMatch(/\bexpired\b/);
    expect(source).toMatch(/\bdeactivated\b/);
  });

  it('gives each licence state a label that is not "Offline"', () => {
    const labels = [...source.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
    const offline = labels.filter((l) => /offline/i.test(l));

    // Exactly one: the genuine lost-signal case in the phase map.
    expect(offline).toHaveLength(1);

    // And the licence states have labels of their own.
    expect(labels).toContain('Sync expired');
    expect(labels).toContain('Sync blocked');
  });

  it('checks the licence before the phase, not beside it', () => {
    // When a licence is bad the phase is *always* 'offline', so a lookup that
    // consults the phase first can never reach the licence branch. Order is
    // the whole correctness argument here, and it is one keystroke from wrong.
    const licenceBranch = source.indexOf('licenceFault ??');
    const phaseLookup = source.indexOf("[phase ?? 'in-sync']");

    expect(licenceBranch).toBeGreaterThan(-1);
    expect(phaseLookup).toBeGreaterThan(-1);
    expect(licenceBranch).toBeLessThan(phaseLookup);
  });

  it('never claims "Up to date" without re-reading the licence', () => {
    // `db.cloud.sync()` resolves happily under an expired licence - the addon's
    // licence checks on the push path are commented out in the shipped build -
    // so an unconditional success toast tells a family whose data has not moved
    // for days that everything was sent and received.
    const success = source.indexOf("toast.success('Up to date'");
    const recheck = source.indexOf('db.cloud.syncState.value?.license');

    expect(recheck).toBeGreaterThan(-1);
    expect(recheck).toBeLessThan(success);
  });
});

import Dexie from 'dexie';
import { db } from '../db';
import { AuditLogEntry, UserRole } from '../types';
import { sha256 } from '../utils/hash';
import { newId } from '../utils/id';
import { getDeviceId } from '../utils/device';

export const GENESIS_HASH = '0'.repeat(64);

/**
 * The payload a row's hash covers. Every field that carries meaning is in here,
 * including the link to the previous row - that link is what turns a pile of
 * independently-hashed rows into a chain.
 */
function chainPayload(entry: Omit<AuditLogEntry, 'hash'>): string {
  return [
    entry.deviceId,
    entry.sequence,
    entry.prevHash,
    entry.timestamp,
    entry.user,
    entry.action,
    entry.entity,
    entry.entityId,
    entry.fieldChanged || '',
    entry.oldValue || '',
    entry.newValue || '',
  ].join('|');
}

export async function logAuditEvent(params: {
  user: UserRole;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'AGENT_AUDIT' | 'SANCTION_FREEZE' | 'REWARD_REDEEM';
  entity: string;
  entityId: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
}): Promise<AuditLogEntry> {
  const deviceId = getDeviceId();

  /**
   * Reading the tail and appending have to be one atomic step. Two events
   * logged in the same tick would otherwise both read the same predecessor,
   * both claim the same sequence number, and produce a fork that verification
   * cannot tell apart from a deletion.
   */
  return db.transaction('rw', db.auditLogs, db.parentSettings, async () => {
    const previous = await db.auditLogs
      .where('[deviceId+sequence]')
      .between([deviceId, Dexie.minKey], [deviceId, Dexie.maxKey])
      .last();

    const entry: Omit<AuditLogEntry, 'hash'> = {
      id: newId('audit'),
      deviceId,
      sequence: (previous?.sequence ?? -1) + 1,
      prevHash: previous?.hash ?? GENESIS_HASH,
      timestamp: Date.now(),
      user: params.user,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      fieldChanged: params.fieldChanged,
      oldValue: params.oldValue,
      newValue: params.newValue,
    };

    /**
     * sha256 resolves a WebCrypto promise, which Dexie does not track. Awaiting
     * it directly lets IndexedDB auto-commit the transaction before the add and
     * throws PrematureCommitError. Dexie.waitFor holds the transaction open
     * across the foreign promise, which is the whole reason it exists.
     */
    const hash = await Dexie.waitFor(sha256(chainPayload(entry)));

    const complete: AuditLogEntry = { ...entry, hash };
    await db.auditLogs.add(complete);

    // Record how far this device's chain has got. Truncating the newest entries
    // leaves a shorter but internally valid chain, so the only way to notice is
    // to remember the high-water mark somewhere other than the log itself.
    const settings = await db.parentSettings.get('active_settings');
    if (settings) {
      const tips = { ...(settings.auditChainTips || {}) };
      if ((tips[deviceId] ?? -1) < entry.sequence) {
        tips[deviceId] = entry.sequence;
        await db.parentSettings.update('active_settings', { auditChainTips: tips });
      }
    }

    return complete;
  });
}

/**
 * Writes one audit row per field that actually changed.
 *
 * Editing became possible across most of the app in August 2026, and an edit is
 * only accountable if the history says which field moved and what it was
 * before. A single "record updated" row would have satisfied the letter of the
 * audit trail and none of its purpose - a parent looking at a goal's weekly
 * hours needs to see 2 became 4, not that something changed.
 *
 * Unchanged fields are skipped, so saving a form without touching it writes
 * nothing and the history stays readable.
 */
export async function logFieldChanges<T extends Record<string, unknown>>(params: {
  user: UserRole;
  entity: string;
  entityId: string;
  before: T;
  after: Partial<T>;
  /** Human labels for the field names, where the key is not self-explanatory. */
  labels?: Partial<Record<keyof T, string>>;
}): Promise<number> {
  /**
   * Turns a field value into something a person can read.
   *
   * `String(value)` is fine for a number or a string and useless for anything
   * else: a list of WhatsApp contacts came out as
   * "[object Object],[object Object]", which told a parent reading the activity
   * feed precisely nothing about what had changed. Arrays and objects are
   * summarised instead - a count for a list, a name or a JSON form for an
   * object - so the row at least says how many and of what.
   */
  const asText = (value: unknown): string => {
    if (value === undefined || value === null || value === '') return '(blank)';

    if (Array.isArray(value)) {
      if (value.length === 0) return '(none)';
      const readable = value.every((v) => typeof v !== 'object' || v === null);
      if (readable) return value.join(', ');
      return `${value.length} item${value.length === 1 ? '' : 's'}`;
    }

    if (typeof value === 'object') {
      const named = value as { name?: string; title?: string; label?: string };
      const label = named.name || named.title || named.label;
      if (label) return String(label);
      try {
        return JSON.stringify(value);
      } catch {
        return '(unreadable)';
      }
    }

    return String(value);
  };

  let written = 0;
  for (const key of Object.keys(params.after) as (keyof T)[]) {
    const from = params.before[key];
    const to = params.after[key];
    if (asText(from) === asText(to)) continue;

    await logAuditEvent({
      user: params.user,
      action: 'UPDATE',
      entity: params.entity,
      entityId: params.entityId,
      fieldChanged: (params.labels?.[key] as string) || String(key),
      oldValue: asText(from),
      newValue: asText(to),
    });
    written += 1;
  }
  return written;
}

export type ChainFault =
  | { kind: 'ALTERED'; deviceId: string; sequence: number; entryId: string; detail: string }
  | { kind: 'MISSING'; deviceId: string; sequence: number; detail: string }
  | { kind: 'BROKEN_LINK'; deviceId: string; sequence: number; entryId: string; detail: string };

export interface ChainVerification {
  ok: boolean;
  totalEntries: number;
  /** Rows written before chaining existed. Unverifiable, not evidence of tampering. */
  legacyEntries: number;
  deviceCount: number;
  faults: ChainFault[];
  checkedAt: number;
}

/**
 * Recomputes every hash and every link.
 *
 * Chains are per device, not global. With sync, two devices can both append
 * while offline; a single global chain would fork every time that happened and
 * report tampering where there was none. Per-device chains make that fork
 * impossible by construction, so any break is a genuine edit or deletion.
 *
 * What this catches: a row whose contents were changed (its hash no longer
 * matches), and a row deleted from the middle or end of a device's run (a gap in
 * the sequence, or a successor pointing at a hash that is no longer there).
 *
 * What it cannot catch: someone who recomputes the whole chain after editing it.
 * The hashes are not signed, so this is tamper-evident against casual editing in
 * devtools, not against a determined forger. Resisting forgery needs a key the
 * student does not have, which a shared account cannot provide.
 */
export async function verifyAuditChain(): Promise<ChainVerification> {
  const all = await db.auditLogs.toArray();
  const settings = await db.parentSettings.get('active_settings');
  const tips = settings?.auditChainTips || {};
  const faults: ChainFault[] = [];

  const chained = all.filter((e) => typeof e.sequence === 'number' && !!e.deviceId);
  const legacyEntries = all.length - chained.length;

  const byDevice = new Map<string, AuditLogEntry[]>();
  for (const entry of chained) {
    const list = byDevice.get(entry.deviceId) || [];
    list.push(entry);
    byDevice.set(entry.deviceId, list);
  }

  for (const [deviceId, entries] of byDevice) {
    entries.sort((a, b) => a.sequence - b.sequence);

    let expectedPrev = GENESIS_HASH;
    let expectedSeq = 0;

    for (const entry of entries) {
      if (entry.sequence !== expectedSeq) {
        const gap = entry.sequence - expectedSeq;
        faults.push({
          kind: 'MISSING',
          deviceId,
          sequence: expectedSeq,
          detail: `Sequence jumps from ${expectedSeq} to ${entry.sequence} - ${gap} entr${
            gap === 1 ? 'y was' : 'ies were'
          } removed.`,
        });
        expectedSeq = entry.sequence;
      }

      if (entry.prevHash !== expectedPrev) {
        faults.push({
          kind: 'BROKEN_LINK',
          deviceId,
          sequence: entry.sequence,
          entryId: entry.id,
          detail: 'This entry does not follow on from the one before it.',
        });
      }

      const recomputed = await sha256(chainPayload(entry));
      if (recomputed !== entry.hash) {
        faults.push({
          kind: 'ALTERED',
          deviceId,
          sequence: entry.sequence,
          entryId: entry.id,
          detail: `"${entry.action} ${entry.entity}" has been edited since it was written.`,
        });
      }

      expectedPrev = entry.hash;
      expectedSeq = entry.sequence + 1;
    }

    // Compare against the furthest point this device is known to have reached
    const lastSeen = entries[entries.length - 1]?.sequence ?? -1;
    const highWater = tips[deviceId];
    if (typeof highWater === 'number' && highWater > lastSeen) {
      const missing = highWater - lastSeen;
      faults.push({
        kind: 'MISSING',
        deviceId,
        sequence: lastSeen + 1,
        detail: `The ${missing} most recent entr${
          missing === 1 ? 'y has' : 'ies have'
        } been removed - this device previously reached #${highWater}.`,
      });
    }
  }

  return {
    ok: faults.length === 0,
    totalEntries: all.length,
    legacyEntries,
    deviceCount: byDevice.size,
    faults,
    checkedAt: Date.now(),
  };
}

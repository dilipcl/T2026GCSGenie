import { db } from '../db';
import { ChangeCategory, ChangeLogEntry, UserRole } from '../types';
import { todayISO } from '../utils/date';
import { newId } from '../utils/id';

/**
 * The record of what was actually confirmed, and whether the family has been
 * told.
 *
 * This exists alongside the audit log rather than inside it, because the two
 * answer different questions. The audit log is a hash-chained record of every
 * write, built to prove nothing was altered afterwards; it is long, technical,
 * and nobody reads it on a Tuesday. This is the short list of things a person
 * deliberately said yes to, written in the words they would use, so it can be
 * sent to the family group without anyone having to interpret it.
 *
 * The point is to remove the argument. "Did you do your Maths?" stops being a
 * question when the answer was posted to the group at the moment it happened.
 */

export const CATEGORY_LABEL: Record<ChangeCategory, string> = {
  HOMEWORK: 'Homework',
  CHORE: 'Chores',
  CHECK_IN: 'Check-in',
  ATTENDANCE: 'Attendance',
  GOAL: 'Goals',
  REWARD: 'Rewards',
  PLAN: 'Plan',
  PROOF: 'Marked work',
};

export const CATEGORY_ICON: Record<ChangeCategory, string> = {
  HOMEWORK: '📚',
  CHORE: '🧹',
  CHECK_IN: '⚡',
  ATTENDANCE: '🗓️',
  GOAL: '🎯',
  REWARD: '🎁',
  PLAN: '📋',
  PROOF: '📄',
};

export interface RecordChangeInput {
  category: ChangeCategory;
  summary: string;
  detail?: string;
  actor?: UserRole;
}

/** Writes one confirmed change. Never throws into the caller's happy path. */
export async function recordChange(input: RecordChangeInput): Promise<ChangeLogEntry> {
  const entry: ChangeLogEntry = {
    id: newId('chg'),
    timestamp: Date.now(),
    date: todayISO(),
    actor: input.actor ?? 'STUDENT',
    category: input.category,
    summary: input.summary.trim(),
    detail: input.detail?.trim() || undefined,
    reported: false,
  };

  await db.changeLog.add(entry);
  return entry;
}

/**
 * Everything logged, newest first.
 *
 * Booleans and optional timestamps are never indexed - see the note at the top
 * of db/index.ts - so the lifecycle filters below all work in memory.
 */
export async function allChanges(): Promise<ChangeLogEntry[]> {
  return (await db.changeLog.orderBy('timestamp').toArray()).reverse();
}

/** Confirmed at the point of action, but not yet re-confirmed. Oldest first. */
export async function pendingConfirmation(): Promise<ChangeLogEntry[]> {
  const rows = await db.changeLog.orderBy('timestamp').toArray();
  return rows.filter((r) => !r.confirmedAt);
}

/** Re-confirmed and on the record. Newest first. */
export async function confirmedChanges(): Promise<ChangeLogEntry[]> {
  const rows = await db.changeLog.orderBy('timestamp').toArray();
  return rows.filter((r) => !!r.confirmedAt).reverse();
}

/**
 * Changes not yet sent to the family, oldest first.
 *
 * Only re-confirmed entries are eligible: forwarding something that has not
 * been signed off would send the family a draft.
 */
export async function unreportedChanges(): Promise<ChangeLogEntry[]> {
  const rows = await db.changeLog.orderBy('timestamp').toArray();
  return rows.filter((r) => !!r.confirmedAt && !r.reported);
}

/**
 * Puts a batch on the record.
 *
 * The comment is stored against every entry in the batch rather than as a
 * separate note, so an entry read on its own months later still carries the
 * context it was confirmed with.
 */
export async function confirmChanges(
  entries: ChangeLogEntry[],
  comment?: string
): Promise<ChangeLogEntry[]> {
  const now = Date.now();
  const trimmed = comment?.trim() || undefined;

  const updated = entries.map((entry) => ({
    ...entry,
    confirmedAt: now,
    confirmComment: trimmed ?? entry.confirmComment,
  }));

  await db.changeLog.bulkPut(updated);
  return updated;
}

/** Records that a batch was written to a Drive log file. */
export async function markDriveLogged(
  entries: ChangeLogEntry[],
  driveFileName: string
): Promise<void> {
  const now = Date.now();
  await db.changeLog.bulkPut(
    entries.map((e) => ({ ...e, driveLoggedAt: now, driveFileName }))
  );
}

/** Everything logged on one day, oldest first. */
export async function changesOn(date: string = todayISO()): Promise<ChangeLogEntry[]> {
  return (await db.changeLog.where('date').equals(date).toArray()).sort(
    (a, b) => a.timestamp - b.timestamp
  );
}

/**
 * Marks entries as sent.
 *
 * Called after the message has been handed to WhatsApp, not after delivery -
 * the app cannot observe delivery, and pretending otherwise would be the same
 * dishonesty as labelling the share button "Send".
 */
export async function markReported(entries: ChangeLogEntry[]): Promise<void> {
  const now = Date.now();
  await db.changeLog.bulkPut(
    entries.map((e) => ({ ...e, reported: true, reportedAt: now }))
  );
}

/** Groups entries by category, preserving order within each. */
export function groupByCategory(
  entries: ChangeLogEntry[]
): { category: ChangeCategory; entries: ChangeLogEntry[] }[] {
  const order: ChangeCategory[] = [
    'HOMEWORK',
    'CHECK_IN',
    'CHORE',
    'ATTENDANCE',
    'PROOF',
    'GOAL',
    'REWARD',
    'PLAN',
  ];

  const byCategory = new Map<ChangeCategory, ChangeLogEntry[]>();
  for (const entry of entries) {
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }

  return order
    .filter((c) => byCategory.has(c))
    .map((category) => ({ category, entries: byCategory.get(category)! }));
}

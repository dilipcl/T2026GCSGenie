import { useSyncExternalStore } from 'react';

/**
 * Whether the database is actually usable, published so the interface can say
 * so instead of quietly doing nothing.
 *
 * Every screen in this app reads IndexedDB. When the database does not open,
 * those reads never settle - they do not throw, they simply never come back -
 * and each button that waits on one becomes a silent no-op. Tapping Parent Mode
 * renders nothing, because the modal waits for the lock state before it draws;
 * tapping the sync badge appears to do nothing, because the sync it starts
 * never gets anywhere. Two dead buttons and no error anywhere: the most
 * expensive kind of failure, because there is nothing to report.
 *
 * The common trigger is a schema upgrade meeting a second open tab. IndexedDB
 * will not upgrade while an older connection is still holding the database, so
 * it fires `blocked` and waits - indefinitely, if the other tab is a
 * backgrounded phone tab nobody thinks to close.
 */
export type DatabaseStatus =
  | { state: 'OPENING' }
  | { state: 'OPEN' }
  /**
   * Opening has neither succeeded nor failed for long enough that something is
   * wrong. This is the state the app was missing, and it is the one that
   * actually bit the family: `open()` can hang instead of rejecting - waiting
   * on a blocked upgrade, or on a `ready` handler that is itself waiting on
   * something that waits on the open database - and a promise that never
   * settles reaches no `catch`. The app renders, every screen shows its
   * loading placeholder for ever, and nothing is logged. Without a deadline
   * there is no moment at which anyone can be told.
   */
  | { state: 'STALLED' }
  /** An older tab is holding the previous version open. */
  | { state: 'BLOCKED' }
  /** This tab stepped aside so a newer version could upgrade. */
  | { state: 'SUPERSEDED' }
  | { state: 'FAILED'; message: string };

let current: DatabaseStatus = { state: 'OPENING' };
const listeners = new Set<() => void>();

export function setDatabaseStatus(next: DatabaseStatus): void {
  // 'OPEN' must not overwrite a terminal state: Dexie can resolve `ready`
  // for a connection that has since been superseded.
  if (current.state === next.state) return;
  if (next.state === 'OPEN' && (current.state === 'BLOCKED' || current.state === 'SUPERSEDED')) {
    return;
  }
  // Only a still-opening database can go on to stall. Once it has opened, or
  // named a reason it could not, the watchdog firing late has nothing to add.
  if (next.state === 'STALLED' && current.state !== 'OPENING') return;
  current = next;
  for (const listener of listeners) listener();
}

export function getDatabaseStatus(): DatabaseStatus {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDatabaseStatus(): DatabaseStatus {
  return useSyncExternalStore(subscribe, getDatabaseStatus, getDatabaseStatus);
}

/**
 * How long to let `open()` run before saying so on screen.
 *
 * Generous on purpose. A cold phone doing a first sync is slow, and crying
 * wolf at five seconds would train the family to ignore the one message that
 * matters. Saying nothing at all, which is what the app did before, was the
 * worse end of the same trade.
 */
const STALL_AFTER_MS = 12_000;

/**
 * Starts the deadline on opening the database.
 *
 * Reaching it is not itself a failure - a slow open that later succeeds clears
 * the state and the notice disappears - so this only ever adds an explanation
 * where the app previously showed a spinner and left it there.
 */
export function startOpenWatchdog(timeoutMs: number = STALL_AFTER_MS): () => void {
  const timer = setTimeout(() => setDatabaseStatus({ state: 'STALLED' }), timeoutMs);
  return () => clearTimeout(timer);
}

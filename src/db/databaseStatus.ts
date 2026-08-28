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

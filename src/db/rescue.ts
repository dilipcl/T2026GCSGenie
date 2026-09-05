import { isInternalCloudTable } from '../services/backupService';

/**
 * Reads the family's data without going through Dexie.
 *
 * This exists for the one situation the rest of the app cannot report on: the
 * database never finishes opening. Every screen reads IndexedDB through Dexie,
 * and a read against a connection that never opened does not throw - it simply
 * never settles. The screens go blank, the buttons go dead, and nothing
 * anywhere can answer the only question that matters in that moment, which is
 * whether the data is still there.
 *
 * So this talks to IndexedDB directly. It opens without a version, which means
 * it never triggers an upgrade and never waits behind one; it takes its own
 * connection, so a stuck Dexie connection does not hold it up; and every call
 * has a deadline, because a rescue path that can itself hang is not a rescue
 * path.
 *
 * Nothing here writes. Recovering from a bad state is a decision for a person,
 * and the worst outcomes in this area come from software that tidied up on its
 * own initiative.
 */

/**
 * dexie-cloud renames the physical store to `GCSEGenieDB-<databaseId>`, so the
 * name in the Dexie constructor is not the name on disk. Both are matched by
 * prefix rather than guessed, and the newest match wins if a stray empty
 * database is sitting alongside the real one.
 */
const DATABASE_PREFIX = 'GCSEGenieDB';

/** Long enough for a busy phone, short enough to still be an answer. */
const RESCUE_TIMEOUT_MS = 8_000;

export interface RescueReading {
  databaseName: string;
  /** Stores that hold at least one row, by name. Empty stores are dropped. */
  counts: Record<string, number>;
  /** Rows across the family's own tables, ignoring sync bookkeeping. */
  rowsFound: number;
}

function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} did not respond within ${RESCUE_TIMEOUT_MS / 1000}s`)),
      RESCUE_TIMEOUT_MS
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * The database as it is actually named on disk.
 *
 * `indexedDB.databases()` is not in older Safari, so a miss falls back to the
 * plain name - which is correct for a device that has never signed in to the
 * cloud, and the only guess available on a browser that will not enumerate.
 */
async function findDatabaseName(): Promise<string> {
  if (typeof indexedDB.databases !== 'function') return DATABASE_PREFIX;

  const all = await indexedDB.databases();
  const matches = all
    .map((entry) => entry.name)
    .filter((name): name is string => !!name && name.startsWith(DATABASE_PREFIX));

  // A suffixed name is the cloud-renamed store and always beats the bare one,
  // which on a synced device is a leftover shell with nothing in it.
  return matches.sort((a, b) => b.length - a.length)[0] ?? DATABASE_PREFIX;
}

/**
 * Opens the database read-only, at whatever version it already is.
 *
 * Deliberately no version argument: naming one that is higher starts an upgrade
 * - which is precisely the thing that may already be stuck - and naming one
 * that is lower fails outright.
 */
function openRaw(name: string): Promise<IDBDatabase> {
  return withTimeout(
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open the database'));
      request.onblocked = () => reject(new Error('Another tab is holding the database open'));
    }),
    'The database'
  );
}

function countStore(database: IDBDatabase, store: string): Promise<number> {
  return new Promise<number>((resolve) => {
    try {
      const request = database.transaction(store, 'readonly').objectStore(store).count();
      request.onsuccess = () => resolve(request.result);
      // A store that will not count is reported as empty rather than failing the
      // whole reading; one unreadable table must not hide the other twenty.
      request.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

function readStore(database: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise<unknown[]>((resolve) => {
    try {
      const request = database.transaction(store, 'readonly').objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * How much data is on this device, counted straight from IndexedDB.
 *
 * This is the question behind "everything is empty" - whether the rows are gone
 * or merely unreachable - and it is worth answering on screen rather than in a
 * console the family will never open.
 */
export async function readRescueCounts(): Promise<RescueReading> {
  const databaseName = await findDatabaseName();
  const database = await openRaw(databaseName);

  try {
    const stores = [...database.objectStoreNames];
    const counted = await withTimeout(
      Promise.all(stores.map(async (store) => [store, await countStore(database, store)] as const)),
      'Counting the rows'
    );

    const counts: Record<string, number> = {};
    let rowsFound = 0;
    for (const [store, count] of counted) {
      if (count === 0) continue;
      counts[store] = count;
      if (!isInternalCloudTable(store)) rowsFound += count;
    }

    return { databaseName, counts, rowsFound };
  } finally {
    database.close();
  }
}

/**
 * Every row on this device, as a JSON bundle.
 *
 * The same two exclusions the ordinary backup applies, for the same reasons and
 * with more at stake: this file is written when something is already wrong, so
 * it is the copy most likely to be mailed around. `$logins` carries a live
 * refresh token, and the parent's API key is a credential that must not leave
 * the device.
 */
export async function exportRescueBundle(): Promise<string> {
  const databaseName = await findDatabaseName();
  const database = await openRaw(databaseName);

  try {
    const tables: Record<string, unknown[]> = {};
    for (const store of [...database.objectStoreNames]) {
      if (isInternalCloudTable(store)) continue;
      tables[store] = await readStore(database, store);
    }

    for (const row of tables.parentSettings ?? []) {
      if (row && typeof row === 'object') delete (row as Record<string, unknown>).llmApiKey;
    }

    return JSON.stringify(
      { format: 'gcse-genie-rescue/1', exportedAt: new Date().toISOString(), databaseName, tables },
      null,
      2
    );
  } finally {
    database.close();
  }
}

/**
 * Where the File System Access directory handle lives.
 *
 * Not in the Dexie row beside the rest of the Drive state, which is where it
 * started. A `FileSystemDirectoryHandle` is a live browser capability, not
 * data: it is specially cloneable into IndexedDB by browsers that implement the
 * API, and not cloneable at all by anything else, so putting it in a Dexie
 * table made two things true that should not be.
 *
 * First, `driveSync` became a table whose contents could not be serialised,
 * which is a hazard next to a sync engine even with the table marked unsynced.
 * Second, nothing that touched it could be tested - structured clone rejects
 * ordinary objects with methods, so a stand-in handle cannot be written to a
 * fake IndexedDB at all, and the failure surfaces as `DataCloneError` a long
 * way from the cause.
 *
 * So the handle gets its own raw object store, and `DriveSyncState` keeps only
 * facts about it: the folder's name, and whether one was ever granted. Outside
 * a browser this degrades to an in-memory map, which is what makes the backup
 * service testable in Node.
 */

const DB_NAME = 'gcse-genie-handles';
const STORE = 'handles';
const KEY = 'backupFolder';

/** Used in Node, and as the read-through cache in the browser. */
let memory: unknown = undefined;
let memoryHasValue = false;

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined' && typeof structuredClone === 'function';
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Reads the stored handle.
 *
 * Returns undefined rather than throwing when the store is unavailable - a
 * browser with no File System Access API also has no handle to find, and the
 * caller's next step is the same either way.
 */
export async function loadFolderHandle(): Promise<unknown | undefined> {
  if (memoryHasValue) return memory;
  if (!hasIndexedDB()) return undefined;

  try {
    const database = await openStore();
    return await new Promise((resolve) => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        memory = request.result;
        memoryHasValue = request.result !== undefined;
        resolve(request.result);
      };
      request.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

export async function saveFolderHandle(handle: unknown): Promise<void> {
  memory = handle;
  memoryHasValue = true;
  if (!hasIndexedDB()) return;

  try {
    const database = await openStore();
    await new Promise<void>((resolve) => {
      const request = database.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, KEY);
      request.onsuccess = () => resolve();
      // A browser that cannot clone the handle still has it in memory for this
      // session; losing it on reload is better than refusing to back up at all.
      request.onerror = () => resolve();
    });
  } catch {
    // Same reasoning: memory-only for this session.
  }
}

export async function clearFolderHandle(): Promise<void> {
  memory = undefined;
  memoryHasValue = false;
  if (!hasIndexedDB()) return;

  try {
    const database = await openStore();
    await new Promise<void>((resolve) => {
      const request = database.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Nothing to clear.
  }
}

/** Test seam: installs a handle without going near IndexedDB. */
export function __setFolderHandleInMemory(handle: unknown): void {
  memory = handle;
  memoryHasValue = handle !== undefined;
}

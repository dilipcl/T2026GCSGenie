import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import {
  backupFileName,
  backupIfDue,
  backupNow,
  capability,
  isBackupDue,
  readState,
  setAutoBackup,
  disconnectDrive,
  backupsToDelete,
  BACKUP_FILE_PATTERN,
  parseDriveFolderId,
  setUploadFolder,
  canWriteToFolder,
} from './driveBackupService';
import { __setFolderHandleInMemory } from './folderHandleStore';

/**
 * The behaviour under test is mostly about failure.
 *
 * A backup feature that works when everything is fine and goes quiet when it is
 * not is worse than no backup feature, because it converts "there are no
 * backups" into "I believe there are backups". Every path below that cannot
 * write asserts that the reason is recorded and readable.
 */

/** A stand-in for a File System Access directory handle. */
function fakeFolder(options: { permission?: PermissionState; writeFails?: boolean } = {}) {
  const written: { name: string; body: string }[] = [];
  const permission = options.permission ?? 'granted';

  const handle = {
    name: '_Genie-Backups',
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => permission),
    getFileHandle: vi.fn(async (name: string) => ({
      createWritable: async () => ({
        write: async (data: Blob | string) => {
          if (options.writeFails) throw new Error('Disk full');
          const body = typeof data === 'string' ? data : await (data as Blob).text();
          written.push({ name, body });
        },
        close: async () => undefined,
      }),
    })),
  };

  return { handle, written };
}

/** Installs the handle as if the user had picked the folder. */
async function grantFolder(handle: unknown, name = '_Genie-Backups') {
  __setFolderHandleInMemory(handle);
  await db.driveSync.put({
    id: 'active',
    folderName: name,
    autoEnabled: true,
    intervalHours: 24,
  });
}

beforeEach(async () => {
  await emptyDatabase();
  __setFolderHandleInMemory(undefined);
  // The service checks for the picker to decide whether the transport exists.
  (globalThis as unknown as { window: unknown }).window = {
    showDirectoryPicker: vi.fn(),
    location: { origin: 'https://example.test', pathname: '/' },
  };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('knowing what this device can actually do', () => {
  it('reports no transport, with a reason, before a folder is chosen', async () => {
    const caps = await capability();

    expect(caps.active).toBe('NONE');
    expect(caps.reason).toBe('No backup folder chosen yet on this device.');
  });

  it('reports the folder transport once a folder is granted', async () => {
    const { handle } = fakeFolder();
    await grantFolder(handle);

    const caps = await capability();
    expect(caps.active).toBe('FOLDER_HANDLE');
  });

  it('explains itself on a browser with no picker and no OAuth client', async () => {
    (globalThis as unknown as { window: unknown }).window = { location: {} };

    const caps = await capability();
    expect(caps.active).toBe('NONE');
    expect(caps.reason).toContain('cannot write to a folder');
  });
});

describe('writing a backup', () => {
  it('writes real JSON into the granted folder', async () => {
    const { handle, written } = fakeFolder();
    await grantFolder(handle);

    const outcome = await backupNow();

    expect(outcome.ok).toBe(true);
    expect(outcome.transport).toBe('FOLDER_HANDLE');
    expect(written).toHaveLength(1);
    expect(written[0].name).toMatch(/^GCSE_Genie_Backup_\d{4}-\d{2}-\d{2}-\d{4}\.json$/);

    // It has to be a restorable export, not a stub.
    const parsed = JSON.parse(written[0].body);
    expect(parsed.exportDateISO).toBeDefined();
    expect(parsed.subjects).toBeDefined();
  });

  it('records the successful backup so the UI can show when it last ran', async () => {
    const { handle } = fakeFolder();
    await grantFolder(handle);

    await backupNow();
    const state = await readState();

    expect(state.lastBackupAt).toBeGreaterThan(0);
    expect(state.lastBackupFileName).toMatch(/GCSE_Genie_Backup_/);
    expect(state.lastError).toBeUndefined();
  });

  it('names files so a folder of them sorts chronologically', () => {
    const early = backupFileName(new Date('2026-09-01T08:05:00'));
    const late = backupFileName(new Date('2026-09-01T19:30:00'));

    expect([late, early].sort()).toEqual([early, late]);
  });
});

describe('failing loudly', () => {
  it('records the reason when there is no transport at all', async () => {
    const outcome = await backupNow();

    expect(outcome.ok).toBe(false);
    const state = await readState();
    expect(state.lastError).toBe('No backup folder chosen yet on this device.');
    expect(state.lastErrorAt).toBeGreaterThan(0);
  });

  it('marks permission as lost rather than pretending it wrote', async () => {
    const { handle, written } = fakeFolder({ permission: 'prompt' });
    await grantFolder(handle);

    const outcome = await backupNow();

    expect(outcome.ok).toBe(false);
    expect(written).toHaveLength(0);
    expect((await readState()).folderPermissionLost).toBe(true);
    expect(outcome.error).toContain('lapsed');
  });

  it('surfaces a write failure instead of swallowing it', async () => {
    const { handle } = fakeFolder({ writeFails: true });
    await grantFolder(handle);

    const outcome = await backupNow();

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('Disk full');
    expect((await readState()).lastError).toContain('Disk full');
  });

  it('does not throw into the caller', async () => {
    const { handle } = fakeFolder({ writeFails: true });
    await grantFolder(handle);

    await expect(backupNow()).resolves.toBeDefined();
  });
});

describe('deciding when to run', () => {
  it('is due immediately when nothing has ever been backed up', async () => {
    await setAutoBackup(true, 24);
    expect(await isBackupDue()).toBe(true);
  });

  it('is not due again inside the interval', async () => {
    const { handle } = fakeFolder();
    await grantFolder(handle);
    await backupNow();

    expect(await isBackupDue()).toBe(false);
  });

  it('is due again once the interval has passed', async () => {
    const { handle } = fakeFolder();
    await grantFolder(handle);
    await backupNow();

    const inTwoDays = Date.now() + 48 * 3_600_000;
    expect(await isBackupDue(inTwoDays)).toBe(true);
  });

  it('never runs when auto-backup is switched off', async () => {
    const { handle } = fakeFolder();
    await grantFolder(handle);
    await setAutoBackup(false);

    expect(await isBackupDue()).toBe(false);
    expect(await backupIfDue()).toBeUndefined();
  });

  it('backs up on open when one is due', async () => {
    const { handle, written } = fakeFolder();
    await grantFolder(handle);

    const outcome = await backupIfDue();

    expect(outcome?.ok).toBe(true);
    expect(written).toHaveLength(1);
  });

  it('stays quiet on open when there is no transport, rather than logging noise', async () => {
    await setAutoBackup(true);
    expect(await backupIfDue()).toBeUndefined();
  });
});

describe('disconnecting', () => {
  it('forgets the folder and stops automatic backups', async () => {
    const { handle } = fakeFolder();
    await grantFolder(handle);

    await disconnectDrive();
    const caps = await capability();

    expect(caps.active).toBe('NONE');
    expect((await readState()).autoEnabled).toBe(false);
  });
});

describe('choosing which backups to delete', () => {
  const name = (stamp: string) => `GCSE_Genie_Backup_${stamp}.json`;

  it('keeps the newest N and returns the rest', () => {
    const files = [
      name('2026-09-01-0800'),
      name('2026-09-02-0800'),
      name('2026-09-03-0800'),
      name('2026-09-04-0800'),
    ];

    expect(backupsToDelete(files, 2)).toEqual([
      name('2026-09-02-0800'),
      name('2026-09-01-0800'),
    ]);
  });

  it('deletes nothing when there are fewer than the limit', () => {
    expect(backupsToDelete([name('2026-09-01-0800')], 30)).toEqual([]);
  });

  it('orders by name, which is chronological by construction', () => {
    const files = [name('2026-09-01-1930'), name('2026-09-01-0805')];
    // Same day, different times: the morning one is the older.
    expect(backupsToDelete(files, 1)).toEqual([name('2026-09-01-0805')]);
  });

  it('never touches a file it did not write', () => {
    const files = [
      'notes.json',
      'important-family-document.json',
      'GCSE_Genie_Backup_notes.json',
      'GCSE_Genie_RESCUE_before_handover_2026-08-28.json',
      'Genie-Updates-2026-08-28-2157.md',
      name('2026-09-01-0800'),
      name('2026-09-02-0800'),
    ];

    // Only the two real backups are candidates, and only the older is doomed.
    expect(backupsToDelete(files, 1)).toEqual([name('2026-09-01-0800')]);
  });

  it('keeps everything when retention is zero', () => {
    const files = [name('2026-09-01-0800'), name('2026-09-02-0800')];
    expect(backupsToDelete(files, 0)).toEqual([]);
  });

  it('matches only the exact filename shape', () => {
    expect(BACKUP_FILE_PATTERN.test(name('2026-09-01-0800'))).toBe(true);
    expect(BACKUP_FILE_PATTERN.test('gcse_genie_backup_2026-09-01-0800.json')).toBe(false);
    expect(BACKUP_FILE_PATTERN.test(`copy of ${name('2026-09-01-0800')}`)).toBe(false);
    expect(BACKUP_FILE_PATTERN.test(name('2026-09-01-0800') + '.bak')).toBe(false);
  });
});

describe('pruning against the folder', () => {
  /** A folder that already holds `existing` files. */
  function folderWith(existing: string[]) {
    const files = [...existing];
    const removed: string[] = [];

    const handle = {
      name: '_Genie-Backups',
      queryPermission: vi.fn(async () => 'granted' as PermissionState),
      requestPermission: vi.fn(async () => 'granted' as PermissionState),
      getFileHandle: vi.fn(async (fileName: string) => {
        if (!files.includes(fileName)) files.push(fileName);
        return {
          createWritable: async () => ({
            write: async () => undefined,
            close: async () => undefined,
          }),
        };
      }),
      values: async function* () {
        for (const f of files) yield { kind: 'file' as const, name: f };
        yield { kind: 'directory' as const, name: 'Attachments' };
      },
      removeEntry: vi.fn(async (fileName: string) => {
        removed.push(fileName);
        const i = files.indexOf(fileName);
        if (i >= 0) files.splice(i, 1);
      }),
    };

    return { handle, files, removed };
  }

  it('removes the oldest once past the limit', async () => {
    const old = Array.from({ length: 32 }, (_, i) =>
      `GCSE_Genie_Backup_2026-08-${String(i + 1).padStart(2, '0')}-0800.json`
    );
    const { handle, removed } = folderWith(old);
    __setFolderHandleInMemory(handle);
    await db.driveSync.put({
      id: 'active',
      folderName: '_Genie-Backups',
      autoEnabled: true,
      keepBackups: 30,
    });

    const outcome = await backupNow();

    // 32 existing + the one just written = 33; keep 30, so 3 go.
    expect(outcome.ok).toBe(true);
    expect(outcome.pruned).toBe(3);
    expect(removed).toContain('GCSE_Genie_Backup_2026-08-01-0800.json');
  });

  it('never deletes the backup it just wrote, even beside future-dated files', async () => {
    // Another device with a fast clock has written backups dated ahead of today.
    // Sorted by name they outrank the one about to be written.
    const old = Array.from({ length: 40 }, (_, i) =>
      `GCSE_Genie_Backup_2027-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}-0800.json`
    );
    const { handle, removed } = folderWith(old);
    __setFolderHandleInMemory(handle);
    await db.driveSync.put({
      id: 'active',
      folderName: '_Genie-Backups',
      autoEnabled: true,
      keepBackups: 5,
    });

    const outcome = await backupNow();
    expect(removed).not.toContain(outcome.fileName);
  });

  it('leaves the Attachments folder alone', async () => {
    const { handle, removed } = folderWith(
      Array.from({ length: 35 }, (_, i) =>
        `GCSE_Genie_Backup_2026-08-${String(i + 1).padStart(2, '0')}-0800.json`
      )
    );
    __setFolderHandleInMemory(handle);
    await db.driveSync.put({
      id: 'active',
      folderName: '_Genie-Backups',
      autoEnabled: true,
      keepBackups: 30,
    });

    await backupNow();
    expect(removed).not.toContain('Attachments');
  });

  it('does not prune when the backup itself failed', async () => {
    const { handle, written } = fakeFolder({ writeFails: true });
    __setFolderHandleInMemory(handle);
    await db.driveSync.put({
      id: 'active',
      folderName: '_Genie-Backups',
      autoEnabled: true,
      keepBackups: 1,
    });

    const outcome = await backupNow();

    expect(outcome.ok).toBe(false);
    expect(outcome.pruned).toBeUndefined();
    expect(written).toHaveLength(0);
  });

  it('survives a file that refuses to be deleted', async () => {
    const { handle } = folderWith(
      Array.from({ length: 35 }, (_, i) =>
        `GCSE_Genie_Backup_2026-08-${String(i + 1).padStart(2, '0')}-0800.json`
      )
    );
    handle.removeEntry = vi.fn(async () => {
      throw new Error('File is open in another program');
    });
    __setFolderHandleInMemory(handle);
    await db.driveSync.put({
      id: 'active',
      folderName: '_Genie-Backups',
      autoEnabled: true,
      keepBackups: 30,
    });

    const outcome = await backupNow();

    // The backup still succeeded; only the tidy-up failed.
    expect(outcome.ok).toBe(true);
    expect(outcome.pruned).toBe(0);
  });
});

describe('nominating a Drive folder', () => {
  it('accepts a share URL or a bare id', () => {
    const id = '1oX9XHXHkNEZVQ6y97Ym1ZYdsD9bMNynt';
    expect(
      parseDriveFolderId(`https://drive.google.com/drive/folders/${id}?usp=drive_link`)
    ).toBe(id);
    expect(parseDriveFolderId(id)).toBe(id);
  });

  it('rejects something that is not a folder reference', () => {
    expect(parseDriveFolderId('')).toBeUndefined();
    expect(parseDriveFolderId('my backups')).toBeUndefined();
    expect(parseDriveFolderId('https://example.com/nope')).toBeUndefined();
  });

  it('stores the id from a pasted link', async () => {
    await setUploadFolder(
      'https://drive.google.com/drive/folders/1oX9XHXHkNEZVQ6y97Ym1ZYdsD9bMNynt?usp=drive_link'
    );
    expect((await readState()).preferredFolderId).toBe('1oX9XHXHkNEZVQ6y97Ym1ZYdsD9bMNynt');
  });

  it('treats a folder the app cannot see as unreachable', async () => {
    // What drive.file actually does with a hand-made folder: 404, not 403.
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await canWriteToFolder('someFolderId', 'token')).toBe(false);

    vi.unstubAllGlobals();
  });

  it('accepts a folder the app created', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'f1', capabilities: { canAddChildren: true } }),
      }))
    );

    expect(await canWriteToFolder('f1', 'token')).toBe(true);

    vi.unstubAllGlobals();
  });

  it('treats a read-only folder as unwritable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'f1', capabilities: { canAddChildren: false } }),
      }))
    );

    expect(await canWriteToFolder('f1', 'token')).toBe(false);

    vi.unstubAllGlobals();
  });
});

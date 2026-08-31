import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { __setFolderHandleInMemory } from './folderHandleStore';
import {
  mirrorFileName,
  mirrorPendingAttachments,
  mirrorStatus,
  pendingMirror,
} from './attachmentMirrorService';

/**
 * The bug being fixed is silent data loss: `exportDatabaseToJSON` cannot carry a
 * blob, so every backup has set `attachmentsOmitted` and every restore has
 * dropped the proof log's photos without saying so.
 *
 * The subtlety these tests exist to hold: saving a file and being able to link
 * to it are different things. The desktop folder does the first and not the
 * second, and a UI that conflates them promises links it cannot render.
 */

function fakeFolder(options: { writeFails?: boolean } = {}) {
  const written: { folder: string; name: string; bytes: number }[] = [];

  const fileHandle = (folder: string, name: string) => ({
    createWritable: async () => ({
      write: async (data: Blob) => {
        if (options.writeFails) throw new Error('Disk full');
        written.push({ folder, name, bytes: data.size });
      },
      close: async () => undefined,
    }),
  });

  const handle = {
    name: '_Genie-Backups',
    queryPermission: vi.fn(async () => 'granted' as PermissionState),
    requestPermission: vi.fn(async () => 'granted' as PermissionState),
    getFileHandle: vi.fn(async (name: string) => fileHandle('_Genie-Backups', name)),
    getDirectoryHandle: vi.fn(async (folder: string) => ({
      getFileHandle: async (name: string) => fileHandle(folder, name),
      queryPermission: async () => 'granted' as PermissionState,
      getDirectoryHandle: async () => {
        throw new Error('not nested');
      },
    })),
  };

  return { handle, written };
}

async function addPhoto(id: string, fileName = 'marked-paper.jpg') {
  await db.attachments.add({
    id,
    ownerType: 'ASSESSMENT',
    ownerId: 'assessment_1',
    fileName,
    mimeType: 'image/jpeg',
    byteSize: 12,
    blob: new Blob(['fake-jpeg-xy'], { type: 'image/jpeg' }),
    createdAt: Date.now(),
  });
}

beforeEach(async () => {
  await emptyDatabase();
  __setFolderHandleInMemory(undefined);
  (globalThis as unknown as { window: unknown }).window = {
    showDirectoryPicker: vi.fn(),
    location: { origin: 'https://example.test', pathname: '/' },
  };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('naming the mirrored file', () => {
  it('includes the id so two photos of the same worksheet cannot collide', async () => {
    await addPhoto('att_1');
    await addPhoto('att_2');
    const [a, b] = await db.attachments.toArray();

    expect(mirrorFileName(a)).not.toBe(mirrorFileName(b));
    expect(mirrorFileName(a)).toContain('marked-paper.jpg');
  });

  it('strips characters a filesystem would reject', async () => {
    await addPhoto('att_3', 'paper: 20/25 *final*.jpg');
    const [a] = await db.attachments.toArray();

    expect(mirrorFileName(a)).not.toMatch(/[:*/]/);
  });
});

describe('mirroring through the desktop folder', () => {
  it('writes the blob into an Attachments subfolder', async () => {
    const { handle, written } = fakeFolder();
    __setFolderHandleInMemory(handle);
    await db.driveSync.put({ id: 'active', folderName: '_Genie-Backups', autoEnabled: true });
    await addPhoto('att_1');

    const outcome = await mirrorPendingAttachments();

    expect(outcome.mirrored).toBe(1);
    expect(written).toHaveLength(1);
    expect(written[0].folder).toBe('Attachments');
    expect(written[0].bytes).toBe(12);
  });

  it('never claims a link it cannot produce', async () => {
    const { handle } = fakeFolder();
    __setFolderHandleInMemory(handle);
    await db.driveSync.put({ id: 'active', folderName: '_Genie-Backups', autoEnabled: true });
    await addPhoto('att_1');

    const outcome = await mirrorPendingAttachments();
    const stored = await db.attachments.get('att_1');

    // Saved from a restore, but there is no URL to open.
    expect(outcome.linksUnavailable).toBe(true);
    expect(stored?.driveMirroredAt).toBeGreaterThan(0);
    expect(stored?.driveViewUrl).toBeUndefined();
    expect(stored?.driveFileId).toBeUndefined();
  });

  it('does not mirror the same file twice', async () => {
    const { handle, written } = fakeFolder();
    __setFolderHandleInMemory(handle);
    await db.driveSync.put({ id: 'active', folderName: '_Genie-Backups', autoEnabled: true });
    await addPhoto('att_1');

    await mirrorPendingAttachments();
    await mirrorPendingAttachments();

    expect(written).toHaveLength(1);
  });

  it('records a failure on the row instead of retrying it invisibly', async () => {
    const { handle } = fakeFolder({ writeFails: true });
    __setFolderHandleInMemory(handle);
    await db.driveSync.put({ id: 'active', folderName: '_Genie-Backups', autoEnabled: true });
    await addPhoto('att_1');

    const outcome = await mirrorPendingAttachments();
    const stored = await db.attachments.get('att_1');

    expect(outcome.failed).toBe(1);
    expect(outcome.mirrored).toBe(0);
    expect(stored?.mirrorError).toContain('Disk full');
    expect(stored?.driveMirroredAt).toBeUndefined();
  });

  it('one bad file does not stop the others', async () => {
    let calls = 0;
    const handle = {
      name: '_Genie-Backups',
      queryPermission: async () => 'granted' as PermissionState,
      requestPermission: async () => 'granted' as PermissionState,
      getFileHandle: async () => {
        throw new Error('unused');
      },
      getDirectoryHandle: async () => ({
        queryPermission: async () => 'granted' as PermissionState,
        getDirectoryHandle: async () => {
          throw new Error('not nested');
        },
        getFileHandle: async () => ({
          createWritable: async () => ({
            write: async () => {
              calls += 1;
              if (calls === 1) throw new Error('Corrupt blob');
            },
            close: async () => undefined,
          }),
        }),
      }),
    };

    __setFolderHandleInMemory(handle);
    await db.driveSync.put({ id: 'active', folderName: '_Genie-Backups', autoEnabled: true });
    await addPhoto('att_1');
    await addPhoto('att_2');

    const outcome = await mirrorPendingAttachments();

    expect(outcome.attempted).toBe(2);
    expect(outcome.failed).toBe(1);
    expect(outcome.mirrored).toBe(1);
  });
});

describe('with no transport at all', () => {
  it('does nothing rather than failing loudly on every open', async () => {
    await addPhoto('att_1');

    const outcome = await mirrorPendingAttachments();

    expect(outcome.attempted).toBe(0);
    expect((await db.attachments.get('att_1'))?.mirrorError).toBeUndefined();
  });
});

describe('reporting how much of the proof log survives a restore', () => {
  it('counts mirrored and linkable separately', async () => {
    await addPhoto('att_local');
    await addPhoto('att_folder');
    await addPhoto('att_drive');

    await db.attachments.update('att_folder', { driveMirroredAt: Date.now() });
    await db.attachments.update('att_drive', {
      driveMirroredAt: Date.now(),
      driveFileId: 'drive-abc',
      driveViewUrl: 'https://drive.google.com/file/d/drive-abc/view',
    });

    const status = await mirrorStatus();

    expect(status.total).toBe(3);
    expect(status.mirrored).toBe(2);
    // Only the Drive API upload produced something openable.
    expect(status.linkable).toBe(1);
  });

  it('queues only the files that have never been mirrored', async () => {
    await addPhoto('att_1');
    await addPhoto('att_2');
    await db.attachments.update('att_1', { driveMirroredAt: Date.now() });

    const queue = await pendingMirror();
    expect(queue.map((a) => a.id)).toEqual(['att_2']);
  });
});

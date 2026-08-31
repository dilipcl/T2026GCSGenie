import { db } from '../db';
import { ProofAttachment } from '../types';
import { capability, freshAccessToken, readState } from './driveBackupService';
import { loadFolderHandle } from './folderHandleStore';

/**
 * Getting proof photos out of IndexedDB and into Drive.
 *
 * The problem this fixes is a real data-loss path, not a convenience. Proof
 * attachments are stored as blobs inside the database; `exportDatabaseToJSON`
 * cannot serialise a blob, so every backup ever taken has carried
 * `attachmentsOmitted: true`. Restore from one and the record survives while
 * every photo attached to it is gone - and nothing in the app said so.
 *
 * The two transports are NOT equivalent here, and the difference matters enough
 * that callers have to handle it:
 *
 *  - **Folder handle** writes the file into `_Genie-Backups/Attachments/`.
 *    Drive for Desktop uploads it, so the file is safe. But the app never sees
 *    the id Drive assigns, so there is no URL it can honestly link to. This
 *    fixes the data loss and does not produce a hyperlink.
 *
 *  - **Drive API** returns both an id and a `webViewLink`, so this is the only
 *    path that makes the activity feed's attachment links real.
 *
 * Anything that renders an attachment must therefore distinguish "mirrored" from
 * "linkable". Showing a link that does not exist would be the same class of lie
 * as a button labelled "save to Drive" that quietly downloaded to Downloads.
 */

const ATTACHMENTS_SUBFOLDER = 'Attachments';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

type DirectoryHandle = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
};

/**
 * A filename that is unique, sorts sensibly and survives a filesystem.
 *
 * The attachment id is included because two photos of the same worksheet
 * genuinely can share a name, and silently overwriting one with the other would
 * be a second data-loss bug inside the fix for the first.
 */
export function mirrorFileName(attachment: ProofAttachment): string {
  const safe = attachment.fileName.replace(/[^\w.\- ]+/g, '_').slice(0, 80);
  return `${attachment.id}-${safe}`;
}

async function mirrorViaFolder(attachment: ProofAttachment): Promise<Partial<ProofAttachment>> {
  const root = (await loadFolderHandle()) as DirectoryHandle | undefined;
  if (!root) throw new Error('No backup folder has been chosen on this device.');

  if ((await root.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    throw new Error('Permission for the backup folder has lapsed.');
  }

  const folder = await root.getDirectoryHandle(ATTACHMENTS_SUBFOLDER, { create: true });
  const name = mirrorFileName(attachment);
  const fileHandle = await folder.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(attachment.blob);
  await writable.close();

  // No driveViewUrl: this transport cannot know the id Drive will assign.
  return { driveMirroredAt: Date.now(), mirrorFileName: name, mirrorError: undefined };
}

async function mirrorViaOAuth(
  attachment: ProofAttachment,
  accessToken: string,
  parentFolderId?: string
): Promise<Partial<ProofAttachment>> {
  const metadata: Record<string, unknown> = {
    name: mirrorFileName(attachment),
    mimeType: attachment.mimeType,
  };
  if (parentFolderId) metadata.parents = [parentFolderId];

  const boundary = `genie-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();

  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${attachment.mimeType}\r\n\r\n`
  );
  const tail = encoder.encode(`\r\n--${boundary}--`);
  const body = new Blob([head, attachment.blob, tail]);

  const response = await fetch(
    `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!response.ok) throw new Error(`Drive rejected the upload (${response.status}).`);

  const created = (await response.json()) as { id: string; webViewLink?: string };
  return {
    driveMirroredAt: Date.now(),
    mirrorFileName: mirrorFileName(attachment),
    driveFileId: created.id,
    driveViewUrl: created.webViewLink,
    mirrorError: undefined,
  };
}

export interface MirrorOutcome {
  attempted: number;
  mirrored: number;
  failed: number;
  /** True when the transport used cannot produce URLs, so links stay unavailable. */
  linksUnavailable: boolean;
  errors: string[];
}

/** Attachments that have never been mirrored, or whose last attempt failed. */
export async function pendingMirror(): Promise<ProofAttachment[]> {
  const all = await db.attachments.toArray();
  return all.filter((a) => !a.driveMirroredAt);
}

/**
 * Mirrors everything outstanding.
 *
 * Never throws. One unreadable file must not stop the other nine from being
 * saved, and a failure is recorded on the row so it is visible rather than
 * retried invisibly on every app open.
 */
export async function mirrorPendingAttachments(limit = 25): Promise<MirrorOutcome> {
  const caps = await capability();
  const outcome: MirrorOutcome = {
    attempted: 0,
    mirrored: 0,
    failed: 0,
    linksUnavailable: caps.active === 'FOLDER_HANDLE',
    errors: [],
  };

  if (caps.active === 'NONE') return outcome;

  const queue = (await pendingMirror()).slice(0, limit);
  if (queue.length === 0) return outcome;

  let accessToken: string | undefined;
  let parentFolderId: string | undefined;
  if (caps.active === 'OAUTH') {
    const state = await readState();
    parentFolderId = state.oauthFolderId;
    /**
     * Asked for through `freshAccessToken` rather than read from the row. GIS
     * tokens last about an hour and there is no refresh token, so a stored one
     * is as likely to be stale as valid - using it directly would 401 on every
     * photo instead of quietly renewing once.
     */
    try {
      accessToken = await freshAccessToken();
    } catch (err) {
      outcome.errors.push(err instanceof Error ? err.message : String(err));
      return outcome;
    }
  }

  for (const attachment of queue) {
    outcome.attempted += 1;
    try {
      const patch =
        caps.active === 'FOLDER_HANDLE'
          ? await mirrorViaFolder(attachment)
          : await mirrorViaOAuth(attachment, accessToken!, parentFolderId);

      await db.attachments.update(attachment.id, patch);
      outcome.mirrored += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.attachments.update(attachment.id, { mirrorError: message });
      outcome.failed += 1;
      if (!outcome.errors.includes(message)) outcome.errors.push(message);
    }
  }

  return outcome;
}

export interface MirrorStatus {
  total: number;
  mirrored: number;
  linkable: number;
  failed: number;
}

/**
 * How much of the proof log currently survives a restore.
 *
 * `linkable` is reported separately from `mirrored` on purpose: a file written
 * through the folder handle is safe but has no URL, and conflating the two is
 * how a UI ends up promising links it cannot render.
 */
export async function mirrorStatus(): Promise<MirrorStatus> {
  const all = await db.attachments.toArray();
  return {
    total: all.length,
    mirrored: all.filter((a) => !!a.driveMirroredAt).length,
    linkable: all.filter((a) => !!a.driveViewUrl).length,
    failed: all.filter((a) => !!a.mirrorError && !a.driveMirroredAt).length,
  };
}

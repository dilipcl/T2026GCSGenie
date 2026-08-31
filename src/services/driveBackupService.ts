import { db } from '../db';
import { DriveSyncState } from '../types';
import { exportDatabaseToJSON } from './backupService';
import {
  clearFolderHandle,
  loadFolderHandle,
  saveFolderHandle,
} from './folderHandleStore';

/**
 * Getting a backup into Google Drive without anybody remembering to do it.
 *
 * The honest starting point, which the rest of this file exists to work around:
 * this app is a static page on GitHub Pages. It holds no Drive credentials and
 * runs no server, so "save to Drive" has always meant a download the user then
 * files by hand. On 31 August 2026 that had produced exactly zero backups in
 * `_Genie-Backups` since the folder was created a week earlier - not because
 * anyone was careless, but because a manual step at the end of a session is a
 * step that does not happen.
 *
 * Two transports, because neither one covers the whole family:
 *
 *  - **Folder handle** (File System Access). The user picks `_Genie-Backups`
 *    once; the browser hands back a directory handle that survives restarts,
 *    and the app writes files straight into it. Drive for Desktop uploads them
 *    within seconds. No Google account, no token, no request leaves the machine
 *    - the offline-first promise survives untouched. Chromium desktop only.
 *
 *  - **OAuth upload** (Drive API). Works on a phone, which the handle never
 *    will. Costs a real Google credential held on the device and a network
 *    round trip, so it is opt-in and clearly labelled as such.
 *
 * A device uses whichever it has. Both failing is a state the UI must show,
 * because a backup system that quietly stops is worse than none: it converts an
 * absence of backups into a false belief that there are some.
 */

const STATE_ID = 'active';

/** Uploads use the `drive.file` scope only - files this app itself created. */
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/**
 * The OAuth client id for this installation.
 *
 * Empty until somebody creates a Google Cloud project and pastes one in - the
 * app cannot create one on the family's behalf. While it is empty the mobile
 * transport reports itself unavailable rather than half-working, and the
 * desktop transport is unaffected.
 *
 * `drive.file` is the narrowest scope that permits an upload: it grants access
 * only to files this app itself created, never to the rest of the user's Drive.
 */
export const DRIVE_OAUTH_CLIENT_ID: string =
  (import.meta.env?.VITE_DRIVE_OAUTH_CLIENT_ID as string | undefined) ?? '';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export type TransportKind = 'FOLDER_HANDLE' | 'OAUTH' | 'NONE';

export interface DriveCapability {
  folderHandleSupported: boolean;
  oauthConfigured: boolean;
  /** What this device would actually use right now. */
  active: TransportKind;
  /** Why nothing is available, in words, when `active` is NONE. */
  reason?: string;
}

export async function readState(): Promise<DriveSyncState> {
  const existing = await db.driveSync.get(STATE_ID);
  if (existing) return existing;
  const fresh: DriveSyncState = {
    id: STATE_ID,
    autoEnabled: false,
    intervalHours: 24,
    keepBackups: DEFAULT_KEEP_BACKUPS,
  };
  await db.driveSync.put(fresh);
  return fresh;
}

async function writeState(patch: Partial<DriveSyncState>): Promise<DriveSyncState> {
  const current = await readState();
  const next = { ...current, ...patch, id: STATE_ID } as DriveSyncState;
  await db.driveSync.put(next);
  return next;
}

function supportsFolderHandle(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * What this device can actually do, checked rather than assumed.
 *
 * Called before every attempt and before rendering any promise to the user. The
 * folder handle can be revoked between sessions - the browser drops permission
 * when site data is cleared, and Chrome may prompt again after long disuse - so
 * "we had a handle last week" is not evidence we have one now.
 */
export async function capability(): Promise<DriveCapability> {
  const state = await readState();
  const folderHandleSupported = supportsFolderHandle();
  const oauthConfigured = DRIVE_OAUTH_CLIENT_ID.length > 0;

  const handle = await loadFolderHandle();
  const hasUsableHandle = folderHandleSupported && !!handle && !state.folderPermissionLost;
  const hasUsableToken = oauthConfigured && !!state.oauthToken;

  let active: TransportKind = 'NONE';
  if (hasUsableHandle) active = 'FOLDER_HANDLE';
  else if (hasUsableToken) active = 'OAUTH';

  let reason: string | undefined;
  if (active === 'NONE') {
    if (folderHandleSupported && !handle) {
      reason = 'No backup folder chosen yet on this device.';
    } else if (state.folderPermissionLost) {
      reason = 'This browser has withdrawn permission for the backup folder. Choose it again.';
    } else if (!folderHandleSupported && !oauthConfigured) {
      reason =
        'This browser cannot write to a folder, and Google sign-in has not been set up for this app yet.';
    } else if (!folderHandleSupported) {
      reason = 'This browser cannot write to a folder. Connect Google Drive instead.';
    }
  }

  return { folderHandleSupported, oauthConfigured, active, reason };
}

// ---------------------------------------------------------------------------
// Transport 1: a folder handle on the desktop
// ---------------------------------------------------------------------------

type DirectoryHandle = {
  name: string;
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>;
  }>;
  /** Async-iterable list of everything in the folder. Used only for pruning. */
  values?(): AsyncIterable<{ kind: 'file' | 'directory'; name: string }>;
  removeEntry?(name: string): Promise<void>;
};

/**
 * Asks the user to pick the backup folder.
 *
 * Must be called from a user gesture - the picker will not open otherwise, and
 * the failure is a silent rejected promise rather than an error anyone can see.
 */
export async function chooseBackupFolder(): Promise<DriveSyncState> {
  if (!supportsFolderHandle()) {
    throw new Error('This browser cannot pick a folder. Use Google sign-in instead.');
  }

  const picker = (window as unknown as {
    showDirectoryPicker(options?: { mode?: string; startIn?: string }): Promise<DirectoryHandle>;
  }).showDirectoryPicker;

  const handle = await picker({ mode: 'readwrite' });
  await saveFolderHandle(handle);

  return writeState({
    folderName: handle.name,
    folderPermissionLost: false,
    autoEnabled: true,
    lastError: undefined,
    lastErrorAt: undefined,
  });
}

/**
 * Confirms the stored handle still works.
 *
 * A handle persists in IndexedDB but the *permission* attached to it does not
 * always survive - so this asks the browser, and records the answer so the UI
 * can stop claiming backups are running when they are not.
 */
async function ensureFolderPermission(handle: DirectoryHandle): Promise<boolean> {
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    // Re-prompting only succeeds inside a user gesture; outside one it resolves
    // to 'prompt' and we treat that as lost rather than hanging.
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

async function writeViaFolderHandle(fileName: string, contents: string): Promise<void> {
  const handle = (await loadFolderHandle()) as DirectoryHandle | undefined;
  if (!handle) throw new Error('No backup folder has been chosen on this device.');

  if (!(await ensureFolderPermission(handle))) {
    await writeState({ folderPermissionLost: true });
    throw new Error('Permission for the backup folder has lapsed. Choose the folder again.');
  }

  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(new Blob([contents], { type: 'application/json' }));
  await writable.close();
}

// ---------------------------------------------------------------------------
// Transport 2: the Drive API, for phones
// ---------------------------------------------------------------------------

/**
 * Google Identity Services, not an authorization-code flow.
 *
 * The first version of this used authorization code + PKCE with no client
 * secret, which is the standard answer for a public client and the wrong answer
 * for Google. Google's token endpoint requires `client_secret` for a "Web
 * application" client, and the client types that permit PKCE without one -
 * iOS, Android, Desktop - cannot legitimately be driven from a web page. That
 * code would have failed at the token exchange every time, after the user had
 * already granted consent, which is the most expensive place to fail.
 *
 * GIS issues an access token straight to the browser instead. The trade-off is
 * real and worth stating plainly: there is NO refresh token. A token lasts about
 * an hour. Where the user still has a live Google session and has already
 * consented, an empty prompt gets a new one silently; otherwise they have to tap
 * Connect again. So on mobile, "automatic backup" means automatic while a token
 * can be obtained, not unattended forever.
 *
 * Note also that GIS uses Authorized JavaScript origins, not redirect URIs.
 * Configuring redirect URIs for this client does nothing.
 */

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        prompt?: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string; message?: string }) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

let gisPromise: Promise<GoogleIdentityServices> | undefined;

/** Loads the GIS script once, and only when the OAuth transport is actually used. */
function loadGis(): Promise<GoogleIdentityServices> {
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const existing = (window as unknown as { google?: GoogleIdentityServices }).google;
    if (existing?.accounts?.oauth2) return resolve(existing);

    const script = document.createElement('script');
    script.src = GIS_SCRIPT;
    script.async = true;
    script.onload = () => {
      const google = (window as unknown as { google?: GoogleIdentityServices }).google;
      if (google?.accounts?.oauth2) resolve(google);
      else reject(new Error('Google sign-in loaded but did not initialise.'));
    };
    script.onerror = () =>
      reject(new Error('Could not reach Google sign-in. Check the network connection.'));
    document.head.appendChild(script);
  });

  return gisPromise;
}

/**
 * Asks Google for an access token.
 *
 * A non-interactive call attempts a silent re-issue for someone who has already
 * consented and still has a Google session - the path that makes a backup on
 * open possible at all. It fails fast rather than trying to show a popup, since
 * a popup nobody asked for is blocked by the browser anyway.
 */
async function requestToken(interactive: boolean): Promise<string> {
  if (!DRIVE_OAUTH_CLIENT_ID) {
    throw new Error(
      'Google sign-in has not been configured for this app. A Drive OAuth client id is needed first.'
    );
  }

  const google = await loadGis();

  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_OAUTH_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Google declined.'));
          return;
        }
        void writeState({
          oauthToken: response.access_token,
          oauthExpiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        });
        resolve(response.access_token);
      },
      error_callback: (error) =>
        reject(new Error(error.message || 'Google sign-in was dismissed.')),
    });

    // An empty prompt asks for a silent token; 'consent' forces the chooser.
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

/**
 * Connects this device to Drive. Must be called from a user gesture - the GIS
 * popup is blocked otherwise.
 */
export async function connectDrive(): Promise<DriveSyncState> {
  const token = await requestToken(true);
  return writeState({
    oauthToken: token,
    autoEnabled: true,
    lastError: undefined,
    lastErrorAt: undefined,
  });
}

/**
 * A token that is valid now.
 *
 * There is no refresh token to fall back on, so an expired token means asking
 * Google again. The silent attempt succeeds for a signed-in user who has already
 * consented; when it does not, the error says what the person has to do rather
 * than failing anonymously.
 */
export async function freshAccessToken(): Promise<string> {
  const state = await readState();

  if (state.oauthToken && (state.oauthExpiresAt ?? 0) > Date.now() + 60_000) {
    return state.oauthToken;
  }

  try {
    return await requestToken(false);
  } catch {
    throw new Error(
      'Google Drive access has expired. Open the Parent Portal and tap Connect Google Drive again.'
    );
  }
}

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

/**
 * Finds or creates the folder backups go into.
 *
 * Without it, uploads land loose in the root of My Drive. The `drive.file` scope
 * only ever sees files this app itself created, so the folder has to be created
 * here - it cannot be pointed at the existing `_Genie-Backups`, which Genie did
 * not create and therefore cannot see.
 */
export function parseDriveFolderId(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  // Accept a full share URL or a bare id.
  const fromUrl = trimmed.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(trimmed) ? trimmed : undefined;
}

/**
 * Whether the app can actually write into a folder somebody nominated.
 *
 * The `drive.file` scope grants access only to files this app created or the
 * user explicitly opened through Google's own picker. A folder made by hand in
 * Drive is therefore invisible to Genie however correct its id is, and the API
 * answers 404 rather than 403 - it is not "forbidden", it does not exist as far
 * as this app is concerned.
 *
 * Checked before every upload rather than assumed, so a nominated folder that
 * cannot be used degrades to the app's own folder with an explanation, instead
 * of failing every backup with a confusing not-found.
 */
export async function canWriteToFolder(
  folderId: string,
  accessToken: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${DRIVE_FILES_URL}/${folderId}?fields=id,capabilities/canAddChildren`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) return false;
    const folder = (await response.json()) as {
      capabilities?: { canAddChildren?: boolean };
    };
    return folder.capabilities?.canAddChildren !== false;
  } catch {
    return false;
  }
}

/** Nominates a Drive folder for uploads. Accepts a share URL or a bare id. */
export async function setUploadFolder(input: string): Promise<DriveSyncState> {
  const id = parseDriveFolderId(input);
  return writeState({ preferredFolderId: id, preferredFolderUnreachable: false });
}

async function ensureUploadFolder(accessToken: string): Promise<string | undefined> {
  const state = await readState();

  /**
   * A folder the family nominated wins, when it is reachable. When it is not -
   * the usual reason being that they created it by hand and `drive.file` cannot
   * see it - the flag is recorded so the panel can explain rather than leaving
   * them wondering why backups appear somewhere else.
   */
  if (state.preferredFolderId) {
    if (await canWriteToFolder(state.preferredFolderId, accessToken)) {
      if (state.preferredFolderUnreachable) {
        await writeState({ preferredFolderUnreachable: false });
      }
      return state.preferredFolderId;
    }
    if (!state.preferredFolderUnreachable) {
      await writeState({ preferredFolderUnreachable: true });
    }
  }

  if (state.oauthFolderId) return state.oauthFolderId;

  const response = await fetch(DRIVE_FILES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'GCSE Genie Backups',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!response.ok) return undefined;

  const folder = (await response.json()) as { id: string };
  await writeState({ oauthFolderId: folder.id });
  return folder.id;
}

async function uploadViaOAuth(fileName: string, contents: string): Promise<void> {
  const accessToken = await freshAccessToken();
  const folderId = await ensureUploadFolder(accessToken);

  const metadata: Record<string, unknown> = { name: fileName, mimeType: 'application/json' };
  if (folderId) metadata.parents = [folderId];

  const boundary = `genie-${crypto.randomUUID()}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${contents}\r\n` +
    `--${boundary}--`;

  const response = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Drive rejected the upload (${response.status}).`);
  }
}

// ---------------------------------------------------------------------------
// Keeping the folder readable
// ---------------------------------------------------------------------------

export const DEFAULT_KEEP_BACKUPS = 30;

/**
 * Exactly the filenames this app writes, and nothing else.
 *
 * Deliberately strict, because everything downstream of it deletes files. A
 * looser pattern - anything ending `.json`, say - would eventually meet a file
 * somebody else put in that folder and silently destroy it. Anchored at both
 * ends, with the timestamp shape spelled out.
 */
export const BACKUP_FILE_PATTERN = /^GCSE_Genie_Backup_\d{4}-\d{2}-\d{2}-\d{4}\.json$/;

/**
 * Chooses which backups to delete.
 *
 * Names sort chronologically by construction - that is why `backupFileName`
 * pads every component - so a plain descending sort puts the newest first and
 * no date parsing is needed. Pure, so the decision can be tested without a
 * filesystem or a network.
 */
export function backupsToDelete(
  fileNames: string[],
  keep: number,
  protectFileName?: string
): string[] {
  if (keep <= 0) return [];
  return fileNames
    .filter((name) => BACKUP_FILE_PATTERN.test(name))
    .sort((a, b) => b.localeCompare(a))
    .slice(keep)
    /**
     * The backup just written is never a candidate, whatever the sort says.
     *
     * Sorting by name means a file dated in the future ranks above today's -
     * and clock skew across devices makes that entirely possible, since several
     * devices write into the same folder. Without this guard a laptop running a
     * day fast could push the phone's fresh backup out of the keep window the
     * instant it was written, and the run would report success having preserved
     * nothing.
     */
    .filter((name) => name !== protectFileName);
}

async function pruneFolderBackups(keep: number, protectFileName?: string): Promise<number> {
  const handle = (await loadFolderHandle()) as DirectoryHandle | undefined;
  if (!handle?.values || !handle.removeEntry) return 0;

  const names: string[] = [];
  for await (const entry of handle.values()) {
    // Files only. The Attachments subfolder must never be a deletion candidate.
    if (entry.kind === 'file') names.push(entry.name);
  }

  const doomed = backupsToDelete(names, keep, protectFileName);
  let deleted = 0;
  for (const name of doomed) {
    try {
      await handle.removeEntry(name);
      deleted += 1;
    } catch {
      // A file held open by Drive for Desktop can refuse deletion. Skip it and
      // try again next time rather than failing the backup that just succeeded.
    }
  }
  return deleted;
}

async function pruneDriveBackups(keep: number, protectFileName?: string): Promise<number> {
  const accessToken = await freshAccessToken();
  const state = await readState();
  if (!state.oauthFolderId) return 0;

  const query = encodeURIComponent(`'${state.oauthFolderId}' in parents and trashed = false`);
  const response = await fetch(
    `${DRIVE_FILES_URL}?q=${query}&fields=files(id,name)&pageSize=200`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) return 0;

  const listing = (await response.json()) as { files?: { id: string; name: string }[] };
  const files = listing.files ?? [];
  const doomed = new Set(backupsToDelete(files.map((f) => f.name), keep, protectFileName));

  let deleted = 0;
  for (const file of files) {
    if (!doomed.has(file.name)) continue;
    const removal = await fetch(`${DRIVE_FILES_URL}/${file.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (removal.ok) deleted += 1;
  }
  return deleted;
}

/**
 * Deletes backups beyond the retention limit.
 *
 * Runs after a successful backup and never before one - pruning first would, on
 * a run that then fails to write, leave fewer backups than it started with. It
 * also never throws into the caller: losing an old copy is not worth reporting a
 * successful backup as a failure.
 */
export async function pruneBackups(protectFileName?: string): Promise<number> {
  const state = await readState();
  const keep = state.keepBackups ?? DEFAULT_KEEP_BACKUPS;
  if (keep <= 0) return 0;

  const caps = await capability();
  try {
    if (caps.active === 'FOLDER_HANDLE') return await pruneFolderBackups(keep, protectFileName);
    if (caps.active === 'OAUTH') return await pruneDriveBackups(keep, protectFileName);
  } catch (err) {
    console.error('Could not prune old backups:', err);
  }
  return 0;
}

export async function setRetention(keepBackups: number): Promise<DriveSyncState> {
  return writeState({ keepBackups: Math.max(0, Math.floor(keepBackups)) });
}

// ---------------------------------------------------------------------------
// The thing everything above exists for
// ---------------------------------------------------------------------------

export function backupFileName(when: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `GCSE_Genie_Backup_${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(
    when.getDate()
  )}-${pad(when.getHours())}${pad(when.getMinutes())}.json`;
}

export interface BackupOutcome {
  ok: boolean;
  transport: TransportKind;
  fileName?: string;
  bytes?: number;
  /** How many older backups were removed to stay within the retention limit. */
  pruned?: number;
  error?: string;
}

/**
 * Writes one backup, now.
 *
 * Never throws at the caller. A backup that fails must leave a record of the
 * failure and let the app carry on - the one thing it must not do is fail
 * silently, which is the exact behaviour that left the folder empty.
 */
export async function backupNow(): Promise<BackupOutcome> {
  const caps = await capability();
  if (caps.active === 'NONE') {
    const error = caps.reason || 'No way to reach Drive from this device.';
    await writeState({ lastError: error, lastErrorAt: Date.now() });
    return { ok: false, transport: 'NONE', error };
  }

  const fileName = backupFileName();

  try {
    const contents = await exportDatabaseToJSON();

    if (caps.active === 'FOLDER_HANDLE') {
      await writeViaFolderHandle(fileName, contents);
    } else {
      await uploadViaOAuth(fileName, contents);
    }

    await writeState({
      lastBackupAt: Date.now(),
      lastBackupFileName: fileName,
      lastBackupBytes: contents.length,
      lastError: undefined,
      lastErrorAt: undefined,
    });

    /**
     * Attachments ride along with the backup rather than having their own
     * schedule. The JSON export cannot carry a blob - every backup sets
     * `attachmentsOmitted` - so a backup without its attachments mirrored is
     * only a partial restore point, and the moment we have just proved the
     * transport works is the right moment to use it again.
     *
     * Imported lazily to keep the cycle between these two modules out of the
     * module graph.
     */
    try {
      const { mirrorPendingAttachments } = await import('./attachmentMirrorService');
      await mirrorPendingAttachments();
    } catch (err) {
      console.error('Attachment mirroring did not complete:', err);
    }

    /**
     * Only after the new file is safely written. Pruning first would, on a run
     * that then failed, leave the folder with fewer backups than it had.
     */
    const pruned = await pruneBackups(fileName);

    return { ok: true, transport: caps.active, fileName, bytes: contents.length, pruned };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await writeState({ lastError: error, lastErrorAt: Date.now() });
    return { ok: false, transport: caps.active, error };
  }
}

/** Whether enough time has passed since the last successful backup. */
export async function isBackupDue(now: number = Date.now()): Promise<boolean> {
  const state = await readState();
  if (!state.autoEnabled) return false;
  const hours = state.intervalHours ?? 24;
  if (hours <= 0) return false;
  if (!state.lastBackupAt) return true;
  return now - state.lastBackupAt >= hours * 3_600_000;
}

/**
 * Called on app start. Backs up if one is due and possible, otherwise does
 * nothing and says why.
 *
 * Deliberately not on a timer. A phone tab is suspended in the background, so a
 * `setInterval` backup is a promise the browser will not keep; running at open
 * is the moment the app is definitely alive.
 */
export async function backupIfDue(): Promise<BackupOutcome | undefined> {
  if (!(await isBackupDue())) return undefined;
  const caps = await capability();
  /**
   * The folder handle cannot be re-prompted outside a user gesture, so an
   * automatic run against a lapsed permission would fail and mark the state
   * dirty for no reason. Leave it for the user to fix from the panel.
   */
  if (caps.active === 'NONE') return undefined;
  return backupNow();
}

export async function setAutoBackup(enabled: boolean, intervalHours = 24): Promise<DriveSyncState> {
  return writeState({ autoEnabled: enabled, intervalHours });
}

export async function disconnectDrive(): Promise<DriveSyncState> {
  await clearFolderHandle();
  return writeState({
    folderName: undefined,
    folderPermissionLost: false,
    oauthToken: undefined,
    oauthRefreshToken: undefined,
    oauthExpiresAt: undefined,
    autoEnabled: false,
  });
}

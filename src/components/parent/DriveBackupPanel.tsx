import React, { useCallback, useEffect, useState } from 'react';
import { useObservable } from 'dexie-react-hooks';
import { DriveSyncState } from '../../types';
import {
  DRIVE_OAUTH_CLIENT_ID,
  DriveCapability,
  backupNow,
  connectDrive,
  capability,
  chooseBackupFolder,
  disconnectDrive,
  readState,
  setAutoBackup,
  setRetention,
  setUploadFolder,
  DEFAULT_KEEP_BACKUPS,
} from '../../services/driveBackupService';
import { WORKING_FOLDER_PATH, BACKUPS_FOLDER_URL } from '../../db/driveFolders';
import {
  MirrorStatus,
  mirrorPendingAttachments,
  mirrorStatus,
} from '../../services/attachmentMirrorService';
import { useFeedback } from '../shared/FeedbackProvider';
import { db } from '../../db';
import { formatLogTimestamp } from '../../utils/date';
import { FolderOpen, CloudUpload, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

/**
 * Connecting this device to Drive, and saying honestly whether it worked.
 *
 * The bar this has to clear is set by what it replaces: a button that produced
 * a download and a folder that, a week after it was created, contained no
 * backups at all. So the rule here is that every state is stated. "Backups are
 * on" is only ever shown when a write has actually succeeded, and a lapsed
 * folder permission says so in the same place it previously said nothing.
 */
export const DriveBackupPanel: React.FC = () => {
  const { toast } = useFeedback();
  const [state, setState] = useState<DriveSyncState | null>(null);
  const [caps, setCaps] = useState<DriveCapability | null>(null);
  const [photos, setPhotos] = useState<MirrorStatus | null>(null);
  /**
   * The older "Backups folder (on this computer)" setting, which is a label and
   * nothing more. Someone who fills it in has every reason to think backups are
   * configured, so this panel has to say plainly that they are not.
   */
  const [legacyPath, setLegacyPath] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  /**
   * Kept behind a disclosure rather than removed. A household with no desktop
   * at all has no other route, and this panel should not decide for them - it
   * should only stop presenting the wrong answer as the obvious one.
   */
  const [showPhoneUpload, setShowPhoneUpload] = useState(false);

  /**
   * Whether this device's work reaches the device that does the backing up.
   * "One backup covers everyone" holds only while a device syncs, so it is
   * checked rather than asserted.
   */
  const cloudUser = useObservable(db.cloud?.currentUser);
  const syncedHere = !!cloudUser?.userId && cloudUser.userId !== 'unauthorized';

  const reload = useCallback(async () => {
    setState(await readState());
    setCaps(await capability());
    setPhotos(await mirrorStatus());
    setLegacyPath((await db.parentSettings.get('active_settings'))?.googleDriveBackupPath);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!state || !caps) return null;

  const connected = caps.active !== 'NONE';
  const lastOk = state.lastBackupAt && !state.lastError;

  const run = async (fn: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    try {
      await fn();
      await reload();
      toast.success(successMessage);
    } catch (err) {
      toast.error('That did not work', err instanceof Error ? err.message : 'Try again.');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-bold text-sm text-white">Automatic Drive backup</h3>
          <p className="text-xs text-slate-400 mt-0.5 leading-snug">
            A full JSON export written into your Drive folder, without anyone remembering to do it.
          </p>
        </div>
        {connected ? (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-bold text-emerald-400 whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3" /> Connected
          </span>
        ) : (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold text-amber-400 whitespace-nowrap">
            <AlertTriangle className="w-3 h-3" /> Not set up
          </span>
        )}
      </div>

      {/* Status, stated plainly. */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 mb-3 text-xs space-y-1">
        {lastOk ? (
          <p className="text-slate-300">
            Last backup <span className="text-white font-bold">{formatLogTimestamp(state.lastBackupAt!)}</span>
            {state.lastBackupFileName && (
              <>
                {' '}
                — <span className="font-mono text-slate-400">{state.lastBackupFileName}</span>
              </>
            )}
          </p>
        ) : (
          <p className="text-slate-400">No backup has been written from this device yet.</p>
        )}

        {state.lastError && (
          <p className="text-rose-400 leading-snug">
            Last attempt failed: {state.lastError}
          </p>
        )}

        {!connected && caps.reason && (
          <p className="text-amber-400 leading-snug">{caps.reason}</p>
        )}

        {/* Two controls have said "backup folder" since this panel was added,
            and only one of them grants write access. Naming the difference is
            cheaper than letting someone believe they are covered. */}
        {!connected && !!legacyPath?.trim() && (
          <p className="text-amber-400 leading-snug border-t border-slate-800 pt-1.5 mt-1.5">
            You have a folder <em>path</em> saved further up this page
            (<span className="font-mono text-slate-400">{legacyPath}</span>), but that field is
            only a label — it tells you where to file a download and gives Genie no access. Use
            the button below to grant access to the same folder.
          </p>
        )}

        {connected && caps.active === 'FOLDER_HANDLE' && state.folderName && (
          <p className="text-slate-400">
            Writing into <span className="font-mono text-slate-300">{state.folderName}</span>
          </p>
        )}
      </div>

      {/* Transport 1 - the desktop folder */}
      {caps.folderHandleSupported && (
        <div className="mb-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(chooseBackupFolder, 'Backup folder connected.')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-40"
          >
            <FolderOpen className="w-4 h-4" />
            {state.folderName ? 'Choose a different folder' : 'Choose the backup folder'}
          </button>
          <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">
            Pick <span className="font-mono text-slate-400">{WORKING_FOLDER_PATH}\_Genie-Backups</span>.
            Drive for Desktop uploads anything written there within seconds — nothing is sent over
            the network by this app.{' '}
            <a
              href={BACKUPS_FOLDER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 underline"
            >
              Open the folder in Drive
            </a>
          </p>
        </div>
      )}

      {/* Transport 2 - OAuth, for phones.

          Deliberately not a call to action. Backups are a whole-database
          export and every table but this panel's own settings syncs, so one
          backing-up device covers the family; a second device produces a
          duplicate of the same rows. The reason to say so rather than offer
          the button is that the button has a cost nobody would guess: this
          panel sits behind the parent passphrase, and the Google account it
          signs in is the parent's. Turning it on for a student's phone means
          handing over the passphrase and leaving a parent Google session on
          their device, to duplicate a backup that already exists. */}
      {!caps.folderHandleSupported && (
        <div className="mb-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs">
            <p className="text-slate-300 font-bold mb-1">
              This device does not need to back itself up.
            </p>
            <p className="text-slate-400 leading-snug">
              A backup is a copy of the whole database, and the database syncs. Whichever
              computer is set up above is already backing up everything done on this device.
            </p>

            {syncedHere ? (
              <p className="text-emerald-400 leading-snug mt-1.5">
                This device is signed in and syncing, so its work is covered.
              </p>
            ) : (
              <p className="text-amber-400 leading-snug mt-1.5">
                This device is not signed in, so its work has not reached any other device and
                is in no backup. Fix that with <span className="font-bold">This device only</span>{' '}
                at the top of the screen — not with the button below, which would only copy
                this device to Drive and leave it just as isolated.
              </p>
            )}
          </div>

          {showPhoneUpload ? (
            <>
              <button
                type="button"
                disabled={busy || !DRIVE_OAUTH_CLIENT_ID}
                onClick={() => run(connectDrive, 'Google Drive connected.')}
                className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-bold text-sm disabled:opacity-40"
              >
                <CloudUpload className="w-4 h-4" />
                Connect Google Drive anyway
              </button>
              <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">
                {DRIVE_OAUTH_CLIENT_ID
                  ? 'Signs a Google account in on this device and uploads to that account’s Drive. Worth doing only where this is the household’s one device and there is no computer — never on a student’s phone, where it means a parent account stays signed in on their device.'
                  : 'Google sign-in has not been configured for this app, so this device cannot upload in any case.'}
              </p>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowPhoneUpload(true)}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-300 mt-2"
            >
              Back this device up separately anyway
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !connected}
          onClick={() =>
            run(async () => {
              const outcome = await backupNow();
              if (!outcome.ok) throw new Error(outcome.error || 'Backup failed.');
            }, 'Backup written.')
          }
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs disabled:opacity-40"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Back up now
        </button>

        <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 font-bold">
          <input
            type="checkbox"
            checked={!!state.autoEnabled}
            disabled={busy || !connected}
            onChange={(e) => run(() => setAutoBackup(e.target.checked), 'Saved.')}
            className="accent-indigo-500"
          />
          Daily
        </label>
      </div>

      {/* Retention. Daily backups reach 365 files a year, and a folder that big
          stops being something you can find the right file in. */}
      <label className="flex items-center justify-between gap-3 mt-2 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/70">
        <span className="text-xs text-slate-300 font-bold">Keep the most recent</span>
        <span className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={365}
            value={state.keepBackups ?? DEFAULT_KEEP_BACKUPS}
            disabled={busy}
            onChange={(e) => run(() => setRetention(Number(e.target.value)), 'Saved.')}
            className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-right"
          />
          <span className="text-xs text-slate-500">backups</span>
        </span>
      </label>
      <p className="text-[10px] text-slate-500 mt-1 leading-snug">
        Older ones are deleted after each successful backup. Set to 0 to keep everything. Only files
        Genie wrote are ever removed.
      </p>

      {/* Where uploads land, over the API transport only. The folder handle
          writes wherever the user pointed the picker, so this would be
          meaningless there. */}
      {caps.oauthConfigured && !caps.folderHandleSupported && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
            Where this device uploads
          </label>
          <p className="text-[10px] text-slate-500 mb-1.5 leading-snug">
            This device backs up to Genie&rsquo;s own <span className="font-mono">GCSE Genie
            Backups</span> folder, which is normal and nothing to fix — a phone cannot write into
            the laptop&rsquo;s folder. Leave the box empty unless you have a folder Genie created.
          </p>
          <input
            defaultValue={state.preferredFolderId ?? ''}
            placeholder="Paste a Drive folder link, or leave blank"
            onBlur={(e) => {
              if (e.target.value !== (state.preferredFolderId ?? '')) {
                run(() => setUploadFolder(e.target.value), 'Folder saved.');
              }
            }}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 font-mono"
          />

          {state.preferredFolderUnreachable ? (
            <p className="text-[10px] text-amber-400 mt-1.5 leading-snug">
              Genie cannot see that folder, so backups are going to its own
              <span className="font-mono"> GCSE Genie Backups </span>
              folder instead. Google only grants this app access to files it created itself, so a
              folder you made by hand is invisible to it however correct the link. This is a
              limit of the narrow permission Genie asks for, not a mistake in the link.
            </p>
          ) : (
            <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">
              Optional. A folder you made by hand in Drive will not work — Genie can only reach
              folders it created itself.
            </p>
          )}
        </div>
      )}

      {/* Proof photos, reported separately because the JSON export cannot carry
          them - an unmirrored photo does not survive a restore. */}
      {photos && photos.total > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <p className="text-xs text-slate-300 mb-1.5">
            <span className="font-bold text-white">
              {photos.mirrored} of {photos.total}
            </span>{' '}
            proof photos have a copy in Drive.
            {photos.mirrored < photos.total && (
              <span className="text-amber-400">
                {' '}
                The other {photos.total - photos.mirrored} would be lost by a restore — the JSON
                export cannot carry an image.
              </span>
            )}
          </p>

          {photos.mirrored > photos.linkable && (
            <p className="text-[10px] text-slate-500 mb-2 leading-snug">
              {photos.mirrored - photos.linkable} of them are saved as files but not linkable:
              writing to a folder cannot tell Genie the id Drive assigns. Connecting the Drive API
              is what turns them into links.
            </p>
          )}

          {connected && photos.mirrored < photos.total && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const outcome = await mirrorPendingAttachments();
                  if (outcome.failed > 0) {
                    throw new Error(outcome.errors[0] || 'Some photos could not be copied.');
                  }
                }, 'Photos copied to Drive.')
              }
              className="w-full py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs disabled:opacity-40"
            >
              Copy the remaining {photos.total - photos.mirrored} to Drive
            </button>
          )}
        </div>
      )}

      {connected && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(disconnectDrive, 'Disconnected.')}
          className="w-full text-[11px] text-slate-500 mt-2 underline"
        >
          Disconnect this device
        </button>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useObservable } from 'dexie-react-hooks';
import { db } from '../../db';
import {
  getLockState,
  unlock,
  setPassphrase,
  LockState,
} from '../../services/parentLockService';
import { MIN_PASSPHRASE_LENGTH } from '../../utils/credential';
import { X, Lock, AlertCircle, ShieldAlert, KeyRound, CloudOff, RefreshCw } from 'lucide-react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';

interface ParentPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * The parent lock.
 *
 * Deliberately described as a lock on the interface, not as protection of the
 * data. Anyone who can open devtools can still edit IndexedDB directly; what
 * changed is that doing so now breaks the audit chain and is reported in the
 * Parent Portal. Claiming otherwise here would repeat the overstatement the
 * "immutable ledger" heading used to make.
 */
export const ParentPinModal: React.FC<ParentPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [lockState, setLockState] = useState<LockState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cloudUser = useObservable(db.cloud?.currentUser);
  const syncState = useObservable(db.cloud?.syncState);
  const [passphrase, setPhrase] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  /** Set after a legacy PIN is accepted: a passphrase must be chosen now. */
  const [upgrading, setUpgrading] = useState(false);

  /**
   * Reads the lock state, and records a failure rather than staying silent.
   *
   * This used to be `getLockState().then(setLockState)` with no catch, above a
   * `if (!isOpen || !lockState) return null`. So when the read could not
   * complete - a database that failed to open, most often a schema upgrade
   * blocked by a second tab - `lockState` stayed null and the modal rendered
   * nothing at all. Tapping Parent Mode did visibly nothing, with no error
   * anywhere to explain it.
   */
  const refresh = () =>
    getLockState()
      .then((state) => {
        setLockState(state);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        console.error('Could not read the parent lock state:', err);
        setLoadError(
          err instanceof Error ? err.message : 'The database did not respond.'
        );
      });

  useEffect(() => {
    if (!isOpen) return;
    setPhrase('');
    setConfirmPhrase('');
    setMessage(null);
    setIsBusy(false);
    setUpgrading(false);
    setLoadError(null);
    refresh();
  }, [isOpen]);

  // Escape closes, like every other dialog in the app. Must sit above the
  // early return - a hook cannot be called conditionally.
  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  /**
   * Something to look at while the lock state loads, and something to read if
   * it never arrives. Rendering null in either case is what made this button
   * look broken.
   */
  if (!lockState) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Parent access"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      >
        <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative text-center">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {loadError ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-bold text-white">Could not check the lock</h2>
              <p className="text-xs text-slate-400 mt-1.5">
                Genie could not read its database, so it cannot tell whether a passphrase is set.
                This is usually the app being open in another tab. Close it there and reload.
              </p>
              <p className="mt-2 text-[10px] text-slate-600 break-words">{loadError}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs uppercase tracking-wider"
              >
                Reload
              </button>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center mx-auto mb-3">
                <RefreshCw className="w-7 h-7 animate-spin" />
              </div>
              <h2 className="text-lg font-bold text-white">Checking...</h2>
              <p className="text-xs text-slate-400 mt-1.5">Reading the parent lock from this device.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const isClaiming = lockState.status === 'UNCLAIMED' || upgrading;
  const isLockedOut = lockState.status === 'LOCKED_OUT';

  /**
   * A passphrase set on another device only exists here once sync has delivered
   * it. Until then this device genuinely has no credential - and the honest
   * reading of that is "it has not arrived", not "nobody ever set one".
   *
   * Getting this wrong is worse than confusing. The unclaimed screen invites
   * whoever is holding the phone to set a passphrase, and doing that on a
   * device that is merely out of sync creates a second credential that will
   * fight the real one the moment it connects.
   */
  const isSignedIn = !!cloudUser?.userId && cloudUser.userId !== 'unauthorized';
  const phase = syncState?.phase;
  const isSettling = isSignedIn && phase !== 'in-sync' && phase !== 'error';
  const credentialMayBeElsewhere =
    lockState.status === 'UNCLAIMED' && !upgrading && (!isSignedIn || isSettling);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy) return;

    setIsBusy(true);
    setMessage(null);

    try {
      if (isClaiming) {
        if (passphrase !== confirmPhrase) {
          setMessage('The two entries do not match.');
          return;
        }
        const result = await setPassphrase(passphrase);
        if (!result.ok) {
          setMessage(result.message || 'Could not set that passphrase.');
          return;
        }
        onSuccess();
        onClose();
        return;
      }

      const result = await unlock(passphrase);
      if (!result.ok) {
        setMessage(result.message || 'Incorrect passphrase.');
        setPhrase('');
        await refresh();
        return;
      }

      if (result.mustUpgrade) {
        // The old PIN opens the door once; replacing it is not optional
        setUpgrading(true);
        setPhrase('');
        setConfirmPhrase('');
        setMessage('That PIN still works, but it is weak. Choose a passphrase to replace it.');
        return;
      }

      onSuccess();
      onClose();
    } finally {
      setIsBusy(false);
    }
  };

  const canSubmit =
    !isBusy &&
    !isLockedOut &&
    passphrase.length > 0 &&
    (!isClaiming || (passphrase.length >= MIN_PASSPHRASE_LENGTH && confirmPhrase.length > 0));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Parent access"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative text-center">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto mb-3">
          {isClaiming ? <KeyRound className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
        </div>

        <h2 className="text-lg font-bold text-white">
          {isClaiming ? 'Set the parent passphrase' : 'Parent Portal'}
        </h2>
        <p className="text-xs text-slate-400 mt-1 mb-4">
          {!isClaiming
            ? 'Unlocks audits, sanctions, approvals and settings.'
            : credentialMayBeElsewhere
              ? 'This device has no passphrase yet - see below before setting one.'
              : 'Choose this on a parent device, before Tejas starts using the app.'}
        </p>

        {credentialMayBeElsewhere && (
          <div className="mb-4 p-3 bg-indigo-950/50 border border-indigo-500/40 rounded-xl text-[11px] text-indigo-100 text-left flex items-start gap-2">
            {isSignedIn ? (
              <RefreshCw className="w-4 h-4 text-indigo-300 flex-shrink-0 mt-0.5 animate-spin" />
            ) : (
              <CloudOff className="w-4 h-4 text-indigo-300 flex-shrink-0 mt-0.5" />
            )}
            <span>
              {isSignedIn ? (
                <>
                  Still syncing. If a passphrase was set on another device it has not arrived here
                  yet - give it a moment before setting a new one.
                </>
              ) : (
                <>
                  <strong className="font-bold">This device is not signed in to sync.</strong> A
                  passphrase set on another device cannot reach it. Sign in from the header using
                  the same account, rather than setting a second passphrase here.
                </>
              )}
            </span>
          </div>
        )}

        {lockState.status === 'UNCLAIMED' && !upgrading && !credentialMayBeElsewhere && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-[11px] text-amber-100 text-left flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              No passphrase has been set. Whoever sets it first controls the Parent Portal, so do
              this before handing the app over.
            </span>
          </div>
        )}

        {isLockedOut && (
          <div className="mb-4 p-3 bg-rose-950/40 border border-rose-500/50 rounded-xl text-[11px] text-rose-100 text-left flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>
              Too many failed attempts. Try again in{' '}
              {Math.max(1, Math.ceil((lockState.until - Date.now()) / 1000))} seconds.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="parent-pass" className="sr-only">
            Parent passphrase
          </label>
          <input
            id="parent-pass"
            type="password"
            autoFocus
            autoComplete={isClaiming ? 'new-password' : 'current-password'}
            placeholder={isClaiming ? `At least ${MIN_PASSPHRASE_LENGTH} characters` : 'Passphrase'}
            value={passphrase}
            onChange={(e) => setPhrase(e.target.value)}
            disabled={isLockedOut}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white text-center focus:outline-none focus:border-rose-500 disabled:opacity-50"
          />

          {isClaiming && (
            <input
              type="password"
              aria-label="Confirm passphrase"
              autoComplete="new-password"
              placeholder="Type it again"
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white text-center focus:outline-none focus:border-rose-500"
            />
          )}

          {message && (
            <p className="text-[11px] font-semibold text-rose-300 text-left" role="alert">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-950/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBusy ? 'Checking...' : isClaiming ? 'Set passphrase' : 'Unlock'}
          </button>
        </form>

        {/*
          Which account this device is on, stated plainly.

          Almost every "the passphrase does not work on my phone" report is one
          device sitting on a different account from the one that set it, and
          from inside the modal that is completely invisible. Naming the account
          here turns a mystery into something readable off the screen.
        */}
        <p className="mt-4 text-[10px] text-slate-500 text-left">
          {isSignedIn
            ? `Signed in as ${cloudUser?.email || cloudUser?.name || cloudUser?.userId}`
            : 'Not signed in - this device only'}
        </p>

        <p className="mt-2 text-[10px] text-slate-500 leading-relaxed text-left">
          This locks the interface, not the data. Anyone with browser devtools can still edit the
          database directly - but doing so breaks the change history's hash chain, and the Parent
          Portal reports it.
        </p>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  getLockState,
  unlock,
  setPassphrase,
  LockState,
} from '../../services/parentLockService';
import { MIN_PASSPHRASE_LENGTH } from '../../utils/credential';
import { X, Lock, AlertCircle, ShieldAlert, KeyRound } from 'lucide-react';

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
  const [passphrase, setPhrase] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  /** Set after a legacy PIN is accepted: a passphrase must be chosen now. */
  const [upgrading, setUpgrading] = useState(false);

  const refresh = () => getLockState().then(setLockState);

  useEffect(() => {
    if (!isOpen) return;
    setPhrase('');
    setConfirmPhrase('');
    setMessage(null);
    setIsBusy(false);
    setUpgrading(false);
    refresh();
  }, [isOpen]);

  if (!isOpen || !lockState) return null;

  const isClaiming = lockState.status === 'UNCLAIMED' || upgrading;
  const isLockedOut = lockState.status === 'LOCKED_OUT';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
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
          {isClaiming
            ? 'Choose this on a parent device, before Tejas starts using the app.'
            : 'Unlocks audits, sanctions, approvals and settings.'}
        </p>

        {lockState.status === 'UNCLAIMED' && !upgrading && (
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

        <p className="mt-4 text-[10px] text-slate-500 leading-relaxed text-left">
          This locks the interface, not the data. Anyone with browser devtools can still edit the
          database directly - but doing so breaks the change history's hash chain, and the Parent
          Portal reports it.
        </p>
      </div>
    </div>
  );
};

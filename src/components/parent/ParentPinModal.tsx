import React, { useEffect, useState } from 'react';
import { db } from '../../db';
import { sha256 } from '../../utils/hash';
import { X, Lock, AlertCircle, ShieldAlert } from 'lucide-react';

interface ParentPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** SHA-256 of '1234' - the seeded default, kept only to warn that it is unchanged. */
const DEFAULT_PIN_HASH =
  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

export const ParentPinModal: React.FC<ParentPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isDefaultPin, setIsDefaultPin] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPin('');
    setError(false);

    db.parentSettings.get('active_settings').then((settings) => {
      setIsDefaultPin(!settings?.parentPinHash || settings.parentPinHash === DEFAULT_PIN_HASH);
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();

    const settings = await db.parentSettings.get('active_settings');
    // Fall back to the seeded default only if no PIN has ever been stored, so a
    // parent who has set their own PIN is the sole holder of it.
    const expectedHash = settings?.parentPinHash || DEFAULT_PIN_HASH;
    const enteredHash = await sha256(pin);

    if (enteredHash === expectedHash) {
      setError(false);
      setPin('');
      onSuccess();
      onClose();
    } else {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative text-center">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3 border border-rose-500/30">
          <Lock className="w-6 h-6" />
        </div>

        <h2 className="text-lg font-bold text-white mb-1">Parent Portal Access</h2>
        <p className="text-xs text-slate-400 mb-4">
          Enter your 4-digit Parent PIN to unlock audits, sanctions and settings.
        </p>

        {isDefaultPin && (
          <div className="mb-4 p-2.5 bg-amber-950/40 border border-amber-500/40 rounded-xl text-[11px] text-amber-200 flex items-start gap-2 text-left">
            <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              This PIN is still the factory default. Change it in the Parent Portal so it is
              not guessable.
            </span>
          </div>
        )}

        <form onSubmit={handleVerifyPin} className="space-y-4">
          <div>
            <label htmlFor="parent-pin" className="sr-only">
              Parent PIN
            </label>
            <input
              id="parent-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              maxLength={4}
              autoFocus
              placeholder="••••"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setError(false);
              }}
              className="w-32 mx-auto text-center tracking-[1em] text-xl font-bold bg-slate-800 border border-slate-700 rounded-xl py-2 text-white focus:outline-none focus:border-rose-500"
            />
          </div>

          {error && (
            <div className="text-xs text-rose-400 flex items-center justify-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Incorrect PIN. Please try again.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={pin.length < 4}
            className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-950/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Unlock Parent Portal
          </button>
        </form>
      </div>
    </div>
  );
};

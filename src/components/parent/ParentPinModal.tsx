import React, { useState } from 'react';
import { sha256 } from '../../utils/hash';
import { X, Lock, AlertCircle } from 'lucide-react';

interface ParentPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ParentPinModal: React.FC<ParentPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const hash = await sha256(pin);

    // Default PIN is 1234 -> hash '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'
    // Also accept direct '1234'
    if (
      hash === '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4' ||
      pin === '1234'
    ) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3 border border-rose-500/30">
          <Lock className="w-6 h-6" />
        </div>

        <h2 className="text-lg font-bold text-white mb-1">Parent Portal Access</h2>
        <p className="text-xs text-slate-400 mb-4">
          Enter 4-digit Parent PIN to unlock audits, sanctions, and settings (Default: <code className="text-rose-300">1234</code>)
        </p>

        <form onSubmit={handleVerifyPin} className="space-y-4">
          <div>
            <input
              type="password"
              maxLength={4}
              autoFocus
              placeholder="••••"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
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
            className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-950/50 transition-all"
          >
            Unlock Parent Portal
          </button>
        </form>
      </div>
    </div>
  );
};

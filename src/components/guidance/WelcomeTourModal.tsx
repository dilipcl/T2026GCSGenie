import React from 'react';
import { HowItWorksPanel } from './HowItWorksPanel';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { X, Check } from 'lucide-react';

const SEEN_KEY = 'genie.tour.seen';

/**
 * Whether the first-run tour has already been dismissed.
 *
 * Storage can throw outright - a private window, or a browser set to block site
 * data - and a tour that crashes the app on open is worse than a tour nobody
 * sees, so a failure is read as "already seen".
 */
export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTourSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Nothing to do. Worst case it opens once more next time.
  }
}

interface WelcomeTourModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * The same "How Genie works" page, shown once on the first launch.
 *
 * Deliberately the identical component rather than a separate onboarding
 * script: a tour that says different things from the help page is a tour that
 * goes stale the first time either one is edited.
 */
export const WelcomeTourModal: React.FC<WelcomeTourModalProps> = ({ isOpen, onClose }) => {
  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How Genie works"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-3xl bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 pb-nav-safe shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Welcome to Genie 🧞</h2>
            <p className="text-[11px] text-slate-400">
              Two minutes now saves a lot of guessing later. You can reopen this any time from
              Help &amp; Careers.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <HowItWorksPanel />

        <button
          onClick={onClose}
          className="mt-5 w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all"
        >
          <Check className="w-4 h-4" />
          <span>Got it</span>
        </button>
      </div>
    </div>
  );
};

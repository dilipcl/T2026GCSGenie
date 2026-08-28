import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ChangeCategory, UserRole } from '../../types';
import { recordChange, CATEGORY_ICON } from '../../services/changeLogService';
import { useFeedback } from './FeedbackProvider';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { Check, X } from 'lucide-react';

/**
 * One confirmation step in front of every change, and a log behind it.
 *
 * Two problems, one answer. A tap on a phone is easy to make by accident -
 * a list scrolls under a thumb and something gets ticked - and the app has no
 * way to tell an accident from a decision, so the number it reports afterwards
 * is wrong and nobody knows why. And separately, a change made silently on one
 * device is invisible to everyone else until it is questioned at the dinner
 * table.
 *
 * So: nothing is written until it is confirmed, and everything confirmed is
 * logged in words a person can read and send on.
 *
 * The cost of a confirmation step is friction, and friction is what stops the
 * app being used. Three things keep it cheap:
 *
 *  - It is one tap. The sheet states the change and its effect; the primary
 *    button does it.
 *  - It says what will actually happen ("+50 XP"), so it is worth reading
 *    rather than something to dismiss reflexively.
 *  - The confirm button is inert for a moment after the sheet appears. A
 *    double-tap that opened it cannot also accept it - which is the exact
 *    accident this is here to prevent, and the only one a confirm dialog is
 *    otherwise powerless against.
 */

/**
 * How long the primary button refuses input after the sheet opens.
 *
 * Short enough to be imperceptible to someone reading the sheet, long enough to
 * swallow the second half of a double-tap. It must never be silent: a control
 * that absorbs a tap and says nothing is indistinguishable from a broken one,
 * which is the single most likely way this whole mechanism gets reported as
 * "the confirmation isn't working".
 */
const ARM_DELAY_MS = 300;

export interface ChangeRequest {
  /** The question, in the imperative: "Mark this done?" */
  title: string;
  /** What it is about - the task title, the chore, the goal. */
  subject?: string;
  /** What will change, stated plainly: "+50 XP", "3h come off this week". */
  effect?: string;
  category: ChangeCategory;
  /** The line written to the log. Should read on its own, out of context. */
  summary: string;
  detail?: string;
  actor?: UserRole;
  confirmLabel?: string;
  tone?: 'normal' | 'danger';
  /** Performs the change. Only ever called after a confirmation. */
  run: () => Promise<void> | void;
}

interface ChangeGuardApi {
  /** Resolves true when the change was confirmed and applied. */
  confirmChange: (request: ChangeRequest) => Promise<boolean>;
}

const ChangeGuardContext = createContext<ChangeGuardApi | null>(null);

export function useChangeGuard(): ChangeGuardApi {
  const ctx = useContext(ChangeGuardContext);
  if (!ctx) throw new Error('useChangeGuard must be used inside <ChangeGuardProvider>');
  return ctx;
}

interface PendingChange {
  request: ChangeRequest;
  resolve: (confirmed: boolean) => void;
}

export const ChangeGuardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { toast } = useFeedback();
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [isArmed, setIsArmed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  /** Set when someone tapped during the arming window, so it can be explained. */
  const [tappedEarly, setTappedEarly] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const confirmChange = useCallback(
    (request: ChangeRequest) =>
      new Promise<boolean>((resolve) => {
        setPending({ request, resolve });
      }),
    []
  );

  // Arm on a short delay, and focus the button so a keyboard user is not made
  // to hunt for it.
  useEffect(() => {
    if (!pending) return;
    setIsArmed(false);
    setIsBusy(false);
    setTappedEarly(false);
    const timer = setTimeout(() => {
      setIsArmed(true);
      confirmRef.current?.focus();
    }, ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const close = useCallback(
    (confirmed: boolean) => {
      pending?.resolve(confirmed);
      setPending(null);
    },
    [pending]
  );

  useEscapeToClose(!!pending, () => close(false));

  const handleConfirm = async () => {
    if (!pending || isBusy) return;

    // Tapped before the guard released. Say so rather than absorbing it.
    if (!isArmed) {
      setTappedEarly(true);
      return;
    }

    const { request } = pending;

    setIsBusy(true);
    try {
      await request.run();

      /**
       * Logged after the change succeeds, never before. A log entry for a write
       * that threw would be reported to the family as something that happened.
       */
      await recordChange({
        category: request.category,
        summary: request.summary,
        detail: request.detail,
        actor: request.actor,
      });

      close(true);
    } catch (err) {
      console.error('Could not apply that change:', err);
      toast.error('Could not save that', 'Nothing was changed.');
      close(false);
    } finally {
      setIsBusy(false);
    }
  };

  const request = pending?.request;
  const isDanger = request?.tone === 'danger';

  return (
    <ChangeGuardContext.Provider value={{ confirmChange }}>
      {children}

      {request && (
        <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => close(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={request.title}
            className="relative w-full sm:max-w-sm bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 pb-nav-safe sm:pb-5 shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom-4"
          >
            <div className="flex items-start gap-3 mb-4">
              <span className="text-2xl leading-none flex-shrink-0" aria-hidden="true">
                {CATEGORY_ICON[request.category]}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-white">{request.title}</h2>
                {request.subject && (
                  <p className="text-[13px] text-slate-200 mt-0.5 break-words">{request.subject}</p>
                )}
                {request.effect && (
                  <p
                    className={`text-[11px] font-semibold mt-1 ${
                      isDanger ? 'text-rose-300' : 'text-emerald-300'
                    }`}
                  >
                    {request.effect}
                  </p>
                )}
                {request.detail && (
                  <p className="text-[11px] text-slate-400 mt-1">{request.detail}</p>
                )}
              </div>
              <button
                onClick={() => close(false)}
                aria-label="Cancel"
                className="p-1.5 -mr-1.5 -mt-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Deliberately not `disabled` while arming. A disabled control
                  absorbs the tap and explains nothing; this one stays live,
                  refuses the early tap, and says why. */}
              <button
                ref={confirmRef}
                onClick={handleConfirm}
                disabled={isBusy}
                aria-disabled={!isArmed}
                className={`relative flex-1 py-3 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 overflow-hidden transition-all disabled:opacity-60 ${
                  isDanger
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                } ${!isArmed ? 'opacity-70' : ''}`}
              >
                {/* A sliver of motion so the pause reads as the app getting
                    ready, not as the button being dead. */}
                {!isArmed && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-white/60 motion-safe:animate-pulse"
                  />
                )}
                <Check className="w-4 h-4" />
                <span>{isBusy ? 'Saving...' : request.confirmLabel || 'Confirm'}</span>
              </button>

              <button
                onClick={() => close(false)}
                className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs"
              >
                Cancel
              </button>
            </div>

            <p
              className={`mt-2.5 text-[10px] text-center ${
                tappedEarly ? 'text-amber-300' : 'text-slate-500'
              }`}
              role={tappedEarly ? 'alert' : undefined}
            >
              {tappedEarly
                ? 'That was a fraction too quick — tap it again to confirm.'
                : 'Confirmed changes are logged and can be sent to the family group.'}
            </p>
          </div>
        </div>
      )}
    </ChangeGuardContext.Provider>
  );
};

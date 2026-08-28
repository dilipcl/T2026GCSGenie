import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { triggerCelebration } from '../../utils/confetti';
import { newId } from '../../utils/id';
import { CheckCircle2, AlertTriangle, Info, X, Sparkles } from 'lucide-react';

/**
 * In-app toasts and confirms, replacing window.alert and window.confirm.
 *
 * The native dialogs block the whole page until dismissed, are styled by the OS
 * rather than the app, and cannot show anything richer than a string - which
 * meant the reward for finishing a quest arrived as a grey system box in the
 * middle of an app that otherwise fires confetti. They also made the app
 * untestable in places: a native confirm freezes automation entirely.
 */

type ToastTone = 'success' | 'error' | 'info' | 'celebrate';

interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ConfirmOptions {
  title: string;
  body?: string;
  /** Preformatted extra detail - row counts, file lists. Rendered monospaced. */
  details?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'normal';
}

interface FeedbackApi {
  toast: {
    success: (title: string, description?: string) => void;
    error: (title: string, description?: string) => void;
    info: (title: string, description?: string) => void;
    /** Success, plus confetti. For the moments that deserve it. */
    celebrate: (title: string, description?: string) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}

const TONE_STYLES: Record<ToastTone, { ring: string; icon: React.ElementType; iconColor: string }> = {
  success: { ring: 'border-emerald-500/50', icon: CheckCircle2, iconColor: 'text-emerald-400' },
  celebrate: { ring: 'border-amber-500/50', icon: Sparkles, iconColor: 'text-amber-400' },
  error: { ring: 'border-rose-500/60', icon: AlertTriangle, iconColor: 'text-rose-400' },
  info: { ring: 'border-indigo-500/50', icon: Info, iconColor: 'text-indigo-400' },
};

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, description?: string) => {
      const id = newId('toast');
      setToasts((prev) => [...prev.slice(-2), { id, tone, title, description }]);
      if (tone === 'celebrate') triggerCelebration({ particleCount: 60 });
      // Errors linger: they usually need reading, and often acting on
      const life = tone === 'error' ? 8000 : 4500;
      window.setTimeout(() => dismiss(id), life);
    },
    [dismiss]
  );

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })),
    []
  );

  const settle = useCallback(
    (result: boolean) => {
      setConfirmState((current) => {
        current?.resolve(result);
        return null;
      });
    },
    []
  );

  // The confirm button takes focus so Enter works
  useEffect(() => {
    if (!confirmState) return;
    confirmButtonRef.current?.focus();
  }, [confirmState]);

  // Escape cancels. Through the shared hook rather than its own listener, so a
  // confirm raised from inside a modal is the layer that answers Escape and the
  // modal beneath it stays open.
  const cancelConfirm = useCallback(() => settle(false), [settle]);
  useEscapeToClose(!!confirmState, cancelConfirm);

  const api = useMemo<FeedbackApi>(
    () => ({
      toast: {
        success: (t, d) => push('success', t, d),
        error: (t, d) => push('error', t, d),
        info: (t, d) => push('info', t, d),
        celebrate: (t, d) => push('celebrate', t, d),
      },
      confirm,
    }),
    [push, confirm]
  );

  const isDanger = confirmState?.tone === 'danger';

  return (
    <FeedbackContext.Provider value={api}>
      {children}

      {/* Toasts. Sit above the mobile bottom bar so they never cover the nav. */}
      <div
        aria-live="polite"
        className="fixed inset-x-0 bottom-24 md:bottom-6 md:inset-x-auto md:right-6 z-[60] flex flex-col items-center md:items-end gap-2 px-4 pointer-events-none"
      >
        {toasts.map((t) => {
          const style = TONE_STYLES[t.tone];
          const Icon = style.icon;
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto w-full max-w-sm bg-slate-900/95 backdrop-blur border ${style.ring} rounded-2xl shadow-2xl px-4 py-3 flex items-start gap-3 motion-safe:animate-in motion-safe:slide-in-from-bottom-2`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${style.iconColor}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white leading-snug">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-slate-300 mt-0.5 leading-snug">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="p-1 -m-1 text-slate-500 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirm */}
      {confirmState && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => settle(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6"
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0 ${
                  isDanger
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                    : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 id="confirm-title" className="text-base font-bold text-white leading-snug">
                  {confirmState.title}
                </h2>
                {confirmState.body && (
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{confirmState.body}</p>
                )}
              </div>
            </div>

            {confirmState.details && (
              <pre className="mt-3 p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-[11px] text-slate-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                {confirmState.details}
              </pre>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => settle(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-all"
              >
                {confirmState.cancelLabel || 'Cancel'}
              </button>
              <button
                ref={confirmButtonRef}
                onClick={() => settle(true)}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs text-white transition-all ${
                  isDanger
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {confirmState.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
};

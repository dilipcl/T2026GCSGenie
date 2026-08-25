import React, { useEffect, useState } from 'react';
import { useObservable } from 'dexie-react-hooks';
import { db } from '../../db';
import { X, CloudCog, AlertTriangle, Info, MailCheck } from 'lucide-react';

/**
 * The sync sign-in, in the app's own clothes.
 *
 * With customLoginGui off, dexie-cloud renders its stock white dialog - which
 * in an app this dark reads as a browser security prompt, and the QA field test
 * called it exactly that: "an unstyled white browser-style dialog with no
 * explanation". Same flow, same fields, but styled like the rest of the app and
 * with a line of copy saying what signing in actually does.
 *
 * The interaction object supplies the fields and buttons; this component only
 * decides how they look and what the moment is called.
 */

const TITLES: Record<string, { title: string; blurb?: string }> = {
  email: {
    title: 'Sign in to sync',
    blurb:
      'Syncing lets a check-in on one device show up on the others. Use the same email on every device - a different address gets a different, empty account.',
  },
  otp: {
    title: 'Enter the code we emailed you',
    blurb: 'It can take a minute to arrive. Check spam if it does not.',
  },
  'message-alert': { title: 'Sync' },
  'logout-confirmation': {
    title: 'Sign out?',
    blurb: 'Changes made on this device that have not synced yet would be lost.',
  },
  generic: { title: 'Sync' },
};

export const CloudLoginDialog: React.FC = () => {
  const interaction = useObservable(db.cloud?.userInteraction);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues({});
  }, [interaction?.type]);

  if (!interaction) return null;

  const meta = TITLES[interaction.type] ?? TITLES.generic;
  interface DialogField {
    type: string;
    label?: string;
    placeholder?: string;
  }
  const fieldEntries = Object.entries((interaction.fields ?? {}) as Record<string, DialogField>);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    interaction.onSubmit(values);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => interaction.onCancel()} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-login-title"
        className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6"
      >
        <button
          onClick={() => interaction.onCancel()}
          aria-label="Cancel"
          className="absolute top-3 right-3 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mb-3">
          {interaction.type === 'otp' ? <MailCheck className="w-6 h-6" /> : <CloudCog className="w-6 h-6" />}
        </div>

        <h2 id="cloud-login-title" className="text-lg font-bold text-white">
          {meta.title}
        </h2>
        {meta.blurb && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{meta.blurb}</p>}

        {(interaction.alerts ?? []).length > 0 && (
          <div className="mt-3 space-y-2">
            {interaction.alerts.map((alert, i) => (
              <div
                key={i}
                role={alert.type === 'error' ? 'alert' : 'status'}
                className={`p-2.5 rounded-xl border text-[11px] flex items-start gap-2 ${
                  alert.type === 'error'
                    ? 'bg-rose-950/40 border-rose-500/50 text-rose-100'
                    : alert.type === 'warning'
                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-100'
                    : 'bg-indigo-950/40 border-indigo-500/40 text-indigo-100'
                }`}
              >
                {alert.type === 'error' ? (
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                )}
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          {fieldEntries.map(([name, field]) => (
            <div key={name}>
              {field.label && (
                <label
                  htmlFor={`cloud-${name}`}
                  className="block text-[11px] font-bold text-slate-300 uppercase mb-1"
                >
                  {field.label}
                </label>
              )}
              <input
                id={`cloud-${name}`}
                autoFocus
                type={field.type === 'email' ? 'email' : field.type === 'password' ? 'password' : 'text'}
                inputMode={field.type === 'otp' ? 'numeric' : undefined}
                autoComplete={field.type === 'email' ? 'email' : field.type === 'otp' ? 'one-time-code' : undefined}
                placeholder={field.placeholder || (field.type === 'email' ? 'you@example.com' : undefined)}
                value={values[name] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white text-center tracking-wide placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            {interaction.cancelLabel && (
              <button
                type="button"
                onClick={() => interaction.onCancel()}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-all"
              >
                {interaction.cancelLabel}
              </button>
            )}
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all"
            >
              {interaction.submitLabel || 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

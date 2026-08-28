import React from 'react';
import { useDatabaseStatus } from '../../db/databaseStatus';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Says so when the database cannot open.
 *
 * The failure this exists for is not dramatic: it is a schema upgrade meeting a
 * second open tab. IndexedDB refuses to upgrade while an older connection holds
 * the database, and waits - so the app renders, the buttons draw, and every one
 * of them does nothing, because the read behind it never returns. Nothing is
 * logged and nothing is shown. The user's report is "the buttons don't work",
 * which is both accurate and impossible to act on.
 *
 * One sentence and one button is the whole fix. Reloading after closing the
 * other tab resolves it; knowing that is the part that was missing.
 */
export const DatabaseGate: React.FC = () => {
  const status = useDatabaseStatus();

  if (status.state === 'OPEN' || status.state === 'OPENING') return null;

  const copy =
    status.state === 'BLOCKED'
      ? {
          title: 'Genie is open in another tab',
          body: 'This version needs to update the local database, and it cannot while an older tab still has it open. Close the app everywhere else, then reload.',
        }
      : status.state === 'SUPERSEDED'
      ? {
          title: 'A newer version took over',
          body: 'Another tab updated Genie. Reload to carry on here.',
        }
      : {
          title: 'Genie could not open its database',
          body: `Nothing has been lost - the data is still on this device. ${status.message}`,
        };

  return (
    <div className="fixed inset-x-0 top-0 z-[80] p-3 pt-safe">
      <div
        role="alert"
        className="max-w-2xl mx-auto rounded-2xl border border-amber-500/60 bg-amber-950/95 backdrop-blur px-4 py-3 shadow-2xl flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3 min-w-0">
          <AlertTriangle className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-amber-100">{copy.title}</h2>
            <p className="text-[11px] text-amber-100/90 mt-0.5">{copy.body}</p>
          </div>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex-shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reload</span>
        </button>
      </div>
    </div>
  );
};

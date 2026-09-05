import React, { useState } from 'react';
import { useDatabaseStatus } from '../../db/databaseStatus';
import { readRescueCounts, exportRescueBundle } from '../../db/rescue';
import { AlertTriangle, RefreshCw, ShieldCheck, Download, Search, Loader2 } from 'lucide-react';

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
 * The stalled case earns more than one sentence, because it is the one that
 * frightens people. Every screen shows an empty state - no XP, no subjects, no
 * tasks - which reads exactly like the data has been deleted, and the obvious
 * response to that is to clear the site data and start again. That is the only
 * action in the whole situation that actually destroys anything. So the panel
 * answers the real question first, by counting the rows straight out of
 * IndexedDB and saying how many are there, offers a copy that can be saved
 * without a working database, and says plainly which button not to press.
 */
export const DatabaseGate: React.FC = () => {
  const status = useDatabaseStatus();

  if (status.state === 'OPEN' || status.state === 'OPENING') return null;

  if (status.state === 'STALLED' || status.state === 'FAILED') {
    return <StuckPanel reason={status.state === 'FAILED' ? status.message : undefined} />;
  }

  const copy =
    status.state === 'BLOCKED'
      ? {
          title: 'Genie is open in another tab',
          body: 'This version needs to update the local database, and it cannot while an older tab still has it open. Close the app everywhere else, then reload.',
        }
      : {
          title: 'A newer version took over',
          body: 'Another tab updated Genie. Reload to carry on here.',
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

/** What the row count came back with, in the words a parent needs. */
type CheckState =
  | { phase: 'IDLE' }
  | { phase: 'RUNNING' }
  | { phase: 'FOUND'; rows: number; detail: string }
  | { phase: 'EMPTY' }
  | { phase: 'UNREADABLE'; message: string };

/** The tables worth naming on screen, in the order a person would look for them. */
const HEADLINE_TABLES: Array<[string, string]> = [
  ['subjects', 'subjects'],
  ['syllabusTopics', 'topics'],
  ['tasks', 'tasks'],
  ['studyLogs', 'study logs'],
  ['assessments', 'assessments'],
  ['goals', 'goals'],
];

const StuckPanel: React.FC<{ reason?: string }> = ({ reason }) => {
  const [check, setCheck] = useState<CheckState>({ phase: 'IDLE' });
  const [saving, setSaving] = useState(false);

  const runCheck = async () => {
    setCheck({ phase: 'RUNNING' });
    try {
      const reading = await readRescueCounts();
      if (reading.rowsFound === 0) {
        setCheck({ phase: 'EMPTY' });
        return;
      }
      const detail = HEADLINE_TABLES.filter(([table]) => reading.counts[table])
        .map(([table, label]) => `${reading.counts[table]} ${label}`)
        .join(', ');
      setCheck({ phase: 'FOUND', rows: reading.rowsFound, detail });
    } catch (error) {
      setCheck({
        phase: 'UNREADABLE',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const saveCopy = async () => {
    setSaving(true);
    try {
      const bundle = await exportRescueBundle();
      const url = URL.createObjectURL(new Blob([bundle], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `genie-rescue-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setCheck({
        phase: 'UNREADABLE',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-3 pt-safe">
      <div
        role="alert"
        className="max-w-xl mx-auto my-6 rounded-2xl border border-amber-500/60 bg-slate-900 shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-amber-100">
              Genie is having trouble opening its data
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Screens may look empty while this is happening. That is the app failing to read the
              data, not the data being gone.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-300 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-emerald-100">Nothing has been deleted</h3>
                <p className="text-[11px] text-emerald-100/80 mt-0.5">
                  Genie never deletes your work on its own. Check for yourself - this counts what is
                  on this device without going through the part that is stuck.
                </p>

                <button
                  onClick={runCheck}
                  disabled={check.phase === 'RUNNING'}
                  className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold text-[11px] transition-all"
                >
                  {check.phase === 'RUNNING' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>Check my data</span>
                </button>

                {check.phase === 'FOUND' && (
                  <p className="mt-2 text-[11px] text-emerald-200 font-semibold">
                    Found {check.rows.toLocaleString()} records on this device
                    {check.detail && <span className="font-normal"> - {check.detail}.</span>}
                  </p>
                )}
                {check.phase === 'EMPTY' && (
                  <p className="mt-2 text-[11px] text-amber-200">
                    No records on this device. If you are signed in, they are still on the server -
                    sign in on this device and they will come back. Do not clear anything.
                  </p>
                )}
                {check.phase === 'UNREADABLE' && (
                  <p className="mt-2 text-[11px] text-amber-200">
                    Could not read the data right now ({check.message}). This does not mean it is
                    gone. Try the steps below.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-slate-200 mb-2">What to do, in this order</h3>
            <ol className="space-y-1.5 text-[11px] text-slate-300 list-decimal list-inside">
              <li>
                <span className="font-semibold text-slate-100">Close Genie everywhere else</span> -
                other tabs, other windows, and the app on your phone. One old tab is enough to hold
                this up.
              </li>
              <li>
                <span className="font-semibold text-slate-100">Reload this page.</span> Most of the
                time that is the whole fix.
              </li>
              <li>
                <span className="font-semibold text-slate-100">Save a copy first</span> if you would
                rather be safe before trying anything else.
              </li>
              <li>
                Still stuck after a reload?{' '}
                <span className="font-semibold text-slate-100">
                  Tell Dad rather than experimenting.
                </span>{' '}
                Nothing is getting worse while it sits like this.
              </li>
            </ol>
          </div>

          <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3">
            <h3 className="text-xs font-bold text-rose-100">Do not do this</h3>
            <p className="text-[11px] text-rose-100/85 mt-0.5">
              Do not clear site data, cookies, or browsing data for this app, and do not use Reset
              or Clear storage in the browser settings. Emptying the ordinary cache is harmless, but
              clearing site data is the one action here that really does erase your work - and it
              will not fix this.
            </p>
          </div>

          {reason && (
            <p className="text-[10px] text-slate-500 font-mono break-words">Details: {reason}</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-800 flex flex-wrap gap-2 justify-end">
          <button
            onClick={saveCopy}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 disabled:opacity-60 text-slate-200 font-bold text-xs transition-all"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Save a copy</span>
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload</span>
          </button>
        </div>
      </div>
    </div>
  );
};

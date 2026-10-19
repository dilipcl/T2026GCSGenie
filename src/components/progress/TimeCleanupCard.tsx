import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { applyCleanup, cleanupSize, readCleanupPlan } from '../../services/timeCleanup';
import { UserRole } from '../../types';
import { Wand2 } from 'lucide-react';

/**
 * The one-tap tidy for time that has only one right home - see `timeCleanup`.
 *
 * Shown only when there is something to do, and listing every change before it
 * is made: a button that edits rows nobody has seen is how a family stops
 * trusting the numbers. For a parent only, because one of the two changes edits
 * an agreed goal, and agreed goals are a parent's to change.
 */
export const TimeCleanupCard: React.FC<{ role: UserRole }> = ({ role }) => {
  const plan = useLiveQuery(() => readCleanupPlan(), []);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  if (role !== 'PARENT') return null;
  if (done !== null && (!plan || cleanupSize(plan) === 0)) {
    return (
      <section className="glass-card p-4 border-emerald-500/30">
        <p className="text-xs text-emerald-200">
          Tidied {done} {done === 1 ? 'thing' : 'things'}. Each change is in Updates.
        </p>
      </section>
    );
  }
  if (!plan || cleanupSize(plan) === 0) return null;

  const minutes = plan.relinks.reduce((sum, r) => sum + r.minutes, 0);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      setDone(await applyCleanup(role));
    } catch (error) {
      console.error('Tidying study time failed', error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card p-4 border-indigo-500/30" aria-labelledby="tidy-title">
      <div className="flex items-center gap-2 mb-1">
        <Wand2 className="w-4 h-4 text-indigo-300" aria-hidden="true" />
        <h3 id="tidy-title" className="text-sm font-bold text-white">
          Can be tidied in one tap
        </h3>
      </div>
      <p className="text-xs text-slate-300">
        Each of these has only one right answer.
        {minutes > 0 &&
          ` ${Math.round((minutes / 60) * 10) / 10}h of study time starts counting.`}{' '}
        Anything that needs a decision stays on the card above.
      </p>
      <ul className="mt-2 space-y-1 text-xs text-slate-200">
        {plan.subjectFixes.map((fix) => (
          <li key={fix.goal.id}>
            Give “{fix.goal.title}” the subject <strong>{fix.subject.name}</strong>
          </li>
        ))}
        {plan.relinks.map((relink) => (
          <li key={relink.id}>
            Move {relink.label} from a deleted goal to “{relink.to.title}”
            {relink.minutes > 0 && <span className="text-slate-500"> · {relink.minutes} min</span>}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="mt-3 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-xs font-bold text-white"
      >
        {busy
          ? 'Tidying…'
          : `Make ${cleanupSize(plan) === 1 ? 'this change' : `these ${cleanupSize(plan)} changes`}`}
      </button>
      {failed && (
        <p className="mt-2 text-[11px] text-rose-300">
          That did not save, and nothing was changed. Try again in a moment.
        </p>
      )}
    </section>
  );
};

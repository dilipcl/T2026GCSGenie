import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { weekExecution, XP_EXTRA_STORY, XP_WEEK_BONUS_MAX } from '../../services/weekExecution';
import { weekStartISO } from '../../services/planBaselineService';
import { addDaysISO, formatShortDate, parseISODate } from '../../utils/date';
import { Target, Sparkles, PlusCircle, AlertTriangle } from 'lucide-react';

/**
 * How the week is going against what was actually promised.
 *
 * My Work was a flat list of every open task, which answered "what exists" and
 * never "am I keeping the promise". Those are different questions, and only the
 * second one is what a finalised plan is for - a baseline nobody is shown is
 * just a row in a table.
 *
 * Two numbers, deliberately kept apart. Committed work is the promise, and
 * finishing it is where the week's bonus comes from. Extra work is anything
 * pulled from the backlog on top, paid separately and at a lower rate, so that
 * hoovering up easy items can never look better than keeping the commitment.
 */
export const WeekCommitmentBanner: React.FC = () => {
  const weekStart = weekStartISO();
  const execution = useLiveQuery(() => weekExecution(weekStart), [weekStart]);
  const baseline = useLiveQuery(() => db.planBaselines.get(weekStart), [weekStart]);

  if (!execution) return null;

  const weekEnd = addDaysISO(6, parseISODate(weekStart));

  /**
   * Nothing agreed yet. Said plainly rather than shown as "0 of 0", which reads
   * as a week going perfectly when it is in fact a week nobody has planned.
   */
  if (!baseline || baseline.status !== 'BASELINED' || execution.committed === 0) {
    return (
      <div className="glass-card p-4 border-amber-500/40 bg-amber-950/20">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-amber-100">
              Nothing agreed for this week yet
            </h3>
            <p className="text-[11px] text-amber-100/80 mt-0.5">
              {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}. Work done still earns its
              own XP, but a week with no agreed plan earns no execution bonus — there is nothing
              to have kept.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const pct = execution.committed
    ? Math.round((execution.delivered / execution.committed) * 100)
    : 0;
  const onTrack = pct >= 50;

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            <Target className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">What you promised this week</h3>
            <p className="text-[11px] text-slate-400">
              {formatShortDate(weekStart)} – {formatShortDate(weekEnd)} · agreed and baselined
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-lg font-bold text-white leading-none">
            {execution.delivered}
            <span className="text-slate-500 text-sm"> / {execution.committed}</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">committed work done</p>
        </div>
      </div>

      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            onTrack ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
          <p className="text-[10px] text-slate-400">Keeping the promise</p>
          <p className="text-[11px] text-slate-200 font-semibold">
            Up to +{XP_WEEK_BONUS_MAX} XP when the week closes
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {/* The rule, stated where it is earned. It is the whole reason the
                bonus is a bonus rather than a penalty. */}
            Scaled by how much you finish. A quiet week earns less — it never costs you XP.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <PlusCircle className="w-3 h-3" />
            Pulled from the backlog
          </p>
          <p className="text-[11px] text-slate-200 font-semibold">
            {execution.extra} extra · +{execution.extraXp} XP
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            +{XP_EXTRA_STORY} XP each, on top, once the promise is kept.
          </p>
        </div>
      </div>

      {execution.occurrencesExpected > 0 && (
        <p className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-fuchsia-300" />
          {execution.occurrencesAnswered} of {execution.occurrencesExpected} check-ins answered this
          week — the evidence behind the score.
        </p>
      )}
    </div>
  );
};

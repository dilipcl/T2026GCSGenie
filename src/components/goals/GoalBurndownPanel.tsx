import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BurndownStatus,
  GoalBurndown,
  MIN_WEEKS_FOR_CHART,
  portfolioBurndown,
} from '../../services/goalBurndown';
import { BurndownChart } from './BurndownChart';
import { TrendingDown, ChevronDown, ChevronRight, Info } from 'lucide-react';

/**
 * Target against actual, for the whole plan and for each goal in it.
 *
 * The holistic view leads because it is the question that gets asked - "is he
 * doing enough?" is about the plan, not about goal number three. Individual
 * goals are underneath, collapsed, because they are the follow-up: once the
 * total is behind, the next question is which part of it.
 *
 * Every empty state here is deliberate and different. A screen that says
 * "no data" for four distinct situations - nothing approved, nothing budgeted,
 * nothing logged, not enough weeks - teaches people that the screen is broken.
 * Each of those has a different fix, so each says which one it is.
 */

const STATUS: Record<BurndownStatus, { label: string; className: string }> = {
  NOT_STARTED: { label: 'Just started', className: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  ON_TRACK: { label: 'On track', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  SLIPPING: { label: 'Slipping', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  BEHIND: { label: 'Behind', className: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  DONE: { label: 'Done', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  OVERDUE: { label: 'Past its date', className: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

const Stat: React.FC<{ label: string; value: string; tone?: string }> = ({
  label,
  value,
  tone = 'text-white',
}) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</p>
    <p className={`text-lg font-bold tabular-nums ${tone}`}>{value}</p>
  </div>
);

const hrs = (n: number) => `${n} h`;

/** "12 hours behind" / "2 hours ahead" - never a bare signed number. */
function varianceSentence(variance: number): { text: string; tone: string } {
  if (variance >= 0) {
    return { text: `${hrs(variance)} ahead of plan`, tone: 'text-emerald-400' };
  }
  return { text: `${hrs(Math.abs(variance))} behind plan`, tone: 'text-rose-400' };
}

const GoalRow: React.FC<{ item: GoalBurndown }> = ({ item }) => {
  const [open, setOpen] = useState(false);
  const status = STATUS[item.status];
  const variance = varianceSentence(item.varianceHours);
  const promised = item.goal.weeklyHoursRequired;
  const needsMore = item.requiredHoursPerWeek > promised;

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-800/40 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{item.goal.title}</p>
          <p className={`text-[11px] font-semibold ${variance.tone}`}>
            {variance.text}
            <span className="text-slate-500 font-normal">
              {' '}
              — {hrs(item.loggedHours)} done of {hrs(item.plannedToDateHours)} expected so far
            </span>
          </p>
        </div>

        <span
          className={`px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${status.className}`}
        >
          {status.label}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-800/80 pt-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Committed" value={hrs(item.committedHours)} />
            <Stat label="Done" value={hrs(item.loggedHours)} />
            <Stat label="Weeks left" value={String(item.weeksRemaining)} />
            <Stat
              label="Needed / week"
              value={item.weeksRemaining > 0 ? hrs(item.requiredHoursPerWeek) : '—'}
              tone={needsMore ? 'text-amber-400' : 'text-emerald-400'}
            />
          </div>

          {/* The one sentence worth acting on, spelled out rather than left as
              a comparison between two numbers in a grid. */}
          {item.weeksRemaining > 0 && needsMore && (
            <p className="text-[11px] text-amber-300 leading-snug">
              Finishing on time now takes{' '}
              <span className="font-bold">{hrs(item.requiredHoursPerWeek)} a week</span>, against
              the {hrs(promised)} originally planned. Either the hours go up or the goal moves.
            </p>
          )}

          {item.isUnattributable && (
            <p className="text-[11px] text-amber-300 leading-snug">
              This goal has no subject, so study time can never be counted against it. Give it a
              subject, or log sessions against the goal directly.
            </p>
          )}

          <BurndownChart points={item.points} committedHours={item.committedHours} height={120} />
        </div>
      )}
    </div>
  );
};

export const GoalBurndownPanel: React.FC = () => {
  const report = useLiveQuery(() => portfolioBurndown(), []);
  if (!report) return null;

  const { goals, unattributedHours, goalsWithoutBudget } = report;

  /**
   * Nothing approved. This is the family's actual position, and it is not a
   * failure of the chart - it is the step before the chart.
   */
  if (goals.length === 0) {
    return (
      <div className="glass-card p-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1.5">
          <TrendingDown className="w-4 h-4 text-indigo-400" />
          Target vs actual
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Nothing to plot yet. A burn-down measures hours actually done against hours committed,
          and hours are only committed once a goal is <span className="font-bold">approved</span> —
          a goal still under discussion is a proposal, not a promise.
          {goalsWithoutBudget > 0 && (
            <>
              {' '}
              {goalsWithoutBudget} approved goal{goalsWithoutBudget === 1 ? ' has' : 's have'} no
              weekly hours set, so there is nothing to burn down there either.
            </>
          )}
        </p>
        {unattributedHours > 0 && (
          <p className="text-xs text-amber-300 leading-relaxed mt-2">
            {hrs(unattributedHours)} of study is already logged but tagged to no goal. It is real
            work — it just cannot be credited anywhere until goals are approved.
          </p>
        )}
      </div>
    );
  }

  const variance = varianceSentence(report.varianceHours);
  const percentDone =
    report.committedHours > 0
      ? Math.round((report.loggedHours / report.committedHours) * 100)
      : 0;

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-indigo-400" />
            Target vs actual — everything together
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Hours still owed across {goals.length} approved goal{goals.length === 1 ? '' : 's'}.
            The dashed line is the plan; the solid line is what has happened.
          </p>
        </div>
        <p className={`text-sm font-bold ${variance.tone}`}>{variance.text}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Committed" value={hrs(report.committedHours)} />
        <Stat label="Done" value={hrs(report.loggedHours)} />
        <Stat label="Expected by now" value={hrs(report.plannedToDateHours)} />
        <Stat label="Of the plan" value={`${percentDone}%`} />
      </div>

      {report.hasEnoughData ? (
        <BurndownChart points={report.points} committedHours={report.committedHours} />
      ) : (
        /* Two weeks of history is the floor. Below it the "trend" is one point
           and a straight line to it, which reads as a finding when it is an
           accident of the start date. */
        <p className="text-xs text-slate-400 bg-slate-900/70 border border-slate-800 rounded-xl p-3 leading-relaxed flex gap-2">
          <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <span>
            The totals above are live, but the chart needs {MIN_WEEKS_FOR_CHART} finished weeks of
            logged study before it says anything true — there {report.weeksOfHistory === 1 ? 'is' : 'are'}{' '}
            {report.weeksOfHistory}. It will draw itself once the weeks are there.
          </span>
        </p>
      )}

      {unattributedHours > 0 && (
        <p className="text-[11px] text-amber-300 leading-snug">
          {hrs(unattributedHours)} logged against no approved goal, so it is missing from the solid
          line above. Tagging a session to a subject or a goal is what puts it on the chart.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
          Goal by goal
        </p>
        {goals.map((item) => (
          <GoalRow key={item.goal.id} item={item} />
        ))}
      </div>
    </div>
  );
};

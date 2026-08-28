import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { calculateBurnoutCapacity } from '../../services/burnoutEngine';
import { ShieldAlert, AlertTriangle, BatteryCharging, Info } from 'lucide-react';
import { InfoTip } from '../shared/InfoTip';

interface BurnoutAlertBannerProps {
  refreshKey?: number;
}

export const BurnoutAlertBanner: React.FC<BurnoutAlertBannerProps> = () => {
  const burnout = useLiveQuery(() => calculateBurnoutCapacity(), []);

  if (!burnout) return null;

  const getStatusColor = () => {
    if (burnout.stressStatus === 'RED') return 'border-rose-500/60 bg-rose-950/20 text-rose-300';
    if (burnout.stressStatus === 'AMBER') return 'border-amber-500/60 bg-amber-950/20 text-amber-300';
    return 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300';
  };

  const getProgressBarColor = () => {
    if (burnout.stressStatus === 'RED') return 'bg-rose-500';
    if (burnout.stressStatus === 'AMBER') return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className={`p-4 rounded-2xl border ${getStatusColor()} backdrop-blur-md`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {burnout.stressStatus === 'RED' ? (
            <ShieldAlert className="w-5 h-5 text-rose-400 animate-bounce" />
          ) : burnout.stressStatus === 'AMBER' ? (
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          ) : (
            <BatteryCharging className="w-5 h-5 text-emerald-400" />
          )}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
              <span>This Week's Workload ({burnout.stressIndex}%)</span>
              <InfoTip label="Workload">
                Everything on your plate this week - school, clubs and study. The buffer is how much
                room is left before it is too much.
              </InfoTip>
            </h4>
            <p className="text-[11px] text-slate-300">
              {burnout.totalScheduledHours} hrs total / {burnout.safeWeeklyHoursLimit} hrs safe weekly
              threshold <span className="text-slate-400">(school hours included)</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700">
            {burnout.remainingSafeCapacity >= 0
              ? `${burnout.remainingSafeCapacity}h Safe Buffer`
              : `${Math.abs(burnout.remainingSafeCapacity)}h Over Limit!`}
          </span>
        </div>
      </div>

      {/* Progress Capacity Bar */}
      <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden mb-2.5 border border-slate-800">
        <div
          className={`h-full ${getProgressBarColor()} transition-all duration-500`}
          style={{ width: `${Math.min(100, burnout.stressIndex)}%` }}
        />
      </div>

      {/* Commitments Pill Breakdown */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
        {/* Driven by the commitments table rather than five hardcoded fields,
            so a commitment a parent adds or archives shows up here without a
            code change - and an excused occasion visibly reduces its pill
            instead of silently shrinking the total. */}
        {burnout.commitmentBreakdown.map((c) => (
          <span
            key={c.id}
            title={
              c.excusedHours > 0
                ? `${c.scheduledHours}h scheduled, ${c.excusedHours}h excused this week`
                : undefined
            }
            className={`px-2 py-0.5 rounded border ${
              c.excusedHours > 0
                ? 'bg-amber-950/50 border-amber-800 text-amber-300'
                : c.accentColor === 'purple'
                ? 'bg-purple-950/60 border-purple-800 text-purple-300'
                : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            {c.label}: {c.netHours}h
            {c.excusedHours > 0 && (
              <span className="ml-1 opacity-80">(−{c.excusedHours}h excused)</span>
            )}
          </span>
        ))}
        {burnout.customGoalsHours > 0 && (
          <span className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-800">
            Other Goals: {burnout.customGoalsHours}h
          </span>
        )}
        <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300">
          Study Logged: {burnout.loggedRevisionHours}h
        </span>
      </div>

      {/* Warning or MoSCoW Guidance */}
      {burnout.warningMessage && (
        <div className="mt-2.5 p-2 bg-slate-900/90 rounded-xl border border-slate-800 text-[11px] text-slate-300 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-300">{burnout.warningMessage}</p>
            {burnout.moscowRecommendations.length > 0 && (
              <p className="text-[10px] text-slate-400 mt-0.5">
                💡 MoSCoW Rule: {burnout.moscowRecommendations[0]}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

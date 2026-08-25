import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { readPlanPulse, checkStreakRepair } from '../../services/breakEngine';
import { Flame, TrendingDown, Coffee } from 'lucide-react';

interface PlanPulseBannerProps {
  onOpenCheckIn: () => void;
}

/**
 * The three quiet failure modes, surfaced only when they apply.
 *
 * The app already shouts when the week is too full. These are the opposite:
 * a streak about to lapse, a plan evaporating, or rest quietly displacing the
 * study it was meant to punctuate. All three are phrased as an offer of the
 * smallest next step, because a nudge that reads as a telling-off gets the app
 * closed - which costs more than the missed session.
 *
 * Renders nothing when there is nothing to say. A banner that is always there
 * stops being read.
 */
export const PlanPulseBanner: React.FC<PlanPulseBannerProps> = ({ onOpenCheckIn }) => {
  const pulse = useLiveQuery(() => readPlanPulse(), []);
  const repair = useLiveQuery(() => checkStreakRepair(), []);

  const showRepair = repair?.available;
  const showPulse = pulse?.slipping || pulse?.breaksEatingThePlan;
  if (!showRepair && !showPulse) return null;

  return (
    <div className="space-y-3">
      {showRepair && (
        <div className="p-4 rounded-2xl border border-amber-500/50 bg-amber-950/25 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Flame className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-amber-200">
                Your {repair.currentStreak}-day streak is still alive
              </h3>
              <p className="text-[11px] text-amber-100/90 mt-0.5 max-w-lg">
                You missed yesterday. Check in today and the run continues — one missed day never
                resets it, only two in a row do.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenCheckIn}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all"
          >
            Save it — 2 minutes
          </button>
        </div>
      )}

      {pulse?.slipping && (
        <div className="p-4 rounded-2xl border border-amber-500/40 bg-slate-900/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <TrendingDown className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-white">The plan is slipping</h3>
              <p className="text-[11px] text-slate-300 mt-0.5 max-w-lg">{pulse.message}</p>
            </div>
          </div>
        </div>
      )}

      {pulse?.breaksEatingThePlan && !pulse.slipping && (
        <div className="p-4 rounded-2xl border border-teal-500/40 bg-slate-900/70 flex items-start gap-3">
          <Coffee className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-white">Breaks are eating the plan</h3>
            <p className="text-[11px] text-slate-300 mt-0.5 max-w-lg">{pulse.message}</p>
          </div>
        </div>
      )}
    </div>
  );
};

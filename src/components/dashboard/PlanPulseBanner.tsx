import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { readPlanPulse, checkStreakRepair } from '../../services/breakEngine';
import { goalsNeedingAction } from '../../services/goalProgress';
import { readEnergySignal } from '../../services/energySignal';
import { messageContext, needSupportMessage } from '../../services/whatsappService';
import { WhatsAppShare } from '../shared/WhatsAppShare';
import { readFinalisationState } from '../../services/planBaselineService';
import { Flame, TrendingDown, Coffee, Target, BatteryLow, ClipboardList } from 'lucide-react';

interface PlanPulseBannerProps {
  onOpenCheckIn: () => void;
  /** Optional: lets the nudge send them to the goal it is about. */
  onOpenGoals?: () => void;
  /** Where "make this week smaller" goes - the planner's commitment column. */
  onOpenPlan?: () => void;
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
export const PlanPulseBanner: React.FC<PlanPulseBannerProps> = ({
  onOpenCheckIn,
  onOpenGoals,
  onOpenPlan,
}) => {
  const pulse = useLiveQuery(() => readPlanPulse(), []);
  const repair = useLiveQuery(() => checkStreakRepair(), []);
  const behindGoals = useLiveQuery(() => goalsNeedingAction(), [], []);
  const energy = useLiveQuery(() => readEnergySignal(), []);
  const settings = useLiveQuery(() => db.parentSettings.get('active_settings'), []);
  const finalisation = useLiveQuery(() => readFinalisationState(), []);

  const showRepair = repair?.available;
  const showPulse = pulse?.slipping || pulse?.breaksEatingThePlan;
  const showGoals = behindGoals.length > 0;
  const showEnergy = energy?.isLow;
  const nudge = finalisation?.nudge;
  if (!showRepair && !showPulse && !showGoals && !showEnergy && !nudge) return null;

  return (
    <div className="space-y-3">
      {/* Finalising the week comes before every nudge about how it is going.

          A week nobody has agreed to is a week where "committed" means only
          "currently in the left-hand column" - so the slipping warning, the
          load bar and the goal pacing are all measuring against a plan that can
          be rewritten to match whatever happened. Settle what the week is
          first; then the rest of these mean something. */}
      {nudge && (
        <div
          className={`p-4 rounded-2xl border ${
            nudge.tone === 'URGENT'
              ? 'border-amber-500/50 bg-amber-950/25'
              : 'border-indigo-500/40 bg-indigo-950/25'
          }`}
        >
          <div className="flex items-start gap-3">
            <ClipboardList
              className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                nudge.tone === 'URGENT' ? 'text-amber-300' : 'text-indigo-300'
              }`}
            />
            <div className="min-w-0">
              <h3
                className={`text-sm font-bold ${
                  nudge.tone === 'URGENT' ? 'text-amber-100' : 'text-indigo-100'
                }`}
              >
                {nudge.headline}
              </h3>
              <p className="text-[11px] text-slate-200/90 mt-0.5 max-w-lg leading-snug">
                {nudge.body}
              </p>

              {/* Named, not counted. "3 steps" sends you looking; the steps
                  themselves tell you what to do before you get there. */}
              {nudge.outstanding > 0 && finalisation && (
                <ul className="mt-2 space-y-0.5">
                  {finalisation.checks
                    .filter((c) => !c.ok && c.blocking)
                    .map((c) => (
                      <li key={c.id} className="text-[11px] text-slate-300/90 leading-snug">
                        · {c.label}
                      </li>
                    ))}
                </ul>
              )}

              {onOpenPlan && nudge.tone !== 'INFO' && (
                <button
                  onClick={onOpenPlan}
                  className="mt-2.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-all"
                >
                  Open the plan
                </button>
              )}
              {onOpenPlan && nudge.tone === 'INFO' && nudge.headline !== 'Waiting on a parent' && (
                <button
                  onClick={onOpenPlan}
                  className="mt-2.5 px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-[11px] transition-all"
                >
                  Open the plan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Running on empty comes first. The other three nudges all ask for more
          effort; this one is the only one that offers to ask for less, and
          putting it under them would be telling someone who is exhausted to
          catch up before admitting they are exhausted. */}
      {showEnergy && energy && (
        <div className="p-4 rounded-2xl border border-teal-500/50 bg-teal-950/25">
          <div className="flex items-start gap-3">
            <BatteryLow className="w-5 h-5 text-teal-300 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-teal-100">Running on empty</h3>
              <p className="text-[11px] text-teal-50/90 mt-0.5 max-w-lg">{energy.message}</p>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {onOpenPlan && (
                  <button
                    onClick={onOpenPlan}
                    className="px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-[11px] transition-all"
                  >
                    Make this week smaller
                  </button>
                )}
              </div>

              {/* The film's scene 20: "asking us for support when it gets too
                  heavy". Composed, shown, and sent only on a tap. */}
              <div className="mt-2.5">
                <WhatsAppShare
                  compact
                  previewLabel="See the message"
                  text={needSupportMessage(messageContext(settings), {
                    averageEnergy: energy.averageEnergy,
                    lowCount: energy.lowCount,
                    sampleSize: energy.sampleSize,
                  })}
                />
              </div>
            </div>
          </div>
        </div>
      )}
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

      {/* A locked goal reserving hours nobody has worked. Only fires from
          Wednesday - being "behind" on a weekly budget at Monday breakfast is
          arithmetically true and completely useless. */}
      {showGoals && (
        <div className="p-4 rounded-2xl border border-amber-500/40 bg-slate-900/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Target className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-white">
                {behindGoals.length === 1
                  ? `${behindGoals[0].goal.title} needs action`
                  : `${behindGoals.length} goals need action`}
              </h3>
              <p className="text-[11px] text-slate-300 mt-0.5 max-w-lg">
                {behindGoals
                  .slice(0, 3)
                  .map(
                    (p) =>
                      `${p.goal.title} ${p.actualHours}/${p.targetHours}h logged this week`
                  )
                  .join(' · ')}
                {behindGoals.length > 3 ? ' · and more' : ''}
              </p>
            </div>
          </div>
          {onOpenGoals && (
            <button
              onClick={onOpenGoals}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-all"
            >
              See goals
            </button>
          )}
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

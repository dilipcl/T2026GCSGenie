import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RAGStatus } from '../../types';
import { HealthSignal, readWeekHealth } from '../../services/weekHealth';
import { InfoTip } from '../shared/InfoTip';
import { ChevronDown, ChevronRight, Activity } from 'lucide-react';

const TONE: Record<RAGStatus, { ring: string; text: string; dot: string; label: string }> = {
  GREEN: {
    ring: 'border-emerald-500/50 bg-emerald-950/20',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
    label: 'Green',
  },
  AMBER: {
    ring: 'border-amber-500/50 bg-amber-950/20',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
    label: 'Amber',
  },
  RED: {
    ring: 'border-rose-500/50 bg-rose-950/20',
    text: 'text-rose-300',
    dot: 'bg-rose-400',
    label: 'Red',
  },
};

interface Props {
  onOpenPlan?: () => void;
  onOpenGoals?: () => void;
}

/**
 * How the week is going, in one letter.
 *
 * Every number in here already existed on some screen and none of them were
 * ever added up, so the question a parent actually asks on a Wednesday - is
 * this week going well or not - had no answer anywhere in the app.
 *
 * The letter is never shown on its own. The signals sit directly under it, and
 * the ones that are not green are open by default: a score you cannot take
 * apart is a score nobody believes, and an unbelieved score is worse than none
 * because it still gets argued about. The sentence names the biggest problem
 * rather than describing the colour, because "amber" tells nobody what to do.
 */
export const WeekHealthCard: React.FC<Props> = ({ onOpenPlan, onOpenGoals }) => {
  const health = useLiveQuery(() => readWeekHealth(), []);
  const [expanded, setExpanded] = useState(false);

  if (!health) return null;

  const tone = TONE[health.status];
  // Anything not green is worth reading without a tap; a clean week can stay
  // folded away, because there is nothing in it to act on.
  const showSignals = expanded || health.concerns.length > 0;

  const Row: React.FC<{ signal: HealthSignal }> = ({ signal }) => {
    const rowTone = TONE[signal.status];
    return (
      <li className="flex items-start gap-2.5 py-1.5">
        <span
          aria-hidden="true"
          className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
            signal.notApplicable ? 'bg-slate-600' : rowTone.dot
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-white leading-snug">
            {signal.label}
            {signal.notApplicable && (
              <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                not counted
              </span>
            )}
          </p>
          <p className="text-[11px] text-slate-400 leading-snug">{signal.detail}</p>
        </div>
        {/* Screen readers get the status as a word; the dot is decoration. */}
        <span className="sr-only">
          {signal.notApplicable ? 'not counted' : rowTone.label}
        </span>
      </li>
    );
  };

  return (
    <div className={`glass-card p-5 border ${tone.ring}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Activity className={`w-4 h-4 ${tone.text}`} />
            <span>This week&rsquo;s health</span>
            <InfoTip label="How this is worked out">
              Six signals — effort against your goals, goals at risk, work promised, whether the
              week was agreed, whether the goals are finalised, and the workload — weighted and
              averaged. Anything red keeps the week off green, and two red things make it red
              whatever the average says. Targets are pro-rated by the day, so nothing is judged
              against a full week on Tuesday morning.
            </InfoTip>
          </h3>
          <p className="text-[11px] text-slate-300 mt-1 max-w-lg leading-snug">
            {health.headline}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className={`text-2xl font-bold leading-none ${tone.text}`}>{health.score}%</p>
          <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${tone.text}`}>
            {tone.label}
          </p>
        </div>
      </div>

      {showSignals && (
        <ul className="mt-3 pt-3 border-t border-slate-800 divide-y divide-slate-800/70">
          {(expanded ? health.signals : health.concerns).map((signal) => (
            <Row key={signal.id} signal={signal} />
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-bold transition-colors"
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span>{expanded ? 'Show less' : 'All six signals'}</span>
        </button>

        {/* Sent where the biggest problem actually lives, rather than offering
            both links every time and making the reader choose. */}
        {health.concerns[0] &&
          (health.concerns[0].id === 'WEEK_TARGET' ||
          health.concerns[0].id === 'COMMITMENT_KEPT' ? (
            onOpenPlan && (
              <button
                onClick={onOpenPlan}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition-colors"
              >
                Open the plan
              </button>
            )
          ) : (
            onOpenGoals && (
              <button
                onClick={onOpenGoals}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition-colors"
              >
                Open goals
              </button>
            )
          ))}
      </div>
    </div>
  );
};

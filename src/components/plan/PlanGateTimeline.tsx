import React from 'react';
import { GateState, PlanGate } from '../../services/planGates';
import { formatShortDate } from '../../utils/date';
import { Check, Circle, AlertTriangle, Clock, XCircle } from 'lucide-react';

/**
 * Where the week stands, and where it should have been by now.
 *
 * The planner used to show a status word and nothing else, so a week could sit
 * in draft for a fortnight without any screen suggesting that was unusual.
 * Tejas lost a week that way while he was still learning the app.
 *
 * The fix is to put the dates on screen rather than only in the rules. Each
 * gate names the day it should be through by, and once it is through, the day
 * it actually happened - side by side, because the gap between the two is the
 * only part that teaches anything. A gate passed two days late still says so
 * after the tick goes green.
 */

const STATE_STYLE: Record<GateState, { ring: string; text: string; chip: string; label: string }> = {
  DONE: {
    ring: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    text: 'text-emerald-300',
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    label: 'Done',
  },
  DUE: {
    ring: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
    text: 'text-amber-300',
    chip: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    label: 'Due today',
  },
  LATE: {
    ring: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
    text: 'text-rose-300',
    chip: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
    label: 'Late',
  },
  MISSED: {
    ring: 'bg-slate-800 border-slate-700 text-slate-500',
    text: 'text-slate-500',
    chip: 'bg-slate-800 text-slate-500 border-slate-700',
    label: 'Missed',
  },
  OPEN: {
    ring: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300',
    text: 'text-indigo-300',
    chip: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    label: 'Open now',
  },
  UPCOMING: {
    ring: 'bg-slate-900 border-slate-700 text-slate-500',
    text: 'text-slate-500',
    chip: 'bg-slate-900 text-slate-500 border-slate-700',
    label: 'Not yet',
  },
};

const STATE_ICON: Record<GateState, React.ElementType> = {
  DONE: Check,
  DUE: Clock,
  LATE: AlertTriangle,
  MISSED: XCircle,
  OPEN: Circle,
  UPCOMING: Circle,
};

/** Always a calendar date. A window reading "Today – Monday" cannot be compared
    against an actual date, and means something different tomorrow. */
const shortDate = formatShortDate;

export const PlanGateTimeline: React.FC<{ gates: PlanGate[] }> = ({ gates }) => (
  <div className="glass-card p-4">
    <div className="flex items-baseline justify-between gap-2 mb-3">
      <h3 className="text-xs font-bold text-white">How this week gets agreed</h3>
      <span className="text-[10px] text-slate-500">planned date vs what happened</span>
    </div>

    <ol className="space-y-1.5">
      {gates.map((gate, index) => {
        const style = STATE_STYLE[gate.state];
        const Icon = STATE_ICON[gate.state];

        return (
          <li key={gate.id} className="flex gap-2.5">
            {/* The rail: a marker per gate, joined so the four read as one
                sequence rather than four unrelated rows. */}
            <div className="flex flex-col items-center shrink-0">
              <span
                className={`w-6 h-6 rounded-full border flex items-center justify-center ${style.ring}`}
              >
                <Icon className="w-3 h-3" />
              </span>
              {index < gates.length - 1 && <span className="w-px flex-1 bg-slate-700 my-0.5" />}
            </div>

            <div className="min-w-0 flex-1 pb-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[11px] font-bold text-white">{gate.label}</span>
                <span
                  className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${style.chip}`}
                >
                  {style.label}
                  {gate.daysLate !== undefined && ` · ${gate.daysLate}d`}
                </span>
              </div>

              <p className="text-[10px] text-slate-400 mt-0.5">{gate.blurb}</p>

              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px]">
                <span className="text-slate-500">
                  Planned{' '}
                  <span className="text-slate-300">
                    {gate.idealStart === gate.idealEnd
                      ? shortDate(gate.idealEnd)
                      : `${shortDate(gate.idealStart)} – ${shortDate(gate.idealEnd)}`}
                  </span>
                </span>

                {gate.actualOn ? (
                  <span className="text-slate-500">
                    Actual <span className={style.text}>{shortDate(gate.actualOn)}</span>
                  </span>
                ) : (
                  <span className="text-slate-600">Actual —</span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  </div>
);

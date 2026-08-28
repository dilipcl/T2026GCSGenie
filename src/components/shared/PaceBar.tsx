import React from 'react';
import { GoalPace } from '../../services/goalProgress';

interface PaceBarProps {
  /** 0-100, how much of the weekly budget is done. */
  percent: number;
  /** 0-100, where the share due by the end of today sits on the same scale. */
  proRatedPercent: number;
  pace: GoalPace;
  /** Hides the marker for a goal with no budget to pro-rate. */
  showMarker?: boolean;
  className?: string;
}

const FILL: Record<GoalPace, string> = {
  AHEAD: 'bg-emerald-500',
  BEHIND: 'bg-amber-500',
  STALLED: 'bg-rose-500',
};

export const PACE_TEXT: Record<GoalPace, string> = {
  AHEAD: 'text-emerald-300',
  BEHIND: 'text-amber-300',
  STALLED: 'text-rose-300',
};

/**
 * A weekly budget bar with the pro-rated pace marked on it.
 *
 * The expected-by-today figure was already computed and was only ever shown as
 * a sentence underneath, and only once the goal was already behind. Putting it
 * on the bar means the question the film asks at scene 16 - "by Wednesday it
 * knows if it's actually getting them" - is answered by looking, not by
 * reading.
 */
export const PaceBar: React.FC<PaceBarProps> = ({
  percent,
  proRatedPercent,
  pace,
  showMarker = true,
  className = '',
}) => (
  <div
    className={`relative w-full h-2 bg-slate-800 rounded-full overflow-hidden ${className}`}
  >
    <div
      className={`h-full ${FILL[pace]} transition-all duration-500`}
      style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
    />

    {/* The marker sits above the fill rather than inside it, so it stays
        visible when the bar has overtaken it - which is the good case and
        should still be legible. */}
    {showMarker && proRatedPercent > 0 && proRatedPercent < 100 && (
      <span
        aria-hidden="true"
        className="absolute top-0 bottom-0 w-0.5 bg-slate-100/70"
        style={{ left: `${Math.min(100, proRatedPercent)}%` }}
      />
    )}
  </div>
);

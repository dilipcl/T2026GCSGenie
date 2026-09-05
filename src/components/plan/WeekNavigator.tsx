import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { weekExecution } from '../../services/weekExecution';
import { addDaysISO, formatShortDate, parseISODate, todayISO } from '../../utils/date';
import { ChevronLeft, ChevronRight, RotateCcw, Sparkles } from 'lucide-react';

/**
 * Stepping through weeks, and saying how each one went.
 *
 * The plan could only ever show the current week, which made the most useful
 * question in the whole app unanswerable: how did last week actually go? A
 * promise nobody can look back at is not a promise, it is a to-do list that
 * resets on Mondays.
 *
 * Every week is named by its dates rather than by a relative word. "Next week"
 * is ambiguous on a Sunday and means something different tomorrow; "8 Sep - 14
 * Sep" cannot be misread, and it is what a parent and a student need to be
 * looking at the same thing.
 */

interface WeekNavigatorProps {
  /** The Monday of the week being looked at. */
  weekStart: string;
  onChange: (weekStart: string) => void;
  onToday: () => void;
}

export const WeekNavigator: React.FC<WeekNavigatorProps> = ({ weekStart, onChange, onToday }) => {
  const weekEnd = addDaysISO(6, parseISODate(weekStart));
  const thisWeek = weekStart <= todayISO() && todayISO() <= weekEnd;
  const isPast = weekEnd < todayISO();

  const execution = useLiveQuery(() => weekExecution(weekStart), [weekStart]);

  const step = (weeks: number) => onChange(addDaysISO(weeks * 7, parseISODate(weekStart)));

  return (
    <div className="glass-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => step(-1)}
            title="The week before"
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="px-2 min-w-0">
            <p className="text-[11px] font-bold text-white">
              {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
            </p>
            <p className="text-[10px] text-slate-400">
              {thisWeek ? 'This week' : isPast ? 'Finished' : 'Still to come'}
            </p>
          </div>

          <button
            onClick={() => step(1)}
            title="The week after"
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {!thisWeek && (
            <button
              onClick={onToday}
              className="ml-1 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Today
            </button>
          )}
        </div>

        {/* How the week went, but only once it is over. A score on a week still
            being lived reads as a verdict on an unfinished job. */}
        {execution && isPast && execution.wasBaselined && (
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-slate-400">
              {execution.delivered} of {execution.committed} delivered
              {execution.extra > 0 && ` · ${execution.extra} extra`}
            </span>
            <span
              className={`px-2 py-1 rounded-lg font-bold ${
                execution.bonusXp > 0
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {execution.score}%
            </span>
            {execution.bonusXp + execution.extraXp > 0 && (
              <span className="flex items-center gap-1 text-fuchsia-200 font-bold">
                <Sparkles className="w-3 h-3" />+{execution.bonusXp + execution.extraXp} XP
              </span>
            )}
          </div>
        )}

        {execution && isPast && !execution.wasBaselined && (
          <span className="text-[10px] text-slate-500">
            Never finalised — no bonus was earned for it.
          </span>
        )}
      </div>
    </div>
  );
};

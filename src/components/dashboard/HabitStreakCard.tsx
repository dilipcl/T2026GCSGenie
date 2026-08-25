import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  calculateStreakStats,
  calculateEffortStats,
  buildCheckInHeatmap,
  HeatmapDay,
} from '../../services/habitEngine';
import { Flame, AlertTriangle, Trophy, Clock, CheckCheck } from 'lucide-react';

interface HabitStreakCardProps {
  refreshKey?: number;
  onOpenCheckIn: () => void;
}

const LEVEL_STYLES: Record<HeatmapDay['level'], string> = {
  0: 'bg-slate-800/70',
  1: 'bg-emerald-900',
  2: 'bg-emerald-700',
  3: 'bg-emerald-500',
};

export const HabitStreakCard: React.FC<HabitStreakCardProps> = ({
  onOpenCheckIn,
}) => {
  const streak = useLiveQuery(() => calculateStreakStats(), []);
  const effort = useLiveQuery(() => calculateEffortStats(), []);
  const heatmap = useLiveQuery(() => buildCheckInHeatmap(12), []) ?? [];

  if (!streak || !effort) return null;

  // Chunk the flat day list into week columns (each column is Mon..Sun)
  const weeks: HeatmapDay[][] = [];
  for (let i = 0; i < heatmap.length; i += 7) {
    weeks.push(heatmap.slice(i, i + 7));
  }

  const hasHistory = streak.totalDays > 0;

  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
              streak.atRisk
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
            }`}
          >
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white">{streak.current}</span>
              <span className="text-sm font-semibold text-slate-300">
                day{streak.current === 1 ? '' : ''} streak
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {streak.doneToday
                ? 'Checked in today. Nice.'
                : streak.current > 0
                ? 'Check in today to keep it going'
                : hasHistory
                ? 'Start a new run today'
                : 'Your first check-in starts the streak'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <span className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Best <strong className="text-white">{streak.best}</strong>
            </span>
          </span>
          <span className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              <strong className="text-white">{streak.totalDays}</strong> days total
            </span>
          </span>
          <span className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              <strong className="text-white">{effort.hoursLogged}h</strong> studied
            </span>
          </span>
        </div>
      </div>

      {/* The one nudge that decides whether the habit survives */}
      {streak.atRisk && (
        <button
          onClick={onOpenCheckIn}
          className="w-full mb-4 p-3 bg-amber-950/50 border border-amber-500/50 rounded-xl flex items-start gap-2.5 text-left hover:bg-amber-950/70 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-200">
              You missed yesterday. Don't miss twice.
            </p>
            <p className="text-[11px] text-amber-300/80 mt-0.5">
              Missing one day is nothing. Missing two is how a habit dies. Two minutes now keeps
              your {streak.current}-day run alive.
            </p>
          </div>
        </button>
      )}

      {streak.graceDaysUsed > 0 && !streak.atRisk && (
        <p className="text-[11px] text-slate-400 mb-3">
          {streak.graceDaysUsed} missed {streak.graceDaysUsed === 1 ? 'day' : 'days'} absorbed in
          this run — you came straight back, so the chain held.
        </p>
      )}

      {/* Don't break the chain */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-[3px] min-w-max">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day) => (
                <div
                  key={day.date}
                  title={
                    day.isFuture
                      ? ''
                      : `${day.date} · ${day.checkIns} check-in${
                          day.checkIns === 1 ? '' : 's'
                        } · ${day.minutes} min`
                  }
                  className={`w-[11px] h-[11px] rounded-[3px] ${
                    day.isFuture ? 'bg-slate-900/40' : LEVEL_STYLES[day.level]
                  } ${day.isToday ? 'ring-1 ring-indigo-400' : ''}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-800">
        {/* Identity beats outcome: a missed day is one lost vote, not a failed target */}
        <p className="text-[11px] text-slate-300">
          <strong className="text-indigo-300">{effort.votes}</strong> votes cast for being someone
          who does the work
          <span className="text-slate-500">
            {' '}
            · {effort.tasksCompleted} tasks · {effort.questsCompleted} quests ·{' '}
            {effort.checkInDays} check-ins
          </span>
        </p>

        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span>Less</span>
          {([0, 1, 2, 3] as const).map((lvl) => (
            <span key={lvl} className={`w-[11px] h-[11px] rounded-[3px] ${LEVEL_STYLES[lvl]}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
};

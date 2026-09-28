import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Task } from '../../types';
import { formatShortDate } from '../../utils/date';
import { Wrench, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

/**
 * Fix My Mistakes, on Home: the open fix-ups, soonest first.
 *
 * This listed fix-up *quests*, a separate kind of record on a separate screen,
 * while fix-up *tasks* raised from marked papers never appeared here at all.
 * The quests are tasks now (`fixUpConversion`), so the card shows every fix-up
 * there is, and opens My Work on its fix-ups rather than on a screen of its own.
 */

interface ActiveQuestsCardProps {
  onOpenFixUps: () => void;
}

export const ActiveQuestsCard: React.FC<ActiveQuestsCardProps> = ({ onOpenFixUps }) => {
  const fixUps = useLiveQuery(
    async () =>
      (await db.tasks.orderBy('dueDate').toArray()).filter((t) => t.isRemediation && !t.completed),
    [],
    [] as Task[]
  );

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Fix My Mistakes</h3>
            <p className="text-[11px] text-slate-400">Marks you dropped, turned into practice</p>
          </div>
        </div>

        <span className="text-xs font-semibold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
          {fixUps.length} open
        </span>
      </div>

      {fixUps.length === 0 ? (
        <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
          <ShieldCheck className="w-6 h-6 text-emerald-400 mx-auto mb-1.5" />
          <p className="text-xs text-slate-300 font-medium">No fix-ups open.</p>
          <p className="text-[11px] text-slate-400">
            When a marked paper comes back, the questions that dropped marks land here.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {fixUps.slice(0, 3).map((fixUp) => (
            <button
              key={fixUp.id}
              type="button"
              onClick={onOpenFixUps}
              className="w-full text-left p-3 bg-slate-900/80 border border-slate-800/90 rounded-xl hover:border-amber-500/50 hover:bg-slate-800/80 transition-all group"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                  {fixUp.subjectId.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] font-bold text-amber-400 flex items-center gap-0.5">
                  <Sparkles className="w-3 h-3" />
                  <span>+{fixUp.xpValue} XP</span>
                </span>
              </div>

              <h4 className="text-xs font-bold text-slate-100 group-hover:text-amber-300 transition-colors">
                {fixUp.title}
              </h4>
              {fixUp.whatWentWrong && (
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                  What went wrong: {fixUp.whatWentWrong}
                </p>
              )}

              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-slate-800">
                {/* A date, not "in 3 weeks" - see formatShortDate. */}
                <span>due {formatShortDate(fixUp.dueDate)}</span>
                <span className="text-amber-400 font-medium flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                  <span>{fixUps.length > 3 ? `All ${fixUps.length} fix-ups` : 'Open fix-ups'}</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

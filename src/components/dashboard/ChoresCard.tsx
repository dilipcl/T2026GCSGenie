import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { choresForDay, setChoreDone } from '../../services/choreService';
import { useFeedback } from '../shared/FeedbackProvider';
import { Check, ListChecks } from 'lucide-react';

/**
 * Today's chores.
 *
 * Renders nothing at all when no chore falls due today - an empty card that
 * says "no chores" is one more thing to scroll past on the screen the app is
 * opened to read.
 *
 * One tap, no dialog, no confirmation. A chore that takes four minutes cannot
 * cost thirty seconds to log or it stops being logged.
 */
export const ChoresCard: React.FC = () => {
  const { toast } = useFeedback();
  const today = useLiveQuery(() => choresForDay(), []);

  if (!today || today.length === 0) return null;

  const done = today.filter((c) => c.done).length;
  const earned = today.filter((c) => c.done).reduce((sum, c) => sum + c.chore.xpValue, 0);
  const allDone = done === today.length;

  const toggle = async (index: number) => {
    const item = today[index];
    try {
      await setChoreDone(item.chore, !item.done);
      if (!item.done) {
        const remaining = today.length - done - 1;
        toast.success(
          `+${item.chore.xpValue} XP`,
          remaining === 0 ? 'That is every chore today.' : `${remaining} left today.`
        );
      }
    } catch (err) {
      console.error('Could not update chore:', err);
      toast.error('Could not save that', 'Nothing was changed.');
    }
  };

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center justify-center">
            <ListChecks className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Chores today</h2>
            <p className="text-[11px] text-slate-400">
              {allDone
                ? `All done — ${earned} XP earned`
                : `${done} of ${today.length} done${earned ? ` · ${earned} XP` : ''}`}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {today.map((item, i) => (
          <button
            key={item.chore.id}
            onClick={() => toggle(i)}
            aria-pressed={item.done}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
              item.done
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center border transition-all ${
                item.done
                  ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                  : 'border-slate-600 bg-slate-900'
              }`}
            >
              {item.done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            </span>

            <span
              className={`flex-1 text-xs font-semibold ${
                item.done ? 'text-slate-400 line-through' : 'text-slate-100'
              }`}
            >
              {item.chore.title}
            </span>

            <span
              className={`text-[10px] font-bold tabular-nums ${
                item.done ? 'text-emerald-300' : 'text-slate-500'
              }`}
            >
              {item.chore.xpValue} XP
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

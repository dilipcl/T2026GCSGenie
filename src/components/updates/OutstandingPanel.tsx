import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { NavTab } from '../layout/Navigation';
import { UserRole } from '../../types';
import {
  OutstandingItem,
  OutstandingUrgency,
  loadOutstanding,
} from '../../services/outstandingService';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, Inbox } from 'lucide-react';

/**
 * The one screen that answers "what do I need to do?".
 *
 * Updates used to be about the change log alone, so it read "Nothing waiting"
 * while the week sat unfinalised, two pieces of work ran overdue and a reward
 * request waited on a parent. Every one of those lived on its own tab, and
 * nothing joined them up. Tejas reported exactly that, and he was right: an
 * inbox that only knows about one source is not an inbox.
 *
 * Each row ends in a link rather than a control. Doing the thing belongs on the
 * screen built for it - approving a reward needs the balance and the held XP
 * beside it - and a second, thinner version of that screen here would be a
 * second place for the rules to drift. This list's job is to be complete and to
 * get out of the way.
 */

const URGENCY_STYLE: Record<OutstandingUrgency, { chip: string; label: string }> = {
  OVERDUE: { chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30', label: 'Overdue' },
  TODAY: { chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Today' },
  SOON: { chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30', label: 'This week' },
  WAITING: { chip: 'bg-slate-700/40 text-slate-300 border-slate-600', label: 'Waiting' },
};

const URGENCY_ICON: Record<OutstandingUrgency, React.ElementType> = {
  OVERDUE: AlertTriangle,
  TODAY: Clock,
  SOON: CalendarClock,
  WAITING: Inbox,
};

interface Props {
  role: UserRole;
  onOpenTab: (tab: NavTab) => void;
}

export const OutstandingPanel: React.FC<Props> = ({ role, onOpenTab }) => {
  /**
   * Re-read whenever any table the sources touch changes. `useLiveQuery` tracks
   * the reads inside the callback, so ticking off a task on another tab and
   * coming back shows a shorter list without a manual refresh.
   */
  const items = useLiveQuery(() => loadOutstanding(role), [role]);

  if (items === undefined) {
    return (
      <div className="glass-card p-5">
        <p className="text-[11px] text-slate-500">Checking what is outstanding…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="glass-card p-8 text-center border-emerald-500/30">
        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
        <p className="text-sm font-semibold text-white">Nothing outstanding</p>
        <p className="text-[11px] text-slate-400 mt-1">
          {role === 'STUDENT'
            ? 'Work is up to date, the plan is agreed and today’s check-in is done.'
            : 'Nothing is waiting on a parent right now.'}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold text-white">
          {items.length} thing{items.length === 1 ? '' : 's'} to deal with
        </h3>
        <span className="text-[11px] text-slate-400">
          {role === 'STUDENT' ? 'Yours to do' : 'Waiting on a parent'}
        </span>
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <OutstandingRow key={item.id} item={item} onOpenTab={onOpenTab} />
        ))}
      </ul>
    </div>
  );
};

const OutstandingRow: React.FC<{ item: OutstandingItem; onOpenTab: (tab: NavTab) => void }> = ({
  item,
  onOpenTab,
}) => {
  const style = URGENCY_STYLE[item.urgency];
  const Icon = URGENCY_ICON[item.urgency];

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenTab(item.tab)}
        className="w-full text-left p-3 bg-slate-900/70 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition-colors group"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${style.chip}`}
              >
                <Icon className="w-2.5 h-2.5" />
                {style.label}
              </span>
              <span className="text-xs font-bold text-white">{item.title}</span>
            </div>
            {item.detail && (
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{item.detail}</p>
            )}
          </div>

          <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-300 group-hover:text-indigo-200 shrink-0 whitespace-nowrap">
            {item.action}
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </button>
    </li>
  );
};

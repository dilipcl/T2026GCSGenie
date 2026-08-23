import React, { useEffect, useState } from 'react';
import { db } from '../../db';
import { Task, MilestoneReminder } from '../../types';
import { logAuditEvent } from '../../services/auditService';
import { triggerCelebration } from '../../utils/confetti';
import { todayISO, daysUntil, formatFriendlyDate, formatCountdown } from '../../utils/date';
import {
  Circle,
  Plus,
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  PartyPopper,
} from 'lucide-react';

interface DueSoonCardProps {
  refreshKey: number;
  onAdd: () => void;
  onSeeAllTasks: () => void;
  onSeeCalendar: () => void;
}

/**
 * "What do I need to do?" is the question the student opens the app to answer, so
 * it sits at the top of the dashboard rather than behind a tab. Shows overdue work
 * first, then the next few days, then key dates coming up.
 */
export const DueSoonCard: React.FC<DueSoonCardProps> = ({
  refreshKey,
  onAdd,
  onSeeAllTasks,
  onSeeCalendar,
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<MilestoneReminder[]>([]);

  const loadData = async () => {
    const allTasks = await db.tasks.orderBy('dueDate').toArray();
    const allMilestones = await db.milestones.orderBy('date').toArray();

    setTasks(allTasks.filter((t) => !t.completed));
    setMilestones(allMilestones.filter((m) => !m.isCompleted));
  };

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  const today = todayISO();
  const overdue = tasks.filter((t) => t.dueDate < today);
  const dueToday = tasks.filter((t) => t.dueDate === today);
  const dueSoon = tasks.filter((t) => {
    const days = daysUntil(t.dueDate);
    return days >= 1 && days <= 7;
  });

  const upcomingMilestones = milestones
    .filter((m) => {
      const days = daysUntil(m.date);
      return days >= 0 && days <= 21;
    })
    .slice(0, 3);

  const toggleComplete = async (task: Task) => {
    await db.tasks.update(task.id, { completed: true, completedAt: Date.now() });
    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'Task',
      entityId: task.id,
      fieldChanged: 'completed',
      oldValue: 'false',
      newValue: 'true',
    });
    triggerCelebration({ particleCount: 50 });
    loadData();
  };

  const renderTask = (task: Task, isOverdue: boolean) => (
    <div
      key={task.id}
      className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
        isOverdue
          ? 'bg-rose-950/25 border-rose-500/40'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
      }`}
    >
      <button
        onClick={() => toggleComplete(task)}
        aria-label={`Mark "${task.title}" as done`}
        className="p-1.5 -m-1.5 text-slate-500 hover:text-emerald-400 hover:scale-110 transition-all flex-shrink-0"
      >
        <Circle className="w-5 h-5" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{task.title}</p>
        <p className="text-[11px] text-slate-400">
          <span className="capitalize">{task.subjectId.replace('_', ' ')}</span>
          {' · '}
          <span className={isOverdue ? 'text-rose-300 font-semibold' : ''}>
            {formatFriendlyDate(task.dueDate)}
          </span>
        </p>
      </div>

      <span className="text-[11px] font-bold text-amber-400 flex-shrink-0">
        +{task.xpValue}
      </span>
    </div>
  );

  const nothingDue = overdue.length === 0 && dueToday.length === 0 && dueSoon.length === 0;

  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-bold text-base text-white">What's next</h3>
          <p className="text-[11px] text-slate-400">
            {overdue.length > 0
              ? `${overdue.length} overdue · ${dueToday.length} due today`
              : `${dueToday.length} due today · ${dueSoon.length} this week`}
          </p>
        </div>

        <button
          onClick={onAdd}
          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-indigo-950/40"
        >
          <Plus className="w-4 h-4" />
          <span>Add</span>
        </button>
      </div>

      <div className="space-y-4">
        {/* Overdue first - this is the thing that needs attention */}
        {overdue.length > 0 && (
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-rose-300 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Overdue ({overdue.length})</span>
            </h4>
            <div className="space-y-2">{overdue.slice(0, 3).map((t) => renderTask(t, true))}</div>
          </div>
        )}

        {dueToday.length > 0 && (
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-2">
              Due today ({dueToday.length})
            </h4>
            <div className="space-y-2">{dueToday.map((t) => renderTask(t, false))}</div>
          </div>
        )}

        {dueSoon.length > 0 && (
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Next 7 days ({dueSoon.length})
            </h4>
            <div className="space-y-2">{dueSoon.slice(0, 3).map((t) => renderTask(t, false))}</div>
          </div>
        )}

        {nothingDue && (
          <div className="p-5 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
            <PartyPopper className="w-7 h-7 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-200">Nothing due this week</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Good place to be. Add anything new with the + button.
            </p>
          </div>
        )}

        {/* Key dates coming up */}
        {upcomingMilestones.length > 0 && (
          <div className="pt-3 border-t border-slate-800">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-indigo-400" />
              <span>Key dates coming up</span>
            </h4>
            <div className="space-y-1.5">
              {upcomingMilestones.map((m) => (
                <button
                  key={m.id}
                  onClick={onSeeCalendar}
                  className="w-full p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 flex items-center justify-between gap-3 text-left transition-all"
                >
                  <span className="text-xs font-medium text-slate-200 truncate">{m.title}</span>
                  <span
                    className={`text-[11px] font-bold whitespace-nowrap flex-shrink-0 ${
                      daysUntil(m.date) <= 7 ? 'text-rose-300' : 'text-indigo-300'
                    }`}
                  >
                    {formatCountdown(m.date)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {(overdue.length > 3 || dueSoon.length > 3 || tasks.length > 0) && (
          <button
            onClick={onSeeAllTasks}
            className="w-full py-2.5 rounded-xl bg-slate-800/70 hover:bg-slate-800 text-slate-300 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-1 transition-all"
          >
            <span>See all {tasks.length} tasks</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { Task, PriorityLevel, SubjectId, Goal } from '../../types';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { logAuditEvent } from '../../services/auditService';
import { triggerCelebration } from '../../utils/confetti';
import { todayISO, formatFriendlyDate } from '../../utils/date';
import {
  ListTodo,
  Plus,
  CheckCircle2,
  Circle,
  Calendar,
  Trash2,
  Filter,
} from 'lucide-react';
import { useFeedback } from '../shared/FeedbackProvider';

interface TaskManagerViewProps {
  refreshKey?: number;
  onAdd: () => void;
}

export const TaskManagerView: React.FC<TaskManagerViewProps> = ({ refreshKey = 0, onAdd }) => {
  const { confirm } = useFeedback();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectId | 'ALL'>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<PriorityLevel | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('PENDING');

  const loadData = async () => {
    const tList = await db.tasks.orderBy('dueDate').toArray();
    const gList = await db.goals.toArray();
    setTasks(tList);
    setGoals(gList);
  };

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  const toggleTaskCompleted = async (task: Task) => {
    const newStatus = !task.completed;
    await db.tasks.update(task.id, {
      completed: newStatus,
      completedAt: newStatus ? Date.now() : undefined,
    });

    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'Task',
      entityId: task.id,
      fieldChanged: 'completed',
      oldValue: String(task.completed),
      newValue: String(newStatus),
    });

    if (newStatus) triggerCelebration({ particleCount: 50 });
    loadData();
  };

  const handleDeleteTask = async (task: Task) => {
    const ok = await confirm({
      title: `Delete "${task.title}"?`,
      body: 'This is recorded in the change history.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    await db.tasks.delete(task.id);
    // Deletes were previously the one change that left no trace, while the
    // Parent Portal advertised a log of every change.
    await logAuditEvent({
      user: 'STUDENT',
      action: 'DELETE',
      entity: 'Task',
      entityId: task.id,
      oldValue: `${task.title} [${task.subjectId}, due ${task.dueDate}, ${task.completed ? 'completed' : 'not completed'}]`,
    });
    loadData();
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (selectedSubject !== 'ALL' && t.subjectId !== selectedSubject) return false;
    if (selectedPriority !== 'ALL' && t.priority !== selectedPriority) return false;
    if (filterStatus === 'PENDING' && t.completed) return false;
    if (filterStatus === 'COMPLETED' && !t.completed) return false;
    return true;
  });

  const todayStr = todayISO();
  const overdueCount = tasks.filter((t) => !t.completed && t.dueDate < todayStr).length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card p-6 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-indigo-500/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              ⚡
            </span>
            <h2 className="text-xl font-bold text-white">My Work</h2>
          </div>
          <p className="text-xs text-slate-300 max-w-xl">
            Everything you have to do, soonest first.
            {overdueCount > 0 && (
              <span className="text-rose-300 font-semibold">
                {' '}
                {overdueCount} {overdueCount === 1 ? 'item is' : 'items are'} overdue.
              </span>
            )}
          </p>
        </div>

        <button
          onClick={onAdd}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add homework</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-2">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter:</span>
          </div>

          {/* Status Filter */}
          <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-0.5">
            {['PENDING', 'COMPLETED', 'ALL'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st as any)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  filterStatus === st
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300"
          >
            <option value="ALL">All Priorities</option>
            <option value="HIGH">High Priority (Urgent)</option>
            <option value="MEDIUM">Medium Priority</option>
            <option value="LOW">Low Priority</option>
          </select>

          {/* Subject Filter */}
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300"
          >
            <option value="ALL">All Subjects</option>
            {INITIAL_SUBJECTS.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-slate-400">
          Showing {filteredTasks.length} of {tasks.length} tasks
        </span>
      </div>

      {/* Task Cards Grid */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="glass-card p-8 text-center text-slate-400 text-xs">
            <ListTodo className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="font-semibold text-slate-300">No tasks match your filter criteria.</p>
            <p className="text-slate-500 mt-1">Click "Add Priority Task" to create a new assignment.</p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isOverdue = !task.completed && task.dueDate < todayStr;
            const linkedGoal = goals.find((g) => g.id === task.linkedGoalId);

            return (
              <div
                key={task.id}
                className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-all ${
                  task.completed
                    ? 'bg-slate-900/40 border-slate-800 text-slate-500'
                    : isOverdue
                    ? 'bg-rose-950/20 border-rose-500/40 text-slate-200'
                    : 'bg-slate-900/80 border-slate-800 text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-[260px]">
                  <button
                    onClick={() => toggleTaskCompleted(task)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    {task.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-400/20" />
                    ) : (
                      <Circle className="w-5 h-5 text-slate-500" />
                    )}
                  </button>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                        {task.subjectId.replace('_', ' ')}
                      </span>

                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                          task.priority === 'HIGH'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : task.priority === 'MEDIUM'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                        }`}
                      >
                        {task.priority} Priority
                      </span>

                      {isOverdue && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-700 font-bold uppercase">
                          Overdue
                        </span>
                      )}
                    </div>

                    <h4
                      className={`font-bold text-sm text-white ${
                        task.completed ? 'line-through text-slate-500' : ''
                      }`}
                    >
                      {task.title}
                    </h4>

                    {task.description && (
                      <p className="text-xs text-slate-400 mt-0.5">{task.description}</p>
                    )}

                    {linkedGoal && (
                      <p className="text-[11px] text-indigo-300 font-medium mt-1">
                        🎯 Linked Goal: {linkedGoal.title}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span
                    title={`Due ${task.dueDate}`}
                    className={`bg-slate-800 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1 font-semibold ${
                      isOverdue ? 'text-rose-300' : 'text-slate-300'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{formatFriendlyDate(task.dueDate)}</span>
                  </span>

                  <span className="text-amber-400 font-bold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                    +{task.xpValue} XP
                  </span>

                  <button
                    onClick={() => handleDeleteTask(task)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};

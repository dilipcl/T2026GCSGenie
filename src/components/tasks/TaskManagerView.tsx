import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { Task, PriorityLevel, SubjectId, Goal } from '../../types';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { logAuditEvent } from '../../services/auditService';
import { triggerCelebration } from '../../utils/confetti';
import {
  ListTodo,
  Plus,
  CheckCircle2,
  Circle,
  Calendar,
  Sparkles,
  Trash2,
  Filter,
} from 'lucide-react';

export const TaskManagerView: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectId | 'ALL'>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<PriorityLevel | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('PENDING');

  // New Task Form
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState<SubjectId>('maths');
  const [newDueDate, setNewDueDate] = useState(
    new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
  );
  const [newPriority, setNewPriority] = useState<PriorityLevel>('HIGH');
  const [newGoalId, setNewGoalId] = useState<string>('');
  const [newDescription, setNewDescription] = useState('');

  const loadData = async () => {
    const tList = await db.tasks.orderBy('dueDate').toArray();
    const gList = await db.goals.toArray();
    setTasks(tList);
    setGoals(gList);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newTask: Task = {
      id: `task_${Date.now()}`,
      subjectId: newSubject,
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      dueDate: newDueDate,
      priority: newPriority,
      isHomework: true,
      isRemediation: false,
      linkedGoalId: newGoalId || undefined,
      xpValue: newPriority === 'HIGH' ? 60 : 50,
      completed: false,
      createdAt: Date.now(),
    };

    await db.tasks.add(newTask);
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'Task',
      entityId: newTask.id,
      newValue: `${newTask.title} [Priority: ${newPriority}, Due: ${newDueDate}]`,
    });

    setNewTitle('');
    setNewDescription('');
    setIsAddOpen(false);
    loadData();
  };

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

  const handleDeleteTask = async (id: string) => {
    if (confirm('Delete this task?')) {
      await db.tasks.delete(id);
      loadData();
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (selectedSubject !== 'ALL' && t.subjectId !== selectedSubject) return false;
    if (selectedPriority !== 'ALL' && t.priority !== selectedPriority) return false;
    if (filterStatus === 'PENDING' && t.completed) return false;
    if (filterStatus === 'COMPLETED' && !t.completed) return false;
    return true;
  });

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card p-6 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-indigo-500/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              ⚡
            </span>
            <h2 className="text-xl font-bold text-white">
              Workload Prioritization & Homework Planning
            </h2>
          </div>
          <p className="text-xs text-slate-300 max-w-xl">
            Prioritize high-impact Year 10 tasks, link directly to Grade 9 SMART goals, and prevent
            workload bottlenecks.
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Priority Task</span>
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
                  <span className="font-mono text-slate-300 bg-slate-800 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Due: {task.dueDate}</span>
                  </span>

                  <span className="text-amber-400 font-bold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60">
                    +{task.xpValue} XP
                  </span>

                  <button
                    onClick={() => handleDeleteTask(task.id)}
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

      {/* Add Priority Task Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsAddOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>

            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-indigo-400" />
              <span>Add Prioritized Task / Homework</span>
            </h2>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Complete Edexcel Paper 1 Q12-18 / OCR SQL Queries"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Subject
                  </label>
                  <select
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {INITIAL_SUBJECTS.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Priority Level
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="HIGH">High (Must Do / Today)</option>
                    <option value="MEDIUM">Medium (Should Do)</option>
                    <option value="LOW">Low (Could Do / Flexible)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Link to SMART Goal
                  </label>
                  <select
                    value={newGoalId}
                    onChange={(e) => setNewGoalId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">None / General</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Description / Specific Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="Specific page numbers, practice questions, or mark scheme targets..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2 text-xs text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Save Priority Task (+{newPriority === 'HIGH' ? 60 : 50} XP)</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

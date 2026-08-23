import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { MilestoneReminder, PriorityLevel, SubjectId } from '../../types';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { logAuditEvent } from '../../services/auditService';
import { triggerCelebration } from '../../utils/confetti';
import {
  Calendar as CalendarIcon,
  Plus,
  CheckCircle2,
  Trash2,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
} from 'lucide-react';

export const MilestoneCalendarView: React.FC = () => {
  const [milestones, setMilestones] = useState<MilestoneReminder[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 9, 1)); // October 2026 default
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newCategory, setNewCategory] = useState<MilestoneReminder['category']>('EXAM_MOCK');
  const [newPriority, setNewPriority] = useState<PriorityLevel>('HIGH');
  const [newSubjectId, setNewSubjectId] = useState<SubjectId | ''>('');
  const [newNotes, setNewNotes] = useState('');
  const [newDriveUrl, setNewDriveUrl] = useState('');

  const loadMilestones = async () => {
    const list = await db.milestones.orderBy('date').toArray();
    setMilestones(list);
  };

  useEffect(() => {
    loadMilestones();
  }, []);

  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newMilestone: MilestoneReminder = {
      id: `mile_${Date.now()}`,
      title: newTitle.trim(),
      date: newDate,
      category: newCategory,
      priority: newPriority,
      subjectId: newSubjectId ? (newSubjectId as SubjectId) : undefined,
      isCompleted: false,
      notes: newNotes.trim() || undefined,
      driveResourceUrl: newDriveUrl.trim() || undefined,
      createdAt: Date.now(),
    };

    await db.milestones.add(newMilestone);
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'MilestoneReminder',
      entityId: newMilestone.id,
      newValue: `${newMilestone.title} (${newMilestone.date}, ${newMilestone.category})`,
    });

    setNewTitle('');
    setNewNotes('');
    setNewDriveUrl('');
    setIsAddModalOpen(false);
    loadMilestones();
  };

  const toggleMilestoneComplete = async (m: MilestoneReminder) => {
    const newStatus = !m.isCompleted;
    await db.milestones.update(m.id, { isCompleted: newStatus });
    if (newStatus) triggerCelebration({ particleCount: 50 });
    loadMilestones();
  };

  const handleDeleteMilestone = async (id: string) => {
    if (confirm('Delete this milestone reminder?')) {
      await db.milestones.delete(id);
      loadMilestones();
    }
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const monthName = currentMonth.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  // Generate calendar days
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
  const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Mon = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < adjustedFirstDay; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(d);
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card p-6 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-indigo-500/30 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              📅
            </span>
            <h2 className="text-xl font-bold text-white">
              Academic Milestones, Mocks & Reminders Calendar
            </h2>
          </div>
          <p className="text-xs text-slate-300 max-w-xl">
            Track Year 10 interim assessments (IR1, IR2, IR3), GCSE Art portfolio deadlines,
            Science required practicals, and customized reminders.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Milestone / Reminder</span>
        </button>
      </div>

      {/* Calendar Grid Section */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-base text-white">{monthName}</h3>
            <span className="text-xs text-indigo-400 font-mono">
              {milestones.length} Milestones Scheduled
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={prevMonth}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Days Header */}
        <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-400 mb-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Days Cells */}
        <div className="grid grid-cols-7 gap-1.5">
          {calendarDays.map((dayNum, idx) => {
            if (!dayNum) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="min-h-[85px] bg-slate-950/30 rounded-xl border border-slate-900/50 p-1.5 opacity-30"
                />
              );
            }

            const currentDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(
              dayNum
            ).padStart(2, '0')}`;

            const daysMilestones = milestones.filter((m) => m.date === currentDayStr);

            return (
              <div
                key={currentDayStr}
                className="min-h-[85px] bg-slate-900/80 rounded-xl border border-slate-800 p-2 flex flex-col justify-between hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white font-mono">{dayNum}</span>
                  {daysMilestones.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  )}
                </div>

                <div className="space-y-1 mt-1">
                  {daysMilestones.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => toggleMilestoneComplete(m)}
                      title={`${m.title} - ${m.notes || ''}`}
                      className={`text-[10px] p-1 rounded font-semibold truncate cursor-pointer transition-all border ${
                        m.isCompleted
                          ? 'bg-slate-950/60 text-slate-500 line-through border-slate-900'
                          : m.priority === 'HIGH'
                          ? 'bg-rose-950/80 text-rose-300 border-rose-800/80'
                          : 'bg-indigo-950/80 text-indigo-300 border-indigo-800/80'
                      }`}
                    >
                      {m.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comprehensive Milestones & Reminders List */}
      <div className="glass-card p-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span>All Upcoming Milestones & Target Checkpoints</span>
        </h3>

        {milestones.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-400 text-xs">
            No milestones registered. Click "Add Milestone / Reminder" above!
          </div>
        ) : (
          <div className="space-y-3">
            {milestones.map((m) => (
              <div
                key={m.id}
                className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-all ${
                  m.isCompleted
                    ? 'bg-slate-900/40 border-slate-800 text-slate-500'
                    : 'bg-slate-900/90 border-slate-800 text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleMilestoneComplete(m)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    {m.isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500/20" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-slate-500" />
                    )}
                  </button>

                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                          m.category === 'EXAM_MOCK'
                            ? 'bg-rose-950 text-rose-300 border-rose-800'
                            : m.category === 'PORTFOLIO_DEADLINE'
                            ? 'bg-fuchsia-950 text-fuchsia-300 border-fuchsia-800'
                            : m.category === 'REQUIRED_PRACTICAL'
                            ? 'bg-purple-950 text-purple-300 border-purple-800'
                            : 'bg-teal-950 text-teal-300 border-teal-800'
                        }`}
                      >
                        {m.category.replace('_', ' ')}
                      </span>

                      <h4
                        className={`font-bold text-sm text-white ${
                          m.isCompleted ? 'line-through text-slate-500' : ''
                        }`}
                      >
                        {m.title}
                      </h4>

                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                          m.priority === 'HIGH'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        }`}
                      >
                        {m.priority}
                      </span>
                    </div>

                    {m.notes && <p className="text-xs text-slate-400 mt-1">{m.notes}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="font-mono text-slate-300 bg-slate-800 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1">
                    <CalendarIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{m.date}</span>
                  </span>

                  {m.driveResourceUrl && (
                    <a
                      href={m.driveResourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-teal-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <span>Drive File</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  <button
                    onClick={() => handleDeleteMilestone(m.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Milestone Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-indigo-400" />
              <span>Add Milestone or Reminder</span>
            </h2>

            <form onSubmit={handleCreateMilestone} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Milestone Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Edexcel Maths Mock Paper 1 / Art AO2 Sheet"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Target Date
                  </label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Priority
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="HIGH">High (Urgent Milestone)</option>
                    <option value="MEDIUM">Medium (Standard)</option>
                    <option value="LOW">Low (Flexible)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="EXAM_MOCK">Exam / Mock</option>
                    <option value="PORTFOLIO_DEADLINE">Art Portfolio Deadline</option>
                    <option value="REQUIRED_PRACTICAL">Required Practical</option>
                    <option value="COURSEWORK">Coursework</option>
                    <option value="CADETS">Air Cadets / DofE</option>
                    <option value="PERSONAL_TARGET">Personal Target</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Linked Subject
                  </label>
                  <select
                    value={newSubjectId}
                    onChange={(e) => setNewSubjectId(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">None / General</option>
                    {INITIAL_SUBJECTS.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Google Drive Resource / Notebook Link (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={newDriveUrl}
                  onChange={(e) => setNewDriveUrl(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Notes & Details
                </label>
                <textarea
                  rows={2}
                  placeholder="Specific topics to revise or submission requirements..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Save Milestone</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { db } from '../../db';
import { Task, MilestoneReminder, PriorityLevel, SubjectId } from '../../types';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { logAuditEvent } from '../../services/auditService';
import { todayISO, addDaysISO, formatFriendlyDate } from '../../utils/date';
import { X, ListTodo, CalendarDays, Check, ChevronDown, ChevronUp } from 'lucide-react';

type AddMode = 'TASK' | 'REMINDER';

interface QuickAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultMode?: AddMode;
}

/**
 * Adding homework and reminders is the most frequent thing the student does after
 * checking in, so it lives behind one button on every screen rather than inside a
 * particular tab. Only three fields are required; everything else is folded away.
 */
export const QuickAddSheet: React.FC<QuickAddSheetProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultMode = 'TASK',
}) => {
  const [mode, setMode] = useState<AddMode>(defaultMode);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(addDaysISO(1));
  const [subjectId, setSubjectId] = useState<SubjectId | ''>('');
  const [priority, setPriority] = useState<PriorityLevel>('MEDIUM');
  const [category, setCategory] = useState<MilestoneReminder['category']>('PERSONAL_TARGET');
  const [notes, setNotes] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode(defaultMode);
    setTitle('');
    setDueDate(addDaysISO(1));
    setSubjectId('');
    setPriority('MEDIUM');
    setCategory('PERSONAL_TARGET');
    setNotes('');
    setShowMore(false);
    setIsSaving(false);
  }, [isOpen, defaultMode]);

  if (!isOpen) return null;

  const dateChips = [
    { label: 'Today', value: todayISO() },
    { label: 'Tomorrow', value: addDaysISO(1) },
    { label: 'In 3 days', value: addDaysISO(3) },
    { label: 'Next week', value: addDaysISO(7) },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSaving) return;
    if (mode === 'TASK' && !subjectId) return;

    setIsSaving(true);
    try {
      if (mode === 'TASK') {
        const task: Task = {
          id: `task_${Date.now()}`,
          subjectId: subjectId as SubjectId,
          title: title.trim(),
          description: notes.trim() || undefined,
          dueDate,
          priority,
          isHomework: true,
          isRemediation: false,
          xpValue: priority === 'HIGH' ? 60 : 50,
          completed: false,
          createdAt: Date.now(),
        };

        await db.tasks.add(task);
        await logAuditEvent({
          user: 'STUDENT',
          action: 'INSERT',
          entity: 'Task',
          entityId: task.id,
          newValue: `${task.title} [Priority: ${priority}, Due: ${dueDate}]`,
        });
      } else {
        const milestone: MilestoneReminder = {
          id: `mile_${Date.now()}`,
          title: title.trim(),
          date: dueDate,
          category,
          subjectId: subjectId ? (subjectId as SubjectId) : undefined,
          priority,
          isCompleted: false,
          notes: notes.trim() || undefined,
          createdAt: Date.now(),
        };

        await db.milestones.add(milestone);
        await logAuditEvent({
          user: 'STUDENT',
          action: 'INSERT',
          entity: 'MilestoneReminder',
          entityId: milestone.id,
          newValue: `${milestone.title} (${milestone.date}, ${milestone.category})`,
        });
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Quick add failed:', err);
      alert('Could not save that. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-md bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 pb-safe sm:pb-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Add something</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* What kind of thing */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(
            [
              { id: 'TASK', label: 'Homework', hint: 'Something to do', icon: ListTodo },
              { id: 'REMINDER', label: 'Key date', hint: 'Test, deadline', icon: CalendarDays },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isActive = mode === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setMode(item.id)}
                className={`flex flex-col items-start gap-0.5 p-3 rounded-2xl border text-left transition-all ${
                  isActive
                    ? 'bg-indigo-600 border-indigo-400 text-white'
                    : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="text-sm font-bold">{item.label}</span>
                <span
                  className={`text-[11px] ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}
                >
                  {item.hint}
                </span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="quick-add-title"
              className="block text-xs font-bold text-slate-300 uppercase mb-1.5"
            >
              {mode === 'TASK' ? 'What do you need to do?' : "What's happening?"}
            </label>
            <input
              id="quick-add-title"
              type="text"
              autoFocus
              placeholder={
                mode === 'TASK'
                  ? 'e.g. Maths past paper Q12-18'
                  : 'e.g. Chemistry required practical'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase">
                {mode === 'TASK' ? 'Due' : 'When'}
              </label>
              <span className="text-[11px] text-indigo-300 font-semibold">
                {formatFriendlyDate(dueDate)}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {dateChips.map((chip) => (
                <button
                  type="button"
                  key={chip.label}
                  onClick={() => setDueDate(chip.value)}
                  className={`py-2 rounded-xl text-[11px] font-bold border transition-all ${
                    dueDate === chip.value
                      ? 'bg-indigo-600 text-white border-indigo-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <input
              type="date"
              aria-label="Pick a specific date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label
              htmlFor="quick-add-subject"
              className="block text-xs font-bold text-slate-300 uppercase mb-1.5"
            >
              Subject {mode === 'REMINDER' && <span className="normal-case font-normal text-slate-500">(optional)</span>}
            </label>
            <select
              id="quick-add-subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value as SubjectId | '')}
              // Required for homework: silently defaulting would file an English
              // essay under Maths and quietly skew that subject's RAG score
              required={mode === 'TASK'}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white"
            >
              {mode === 'TASK' ? (
                <option value="">Choose a subject...</option>
              ) : (
                <option value="">None / general</option>
              )}
              {INITIAL_SUBJECTS.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.icon} {sub.name}
                </option>
              ))}
            </select>
          </div>

          {/* Everything below is rarely changed, so it starts folded away */}
          <button
            type="button"
            onClick={() => setShowMore((prev) => !prev)}
            className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{showMore ? 'Fewer options' : 'More options'}</span>
          </button>

          {showMore && (
            <div className="space-y-3 p-3 bg-slate-800/50 rounded-2xl border border-slate-700/70">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5">
                  How important?
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'HIGH', label: 'Must do' },
                      { id: 'MEDIUM', label: 'Should do' },
                      { id: 'LOW', label: 'Could do' },
                    ] as const
                  ).map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setPriority(item.id)}
                      className={`py-2 rounded-xl text-[11px] font-bold border transition-all ${
                        priority === item.id
                          ? 'bg-indigo-600 text-white border-indigo-400'
                          : 'bg-slate-900 text-slate-400 border-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'REMINDER' && (
                <div>
                  <label
                    htmlFor="quick-add-category"
                    className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5"
                  >
                    Type of date
                  </label>
                  <select
                    id="quick-add-category"
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as MilestoneReminder['category'])
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                  >
                    <option value="EXAM_MOCK">Exam / mock</option>
                    <option value="PORTFOLIO_DEADLINE">Art portfolio deadline</option>
                    <option value="REQUIRED_PRACTICAL">Required practical</option>
                    <option value="COURSEWORK">Coursework</option>
                    <option value="CADETS">Cadets / DofE</option>
                    <option value="PERSONAL_TARGET">Personal target</option>
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="quick-add-notes"
                  className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5"
                >
                  Notes
                </label>
                <textarea
                  id="quick-add-notes"
                  rows={2}
                  placeholder="Page numbers, questions, what to bring..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={!title.trim() || isSaving || (mode === 'TASK' && !subjectId)}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            <span>
              {isSaving
                ? 'Saving...'
                : mode === 'TASK'
                ? `Add homework (+${priority === 'HIGH' ? 60 : 50} XP when done)`
                : 'Add to calendar'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};

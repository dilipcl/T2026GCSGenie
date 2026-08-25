import React, { useEffect, useState } from 'react';
import { db } from '../../db';
import {
  Task,
  MilestoneReminder,
  TimetableEntry,
  TimetableSlotConfig,
  PriorityLevel,
  SubjectId,
  WeekType,
  DayOfWeek,
} from '../../types';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { logAuditEvent } from '../../services/auditService';
import { todayISO, addDaysISO, formatFriendlyDate } from '../../utils/date';
import { X, ListTodo, CalendarDays, Check, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { newId } from '../../utils/id';
import { useFeedback } from './FeedbackProvider';

export type AddMode = 'TASK' | 'REMINDER' | 'LESSON';

interface QuickAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultMode?: AddMode;
  defaultWeek?: WeekType;
  defaultDay?: DayOfWeek;
}

const DAYS: { id: DayOfWeek; label: string }[] = [
  { id: 'MON', label: 'Mon' },
  { id: 'TUE', label: 'Tue' },
  { id: 'WED', label: 'Wed' },
  { id: 'THU', label: 'Thu' },
  { id: 'FRI', label: 'Fri' },
  { id: 'SAT', label: 'Sat' },
  { id: 'SUN', label: 'Sun' },
];

const REMINDER_CATEGORIES: { id: MilestoneReminder['category']; label: string }[] = [
  { id: 'EXAM_MOCK', label: 'Exam / mock' },
  { id: 'REQUIRED_PRACTICAL', label: 'Practical' },
  { id: 'PORTFOLIO_DEADLINE', label: 'Art portfolio' },
  { id: 'COURSEWORK', label: 'Coursework' },
  { id: 'CADETS', label: 'Cadets / DofE' },
  { id: 'PERSONAL_TARGET', label: 'Personal' },
];

/**
 * One sheet for the three things that get added most often: homework, key dates
 * and timetable lessons.
 *
 * The design goal is taps, not fields. Subjects, dates, periods and days are all
 * chips rather than dropdowns, and a lesson can be written to several days at
 * once - filling in Tuesday to Friday of a rotation used to mean opening a
 * separate modal and retyping the same period twenty times.
 */
export const QuickAddSheet: React.FC<QuickAddSheetProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultMode = 'TASK',
  defaultWeek = 'ODD',
  defaultDay = 'MON',
}) => {
  const { toast } = useFeedback();
  const [mode, setMode] = useState<AddMode>(defaultMode);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(addDaysISO(1));
  const [subjectId, setSubjectId] = useState<SubjectId | ''>('');
  const [priority, setPriority] = useState<PriorityLevel>('MEDIUM');
  const [category, setCategory] = useState<MilestoneReminder['category']>('EXAM_MOCK');
  const [notes, setNotes] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Lesson-only state
  const [slots, setSlots] = useState<TimetableSlotConfig[]>([]);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([defaultDay]);
  const [weekType, setWeekType] = useState<WeekType>(defaultWeek);
  const [slotName, setSlotName] = useState('Period 1');
  const [startTime, setStartTime] = useState('08:50');
  const [endTime, setEndTime] = useState('09:50');
  const [room, setRoom] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setMode(defaultMode);
    setTitle('');
    setDueDate(addDaysISO(1));
    setSubjectId('');
    setPriority('MEDIUM');
    setCategory('EXAM_MOCK');
    setNotes('');
    setShowMore(false);
    setIsSaving(false);
    setSelectedDays([defaultDay]);
    setWeekType(defaultWeek);
    setRoom('');

    db.timetableSlots.toArray().then((list) => {
      // Dexie returns rows in primary-key order, which puts "After School" first
      // and Registration last. Order by clock time so the chips read as a school
      // day and the default lands on the first period rather than the evening.
      const teaching = list
        .filter((s) => !s.isBreakOrLunch)
        .sort((a, b) => a.defaultStartTime.localeCompare(b.defaultStartTime));
      setSlots(teaching);
      const first = teaching[0];
      if (first) {
        setSlotName(first.name);
        setStartTime(first.defaultStartTime);
        setEndTime(first.defaultEndTime);
      }
    });
  }, [isOpen, defaultMode, defaultWeek, defaultDay]);

  if (!isOpen) return null;

  const subject = INITIAL_SUBJECTS.find((s) => s.id === subjectId);
  const dateChips = [
    { label: 'Today', value: todayISO() },
    { label: 'Tomorrow', value: addDaysISO(1) },
    { label: 'In 3 days', value: addDaysISO(3) },
    { label: 'Next week', value: addDaysISO(7) },
  ];

  const toggleDay = (day: DayOfWeek) =>
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );

  const applySlot = (slot: TimetableSlotConfig) => {
    setSlotName(slot.name);
    setStartTime(slot.defaultStartTime);
    setEndTime(slot.defaultEndTime);
  };

  // A lesson can take its name from the subject, so the text box is optional there
  const effectiveLessonName = title.trim() || subject?.name || '';
  const canSubmit =
    mode === 'LESSON'
      ? effectiveLessonName.length > 0 && selectedDays.length > 0
      : mode === 'TASK'
      ? title.trim().length > 0 && !!subjectId
      : title.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSaving) return;

    setIsSaving(true);
    try {
      if (mode === 'TASK') {
        const task: Task = {
          id: newId('task'),
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
      } else if (mode === 'REMINDER') {
        const milestone: MilestoneReminder = {
          id: newId('mile'),
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
      } else {
        // One row per selected day. The day is part of the id so two entries
        // created in the same millisecond cannot collide.
        const entries: TimetableEntry[] = selectedDays.map((day) => ({
          id: newId('tt'),
          weekType,
          dayOfWeek: day,
          slotName,
          startTime,
          endTime,
          subjectId: subjectId ? (subjectId as SubjectId) : undefined,
          activityName: effectiveLessonName,
          room: room.trim() || undefined,
          isHardLocked: false,
        }));

        await db.timetableEntries.bulkAdd(entries);
        for (const entry of entries) {
          await logAuditEvent({
            user: 'STUDENT',
            action: 'INSERT',
            entity: 'TimetableEntry',
            entityId: entry.id,
            newValue: `${entry.activityName} (${weekType} ${entry.dayOfWeek} ${startTime}-${endTime})`,
          });
        }
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Quick add failed:', err);
      toast.error('Could not save that', 'Nothing was lost - try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const chipClass = (active: boolean) =>
    `py-2 rounded-xl text-[11px] font-bold border transition-all ${
      active
        ? 'bg-indigo-600 text-white border-indigo-400'
        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
    }`;

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
        <div className="grid grid-cols-3 gap-2 mb-4">
          {(
            [
              { id: 'TASK', label: 'Homework', hint: 'To do', icon: ListTodo },
              { id: 'REMINDER', label: 'Key date', hint: 'Test, deadline', icon: CalendarDays },
              { id: 'LESSON', label: 'Lesson', hint: 'Timetable', icon: Clock },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isActive = mode === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setMode(item.id)}
                className={`flex flex-col items-start gap-0.5 p-2.5 rounded-2xl border text-left transition-all ${
                  isActive
                    ? 'bg-indigo-600 border-indigo-400 text-white'
                    : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span className="text-xs font-bold leading-tight">{item.label}</span>
                <span className={`text-[10px] ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}>
                  {item.hint}
                </span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Subject chips - faster than a dropdown, and shows the whole set at once */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
              Subject{' '}
              {mode !== 'TASK' && (
                <span className="normal-case font-normal text-slate-500">(optional)</span>
              )}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {INITIAL_SUBJECTS.map((sub) => (
                <button
                  type="button"
                  key={sub.id}
                  onClick={() => setSubjectId(subjectId === sub.id ? '' : sub.id)}
                  className={`flex items-center gap-1.5 px-2 py-2 rounded-xl border text-left transition-all ${
                    subjectId === sub.id
                      ? 'bg-indigo-600 border-indigo-400 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span className="text-base leading-none">{sub.icon}</span>
                  <span className="text-[10px] font-bold leading-tight">{sub.shortName}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="quick-add-title"
              className="block text-xs font-bold text-slate-300 uppercase mb-1.5"
            >
              {mode === 'TASK'
                ? 'What do you need to do?'
                : mode === 'REMINDER'
                ? "What's happening?"
                : 'Lesson name'}
              {mode === 'LESSON' && subject && (
                <span className="normal-case font-normal text-slate-500"> (defaults to {subject.name})</span>
              )}
            </label>
            <input
              id="quick-add-title"
              type="text"
              autoFocus
              placeholder={
                mode === 'TASK'
                  ? 'e.g. Maths past paper Q12-18'
                  : mode === 'REMINDER'
                  ? 'e.g. Chemistry required practical'
                  : subject
                  ? subject.name
                  : 'e.g. Maths (Linear 9-1)'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required={mode !== 'LESSON'}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Date picker for the two dated modes */}
          {mode !== 'LESSON' && (
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
                    className={chipClass(dueDate === chip.value)}
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
          )}

          {mode === 'REMINDER' && (
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                Type of date
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {REMINDER_CATEGORIES.map((cat) => (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={chipClass(category === cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'LESSON' && (
            <>
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-300 uppercase">
                    Which days?
                  </label>
                  <span className="text-[11px] text-indigo-300 font-semibold">
                    {selectedDays.length} selected
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {DAYS.map((d) => (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => toggleDay(d.id)}
                      className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${
                        selectedDays.includes(d.id)
                          ? 'bg-indigo-600 text-white border-indigo-400'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Tick several days to add the same lesson to each of them in one go.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Period
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {slots.map((slot) => (
                    <button
                      type="button"
                      key={slot.id}
                      onClick={() => applySlot(slot)}
                      className={`px-2 py-2 rounded-xl border text-left transition-all ${
                        slotName === slot.name
                          ? 'bg-indigo-600 border-indigo-400 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <span className="block text-[11px] font-bold leading-tight">{slot.name}</span>
                      <span
                        className={`block text-[10px] font-mono ${
                          slotName === slot.name ? 'text-indigo-100' : 'text-slate-500'
                        }`}
                      >
                        {slot.defaultStartTime}-{slot.defaultEndTime}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Which week?
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'ODD', label: 'Odd only' },
                      { id: 'EVEN', label: 'Even only' },
                      { id: 'BOTH', label: 'Every week' },
                    ] as const
                  ).map((w) => (
                    <button
                      type="button"
                      key={w.id}
                      onClick={() => setWeekType(w.id)}
                      className={chipClass(weekType === w.id)}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

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
              {mode !== 'LESSON' && (
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
              )}

              {mode === 'LESSON' && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                        Starts
                      </label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                        Ends
                      </label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                        Room
                      </label>
                      <input
                        type="text"
                        placeholder="M2"
                        value={room}
                        onChange={(e) => setRoom(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 uppercase mb-1">
                      Period label
                    </label>
                    <input
                      type="text"
                      value={slotName}
                      onChange={(e) => setSlotName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                    />
                  </div>
                </>
              )}

              {mode !== 'LESSON' && (
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
              )}
            </div>
          )}

          {!canSubmit && !isSaving && (
            <p className="text-[11px] text-slate-500 text-center" role="status">
              {mode === 'TASK' && !subjectId && title.trim()
                ? 'Pick a subject to add this.'
                : mode === 'LESSON' && selectedDays.length === 0
                ? 'Tick at least one day.'
                : 'Give it a name first.'}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || isSaving}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            <span>
              {isSaving
                ? 'Saving...'
                : mode === 'TASK'
                ? `Add homework (+${priority === 'HIGH' ? 60 : 50} XP when done)`
                : mode === 'REMINDER'
                ? 'Add to calendar'
                : `Add to ${selectedDays.length} ${selectedDays.length === 1 ? 'day' : 'days'}`}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};

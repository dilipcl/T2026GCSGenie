import React, { useEffect, useState } from 'react';
import { db } from '../../db';
import {
  Task,
  MilestoneReminder,
  TimetableEntry,
  TimetableSlotConfig,
  Goal,
  PriorityLevel,
  SubjectId,
  WeekType,
  DayOfWeek,
  isNonExamSubject,
} from '../../types';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { logAuditEvent, logFieldChanges } from '../../services/auditService';
import { todayISO, addDaysISO, formatFriendlyDate } from '../../utils/date';
import { suggestedSubjectId, isSchoolInSession } from '../../services/timetableContext';
import { X, ListTodo, CalendarDays, Check, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { newId } from '../../utils/id';
import { normaliseTitle, withTaskDefaults } from '../../services/dataQualityService';
import { useFeedback } from './FeedbackProvider';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';

export type AddMode = 'TASK' | 'REMINDER' | 'LESSON';

/**
 * An existing row this sheet is editing rather than creating.
 *
 * The app could add homework, key dates and lessons and then only complete or
 * delete them - a due date typed wrong meant deleting the task and typing the
 * whole thing again. The add form already knows every field, so editing is the
 * same form with the record loaded into it rather than a second screen that
 * has to be kept in step with the first.
 */
export type QuickAddEditing =
  | { kind: 'TASK'; record: Task }
  | { kind: 'REMINDER'; record: MilestoneReminder }
  | { kind: 'LESSON'; record: TimetableEntry };

interface QuickAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultMode?: AddMode;
  defaultWeek?: WeekType;
  defaultDay?: DayOfWeek;
  editing?: QuickAddEditing | null;
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
  editing = null,
}) => {
  const { toast } = useFeedback();
  const [mode, setMode] = useState<AddMode>(defaultMode);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(addDaysISO(1));
  const [subjectId, setSubjectId] = useState<SubjectId | ''>('');
  /** Drives the wording under the picker: a lesson-based guess vs a fallback. */
  const [schoolInSession, setSchoolInSession] = useState(false);
  const [priority, setPriority] = useState<PriorityLevel>('MEDIUM');
  const [category, setCategory] = useState<MilestoneReminder['category']>('EXAM_MOCK');
  const [notes, setNotes] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [linkedGoalId, setLinkedGoalId] = useState('');
  const [goals, setGoals] = useState<Goal[]>([]);
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

    // Editing loads the row; adding starts from the defaults.
    if (editing) {
      setMode(editing.kind);
      setIsSaving(false);
      setShowMore(true);

      if (editing.kind === 'TASK') {
        const t = editing.record;
        setTitle(t.title);
        setDueDate(t.dueDate);
        setSubjectId(t.subjectId);
        setPriority(t.priority);
        setNotes(t.description || '');
        setEstimatedHours(t.estimatedHours != null ? String(t.estimatedHours) : '');
        setLinkedGoalId(t.linkedGoalId || '');
      } else if (editing.kind === 'REMINDER') {
        const m = editing.record;
        setTitle(m.title);
        setDueDate(m.date);
        setSubjectId(m.subjectId || '');
        setPriority(m.priority);
        setCategory(m.category);
        setNotes(m.notes || '');
      } else {
        const e = editing.record;
        setTitle(e.activityName);
        setSubjectId(e.subjectId || '');
        setSelectedDays([e.dayOfWeek]);
        setWeekType(e.weekType);
        setSlotName(e.slotName);
        setStartTime(e.startTime);
        setEndTime(e.endTime);
        setRoom(e.room || '');
      }
    } else {
      setMode(defaultMode);
      setTitle('');
      setDueDate(addDaysISO(1));
      setSubjectId('');

      /**
       * UX-2. Homework gets written down in the two minutes after the lesson
       * that set it, and the app already knows which lesson that was. A blank
       * picker is a picker that stays blank, and an unattributed task counts
       * towards no subject's health and no goal's weekly hours.
       *
       * Only ever a default: it fills the field and is one tap to change, and
       * it deliberately does nothing outside school hours rather than guessing.
       */
      /**
       * Always resolves to something now. Before this, the ladder stopped at
       * "the lesson happening now", so every weekend and every holiday opened
       * a blank required field - which is how a bank-holiday task ends up
       * filed under whichever subject was easiest to tap.
       */
      suggestedSubjectId(defaultWeek).then(setSubjectId);
      isSchoolInSession(defaultWeek).then(setSchoolInSession);
      setPriority('MEDIUM');
      setCategory('EXAM_MOCK');
      setNotes('');
      setEstimatedHours('');
      setLinkedGoalId('');
      setShowMore(false);
      setIsSaving(false);
      setSelectedDays([defaultDay]);
      setWeekType(defaultWeek);
      setRoom('');
    }

    db.goals.toArray().then((list) =>
      setGoals(list.filter((g) => g.status !== 'COMPLETED' && g.status !== 'DEFERRED'))
    );

    db.timetableSlots.toArray().then((list) => {
      // Dexie returns rows in primary-key order, which puts "After School" first
      // and Registration last. Order by clock time so the chips read as a school
      // day and the default lands on the first period rather than the evening.
      const teaching = list
        .filter((s) => !s.isBreakOrLunch)
        .sort((a, b) => a.defaultStartTime.localeCompare(b.defaultStartTime));
      setSlots(teaching);
      // Only pick a default period when adding. An edited lesson already has
      // its own times, and overwriting them with Period 1 would silently move
      // the lesson the moment the sheet opened.
      const first = teaching[0];
      if (first && !editing) {
        setSlotName(first.name);
        setStartTime(first.defaultStartTime);
        setEndTime(first.defaultEndTime);
      }
    });
  }, [isOpen, defaultMode, defaultWeek, defaultDay, editing]);

  // Escape closes, like every other dialog in the app. Must sit above the
  // early return - a hook cannot be called conditionally.
  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  const subject = INITIAL_SUBJECTS.find((s) => s.id === subjectId);
  const examSubjects = INITIAL_SUBJECTS.filter((s) => !isNonExamSubject(s.id));
  const nonExamSubjects = INITIAL_SUBJECTS.filter((s) => isNonExamSubject(s.id));
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

  /**
   * Writes the changed fields back to the row being edited.
   *
   * Field-level audit rows rather than one "task updated": a due date that moved
   * from Friday to Monday is the thing a parent needs to see, and a single
   * summary row would have satisfied the audit trail while telling nobody
   * anything.
   */
  const saveEdit = async () => {
    if (!editing) return;

    if (editing.kind === 'TASK') {
      const hours = estimatedHours.trim() === '' ? undefined : Number(estimatedHours);
      const fields = {
        title: normaliseTitle(title),
        subjectId: subjectId as SubjectId,
        description: notes.trim() || undefined,
        dueDate,
        priority,
        estimatedHours: Number.isFinite(hours as number) ? hours : undefined,
        linkedGoalId: linkedGoalId || undefined,
      };
      await db.tasks.update(editing.record.id, fields);
      await logFieldChanges({
        user: 'STUDENT',
        entity: 'Task',
        entityId: editing.record.id,
        before: editing.record as unknown as Record<string, unknown>,
        after: fields as unknown as Record<string, unknown>,
        labels: {
          description: 'notes',
          dueDate: 'due date',
          estimatedHours: 'estimated hours',
          linkedGoalId: 'linked goal',
        },
      });
      toast.success('Homework updated', formatFriendlyDate(dueDate));
      return;
    }

    if (editing.kind === 'REMINDER') {
      const fields = {
        title: normaliseTitle(title),
        date: dueDate,
        category,
        subjectId: subjectId ? (subjectId as SubjectId) : undefined,
        priority,
        notes: notes.trim() || undefined,
      };
      await db.milestones.update(editing.record.id, fields);
      await logFieldChanges({
        user: 'STUDENT',
        entity: 'MilestoneReminder',
        entityId: editing.record.id,
        before: editing.record as unknown as Record<string, unknown>,
        after: fields as unknown as Record<string, unknown>,
        labels: { date: 'when', category: 'type of date' },
      });
      toast.success('Key date updated', formatFriendlyDate(dueDate));
      return;
    }

    // A lesson is edited one row at a time. The multi-day picker adds the same
    // lesson to several days at once, which is a create-only convenience -
    // applying it to an edit would silently spawn rows nobody asked for.
    const fields = {
      activityName: effectiveLessonName,
      subjectId: subjectId ? (subjectId as SubjectId) : undefined,
      weekType,
      dayOfWeek: selectedDays[0] || editing.record.dayOfWeek,
      slotName,
      startTime,
      endTime,
      room: room.trim() || undefined,
    };
    await db.timetableEntries.update(editing.record.id, fields);
    await logFieldChanges({
      user: 'STUDENT',
      entity: 'TimetableEntry',
      entityId: editing.record.id,
      before: editing.record as unknown as Record<string, unknown>,
      after: fields as unknown as Record<string, unknown>,
      labels: {
        activityName: 'lesson',
        weekType: 'week',
        dayOfWeek: 'day',
        slotName: 'period',
        startTime: 'starts',
        endTime: 'ends',
      },
    });
    toast.success('Lesson updated', `${slotName} · ${startTime}-${endTime}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSaving) return;

    setIsSaving(true);
    try {
      if (editing) {
        await saveEdit();
      } else if (mode === 'TASK') {
        const task: Task = {
          id: newId('task'),
          subjectId: subjectId as SubjectId,
          title: normaliseTitle(title),
          description: notes.trim() || undefined,
          dueDate,
          priority,
          isHomework: true,
          isRemediation: false,
          estimatedHours:
            estimatedHours.trim() === '' || !Number.isFinite(Number(estimatedHours))
              ? undefined
              : Number(estimatedHours),
          linkedGoalId: linkedGoalId || undefined,
          xpValue: priority === 'HIGH' ? 60 : 50,
          completed: false,
          createdAt: Date.now(),
          /**
           * Always a real bucket, never undefined. The type has always said an
           * unplanned task is "treated as LATER"; treating and being are not
           * the same, and an undefined bucket cannot be grouped, counted or
           * filtered - which is how seven of eight tasks became invisible to
           * every question about planning.
           */
          ...withTaskDefaults({ bucket: undefined }),
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
          title: normaliseTitle(title),
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick add"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-md bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 pb-safe sm:pb-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">
            {editing
              ? editing.kind === 'TASK'
                ? 'Edit homework'
                : editing.kind === 'REMINDER'
                ? 'Edit key date'
                : 'Edit lesson'
              : 'Add something'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* What kind of thing. Hidden while editing: an existing row cannot
            change from homework into a timetable lesson. */}
        <div className={`grid grid-cols-3 gap-2 mb-4 ${editing ? 'hidden' : ''}`}>
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
              {examSubjects.map((sub) => (
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

            {/* The non-exam subjects sit apart so they read as a deliberate
                choice rather than a tenth subject somebody forgot to grade. */}
            {nonExamSubjects.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 mt-1.5 pt-1.5 border-t border-slate-800">
                {nonExamSubjects.map((sub) => (
                  <button
                    type="button"
                    key={sub.id}
                    onClick={() => setSubjectId(subjectId === sub.id ? '' : sub.id)}
                    className={`flex items-center gap-1.5 px-2 py-2 rounded-xl border text-left transition-all ${
                      subjectId === sub.id
                        ? 'bg-indigo-600 border-indigo-400 text-white'
                        : 'bg-slate-800/60 border-slate-700/70 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <span className="text-base leading-none">{sub.icon}</span>
                    <span className="text-[10px] font-bold leading-tight">{sub.shortName}</span>
                  </button>
                ))}
              </div>
            )}

            {mode === 'TASK' && (
              <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">
                {schoolInSession
                  ? 'Pre-filled from the lesson happening now — tap to change.'
                  : 'No lesson running, so this is a guess from your last task. Use General or Revision for work that is not aimed at one subject.'}
              </p>
            )}
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

              {/* Hours feed the Plan tab's live workload total; the linked goal
                  is what lets a piece of homework belong to something bigger
                  than itself. Both were previously set-once-at-creation only,
                  and the goal link had no UI at all. */}
              {mode === 'TASK' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="quick-add-hours"
                      className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5"
                    >
                      Rough hours
                    </label>
                    <input
                      id="quick-add-hours"
                      type="number"
                      min="0"
                      max="20"
                      step="0.5"
                      placeholder="1.5"
                      value={estimatedHours}
                      onChange={(e) => setEstimatedHours(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white placeholder-slate-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="quick-add-goal"
                      className="block text-[11px] font-bold text-slate-300 uppercase mb-1.5"
                    >
                      Towards a goal
                    </label>
                    <select
                      id="quick-add-goal"
                      value={linkedGoalId}
                      onChange={(e) => setLinkedGoalId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
                    >
                      <option value="">Not linked</option>
                      {goals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
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
                : editing
                ? 'Save changes'
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

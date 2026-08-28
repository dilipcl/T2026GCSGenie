import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Goal, GoalStatus, PriorityLevel, SubjectId, UserRole } from '../../types';
import { calculateBurnoutCapacity } from '../../services/burnoutEngine';
import { logAuditEvent, logFieldChanges } from '../../services/auditService';
import { useFeedback } from '../shared/FeedbackProvider';
import { X, Target, AlertTriangle, Sparkles, Save, Lock, PencilLine } from 'lucide-react';
import { newId } from '../../utils/id';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';

interface GoalConsultationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Omitted when proposing something new. */
  goal?: Goal | null;
  currentRole: UserRole;
}

const CATEGORIES: { id: Goal['category']; label: string }[] = [
  { id: 'ACADEMIC_GRADE_9', label: 'Academic (Grade 9)' },
  { id: 'CO_CURRICULAR', label: 'Co-Curricular' },
  { id: 'PERSONAL', label: 'Personal' },
];

const BLANK = {
  title: '',
  category: 'CO_CURRICULAR' as Goal['category'],
  subjectId: '' as SubjectId | '',
  targetDate: '',
  priority: 'MEDIUM' as PriorityLevel,
  smartSpecific: '',
  smartMeasurable: '',
  smartAchievable: '',
  smartRealistic: '',
  smartTimeBound: '',
  weeklyHoursRequired: 2,
  parentNotes: '',
};

/**
 * Propose a goal, and - the part that was missing until August 2026 - go back
 * and change one.
 *
 * A goal used to be write-once: the only exits from a proposal were Approve &
 * Lock or Decline, so a wording the parent disagreed with meant deleting the
 * whole thing and retyping it. That also made the intended launch ritual
 * impossible, which is "the student drafts, reviews and finalises, then the
 * parent reviews" - there was no screen on which to finalise anything.
 *
 * Who may edit what:
 *   DRAFT / PENDING_DISCUSSION  - student or parent. Nothing downstream depends
 *                                on these yet; their hours are not counted.
 *   APPROVED_LOCKED             - parent only. Locking is the parent's act and
 *                                the hours are live in the capacity model, so
 *                                letting the student edit afterwards would be a
 *                                way to edit around the lock.
 */
export const GoalConsultationModal: React.FC<GoalConsultationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  goal,
  currentRole,
}) => {
  const { toast } = useFeedback();
  const [form, setForm] = useState({ ...BLANK });
  const [burnoutWarning, setBurnoutWarning] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);

  const isEditing = !!goal;
  const isLocked = goal?.status === 'APPROVED_LOCKED';
  const canEdit = !isLocked || currentRole === 'PARENT';

  useEffect(() => {
    if (!isOpen) return;
    setBurnoutWarning(null);
    setIsSaving(false);
    setForm(
      goal
        ? {
            title: goal.title,
            category: goal.category,
            subjectId: goal.subjectId ?? '',
            targetDate: goal.targetDate ?? '',
            priority: goal.priority ?? 'MEDIUM',
            smartSpecific: goal.smartSpecific,
            smartMeasurable: goal.smartMeasurable,
            smartAchievable: goal.smartAchievable,
            smartRealistic: goal.smartRealistic,
            smartTimeBound: goal.smartTimeBound,
            weeklyHoursRequired: goal.weeklyHoursRequired,
            parentNotes: goal.parentNotes ?? '',
          }
        : { ...BLANK }
    );
  }, [isOpen, goal]);

  // Escape closes, like every other dialog in the app. Must sit above the
  // early return - a hook cannot be called conditionally.
  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  const set = <K extends keyof typeof BLANK>(key: K, value: (typeof BLANK)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /**
   * The projection has to exclude this goal's own current contribution, or
   * editing a locked 4h goal down to 3h reads as adding another 3h on top of
   * the 4 already counted and warns about an overload that is not happening.
   */
  const handleHoursChange = async (newHours: number) => {
    set('weeklyHoursRequired', newHours);
    const burnout = await calculateBurnoutCapacity();
    const alreadyCounted = isLocked ? goal!.weeklyHoursRequired : 0;
    const projected = burnout.totalScheduledHours - alreadyCounted + newHours;

    if (projected > burnout.safeWeeklyHoursLimit) {
      const over = Math.round((projected - burnout.safeWeeklyHoursLimit) * 10) / 10;
      setBurnoutWarning(
        newHours +
          'h/week would take total commitments to ' +
          Math.round(projected * 10) / 10 +
          'h, which is ' +
          over +
          'h over the safe ' +
          burnout.safeWeeklyHoursLimit +
          'h limit. Worth prioritising together before this is locked.'
      );
    } else {
      setBurnoutWarning(null);
    }
  };

  const buildFields = () => ({
    title: form.title.trim(),
    category: form.category,
    subjectId: (form.subjectId || undefined) as SubjectId | undefined,
    targetDate: form.targetDate || undefined,
    priority: form.priority,
    smartSpecific: form.smartSpecific.trim(),
    smartMeasurable: form.smartMeasurable.trim(),
    smartAchievable: form.smartAchievable.trim(),
    smartRealistic: form.smartRealistic.trim(),
    smartTimeBound: form.smartTimeBound.trim(),
    weeklyHoursRequired: form.weeklyHoursRequired,
    parentNotes: form.parentNotes.trim() || undefined,
  });

  const save = async (nextStatus: GoalStatus) => {
    if (!form.title.trim() || isSaving) return;
    setIsSaving(true);

    try {
      const fields = buildFields();

      if (goal) {
        await db.goals.update(goal.id, { ...fields, status: nextStatus });
        const changes = await logFieldChanges({
          user: currentRole === 'PARENT' ? 'PARENT' : 'STUDENT',
          entity: 'Goal',
          entityId: goal.id,
          before: { ...goal } as Record<string, unknown>,
          after: { ...fields, status: nextStatus } as Record<string, unknown>,
          labels: {
            weeklyHoursRequired: 'weekly hours',
            smartSpecific: 'S - specific',
            smartMeasurable: 'M - measurable',
            smartAchievable: 'A - achievable',
            smartRealistic: 'R - realistic',
            smartTimeBound: 'T - time-bound',
          },
        });

        toast.success(
          changes === 0 ? 'Nothing to save' : '"' + fields.title + '" updated',
          changes === 0
            ? 'No fields were changed.'
            : changes + ' change' + (changes === 1 ? '' : 's') + ' written to the history.'
        );
      } else {
        const created: Goal = {
          id: newId('goal'),
          ...fields,
          status: nextStatus,
          ragStatus: 'GREEN',
          createdAt: Date.now(),
        };
        await db.goals.add(created);
        await logAuditEvent({
          user: currentRole === 'PARENT' ? 'PARENT' : 'STUDENT',
          action: 'INSERT',
          entity: 'Goal',
          entityId: created.id,
          newValue:
            (nextStatus === 'DRAFT' ? 'Drafted goal: ' : 'Proposed goal: ') +
            created.title +
            ' (' +
            created.weeklyHoursRequired +
            'h/wk, ' +
            nextStatus +
            ')',
        });
        toast.success(
          nextStatus === 'DRAFT' ? 'Saved as a draft' : '"' + created.title + '" sent for discussion',
          nextStatus === 'DRAFT'
            ? 'Only you can see it. Send it for discussion when it reads right.'
            : 'A parent reviews it and locks it in.'
        );
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Could not save goal:', err);
      toast.error('Could not save that goal', 'Nothing was changed.');
    } finally {
      setIsSaving(false);
    }
  };

  const smartFields: { key: keyof typeof BLANK; label: string; placeholder: string }[] = [
    {
      key: 'smartSpecific',
      label: 'S - Specific (what exact activity or subject?)',
      placeholder: 'e.g. Guildford City FC U15 training on Wednesday evening',
    },
    {
      key: 'smartMeasurable',
      label: 'M - Measurable (how will progress be tracked?)',
      placeholder: 'e.g. Attend 2 training sessions per week',
    },
    {
      key: 'smartAchievable',
      label: 'A - Achievable (does this fit the week?)',
      placeholder: 'e.g. Fits after school before cadets starts',
    },
    {
      key: 'smartRealistic',
      label: 'R - Realistic (impact on the Grade 9 targets?)',
      placeholder: 'e.g. Kept to max 2 hours to avoid academic stress',
    },
    {
      key: 'smartTimeBound',
      label: 'T - Time-Bound (target or trial deadline?)',
      placeholder: 'e.g. Complete trials by November 2026',
    },
  ];

  const heading = !isEditing
    ? 'Propose a SMART goal'
    : isLocked
    ? 'Edit a locked goal'
    : 'Edit goal';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5 pr-10">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 flex-shrink-0">
            {isEditing ? <PencilLine className="w-5 h-5" /> : <Target className="w-6 h-6" />}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{heading}</h2>
            <p className="text-xs text-slate-400">
              {isEditing
                ? 'Change the wording, the measure or the weekly hours. Every edit is recorded.'
                : 'Write it the SMART way, then a parent talks it through and locks it in.'}
            </p>
          </div>
        </div>

        {!canEdit && (
          <div className="mb-4 p-3 bg-amber-950/30 border border-amber-500/40 rounded-xl text-xs text-amber-100 flex items-start gap-2">
            <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              This goal is locked, and its {goal!.weeklyHoursRequired} hrs/week are already counted
              in the weekly capacity. Ask a parent to unlock it, or to make the change with you.
            </span>
          </div>
        )}

        <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Goal title
            </label>
            <input
              type="text"
              placeholder="e.g. Join local football club / Master OCR CS SQL"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => set('category', item.id)}
                className={`py-2 rounded-xl text-xs font-medium border transition-all text-center ${
                  form.category === item.id
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* The subject a goal belongs to. Without it, study time logged against
              a subject cannot be credited to the goal that asked for it. */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                Subject (optional)
              </label>
              <select
                value={form.subjectId}
                onChange={(e) => set('subjectId', e.target.value as SubjectId | '')}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="">Not subject-specific</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                Target date (optional)
              </label>
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => set('targetDate', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/60 space-y-2.5">
            {smartFields.map((field) => (
              <div key={field.key}>
                <label className="block text-[11px] font-bold text-indigo-300 uppercase">
                  {field.label}
                </label>
                <input
                  type="text"
                  placeholder={field.placeholder}
                  value={form[field.key] as string}
                  onChange={(e) => set(field.key, e.target.value as never)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500"
                />
              </div>
            ))}
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Weekly time commitment
              </label>
              <span className="text-xs font-bold text-indigo-400 bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
                {form.weeklyHoursRequired} hrs / week
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="10.0"
              step="0.5"
              value={form.weeklyHoursRequired}
              onChange={(e) => handleHoursChange(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          {currentRole === 'PARENT' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                Parent notes (optional)
              </label>
              <textarea
                rows={2}
                value={form.parentNotes}
                onChange={(e) => set('parentNotes', e.target.value)}
                placeholder="What was agreed when this was talked through"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
              />
            </div>
          )}

          {burnoutWarning && (
            <div className="p-3 bg-rose-950/40 rounded-xl border border-rose-500/50 text-xs text-rose-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <p>{burnoutWarning}</p>
            </div>
          )}
        </fieldset>

        {canEdit && (
          <div className="pt-4 space-y-2">
            {/* A goal that is already locked keeps its status: saving an edit
                must never quietly unlock it. */}
            {isLocked ? (
              <button
                type="button"
                disabled={isSaving || !form.title.trim()}
                onClick={() => save('APPROVED_LOCKED')}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Save changes (stays locked)</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isSaving || !form.title.trim()}
                  onClick={() => save('PENDING_DISCUSSION')}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {goal?.status === 'PENDING_DISCUSSION'
                      ? 'Save - still awaiting approval'
                      : 'Send for parent discussion'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isSaving || !form.title.trim()}
                  onClick={() => save('DRAFT')}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Keep as a draft</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Goal, MilestoneReminder, PlanBucket, SubjectId } from '../../types';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { addDaysISO, formatCountdown, formatFriendlyDate, parseISODate, todayISO } from '../../utils/date';
import { CalendarPlus, X, Target } from 'lucide-react';

export interface PlannedWork {
  title: string;
  subjectId: SubjectId;
  estimatedHours: number;
  dueDate: string;
  bucket: PlanBucket;
  linkedGoalId?: string;
}

interface Props {
  milestone: MilestoneReminder | null;
  goals: Goal[];
  onCancel: () => void;
  onConfirm: (work: PlannedWork) => Promise<void>;
}

/** Rough shapes of revision, so the common case is one tap rather than typing. */
const SUGGESTIONS = [
  { label: 'Revise the topics', hours: 2 },
  { label: 'Past paper', hours: 1.5 },
  { label: 'Make flashcards / notes', hours: 1 },
  { label: 'Go through the mark scheme', hours: 1 },
];

/**
 * Turning a key date into work that will actually happen.
 *
 * "Coming up" listed the mocks and the coursework deadlines and then did
 * nothing with them - it was a countdown to things arriving, with no route from
 * knowing about one to planning for it. Everything else in the app treats a
 * task as the unit of work, so a key date that never becomes a task is a key
 * date the plan, the load bar and the goal pacing all cannot see.
 *
 * The link back to the milestone is the part that matters: it is what lets the
 * readiness check tell a mock with revision behind it from one that is merely
 * known about.
 */
export const PlanForKeyDateModal: React.FC<Props> = ({
  milestone,
  goals,
  onCancel,
  onConfirm,
}) => {
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState(2);
  const [subjectId, setSubjectId] = useState<SubjectId | ''>('');
  const [goalId, setGoalId] = useState('');
  const [bucket, setBucket] = useState<PlanBucket>('THIS_WEEK');
  const [saving, setSaving] = useState(false);

  useEscapeToClose(!!milestone, onCancel);

  // Reopening for a different key date must not inherit the last one's answers.
  useEffect(() => {
    if (!milestone) return;
    setTitle(`Revise for ${milestone.title}`);
    setHours(2);
    setSubjectId(milestone.subjectId ?? '');
    setGoalId('');
    setBucket('THIS_WEEK');
  }, [milestone]);

  if (!milestone) return null;

  const canSave = title.trim().length > 0 && subjectId !== '' && hours > 0;

  const save = async () => {
    if (saving || !canSave) return;
    setSaving(true);
    try {
      // Revision for a deadline is due before the deadline, not on it - work
      // due the morning of the mock is work that did not happen. Unless the
      // date is already here, in which case the day before is in the past.
      const dayBefore = addDaysISO(-1, parseISODate(milestone.date));
      await onConfirm({
        title: title.trim(),
        subjectId: subjectId as SubjectId,
        estimatedHours: hours,
        dueDate: dayBefore > todayISO() ? dayBefore : milestone.date,
        bucket,
        linkedGoalId: goalId || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  // Goals for this subject first: the one this revision serves is almost always
  // the subject's own Grade 9 goal.
  const relevantGoals = [
    ...goals.filter((g) => g.subjectId && g.subjectId === subjectId),
    ...goals.filter((g) => !g.subjectId || g.subjectId !== subjectId),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Plan work for ${milestone.title}`}
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full sm:max-w-md p-5 shadow-2xl relative max-h-[85vh] overflow-y-auto"
      >
        <button
          onClick={onCancel}
          aria-label="Cancel"
          className="absolute top-3.5 right-3.5 p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 mb-4 pr-6">
          <span className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0">
            <CalendarPlus className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white">Plan work for this</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {milestone.title} · {formatFriendlyDate(milestone.date)} ·{' '}
              {formatCountdown(milestone.date)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => {
                setTitle(`${s.label} — ${milestone.title}`);
                setHours(s.hours);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[10px] font-semibold"
            >
              {s.label}
            </button>
          ))}
        </div>

        <label className="block text-[11px] font-bold text-slate-300 mb-1">What will you do?</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white focus:outline-none focus:border-indigo-500"
        />

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Subject</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value as SubjectId | '')}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-[11px] text-white"
            >
              <option value="">Pick one</option>
              {INITIAL_SUBJECTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Hours</label>
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white"
            />
          </div>
        </div>

        {/* An estimate with no goal behind it is how a term of conscientious
            work moves no goal at all. Offered here, where the answer is known. */}
        <label className="block text-[11px] font-bold text-slate-300 mt-3 mb-1 flex items-center gap-1.5">
          <Target className="w-3 h-3 text-emerald-400" />
          <span>Which goal does this serve?</span>
        </label>
        <select
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-[11px] text-white"
        >
          <option value="">Not linked to a goal</option>
          {relevantGoals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>

        <label className="block text-[11px] font-bold text-slate-300 mt-3 mb-1">When?</label>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { id: 'THIS_WEEK', label: 'This week' },
              { id: 'NEXT_UP', label: 'Next up' },
            ] as { id: PlanBucket; label: string }[]
          ).map((b) => (
            <button
              key={b.id}
              onClick={() => setBucket(b.id)}
              className={`py-2 rounded-lg text-[11px] font-semibold border transition-all ${
                bucket === b.id
                  ? 'bg-indigo-600 text-white border-indigo-400'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-800/80'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={save}
            disabled={!canSave || saving}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-40 transition-all"
          >
            {saving ? 'Adding…' : 'Add this work'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

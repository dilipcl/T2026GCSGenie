import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { loadWeekCommitment } from '../../services/planService';
import { calculateStreakStats, calculateEffortStats } from '../../services/habitEngine';
import { calculateTotalXP } from '../../services/ragCalculator';
import { logAuditEvent } from '../../services/auditService';
import { useFeedback } from '../shared/FeedbackProvider';
import { addDaysISO, formatFriendlyDate, daysUntil } from '../../utils/date';
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,

  Handshake,
} from 'lucide-react';

interface WeeklyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: () => void;
}

type Step = 'LAST_WEEK' | 'NEXT_WEEK' | 'APPROVALS' | 'SIGN_OFF';

const STEPS: { id: Step; label: string }[] = [
  { id: 'LAST_WEEK', label: 'Last week' },
  { id: 'NEXT_WEEK', label: 'Next week' },
  { id: 'APPROVALS', label: 'Approvals' },
  { id: 'SIGN_OFF', label: 'Sign off' },
];

/**
 * The weekly review: fifteen minutes, student and parent together.
 *
 * Everything it shows already exists somewhere in the app. What did not exist
 * was a moment that puts it in one order and ends in an agreement - the habit
 * contract. The student drives; the parent reviews and adds what was missed.
 *
 * The sign-off is written to the change history deliberately: it makes the
 * ritual something with a record, which is what turns it from a good intention
 * into a routine.
 */
export const WeeklyReviewModal: React.FC<WeeklyReviewModalProps> = ({
  isOpen,
  onClose,
  onAddItem,
}) => {
  const { toast } = useFeedback();
  const [step, setStep] = useState<Step>('LAST_WEEK');

  const commitment = useLiveQuery(() => (isOpen ? loadWeekCommitment() : undefined), [isOpen]);
  const streak = useLiveQuery(() => (isOpen ? calculateStreakStats() : undefined), [isOpen]);
  const effort = useLiveQuery(() => (isOpen ? calculateEffortStats() : undefined), [isOpen]);
  const xp = useLiveQuery(() => (isOpen ? calculateTotalXP() : undefined), [isOpen]);

  const pendingRewards = useLiveQuery(
    async () =>
      isOpen ? (await db.redemptions.toArray()).filter((r) => r.status === 'PENDING') : [],
    [isOpen]
  );
  const pendingGoals = useLiveQuery(
    async () =>
      isOpen ? (await db.goals.toArray()).filter((g) => g.status === 'PENDING_DISCUSSION') : [],
    [isOpen]
  );
  const unverifiedPapers = useLiveQuery(
    async () => (isOpen ? (await db.assessments.toArray()).filter((a) => !a.verifiedByParent) : []),
    [isOpen]
  );
  const upcoming = useLiveQuery(
    async () =>
      isOpen
        ? (await db.milestones.orderBy('date').toArray()).filter(
            (m) => !m.isCompleted && daysUntil(m.date) <= 21
          )
        : [],
    [isOpen]
  );

  if (!isOpen) return null;
  if (!commitment || !streak || !effort || !xp) return null;

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const approvalCount =
    (pendingRewards?.length ?? 0) + (pendingGoals?.length ?? 0) + (unverifiedPapers?.length ?? 0);

  const handleSignOff = async () => {
    await logAuditEvent({
      user: 'PARENT',
      action: 'UPDATE',
      entity: 'WeeklyReview',
      entityId: `review_${addDaysISO(0)}`,
      newValue:
        `Weekly review completed. ${commitment.committedDone}/${commitment.committedCount} committed tasks done, ` +
        `${effort.hoursThisWeek}h studied, ${streak.current}-day streak, ${approvalCount} items were awaiting approval.`,
    });
    toast.celebrate('Reviewed together', 'Logged to the change history. Same time next week.');
    setStep('LAST_WEEK');
    onClose();
  };

  const Stat: React.FC<{ label: string; value: string; tone?: string }> = ({
    label,
    value,
    tone,
  }) => (
    <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl">
      <span className="block text-[10px] uppercase font-bold text-slate-500">{label}</span>
      <span className={`block text-lg font-bold ${tone ?? 'text-white'}`}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-2xl bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 pb-safe sm:pb-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Weekly review</h2>
            <p className="text-[11px] text-slate-400">
              Fifteen minutes, together. Tejas drives; a parent reviews and adds anything missed.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress through the four steps */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                i === stepIndex
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : i < stepIndex
                  ? 'bg-slate-800 border-slate-700 text-emerald-400'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {step === 'LAST_WEEK' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat
                label="Committed"
                value={`${commitment.committedDone}/${commitment.committedCount}`}
                tone={
                  commitment.committedCount && commitment.committedDone / commitment.committedCount >= 0.7
                    ? 'text-emerald-300'
                    : 'text-amber-300'
                }
              />
              <Stat label="Studied" value={`${effort.hoursThisWeek}h`} />
              <Stat label="Streak" value={`${streak.current}d`} tone="text-amber-300" />
              <Stat label="XP earned" value={xp.totalXP.toLocaleString()} tone="text-indigo-300" />
            </div>

            {commitment.overdueCommitted > 0 && (
              <p className="text-[11px] text-amber-300 p-2.5 bg-amber-950/30 border border-amber-500/40 rounded-xl">
                {commitment.overdueCommitted} committed{' '}
                {commitment.overdueCommitted === 1 ? 'task is' : 'tasks are'} past their date. Worth
                deciding now whether they move to next week or come off the list.
              </p>
            )}

            <p className="text-[11px] text-slate-400">
              {effort.votes} votes cast for being someone who does the work — {effort.tasksCompleted}{' '}
              tasks, {effort.questsCompleted} quests, {effort.checkInDays} days checked in.
            </p>
          </div>
        )}

        {step === 'NEXT_WEEK' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-300">
              What Tejas has committed to. Anything that will not realistically happen is better
              moved now than missed later.
            </p>

            {commitment.columns.THIS_WEEK.filter((t) => !t.completed).length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-900/70 rounded-xl border border-slate-800">
                Nothing committed for the coming week yet — do that on the Plan tab together.
              </p>
            ) : (
              <div className="space-y-1.5">
                {commitment.columns.THIS_WEEK.filter((t) => !t.completed).map((t) => {
                  const subject = INITIAL_SUBJECTS.find((s) => s.id === t.subjectId);
                  return (
                    <div
                      key={t.id}
                      className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center gap-2"
                    >
                      <span className="text-sm">{subject?.icon}</span>
                      <span className="text-xs text-white flex-1 min-w-0 truncate">{t.title}</span>
                      <span className="text-[10px] text-slate-500">
                        {formatFriendlyDate(t.dueDate)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {(upcoming?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                  Key dates within three weeks
                </p>
                <div className="space-y-1">
                  {upcoming!.map((m) => (
                    <p key={m.id} className="text-[11px] text-slate-300">
                      · {m.title} — {formatFriendlyDate(m.date)}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={onAddItem}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-all"
            >
              Parent: add anything missed (chore, family event, forgotten homework)
            </button>
          </div>
        )}

        {step === 'APPROVALS' && (
          <div className="space-y-3">
            {approvalCount === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-900/70 rounded-xl border border-slate-800">
                Nothing waiting. Approvals for rewards, goals and marked papers would appear here.
              </p>
            ) : (
              <>
                {(pendingRewards?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                      Reward requests ({pendingRewards!.length})
                    </p>
                    {pendingRewards!.map((r) => (
                      <p key={r.id} className="text-[11px] text-slate-300">
                        · {r.rewardTitle} — {r.costXP} XP held
                      </p>
                    ))}
                  </div>
                )}
                {(pendingGoals?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                      Goals awaiting approval ({pendingGoals!.length})
                    </p>
                    {pendingGoals!.map((g) => (
                      <p key={g.id} className="text-[11px] text-slate-300">
                        · {g.title} — {g.weeklyHoursRequired} hrs/wk
                      </p>
                    ))}
                  </div>
                )}
                {(unverifiedPapers?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                      Marked work not yet verified ({unverifiedPapers!.length})
                    </p>
                    {unverifiedPapers!.map((a) => (
                      <p key={a.id} className="text-[11px] text-slate-300">
                        · {a.title} — {a.marksScored}/{a.marksAvailable} ({a.percentage}%)
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-slate-500">
                  Handle these in Rewards, Subjects &amp; Goals and the Proof Log — this is the
                  checklist, not the controls.
                </p>
              </>
            )}
          </div>
        )}

        {step === 'SIGN_OFF' && (
          <div className="space-y-3">
            <div className="p-4 bg-emerald-950/25 border border-emerald-500/40 rounded-2xl">
              <div className="flex items-center gap-2 mb-2">
                <Handshake className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Agreed for the week</h3>
              </div>
              <p className="text-xs text-emerald-100">
                {commitment.committedCount - commitment.committedDone} tasks committed
                {commitment.committedHours > 0 && `, about ${commitment.committedHours} hours`}.
                Signing off records this in the change history so next week starts from something
                real rather than memory.
              </p>
            </div>

            <button
              onClick={handleSignOff}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Reviewed together</span>
            </button>
          </div>
        )}

        {/* Step navigation */}
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-800">
          <button
            onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].id)}
            disabled={stepIndex === 0}
            className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold disabled:opacity-30 flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          {stepIndex < STEPS.length - 1 && (
            <button
              onClick={() => setStep(STEPS[stepIndex + 1].id)}
              className="ml-auto px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

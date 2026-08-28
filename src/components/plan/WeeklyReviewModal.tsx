import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { loadWeekCommitment } from '../../services/planService';
import { calculateStreakStats, calculateEffortStats } from '../../services/habitEngine';
import { calculateTotalXP } from '../../services/ragCalculator';
import { choreWeekSummary, saveChore, CADENCE_LABEL } from '../../services/choreService';
import { lockedGoalProgress } from '../../services/goalProgress';
import { ChoreCadence } from '../../types';
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
import { useEscapeToClose } from '../../hooks/useEscapeToClose';

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
  const chores = useLiveQuery(() => (isOpen ? choreWeekSummary() : undefined), [isOpen]);
  const goalHours = useLiveQuery(() => (isOpen ? lockedGoalProgress() : []), [isOpen], []);

  // Adding a chore inline rather than sending the parent to the Parent Portal.
  // This is a fifteen-minute ritual with both people sitting down; navigating
  // away from it to log "put the bins out" is how the ritual stops happening.
  const [choreTitle, setChoreTitle] = useState('');
  const [choreCadence, setChoreCadence] = useState<ChoreCadence>('WEEKLY');

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

  // Escape closes, like every other dialog in the app. Must sit above the
  // early return - a hook cannot be called conditionally.
  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;
  if (!commitment || !streak || !effort || !xp) return null;

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const approvalCount =
    (pendingRewards?.length ?? 0) + (pendingGoals?.length ?? 0) + (unverifiedPapers?.length ?? 0);

  const handleAddChore = async () => {
    const title = choreTitle.trim();
    if (!title) return;
    try {
      await saveChore({ title, cadence: choreCadence });
      setChoreTitle('');
      toast.success('Chore added', `${title} · ${CADENCE_LABEL[choreCadence].toLowerCase()}`);
    } catch (err) {
      console.error('Could not add chore:', err);
      toast.error('Could not add that chore', 'Nothing was changed.');
    }
  };

  const handleSignOff = async () => {
    await logAuditEvent({
      user: 'PARENT',
      action: 'UPDATE',
      entity: 'WeeklyReview',
      entityId: `review_${addDaysISO(0)}`,
      newValue:
        `Weekly review completed. ${commitment.committedDone}/${commitment.committedCount} committed tasks done, ` +
        `${effort.hoursThisWeek}h studied, ${streak.current}-day streak, ${approvalCount} items were awaiting approval` +
        ((chores?.due ?? 0) > 0 ? `, chores ${chores!.done}/${chores!.due}.` : '.'),
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Weekly review"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
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

        {/* Progress through the four steps. Any step is reachable directly -
            nothing is gated behind "Next" - but at py-1.5 these were 24px tall,
            well under a thumb, which is why jumping straight to Sign off could
            look like it had been refused. */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              aria-current={i === stepIndex ? 'step' : undefined}
              className={`flex-1 min-h-[44px] px-1 rounded-lg text-[10px] font-bold border transition-all ${
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

        {/* Every locked goal against the hours it reserved. The review is the
            natural place for it: this is the conversation where a goal that is
            not getting its time either gets it or gets renegotiated. */}
        {step === 'LAST_WEEK' && goalHours.length > 0 && (
          <div className="mt-3 p-3 bg-slate-900/70 border border-slate-800 rounded-xl space-y-2">
            <p className="text-xs font-bold text-white">Goals against their weekly hours</p>
            {goalHours.map((p) => (
              <div key={p.goal.id} className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-300 flex-1 min-w-0 truncate">
                  {p.goal.title}
                </span>
                {p.isUnattributable ? (
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">no subject set</span>
                ) : (
                  <span
                    className={`text-[11px] font-bold whitespace-nowrap ${
                      p.needsAction ? 'text-amber-300' : 'text-emerald-300'
                    }`}
                  >
                    {p.actualHours} / {p.targetHours}h
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {step === 'LAST_WEEK' && (chores?.due ?? 0) > 0 && (
          <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl">
            <p className="text-xs font-bold text-white">
              Chores: {chores!.done} of {chores!.due} done
              {chores!.xp > 0 ? ` · ${chores!.xp} XP` : ''}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              The small reliable jobs. Worth naming out loud - they are the easiest evidence that
              the week held together.
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

            <div className="pt-1 space-y-2">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Parent: add anything missed
              </p>

              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  value={choreTitle}
                  onChange={(e) => setChoreTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddChore();
                  }}
                  placeholder="A recurring chore"
                  className="flex-1 min-w-[8rem] bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() =>
                    setChoreCadence(choreCadence === 'WEEKLY' ? 'DAILY' : 'WEEKLY')
                  }
                  className="px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-bold"
                >
                  {CADENCE_LABEL[choreCadence]}
                </button>
                <button
                  onClick={handleAddChore}
                  disabled={!choreTitle.trim()}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-40"
                >
                  Add
                </button>
              </div>

              <button
                onClick={onAddItem}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-all"
              >
                Or add a one-off: homework, key date or lesson
              </button>
            </div>
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

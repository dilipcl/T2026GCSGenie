import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Task, PlanBucket, MilestoneReminder } from '../../types';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import {
  loadWeekCommitment,
  inferBucket,
  moveTaskToBucket,
  assessPlan,
  taskHours,
} from '../../services/planService';
import { calculateBurnoutCapacity } from '../../services/burnoutEngine';
import { useFeedback } from '../shared/FeedbackProvider';
import { formatFriendlyDate, formatCountdown, daysUntil } from '../../utils/date';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Gauge,
  Plus,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { InfoTip } from '../shared/InfoTip';
import { DeferReasonModal } from './DeferReasonModal';

interface PlanViewProps {
  onAdd: () => void;
  onOpenReview: () => void;
}

const BUCKETS: { id: PlanBucket; label: string; blurb: string }[] = [
  { id: 'THIS_WEEK', label: 'This week', blurb: 'What you have promised' },
  { id: 'NEXT_UP', label: 'Next up', blurb: 'Roughly this month' },
  { id: 'LATER', label: 'Later this term', blurb: 'Known about, not yet planned' },
];

/**
 * The weekly commitment.
 *
 * Work was one flat list sorted by due date, which gave no moment of deciding
 * what this week actually holds. Three buckets make that decision explicit, and
 * make moving something out of it a normal act rather than a failure - which is
 * the release valve that stops a heavy week turning into a quit.
 *
 * Key dates live here too rather than in their own tab: a deadline is only
 * meaningful next to the work meant to meet it.
 */
export const PlanView: React.FC<PlanViewProps> = ({ onAdd, onOpenReview }) => {
  const { toast } = useFeedback();
  const [deferring, setDeferring] = useState<{ task: Task; bucket: PlanBucket } | null>(null);

  const commitment = useLiveQuery(() => loadWeekCommitment(), []);
  const burnout = useLiveQuery(() => calculateBurnoutCapacity(), []);
  const milestones = useLiveQuery<MilestoneReminder[]>(
    async () => (await db.milestones.orderBy('date').toArray()).filter((m) => !m.isCompleted),
    []
  );

  if (!commitment || !burnout || !milestones) return null;

  // What the plan can occupy: the ceiling less school and fixed commitments
  const safeStudyHours =
    Math.round((burnout.safeWeeklyHoursLimit - (burnout.totalScheduledHours - burnout.loggedRevisionHours)) * 10) / 10;
  const health = assessPlan(commitment, Math.max(0, safeStudyHours));

  const move = async (task: Task, bucket: PlanBucket) => {
    if (bucket === 'THIS_WEEK') {
      await moveTaskToBucket(task, bucket);
      toast.success(`Committed "${task.title}"`, 'It counts towards this week now.');
      return;
    }

    /**
     * EXC-5. Breaking a promise made for this week is the moment worth a
     * sentence; shuffling the backlog around is not. So the reason is asked for
     * only on the way out of THIS_WEEK, and is optional even then - the
     * planner's whole stance is that deferring is planning, not failing, and a
     * required justification would turn it back into a confession.
     */
    if (inferBucket(task) === 'THIS_WEEK') {
      setDeferring({ task, bucket });
      return;
    }

    await moveTaskToBucket(task, bucket);
    toast.info(`Moved "${task.title}"`, 'It is off the list for this week.');
  };

  const confirmDefer = async (reason: string) => {
    if (!deferring) return;
    const { task, bucket } = deferring;
    setDeferring(null);

    await moveTaskToBucket(task, bucket, reason || undefined);
    toast.info(
      `Moved "${task.title}" out of this week`,
      reason
        ? `Logged: ${reason}. Deferring is planning, not failing.`
        : 'Deferring is planning, not failing - it stops counting against you.'
    );
  };

  const soonMilestones = milestones.filter((m) => daysUntil(m.date) <= 21);
  const loadPercent = health.safeStudyHours
    ? Math.min(140, Math.round((health.committedHours / health.safeStudyHours) * 100))
    : 0;

  return (
    <div className="space-y-5">
      {/* The week's promise */}
      <div className="glass-card p-5 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-indigo-500/30">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <CalendarClock className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white">Plan</h2>
            </div>
            <p className="text-xs text-slate-300 max-w-lg">
              Decide what this week actually holds. Anything you move out stops counting against
              you — that is the point of it.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenReview}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-all"
            >
              Weekly review
            </button>
            <button
              onClick={onAdd}
              className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>
        </div>

        {/* Committed n of m · x h, against the headroom a plan can use */}
        <div className="mt-4 pt-4 border-t border-slate-800">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>
                Committed {commitment.committedDone} of {commitment.committedCount}
                <span className="text-slate-400 font-normal">
                  {' · '}
                  {commitment.committedHours}h of {health.safeStudyHours}h study time left this week
                </span>
              </span>
              <InfoTip label="Committed vs capacity">
                Hours you have promised this week vs. what safely fits. Move things out and they
                stop counting against you.
              </InfoTip>
            </span>
            <span
              className={`text-[11px] font-bold ${
                health.isOvercommitted ? 'text-rose-300' : 'text-emerald-300'
              }`}
            >
              {health.isOvercommitted ? 'Over your headroom' : 'Fits'}
            </span>
          </div>

          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
            <div
              className={`h-full transition-all duration-300 ${
                health.isOvercommitted
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                  : 'bg-gradient-to-r from-indigo-500 to-emerald-400'
              }`}
              style={{ width: `${Math.min(100, loadPercent)}%` }}
            />
          </div>
        </div>

        {health.isOvercommitted && (
          <div className="mt-3 p-3 bg-rose-950/40 border border-rose-500/50 rounded-xl text-xs text-rose-100 flex items-start gap-2">
            <Gauge className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>
              You have promised {commitment.committedHours}h but only have about{' '}
              {health.safeStudyHours}h of study time after school, cadets and everything else. Move
              something to Next up before Thursday decides for you.
            </span>
          </div>
        )}

        {health.slipping && (
          <div className="mt-3 p-3 bg-amber-950/40 border border-amber-500/50 rounded-xl text-xs text-amber-100 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>{health.slippingReason}</span>
          </div>
        )}
      </div>

      {/* The three buckets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {BUCKETS.map((bucket) => {
          const items = commitment.columns[bucket.id];
          const pending = items.filter((t) => !t.completed);

          return (
            <div key={bucket.id} className="glass-card p-4">
              <div className="flex items-baseline justify-between mb-3 pb-2.5 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">{bucket.label}</h3>
                  <p className="text-[10px] text-slate-500">{bucket.blurb}</p>
                </div>
                <span className="text-[11px] font-mono text-slate-400">{pending.length}</span>
              </div>

              {pending.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic py-4 text-center">
                  {bucket.id === 'THIS_WEEK'
                    ? 'Nothing committed yet. Pull something across from Next up.'
                    : 'Empty.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {pending.map((task) => {
                    const subject = INITIAL_SUBJECTS.find((s) => s.id === task.subjectId);
                    const overdue = daysUntil(task.dueDate) < 0;
                    const index = BUCKETS.findIndex((b) => b.id === bucket.id);

                    return (
                      <div
                        key={task.id}
                        className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-xl"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-base leading-none mt-0.5">{subject?.icon}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white leading-snug">
                              {task.title}
                            </p>
                            <p
                              className={`text-[10px] mt-0.5 ${
                                overdue ? 'text-rose-300 font-semibold' : 'text-slate-500'
                              }`}
                            >
                              {formatFriendlyDate(task.dueDate)} · {taskHours(task)}h
                            </p>
                          </div>
                        </div>

                        {/* One tap each way. Deferring is meant to feel routine. */}
                        <div className="flex items-center gap-1 mt-2">
                          <button
                            onClick={() => move(task, BUCKETS[Math.max(0, index - 1)].id)}
                            disabled={index === 0}
                            aria-label={`Move "${task.title}" towards this week`}
                            className="p-1 rounded-lg text-slate-500 hover:text-emerald-300 hover:bg-slate-800 disabled:opacity-20 disabled:hover:text-slate-500 transition-colors"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              move(task, BUCKETS[Math.min(BUCKETS.length - 1, index + 1)].id)
                            }
                            disabled={index === BUCKETS.length - 1}
                            aria-label={`Move "${task.title}" out to later`}
                            className="p-1 rounded-lg text-slate-500 hover:text-amber-300 hover:bg-slate-800 disabled:opacity-20 disabled:hover:text-slate-500 transition-colors"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>

                          {bucket.id === 'THIS_WEEK' && (
                            <button
                              onClick={async () => {
                                await db.tasks.update(task.id, {
                                  completed: true,
                                  completedAt: Date.now(),
                                });
                                toast.celebrate(`Done: ${task.title}`, `+${task.xpValue} XP`);
                              }}
                              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold hover:bg-emerald-600/30 transition-colors"
                            >
                              <Circle className="w-3 h-3" />
                              <span>Done</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {bucket.id === 'THIS_WEEK' && commitment.committedDone > 0 && (
                <p className="mt-3 pt-2.5 border-t border-slate-800 text-[10px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>
                    {commitment.committedDone} finished this week
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Key dates, next to the work meant to meet them */}
      <div className="glass-card p-5">
        <div className="flex items-baseline justify-between mb-3 pb-2.5 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white">Coming up</h3>
          <span className="text-[11px] text-slate-400">next three weeks</span>
        </div>

        {soonMilestones.length === 0 ? (
          <p className="text-xs text-slate-500 italic">Nothing in the next three weeks.</p>
        ) : (
          <div className="space-y-2">
            {soonMilestones.map((m) => {
              const subject = INITIAL_SUBJECTS.find((s) => s.id === m.subjectId);
              return (
                <div
                  key={m.id}
                  className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base leading-none">{subject?.icon ?? '📌'}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{m.title}</p>
                      <p className="text-[10px] text-slate-500">
                        {formatFriendlyDate(m.date)} · {m.category.replace(/_/g, ' ').toLowerCase()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                      daysUntil(m.date) <= 7
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {formatCountdown(m.date)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DeferReasonModal
        task={deferring?.task ?? null}
        onCancel={() => setDeferring(null)}
        onConfirm={confirmDefer}
      />
    </div>
  );
};

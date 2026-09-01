import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Task, PlanBucket, MilestoneReminder, Goal, PlanAmendment } from '../../types';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import {
  loadWeekCommitment,
  inferBucket,
  moveTaskToBucket,
  assessPlan,
  taskHours,
} from '../../services/planService';
import { calculateBurnoutCapacity, safeStudyHours } from '../../services/burnoutEngine';
import { useFeedback } from '../shared/FeedbackProvider';
import { recordChange } from '../../services/changeLogService';
import { formatFriendlyDate, formatCountdown, daysUntil, addDaysISO } from '../../utils/date';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Gauge,
  Plus,
  CheckCircle2,
  Circle,
  ArrowLeftRight,
  Target,
  CalendarPlus,
} from 'lucide-react';
import { InfoTip } from '../shared/InfoTip';
import { DeferReasonModal } from './DeferReasonModal';
import { PlanFinalisationCard } from './PlanFinalisationCard';
import { WeekActivitiesPanel } from './WeekActivitiesPanel';
import { BringIntoWeekModal } from './BringIntoWeekModal';
import { PlanForKeyDateModal, PlannedWork } from './PlanForKeyDateModal';
import {
  amendmentsFor,
  commitToWeek,
  goalFocus,
  loadBaseline,
  planAmendment,
  readinessChecks,
  submitForApproval,
  weekStartISO,
  AmendmentPlan,
} from '../../services/planBaselineService';
import { newId } from '../../utils/id';
import { logAuditEvent } from '../../services/auditService';

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

  const [bringingIn, setBringingIn] = useState<{ task: Task; plan: AmendmentPlan } | null>(null);
  const [planningFor, setPlanningFor] = useState<MilestoneReminder | null>(null);

  const commitment = useLiveQuery(() => loadWeekCommitment(), []);
  const baseline = useLiveQuery(() => loadBaseline(), []);
  const amendments = useLiveQuery(() => amendmentsFor(), [], [] as PlanAmendment[]);
  const allTasks = useLiveQuery(() => db.tasks.toArray(), [], [] as Task[]);
  const goals = useLiveQuery(() => db.goals.toArray(), [], [] as Goal[]);
  const burnout = useLiveQuery(() => calculateBurnoutCapacity(), []);
  const milestones = useLiveQuery<MilestoneReminder[]>(
    async () => (await db.milestones.orderBy('date').toArray()).filter((m) => !m.isCompleted),
    []
  );

  if (!commitment || !burnout || !milestones) return null;

  // What the plan can occupy: the ceiling less school and fixed commitments.
  // The engine owns this sum; writing it out again here is how the planner and
  // the dashboard came to disagree about how much time the week actually had.
  const headroomHours = safeStudyHours(burnout);
  const health = assessPlan(commitment, Math.max(0, headroomHours));

  const headroom = Math.max(0, headroomHours);
  const checks = readinessChecks({
    commitment,
    safeStudyHours: headroom,
    milestones,
    allTasks,
  });
  const focus = goalFocus(commitment.columns.THIS_WEEK);

  const move = async (task: Task, bucket: PlanBucket) => {
    if (bucket === 'THIS_WEEK') {
      /**
       * Once the week is agreed, pulling something in is no longer free. The
       * modal is where the trade gets made; before approval this never fires
       * and the move stays one tap, which is how planning should feel.
       */
      const plan = planAmendment(task, commitment, headroom, baseline);
      if (plan.needsAmendment) {
        setBringingIn({ task, plan });
        return;
      }

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
    await recordChange({
      category: 'PLAN',
      summary: `Moved "${task.title}" out of this week`,
      detail: reason || undefined,
    });
    toast.info(
      `Moved "${task.title}" out of this week`,
      reason
        ? `Logged: ${reason}. Deferring is planning, not failing.`
        : 'Deferring is planning, not failing - it stops counting against you.'
    );
  };

  const submitPlan = async (note?: string) => {
    await submitForApproval(commitment, note, weekStartISO());
    await recordChange({
      category: 'PLAN',
      summary: `Sent this week's plan for approval — ${commitment.committedCount} tasks, ${commitment.committedHours}h`,
      detail: note,
      entity: 'WeekPlanBaseline',
      entityId: weekStartISO(),
    });
    toast.success('Sent for approval', 'A parent agrees it, and then it is the baseline.');
  };

  /** The swap, applied: out first so the week never briefly holds both. */
  const confirmBringIn = async (displaced: Task | undefined, reason: string) => {
    if (!bringingIn) return;
    const { task } = bringingIn;
    setBringingIn(null);

    if (displaced) {
      await moveTaskToBucket(displaced, 'NEXT_UP', `Swapped out for "${task.title}"`);
    }
    await moveTaskToBucket(task, 'THIS_WEEK');
    await commitToWeek({ task, displaced, reason });

    await recordChange({
      category: 'PLAN',
      summary: displaced
        ? `Swapped "${displaced.title}" out for "${task.title}" in an agreed week`
        : `Added "${task.title}" on top of an agreed week`,
      detail: reason || undefined,
      entity: 'Task',
      entityId: task.id,
    });

    toast.success(
      displaced ? 'Swapped over' : 'Added on top',
      displaced
        ? `"${displaced.title}" moved to Next up. The week keeps its shape.`
        : `The week grew. It is on the record, which is the point.`
    );
  };

  /** A key date becomes work the plan can actually see. */
  const createWorkForKeyDate = async (work: PlannedWork) => {
    const milestone = planningFor;
    if (!milestone) return;
    setPlanningFor(null);

    const now = Date.now();
    // Mirrors moveTaskToBucket: a promise for this week cannot be dated a
    // fortnight out, or the list stops meaning anything.
    const dueDate =
      work.bucket === 'THIS_WEEK' && daysUntil(work.dueDate) > 7 ? addDaysISO(7) : work.dueDate;

    const task: Task = {
      id: newId('task'),
      subjectId: work.subjectId,
      bucket: work.bucket,
      committedAt: work.bucket === 'THIS_WEEK' ? now : undefined,
      estimatedHours: work.estimatedHours,
      title: work.title,
      description: `Planned for ${milestone.title} (${formatFriendlyDate(milestone.date)}).`,
      dueDate,
      priority: 'HIGH',
      isHomework: false,
      isRemediation: false,
      linkedGoalId: work.linkedGoalId,
      linkedMilestoneId: milestone.id,
      xpValue: 60,
      completed: false,
      createdAt: now,
    };

    await db.tasks.add(task);
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'Task',
      entityId: task.id,
      newValue: `${task.title} [planned for "${milestone.title}", ${work.estimatedHours}h]`,
    });

    if (work.bucket === 'THIS_WEEK') {
      await commitToWeek({ task, reason: `Planned for "${milestone.title}"` });
    }

    await recordChange({
      category: 'PLAN',
      summary: `Planned work for "${milestone.title}"`,
      detail: `${task.title} — ${work.estimatedHours}h`,
      entity: 'Task',
      entityId: task.id,
    });

    toast.success('Added to the plan', `"${task.title}" now counts towards ${milestone.title}.`);
  };

  /** Pointing a task at the goal it serves, from where the gap is visible. */
  const linkToGoal = async (task: Task, goalId: string) => {
    await db.tasks.update(task.id, { linkedGoalId: goalId || undefined });
    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'Task',
      entityId: task.id,
      fieldChanged: 'linkedGoalId',
      oldValue: task.linkedGoalId ?? '(none)',
      newValue: goals.find((g) => g.id === goalId)?.title ?? '(none)',
    });
  };

  const isBaselined = baseline?.status === 'BASELINED';
  /** Whether a key date already has unfinished work pointed at it. */
  const plannedFor = (milestoneId: string) =>
    allTasks.some((t) => t.linkedMilestoneId === milestoneId && !t.completed);

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

      {/* Before the checklist: study time is what is left after everything
          else, so the week's other commitments have to be on the page before
          "does this fit" means anything. */}
      <WeekActivitiesPanel weekStart={weekStartISO()} />

      <PlanFinalisationCard
        checks={checks}
        baseline={baseline}
        amendments={amendments}
        onSubmit={submitPlan}
      />

      {/* Work that is not aimed at anything.

          A term of homework can be done conscientiously and still move no goal
          at all - the work is real, it is just pointed elsewhere. Shown only
          when it is a real share of the week, because one stray permission slip
          is not drift, it is a permission slip. */}
      {focus.offGoal.length > 0 && (
        <div className="glass-card p-4 border border-amber-500/40 bg-amber-950/20">
          <div className="flex items-start gap-2.5">
            <Target className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-bold text-amber-100">
                {focus.offGoalHours}h of this week is not linked to a goal
              </h3>
              <p className="text-[11px] text-amber-100/80 mt-0.5 leading-snug">
                {focus.offGoalShare > 0.5
                  ? 'Most of what you have promised is pointed at nothing in particular. Work still counts, but it is not moving a Grade 9 goal.'
                  : 'Link each one to the goal it serves, so the hours show up where they belong.'}
              </p>
            </div>
          </div>
        </div>
      )}

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

                        {/* The goal this serves, asked for where its absence is
                            visible. A select rather than another modal: the
                            answer is one tap and the alert above is useless
                            without a way to act on it. */}
                        {bucket.id === 'THIS_WEEK' && !task.linkedGoalId && goals.length > 0 && (
                          <select
                            aria-label={`Link "${task.title}" to a goal`}
                            value=""
                            onChange={(e) => linkToGoal(task, e.target.value)}
                            className="w-full mt-2 bg-slate-950 border border-amber-500/40 rounded-lg px-2 py-1.5 text-[10px] text-amber-100"
                          >
                            <option value="">⚠ Not linked to a goal — pick one</option>
                            {goals.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.title}
                              </option>
                            ))}
                          </select>
                        )}

                        {/* One tap each way. Deferring is meant to feel routine. */}
                        <div className="flex items-center gap-1 mt-2">
                          {/* Named rather than a bare chevron. "Coming up" work
                              could always be pulled in, but only through an arrow
                              small enough that nobody found it. */}
                          {bucket.id !== 'THIS_WEEK' ? (
                            <button
                              onClick={() => move(task, 'THIS_WEEK')}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-200 text-[10px] font-bold hover:bg-indigo-600/30 transition-colors"
                            >
                              <ArrowLeftRight className="w-3 h-3" />
                              <span>{isBaselined ? 'Swap in' : 'Pull in'}</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => move(task, BUCKETS[Math.max(0, index - 1)].id)}
                              disabled
                              aria-label={`"${task.title}" is already committed`}
                              className="p-1 rounded-lg text-slate-500 opacity-20"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                          )}
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
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                        daysUntil(m.date) <= 7
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {formatCountdown(m.date)}
                    </span>

                    {/* The route from knowing about a date to planning for it.
                        Without this the panel was a countdown to things
                        arriving, which the plan could not see. */}
                    {plannedFor(m.id) ? (
                      <span className="text-[10px] font-bold text-emerald-300 flex items-center gap-1 px-2 py-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Planned</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => setPlanningFor(m)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-[10px] font-bold hover:bg-amber-500/25 transition-colors"
                      >
                        <CalendarPlus className="w-3 h-3" />
                        <span>Plan work</span>
                      </button>
                    )}
                  </div>
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

      <BringIntoWeekModal
        task={bringingIn?.task ?? null}
        plan={bringingIn?.plan}
        onCancel={() => setBringingIn(null)}
        onConfirm={confirmBringIn}
      />

      <PlanForKeyDateModal
        milestone={planningFor}
        goals={goals}
        onCancel={() => setPlanningFor(null)}
        onConfirm={createWorkForKeyDate}
      />
    </div>
  );
};

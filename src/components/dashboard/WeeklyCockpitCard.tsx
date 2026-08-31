import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Task, UserRole, WeekType } from '../../types';
import { calculateBurnoutCapacity } from '../../services/burnoutEngine';
import { lockedGoalProgress } from '../../services/goalProgress';
import { goalTrend, type Trend } from '../../services/goalTrend';
import { choresForDay, setChoreDone } from '../../services/choreService';
import { occasionsOn, CommitmentOccasion } from '../../services/commitmentService';
import { logAuditEvent } from '../../services/auditService';
import { daysUntil, todayISO } from '../../utils/date';
import { PaceBar, PACE_TEXT } from '../shared/PaceBar';
import { Sparkline } from '../shared/Sparkline';
import { InfoTip } from '../shared/InfoTip';
import { useFeedback } from '../shared/FeedbackProvider';
import { useChangeGuard } from '../shared/ChangeGuardProvider';
import { CommitmentExceptionModal } from '../commitments/CommitmentExceptionModal';
import {
  BatteryCharging,
  AlertTriangle,
  ShieldAlert,
  CalendarClock,
  Check,
  Target,
  CalendarOff,
  ChevronRight,
} from 'lucide-react';

interface WeeklyCockpitCardProps {
  activeWeek: WeekType;
  currentRole: UserRole;
  onOpenGoals: () => void;
  onOpenTasks: () => void;
  onOpenTimetable: () => void;
}

/**
 * The one screen the app is opened to read.
 *
 * The dashboard used to stack eight cards: what is due, log today, the timer,
 * the streak, chores, the schedule, the quests, and the workload gauge at the
 * very bottom. Every one of them earned its place individually, and together
 * they answered "how is the week going" only for someone willing to scroll and
 * add up. The film promises the opposite - "one clear picture, not a wall of
 * tasks" - so this consolidates the three questions that actually get asked
 * into a single card:
 *
 *   A. Are the goals getting the hours they reserved?
 *   B. How full is the week, and what is left?
 *   C. What are the three things to do today?
 *
 * It computes nothing of its own. Every number here comes from the same
 * services the goals view, the capacity gauge and the plan already use, so the
 * cockpit can never tell a different story from the screen it summarises.
 */
export const WeeklyCockpitCard: React.FC<WeeklyCockpitCardProps> = ({
  activeWeek,
  currentRole,
  onOpenGoals,
  onOpenTasks,
  onOpenTimetable,
}) => {
  const { toast } = useFeedback();
  const { confirmChange } = useChangeGuard();
  const [exceptionFor, setExceptionFor] = useState<CommitmentOccasion | null>(null);

  const settings = useLiveQuery(() => db.parentSettings.get('active_settings'), []);
  const capacity = useLiveQuery(() => calculateBurnoutCapacity(), []);
  const goals = useLiveQuery(() => lockedGoalProgress(), [], []);
  const chores = useLiveQuery(() => choresForDay(), [], []);
  const occasions = useLiveQuery(() => occasionsOn(todayISO(), activeWeek), [activeWeek], []);

  const trends = useLiveQuery<Record<string, Trend>, Record<string, Trend>>(
    async () => {
      const entries = await Promise.all(
        (await lockedGoalProgress()).map(async (p) => [p.goal.id, await goalTrend(p.goal)] as const)
      );
      return Object.fromEntries(entries);
    },
    [],
    {}
  );

  const openTasks = useLiveQuery<Task[], Task[]>(
    async () => (await db.tasks.orderBy('dueDate').toArray()).filter((t) => !t.completed),
    [],
    []
  );

  if (!capacity) return null;

  const today = todayISO();
  const targetGrade = settings?.studentTargetGrade ?? 9;
  const examDate = settings?.examSeriesStartDate;
  const daysToExams = examDate ? daysUntil(examDate) : undefined;
  const examYear = examDate ? Number(examDate.slice(0, 4)) : undefined;

  // Zone C. The most pressing homework, the next fixed thing, and today's chore.
  const topTask =
    openTasks.find((t) => t.dueDate < today) ??
    openTasks.find((t) => t.dueDate === today) ??
    undefined;
  const nextOccasion = occasions.find((o) => !o.exception) ?? occasions[0];
  const nextChore = chores.find((c) => !c.done);

  const hasTriad = !!(topTask || nextOccasion || nextChore);
  const hasAnything = goals.length > 0 || capacity.commitmentBreakdown.length > 0 || hasTriad;

  const completeTask = async (task: Task) => {
    const done = await confirmChange({
      title: 'Mark this as done?',
      subject: task.title,
      effect: `+${task.xpValue} XP`,
      category: 'HOMEWORK',
      entity: 'Task',
      entityId: task.id,
      confirmLabel: 'Yes, done',
      summary: `Finished "${task.title}" (+${task.xpValue} XP)`,
      run: async () => {
        await db.tasks.update(task.id, { completed: true, completedAt: Date.now() });
        await logAuditEvent({
          user: 'STUDENT',
          action: 'UPDATE',
          entity: 'Task',
          entityId: task.id,
          fieldChanged: 'completed',
          newValue: `Completed — "${task.title}"`,
        });
      },
    });
    if (done) toast.success(`+${task.xpValue} XP`, task.title);
  };

  const toggleChore = async (choreId: string) => {
    const item = chores.find((c) => c.chore.id === choreId);
    if (!item) return;

    const done = await confirmChange({
      title: item.done ? 'Undo this chore?' : 'Mark this chore done?',
      subject: item.chore.title,
      effect: item.done ? `−${item.chore.xpValue} XP` : `+${item.chore.xpValue} XP`,
      category: 'CHORE',
      entity: 'Chore',
      entityId: item.chore.id,
      tone: item.done ? 'danger' : 'normal',
      confirmLabel: item.done ? 'Undo it' : 'Yes, done',
      summary: item.done
        ? `Un-ticked chore "${item.chore.title}" (−${item.chore.xpValue} XP)`
        : `Did chore "${item.chore.title}" (+${item.chore.xpValue} XP)`,
      run: () => setChoreDone(item.chore, !item.done),
    });
    if (done && !item.done) toast.success(`+${item.chore.xpValue} XP`, item.chore.title);
  };

  const statusTone =
    capacity.stressStatus === 'RED'
      ? 'text-rose-300'
      : capacity.stressStatus === 'AMBER'
      ? 'text-amber-300'
      : 'text-emerald-300';

  const barTone =
    capacity.stressStatus === 'RED'
      ? 'bg-rose-500'
      : capacity.stressStatus === 'AMBER'
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <>
      <div className="glass-card overflow-hidden">
        {/* ── Header: how long is left, and what it is all for ─────────── */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-indigo-950/70 via-slate-900 to-slate-900 border-b border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-indigo-400" />
            {daysToExams !== undefined && daysToExams >= 0 ? (
              <span className="text-xs font-bold text-white">
                Summer {examYear} ·{' '}
                <span className="text-indigo-300 tabular-nums">{daysToExams} days</span>
              </span>
            ) : (
              <span className="text-xs font-bold text-white">This week</span>
            )}
            <InfoTip label="Countdown">
              Days until the first morning of your GCSE exams. A parent can change the date in the
              Parent Portal.
            </InfoTip>
          </div>

          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
            {activeWeek} week
          </span>

          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
            Target grade {targetGrade}
          </span>

          <span className={`ml-auto text-[11px] font-bold ${statusTone}`}>
            {capacity.stressIndex}% loaded
          </span>
        </div>

        {!hasAnything ? (
          /* CKP-5. Five empty meters would say the app is broken; one sentence
             and one action says where to begin. */
          <div className="p-6 text-center">
            <Target className="w-7 h-7 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-white">Nothing set up yet</p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
              Write a goal, say what it costs in hours a week, and this fills in on its own.
            </p>
            <button
              onClick={onOpenGoals}
              className="mt-3 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
            >
              Start with a goal
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
            {/* ── Zone A: are the goals getting their hours? ──────────── */}
            <section className="lg:col-span-3 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>Goal pacing</span>
                  <InfoTip label="Goal pacing">
                    The bar is the hours logged this week. The pale line is the share expected by
                    the end of today. The small chart is the last four weeks.
                  </InfoTip>
                </h3>
                <button
                  onClick={onOpenGoals}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-0.5"
                >
                  <span>All goals</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              {goals.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  No goals locked yet, so nothing is reserving time. Goals only start counting once
                  a parent agrees them.
                </p>
              ) : (
                <div className="space-y-3">
                  {goals.map((p) => (
                    <div key={p.goal.id}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-white truncate">
                          {p.goal.title}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-[11px] font-bold tabular-nums ${PACE_TEXT[p.pace]}`}>
                            {p.actualHours} / {p.targetHours}h
                          </span>
                          {trends[p.goal.id] && (
                            <Sparkline
                              trend={trends[p.goal.id]}
                              targetHours={p.targetHours}
                              width={64}
                              height={20}
                            />
                          )}
                        </div>
                      </div>

                      <PaceBar
                        percent={p.percentOfWeek}
                        proRatedPercent={p.proRatedPercent}
                        pace={p.pace}
                        showMarker={!p.isUnattributable}
                      />

                      <p className="mt-1 text-[10px] text-slate-400">
                        {p.isUnattributable
                          ? 'No subject set, so study time cannot be counted towards this.'
                          : p.pace === 'STALLED'
                          ? 'Nothing logged this week yet.'
                          : p.pace === 'BEHIND'
                          ? `${p.proRatedTargetHours}h expected by today.`
                          : `On pace — ${p.proRatedTargetHours}h expected by today.`}
                        {trends[p.goal.id]?.direction === 'FALLING' && (
                          <span className="text-rose-300"> Four-week trend is falling.</span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Zone B: how full is the week? ───────────────────────── */}
            <section className="lg:col-span-2 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <span>Capacity</span>
                  <InfoTip label="Workload">
                    Everything on your plate this week — school, clubs and study. The buffer is how
                    much room is left before it is too much.
                  </InfoTip>
                </h3>
                {capacity.stressStatus === 'RED' ? (
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                ) : capacity.stressStatus === 'AMBER' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : (
                  <BatteryCharging className="w-4 h-4 text-emerald-400" />
                )}
              </div>

              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-lg font-bold text-white tabular-nums">
                  {capacity.totalScheduledHours}
                  <span className="text-xs text-slate-400 font-medium">
                    {' '}
                    / {capacity.safeWeeklyHoursLimit}h
                  </span>
                </span>
                <span className={`text-[11px] font-bold ${statusTone}`}>
                  {capacity.remainingSafeCapacity >= 0
                    ? `${capacity.remainingSafeCapacity}h free`
                    : `${Math.abs(capacity.remainingSafeCapacity)}h over`}
                </span>
              </div>

              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full ${barTone} transition-all duration-500`}
                  style={{ width: `${Math.min(100, capacity.stressIndex)}%` }}
                />
              </div>

              <ul className="space-y-1">
                {capacity.commitmentBreakdown.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 truncate">{c.label}</span>
                    <span className="text-slate-200 font-medium tabular-nums flex-shrink-0">
                      {c.netHours}h
                      {c.excusedHours > 0 && (
                        <span className="text-amber-300"> −{c.excusedHours}</span>
                      )}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
                  <span className="text-emerald-400">Study logged</span>
                  <span className="text-emerald-300 font-medium tabular-nums">
                    {capacity.loggedRevisionHours}h
                  </span>
                </li>
              </ul>

              {capacity.excusedHours > 0 && (
                <p className="mt-2 text-[10px] text-amber-300/90">
                  {capacity.excusedHours}h excused this week, already taken off the total.
                </p>
              )}
            </section>
          </div>
        )}

        {/* ── Zone C: the three things today ─────────────────────────── */}
        {hasTriad && (
          <div className="border-t border-slate-800 bg-slate-950/40 px-5 py-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              Today
            </h3>

            <div className="space-y-2">
              {topTask && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
                  <button
                    onClick={() => completeTask(topTask)}
                    aria-label={`Mark "${topTask.title}" done`}
                    className="w-6 h-6 rounded-lg border-2 border-slate-600 hover:border-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center flex-shrink-0 transition-all"
                  >
                    <Check className="w-3.5 h-3.5 text-transparent hover:text-emerald-400" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">{topTask.title}</p>
                    <p className="text-[10px] text-slate-400">
                      {topTask.dueDate < today ? 'Overdue' : 'Due today'} · +{topTask.xpValue} XP
                    </p>
                  </div>
                  <button
                    onClick={onOpenTasks}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium flex-shrink-0"
                  >
                    All work
                  </button>
                </div>
              )}

              {nextOccasion && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
                  <div className="w-6 h-6 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                    <CalendarClock className="w-3.5 h-3.5 text-purple-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">
                      {nextOccasion.entry?.startTime ? `${nextOccasion.entry.startTime} · ` : ''}
                      {nextOccasion.title}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {nextOccasion.exception
                        ? `${nextOccasion.exception.status === 'ATTENDED' ? 'Attended' : 'Excused'} — ${nextOccasion.hours}h`
                        : `${nextOccasion.hours}h · ${nextOccasion.commitment.label}`}
                    </p>
                  </div>
                  {/* EXC-2. One tap, from the screen the app opens on. */}
                  <button
                    onClick={() => setExceptionFor(nextOccasion)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border flex-shrink-0 transition-all ${
                      nextOccasion.exception
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <CalendarOff className="w-3 h-3" />
                    <span>{nextOccasion.exception ? 'Logged' : 'Not happening'}</span>
                  </button>
                </div>
              )}

              {nextChore && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
                  <button
                    onClick={() => toggleChore(nextChore.chore.id)}
                    aria-label={`Mark "${nextChore.chore.title}" done`}
                    className="w-6 h-6 rounded-lg border-2 border-slate-600 hover:border-amber-400 hover:bg-amber-500/20 flex items-center justify-center flex-shrink-0 transition-all"
                  >
                    <Check className="w-3.5 h-3.5 text-transparent hover:text-amber-400" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">
                      {nextChore.chore.title}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Chore · +{nextChore.chore.xpValue} XP
                    </p>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={onOpenTimetable}
              className="mt-2.5 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-0.5"
            >
              <span>Everything today</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      <CommitmentExceptionModal
        occasion={exceptionFor}
        onClose={() => setExceptionFor(null)}
        currentRole={currentRole}
      />
    </>
  );
};

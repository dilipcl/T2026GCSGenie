import { db } from '../db';
import {
  MilestoneReminder,
  PlanAmendment,
  PlanBaselineStatus,
  Task,
  UserRole,
  WeekPlanBaseline,
} from '../types';
import { logAuditEvent } from './auditService';
import { newId } from '../utils/id';
import { daysBetween, startOfWeekISO, todayISO } from '../utils/date';
import { currentWeek } from './weekWindow';
import { loadWeekCommitment, taskHours, WeekCommitment } from './planService';
import { calculateBurnoutCapacity, safeStudyHours } from './burnoutEngine';

/**
 * Turning a week's plan into a promise, and keeping it one.
 *
 * The planner could already say what this week held, but nothing ever closed
 * the decision. The list stayed editable all week, so "committed" meant only
 * "currently in the left-hand column" - it drifted quietly, and by Friday there
 * was no way to tell an honest re-plan from a week that had been rewritten to
 * match whatever happened to get done.
 *
 * A baseline is the moment the week stops being a draft. Before it, moving
 * things about is free and expected. After it, the plan still bends - real life
 * does not care about baselines - but every bend is recorded as an amendment,
 * with what came out to make room. What that buys is a truthful answer to the
 * one question a weekly review actually needs: was the plan wrong, or was it
 * abandoned?
 *
 * Approval sits with a parent by design. Tejas decides what the week holds; the
 * baseline is the point where somebody else agrees it is realistic, which is
 * the only check that catches a fortnight of quiet over-promising.
 */

/**
 * The Monday of the week a date falls in - and the baseline's id, so the row
 * for a week is findable without a query and a week cannot baseline twice.
 *
 * `startOfWeekISO` already does this, timezone-safely; re-deriving it here with
 * `toISOString` would resolve in UTC and put every Monday in the previous week
 * for anyone east of Greenwich.
 */
export function weekStartISO(on: string = todayISO()): string {
  return startOfWeekISO(on);
}

export type ReadinessId =
  | 'HAS_COMMITMENT'
  | 'ESTIMATES_SET'
  | 'FITS_HEADROOM'
  | 'NOTHING_OVERDUE'
  | 'KEY_DATES_COVERED'
  | 'GOALS_LINKED';

export interface ReadinessCheck {
  id: ReadinessId;
  /** The step, phrased as the thing to do rather than the thing that is wrong. */
  label: string;
  ok: boolean;
  /** What is outstanding, named specifically enough to act on. */
  detail?: string;
  /** Blocking steps must pass before the week can be submitted. */
  blocking: boolean;
}

/**
 * A key date this close needs work planned against it.
 *
 * Two weeks is about the horizon at which "I'll start revising nearer the time"
 * stops being reasonable, and it is also far enough out that the answer is
 * still cheap - one task, moved into the week when it fits.
 */
export const KEY_DATE_HORIZON_DAYS = 14;

export interface GoalFocus {
  /** Committed, unfinished work with no goal behind it. */
  offGoal: Task[];
  offGoalHours: number;
  linkedHours: number;
  /** 0-1. Hours, not counts: one unattached four-hour task matters more than
   *  three fifteen-minute ones, and counting rows hides exactly that. */
  offGoalShare: number;
}

/**
 * How much of the week is pointed at nothing in particular.
 *
 * A term's worth of homework can be done conscientiously and still not move a
 * single Grade 9 goal - the work is real, it is just aimed elsewhere. Nothing
 * in the app noticed that, because a task and a goal were only ever connected
 * when someone remembered to connect them.
 *
 * This is a warning and never a block. Plenty of legitimate work belongs to no
 * goal: a permission slip, a library book, a one-off cover lesson. The failure
 * worth catching is not the single unattached task, it is a week where most of
 * the hours are unattached and nobody has noticed.
 */
export function goalFocus(committed: Task[]): GoalFocus {
  const pending = committed.filter((t) => !t.completed);
  const offGoal = pending.filter((t) => !t.linkedGoalId);

  const round = (n: number) => Math.round(n * 10) / 10;
  const offGoalHours = round(offGoal.reduce((sum, t) => sum + taskHours(t), 0));
  const linkedHours = round(
    pending.filter((t) => t.linkedGoalId).reduce((sum, t) => sum + taskHours(t), 0)
  );
  const total = offGoalHours + linkedHours;

  return {
    offGoal,
    offGoalHours,
    linkedHours,
    offGoalShare: total === 0 ? 0 : offGoalHours / total,
  };
}

/**
 * Above this share of committed hours, the week has drifted off its goals far
 * enough to be worth saying out loud. Half: below that the goals are still the
 * centre of gravity, above it they are a side project.
 */
export const OFF_GOAL_ALERT_SHARE = 0.5;

export interface ReadinessInput {
  commitment: WeekCommitment;
  safeStudyHours: number;
  milestones: MilestoneReminder[];
  /** Every task, so milestone cover can be checked outside the committed column. */
  allTasks: Task[];
  today?: string;
}

/**
 * What is still outstanding before this week can be baselined.
 *
 * Deliberately short, and every item is something a person can finish in under
 * a minute. A checklist that takes an evening is one nobody starts, and the
 * point of this is to make finalising the plan the easy path rather than an
 * event.
 *
 * "Fits the headroom" is not blocking. A week can be legitimately over the
 * ceiling - a mock fortnight is - and refusing to let anyone plan such a week
 * would just push the planning outside the app. It is stated, and it is on the
 * record that it was stated, which is what a parent approval is for.
 */
export function readinessChecks(input: ReadinessInput): ReadinessCheck[] {
  const today = input.today ?? todayISO();
  const committed = input.commitment.columns.THIS_WEEK.filter((t) => !t.completed);

  const missingEstimates = committed.filter(
    (t) => !(typeof t.estimatedHours === 'number' && t.estimatedHours > 0)
  );
  const overdue = committed.filter((t) => t.dueDate < today);

  const dueSoon = input.milestones.filter((m) => {
    if (m.isCompleted) return false;
    const away = daysBetween(today, m.date);
    return away >= 0 && away <= KEY_DATE_HORIZON_DAYS;
  });
  const uncovered = dueSoon.filter(
    (m) => !input.allTasks.some((t) => t.linkedMilestoneId === m.id && !t.completed)
  );

  const over = input.commitment.committedHours > input.safeStudyHours;
  const focus = goalFocus(committed);

  return [
    {
      id: 'HAS_COMMITMENT',
      label: 'Commit at least one piece of work',
      ok: committed.length > 0,
      detail: committed.length > 0 ? undefined : 'This week is empty. Pull something in from Next up.',
      blocking: true,
    },
    {
      id: 'ESTIMATES_SET',
      label: 'Give every committed task an hours estimate',
      ok: missingEstimates.length === 0,
      detail:
        missingEstimates.length === 0
          ? undefined
          : `${missingEstimates.length} without an estimate: ${missingEstimates
              .slice(0, 3)
              .map((t) => `"${t.title}"`)
              .join(', ')}${missingEstimates.length > 3 ? '…' : ''}`,
      blocking: true,
    },
    {
      id: 'NOTHING_OVERDUE',
      label: 'Clear or move anything already overdue',
      ok: overdue.length === 0,
      detail:
        overdue.length === 0
          ? undefined
          : `${overdue.length} committed ${overdue.length === 1 ? 'task is' : 'tasks are'} already past ` +
            `its due date. Finish it, or move it out and give it a new date.`,
      blocking: true,
    },
    {
      id: 'KEY_DATES_COVERED',
      label: `Plan work for key dates in the next ${KEY_DATE_HORIZON_DAYS} days`,
      ok: uncovered.length === 0,
      detail:
        uncovered.length === 0
          ? undefined
          : `Nothing planned for ${uncovered.map((m) => `"${m.title}"`).join(', ')}.`,
      blocking: true,
    },
    {
      id: 'GOALS_LINKED',
      label: 'Link committed work to the goal it serves',
      ok: focus.offGoal.length === 0,
      detail:
        focus.offGoal.length === 0
          ? undefined
          : `${focus.offGoal.length} ${focus.offGoal.length === 1 ? 'task is' : 'tasks are'} not ` +
            `linked to a goal (${focus.offGoalHours}h of ${
              Math.round((focus.offGoalHours + focus.linkedHours) * 10) / 10
            }h)` +
            (focus.offGoalShare > OFF_GOAL_ALERT_SHARE
              ? '. Most of this week is pointed at nothing in particular.'
              : '.'),
      blocking: false,
    },
    {
      id: 'FITS_HEADROOM',
      label: 'Check the load fits the time available',
      ok: !over,
      detail: over
        ? `${input.commitment.committedHours}h promised against about ${input.safeStudyHours}h free. ` +
          `You can still submit it - say why, and a parent decides.`
        : undefined,
      blocking: false,
    },
  ];
}

export function outstandingSteps(checks: ReadinessCheck[]): ReadinessCheck[] {
  return checks.filter((c) => !c.ok);
}

/** Only blocking failures stop a submission; advisory ones are for the reader. */
export function canSubmit(checks: ReadinessCheck[]): boolean {
  return checks.every((c) => c.ok || !c.blocking);
}

export async function loadBaseline(
  weekStart: string = weekStartISO()
): Promise<WeekPlanBaseline | undefined> {
  return db.planBaselines.get(weekStart);
}

export function baselineStatus(baseline?: WeekPlanBaseline): PlanBaselineStatus {
  return baseline?.status ?? 'DRAFT';
}

async function upsert(row: WeekPlanBaseline): Promise<void> {
  await db.planBaselines.put(row);
}

/**
 * Tejas says he is done deciding.
 *
 * The committed list is captured here, not at approval, so what a parent is
 * asked to agree to is exactly what was on screen when it was sent. Approving a
 * moving target is not approving anything.
 */
export async function submitForApproval(
  commitment: WeekCommitment,
  note?: string,
  weekStart: string = weekStartISO()
): Promise<WeekPlanBaseline> {
  const existing = await loadBaseline(weekStart);
  const committed = commitment.columns.THIS_WEEK.filter((t) => !t.completed);

  const row: WeekPlanBaseline = {
    id: weekStart,
    weekStart,
    status: 'AWAITING_APPROVAL',
    taskIds: committed.map((t) => t.id),
    hours: commitment.committedHours,
    submittedAt: Date.now(),
    // A resubmission clears the previous rejection, so the note on screen is
    // always about the version in front of you.
    returnedAt: undefined,
    returnedNote: undefined,
    approvedAt: existing?.approvedAt,
    createdAt: existing?.createdAt ?? Date.now(),
  };

  await upsert(row);
  await logAuditEvent({
    user: 'STUDENT',
    action: 'UPDATE',
    entity: 'WeekPlanBaseline',
    entityId: weekStart,
    fieldChanged: 'status',
    oldValue: baselineStatus(existing),
    newValue:
      `AWAITING_APPROVAL — ${row.taskIds.length} tasks, ${row.hours}h` +
      (note?.trim() ? ` (${note.trim()})` : ''),
  });

  return row;
}

/** A parent agrees the week is realistic. From here, additions are amendments. */
export async function approveBaseline(
  weekStart: string = weekStartISO()
): Promise<WeekPlanBaseline | undefined> {
  const existing = await loadBaseline(weekStart);
  if (!existing) return undefined;

  const row: WeekPlanBaseline = {
    ...existing,
    status: 'BASELINED',
    approvedAt: Date.now(),
    returnedAt: undefined,
    returnedNote: undefined,
  };

  await upsert(row);
  await logAuditEvent({
    user: 'PARENT',
    action: 'UPDATE',
    entity: 'WeekPlanBaseline',
    entityId: weekStart,
    fieldChanged: 'status',
    oldValue: existing.status,
    newValue: `BASELINED — ${row.taskIds.length} tasks, ${row.hours}h agreed`,
  });

  return row;
}

/**
 * Sent back rather than approved.
 *
 * Returns to DRAFT, not to a rejected state of its own: the week is editable
 * again and the note says what to change, which is the only useful difference
 * between "no" and "not yet".
 */
export async function returnForChanges(
  note: string,
  weekStart: string = weekStartISO()
): Promise<WeekPlanBaseline | undefined> {
  const existing = await loadBaseline(weekStart);
  if (!existing) return undefined;

  const row: WeekPlanBaseline = {
    ...existing,
    status: 'DRAFT',
    returnedAt: Date.now(),
    returnedNote: note.trim() || undefined,
  };

  await upsert(row);
  await logAuditEvent({
    user: 'PARENT',
    action: 'UPDATE',
    entity: 'WeekPlanBaseline',
    entityId: weekStart,
    fieldChanged: 'status',
    oldValue: existing.status,
    newValue: `DRAFT — sent back: ${row.returnedNote ?? 'no note'}`,
  });

  return row;
}

export interface AmendmentPlan {
  /** False before approval, when adding work is just planning. */
  needsAmendment: boolean;
  hoursAdded: number;
  hoursAfter: number;
  safeStudyHours: number;
  /** True when the addition pushes the week past its headroom. */
  wouldOvercommit: boolean;
  /** Committed, unfinished work that could come out instead. */
  swapCandidates: Task[];
}

/**
 * What adding this task to an approved week would cost.
 *
 * The swap candidates are the point. Offering only "add anyway" makes the
 * baseline decorative; offering only "you cannot" sends the work somewhere the
 * app cannot see. Naming what would have to come out puts the trade in front of
 * the person making it, which is the entire mechanism.
 */
export function planAmendment(
  task: Task,
  commitment: WeekCommitment,
  safeStudyHours: number,
  baseline?: WeekPlanBaseline
): AmendmentPlan {
  const hoursAdded = taskHours(task);
  const hoursAfter = Math.round((commitment.committedHours + hoursAdded) * 10) / 10;

  return {
    needsAmendment: baselineStatus(baseline) === 'BASELINED',
    hoursAdded,
    hoursAfter,
    safeStudyHours,
    wouldOvercommit: hoursAfter > safeStudyHours,
    swapCandidates: commitment.columns.THIS_WEEK.filter((t) => !t.completed && t.id !== task.id),
  };
}

export interface CommitToWeekInput {
  task: Task;
  /** What comes out to make room. Optional: a week can legitimately grow. */
  displaced?: Task;
  reason?: string;
  by?: UserRole;
  weekStart?: string;
}

/**
 * Brings a task into the current week, recording an amendment when the week is
 * already baselined.
 *
 * The bucket move itself is `moveTaskToBucket`'s job and is not duplicated
 * here; what this adds is the record of the trade. Before approval it writes
 * nothing extra, because there is nothing to protect yet.
 */
export async function commitToWeek(input: CommitToWeekInput): Promise<PlanAmendment | undefined> {
  const weekStart = input.weekStart ?? weekStartISO();
  const baseline = await loadBaseline(weekStart);
  if (baselineStatus(baseline) !== 'BASELINED') return undefined;

  const hoursAdded =
    Math.round((taskHours(input.task) - (input.displaced ? taskHours(input.displaced) : 0)) * 10) /
    10;

  const amendment: PlanAmendment = {
    id: newId('amend'),
    weekStart,
    addedTaskId: input.task.id,
    addedTitle: input.task.title,
    displacedTaskId: input.displaced?.id,
    displacedTitle: input.displaced?.title,
    hoursAdded,
    reason: input.reason?.trim() || undefined,
    at: Date.now(),
    by: input.by ?? 'STUDENT',
  };

  await db.planAmendments.add(amendment);
  await logAuditEvent({
    user: amendment.by,
    action: 'INSERT',
    entity: 'PlanAmendment',
    entityId: amendment.id,
    newValue:
      `Added "${amendment.addedTitle}" to an approved week` +
      (amendment.displacedTitle ? `, moving out "${amendment.displacedTitle}"` : '') +
      ` (${hoursAdded >= 0 ? '+' : ''}${hoursAdded}h)` +
      (amendment.reason ? `. ${amendment.reason}` : ''),
  });

  return amendment;
}

export async function amendmentsFor(
  weekStart: string = weekStartISO()
): Promise<PlanAmendment[]> {
  const rows = await db.planAmendments.where('weekStart').equals(weekStart).toArray();
  /**
   * `at` first, then the id.
   *
   * The id tiebreak is not decoration. Ids are random UUIDs carrying no
   * chronology, so two amendments sharing a millisecond - two devices adding
   * work to the same approved week while offline, and Dexie Cloud merging them
   * - would otherwise come back in whatever order the index happened to yield,
   * and the list would reshuffle between renders. Arbitrary but stable beats
   * arbitrary and moving: a list that reorders on refresh reads as broken.
   */
  return rows.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export interface FinalisationNudge {
  /** Absent when there is nothing to say - most of a finalised week. */
  tone: 'INFO' | 'URGENT';
  headline: string;
  body: string;
  /** How many blocking steps remain, for the badge. */
  outstanding: number;
}

/**
 * The reminder to actually finalise the week.
 *
 * Sharpens as the week runs on, because the cost of an unbaselined plan does.
 * On Monday it is a suggestion; by Wednesday half the week is spent against a
 * plan nobody agreed to, which is the failure this whole mechanism exists to
 * catch. It says nothing at all once the week is approved and unchanged - a
 * banner that is always there stops being read, which is the house rule for
 * every nudge in the app.
 */
export function finalisationNudge(
  status: PlanBaselineStatus,
  checks: ReadinessCheck[],
  weekday: number = currentWeek().weekday,
  returnedNote?: string
): FinalisationNudge | undefined {
  const outstanding = outstandingSteps(checks).filter((c) => c.blocking).length;

  if (status === 'BASELINED') return undefined;

  if (status === 'AWAITING_APPROVAL') {
    return {
      tone: 'INFO',
      headline: 'Waiting on a parent',
      body: 'This week is submitted. It becomes the baseline once it is approved.',
      outstanding: 0,
    };
  }

  if (returnedNote) {
    return {
      tone: 'URGENT',
      headline: 'Sent back for a change',
      body: `${returnedNote} Fix that and submit it again.`,
      outstanding,
    };
  }

  // Monday and Tuesday: an invitation. Wednesday on: the week is going by.
  const late = weekday >= 3;

  if (outstanding === 0) {
    return {
      tone: late ? 'URGENT' : 'INFO',
      headline: late ? 'This week is still a draft' : 'Ready to finalise',
      body: late
        ? 'Everything is in order but nobody has agreed to it yet. Send it for approval.'
        : 'Every step is done. Send the week for approval and it becomes the plan.',
      outstanding: 0,
    };
  }

  return {
    tone: late ? 'URGENT' : 'INFO',
    headline: late
      ? `${outstanding} ${outstanding === 1 ? 'step' : 'steps'} still holding up this week`
      : `${outstanding} ${outstanding === 1 ? 'step' : 'steps'} before this week is set`,
    body: late
      ? 'The week is running against a plan nobody has agreed to. Finish these and send it.'
      : 'Finish these and the week can be signed off.',
    outstanding,
  };
}

/**
 * Everything the dashboard needs in order to nag about an unfinalised week,
 * in one read.
 *
 * Assembled here rather than in the banner so the reminder and the planner's
 * own checklist can never disagree. Two components each deriving "what is
 * outstanding" from the same tables is how they drift apart, and a nudge that
 * contradicts the screen it sends you to is worse than no nudge at all.
 */
export async function readFinalisationState(): Promise<{
  status: PlanBaselineStatus;
  checks: ReadinessCheck[];
  nudge?: FinalisationNudge;
}> {
  const [commitment, capacity, milestones, allTasks, baseline] = await Promise.all([
    loadWeekCommitment(),
    calculateBurnoutCapacity(),
    db.milestones.toArray(),
    db.tasks.toArray(),
    loadBaseline(),
  ]);

  const checks = readinessChecks({
    commitment,
    // Through the engine's own helper, never re-derived here. The same sum
    // written out a second time drifts the moment the total gains a term -
    // and a nudge that disagrees with the screen it links to is worse than
    // no nudge.
    safeStudyHours: Math.max(0, safeStudyHours(capacity)),
    milestones: milestones.filter((m) => !m.isCompleted),
    allTasks,
  });

  const status = baselineStatus(baseline);

  return {
    status,
    checks,
    nudge: finalisationNudge(status, checks, currentWeek().weekday, baseline?.returnedNote),
  };
}

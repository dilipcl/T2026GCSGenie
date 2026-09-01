import { db } from '../db';
import { PlanBucket, Task } from '../types';
import { addDaysISO, daysUntil, todayISO } from '../utils/date';
import { logAuditEvent } from './auditService';
import { currentWeek } from './weekWindow';

/**
 * Planning: what has been promised for this week, versus what is merely known
 * about.
 *
 * The distinction is the whole point. A flat date-sorted list makes every item
 * feel equally urgent and equally overdue, which is exactly the pressure that
 * makes a teenager stop opening the app. Committed work counts towards the
 * weekly load and the slipping nudge; the backlog counts towards nothing and
 * generates no guilt. Moving something back out is meant to be a one-tap,
 * unremarkable act.
 */

/** Hours assumed for a task with no estimate, by priority. */
const DEFAULT_HOURS: Record<Task['priority'], number> = {
  HIGH: 1.5,
  MEDIUM: 1,
  LOW: 0.5,
};

export function taskHours(task: Task): number {
  return typeof task.estimatedHours === 'number' && task.estimatedHours > 0
    ? task.estimatedHours
    : DEFAULT_HOURS[task.priority] ?? 1;
}

/**
 * Where an unplanned task belongs.
 *
 * Existing tasks predate buckets entirely, and dropping several months of
 * homework into an empty backlog would be useless. Anything already due inside
 * the week is treated as committed - it effectively is - and the rest sorts by
 * how far away it is.
 */
export function inferBucket(task: Task): PlanBucket {
  if (task.bucket) return task.bucket;
  const days = daysUntil(task.dueDate);
  if (days <= 7) return 'THIS_WEEK';
  if (days <= 14) return 'NEXT_WEEK';
  // Beyond a term away it was never a schedule, only a note to self.
  if (days <= 75) return 'FUTURE';
  return 'BACKLOG';
}

export interface PlanColumns {
  THIS_WEEK: Task[];
  NEXT_WEEK: Task[];
  FUTURE: Task[];
  BACKLOG: Task[];
}

export interface WeekCommitment {
  columns: PlanColumns;
  /** Committed items, and how many of those are done. */
  committedCount: number;
  committedDone: number;
  /** Hours promised this week, from estimates or priority defaults. */
  committedHours: number;
  /** Committed items whose due date has already passed. */
  overdueCommitted: number;
}

export async function loadWeekCommitment(): Promise<WeekCommitment> {
  const all = await db.tasks.orderBy('dueDate').toArray();

  const columns: PlanColumns = { THIS_WEEK: [], NEXT_WEEK: [], FUTURE: [], BACKLOG: [] };
  for (const task of all) columns[inferBucket(task)].push(task);

  const committed = columns.THIS_WEEK;
  const today = todayISO();

  return {
    columns,
    committedCount: committed.length,
    committedDone: committed.filter((t) => t.completed).length,
    committedHours:
      Math.round(
        committed.filter((t) => !t.completed).reduce((sum, t) => sum + taskHours(t), 0) * 10
      ) / 10,
    overdueCommitted: committed.filter((t) => !t.completed && t.dueDate < today).length,
  };
}

/**
 * Moves a task between buckets.
 *
 * Committing also pulls a far-future due date back to the end of this week -
 * promising to do something this week while it still says "due in October" is
 * the kind of contradiction that makes the whole list untrustworthy.
 */
export async function moveTaskToBucket(
  task: Task,
  bucket: PlanBucket,
  /**
   * EXC-5. Why it is moving, when moving it out of the week.
   *
   * Deliberately no new entity and no new field: the move already writes an
   * audit row, so the reason rides along on it. A separate deferral record
   * would be a second history of the same event, and the two would drift.
   */
  reason?: string
): Promise<void> {
  if (inferBucket(task) === bucket && task.bucket === bucket) return;

  const patch: Partial<Task> = { bucket };

  if (bucket === 'THIS_WEEK') {
    patch.committedAt = Date.now();
    if (daysUntil(task.dueDate) > 7) patch.dueDate = addDaysISO(7);
  } else if (bucket === 'NEXT_WEEK') {
    // Same contradiction, one sprint out: a thing promised for next week cannot
    // still say it is due in October.
    patch.committedAt = undefined;
    if (daysUntil(task.dueDate) > 14) patch.dueDate = addDaysISO(14);
  } else {
    patch.committedAt = undefined;
  }

  await db.tasks.update(task.id, patch);

  const label: Record<PlanBucket, string> = {
    THIS_WEEK: 'This week',
    NEXT_WEEK: 'Next week',
    FUTURE: 'Future',
    BACKLOG: 'Backlog',
  };
  await logAuditEvent({
    user: 'STUDENT',
    action: 'UPDATE',
    entity: 'Task',
    entityId: task.id,
    fieldChanged: 'bucket',
    oldValue: label[inferBucket(task)],
    newValue:
      `${label[bucket]} — "${task.title}"` + (reason?.trim() ? ` (${reason.trim()})` : ''),
  });
}

export interface PlanHealth {
  /** Committed hours against the study headroom left by fixed commitments. */
  committedHours: number;
  safeStudyHours: number;
  /** Over the headroom - the planning-time version of the burnout warning. */
  isOvercommitted: boolean;
  /**
   * Set when it is late in the week and little of the promise has been kept.
   * The mirror of the high-load warning: this catches the plan quietly
   * evaporating rather than the week being too full.
   */
  slipping: boolean;
  slippingReason?: string;
}

/**
 * How the week is going.
 *
 * `safeStudyHours` is what is left of the weekly ceiling once school and fixed
 * commitments are accounted for - the headroom a plan can actually occupy,
 * rather than the whole 60 hours.
 */
export function assessPlan(commitment: WeekCommitment, safeStudyHours: number): PlanHealth {
  // Mon = 1 .. Sun = 7, the same reckoning the goal pacing and the capacity
  // gauge use. This was `new Date().getDay()` with its own Sunday special case.
  const weekday = currentWeek().weekday;
  const doneRatio =
    commitment.committedCount === 0 ? 1 : commitment.committedDone / commitment.committedCount;

  // Thursday onwards, with less than half the promise kept
  const lateInWeek = weekday >= 4;
  const slipping = lateInWeek && commitment.committedCount >= 3 && doneRatio < 0.5;

  return {
    committedHours: commitment.committedHours,
    safeStudyHours,
    isOvercommitted: commitment.committedHours > safeStudyHours,
    slipping,
    slippingReason: slipping
      ? `${commitment.committedDone} of ${commitment.committedCount} done with the week nearly gone. Move what will not happen to Next week - that is planning, not failing.`
      : undefined,
  };
}

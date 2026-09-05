import { db } from '../db';
import { Goal, GoalStatus, Task } from '../types';

/**
 * How much work is actually pointed at each goal.
 *
 * Goals and tasks could be linked from the moment the field existed, but only
 * ever in one direction: a task could name its goal, and nothing anywhere asked
 * a goal what work it had. So a goal with nothing behind it looked exactly like
 * a goal going well - it sat at the top of the page with a target date, a
 * weekly hours figure and no way to tell that not one piece of work had ever
 * been aimed at it.
 *
 * That is the failure worth catching. A goal nobody has broken into tasks is
 * not a goal, it is an intention, and it will still be an intention in March.
 */

/** Goals that can still be worked on. A finished or shelved one needs nothing. */
const LIVE_STATUSES: GoalStatus[] = [
  'DRAFT',
  'PENDING_DISCUSSION',
  'APPROVED_LOCKED',
];

export interface GoalWork {
  goal: Goal;
  /** Every task naming this goal, in any state. */
  total: number;
  /** Not yet done. */
  open: number;
  /** Open and promised for this week - the only work that is really moving. */
  committed: number;
  done: number;
  /**
   * The work itself, worst-first: committed, then open, then done. A count
   * alone told you a goal was short of work but never which work existed, so
   * there was nothing to act on without leaving the page and searching My Work
   * for tasks that might or might not name this goal.
   */
  tasks: Task[];
  /**
   * A live goal with no work at all. The headline case: nothing has ever been
   * aimed at it, so no amount of effort elsewhere will move it.
   */
  hasNoWork: boolean;
  /**
   * A live goal with work that is all sitting in the backlog. Less alarming
   * than nothing, and worth saying separately - the tasks exist, they are just
   * not being done, which is a different conversation.
   */
  hasNoCommittedWork: boolean;
}

function isLive(goal: Goal): boolean {
  return LIVE_STATUSES.includes(goal.status);
}

/**
 * Every goal with a count of the work aimed at it.
 *
 * Returned for all goals rather than only the troubled ones, because the count
 * is worth seeing on a healthy goal too - "6 tasks, 2 this week" is how you tell
 * a goal being worked from a goal being watched.
 */
export async function goalWorkload(): Promise<GoalWork[]> {
  const [goals, tasks] = await Promise.all([db.goals.toArray(), db.tasks.toArray()]);

  const byGoal = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.linkedGoalId) continue;
    const list = byGoal.get(task.linkedGoalId);
    if (list) list.push(task);
    else byGoal.set(task.linkedGoalId, [task]);
  }

  return goals.map((goal) => {
    const linked = byGoal.get(goal.id) ?? [];
    const open = linked.filter((task) => !task.completed);
    const committed = open.filter((task) => task.bucket === 'THIS_WEEK');
    const live = isLive(goal);

    return {
      goal,
      tasks: [...linked].sort(byUrgency),
      total: linked.length,
      open: open.length,
      committed: committed.length,
      done: linked.length - open.length,
      hasNoWork: live && linked.length === 0,
      hasNoCommittedWork: live && linked.length > 0 && committed.length === 0,
    };
  });
}

/**
 * Work in the order it is worth reading: what is promised this week, then what
 * is waiting, then what is finished. Ties fall back to the due date, so a list
 * of open work still reads as a run-up to a deadline.
 */
function byUrgency(a: Task, b: Task): number {
  const rank = (task: Task) =>
    task.completed ? 2 : task.bucket === 'THIS_WEEK' ? 0 : 1;
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;
  return (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
}

/**
 * The goals that need work aiming at them, worst first.
 *
 * Nothing-at-all outranks nothing-committed, because they call for different
 * responses: one needs the goal broken down, the other needs a task pulling
 * into the week.
 */
export function goalsMissingWork(rows: GoalWork[]): GoalWork[] {
  return rows
    .filter((row) => row.hasNoWork || row.hasNoCommittedWork)
    .sort((a, b) => Number(b.hasNoWork) - Number(a.hasNoWork));
}

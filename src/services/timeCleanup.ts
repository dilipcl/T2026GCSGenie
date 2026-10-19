import { db } from '../db';
import { DailyCheckIn, Goal, SubjectConfig, SubjectId, Task, UserRole } from '../types';
import { logAuditEvent } from './auditService';
import { looksLikeGoalFor } from './progressReport';
import { entryFromCheckIn, entryFromTask } from './studyLedger';
import { formatShortDate } from '../utils/date';

/**
 * The tidying a parent would otherwise do row by row, where there is only one
 * right answer.
 *
 * On 19 Oct 2026, after the duplicate Maths goal was deleted, two check-ins and
 * four finished pieces of work still pointed at it - so two hours of Maths
 * counted towards nothing, and the only fix was to find each row and re-file
 * it. And the Chemistry goal had been approved with no subject, so every
 * Chemistry minute missed it.
 *
 * Only two kinds of change are offered, both unambiguous:
 *
 * - **A row pointing at a deleted goal**, whose subject has exactly one agreed
 *   goal: it moves to that goal. Two agreed goals on the subject is a choice,
 *   and is left for a person.
 * - **An agreed goal with no subject** whose title names exactly one subject:
 *   it gets that subject. "Grade 9 In Chemistry" is plainly about Chemistry;
 *   "Organised" is about nothing in particular and is left alone.
 *
 * Everything else that loses time - a subject no goal covers, time with no
 * subject, a goal not yet agreed - is a decision, and stays on the lost-time
 * card with its fix. Nothing happens until somebody taps, and every change is
 * written to the activity feed with what it was before.
 *
 * Rows pointing at a goal that still exists but is not agreed are not moved.
 * That goal may be agreed next week, and quietly re-filing its time elsewhere
 * would undo the tagging somebody chose.
 */

export interface Relink {
  kind: 'CHECK_IN' | 'TASK';
  id: string;
  /** What the row is, for the list. */
  label: string;
  /** Study minutes it carries, zero for open work. */
  minutes: number;
  subjectId: SubjectId;
  to: Goal;
}

export interface SubjectFix {
  goal: Goal;
  subject: SubjectConfig;
}

export interface CleanupPlan {
  subjectFixes: SubjectFix[];
  relinks: Relink[];
}

const isAgreed = (goal: Goal) => goal.status === 'APPROVED_LOCKED';

/** The pure half: what would change, given the rows. */
export function planCleanup(
  goals: Goal[],
  subjects: SubjectConfig[],
  checkIns: DailyCheckIn[],
  tasks: Task[]
): CleanupPlan {
  const agreed = goals.filter(isAgreed);
  const goalIds = new Set(goals.map((g) => g.id));

  const subjectFixes: SubjectFix[] = [];
  for (const goal of agreed) {
    if (goal.subjectId) continue;
    const named = subjects.filter((s) => looksLikeGoalFor(goal, s));
    if (named.length === 1) subjectFixes.push({ goal, subject: named[0] });
  }

  /**
   * Targets are judged as they will stand after the subject fixes, so a row
   * pointing at a deleted Chemistry goal follows the Chemistry goal that is
   * about to get its subject, rather than waiting for a second tap.
   */
  const subjectOf = (goal: Goal) =>
    goal.subjectId ?? subjectFixes.find((f) => f.goal.id === goal.id)?.subject.id;
  const onlyGoalFor = (subjectId?: SubjectId) => {
    if (!subjectId) return undefined;
    const matches = agreed.filter((g) => subjectOf(g) === subjectId);
    return matches.length === 1 ? matches[0] : undefined;
  };

  const relinks: Relink[] = [];
  for (const checkIn of checkIns) {
    const gone = checkIn.studyGoalId && !goalIds.has(checkIn.studyGoalId);
    const to = gone ? onlyGoalFor(checkIn.studySubjectId) : undefined;
    if (to && checkIn.studySubjectId)
      relinks.push({
        kind: 'CHECK_IN',
        id: checkIn.id,
        label: `the ${formatShortDate(checkIn.date)} check-in`,
        minutes: entryFromCheckIn(checkIn)?.minutes ?? 0,
        subjectId: checkIn.studySubjectId,
        to,
      });
  }
  for (const task of tasks) {
    const gone = task.linkedGoalId && !goalIds.has(task.linkedGoalId);
    const to = gone ? onlyGoalFor(task.subjectId) : undefined;
    if (to)
      relinks.push({
        kind: 'TASK',
        id: task.id,
        label: `“${task.title}”`,
        minutes: entryFromTask(task)?.minutes ?? 0,
        subjectId: task.subjectId,
        to,
      });
  }

  return { subjectFixes, relinks };
}

export async function readCleanupPlan(): Promise<CleanupPlan> {
  const [goals, subjects, checkIns, tasks] = await Promise.all([
    db.goals.toArray(),
    db.subjects.toArray(),
    db.checkIns.toArray(),
    db.tasks.toArray(),
  ]);
  return planCleanup(goals, subjects, checkIns, tasks);
}

export const cleanupSize = (plan: CleanupPlan) => plan.subjectFixes.length + plan.relinks.length;

/**
 * Makes the changes, one transaction, one feed line each.
 *
 * Re-planned from the rows inside the transaction rather than trusting the plan
 * the screen was showing: another device may have re-filed a row or edited a
 * goal since, and applying a stale plan would overwrite that.
 */
export async function applyCleanup(by: UserRole): Promise<number> {
  return db.transaction(
    'rw',
    [db.goals, db.subjects, db.checkIns, db.tasks, db.auditLogs, db.parentSettings],
    async () => {
      const plan = await readCleanupPlan();

      for (const fix of plan.subjectFixes) {
        await db.goals.update(fix.goal.id, { subjectId: fix.subject.id });
        await logAuditEvent({
          user: by,
          action: 'UPDATE',
          entity: 'Goal',
          entityId: fix.goal.id,
          fieldChanged: 'subject',
          oldValue: `“${fix.goal.title}”: none`,
          newValue: fix.subject.name,
        });
      }

      for (const relink of plan.relinks) {
        if (relink.kind === 'CHECK_IN')
          await db.checkIns.update(relink.id, { studyGoalId: relink.to.id });
        else await db.tasks.update(relink.id, { linkedGoalId: relink.to.id });
        await logAuditEvent({
          user: by,
          action: 'UPDATE',
          entity: relink.kind === 'CHECK_IN' ? 'DailyCheckIn' : 'Task',
          entityId: relink.id,
          fieldChanged: 'goal',
          oldValue: `${relink.label}: a deleted goal`,
          newValue: relink.to.title,
        });
      }

      return cleanupSize(plan);
    }
  );
}

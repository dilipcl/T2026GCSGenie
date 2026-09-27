import { db } from '../db';
import { Task, UserRole } from '../types';
import { logAuditEvent } from './auditService';
import { resolveCommentForTask } from './activityCommentService';
import { recordChange } from './changeLogService';

/**
 * Closing or reopening a piece of work.
 *
 * Lifted out of the Work tab when the focus block gained a "finished it?"
 * button. The act has consequences beyond the row - the audit line a parent
 * reads, and a follow-up's comment that must be settled with it - and a second
 * copy in the timer would have closed work without settling the question it
 * answered, leaving somebody waiting on a thread the work says is done.
 */
export async function setTaskCompleted(task: Task, done: boolean, actor: UserRole): Promise<void> {
  await db.tasks.update(task.id, {
    completed: done,
    completedAt: done ? Date.now() : undefined,
  });

  await logAuditEvent({
    user: actor,
    action: 'UPDATE',
    entity: 'Task',
    entityId: task.id,
    fieldChanged: 'completed',
    // "true" tells a parent auditing the log nothing. Say what happened.
    oldValue: task.completed ? 'completed' : 'not completed',
    newValue: done ? `Completed "${task.title}" (+${task.xpValue} XP)` : `Reopened "${task.title}"`,
  });

  /**
   * A follow-up exists to answer somebody. Ticking it off without settling
   * the question leaves the work saying done and the comment still saying
   * somebody is waiting - and a flag that outlives what it was about is how
   * a review flag becomes furniture.
   */
  if (done && task.isFollowUp) await resolveCommentForTask(task.id, actor);
}

/**
 * Finishing work through the close sheet, which has already dealt with proof.
 * The change-log line says whether it went with evidence, because that is the
 * part a parent reading the feed actually wants to know.
 */
export async function closeTask(task: Task, actor: UserRole, hadEvidence: boolean): Promise<void> {
  await setTaskCompleted(task, true, actor);
  await recordChange({
    category: 'HOMEWORK',
    summary: `Finished "${task.title}" (+${task.xpValue} XP)`,
    detail: hadEvidence
      ? 'Closed with its evidence attached.'
      : 'Closed with nothing attached — it is listed under Evidence.',
    entity: 'Task',
    entityId: task.id,
    actor,
  });
}

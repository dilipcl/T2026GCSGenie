import { db } from '../db';
import { Task, UserRole } from '../types';
import { logAuditEvent } from './auditService';
import { resolveCommentForTask } from './activityCommentService';
import { recordChange } from './changeLogService';
import { addDaysISO } from '../utils/date';

/**
 * Closing or reopening a piece of work.
 *
 * Lifted out of the Work tab when the focus block gained a "finished it?"
 * button. The act has consequences beyond the row - the audit line a parent
 * reads, and a follow-up's comment that must be settled with it - and a second
 * copy in the timer would have closed work without settling the question it
 * answered, leaving somebody waiting on a thread the work says is done.
 */
export async function setTaskCompleted(
  task: Task,
  done: boolean,
  actor: UserRole,
  /**
   * Time on the work that no focus block recorded, confirmed at the close.
   * Left out, whatever was stored stays - so reopening and closing again does
   * not lose it, and a close path that does not ask does not erase it.
   */
  loggedMinutes?: number,
  /** The day the time was spent, when that is not today - see `Task.workedOn`. */
  workedOn?: string
): Promise<void> {
  await db.tasks.update(task.id, {
    completed: done,
    completedAt: done ? Date.now() : undefined,
    // Time and its day are written together, so a re-close today does not
    // inherit the day a catch-up check-in once gave it.
    ...(done && loggedMinutes !== undefined ? { loggedMinutes, workedOn } : {}),
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
 * What closing a fix-up can record beyond the close itself - the part of the
 * old quest dialog worth keeping: how the re-try went, the working, and what
 * still feels shaky. All optional.
 */
export interface FixUpOutcome {
  score?: { scored: number; total: number };
  workingNotes?: string;
  weakAreas?: string;
}

/** A follow-up is named for the mistake it came from, plus the shaky part. */
function followUpTitle(task: Task, weakArea: string): string {
  const root = task.parentTaskId ? task.title.split(': ')[0] : task.title;
  return `${root}: ${weakArea}`;
}

/**
 * Finishing work through the close sheet, which has already dealt with proof.
 * The change-log line says whether it went with evidence, because that is the
 * part a parent reading the feed actually wants to know.
 */
export async function closeTask(
  task: Task,
  actor: UserRole,
  hadEvidence: boolean,
  loggedMinutes?: number,
  fixUp?: FixUpOutcome
): Promise<string | undefined> {
  await setTaskCompleted(task, true, actor, loggedMinutes);

  /**
   * A weak area named at the close becomes a fix-up of its own, due within
   * the week - the one thing the quest dialog did that a plain close never
   * could. Written into a note it would be read by nobody; as work it is on
   * the list, in the plan, and worth XP.
   */
  let followUpId: string | undefined;
  if (task.isRemediation && fixUp) {
    const weakAreas = fixUp.weakAreas?.trim() || undefined;
    await db.tasks.update(task.id, {
      score: fixUp.score,
      workingNotes: fixUp.workingNotes?.trim() || undefined,
      weakAreas,
    });
    // One follow-up per fix-up, with an id built from it: reopening and closing
    // again with the same shaky part filled in used to mint another one - and
    // another 50 XP - each time.
    const builtId = `followup__${task.id}`;
    const existingFollowUp = weakAreas ? await db.tasks.get(builtId) : undefined;
    // A different shaky part on a later close updates the open follow-up
    // rather than being dropped in silence - the field promises it becomes one.
    if (weakAreas && existingFollowUp && !existingFollowUp.completed && existingFollowUp.whatWentWrong !== weakAreas) {
      await db.tasks.update(builtId, {
        whatWentWrong: weakAreas,
        title: followUpTitle(task, weakAreas),
      });
      followUpId = builtId;
    }
    if (weakAreas && !existingFollowUp) {
      followUpId = builtId;
      await db.tasks.add({
        id: followUpId,
        subjectId: task.subjectId,
        title: followUpTitle(task, weakAreas),
        dueDate: addDaysISO(7),
        priority: 'MEDIUM',
        isHomework: false,
        isRemediation: true,
        whatWentWrong: weakAreas,
        fixSteps: 'Three problems on just this, checked against the mark scheme.',
        hint: task.hint,
        remediationSourceDoc: task.remediationSourceDoc,
        linkedGoalId: task.linkedGoalId,
        linkedTopicId: task.linkedTopicId,
        parentTaskId: task.id,
        xpValue: 50,
        completed: false,
        createdAt: Date.now(),
      });
      await logAuditEvent({
        user: actor,
        action: 'INSERT',
        entity: 'Task',
        entityId: followUpId,
        newValue: `Follow-up fix-up from "${task.title}": ${weakAreas}`,
      });
    }
  }
  const time = loggedMinutes ? ` ${loggedMinutes} min logged.` : '';
  await recordChange({
    category: 'HOMEWORK',
    summary: `Finished "${task.title}" (+${task.xpValue} XP)`,
    detail:
      (hadEvidence
        ? 'Closed with its evidence attached.'
        : 'Closed with nothing attached — it is listed under Evidence.') + time,
    entity: 'Task',
    entityId: task.id,
    actor,
  });
  return followUpId;
}

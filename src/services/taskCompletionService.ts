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

/**
 * How long closed work took, given after the close.
 *
 * Committed work answered "Done" in the day list is closed on the tap, like
 * every answer there, so the time comes a moment later from the chips under
 * the row. The homework list used to be where that time was given - which is
 * why the same task sat in both lists and could be closed from either.
 */
export async function setLoggedMinutes(
  task: Task,
  minutes: number,
  /** The day the time was spent - see `Task.workedOn`. */
  workedOn: string,
  actor: UserRole = 'STUDENT'
): Promise<void> {
  await db.tasks.update(task.id, { loggedMinutes: minutes, workedOn });
  await logAuditEvent({
    user: actor,
    action: 'UPDATE',
    entity: 'Task',
    entityId: task.id,
    fieldChanged: 'loggedMinutes',
    oldValue: task.loggedMinutes === undefined ? '(none)' : `${task.loggedMinutes} min`,
    newValue: `${minutes} min on ${workedOn}`,
  });
}

/**
 * The follow-up a fix-up close raised or changed, for the sheet to describe.
 *
 * `isNew` exists because the two cases need different sentences. The sheet had
 * only an id and said "a new fix-up, due" a week from today every time - so a
 * second close that changed the shaky part on an existing follow-up announced a
 * new one, with a due date the follow-up did not have. Returned whenever a
 * shaky part was named, including when the open follow-up already said it, so
 * the sheet never goes quiet about where the shaky part went.
 */
export interface FollowUpResult {
  id: string;
  isNew: boolean;
  dueDate: string;
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
): Promise<FollowUpResult | undefined> {
  await setTaskCompleted(task, true, actor, loggedMinutes);

  /**
   * A weak area named at the close becomes a fix-up of its own, due within
   * the week - the one thing the quest dialog did that a plain close never
   * could. Written into a note it would be read by nobody; as work it is on
   * the list, in the plan, and worth XP.
   */
  let followUp: FollowUpResult | undefined;
  if (task.isRemediation && fixUp) {
    const weakAreas = fixUp.weakAreas?.trim() || undefined;
    await db.tasks.update(task.id, {
      score: fixUp.score,
      workingNotes: fixUp.workingNotes?.trim() || undefined,
      weakAreas,
    });
    /**
     * One open follow-up per fix-up, with an id built from it: reopening and
     * closing again with the same shaky part filled in used to mint another one
     * - and another 50 XP - each time.
     *
     * A follow-up that is already done does not count as the open one. Stopping
     * at it dropped the new shaky part in silence - no work, no message - while
     * the field promises it becomes a fix-up. So the id walks on to the first
     * link in `followup__X`, `followup__followup__X`… that is not done. Still
     * built, never random, so two devices closing the same fix-up land on the
     * same row; and a repeated close finds the open link and stops there.
     */
    let builtId = `followup__${task.id}`;
    let existingFollowUp = weakAreas ? await db.tasks.get(builtId) : undefined;
    while (weakAreas && existingFollowUp?.completed) {
      builtId = `followup__${builtId}`;
      existingFollowUp = await db.tasks.get(builtId);
    }
    if (weakAreas && existingFollowUp) {
      // A different shaky part on a later close updates the open follow-up,
      // with its own history line: the row a parent reads changes, so the log
      // says so rather than the title shifting under them.
      if (existingFollowUp.whatWentWrong !== weakAreas) {
        await db.tasks.update(builtId, {
          whatWentWrong: weakAreas,
          title: followUpTitle(task, weakAreas),
        });
        await logAuditEvent({
          user: actor,
          action: 'UPDATE',
          entity: 'Task',
          entityId: builtId,
          fieldChanged: 'whatWentWrong',
          oldValue: existingFollowUp.whatWentWrong ?? '(none)',
          newValue: `${weakAreas} [shaky part named when "${task.title}" was closed again]`,
        });
      }
      followUp = { id: builtId, isNew: false, dueDate: existingFollowUp.dueDate };
    }
    if (weakAreas && !existingFollowUp) {
      followUp = { id: builtId, isNew: true, dueDate: addDaysISO(7) };
      await db.tasks.add({
        id: builtId,
        subjectId: task.subjectId,
        title: followUpTitle(task, weakAreas),
        dueDate: followUp.dueDate,
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
        entityId: builtId,
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
  return followUp;
}

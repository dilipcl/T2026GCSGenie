import { db } from '../db';
import { INITIAL_GOALS, INITIAL_TASKS } from '../db/seedData';
import { logAuditEvent } from './auditService';
import { calculateTotalXP } from './ragCalculator';

/**
 * Clearing the testing out before the app is handed over.
 *
 * A fortnight of QA leaves a database that looks like someone else's week:
 * XP from check-ins nobody made, a stress-test goal, a dummy marked paper, a
 * duplicate reward request. Handing that to a teenager as their starting point
 * makes the first number they see untrue, and every number after it suspect.
 *
 * The rule is one sentence: everything that records what happened is cleared;
 * everything that describes the set-up is kept. So the timetable, subjects,
 * syllabus, chores, reward catalogue and the parent passphrase all survive, and
 * the balance goes to zero.
 */

/** Emptied outright - these tables are nothing but a record of activity. */
const CLEARED_TABLES = [
  'checkIns',
  'redemptions',
  'sanctions',
  'assessments',
  'attachments',
  'choreCompletions',
  'agentAuditReports',
  'auditLogs',
] as const;

/**
 * Kept, with progress flags reset.
 *
 * The rows themselves are configuration a parent set up - the syllabus, the key
 * dates, the fix-up quests - and deleting them would mean typing it all again.
 * Only the "done" marks are testing residue.
 */
const RESET_TABLES = ['tasks', 'milestones', 'remediations', 'syllabusTopics'] as const;

export interface HandoverPreview {
  /** Table name to the number of rows that will be deleted. */
  cleared: Record<string, number>;
  /** Table name to the number of rows whose progress will be reset. */
  reset: Record<string, number>;
  /** Table name to rows left completely untouched. */
  kept: Record<string, number>;
  /** The balance now, which will become zero. */
  currentXP: number;
  /** Goals that are not part of the starting set, named so they can be checked. */
  extraGoals: { id: string; title: string }[];
  totalToDelete: number;
}

/**
 * What a reset would do, without doing any of it.
 *
 * Reading this before acting is the whole point: a parent should see the
 * numbers change on a screen, not discover them afterwards.
 */
export async function previewHandoverReset(): Promise<HandoverPreview> {
  const cleared: Record<string, number> = {};
  const reset: Record<string, number> = {};
  const kept: Record<string, number> = {};

  const clearedSet = new Set<string>(CLEARED_TABLES);
  const resetSet = new Set<string>(RESET_TABLES);

  for (const table of db.tables) {
    const count = await table.count();
    if (clearedSet.has(table.name)) cleared[table.name] = count;
    else if (resetSet.has(table.name)) reset[table.name] = count;
    else kept[table.name] = count;
  }

  const xp = await calculateTotalXP();

  // Goals are configuration, so they are kept - but a stress-test goal left
  // behind would distort the workload cap from day one. Naming them lets a
  // parent delete the ones that were never real.
  const seededGoalIds = new Set(INITIAL_GOALS.map((g) => g.id));
  const extraGoals = (await db.goals.toArray())
    .filter((g) => !seededGoalIds.has(g.id))
    .map((g) => ({ id: g.id, title: g.title }));

  return {
    cleared,
    reset,
    kept,
    currentXP: xp.availableXP,
    extraGoals,
    totalToDelete: Object.values(cleared).reduce((a, b) => a + b, 0),
  };
}

export interface HandoverResult {
  deleted: number;
  resetRows: number;
  xpAfter: number;
}

/**
 * Performs the reset.
 *
 * The audit chain is a special case. Its tamper detection compares each device's
 * stored high-water mark against the rows present, so emptying `auditLogs` while
 * leaving the tips behind would make an honest reset look exactly like someone
 * deleting the tail of the log. The tips are cleared in the same breath, and the
 * first entry written afterwards is the reset itself - so the new chain opens by
 * saying what happened to the old one.
 */
export async function performHandoverReset(): Promise<HandoverResult> {
  let deleted = 0;
  let resetRows = 0;

  for (const name of CLEARED_TABLES) {
    const table = db.tables.find((t) => t.name === name);
    if (!table) continue;
    deleted += await table.count();
    await table.clear();
  }

  // Cleared with the log it belongs to, or the next verification reports the
  // tail as truncated.
  await db.parentSettings.update('active_settings', {
    auditChainTips: {},
    failedUnlockAttempts: 0,
    unlockLockedUntil: 0,
  });

  // Tasks: the seeded starting set, uncompleted, with any testing proof removed.
  const seededTaskIds = new Set(INITIAL_TASKS.map((t) => t.id));
  const tasks = await db.tasks.toArray();
  for (const task of tasks) {
    if (!seededTaskIds.has(task.id) && task.isRemediation) {
      // Fix-up tasks were generated from marked papers that are now gone
      await db.tasks.delete(task.id);
      deleted++;
      continue;
    }
    if (!task.completed && !task.driveProofUrl && task.score === undefined) continue;
    await db.tasks.update(task.id, {
      completed: false,
      completedAt: undefined,
      driveProofUrl: undefined,
      score: undefined,
    });
    resetRows++;
  }

  for (const milestone of await db.milestones.toArray()) {
    if (!milestone.isCompleted) continue;
    await db.milestones.update(milestone.id, { isCompleted: false });
    resetRows++;
  }

  for (const remediation of await db.remediations.toArray()) {
    if (!remediation.isCompleted) continue;
    await db.remediations.update(remediation.id, {
      isCompleted: false,
      completedAt: undefined,
      selfStudyScore: undefined,
      driveNotebookUrl: undefined,
      studentWorkingNotes: undefined,
    });
    resetRows++;
  }

  // Syllabus topics: only the tick is testing residue. A confidence rating is a
  // judgement someone actually made about a topic, so it stays.
  for (const topic of await db.syllabusTopics.toArray()) {
    if (!topic.isCompleted) continue;
    await db.syllabusTopics.update(topic.id, { isCompleted: false });
    resetRows++;
  }

  const xp = await calculateTotalXP();

  await logAuditEvent({
    user: 'PARENT',
    action: 'DELETE',
    entity: 'Database',
    entityId: 'handover_reset',
    fieldChanged: 'activity',
    oldValue: `${deleted} activity rows`,
    newValue:
      `Reset for handover. ${deleted} rows of testing activity cleared, ${resetRows} rows reset, ` +
      `balance now ${xp.availableXP} XP. Set-up kept: timetable, subjects, syllabus, chores, rewards and the parent passphrase.`,
  });

  return { deleted, resetRows, xpAfter: xp.availableXP };
}

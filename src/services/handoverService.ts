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
 * syllabus, chores, fixed commitments, the reward catalogue and every parent
 * setting - WhatsApp numbers and the family group included - all survive, and
 * the balance goes to zero.
 *
 * Two things sit on the line between activity and set-up, and both are handled
 * explicitly: the starter goals go back to draft, because a locked goal records
 * a conversation that has not happened yet; and the parent passphrase is kept
 * unless the reset is asked to clear it.
 */

/**
 * Emptied outright - these tables are nothing but a record of activity.
 *
 * `commitmentExceptions` belongs here and not with the set-up: a commitment is
 * something a parent configured, but a logged absence from one is a thing that
 * happened on a particular Tuesday. Leaving them behind would hand over a week
 * that still had hours excused from it.
 *
 * `changeLog` likewise - it is the record of what the student changed, which is
 * exactly what a handover is clearing.
 */
const CLEARED_TABLES = [
  'checkIns',
  'redemptions',
  'sanctions',
  'assessments',
  'attachments',
  'choreCompletions',
  'commitmentExceptions',
  'changeLog',
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
  /**
   * Starter goals still sitting locked, which the reset will return to draft.
   *
   * The seed ships them as drafts to be argued with. A device that was set up
   * before that change - or one where a goal was locked while testing the flow -
   * would otherwise hand Tejas three settled targets he never agreed to.
   */
  goalsToUnlock: { id: string; title: string }[];
  /** Whether a parent passphrase currently exists on this device. */
  hasPassphrase: boolean;
  totalToDelete: number;
  /**
   * The set-up a parent built, named so the reset can promise it in specifics
   * rather than in the abstract. "Nothing you configured is touched" is only
   * believable if the screen can list what that means.
   */
  preserved: {
    whatsAppNumbers: number;
    chores: number;
    commitments: number;
    rewards: number;
    hasExamDate: boolean;
    hasFamilyGroup: boolean;
  };
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

  const seededGoals = new Map(INITIAL_GOALS.map((g) => [g.id, g]));
  const goalsToUnlock = (await db.goals.toArray())
    .filter((g) => seededGoals.has(g.id) && g.status !== seededGoals.get(g.id)!.status)
    .map((g) => ({ id: g.id, title: g.title }));

  const settings = await db.parentSettings.get('active_settings');

  return {
    cleared,
    reset,
    kept,
    preserved: {
      whatsAppNumbers: settings?.parentWhatsAppNumbers?.length ?? 0,
      chores: await db.chores.count(),
      commitments: await db.commitments.count(),
      rewards: await db.rewards.count(),
      hasExamDate: !!settings?.examSeriesStartDate,
      hasFamilyGroup: !!settings?.familyGroupInviteUrl,
    },
    currentXP: xp.availableXP,
    extraGoals,
    goalsToUnlock,
    hasPassphrase: !!(settings?.parentCredential || settings?.parentPinHash),
    totalToDelete: Object.values(cleared).reduce((a, b) => a + b, 0),
  };
}

export interface HandoverOptions {
  /**
   * Also clear the parent passphrase, returning the lock to unclaimed.
   *
   * Off by default, and deliberately so: the reset is run from inside the parent
   * portal, which is already behind the lock, and a parent clearing it by
   * accident hands the portal to the next person who opens the app. It is on
   * the checklist for one case - the person who will actually hold the
   * passphrase from launch day is not the person who set it during testing.
   */
  clearPassphrase?: boolean;
}

export interface HandoverResult {
  deleted: number;
  resetRows: number;
  xpAfter: number;
  /** Starter goals returned to draft. */
  goalsUnlocked: number;
  passphraseCleared: boolean;
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
export async function performHandoverReset(
  options: HandoverOptions = {}
): Promise<HandoverResult> {
  let deleted = 0;
  let resetRows = 0;

  for (const name of CLEARED_TABLES) {
    const table = db.tables.find((t) => t.name === name);
    if (!table) continue;
    deleted += await table.count();
    await table.clear();
  }

  /**
   * Only these three fields are touched on the settings row, and that is the
   * whole point: everything else a parent configured - the WhatsApp numbers,
   * the family group, the exam date, the student profile, the Drive links, the
   * passphrase - is theirs and survives the reset untouched. A reset that wiped
   * the settings row would make the parent set the app up again every time they
   * cleared the student's activity, which is how a reset stops being used.
   *
   * The audit tips are cleared with the log they belong to, or the next
   * verification reports the tail as truncated.
   */
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

  /**
   * Starter goals go back to draft.
   *
   * Only the status and the lock timestamp are touched. Wording a parent
   * improved while testing is real work and stays; the lock is the part that
   * would have pre-decided a conversation nobody has had yet.
   */
  const seededGoals = new Map(INITIAL_GOALS.map((g) => [g.id, g]));
  let goalsUnlocked = 0;
  for (const goal of await db.goals.toArray()) {
    const seeded = seededGoals.get(goal.id);
    if (!seeded || goal.status === seeded.status) continue;
    await db.goals.update(goal.id, { status: seeded.status, lockedAt: undefined });
    goalsUnlocked++;
  }

  /**
   * The passphrase, if asked for.
   *
   * Both credentials are cleared - the PBKDF2 one and any legacy PIN hash -
   * because getLockState only reports UNCLAIMED when neither is present, and a
   * leftover PIN would leave the app asking for a number nobody remembers.
   */
  let passphraseCleared = false;
  if (options.clearPassphrase) {
    await db.parentSettings.update('active_settings', {
      parentCredential: undefined,
      parentPinHash: undefined,
    });
    passphraseCleared = true;
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
      `balance now ${xp.availableXP} XP, ${goalsUnlocked} starter goals back to draft` +
      `${passphraseCleared ? ', parent passphrase cleared' : ''}. ` +
      `Set-up kept: timetable, subjects, syllabus, chores, commitments, rewards, ` +
      `WhatsApp numbers and every other parent setting.`,
  });

  return { deleted, resetRows, xpAfter: xp.availableXP, goalsUnlocked, passphraseCleared };
}

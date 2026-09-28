import { db } from '../db';
import { Goal, MilestoneReminder, RemediationAction, Task } from '../types';
import { logAuditEvent } from './auditService';
import { addDaysISO, parseISODate, todayISO } from '../utils/date';

/**
 * Fix-up quests become fix-up tasks.
 *
 * There were two kinds of fix-up. Quests - eleven of them, 1,900 XP, three of
 * them sub-quests Tejas wrote himself - lived on a screen reached from the
 * Home card or one line of small print in My Work. They had no due date, so
 * they never entered a week, the plan never saw them, and not one was done.
 * Tasks lived in My Work and the plan but could not say what went wrong. One
 * kind now: a task with `isRemediation`, carrying what a quest carried.
 *
 * Run on every open and whenever a quest appears - a quest can arrive by sync
 * after the app has opened, or be written by a device still running an older
 * bundle - and safe to run any number of times, on any number of devices at
 * once:
 *
 *  - The task id is built from the quest id (`fixup__<questId>`), never
 *    generated. The laptop and the phone converting the same quest offline
 *    write the same row, which merges; a random id would have produced two
 *    fix-ups for one mistake, and looked like a sync fault.
 *  - An existing task is never overwritten, so work done on the fix-up since
 *    one device converted it survives the other device converting it again.
 *  - Photos move by rewriting their owner, and the quest is deleted last. A
 *    run cut off halfway leaves the quest in place to be finished next time.
 *
 * XP is unchanged: a quest's reward becomes the task's XP value, and nothing
 * already earned moves - no quest had been completed.
 */

export const fixUpIdFor = (questId: string) => `fixup__${questId}`;

const SUB_QUEST_SUFFIX = / \(Targeted Sub-Quest\)$/;
const SELF_STUDY_PREFIX = /^Identified deficit during self-study:\s*/;

/**
 * A sub-quest's title said only which quest it came from, so three of them
 * read identically. The weak area Tejas named is what tells them apart, and it
 * was sitting in the diagnostic line.
 */
function titleFor(quest: RemediationAction): string {
  if (!quest.parentQuestId) return quest.taskTitle;
  const base = quest.taskTitle.replace(SUB_QUEST_SUFFIX, '');
  const weakArea = quest.diagnosticError.replace(SELF_STUDY_PREFIX, '').trim();
  return weakArea ? `${base}: ${weakArea}` : quest.taskTitle;
}

/**
 * Practice questions were removed from quests in August 2026 and are read by
 * nothing, but one live quest still carries some. Kept as text on the task, so
 * the conversion loses nothing a person wrote or was given.
 */
function legacyQuestions(quest: RemediationAction): string | undefined {
  const raw = (quest as RemediationAction & { sampleQuestions?: unknown }).sampleQuestions;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const lines = raw.map((item) =>
    typeof item === 'string'
      ? item
      : item && typeof item === 'object' && 'question' in item
        ? String((item as { question: unknown }).question)
        : JSON.stringify(item)
  );
  return `Practice questions from the original quest:\n${lines.map((l) => `- ${l}`).join('\n')}`;
}

/**
 * When a converted fix-up is due: the day before the next mock or test,
 * because that is what a fix-up is practice for, and practice is no use on the
 * morning of the paper. Four weeks out when nothing is on the calendar.
 */
export function dueDateFor(milestones: MilestoneReminder[], today: string = todayISO()): string {
  const next = milestones
    .filter((m) => m.category === 'EXAM_MOCK' && !m.isCompleted && m.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return addDaysISO(28, parseISODate(today));
  const dayBefore = addDaysISO(-1, parseISODate(next.date));
  return dayBefore < today ? today : dayBefore;
}

/** The agreed goal for the subject, so the fix-up's time counts towards it. */
function goalFor(quest: RemediationAction, goals: Goal[]): string | undefined {
  return goals
    .filter((g) => g.status === 'APPROVED_LOCKED' && g.subjectId === quest.subjectId)
    .sort((a, b) => a.createdAt - b.createdAt)[0]?.id;
}

export function taskFromQuest(
  quest: RemediationAction,
  context: { dueDate: string; goals: Goal[]; now: number }
): Task {
  return {
    id: fixUpIdFor(quest.id),
    subjectId: quest.subjectId,
    title: titleFor(quest),
    description: legacyQuestions(quest),
    dueDate: context.dueDate,
    /**
     * Parked in "later", not left to the due date. Eleven fix-ups sharing one
     * date would all have walked into the same week together - the week of the
     * mock - and made it read as hopeless. In "later" they wait to be pulled
     * into a week at planning time, a few at a time; `inferBucket` never moves
     * a stored FUTURE on its own.
     */
    bucket: 'FUTURE',
    priority: 'MEDIUM',
    isHomework: false,
    isRemediation: true,
    remediationSourceDoc: quest.sourceDoc || undefined,
    linkedGoalId: goalFor(quest, context.goals),
    xpValue: quest.xpReward,
    completed: quest.isCompleted,
    completedAt: quest.completedAt,
    driveProofUrl: quest.driveNotebookUrl,
    score: quest.selfStudyScore
      ? { scored: quest.selfStudyScore.scored, total: quest.selfStudyScore.total }
      : undefined,
    whatWentWrong: quest.diagnosticError || undefined,
    fixSteps: quest.taskInstructions || undefined,
    hint: quest.formulaOrHint || undefined,
    workingNotes: quest.studentWorkingNotes,
    weakAreas: quest.weakAreasIdentified,
    parentTaskId: quest.parentQuestId ? fixUpIdFor(quest.parentQuestId) : undefined,
    createdAt: context.now,
  };
}

/** Converts every remaining quest. Returns how many were converted. */
export async function convertQuestsToFixUps(now: number = Date.now()): Promise<number> {
  const quests = await db.remediations.toArray();
  if (quests.length === 0) return 0;

  const [goals, milestones] = await Promise.all([db.goals.toArray(), db.milestones.toArray()]);
  const dueDate = dueDateFor(milestones);

  for (const quest of quests) {
    const id = fixUpIdFor(quest.id);
    const existing = await db.tasks.get(id);
    if (!existing) {
      await db.tasks.add(taskFromQuest(quest, { dueDate, goals, now }));
    }

    const photos = (await db.attachments.where('ownerId').equals(quest.id).toArray()).filter(
      (a) => a.ownerType === 'REMEDIATION'
    );
    for (const photo of photos) {
      await db.attachments.update(photo.id, { ownerType: 'TASK', ownerId: id });
    }

    await db.remediations.delete(quest.id);
    await logAuditEvent({
      user: 'SYSTEM_AGENT',
      action: 'UPDATE',
      entity: 'RemediationAction',
      entityId: quest.id,
      fieldChanged: 'converted',
      oldValue: `Quest "${quest.taskTitle}"`,
      newValue: existing ? `Already a fix-up task (${id})` : `Fix-up task ${id}`,
    });
  }

  return quests.length;
}

/**
 * Whether this device has the cloud's current rows - see `useQuestConversion`
 * for why converting before that would overwrite work done elsewhere.
 *
 * A signed-out device never converts. It looked safe - no cloud copy to
 * overwrite - but on its first sync after signing in, Dexie Cloud uploads every
 * local row as an upsert. A device that ran the old bundle signed out holds
 * starter quests with the family's own quest ids; converted locally, their
 * fresh `fixup__` rows would replace the family's worked-on fix-ups the moment
 * it signed in. Its quests wait, unseen, for the post-sign-in pull - which
 * brings the real fix-ups, so each conversion then finds its row and skips.
 */
export async function pulledFromCloud(): Promise<boolean> {
  const cloud = db.cloud;
  // Only in tests and non-browser tooling, where there is no sync at all.
  if (!cloud) return true;

  const user = cloud.currentUser.value;
  const signedIn = !!user?.userId && user.userId !== 'unauthorized';
  if (!signedIn) return false;

  // Only an explicit false means offline; environments without the flag
  // report undefined, and the pull below is the real test anyway.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    await cloud.sync({ wait: true, purpose: 'pull' });
  } catch {
    return false;
  }
  const state = cloud.syncState.value;
  if (state?.license && state.license !== 'ok') return false;
  if (state?.phase === 'error' || state?.phase === 'offline') return false;
  return true;
}

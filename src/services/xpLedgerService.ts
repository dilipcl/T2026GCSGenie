import { db } from '../db';
import { Task } from '../types';
import { closedWeekExecutions } from './weekExecution';
import { evidenceIndex, evidenceOnCloseFrom } from './evidenceService';
import { formatShortDate } from '../utils/date';

/**
 * Where every point came from, line by line.
 *
 * The balance has always been a single number. It is derived rather than
 * stored - `calculateTotalXP` recomputes it from the source rows on every read,
 * which is the right design and has a consequence worth stating plainly:
 * **nothing needs clawing back.** Reopening a task removes its XP the moment it
 * is reopened, because the points were never banked anywhere; they were only
 * ever a sum over the rows that happened to say `completed`.
 *
 * So "reconciling the points" is not a repair job. It is two questions the app
 * could not previously answer:
 *
 *   1. What is this number made of? A total nobody can decompose is a number
 *      that gets argued about rather than trusted, and the first time it looks
 *      wrong there is no way to find out whether it is.
 *   2. Which of those lines rest on a close that might not have been real?
 *
 * The second question is the honest version of "find the invalid ones". The app
 * cannot know which taps were accidents. What it can do is name the closes that
 * carry the *signature* of one - and then get out of the way, because the remedy
 * is a person reopening the task, which corrects the points automatically.
 *
 * A statement that does not add up is worse than no statement, so the total of
 * these entries is asserted against `calculateTotalXP` in the tests rather than
 * left to hold by inspection.
 */

export type XpSource =
  | 'TASK'
  | 'FIX_UP'
  | 'CHECK_IN'
  | 'OCCURRENCE'
  | 'CHORE'
  | 'WEEK_BONUS'
  | 'EXTRA_WORK'
  | 'SANCTION'
  | 'REDEEMED'
  | 'RESERVED';

export const SOURCE_LABEL: Record<XpSource, string> = {
  TASK: 'Homework and tasks',
  FIX_UP: 'Fix-up quests',
  CHECK_IN: 'Daily check-ins',
  OCCURRENCE: 'Lesson check-ins',
  CHORE: 'Chores',
  WEEK_BONUS: 'Weeks kept',
  EXTRA_WORK: 'Extra work pulled in',
  SANCTION: 'Sanctions',
  REDEEMED: 'Spent on rewards',
  RESERVED: 'Held for pending requests',
};

/**
 * Why a line is worth a second look.
 *
 * Every one of these is a *signature*, never a verdict. The app has no way to
 * know what somebody meant by a tap, and a flag that claims otherwise would
 * either be ignored or - worse - acted on.
 */
export type XpConcern =
  /**
   * Several pieces of work closed within seconds of each other.
   *
   * The strongest signal there is, and the one that matches what Tejas
   * described. A list scrolling under a thumb closes whatever it catches, and
   * closing three things in four seconds is not something a person does
   * deliberately - a real close now costs a confirmation sheet, so it cannot
   * happen at that speed at all.
   */
  | 'BURST'
  /**
   * Finished, of a kind that should show its working, with nothing attached.
   *
   * Only ever raised against work closed after the app started offering to
   * capture evidence at the moment of closing. Before that a task could not
   * carry a photo or a link at all, so the flag would be accusing somebody of
   * skipping a step that did not exist - and on a term's worth of history that
   * is not a handful of false positives, it is every row, which buries the
   * real ones. See `evidenceOnCloseFrom`.
   */
  | 'NO_EVIDENCE'
  /** Closed at the moment it was created - imported or seeded, not worked. */
  | 'CLOSED_ON_CREATION'
  /** Marked done with no record of when. Cannot be placed in time at all. */
  | 'UNDATED';

export const CONCERN_LABEL: Record<XpConcern, string> = {
  BURST: 'Closed in a burst with others',
  NO_EVIDENCE: 'Nothing attached and nothing said',
  CLOSED_ON_CREATION: 'Closed the moment it was created',
  UNDATED: 'No record of when it was closed',
};

export const CONCERN_DETAIL: Record<XpConcern, string> = {
  BURST:
    'Closed within seconds of other work. That is the signature of a list scrolling ' +
    'under a thumb rather than of work being finished.',
  NO_EVIDENCE:
    'Homework or a fix-up, closed since the app started asking for evidence, with no ' +
    'photo, no link, and no reason given for there being none.',
  CLOSED_ON_CREATION:
    'The completion timestamp matches the moment the row was created, which is what ' +
    'imported or seeded data looks like rather than work.',
  UNDATED:
    'Marked done with no completion timestamp, so there is no way to say when - or ' +
    'whether - it actually happened.',
};

export interface XpEntry {
  id: string;
  source: XpSource;
  title: string;
  /** Signed: earnings positive, spending and penalties negative. */
  amount: number;
  /** When it was earned, where that is known. Undefined sorts last. */
  at?: number;
  /** A date to show, when the entry belongs to a day rather than a moment. */
  on?: string;
  /** The record behind it, so a reader can go and look. */
  entityId?: string;
  /** Reasons this line is worth checking. Empty on the overwhelming majority. */
  concerns: XpConcern[];
}

/**
 * How close together two closes have to be to look like one gesture.
 *
 * Ten seconds. Long enough to catch a thumb dragging down a list, short enough
 * that somebody genuinely ticking off two things they finished together is not
 * accused of it - and in any case the accusation is only ever "worth a look".
 */
export const BURST_WINDOW_MS = 10_000;

/** How many closes inside the window before it stops looking like a coincidence. */
export const BURST_MIN = 3;

/**
 * Completions that happened in a rush, by task id.
 *
 * Exported for the test, because the window and the threshold are the whole
 * substance of this heuristic and they should be pinned rather than trusted.
 */
export function burstClosures(tasks: Task[]): Set<string> {
  const dated = tasks
    .filter((task): task is Task & { completedAt: number } =>
      task.completed && typeof task.completedAt === 'number'
    )
    .sort((a, b) => a.completedAt - b.completedAt);

  const burst = new Set<string>();

  /**
   * A sliding run rather than fixed buckets. Bucketing by wall-clock would miss
   * a burst that happens to straddle a boundary, which is exactly the case a
   * reader would then find by hand and reasonably conclude the check is broken.
   */
  let runStart = 0;
  for (let i = 1; i <= dated.length; i++) {
    const broken =
      i === dated.length ||
      dated[i].completedAt - dated[i - 1].completedAt > BURST_WINDOW_MS;
    if (!broken) continue;

    if (i - runStart >= BURST_MIN) {
      for (let j = runStart; j < i; j++) burst.add(dated[j].id);
    }
    runStart = i;
  }

  return burst;
}

/**
 * Every line behind the balance, newest first.
 *
 * Reads each table once. The alternative - asking `calculateTotalXP` for the
 * totals and then separately listing the rows - would let the two drift, and
 * the drift would show up as a statement that does not explain its own total.
 */
export async function xpStatement(): Promise<XpEntry[]> {
  const [
    tasks,
    remediations,
    checkIns,
    occurrences,
    choreCompletions,
    sanctions,
    redemptions,
    executions,
    evidence,
    evidenceSince,
  ] = await Promise.all([
    db.tasks.toArray(),
    db.remediations.toArray(),
    db.checkIns.toArray(),
    db.checkInOccurrences.toArray(),
    db.choreCompletions.toArray(),
    db.sanctions.toArray(),
    db.redemptions.toArray(),
    closedWeekExecutions(),
    evidenceIndex(),
    evidenceOnCloseFrom(),
  ]);

  const burst = burstClosures(tasks);

  /**
   * Which finished work has nothing to show for it and nothing said about why.
   * Read from the evidence index rather than re-derived, so this flag and the
   * Evidence tab can never disagree about the same piece of work.
   */
  const unexplained = new Set(
    evidence.filter((item) => item.unexplained).map((item) => item.entityId)
  );

  /**
   * Whether a close is recent enough for the missing-evidence flag to be fair.
   *
   * Two ways to answer no, and both are deliberately silent rather than
   * flagged. If the step has never been marked available there is nothing to
   * have skipped. And a close with no timestamp cannot be placed on either side
   * of the line - it already carries `UNDATED`, which is the honest thing to
   * say about it, and adding a second accusation derived from a date it does
   * not have would be inventing certainty.
   */
  const withinEvidenceEra = (closedAt?: number) =>
    evidenceSince !== undefined && closedAt !== undefined && closedAt >= evidenceSince;

  const entries: XpEntry[] = [];

  for (const task of tasks) {
    if (!task.completed || !task.xpValue) continue;

    const concerns: XpConcern[] = [];
    if (burst.has(task.id)) concerns.push('BURST');
    if (unexplained.has(task.id) && withinEvidenceEra(task.completedAt)) {
      concerns.push('NO_EVIDENCE');
    }
    if (task.completedAt === undefined) concerns.push('UNDATED');
    else if (Math.abs(task.completedAt - task.createdAt) < 1000) {
      concerns.push('CLOSED_ON_CREATION');
    }

    entries.push({
      id: `task:${task.id}`,
      source: task.isRemediation ? 'FIX_UP' : 'TASK',
      title: task.title,
      amount: task.xpValue,
      at: task.completedAt,
      entityId: task.id,
      concerns,
    });
  }

  for (const item of remediations) {
    if (!item.isCompleted || !item.xpReward) continue;
    entries.push({
      id: `rem:${item.id}`,
      source: 'FIX_UP',
      title: item.taskTitle,
      amount: item.xpReward,
      at: item.completedAt,
      entityId: item.id,
      // A quest carries its own working and proof on its own screen, and is
      // claimed rather than ticked, so none of the task signatures apply.
      concerns: [],
    });
  }

  for (const checkIn of checkIns) {
    if (!checkIn.xpEarned) continue;
    entries.push({
      id: `ci:${checkIn.id}`,
      source: 'CHECK_IN',
      title: `Check-in for ${formatShortDate(checkIn.date)}`,
      amount: checkIn.xpEarned,
      on: checkIn.date,
      at: checkIn.timestamp,
      entityId: checkIn.id,
      concerns: [],
    });
  }

  for (const row of occurrences) {
    const amount = (row.xpAwarded || 0) + (row.dayBonusXp || 0);
    if (!amount) continue;
    entries.push({
      id: `occ:${row.id}`,
      source: 'OCCURRENCE',
      title: `${row.label || 'Lesson'} · ${formatShortDate(row.date)}`,
      amount,
      on: row.date,
      at: row.loggedAt,
      entityId: row.id,
      concerns: [],
    });
  }

  for (const done of choreCompletions) {
    if (!done.xpAwarded) continue;
    entries.push({
      id: `chore:${done.id}`,
      source: 'CHORE',
      title: `Chore on ${formatShortDate(done.date)}`,
      amount: done.xpAwarded,
      on: done.date,
      at: done.completedAt,
      entityId: done.id,
      concerns: [],
    });
  }

  for (const execution of executions) {
    if (execution.bonusXp) {
      entries.push({
        id: `week:${execution.weekStart}`,
        source: 'WEEK_BONUS',
        title:
          `Week of ${formatShortDate(execution.weekStart)} — ` +
          `${execution.delivered} of ${execution.committed} kept, ${execution.score}%`,
        amount: execution.bonusXp,
        on: execution.weekEnd,
        entityId: execution.weekStart,
        concerns: [],
      });
    }
    if (execution.extraXp) {
      entries.push({
        id: `extra:${execution.weekStart}`,
        source: 'EXTRA_WORK',
        title: `${execution.extra} extra in the week of ${formatShortDate(execution.weekStart)}`,
        amount: execution.extraXp,
        on: execution.weekEnd,
        entityId: execution.weekStart,
        concerns: [],
      });
    }
  }

  for (const sanction of sanctions) {
    if (!sanction.penaltyXP) continue;
    entries.push({
      id: `sanction:${sanction.id}`,
      // Stored negative in some rows and positive in others; the balance takes
      // the absolute value, so this does too and then negates it once.
      source: 'SANCTION',
      title: sanction.reason,
      amount: -Math.abs(sanction.penaltyXP),
      on: sanction.date,
      entityId: sanction.id,
      concerns: [],
    });
  }

  for (const redemption of redemptions) {
    if (redemption.status === 'APPROVED') {
      entries.push({
        id: `spent:${redemption.id}`,
        source: 'REDEEMED',
        title: redemption.rewardTitle,
        amount: -redemption.costXP,
        at: redemption.resolvedAt ?? redemption.requestedAt,
        entityId: redemption.id,
        concerns: [],
      });
    } else if (redemption.status === 'PENDING') {
      entries.push({
        id: `held:${redemption.id}`,
        source: 'RESERVED',
        title: `${redemption.rewardTitle} — awaiting a decision`,
        amount: -redemption.costXP,
        at: redemption.requestedAt,
        entityId: redemption.id,
        concerns: [],
      });
    }
  }

  return entries.sort((a, b) => (b.at ?? 0) - (a.at ?? 0) || a.id.localeCompare(b.id));
}

export interface XpReconciliation {
  entries: XpEntry[];
  /** Positive lines only. Matches `XPLedger.totalXP`. */
  earned: number;
  /** Penalties, spending and held requests, as a positive number. */
  deducted: number;
  /** Earned less deducted. Matches the true balance before the zero clamp. */
  balance: number;
  /** Earning lines carrying at least one concern. */
  questionable: XpEntry[];
  /** How much XP is resting on those lines. */
  questionableXp: number;
  bySource: { source: XpSource; total: number; count: number }[];
}

/**
 * The statement, totalled and grouped, with the questionable lines called out.
 *
 * `questionableXp` is deliberately *not* subtracted from anything. It is the
 * size of the question, not an adjustment - the app has no standing to decide
 * that a close was not real, and a balance that silently differed from the one
 * in the header would be the worst of both worlds.
 */
export async function reconcileXp(): Promise<XpReconciliation> {
  const entries = await xpStatement();

  const earned = entries.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const deducted = entries
    .filter((e) => e.amount < 0)
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);

  const questionable = entries.filter((e) => e.amount > 0 && e.concerns.length > 0);

  const totals = new Map<XpSource, { total: number; count: number }>();
  for (const entry of entries) {
    const current = totals.get(entry.source) ?? { total: 0, count: 0 };
    totals.set(entry.source, { total: current.total + entry.amount, count: current.count + 1 });
  }

  return {
    entries,
    earned,
    deducted,
    balance: earned - deducted,
    questionable,
    questionableXp: questionable.reduce((sum, e) => sum + e.amount, 0),
    bySource: [...totals.entries()]
      .map(([source, value]) => ({ source, ...value }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
  };
}

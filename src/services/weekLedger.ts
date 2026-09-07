import { db } from '../db';
import { UserRole, WeekPlanBaseline } from '../types';
import { logAuditEvent } from './auditService';
import { baselineStatus, weekStartISO } from './planBaselineService';
import { weekExecution, WeekExecution } from './weekExecution';
import { addDaysISO, parseISODate, todayISO } from '../utils/date';

/**
 * What happened to each week, and which ones are still waiting on a person.
 *
 * The gap this closes is the one Tejas hit. He planned and committed the
 * current week properly; the week before it had run without ever being
 * finalised, and by the time he came back to it there was no point - so he left
 * it. That is a perfectly sensible decision and the app had nowhere to put it.
 * The week simply stayed unfinished, indistinguishable from one he had merely
 * not got round to, and every screen either talked about the current week or
 * said nothing at all. Nothing anywhere in the app knew that a past week
 * existed in a state somebody should deal with.
 *
 * Two things follow from that, and they are the whole of this file.
 *
 * A finished week has a **standing** - one word for what became of it - derived
 * rather than stored, because a stored status would need updating from four
 * different places and the version that forgets is the version that lies.
 *
 * And a week can be **closed** two ways. Reviewing it is the good path. Writing
 * it off is the honest one, and it is not a failure state: it records that
 * somebody looked, decided the week was not worth reconstructing, and said why.
 * Both stop the week asking. What is not offered is leaving it open forever,
 * which is what the app did before and is the only genuinely bad outcome -
 * because a list of things to deal with that contains something nobody can ever
 * clear is a list people stop opening.
 */

export type WeekStanding =
  /** Still ahead or in progress, with its plan not yet agreed. */
  | 'PLANNING'
  /** Agreed and currently being lived. */
  | 'RUNNING'
  /** Over, was agreed, and nobody has closed it. */
  | 'NEEDS_REVIEW'
  /** Over, never agreed, and nobody has said what became of it. */
  | 'ABANDONED'
  /** Over, and deliberately written off with a reason. */
  | 'WRITTEN_OFF'
  /** Over and reviewed. The finished article. */
  | 'REVIEWED';

export interface WeekRecord {
  weekStart: string;
  weekEnd: string;
  standing: WeekStanding;
  baseline?: WeekPlanBaseline;
  execution: WeekExecution;
  /**
   * Whether the family used the app at all during this week.
   *
   * The difference between a week that was abandoned and a week that simply
   * predates the install, and without it a fresh database opens by demanding
   * an account of four weeks that never happened - which is the fastest way to
   * teach somebody that this list is noise.
   */
  hadActivity: boolean;
  /** Whether somebody still has to do something about this week. */
  needsClosing: boolean;
  /** What that something is, phrased as the action. Absent when there is none. */
  todo?: string;
  /** Why it is being asked about, in one line a person can act on. */
  because?: string;
}

/**
 * How a single week stands, today.
 *
 * The order of the tests matters and is not arbitrary. A decision somebody
 * actually recorded - reviewed, written off - outranks anything derived, so a
 * week that was written off never reverts to nagging because its baseline
 * happens to still say DRAFT.
 */
export async function weekRecord(
  weekStart: string,
  today: string = todayISO()
): Promise<WeekRecord> {
  const weekEnd = addDaysISO(6, parseISODate(weekStart));

  const [baseline, execution, checkIns] = await Promise.all([
    db.planBaselines.get(weekStart),
    weekExecution(weekStart),
    /**
     * Daily check-ins, which are a different table from the per-lesson
     * occurrences the execution score counts. A family that answered every day
     * and never touched a lesson occurrence was using the app as hard as
     * anybody, and reading only the occurrences would have called their week
     * untouched.
     */
    db.checkIns.where('date').between(weekStart, weekEnd, true, true).count(),
  ]);

  const isOver = weekEnd < today;
  const wasAgreed = baselineStatus(baseline) === 'BASELINED';

  /**
   * Anything at all recorded against the week. A plan was made, a check-in was
   * answered, or a piece of work was finished inside it - all read off the
   * execution figures that were computed anyway, so this costs nothing.
   */
  const hadActivity =
    baseline !== undefined ||
    execution.committed > 0 ||
    execution.extra > 0 ||
    execution.occurrencesAnswered > 0 ||
    checkIns > 0;

  const standing = ((): WeekStanding => {
    if (baseline?.reviewedAt) return 'REVIEWED';
    if (baseline?.writtenOffAt) return 'WRITTEN_OFF';
    if (!isOver) return wasAgreed ? 'RUNNING' : 'PLANNING';
    return wasAgreed ? 'NEEDS_REVIEW' : 'ABANDONED';
  })();

  /**
   * A week nobody touched is not a week anybody abandoned. `NEEDS_REVIEW`
   * always has a baseline behind it, so the activity test only ever excludes
   * the empty `ABANDONED` case it was written for.
   */
  const needsClosing =
    hadActivity && (standing === 'NEEDS_REVIEW' || standing === 'ABANDONED');

  return {
    weekStart,
    weekEnd,
    standing,
    baseline,
    execution,
    hadActivity,
    needsClosing,
    todo: needsClosing
      ? standing === 'NEEDS_REVIEW'
        ? 'Close this week'
        : 'Say what happened to this week'
      : undefined,
    because:
      standing === 'NEEDS_REVIEW'
        ? `It was agreed and ran, and nobody has looked back at it. ` +
          `${execution.delivered} of ${execution.committed} committed pieces of work got done.`
        : standing === 'ABANDONED'
        ? 'It ran without an agreed plan, so there was nothing to keep and no bonus to earn. ' +
          'Write it off and it stops being asked about.'
        : undefined,
  };
}

/**
 * A week on the "still to deal with" list, without the cost of scoring it.
 *
 * `WeekRecord` carries a full `WeekExecution`, and computing one means
 * resolving the term calendar and building a day shape for each of seven days.
 * That is the right price for the one week a panel is displaying figures for,
 * and quite the wrong price for a background sweep of the last four - which
 * runs inside a `useLiveQuery` and therefore re-runs on every write anywhere in
 * the database. The first version of this did exactly that and froze the tab.
 *
 * So the sweep answers only what the sweep needs: which weeks are open, and one
 * line about each. Anything wanting numbers asks `weekRecord` for the single
 * week it is showing.
 */
export interface OpenWeek {
  weekStart: string;
  weekEnd: string;
  standing: WeekStanding;
  /** The action, phrased as the action. */
  todo: string;
  /** Why it is being asked about, in one line. */
  because: string;
}

/**
 * How far back to look for weeks nobody closed.
 *
 * Four weeks, and the cap is the point rather than a performance concern. A
 * list that reaches back to September would open with a dozen weeks nobody is
 * ever going to reconstruct, and the single most reliable way to make somebody
 * ignore a to-do list is to put something unclearable at the top of it. A month
 * is far enough back that a genuinely forgotten week is still catchable and
 * near enough that closing one is a minute's work.
 */
export const OPEN_WEEK_LOOKBACK = 4;

/**
 * Finished weeks that still need somebody to say what became of them, most
 * recent first.
 *
 * Weeks are enumerated from the calendar rather than from the baselines table,
 * and that is the whole trick: a week that was never planned has no row
 * anywhere, which is precisely why the abandoned ones were invisible. Reading
 * the table would have found every week except the ones worth finding.
 */
export async function openWeeks(
  lookback: number = OPEN_WEEK_LOOKBACK,
  today: string = todayISO()
): Promise<OpenWeek[]> {
  const thisMonday = weekStartISO(today);

  const weeks = Array.from({ length: lookback }, (_, i) =>
    addDaysISO(-7 * (i + 1), parseISODate(thisMonday))
  );

  const earliest = weeks[weeks.length - 1];

  const [baselines, tasks, checkIns, occurrences] = await Promise.all([
    db.planBaselines.toArray(),
    db.tasks.toArray(),
    /**
     * Bounded by the oldest week under consideration rather than read whole.
     * The point of the sweep is to be cheap enough to sit under a live query.
     */
    db.checkIns.where('date').between(earliest, thisMonday, true, false).toArray(),
    db.checkInOccurrences.where('date').between(earliest, thisMonday, true, false).toArray(),
  ]);

  const baselineFor = new Map(baselines.map((row) => [row.weekStart, row]));

  /** Local ISO date of a completion timestamp, matching how weeks are keyed. */
  const completedOn = (at: number): string => {
    const on = new Date(at);
    return `${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, '0')}-${String(
      on.getDate()
    ).padStart(2, '0')}`;
  };

  const open: OpenWeek[] = [];

  for (const weekStart of weeks) {
    const weekEnd = addDaysISO(6, parseISODate(weekStart));
    const baseline = baselineFor.get(weekStart);

    if (baseline?.reviewedAt || baseline?.writtenOffAt) continue;

    const inWeek = (date: string) => date >= weekStart && date <= weekEnd;
    const hadActivity =
      baseline !== undefined ||
      checkIns.some((row) => inWeek(row.date)) ||
      occurrences.some((row) => inWeek(row.date)) ||
      tasks.some((task) => task.completed && task.completedAt && inWeek(completedOn(task.completedAt)));

    // A week nobody touched is not a week anybody abandoned - it is a week
    // before they started. See `weekRecord`.
    if (!hadActivity) continue;

    if (baselineStatus(baseline) === 'BASELINED') {
      const committed = baseline?.taskIds ?? [];
      const done = committed.filter(
        (id) => tasks.find((task) => task.id === id)?.completed
      ).length;

      open.push({
        weekStart,
        weekEnd,
        standing: 'NEEDS_REVIEW',
        todo: 'Close this week',
        because:
          'It was agreed and ran, and nobody has looked back at it. ' +
          `${done} of ${committed.length} committed pieces of work got done.`,
      });
      continue;
    }

    open.push({
      weekStart,
      weekEnd,
      standing: 'ABANDONED',
      todo: 'Say what happened to this week',
      because:
        'It ran without an agreed plan, so there was nothing to keep and no bonus to earn. ' +
        'Write it off and it stops being asked about.',
    });
  }

  return open;
}

/**
 * The baseline row for a week, created empty if the week never had one.
 *
 * An abandoned week has nothing in `planBaselines` at all, and the decision to
 * write it off has to live somewhere. The row it gets is honest about what it
 * is: no committed work, no hours, status DRAFT - a week that was never agreed,
 * now carrying the note saying so.
 */
async function baselineRowFor(weekStart: string): Promise<WeekPlanBaseline> {
  const existing = await db.planBaselines.get(weekStart);
  if (existing) return existing;

  return {
    id: weekStart,
    weekStart,
    status: 'DRAFT',
    taskIds: [],
    hours: 0,
    createdAt: Date.now(),
  };
}

/**
 * Records that a week has been looked back at.
 *
 * Written by the weekly review, which until now left only an audit line dated
 * to the day it ran - so nothing could tell you *which* week had been reviewed,
 * and the gate timeline settled "close the week" from the calendar instead.
 */
export async function markWeekReviewed(
  weekStart: string,
  note?: string,
  user: UserRole = 'PARENT'
): Promise<WeekPlanBaseline> {
  const row: WeekPlanBaseline = {
    ...(await baselineRowFor(weekStart)),
    reviewedAt: Date.now(),
    reviewedNote: note?.trim() || undefined,
    // A week cannot be both reviewed and written off. Reviewing one that was
    // written off is somebody changing their mind, and the later act wins.
    writtenOffAt: undefined,
    writtenOffNote: undefined,
  };

  await db.planBaselines.put(row);
  await logAuditEvent({
    user,
    action: 'UPDATE',
    entity: 'WeekPlanBaseline',
    entityId: weekStart,
    fieldChanged: 'reviewedAt',
    newValue: `Week of ${weekStart} reviewed${note?.trim() ? ` — ${note.trim()}` : ''}`,
  });

  return row;
}

/**
 * Records that a week is not going to be reconstructed.
 *
 * A reason is required, and that is deliberate. "Late, not worth doing now" is
 * a fine reason and takes four seconds to type; what a required sentence rules
 * out is a button that silently makes weeks disappear, which is the version a
 * parent would rightly stop trusting.
 */
export async function writeOffWeek(
  weekStart: string,
  reason: string,
  user: UserRole = 'STUDENT'
): Promise<WeekPlanBaseline> {
  const note = reason.trim();
  if (!note) throw new Error('Say why the week is being written off.');

  const row: WeekPlanBaseline = {
    ...(await baselineRowFor(weekStart)),
    writtenOffAt: Date.now(),
    writtenOffNote: note,
  };

  await db.planBaselines.put(row);
  await logAuditEvent({
    user,
    action: 'UPDATE',
    entity: 'WeekPlanBaseline',
    entityId: weekStart,
    fieldChanged: 'writtenOffAt',
    newValue: `Week of ${weekStart} written off — ${note}`,
  });

  return row;
}

/** Undoes a write-off, putting the week back among the ones to deal with. */
export async function reopenWeek(
  weekStart: string,
  user: UserRole = 'STUDENT'
): Promise<void> {
  const existing = await db.planBaselines.get(weekStart);
  if (!existing) return;

  await db.planBaselines.put({
    ...existing,
    writtenOffAt: undefined,
    writtenOffNote: undefined,
    reviewedAt: undefined,
    reviewedNote: undefined,
  });

  await logAuditEvent({
    user,
    action: 'UPDATE',
    entity: 'WeekPlanBaseline',
    entityId: weekStart,
    fieldChanged: 'writtenOffAt',
    oldValue: existing.writtenOffNote ?? existing.reviewedNote ?? '(closed)',
    newValue: `Week of ${weekStart} reopened`,
  });
}

export const STANDING_LABEL: Record<WeekStanding, string> = {
  PLANNING: 'Being planned',
  RUNNING: 'Agreed and running',
  NEEDS_REVIEW: 'Finished, not closed',
  ABANDONED: 'Ran without a plan',
  WRITTEN_OFF: 'Written off',
  REVIEWED: 'Closed',
};

import { db } from '../db';
import {
  CheckInOccurrence,
  ExceptionReasonCategory,
  OccurrenceOutcome,
  UserRole,
  WeekType,
} from '../types';
import {
  DayOccurrence,
  DayShape,
  XP_FULL_DAY_BONUS,
  XP_PROMPT_BONUS,
  dayShape,
} from './dayPlan';
import { logAuditEvent } from './auditService';
import { newId } from '../utils/id';
import { addDaysISO, parseISODate, todayISO } from '../utils/date';
import { resolveWeekType } from './weekType';

/**
 * Recording what happened, one occurrence at a time.
 *
 * The two rules that shape everything here:
 *
 * A day can be answered late. A check-in written on Thursday about Tuesday is
 * still the truth about Tuesday, and the plan needs it more than it needs tidy
 * timestamps - so backfilling is a first-class action, promptness pays a bonus,
 * and lateness is never charged. Punishing a late answer only buys silence.
 *
 * And nothing is ever paid twice. Ids are built from the date and the
 * occurrence rather than generated, so two devices answering the same lesson
 * offline merge into one row; the day-level bonuses live on exactly one row per
 * date and are recomputed on every write, so two rows can never both believe
 * they completed the day.
 */

/** `${date}__${occurrenceKey}`, by construction and never generated. */
export function occurrenceId(date: string, occurrenceKey: string): string {
  return `${date}__${occurrenceKey}`;
}

export interface RecordOccurrenceInput {
  date: string;
  occurrence: DayOccurrence;
  outcome: OccurrenceOutcome;
  minutes?: number;
  notes?: string;
  /** Why it did not fully happen. Only carried on PARTIAL and MISSED answers. */
  reasonCategory?: ExceptionReasonCategory;
  followUp?: string;
  loggedBy?: UserRole;
}

/**
 * Whether an outcome earns its row's XP.
 *
 * A missed occurrence still earns it. The XP here is for *answering*, not for
 * attending - the moment "I did not go" pays less than "I went", the honest
 * answer starts costing something and the record stops being reliable. The
 * consequence of a missed session belongs in the week's execution score, where
 * it is visible and can be discussed, not hidden in a per-row rounding.
 */
function rowXp(occurrence: DayOccurrence): number {
  return occurrence.xp;
}

/**
 * Recomputes and redistributes a date's day-level bonuses.
 *
 * Called after every write to that date. The whole bonus sits on the earliest
 * row by id, chosen only because it is stable - what matters is that exactly
 * one row carries it, whichever row that is.
 */
async function settleDayBonus(date: string, shape: DayShape): Promise<void> {
  const rows = await db.checkInOccurrences.where('date').equals(date).toArray();
  if (rows.length === 0) return;

  const expected = new Set(shape.occurrences.map((o) => o.key));
  const answered = new Set(rows.map((r) => r.occurrenceKey));
  const everythingAnswered =
    expected.size > 0 && [...expected].every((key) => answered.has(key));

  // Promptness is a property of the whole day's answering, not of one row: a
  // day finished on the night it happened earns it, a day mostly backfilled
  // does not.
  const allPrompt = rows.every((row) => row.loggedOnDate === row.date);

  const bonus =
    (everythingAnswered ? XP_FULL_DAY_BONUS : 0) +
    (everythingAnswered && allPrompt ? XP_PROMPT_BONUS : 0);

  const ordered = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const holder = ordered[0];

  await db.transaction('rw', db.checkInOccurrences, async () => {
    for (const row of ordered) {
      const next = row.id === holder.id ? bonus : 0;
      if ((row.dayBonusXp ?? 0) !== next) {
        await db.checkInOccurrences.update(row.id, { dayBonusXp: next });
      }
    }
  });
}

/**
 * Writes one answer, and raises its follow-up as real work.
 *
 * A follow-up that stays inside a check-in is a note nobody reads again. It
 * becomes a task in the current week, so it shows up where work is looked at
 * and earns its own XP when it is done - which is the only reason anybody would
 * write one down honestly.
 */
export async function recordOccurrence(
  input: RecordOccurrenceInput
): Promise<CheckInOccurrence> {
  const { date, occurrence, outcome } = input;
  const id = occurrenceId(date, occurrence.key);
  const existing = await db.checkInOccurrences.get(id);

  let followUpTaskId = existing?.followUpTaskId;
  const followUp = input.followUp?.trim() || undefined;

  if (followUp && !followUpTaskId) {
    followUpTaskId = newId('task');
    await db.tasks.add({
      id: followUpTaskId,
      subjectId: occurrence.subjectId ?? 'general',
      bucket: 'THIS_WEEK',
      committedAt: Date.now(),
      title: followUp,
      description: `Raised at check-in for ${occurrence.label} on ${date}.`,
      // Due today rather than on the date it came from: a follow-up raised on
      // Tuesday and backfilled on Thursday is not already two days overdue.
      dueDate: todayISO(),
      priority: 'MEDIUM',
      isHomework: false,
      isRemediation: false,
      estimatedHours: 0.5,
      xpValue: 15,
      completed: false,
      createdAt: Date.now(),
    });
  }

  const row: CheckInOccurrence = {
    id,
    date,
    occurrenceKey: occurrence.key,
    kind: occurrence.kind,
    label: occurrence.label,
    subjectId: occurrence.subjectId,
    commitmentId: occurrence.commitmentId,
    taskId: occurrence.taskId,
    outcome,
    minutes: input.minutes,
    notes: input.notes?.trim() || undefined,
    /**
     * Dropped when the answer goes back to HAPPENED. A reason left behind on a
     * row that now says it happened is a contradiction the reader has to
     * resolve, and they will resolve it by trusting neither.
     */
    reasonCategory: outcome === 'HAPPENED' ? undefined : input.reasonCategory,
    followUp,
    followUpTaskId,
    xpAwarded: rowXp(occurrence),
    dayBonusXp: existing?.dayBonusXp ?? 0,
    loggedOnDate: existing?.loggedOnDate ?? todayISO(),
    loggedAt: Date.now(),
    loggedBy: input.loggedBy ?? 'STUDENT',
  };

  await db.checkInOccurrences.put(row);

  /**
   * Ticking off committed work through the check-in completes the task itself.
   * Asking "did you do it?" and then requiring the same answer again on the
   * Work tab is the sort of duplication that teaches people to skip one of the
   * two, and it is never the one that pays XP.
   */
  if (occurrence.taskId && outcome === 'HAPPENED') {
    const task = await db.tasks.get(occurrence.taskId);
    if (task && !task.completed) {
      await db.tasks.update(occurrence.taskId, { completed: true, completedAt: Date.now() });
    }
  }

  const shape = await dayShape(date, await resolveWeekType(date));
  await settleDayBonus(date, shape);

  await logAuditEvent({
    user: row.loggedBy,
    action: existing ? 'UPDATE' : 'INSERT',
    entity: 'checkInOccurrences',
    entityId: id,
    newValue: `${occurrence.label} - ${outcome.toLowerCase()}`,
  });

  return row;
}

export async function occurrencesOn(date: string): Promise<CheckInOccurrence[]> {
  return db.checkInOccurrences.where('date').equals(date).toArray();
}

export interface DayProgress {
  date: string;
  shape: DayShape;
  answered: CheckInOccurrence[];
  /** Occurrences with no answer yet. This is the number worth showing. */
  pending: DayOccurrence[];
  xpEarned: number;
  xpAvailable: number;
  isComplete: boolean;
  /** True once the day is over and something is still unanswered. */
  needsBackfill: boolean;
}

/**
 * How a single day stands: what is answered, what is not, and what it is worth.
 *
 * Earned and available are reported together because "12 of a possible 31
 * today" is a reason to open the check-in and "+2 XP" is not.
 */
export async function dayProgress(
  date: string,
  fallbackWeekType: WeekType = 'ODD'
): Promise<DayProgress> {
  // The term calendar decides when it is set; what the caller passes is only
  // what to fall back on until somebody has entered a term start date.
  const shape = await dayShape(date, await resolveWeekType(date, fallbackWeekType));
  const answered = await occurrencesOn(date);
  const answeredKeys = new Set(answered.map((row) => row.occurrenceKey));

  const pending = shape.occurrences.filter((o) => !answeredKeys.has(o.key));
  const xpEarned = answered.reduce(
    (sum, row) => sum + row.xpAwarded + (row.dayBonusXp ?? 0),
    0
  );

  const perRow = shape.occurrences.reduce((sum, o) => sum + o.xp, 0);
  const stillPrompt = date === todayISO();
  const xpAvailable =
    shape.occurrences.length === 0
      ? 0
      : perRow + XP_FULL_DAY_BONUS + (stillPrompt ? XP_PROMPT_BONUS : 0);

  return {
    date,
    shape,
    answered,
    pending,
    xpEarned,
    xpAvailable,
    isComplete: shape.occurrences.length > 0 && pending.length === 0,
    needsBackfill: date < todayISO() && pending.length > 0,
  };
}

/**
 * Days behind us that still have something unanswered, most recent first.
 *
 * This is what turns "you missed a check-in" from a reprimand into a task: the
 * app can name the date, say what is missing from it, and open straight into
 * it. Bounded to a fortnight because a plan cannot be repaired from further
 * back than that, and an unbounded list of failures is just a wall of guilt.
 */
export async function daysNeedingBackfill(
  reference: string = todayISO(),
  lookback = 14
): Promise<DayProgress[]> {
  const days: DayProgress[] = [];

  for (let back = 1; back <= lookback; back++) {
    const date = addDaysISO(-back, parseISODate(reference));
    const progress = await dayProgress(date);
    if (progress.shape.occurrences.length === 0) continue;
    if (progress.pending.length === 0) continue;
    days.push(progress);
  }

  return days;
}

/** Every occurrence row in a date range, for the week views. */
export async function occurrencesBetween(
  start: string,
  end: string
): Promise<CheckInOccurrence[]> {
  return db.checkInOccurrences.where('date').between(start, end, true, true).toArray();
}

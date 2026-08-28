import { db } from '../db';
import {
  CommitmentException,
  CommitmentExceptionStatus,
  DayOfWeek,
  ExceptionReasonCategory,
  FixedCommitment,
  TimetableEntry,
  UserRole,
  WeekType,
} from '../types';
import { parseISODate, todayISO } from '../utils/date';
import { logAuditEvent } from './auditService';
import { currentWeek, WeekWindow } from './weekWindow';

/**
 * Fixed commitments, and the occasions of them that did not happen.
 *
 * The burnout gauge has always assumed cadets costs six hours a week. It does,
 * in a normal week - but a family dinner, a mock exam or a unit stand-down all
 * produce a week where it costs three, and the app had nowhere to say so. The
 * result was a gauge that overstated the load and cried burnout at a week that
 * was actually fine, which is exactly how a warning stops being read.
 */

const DAY_ORDER: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const REASON_LABEL: Record<ExceptionReasonCategory, string> = {
  FAMILY: 'Family outing or dinner',
  ILLNESS: 'Illness or rest',
  MOCK_PREP: 'Mock exam preparation',
  SCHOOL_TRIP: 'School trip or excursion',
  STAND_DOWN: 'Cancelled or stood down',
  OTHER: 'Something else',
};

export const REASON_ICON: Record<ExceptionReasonCategory, string> = {
  FAMILY: '👨‍👩‍👧',
  ILLNESS: '🤒',
  MOCK_PREP: '📚',
  SCHOOL_TRIP: '🚌',
  STAND_DOWN: '🚫',
  OTHER: '📝',
};

export const STATUS_LABEL: Record<CommitmentExceptionStatus, string> = {
  EXCUSED_ABSENT: 'Excused absence',
  POSTPONED: 'Postponed',
  CANCELLED_BY_ORGANISER: 'Cancelled by organiser',
  ATTENDED: 'Attended after all',
};

/**
 * `${commitmentId}__${date}`, never a generated id.
 *
 * One occasion is one row whichever device logs it. Two phones logging the same
 * missed parade night offline then syncing merge into a single row and deduct
 * the hours once; a random id would have deducted them twice and looked like a
 * sync fault rather than the modelling mistake it would have been.
 */
export function exceptionId(commitmentId: string, date: string): string {
  return `${commitmentId}__${date}`;
}

/** Whole hours between two HH:MM times on the same day, to 1dp. */
export function slotHours(startTime: string, endTime: string): number {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return Math.round(((toMinutes(endTime) - toMinutes(startTime)) / 60) * 10) / 10;
}

export function dayOfWeekFor(dateISO: string): DayOfWeek {
  return DAY_ORDER[parseISODate(dateISO).getDay()];
}

export async function listCommitments(includeArchived = false): Promise<FixedCommitment[]> {
  // `isActive` is a boolean and so never indexed - filter in memory.
  const all = await db.commitments.toArray();
  return all
    .filter((c) => includeArchived || c.isActive)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/**
 * One occurrence of a commitment on a particular day: what it is called, how
 * long it runs, and whether it has already been excused.
 */
export interface CommitmentOccasion {
  commitment: FixedCommitment;
  date: string;
  title: string;
  hours: number;
  entry?: TimetableEntry;
  exception?: CommitmentException;
}

/**
 * Every commitment that has an occasion on `date`.
 *
 * A linked timetable row is preferred, because its real start and end times
 * know that a parade night is three hours and not the whole weekly six. Where
 * there is no row for the day - school, whose periods are generated rather than
 * enumerated - `hoursPerOccasion` is the fallback, and only on days the
 * commitment could plausibly fall on.
 */
export async function occasionsOn(
  date: string = todayISO(),
  weekType: WeekType = 'ODD'
): Promise<CommitmentOccasion[]> {
  const [commitments, entries, exceptions] = await Promise.all([
    listCommitments(),
    db.timetableEntries.toArray(),
    db.commitmentExceptions.where('date').equals(date).toArray(),
  ]);

  const day = dayOfWeekFor(date);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const exceptionById = new Map(exceptions.map((e) => [e.commitmentId, e]));

  const occasions: CommitmentOccasion[] = [];

  for (const commitment of commitments) {
    const todaysEntries = commitment.timetableEntryIds
      .map((id) => byId.get(id))
      .filter((e): e is TimetableEntry => !!e)
      .filter((e) => e.dayOfWeek === day && (e.weekType === 'BOTH' || e.weekType === weekType));

    if (todaysEntries.length > 0) {
      for (const entry of todaysEntries) {
        occasions.push({
          commitment,
          date,
          title: entry.activityName,
          hours: slotHours(entry.startTime, entry.endTime) || commitment.hoursPerOccasion,
          entry,
          exception: exceptionById.get(commitment.id),
        });
      }
      continue;
    }

    // No linked row for today. School still happens on a school day; a
    // commitment that names its occasions and has none today simply does not.
    const isUnenumerated = commitment.timetableEntryIds.length === 0;
    const isSchoolDay = day !== 'SAT' && day !== 'SUN';
    if (isUnenumerated && isSchoolDay) {
      occasions.push({
        commitment,
        date,
        title: commitment.label,
        hours: commitment.hoursPerOccasion,
        exception: exceptionById.get(commitment.id),
      });
    }
  }

  return occasions;
}

export interface LogExceptionInput {
  commitment: FixedCommitment;
  date: string;
  title: string;
  scheduledHours: number;
  status: CommitmentExceptionStatus;
  reasonCategory: ExceptionReasonCategory;
  reasonNotes?: string;
  loggedBy?: UserRole;
}

/**
 * Records that an occasion did not happen as scheduled.
 *
 * Written to the audit log like every other consequential change. An absence
 * quietly removes hours from the week's load, and a way to make hours disappear
 * that a parent cannot see would undermine the whole capacity model - the
 * portal's promise is "fewer arguments, same trust", and the trust half is the
 * record.
 */
export async function logException(input: LogExceptionInput): Promise<CommitmentException> {
  const {
    commitment,
    date,
    title,
    scheduledHours,
    status,
    reasonCategory,
    reasonNotes,
    loggedBy = 'STUDENT',
  } = input;

  const row: CommitmentException = {
    id: exceptionId(commitment.id, date),
    commitmentId: commitment.id,
    date,
    title,
    // A snapshot, not a live lookup: editing the commitment down to 2h next
    // term must not rewrite what last October's absence deducted.
    scheduledHours,
    status,
    reasonCategory,
    reasonNotes: reasonNotes?.trim() || undefined,
    // An "attended after all" row exists for the record and never moves the total.
    deductsFromCapacity: status !== 'ATTENDED',
    loggedBy,
    createdAt: Date.now(),
  };

  const existing = await db.commitmentExceptions.get(row.id);
  await db.commitmentExceptions.put(row);

  await logAuditEvent({
    user: loggedBy,
    action: existing ? 'UPDATE' : 'INSERT',
    entity: 'CommitmentException',
    entityId: row.id,
    fieldChanged: 'status',
    oldValue: existing ? `${STATUS_LABEL[existing.status]} — ${REASON_LABEL[existing.reasonCategory]}` : undefined,
    newValue:
      `${title} on ${date}: ${STATUS_LABEL[status]} — ${REASON_LABEL[reasonCategory]}` +
      (row.deductsFromCapacity ? ` (${scheduledHours}h off this week)` : ' (no change to the week)'),
  });

  return row;
}

/** Undoes an exception, putting its hours back into the week. */
export async function removeException(
  exception: CommitmentException,
  user: UserRole = 'STUDENT'
): Promise<void> {
  await db.commitmentExceptions.delete(exception.id);
  await logAuditEvent({
    user,
    action: 'DELETE',
    entity: 'CommitmentException',
    entityId: exception.id,
    oldValue: `${exception.title} on ${exception.date} — ${STATUS_LABEL[exception.status]}`,
    newValue: `Removed; ${exception.scheduledHours}h back in the week`,
  });
}

/** This week's exceptions, newest occasion first. */
export async function weekExceptions(
  window: WeekWindow = currentWeek()
): Promise<CommitmentException[]> {
  const rows = await db.commitmentExceptions
    .where('date')
    .between(window.start, window.end, true, true)
    .toArray();
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** Saves a commitment a parent has edited or added. */
export async function saveCommitment(
  input: Partial<FixedCommitment> & { id: string; label: string; weeklyHours: number },
  user: UserRole = 'PARENT'
): Promise<void> {
  const existing = await db.commitments.get(input.id);

  const row: FixedCommitment = {
    timetableEntryIds: [],
    hoursPerOccasion: input.weeklyHours,
    isActive: true,
    createdAt: Date.now(),
    createdBy: user,
    ...existing,
    ...input,
  };

  await db.commitments.put(row);
  await logAuditEvent({
    user,
    action: existing ? 'UPDATE' : 'INSERT',
    entity: 'Commitment',
    entityId: row.id,
    fieldChanged: 'weeklyHours',
    oldValue: existing ? `${existing.label} — ${existing.weeklyHours} hrs/wk` : undefined,
    newValue: `${row.label} — ${row.weeklyHours} hrs/wk`,
  });
}

/**
 * Archives rather than deletes, for the same reason chores and rewards do:
 * seeding re-inserts any absent row it knows about, so a deleted commitment
 * would reappear on the next open, and past exceptions would point at nothing.
 */
export async function archiveCommitment(
  commitment: FixedCommitment,
  user: UserRole = 'PARENT'
): Promise<void> {
  await db.commitments.update(commitment.id, { isActive: false });
  await logAuditEvent({
    user,
    action: 'UPDATE',
    entity: 'Commitment',
    entityId: commitment.id,
    fieldChanged: 'isActive',
    oldValue: `${commitment.label} — ${commitment.weeklyHours} hrs/wk counted`,
    newValue: `${commitment.label} no longer counted towards the week`,
  });
}

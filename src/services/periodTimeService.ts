import { db } from '../db';
import { TimetableEntry, TimetableSlotConfig } from '../types';

/**
 * Moving a period, and the lessons sitting in it.
 *
 * Period times were only ever the *defaults* offered to new lessons: existing
 * lessons carry their own start and end, so changing Period 1 moved nothing
 * already on the timetable. That is defensible in the abstract - a bell
 * schedule change should not silently rewrite history - and wrong in practice.
 * Tejas changed a period time, saw Monday keep the old one, and filed it as a
 * bug, which is the honest verdict: nobody edits the bell times as a historical
 * record, they edit them because the school moved the bell.
 *
 * So the change now offers to carry the lessons with it, and the interesting
 * part is which lessons. A lesson still sitting at the period's old times is
 * following the period, and should move. A lesson somebody has already given
 * its own times is an outlier - a shortened Friday, a double period - and
 * moving it would destroy the very edit that made it an outlier. The split is
 * decided by the old default, never by the new one, and both sides are counted
 * so the screen can say what it is about to do before it does it.
 */

export interface PeriodTimeImpact {
  /** Lessons still at the period's current times - these would move. */
  following: TimetableEntry[];
  /** Lessons with times of their own - these are left exactly as they are. */
  outliers: TimetableEntry[];
}

/**
 * Which lessons a period-time change would touch.
 *
 * Matched on `slotName` because that is the only link between a lesson and its
 * period; entries carry the name rather than the slot's id.
 */
export async function previewPeriodTimeChange(
  slot: TimetableSlotConfig
): Promise<PeriodTimeImpact> {
  const entries = await db.timetableEntries.toArray();
  const inSlot = entries.filter((entry) => entry.slotName === slot.name);

  const following = inSlot.filter(
    (entry) =>
      entry.startTime === slot.defaultStartTime && entry.endTime === slot.defaultEndTime
  );
  const outliers = inSlot.filter((entry) => !following.includes(entry));

  return { following, outliers };
}

/**
 * Applies new times to the lessons that were following the old ones.
 *
 * Takes the impact rather than recomputing it, so the rows that move are
 * exactly the rows the screen counted. Recomputing after the slot's own default
 * has been written would match nothing at all - the old times it filters on
 * would already be gone.
 */
export async function applyPeriodTimeToLessons(
  impact: PeriodTimeImpact,
  times: { startTime: string; endTime: string }
): Promise<number> {
  if (impact.following.length === 0) return 0;

  await db.timetableEntries.bulkUpdate(
    impact.following.map((entry) => ({
      key: entry.id,
      changes: { startTime: times.startTime, endTime: times.endTime },
    }))
  );

  return impact.following.length;
}

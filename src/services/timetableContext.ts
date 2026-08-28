import { db } from '../db';
import { SubjectId, WeekType } from '../types';
import { dayOfWeekFor } from './commitmentService';
import { todayISO } from '../utils/date';

/**
 * Which subject the person adding something is most likely thinking about.
 *
 * Homework is written down in the two minutes after the lesson that set it, or
 * on the bus home. The app already knows which lesson that was, and asking
 * anyway means the subject picker gets left blank - which is how a task ends up
 * unattributed and quietly stops counting towards its subject's health score
 * and its goal's weekly hours.
 *
 * A default, never a decision: whatever this returns is pre-selected and can be
 * changed with one tap.
 */

/** Minutes past midnight for an HH:MM time. */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * The subject of the lesson happening now, or the most recent one to have
 * finished today.
 *
 * Returns undefined outside school hours, on a day with no lessons, and for
 * periods with no subject attached (registration, lunch, the cadets block) -
 * all cases where a guess would be worse than an empty picker.
 */
export async function currentSubjectId(
  weekType: WeekType,
  now: Date = new Date()
): Promise<SubjectId | undefined> {
  const day = dayOfWeekFor(todayISO());

  const entries = (await db.timetableEntries.where('dayOfWeek').equals(day).toArray())
    .filter((e) => e.weekType === 'BOTH' || e.weekType === weekType)
    .filter((e) => !!e.subjectId)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (entries.length === 0) return undefined;

  const minutesNow = now.getHours() * 60 + now.getMinutes();

  const inProgress = entries.find(
    (e) => toMinutes(e.startTime) <= minutesNow && minutesNow < toMinutes(e.endTime)
  );
  if (inProgress) return inProgress.subjectId;

  // Nothing running: the lesson that just finished is the better guess than
  // the one that has not happened yet.
  const finished = entries.filter((e) => toMinutes(e.endTime) <= minutesNow);
  return finished.at(-1)?.subjectId;
}

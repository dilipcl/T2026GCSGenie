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

/**
 * The subject to pre-select in Quick Add, including when school is not running.
 *
 * `currentSubjectId` deliberately returns nothing outside school hours, which is
 * correct for its own job and turned out to be the wrong behaviour for the
 * picker that consumes it. Adding a task requires a subject, so on a Saturday -
 * or on a bank holiday, as on 31 August 2026 - the field arrived blank and the
 * student had to choose one before anything could be saved. Faced with that,
 * the fastest option is to pick whichever subject is nearest the thumb, and the
 * data inherits a choice nobody meant.
 *
 * So the ladder, most specific first:
 *
 *  1. The lesson happening now, or the one that just finished.
 *  2. The subject of the most recent task, which on a weekend is almost always
 *     what the next one is about too.
 *  3. General - a real subject that means "not aimed at an exam yet", so the
 *     field is never empty and never a lie.
 *
 * Step 3 is why `general` exists. Leaving `subjectId` blank would have been the
 * smaller change, but it puts nulls into the table every later analysis has to
 * interpret, and the app would still have had to decide what an unattributed
 * task does to a subject's health.
 */
export async function suggestedSubjectId(
  weekType: WeekType,
  now: Date = new Date()
): Promise<SubjectId> {
  /**
   * The timetable is only evidence when today's lessons actually ran. A bank
   * holiday still has a Monday timetable, so without this check the ladder
   * never reaches its fallbacks on precisely the days it was built for.
   */
  if (await schoolRanToday()) {
    const inLesson = await currentSubjectId(weekType, now);
    if (inLesson) return inLesson;
  }

  /**
   * Sorted in memory, not by `orderBy`. `createdAt` is not in the tasks index
   * - see the note at the top of db/index.ts about which keys actually exist -
   * and asking Dexie to order by it throws SchemaError rather than falling back,
   * which would have crashed Quick Add on open for every user.
   */
  const tasks = await db.tasks.toArray();
  const recent = tasks.sort((a, b) => b.createdAt - a.createdAt)[0];
  if (recent?.subjectId) return recent.subjectId;

  return 'general';
}

/**
 * Whether today's lessons actually happened.
 *
 * The timetable says what Monday normally looks like; it does not know that
 * this particular Monday was a bank holiday. On 31 August 2026 Tejas logged
 * School as cancelled and the picker still pre-filled a subject from the
 * timetable - the exact case that prompted this work, arriving through a door
 * the first fix did not cover.
 *
 * Matched on the exception's own title rather than by resolving the commitment,
 * because the exception row records the title it was logged against and that is
 * the fact we actually need.
 */
export async function schoolRanToday(date: string = todayISO()): Promise<boolean> {
  const exceptions = await db.commitmentExceptions.where('date').equals(date).toArray();
  return !exceptions.some(
    (e) => e.status !== 'ATTENDED' && /school/i.test(e.title || '')
  );
}

/**
 * A lesson spanning this exact moment.
 *
 * Distinct from `currentSubjectId`, which deliberately falls back to the lesson
 * that most recently finished. That fallback is right for guessing a subject
 * and wrong for claiming one is in progress: at eight in the evening it made
 * the picker say "pre-filled from the lesson happening now" about a lesson that
 * ended six hours earlier.
 */
export async function lessonInProgress(
  weekType: WeekType,
  now: Date = new Date()
): Promise<boolean> {
  if (!(await schoolRanToday())) return false;

  const day = dayOfWeekFor(todayISO());
  const entries = (await db.timetableEntries.where('dayOfWeek').equals(day).toArray())
    .filter((e) => e.weekType === 'BOTH' || e.weekType === weekType)
    .filter((e) => !!e.subjectId);

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return entries.some(
    (e) => toMinutes(e.startTime) <= minutesNow && minutesNow < toMinutes(e.endTime)
  );
}

/**
 * Whether the picker may describe its guess as coming from a live lesson.
 *
 * Only true when school ran today AND a lesson is happening right now.
 */
export async function isSchoolInSession(
  weekType: WeekType,
  now: Date = new Date()
): Promise<boolean> {
  return lessonInProgress(weekType, now);
}

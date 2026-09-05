import { db } from '../db';
import { CheckInOccurrence, DailyCheckIn } from '../types';

/**
 * What a check-in actually said.
 *
 * Updates records that a check-in happened and summarises it in one line -
 * energy, focus, a count of tasks, some minutes and the XP. That line is a
 * receipt, not an answer: it says two tasks were ticked without saying which,
 * says 45 minutes of study without saying what was studied, and drops the
 * notes entirely. The notes are the part worth keeping - a question to ask a
 * teacher tomorrow is written down precisely so somebody reads it later, and
 * nowhere in the app did anybody ever read it again.
 *
 * So this reassembles the whole answer from the records it was written into,
 * for one row of the feed on demand. Nothing is stored twice; the feed row
 * already carries the check-in's id, and everything below hangs off that.
 */

/** A piece of work that was ticked off, named rather than counted. */
export interface CheckedOffWork {
  id: string;
  /** The task's title, or a plain statement that the task is gone. */
  title: string;
  /** The task has since been deleted, so only the id survives. */
  missing: boolean;
}

export interface CheckInDetail {
  checkIn: DailyCheckIn;
  /** The tasks ticked off in this check-in, in the order they were recorded. */
  completedWork: CheckedOffWork[];
  /** The subject the logged minutes were spent on, in words. */
  studySubjectName?: string;
  /** The goal the session was worked against, in words. */
  studyGoalTitle?: string;
  /**
   * How the day itself was answered, lesson by lesson. A check-in and the day's
   * occurrences are two halves of the same act - the day is where "did this
   * happen" was answered, and the check-in is where the day was scored - so
   * showing one without the other explains half of an evening.
   */
  occurrences: CheckInOccurrence[];
  /** Occurrences that raised something to do about them. */
  followUps: CheckInOccurrence[];
  /** Total XP recorded against the day's occurrences, bonuses included. */
  occurrenceXp: number;
}

/** Every free-text note on the check-in, labelled, skipping the empty ones. */
export function checkInNotes(checkIn: DailyCheckIn): { label: string; text: string }[] {
  const notes = checkIn.structuredNotes;
  const rows = [
    { label: 'What I learned', text: notes?.keyLearning },
    { label: 'To ask about', text: notes?.blockersAndQuestions },
    { label: 'Tomorrow', text: notes?.actionForTomorrow },
    { label: 'Notes', text: notes?.generalNotes ?? checkIn.notes },
  ];

  return rows
    .map((row) => ({ label: row.label, text: (row.text ?? '').trim() }))
    .filter((row) => row.text.length > 0);
}

/**
 * The whole of one check-in, or null when the row is no longer there.
 *
 * Null rather than a throw: a feed row outlives the record it describes, and an
 * expander that explodes on a deleted check-in is worse than one that says the
 * detail is gone.
 */
export async function checkInDetail(checkInId: string): Promise<CheckInDetail | null> {
  const checkIn = await db.checkIns.get(checkInId);
  if (!checkIn) return null;

  const [tasks, subjects, goals, occurrences] = await Promise.all([
    db.tasks.bulkGet(checkIn.completedHomeworkIds ?? []),
    checkIn.studySubjectId ? db.subjects.get(checkIn.studySubjectId) : Promise.resolve(undefined),
    checkIn.studyGoalId ? db.goals.get(checkIn.studyGoalId) : Promise.resolve(undefined),
    db.checkInOccurrences.where('date').equals(checkIn.date).toArray(),
  ]);

  const completedWork: CheckedOffWork[] = (checkIn.completedHomeworkIds ?? []).map((id, i) => {
    const task = tasks[i];
    return {
      id,
      title: task?.title ?? 'This task has since been deleted',
      missing: !task,
    };
  });

  return {
    checkIn,
    completedWork,
    studySubjectName: subjects?.name,
    studyGoalTitle: goals?.title,
    occurrences,
    followUps: occurrences.filter((o) => (o.followUp ?? '').trim().length > 0),
    occurrenceXp: occurrences.reduce(
      (total, o) => total + (o.xpAwarded ?? 0) + (o.dayBonusXp ?? 0),
      0
    ),
  };
}

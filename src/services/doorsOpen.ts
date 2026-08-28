import { db } from '../db';
import { CareerGuidanceResource, SubjectConfig, SubjectId } from '../types';

/**
 * How many routes are still in reach at today's grades.
 *
 * The film's sixth scene is the one that gives the whole thing its stakes:
 * "grades don't decide who you are as a person. They just decide how many doors
 * are still open when you finally want one", over Further Maths, Physics and
 * Computer Science.
 *
 * Both halves of the answer were already in the database and had simply never
 * been joined - `careerResources.requiredGCSEGrade` against each subject's
 * `currentEstimatedGrade`. This is that join.
 *
 * Framed as doors open rather than doors lost, deliberately and in that order.
 * The same arithmetic phrased as a count of failures is a different product,
 * and not one worth putting in front of a fourteen year old on a Tuesday.
 */

export type DoorStatus = 'OPEN' | 'CLOSE' | 'STRETCH';

export interface Door {
  resource: CareerGuidanceResource;
  status: DoorStatus;
  /** The relevant subjects and where each currently stands. */
  subjects: { subject: SubjectConfig; grade: number; meets: boolean }[];
  /** Subjects short of the requirement, nearest first. */
  shortfall: { subject: SubjectConfig; gap: number }[];
}

export interface DoorsSummary {
  open: number;
  /** Within one grade on every relevant subject. */
  withinReach: number;
  total: number;
  doors: Door[];
  /** The single subject that would open the most doors if it moved up a grade. */
  bestNextStep?: { subject: SubjectConfig; unlocks: number };
}

/**
 * A resource with no relevant subject named cannot be judged, so it is counted
 * as open rather than quietly dropped - the total has to match what the
 * guidance hub actually lists, or the number looks wrong next to the page.
 */
function assess(resource: CareerGuidanceResource, subjects: Map<string, SubjectConfig>): Door {
  const relevant = resource.relevantSubjectIds
    .map((id) => subjects.get(id))
    .filter((s): s is SubjectConfig => !!s);

  const rows = relevant.map((subject) => {
    const grade = subject.currentEstimatedGrade ?? 0;
    return { subject, grade, meets: grade >= resource.requiredGCSEGrade };
  });

  const shortfall = rows
    .filter((r) => !r.meets)
    .map((r) => ({ subject: r.subject, gap: resource.requiredGCSEGrade - r.grade }))
    .sort((a, b) => a.gap - b.gap);

  const status: DoorStatus =
    shortfall.length === 0 ? 'OPEN' : shortfall.every((s) => s.gap <= 1) ? 'CLOSE' : 'STRETCH';

  return { resource, status, subjects: rows, shortfall };
}

export async function readDoors(): Promise<DoorsSummary> {
  const [resources, subjectList] = await Promise.all([
    db.careerResources.toArray(),
    db.subjects.toArray(),
  ]);

  const subjects = new Map(subjectList.map((s) => [s.id, s]));
  const doors = resources.map((r) => assess(r, subjects));

  /**
   * Which single subject moving up one grade would open the most doors.
   *
   * Only counts doors where that subject is the *only* thing standing in the
   * way, and where one grade is enough. Anything else would be advice that
   * does not survive being acted on.
   */
  const unlocksBySubject = new Map<SubjectId, number>();
  for (const door of doors) {
    if (door.status !== 'CLOSE' || door.shortfall.length !== 1) continue;
    const blocker = door.shortfall[0];
    if (blocker.gap > 1) continue;
    unlocksBySubject.set(blocker.subject.id, (unlocksBySubject.get(blocker.subject.id) || 0) + 1);
  }

  let bestNextStep: DoorsSummary['bestNextStep'];
  for (const [subjectId, unlocks] of unlocksBySubject) {
    if (!bestNextStep || unlocks > bestNextStep.unlocks) {
      const subject = subjects.get(subjectId);
      if (subject) bestNextStep = { subject, unlocks };
    }
  }

  return {
    open: doors.filter((d) => d.status === 'OPEN').length,
    withinReach: doors.filter((d) => d.status === 'CLOSE').length,
    total: doors.length,
    doors,
    bestNextStep,
  };
}

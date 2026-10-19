import { db } from '../db';
import { HalfTerm, SubjectId, SyllabusTopic, UserRole } from '../types';
import { logAuditEvent } from './auditService';
import { newId } from '../utils/id';
import { parseISODate, todayISO } from '../utils/date';

/**
 * The school's own plan: which topics the teachers will cover, and roughly
 * when, entered once from the scheme of work so each topic is waiting to be
 * ticked when it is taught rather than typed in on the night.
 *
 * Asked for on 19 Oct 2026. Until then a topic only existed once Tejas had
 * been taught it and remembered to add it, so the app could say what had been
 * covered but never what was coming, nor that a half-term's topics had slipped
 * by without a lesson tagged to any of them.
 *
 * **Half-terms, not dates.** Schools publish the order and the half-term; the
 * exact week moves with every snow day. The windows below are the usual
 * English school year, which is close enough for "this half-term" and "last
 * half-term", and wrong by a week at most at the edges - where a topic reads as
 * due now rather than behind, which is the kind direction to be wrong in.
 *
 * **Taught is derived, never stored here.** A planned topic counts as taught
 * when it has a teaching date or a lesson tagged to it, exactly as every other
 * topic does (`journeyOf`). Tagging a lesson is the whole of the work.
 */

export const HALF_TERMS: { id: HalfTerm; label: string; short: string }[] = [
  { id: 'AUT1', label: 'Autumn 1', short: 'Aut 1' },
  { id: 'AUT2', label: 'Autumn 2', short: 'Aut 2' },
  { id: 'SPR1', label: 'Spring 1', short: 'Spr 1' },
  { id: 'SPR2', label: 'Spring 2', short: 'Spr 2' },
  { id: 'SUM1', label: 'Summer 1', short: 'Sum 1' },
  { id: 'SUM2', label: 'Summer 2', short: 'Sum 2' },
];

export const halfTermLabel = (term: HalfTerm) =>
  HALF_TERMS.find((t) => t.id === term)?.label ?? term;

/**
 * Month-day bounds of each half-term within an academic year that starts in
 * September of year Y. The spring and summer ones fall in Y + 1.
 */
const WINDOWS: Record<HalfTerm, { from: string; to: string; nextYear: boolean }> = {
  AUT1: { from: '09-01', to: '10-31', nextYear: false },
  AUT2: { from: '11-01', to: '12-31', nextYear: false },
  SPR1: { from: '01-01', to: '02-20', nextYear: true },
  SPR2: { from: '02-21', to: '04-15', nextYear: true },
  SUM1: { from: '04-16', to: '05-31', nextYear: true },
  SUM2: { from: '06-01', to: '08-31', nextYear: true },
};

type YearGroup = NonNullable<SyllabusTopic['yearGroup']>;
const YEAR_NUMBER: Record<YearGroup, number> = { YEAR_9: 9, YEAR_10: 10, YEAR_11: 11 };

/** September's year for the academic year a date falls in. */
export function academicYearOf(date: string): number {
  const d = parseISODate(date);
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}

/** "Year 10", "Y10", "10" - whatever the profile holds - as a number, or 10. */
export function yearNumber(studentYearGroup?: string): number {
  const match = studentYearGroup?.match(/\d+/);
  const n = match ? Number(match[0]) : 10;
  return n >= 7 && n <= 13 ? n : 10;
}

/**
 * The dates a planned half-term covers, for a topic of a given year group,
 * relative to the year group the student is in today.
 */
export function halfTermWindow(
  term: HalfTerm,
  topicYear: YearGroup | undefined,
  studentYear: number,
  today: string = todayISO()
): { start: string; end: string } {
  const offset = YEAR_NUMBER[topicYear ?? 'YEAR_10'] - studentYear;
  const september = academicYearOf(today) + offset;
  const w = WINDOWS[term];
  const year = w.nextYear ? september + 1 : september;
  return { start: `${year}-${w.from}`, end: `${year}-${w.to}` };
}

/** The half-term today falls in. */
export function currentHalfTerm(today: string = todayISO()): HalfTerm {
  const md = today.slice(5);
  return (
    (Object.keys(WINDOWS) as HalfTerm[]).find(
      (t) => md >= WINDOWS[t].from && md <= WINDOWS[t].to
    ) ?? 'SUM2'
  );
}

/**
 * Where a planned topic stands.
 *
 * BEHIND only once its half-term is over, never while it is running: a topic
 * planned for this half-term and not yet reached is simply still to come.
 */
export type PlanState = 'TAUGHT' | 'DUE_NOW' | 'BEHIND' | 'LATER';

export function planState(
  topic: Pick<SyllabusTopic, 'plannedTerm' | 'yearGroup'>,
  taught: boolean,
  studentYear: number,
  today: string = todayISO()
): PlanState | undefined {
  if (!topic.plannedTerm) return undefined;
  if (taught) return 'TAUGHT';
  const { start, end } = halfTermWindow(topic.plannedTerm, topic.yearGroup, studentYear, today);
  if (end < today) return 'BEHIND';
  if (start <= today) return 'DUE_NOW';
  return 'LATER';
}

export interface PlannedTopicsInput {
  subjectId: SubjectId;
  term: HalfTerm;
  yearGroup?: YearGroup;
  /** Optional; the teacher's unit name, else the half-term. */
  unit?: string;
  /** One topic per line, as pasted from a scheme of work. */
  text: string;
}

/** Lines as topics: trimmed, bullets and numbering stripped, blanks dropped. */
export function topicLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 0);
}

const sameTitle = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Adds the school's planned topics for a half-term.
 *
 * A line matching a topic the subject already has is not added again - it is
 * given the half-term instead, if it had none, so pasting a scheme of work
 * over topics Tejas already logged lines them up rather than doubling them.
 * Every topic is written in one transaction with one audit line, since this is
 * one decision about one half-term.
 */
export async function addPlannedTopics(
  input: PlannedTopicsInput,
  user: UserRole = 'PARENT'
): Promise<{ added: number; matched: number }> {
  const lines = [...new Set(topicLines(input.text))];
  if (lines.length === 0) return { added: 0, matched: 0 };
  const label = halfTermLabel(input.term);

  return db.transaction('rw', [db.syllabusTopics, db.auditLogs, db.parentSettings], async () => {
    const existing = await db.syllabusTopics.where('subjectId').equals(input.subjectId).toArray();
    let added = 0;
    let matched = 0;

    for (const title of lines) {
      const same = existing.find((t) => sameTitle(t.title, title));
      if (same) {
        if (!same.plannedTerm) {
          await db.syllabusTopics.update(same.id, { plannedTerm: input.term });
          matched += 1;
        }
        continue;
      }
      await db.syllabusTopics.add({
        id: newId('topic'),
        subjectId: input.subjectId,
        unit: input.unit?.trim() || label,
        title,
        isCompleted: false,
        confidenceRating: 3,
        isImportantForGrade9: true,
        isRequiredPractical: false,
        yearGroup: input.yearGroup ?? 'YEAR_10',
        plannedTerm: input.term,
        // Not taught yet: that is the point of entering it ahead.
        dateTaught: undefined,
      });
      added += 1;
    }

    await logAuditEvent({
      user,
      action: 'INSERT',
      entity: 'SyllabusTopic',
      entityId: `plan__${input.subjectId}__${input.term}`,
      newValue: `Added school plan for ${label}: ${added} new topic${added === 1 ? '' : 's'}${
        matched ? `, ${matched} already logged` : ''
      }`,
    });
    return { added, matched };
  });
}

/**
 * Marks a topic taught on a day, for a lesson nobody tagged. Tagging the lesson
 * does the same thing without this; this is for when there is no lesson row.
 */
export async function markTopicTaught(
  topicId: string,
  date: string = todayISO(),
  user: UserRole = 'STUDENT'
): Promise<void> {
  const topic = await db.syllabusTopics.get(topicId);
  if (!topic || topic.dateTaught === date) return;
  await db.syllabusTopics.update(topicId, { dateTaught: date });
  await logAuditEvent({
    user,
    action: 'UPDATE',
    entity: 'SyllabusTopic',
    entityId: topicId,
    fieldChanged: 'dateTaught',
    oldValue: topic.dateTaught ?? 'not taught',
    newValue: date,
  });
}

/**
 * Takes a planned topic back off the plan.
 *
 * Only while nothing points at it - no lesson, work, note or file tagged to
 * it, and no teaching date. Deleting one that something points at would leave
 * that thing tagged to nothing; in that case it stays, and only its half-term
 * is cleared.
 */
export async function removePlannedTopic(
  topicId: string,
  user: UserRole = 'PARENT'
): Promise<'DELETED' | 'UNPLANNED' | 'NOT_FOUND'> {
  const topic = await db.syllabusTopics.get(topicId);
  if (!topic) return 'NOT_FOUND';

  const [lessons, tasks, checkIns, files] = await Promise.all([
    db.checkInOccurrences.filter((o) => o.topicId === topicId).count(),
    db.tasks.filter((t) => t.linkedTopicId === topicId).count(),
    db.checkIns.filter((c) => c.topicId === topicId).count(),
    db.attachments.filter((a) => a.topicId === topicId).count(),
  ]);
  const referenced = lessons + tasks + checkIns + files > 0 || !!topic.dateTaught;

  if (referenced) {
    await db.syllabusTopics.update(topicId, { plannedTerm: undefined });
  } else {
    await db.syllabusTopics.delete(topicId);
  }
  await logAuditEvent({
    user,
    action: referenced ? 'UPDATE' : 'DELETE',
    entity: 'SyllabusTopic',
    entityId: topicId,
    fieldChanged: referenced ? 'plannedTerm' : undefined,
    oldValue: referenced ? topic.plannedTerm : topic.title,
    newValue: referenced ? 'off the plan' : undefined,
  });
  return referenced ? 'UNPLANNED' : 'DELETED';
}

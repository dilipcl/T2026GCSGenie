import { db } from '../db';
import {
  CheckInOccurrence,
  DailyCheckIn,
  ProofAttachment,
  SubjectId,
  Task,
} from '../types';
import { evidenceIndex, EvidenceRef } from './evidenceService';
import { REASON_LABEL } from './commitmentService';
import { addDaysISO, parseISODate, todayISO } from '../utils/date';

/**
 * What actually happened on a day, and everything anybody wrote about it.
 *
 * The app records a great deal and shows almost none of it back. A note typed
 * against a Physics lesson is stored on its occurrence row and rendered
 * nowhere afterwards except truncated on the row it was typed on; the Evidence
 * tab knows about attachments but not notes; the activity feed knows about
 * changes but not what was said. So the one question a parent and a
 * fourteen-year-old actually sit down to - "what did you do, and how did it
 * go?" - had no screen, and the material to answer it was spread across four
 * panes on two tabs.
 *
 * A day is the unit because that is the unit the answers were given in. A
 * lesson, the note about the lesson, the homework finished that evening and the
 * photo of it are one episode, and splitting them by type is what made the
 * record unreadable.
 *
 * Nothing here is stored. It is assembled on read from the rows that already
 * exist, so it cannot drift from them and there is no second copy to keep in
 * step - the same reason the XP total is derived rather than banked.
 */

export interface RecordedWork {
  taskId: string;
  title: string;
  subjectId?: SubjectId;
  xp: number;
  /** Proof attached to it, so a day can be read without opening another tab. */
  evidence: EvidenceRef[];
  /** Finished work that should show its working and has nothing to show. */
  missingEvidence: boolean;
}

export interface DayRecord {
  date: string;
  /** Everything timetabled or promised, with how it went. */
  occurrences: CheckInOccurrence[];
  /** How many of the day's occurrences were answered at all. */
  answered: number;
  /** The daily check-in, where one was written. */
  checkIn?: DailyCheckIn;
  work: RecordedWork[];
  /** Photos and files added on the day, whatever they belong to. */
  attachments: ProofAttachment[];
  /** Every note anybody wrote, already gathered so a reader need not hunt. */
  notes: DayNote[];
  xp: number;
  /** True when the day left no trace at all. Such days are not listed. */
  isEmpty: boolean;
}

/**
 * One thing somebody wrote, with enough context to be worth reading later.
 *
 * Gathered into a single list rather than left on the rows they came from,
 * because "what did we say about Tuesday" is a question about the day, and
 * answering it by scanning four kinds of row is what the old screens made you
 * do.
 */
export interface DayNote {
  /**
   * `REASON` is tapped rather than typed - the reason picker on a Partly or
   * Missed answer. It belongs here because it is the commonest thing anybody
   * will ever say about a lesson, and a review showing only free text would
   * show almost nothing.
   *
   * Screens that already render the reason some other way filter it out; the
   * Record tab carries it on the outcome chip, so listing it again underneath
   * would say the same thing twice.
   */
  kind: 'OCCURRENCE' | 'FOLLOW_UP' | 'CHECK_IN' | 'REASON';
  /** What it was about - a lesson name, or the heading of a check-in field. */
  about: string;
  text: string;
  subjectId?: SubjectId;
}

/** Local ISO date of a timestamp, matching how every other date here is keyed. */
function localDate(at: number): string {
  const on = new Date(at);
  return `${on.getFullYear()}-${String(on.getMonth() + 1).padStart(2, '0')}-${String(
    on.getDate()
  ).padStart(2, '0')}`;
}

function notesFrom(checkIn: DailyCheckIn): DayNote[] {
  const structured = checkIn.structuredNotes;
  const fields: Array<[string, string | undefined]> = [
    ['What I learned', structured?.keyLearning],
    ['Blockers and questions', structured?.blockersAndQuestions],
    ['For tomorrow', structured?.actionForTomorrow],
    ['Notes', structured?.generalNotes ?? checkIn.notes],
  ];

  return fields
    .filter(([, text]) => !!text?.trim())
    .map(([about, text]) => ({ kind: 'CHECK_IN' as const, about, text: text!.trim() }));
}

/**
 * The last `days` days, newest first, with the empty ones left out.
 *
 * Reads every table once and buckets by date rather than querying per day: a
 * fortnight of per-day queries is a fortnight of round trips, and this runs
 * inside a live query that re-reads on every write.
 */
export async function dayRecords(days = 14, today: string = todayISO()): Promise<DayRecord[]> {
  const from = addDaysISO(-(days - 1), parseISODate(today));

  const [occurrences, checkIns, tasks, attachments, evidence] = await Promise.all([
    db.checkInOccurrences.where('date').between(from, today, true, true).toArray(),
    db.checkIns.where('date').between(from, today, true, true).toArray(),
    db.tasks.toArray(),
    db.attachments.toArray(),
    evidenceIndex(),
  ]);

  const evidenceById = new Map(evidence.map((item) => [item.entityId, item]));

  const byDate = <T>(rows: T[], dateOf: (row: T) => string | undefined) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const date = dateOf(row);
      if (!date || date < from || date > today) continue;
      map.set(date, [...(map.get(date) ?? []), row]);
    }
    return map;
  };

  const occurrencesOn = byDate(occurrences, (row) => row.date);
  const checkInsOn = byDate(checkIns, (row) => row.date);
  const workOn = byDate(
    tasks.filter((task): task is Task & { completedAt: number } =>
      task.completed && typeof task.completedAt === 'number'
    ),
    (task) => localDate(task.completedAt)
  );
  const filesOn = byDate(attachments, (file) => localDate(file.createdAt));

  const records: DayRecord[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDaysISO(-i, parseISODate(today));
    const dayOccurrences = (occurrencesOn.get(date) ?? []).sort((a, b) =>
      a.occurrenceKey.localeCompare(b.occurrenceKey)
    );
    // At most one check-in a day in practice; the newest wins if there are more.
    const checkIn = (checkInsOn.get(date) ?? []).sort((a, b) => b.timestamp - a.timestamp)[0];
    const files = filesOn.get(date) ?? [];

    const work: RecordedWork[] = (workOn.get(date) ?? [])
      .sort((a, b) => a.completedAt - b.completedAt)
      .map((task) => {
        const item = evidenceById.get(task.id);
        return {
          taskId: task.id,
          title: task.title,
          subjectId: task.subjectId,
          xp: task.xpValue ?? 0,
          evidence: item?.evidence ?? [],
          missingEvidence: item?.missingEvidence ?? false,
        };
      });

    const notes: DayNote[] = [
      ...dayOccurrences.flatMap((row) => {
        const out: DayNote[] = [];
        if (row.reasonCategory) {
          out.push({
            kind: 'REASON',
            about: row.label,
            text: REASON_LABEL[row.reasonCategory],
            subjectId: row.subjectId,
          });
        }
        if (row.notes?.trim()) {
          out.push({
            kind: 'OCCURRENCE',
            about: row.label,
            text: row.notes.trim(),
            subjectId: row.subjectId,
          });
        }
        if (row.followUp?.trim()) {
          out.push({
            kind: 'FOLLOW_UP',
            about: row.label,
            text: row.followUp.trim(),
            subjectId: row.subjectId,
          });
        }
        return out;
      }),
      ...(checkIn ? notesFrom(checkIn) : []),
    ];

    const xp =
      dayOccurrences.reduce((sum, row) => sum + (row.xpAwarded || 0) + (row.dayBonusXp || 0), 0) +
      (checkIn?.xpEarned ?? 0) +
      work.reduce((sum, item) => sum + item.xp, 0);

    const isEmpty =
      dayOccurrences.length === 0 && !checkIn && work.length === 0 && files.length === 0;

    records.push({
      date,
      occurrences: dayOccurrences,
      answered: dayOccurrences.length,
      checkIn,
      work,
      attachments: files,
      notes,
      xp,
      isEmpty,
    });
  }

  // Days where nothing happened are not a record of anything, and a diary made
  // mostly of blank pages is one nobody scrolls.
  return records.filter((record) => !record.isEmpty);
}

/**
 * Everything written during one week, by the day it was written on.
 *
 * For the weekly review, which had every number about the week and not one word
 * from it - so "how did it go?" was answered by four statistics while the
 * sentences somebody actually wrote at the time sat unread in the database.
 * Those notes are the only part of the record that says *why*, which is the
 * half a review is for.
 *
 * Built on `dayRecords` rather than querying afresh, so the review and the
 * record can never show different things about the same Tuesday.
 */
export async function notesForWeek(
  weekStart: string
): Promise<Array<{ date: string; notes: DayNote[] }>> {
  const weekEnd = addDaysISO(6, parseISODate(weekStart));
  const records = await dayRecords(7, weekEnd);

  return records
    .filter((record) => record.notes.length > 0)
    .map((record) => ({ date: record.date, notes: record.notes }));
}

export interface RecordSummary {
  days: number;
  occurrencesAnswered: number;
  workFinished: number;
  notesWritten: number;
  filesAttached: number;
  xp: number;
}

export function summarise(records: DayRecord[]): RecordSummary {
  return {
    days: records.length,
    occurrencesAnswered: records.reduce((sum, r) => sum + r.answered, 0),
    workFinished: records.reduce((sum, r) => sum + r.work.length, 0),
    /**
     * Written, not tapped. A reason chosen from a list is a real answer and
     * belongs in the record, but counting it here would report a number of
     * "notes written" that nobody wrote.
     */
    notesWritten: records.reduce(
      (sum, r) => sum + r.notes.filter((n) => n.kind !== 'REASON').length,
      0
    ),
    filesAttached: records.reduce((sum, r) => sum + r.attachments.length, 0),
    xp: records.reduce((sum, r) => sum + r.xp, 0),
  };
}

/**
 * Free-text search across a day's contents.
 *
 * Every term must appear somewhere, rather than any of them - "physics
 * circuits" asking for anything mentioning either returns most of the record
 * and answers nothing. The same rule the evidence search already uses.
 */
export function dayMatches(record: DayRecord, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = [
    record.date,
    ...record.occurrences.map((o) => `${o.label} ${o.subjectId ?? ''} ${o.outcome}`),
    ...record.work.map((w) => `${w.title} ${w.subjectId ?? ''}`),
    ...record.notes.map((n) => `${n.about} ${n.text}`),
    ...record.attachments.map((a) => a.fileName),
  ]
    .join(' ')
    .toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

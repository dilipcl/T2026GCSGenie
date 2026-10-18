import { ActivityItem } from '../types';
import { DayRecord, dayRecords } from './dayRecordService';
import { studyEntries } from './studyLedger';
import { daysBetween, todayISO } from '../utils/date';

/**
 * A day of the activity feed in one sentence.
 *
 * Sunday 11 October was thirty-three rows in the feed - "Changed
 * checkinoccurrences something", topic re-links, due dates moving - and the
 * day itself was four pieces of work finished, seven English Literature topics
 * added with their photos, and a check-in. The sentence says that; the rows
 * are still there underneath for anyone checking.
 *
 * Read from the day record and the study ledger, which already count these
 * things for the Record tab and the goal hours, so the sentence can never
 * claim a different day from either.
 */

export interface DiaryDay {
  date: string;
  /** Empty when nothing worth saying happened - only bookkeeping. */
  sentence: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function diarySentence(
  record: DayRecord | undefined,
  studyMinutes: number,
  items: ActivityItem[]
): string {
  const parts: string[] = [];

  const finished = record?.work.length ?? 0;
  if (finished > 0) parts.push(`finished ${plural(finished, 'piece', 'pieces')} of work`);

  if (studyMinutes > 0) parts.push(`${Math.round((studyMinutes / 60) * 10) / 10}h studied`);

  const created = (type: string) =>
    items.filter((i) => i.entityType === type && i.action === 'CREATED').length;
  const topics = created('Syllabus topic');
  if (topics > 0) parts.push(`added ${plural(topics, 'topic')}`);
  const marks = created('Marked work');
  if (marks > 0) parts.push(`logged ${plural(marks, 'marked paper')}`);

  const files = record?.attachments.length ?? 0;
  if (files > 0) parts.push(`attached ${plural(files, 'file')}`);

  if (record && record.occurrences.length > 0) {
    parts.push(`answered ${record.answered} of ${plural(record.occurrences.length, 'lesson')}`);
  }
  if (record?.checkIn) parts.push('checked in');

  if (parts.length === 0) return '';
  const sentence = parts.join(', ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

/**
 * The sentence for each date the feed is showing.
 *
 * The day record reaches back from today, so it is asked for as far back as the
 * oldest date on screen - capped, because a feed scrolled back to August does
 * not need a summary sentence on every day to be useful.
 */
const FURTHEST_BACK_DAYS = 60;

export async function readDiary(
  items: ActivityItem[],
  today: string = todayISO()
): Promise<DiaryDay[]> {
  const dates = [...new Set(items.map((i) => i.date))].sort();
  if (dates.length === 0) return [];

  const reach = Math.min(FURTHEST_BACK_DAYS, daysBetween(dates[0], today) + 1);
  const [records, entries] = await Promise.all([
    dayRecords(reach, today),
    studyEntries({ start: dates[0], end: today }),
  ]);
  const byDate = new Map(records.map((r) => [r.date, r]));

  return dates.map((date) => ({
    date,
    sentence: diarySentence(
      byDate.get(date),
      entries.filter((e) => e.date === date).reduce((sum, e) => sum + e.minutes, 0),
      items.filter((i) => i.date === date)
    ),
  }));
}

import { SubjectLog } from './topicTimeline';
import { formatShortDate } from '../utils/date';

/**
 * One subject's topics added up into the handful of figures a parent scans on
 * a Sunday: is the homework done, is anything being revised, are there notes,
 * how much is secure - and a sentence saying it.
 *
 * Asked for on 19 Oct 2026, after "The course so far" could show how many
 * sections each subject had reached but not whether the work on them was
 * happening. Every figure here is a count over the five-step journeys the
 * topic log already shows, so the card and the log cannot disagree about a
 * subject - tapping through to the log shows exactly the topics behind each
 * number.
 *
 * Revised and notes are counted out of topics *taught*, not all topics. A
 * topic added ahead of teaching has nothing to revise yet, and counting it
 * would make a subject look behind for being organised.
 */

export interface Measure {
  done: number;
  of: number;
}

export interface SubjectSummary {
  topics: number;
  sectionsStarted: number;
  sectionsTotal: number;
  /** Pieces of homework set on the subject's topics, and how many are done. */
  homework: Measure;
  /** Taught topics revised at least once. */
  revised: Measure;
  /** Taught topics with notes, files or a lesson note. */
  notes: Measure;
  secure: Measure;
  openFixUps: number;
  latest?: { title: string; taught: string };
  /** Two short sentences: what there is, then how it is going. */
  sentence: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function summariseSubject(log: SubjectLog): SubjectSummary {
  const journeys = log.topics.map((t) => t.journey);
  const taught = journeys.filter((j) => j.taught);
  const homework = journeys.reduce(
    (m, j) => ({ done: m.done + j.homework.done, of: m.of + j.homework.set }),
    { done: 0, of: 0 }
  );
  const revised = { done: taught.filter((j) => j.revision.sessions > 0).length, of: taught.length };
  const notes = {
    done: taught.filter((j) => j.notes.captured + j.notes.lessonNotes > 0).length,
    of: taught.length,
  };
  const secure = { done: journeys.filter((j) => j.secure).length, of: journeys.length };
  const openFixUps = journeys.reduce((sum, j) => sum + j.fixUps.open, 0);
  const sectionsStarted = log.coverage.filter((c) => c.topics > 0).length;
  const sectionsTotal = log.coverage.length;

  // Topics are newest-taught first in the log.
  const newest = log.topics.find((t) => t.journey.taught);
  const latest = newest ? { title: newest.topic.title, taught: newest.journey.taught! } : undefined;

  return {
    topics: log.topics.length,
    sectionsStarted,
    sectionsTotal,
    homework,
    revised,
    notes,
    secure,
    openFixUps,
    latest,
    sentence: sentenceFor({
      topics: log.topics.length,
      sectionsStarted,
      sectionsTotal,
      homework,
      revised,
      notes,
      secure,
      openFixUps,
      latest,
    }),
  };
}

/**
 * Wins first, then the one or two things worth a look - never a list of
 * everything missing. The review of 18 Oct found that a screen leading with
 * gaps gets skimmed past; a sentence that opens on what went right gets read
 * to the end, where the gap is.
 */
function sentenceFor(s: Omit<SubjectSummary, 'sentence'>): string {
  if (s.topics === 0) return 'No topics logged yet.';

  const what =
    `${plural(s.topics, 'topic')}` +
    (s.sectionsTotal ? ` in ${s.sectionsStarted} of ${s.sectionsTotal} sections` : '') +
    (s.latest ? `, latest ${s.latest.title} (${formatShortDate(s.latest.taught)}).` : '.');

  const good: string[] = [];
  const watch: string[] = [];

  if (s.homework.of > 0) {
    if (s.homework.done === s.homework.of) good.push('homework all done');
    else watch.push(`${s.homework.of - s.homework.done} homework open`);
  }
  if (s.secure.done > 0) good.push(`${s.secure.done} secure`);
  if (s.revised.of > 0) {
    if (s.revised.done === s.revised.of) good.push('every taught topic revised');
    else if (s.revised.done === 0) watch.push('nothing revised yet');
    else watch.push(`${s.revised.of - s.revised.done} not revised`);
  }
  if (s.notes.of > 0 && s.notes.done < s.notes.of) {
    watch.push(s.notes.done === 0 ? 'no notes yet' : `${s.notes.of - s.notes.done} without notes`);
  }
  if (s.openFixUps > 0) watch.push(plural(s.openFixUps, 'fix-up') + ' open');

  const parts = [...good, ...watch.slice(0, 2)];
  if (parts.length === 0) return what;
  const how = parts.join(', ');
  return `${what} ${how.charAt(0).toUpperCase()}${how.slice(1)}.`;
}

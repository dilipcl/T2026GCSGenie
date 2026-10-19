import { describe, it, expect } from 'vitest';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { SyllabusTopic } from '../types';
import { curriculumFor } from './curriculum';
import { SubjectLog, TopicJourney, TopicSummary } from './topicTimeline';
import { summariseSubject } from './courseSummary';

/**
 * A subject's figures and sentence on "The course so far". Built from
 * journeys directly, so each case says exactly which steps are filled.
 */

const biology = INITIAL_SUBJECTS.find((s) => s.id === 'biology')!;
const outline = curriculumFor(biology)!;

const journey = (extra: Partial<TopicJourney>): TopicJourney => ({
  taught: '2026-10-07',
  lessons: 1,
  homework: { set: 0, done: 0 },
  revision: { sessions: 0, minutes: 0 },
  notes: { captured: 0, lessonNotes: 0 },
  fixUps: { open: 0, done: 0 },
  secure: false,
  confidence: 3,
  ...extra,
});

const row = (title: string, ref: string, j: Partial<TopicJourney>): TopicSummary =>
  ({
    topic: { id: title, title } as SyllabusTopic,
    journey: journey(j),
    section: outline.sections.find((s) => s.ref === ref),
  }) as TopicSummary;

const log = (topics: TopicSummary[]): SubjectLog => ({
  subject: biology,
  outline,
  topics,
  coverage: outline.sections.map((section) => ({
    section,
    topics: topics.filter((t) => t.section?.ref === section.ref).length,
    taught: 0,
    secure: 0,
  })),
});

describe('a subject on the course card', () => {
  it('adds up homework by pieces, and revision and notes by taught topics', () => {
    const s = summariseSubject(
      log([
        row('Pathogens', '4.3', {
          taught: '2026-10-14',
          homework: { set: 2, done: 1 },
          revision: { sessions: 1, minutes: 20 },
          notes: { captured: 1, lessonNotes: 0 },
        }),
        row('Cells', '4.1', { homework: { set: 1, done: 1 }, secure: true }),
        // Added ahead of teaching: nothing to revise yet, so not counted against.
        row('Ecology', '4.7', { taught: undefined, lessons: 0 }),
      ])
    );

    expect(s.homework).toEqual({ done: 2, of: 3 });
    expect(s.revised).toEqual({ done: 1, of: 2 });
    expect(s.notes).toEqual({ done: 1, of: 2 });
    expect(s.secure).toEqual({ done: 1, of: 3 });
    expect([s.sectionsStarted, s.sectionsTotal]).toEqual([3, 7]);
    expect(s.latest).toEqual({ title: 'Pathogens', taught: '2026-10-14' });
  });

  it('leads with what went well, then at most two things to look at', () => {
    const s = summariseSubject(
      log([
        row('Pathogens', '4.3', {
          homework: { set: 1, done: 1 },
          fixUps: { open: 2, done: 0 },
          secure: true,
        }),
        row('Cells', '4.1', {}),
      ])
    );
    expect(s.sentence).toBe(
      '2 topics in 2 of 7 sections, latest Pathogens (7 Oct). ' +
        'Homework all done, 1 secure, nothing revised yet, no notes yet.'
    );
  });

  it('says plainly when nothing has been logged', () => {
    expect(summariseSubject(log([])).sentence).toBe('No topics logged yet.');
  });

  it('names a fix-up when it is one of the first two things to look at', () => {
    const s = summariseSubject(
      log([
        row('Pathogens', '4.3', {
          revision: { sessions: 1, minutes: 10 },
          notes: { captured: 1, lessonNotes: 0 },
          fixUps: { open: 1, done: 0 },
        }),
      ])
    );
    expect(s.sentence).toMatch(/Every taught topic revised, 1 fix-up open\.$/);
  });
});

import { describe, it, expect } from 'vitest';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { StudyResource, SyllabusTopic } from '../types';
import { curriculumFor } from './curriculum';
import { PlanState } from './schoolPlan';
import { ResourceState } from './studyResources';
import { SubjectLog, TopicJourney, TopicSummary } from './topicTimeline';
import { summariseSubject } from './courseSummary';

/**
 * A subject's figures and sentence on "The course so far". Built from
 * journeys directly, so each case says exactly which steps are filled.
 */

const biology = INITIAL_SUBJECTS.find((s) => s.id === 'biology')!;
const outline = curriculumFor(biology)!;
const NOTEBOOK: StudyResource = { id: 'notebook', name: 'Notebook', appliesTo: 'ALL' };
const CGP: StudyResource = { id: 'cgp', name: 'CGP guide', appliesTo: 'ALL' };

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

const res = (resource: StudyResource, done: boolean): ResourceState => ({
  resource,
  done,
  auto: false,
});

const row = (
  title: string,
  ref: string,
  j: Partial<TopicJourney>,
  extra: { resources?: ResourceState[]; plan?: PlanState } = {}
): TopicSummary =>
  ({
    topic: { id: title, title } as SyllabusTopic,
    journey: journey(j),
    section: outline.sections.find((s) => s.ref === ref),
    resources: extra.resources ?? [],
    plan: extra.plan,
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
  it('counts homework by pieces, and everything else by taught topics', () => {
    const s = summariseSubject(
      log([
        row('Pathogens', '4.3', {
          taught: '2026-10-14',
          homework: { set: 2, done: 1 },
          revision: { sessions: 1, minutes: 20 },
          notes: { captured: 1, lessonNotes: 0 },
        }),
        row('Cells', '4.1', { homework: { set: 1, done: 1 }, secure: true }),
        // Entered ahead from the school plan: nothing to revise or be sure of yet.
        row('Ecology', '4.7', { taught: undefined, lessons: 0 }, { plan: 'LATER' }),
      ])
    );

    expect(s.topics).toBe(2);
    expect(s.homework).toEqual({ done: 2, of: 3 });
    expect(s.revised).toEqual({ done: 1, of: 2 });
    expect(s.notes).toEqual({ done: 1, of: 2 });
    expect(s.secure).toEqual({ done: 1, of: 2 });
    // Ecology is planned, not taught, so its section is not started.
    expect([s.sectionsStarted, s.sectionsTotal]).toEqual([2, 7]);
    expect(s.latest).toEqual({ title: 'Pathogens', taught: '2026-10-14' });
  });

  it('adds up each resource over the taught topics it applies to', () => {
    const s = summariseSubject(
      log([
        row('Pathogens', '4.3', {}, { resources: [res(NOTEBOOK, true), res(CGP, true)] }),
        row('Cells', '4.1', {}, { resources: [res(NOTEBOOK, true), res(CGP, false)] }),
        row('Ecology', '4.7', { taught: undefined }, { resources: [res(NOTEBOOK, false)] }),
      ])
    );
    expect(s.resources.map((r) => [r.resource.name, r.done, r.of])).toEqual([
      ['Notebook', 2, 2],
      ['CGP guide', 1, 2],
    ]);
  });

  it('counts the school plan by where each planned topic stands', () => {
    const s = summariseSubject(
      log([
        row('Cells', '4.1', {}, { plan: 'TAUGHT' }),
        row('Organisation', '4.2', { taught: undefined }, { plan: 'BEHIND' }),
        row('Pathogens', '4.3', { taught: undefined }, { plan: 'DUE_NOW' }),
        row('Ecology', '4.7', { taught: undefined }, { plan: 'LATER' }),
        row('Unplanned', '4.1', {}),
      ])
    );
    expect(s.plan).toEqual({ planned: 4, taught: 1, dueNow: 1, behind: 1, later: 1 });
    // A half-term gone by comes first among the things to look at.
    expect(s.sentence).toMatch(/\. 1 planned topic not yet taught from an earlier half-term/);
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

  it('says plainly when nothing has been logged, or only planned', () => {
    expect(summariseSubject(log([])).sentence).toBe('No topics logged yet.');
    expect(
      summariseSubject(
        log([
          row('Cells', '4.1', { taught: undefined }, { plan: 'DUE_NOW' }),
          row('Ecology', '4.7', { taught: undefined }, { plan: 'LATER' }),
        ])
      ).sentence
    ).toBe('None taught yet; 2 topics on the school plan, 1 due by now.');
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

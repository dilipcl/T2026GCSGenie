import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { addSyllabusTopic } from './topicService';
import {
  defaultResourcesFor,
  resetSubjectResources,
  resourceId,
  resourceState,
  resourcesFor,
  saveSubjectResources,
  setTopicResource,
} from './studyResources';
import { subjectTopics } from './topicTimeline';
import { Task } from '../types';

/**
 * Resources per topic: the defaults a subject starts with, a parent's own list,
 * one-tap ticks that survive two devices, and Sparx homework ticking Sparx
 * without anyone touching it.
 */

const TODAY = '2026-10-19';

const task = (extra: Partial<Task>): Task => ({
  id: Math.random().toString(36),
  subjectId: 'maths',
  title: 'Homework',
  dueDate: TODAY,
  priority: 'MEDIUM',
  isHomework: true,
  isRemediation: false,
  xpValue: 20,
  completed: false,
  createdAt: 0,
  ...extra,
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T18:00:00`));
  await emptyDatabase();
  await db.subjects.bulkPut(INITIAL_SUBJECTS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('what each subject starts with', () => {
  it('gives the sciences a practical write-up that applies to practicals only', () => {
    const chem = defaultResourcesFor('chemistry');
    expect(chem.map((r) => r.name)).toEqual([
      'Notebook',
      'CGP guide',
      'Sparx Science',
      'Practical write-up',
    ]);
    expect(chem.find((r) => r.id === 'practical')?.appliesTo).toBe('PRACTICALS');
    expect(defaultResourcesFor('maths').map((r) => r.name)).toContain('Sparx Maths');
    expect(defaultResourcesFor('art').map((r) => r.name)).toEqual(['Notebook', 'Sketchbook']);
    expect(defaultResourcesFor('general')).toEqual([]);
  });

  it('uses a parent list once saved, and hides archived resources', () => {
    const maths = INITIAL_SUBJECTS.find((s) => s.id === 'maths')!;
    const own = [
      { id: 'notebook', name: 'Exercise book', appliesTo: 'ALL' as const },
      { id: 'mathswatch', name: 'MathsWatch', appliesTo: 'ALL' as const, archived: true },
    ];
    expect(resourcesFor({ ...maths, resources: own }).map((r) => r.name)).toEqual([
      'Exercise book',
    ]);
  });

  it('makes readable ids that never clash', () => {
    expect(resourceId('CGP Workbook', [])).toBe('cgp-workbook');
    expect(resourceId('CGP Workbook', ['cgp-workbook'])).toBe('cgp-workbook-2');
  });
});

describe('ticking a topic', () => {
  it('records a tick and its page, and an untick removes it', async () => {
    const topic = await addSyllabusTopic({ subjectId: 'maths', title: 'Surds', unit: 'Number' });
    await setTopicResource(topic.id, 'cgp', true, 'STUDENT');
    await setTopicResource(topic.id, 'cgp', true, 'STUDENT', 'p.34-36');
    expect((await db.syllabusTopics.get(topic.id))?.resources?.cgp).toEqual({
      on: TODAY,
      ref: 'p.34-36',
    });

    await setTopicResource(topic.id, 'cgp', true, 'STUDENT', '');
    expect((await db.syllabusTopics.get(topic.id))?.resources?.cgp?.ref).toBeUndefined();

    await setTopicResource(topic.id, 'cgp', false, 'STUDENT');
    expect((await db.syllabusTopics.get(topic.id))?.resources?.cgp).toBeUndefined();
    const audits = (await db.auditLogs.toArray()).filter((a) => a.fieldChanged === 'resource cgp');
    expect(audits).toHaveLength(4);
  });

  it('writes each resource on its own, so two ticks never overwrite each other', async () => {
    const topic = await addSyllabusTopic({ subjectId: 'maths', title: 'Surds', unit: 'Number' });
    await Promise.all([
      setTopicResource(topic.id, 'cgp', true),
      setTopicResource(topic.id, 'notebook', true),
    ]);
    expect(Object.keys((await db.syllabusTopics.get(topic.id))!.resources!).sort()).toEqual([
      'cgp',
      'notebook',
    ]);
  });
});

describe('ticked by homework', () => {
  it('ticks Sparx when finished homework on the topic names it', () => {
    const sparx = defaultResourcesFor('maths').find((r) => r.id === 'sparx')!;
    const done = new Date('2026-10-15T19:00:00').getTime();
    expect(
      resourceState({}, sparx, [task({ title: 'Sparx Maths', completed: true, completedAt: done })])
    ).toMatchObject({ done: true, auto: true, on: '2026-10-15' });
    // Open homework ticks nothing.
    expect(resourceState({}, sparx, [task({ title: 'Sparx Maths' })]).done).toBe(false);
    // A tap wins, and keeps its page reference.
    expect(
      resourceState({ resources: { sparx: { on: '2026-10-10', ref: 'XP 12' } } }, sparx, [
        task({ title: 'Sparx', completed: true, completedAt: done }),
      ])
    ).toMatchObject({ done: true, auto: false, ref: 'XP 12' });
  });

  it('shows on the topic, with the practical only on practical topics', async () => {
    const shc = await addSyllabusTopic({
      subjectId: 'physics',
      title: 'Specific heat capacity',
      unit: 'Energy',
      isRequiredPractical: true,
    });
    const waves = await addSyllabusTopic({ subjectId: 'physics', title: 'Waves', unit: 'Waves' });
    await db.tasks.put(
      task({
        subjectId: 'physics',
        title: 'Sparx Science XP',
        linkedTopicId: waves.id,
        completed: true,
        completedAt: Date.now(),
      })
    );

    const rows = (await subjectTopics('physics')).topics;
    const ids = (id: string) => rows.find((r) => r.topic.id === id)!.resources;
    expect(ids(shc.id).map((r) => r.resource.id)).toContain('practical');
    expect(ids(waves.id).map((r) => r.resource.id)).not.toContain('practical');
    expect(ids(waves.id).find((r) => r.resource.id === 'sparx')).toMatchObject({
      done: true,
      auto: true,
    });
  });
});

describe('a notebook tick is notes', () => {
  it('fills the notes step and quiets "no notes", without a photo in the app', async () => {
    const topic = await addSyllabusTopic({
      subjectId: 'maths',
      title: 'Surds',
      unit: 'Number',
      dateTaught: '2026-09-28',
    });
    let row = (await subjectTopics('maths')).topics[0];
    expect(row.journey.gap).toBe('No notes captured yet');

    await setTopicResource(topic.id, 'notebook', true);
    row = (await subjectTopics('maths')).topics[0];
    expect(row.journey.notes.inNotebook).toBe(true);
    expect(row.journey.gap).not.toBe('No notes captured yet');
  });

  it('follows the name a parent gave it, not a fixed id', async () => {
    const topic = await addSyllabusTopic({ subjectId: 'maths', title: 'Surds', unit: 'Number' });
    await saveSubjectResources('maths', [
      { id: 'classbook', name: 'Exercise book', appliesTo: 'ALL' },
      { id: 'cgp', name: 'CGP guide', appliesTo: 'ALL' },
    ]);
    await setTopicResource(topic.id, 'cgp', true);
    expect((await subjectTopics('maths')).topics[0].journey.notes.inNotebook).toBe(false);
    await setTopicResource(topic.id, 'classbook', true);
    expect((await subjectTopics('maths')).topics[0].journey.notes.inNotebook).toBe(true);
  });
});

describe('a parent changing the list', () => {
  it('saves its own list, and going back to the defaults keeps the ticks', async () => {
    const topic = await addSyllabusTopic({ subjectId: 'maths', title: 'Surds', unit: 'Number' });
    await setTopicResource(topic.id, 'cgp', true);

    await saveSubjectResources('maths', [
      { id: 'cgp', name: 'CGP Revision Guide', appliesTo: 'ALL' },
      { id: 'mathswatch', name: '  MathsWatch ', appliesTo: 'ALL', matches: ' ' },
      { id: 'blank', name: '   ', appliesTo: 'ALL' },
    ]);
    const saved = (await db.subjects.get('maths'))!.resources!;
    expect(saved.map((r) => [r.name, r.matches])).toEqual([
      ['CGP Revision Guide', undefined],
      ['MathsWatch', undefined],
    ]);
    let row = (await subjectTopics('maths')).topics[0];
    expect(row.resources.find((r) => r.resource.id === 'cgp')?.done).toBe(true);

    await resetSubjectResources('maths');
    expect((await db.subjects.get('maths'))!.resources).toBeUndefined();
    row = (await subjectTopics('maths')).topics[0];
    expect(row.resources.map((r) => r.resource.name)).toContain('Sparx Maths');
    expect(row.resources.find((r) => r.resource.id === 'cgp')?.done).toBe(true);
  });
});

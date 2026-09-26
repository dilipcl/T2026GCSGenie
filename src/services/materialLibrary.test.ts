import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { CheckInOccurrence, DailyCheckIn, SyllabusTopic, Task } from '../types';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { coverage, groupByUnit, library, materialMatches, Material } from './materialLibrary';

/**
 * The clock is frozen for all of these. Every material carries a local ISO date
 * and several fixtures are built relative to "today", so a suite left on the
 * real clock passes on a Tuesday and fails at midnight - which has happened to
 * this repo before.
 */
const NOW = new Date('2026-09-21T19:30:00');

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  await emptyDatabase();
});

afterEach(() => {
  vi.useRealTimers();
});

function topic(overrides: Partial<SyllabusTopic> = {}): SyllabusTopic {
  return {
    id: 'topic_crude_oil',
    subjectId: 'chemistry',
    unit: 'Organic chemistry',
    title: 'Crude oil and fractional distillation',
    isCompleted: true,
    confidenceRating: 3,
    isImportantForGrade9: true,
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task_crude',
    subjectId: 'chemistry',
    title: 'Crude Oil Revision',
    dueDate: '2026-09-09',
    priority: 'HIGH',
    isHomework: true,
    isRemediation: false,
    xpValue: 20,
    completed: true,
    completedAt: new Date('2026-09-10T18:00:00').getTime(),
    createdAt: new Date('2026-09-01T09:00:00').getTime(),
    ...overrides,
  };
}

async function photoOn(
  ownerId: string,
  overrides: Partial<{ id: string; topicId: string; createdAt: number; caption: string }> = {}
) {
  await db.attachments.add({
    id: overrides.id ?? 'att_crude',
    ownerType: 'TASK',
    ownerId,
    fileName: 'crude-oil-notes.jpg',
    mimeType: 'image/jpeg',
    byteSize: 84_000,
    blob: new Blob(['x'], { type: 'image/jpeg' }),
    caption: overrides.caption,
    topicId: overrides.topicId,
    createdAt: overrides.createdAt ?? new Date('2026-09-10T20:15:00').getTime(),
  });
}

function occurrence(overrides: Partial<CheckInOccurrence> = {}): CheckInOccurrence {
  return {
    id: '2026-09-08__lesson-chem-p3',
    date: '2026-09-08',
    occurrenceKey: 'lesson-chem-p3',
    kind: 'LESSON',
    label: 'Chemistry (Triple)',
    subjectId: 'chemistry',
    outcome: 'HAPPENED',
    notes: 'Crude oil introduction — fractionating column, hot at the bottom.',
    xpAwarded: 5,
    loggedOnDate: '2026-09-08',
    loggedAt: new Date('2026-09-08T21:00:00').getTime(),
    loggedBy: 'STUDENT',
    ...overrides,
  };
}

function checkIn(overrides: Partial<DailyCheckIn> = {}): DailyCheckIn {
  return {
    id: 'checkin_1',
    date: '2026-09-08',
    timestamp: new Date('2026-09-08T21:05:00').getTime(),
    session: 'EVENING',
    energyLevel: 3,
    focusRating: 'NORMAL',
    completedHomeworkIds: [],
    completedRevisionMinutes: 30,
    studySubjectId: 'chemistry',
    structuredNotes: {
      keyLearning: 'Longer chains are more viscous and less volatile.',
      blockersAndQuestions: 'Ask Mr Hall which fraction is used for bitumen.',
    },
    xpEarned: 10,
    isDailyBaseXPAwarded: true,
    ...overrides,
  };
}

describe('what has been captured', () => {
  it('lists photos, links and the notes nobody has ever seen, together', async () => {
    await db.tasks.add(task({ driveProofUrl: 'https://drive.google.com/file/d/abc/view' }));
    await photoOn('task_crude');
    await db.checkInOccurrences.add(occurrence());
    await db.checkIns.add(checkIn());

    const { materials } = await library();

    expect(materials.map((m) => m.kind).sort()).toEqual(['FILE', 'LINK', 'NOTE', 'NOTE']);
    // The lesson note and the evening takeaway are the two that no screen in the
    // app had ever listed - they are the point of the library, not a bonus.
    expect(materials.filter((m) => m.kind === 'NOTE').map((m) => m.excerpt)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('fractionating column'),
        expect.stringContaining('more viscous'),
      ])
    );
  });

  it('dates a photo by when it was taken, not by when the work was due', async () => {
    await db.tasks.add(task());
    await photoOn('task_crude');

    const { materials } = await library();
    const file = materials.find((m) => m.kind === 'FILE')!;

    // The task was due on the 9th and closed on the 10th; the photo arrived on
    // the evening of the 10th. Using the due date would file a fortnight of
    // catch-up captures under the fortnight they were catching up on.
    expect(file.capturedOn).toBe('2026-09-10');
  });

  it('takes the topic from the tag, and the unit from the topic', async () => {
    await db.syllabusTopics.add(topic());
    await db.tasks.add(task());
    await photoOn('task_crude', { topicId: 'topic_crude_oil' });

    const { materials } = await library();
    const file = materials.find((m) => m.kind === 'FILE')!;

    expect(file.topicId).toBe('topic_crude_oil');
    expect(file.unit).toBe('Organic chemistry');
  });

  /**
   * Evidence hanging off a syllabus topic is about that topic by construction.
   * Requiring somebody to tag it as well would mean the notes link on a topic -
   * the one piece of material the app has always been able to hold - showed up
   * in the library as untagged.
   */
  it('treats evidence on a topic as being about that topic without a tag', async () => {
    await db.syllabusTopics.add(topic({ driveNotesUrl: 'https://notebooklm.google/x' }));

    const { materials } = await library();

    expect(materials).toHaveLength(1);
    expect(materials[0].topicId).toBe('topic_crude_oil');
    expect(materials[0].unit).toBe('Organic chemistry');
  });

  /**
   * The evidence index labels a link with the title of the record carrying it,
   * which made the library print the same sentence three times in one row.
   */
  it('names a link by what it is, not by what it hangs off', async () => {
    await db.tasks.add(task({ driveProofUrl: 'https://drive.google.com/file/d/abc/view' }));

    const { materials } = await library();
    const link = materials.find((m) => m.kind === 'LINK')!;

    expect(link.title).toBe('Drive proof link');
    expect(link.owner.title).toBe('Crude Oil Revision');
  });

  it('sorts newest first', async () => {
    await db.tasks.add(task());
    await photoOn('task_crude', { id: 'att_old', createdAt: new Date('2026-09-02T10:00:00').getTime() });
    await photoOn('task_crude', { id: 'att_new', createdAt: new Date('2026-09-19T10:00:00').getTime() });

    const { materials } = await library();

    expect(materials.map((m) => m.capturedOn)).toEqual(['2026-09-19', '2026-09-02']);
  });
});

describe('the coverage grid', () => {
  it('counts a finished topic with nothing attached as the gap it is', async () => {
    await db.syllabusTopics.add(topic());
    await db.syllabusTopics.add(
      topic({ id: 'topic_chromatography', title: 'Chromatography', isCompleted: true })
    );
    await db.tasks.add(task());
    await photoOn('task_crude', { topicId: 'topic_crude_oil' });

    const { coverage: rows } = await library();
    const chemistry = rows.find((r) => r.subjectId === 'chemistry')!;

    expect(chemistry.finishedTopics).toBe(2);
    expect(chemistry.finishedTopicsWithoutMaterial).toBe(1);
    expect(chemistry.materials).toBe(1);
    expect(chemistry.lastCapturedOn).toBe('2026-09-10');
  });

  it('counts material attached to no topic, because nothing can be built from it', () => {
    const materials: Material[] = [
      {
        id: 'a',
        kind: 'FILE',
        subjectId: 'chemistry',
        capturedOn: '2026-09-10',
        title: 'crude-oil.jpg',
        owner: { entity: 'Task', id: 't', title: 'Crude Oil Revision' },
      },
      {
        id: 'b',
        kind: 'FILE',
        subjectId: 'chemistry',
        topicId: 'topic_crude_oil',
        capturedOn: '2026-09-11',
        title: 'distillation.jpg',
        owner: { entity: 'Task', id: 't', title: 'Crude Oil Revision' },
      },
    ];

    const [chemistry] = coverage(
      materials,
      [topic()],
      INITIAL_SUBJECTS.filter((s) => s.id === 'chemistry')
    );

    expect(chemistry.untagged).toBe(1);
    expect(chemistry.finishedTopicsWithoutMaterial).toBe(0);
  });

  it('reports a subject with nothing as having nothing, rather than omitting it', async () => {
    const { coverage: rows } = await library();
    const physics = rows.find((r) => r.subjectId === 'physics')!;

    // A subject that drops out of the grid when it is empty is a subject nobody
    // notices has gone quiet, which is the failure this screen exists for.
    expect(physics.materials).toBe(0);
    expect(physics.lastCapturedOn).toBeUndefined();
  });
});

describe('finding something', () => {
  const item: Material = {
    id: 'a',
    kind: 'FILE',
    subjectId: 'chemistry',
    unit: 'Organic chemistry',
    capturedOn: '2026-09-10',
    title: 'crude-oil-notes.jpg',
    owner: { entity: 'Task', id: 't', title: 'Crude Oil Revision' },
  };

  it('requires every term, not any of them', () => {
    expect(materialMatches(item, 'chemistry crude')).toBe(true);
    expect(materialMatches(item, 'chemistry bonding')).toBe(false);
  });

  it('searches the note text, which is where the answer usually is', () => {
    const note: Material = {
      ...item,
      kind: 'NOTE',
      title: 'Chemistry (Triple)',
      excerpt: 'Fractionating column, hot at the bottom.',
    };

    expect(materialMatches(note, 'fractionating')).toBe(true);
  });
});

describe('grouping a subject', () => {
  it('puts untagged material last, as a to-do rather than a unit', () => {
    const items: Material[] = [
      {
        id: 'a',
        kind: 'FILE',
        capturedOn: '2026-09-10',
        title: 'loose.jpg',
        owner: { entity: 'Task', id: 't', title: 'x' },
      },
      {
        id: 'b',
        kind: 'FILE',
        unit: 'Organic chemistry',
        capturedOn: '2026-09-11',
        title: 'tagged.jpg',
        owner: { entity: 'Task', id: 't', title: 'x' },
      },
    ];

    const groups = groupByUnit(items);

    expect(groups.map((g) => g.untagged)).toEqual([false, true]);
    expect(groups[1].items).toHaveLength(1);
  });
});

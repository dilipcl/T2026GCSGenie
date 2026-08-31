import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { Task, SyllabusTopic } from '../types';
import { requestEvidence, resolveComment } from './activityCommentService';
import { logAuditEvent } from './auditService';
import {
  evidenceIndex,
  evidenceSummary,
  findEvidence,
  workMissingEvidence,
  awaitingEvidenceReply,
} from './evidenceService';

/**
 * The worked example is the question that prompted the feature: "did he add
 * the links and images for the Physics electricity session?"
 */

beforeEach(async () => {
  await emptyDatabase();
});

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task_phys',
    subjectId: 'physics',
    title: 'Physics session — Electricity and Circuits',
    dueDate: '2026-09-02',
    priority: 'HIGH',
    isHomework: true,
    isRemediation: false,
    xpValue: 20,
    completed: true,
    completedAt: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

function topic(overrides: Partial<SyllabusTopic> = {}): SyllabusTopic {
  return {
    id: 'topic_circuits',
    subjectId: 'physics',
    unit: 'Electricity',
    title: 'Series and parallel circuits',
    isCompleted: true,
    confidenceRating: 3,
    isImportantForGrade9: true,
    ...overrides,
  };
}

async function photoOn(ownerId: string) {
  await db.attachments.add({
    id: `att_${ownerId}`,
    ownerType: 'TASK',
    ownerId,
    fileName: 'circuit-working.jpg',
    mimeType: 'image/jpeg',
    byteSize: 1024,
    blob: new Blob(['x'], { type: 'image/jpeg' }),
    createdAt: Date.now(),
  });
}

describe('answering “are the links and images there?”', () => {
  it('finds a task by subject and topic words together', async () => {
    await db.tasks.add(task());
    await db.tasks.add(task({ id: 'task_maths', subjectId: 'maths', title: 'Algebra practice' }));

    const found = await findEvidence('physics electricity');

    expect(found).toHaveLength(1);
    expect(found[0].entityId).toBe('task_phys');
  });

  it('requires every term, not any of them', async () => {
    await db.tasks.add(task());
    await db.tasks.add(task({ id: 'task_light', title: 'Physics — Light and waves' }));

    // "physics" alone would return both; the second word is what makes the
    // search an answer rather than a list.
    expect(await findEvidence('physics')).toHaveLength(2);
    expect(await findEvidence('physics electricity')).toHaveLength(1);
  });

  it('reports a link stored on the record', async () => {
    await db.tasks.add(task({ driveProofUrl: 'https://drive.google.com/file/d/abc/view' }));

    const [found] = await findEvidence('electricity');

    expect(found.hasEvidence).toBe(true);
    expect(found.evidence).toEqual([
      expect.objectContaining({ kind: 'LINK', source: 'Drive proof link' }),
    ]);
  });

  it('reports a photo attached to the record', async () => {
    await db.tasks.add(task());
    await photoOn('task_phys');

    const [found] = await findEvidence('electricity');

    expect(found.evidence).toEqual([
      expect.objectContaining({ kind: 'FILE', label: 'circuit-working.jpg' }),
    ]);
  });

  it('reports both together', async () => {
    await db.tasks.add(task({ driveProofUrl: 'https://drive.google.com/x' }));
    await photoOn('task_phys');

    const [found] = await findEvidence('electricity');

    expect(found.evidence.map((e) => e.kind).sort()).toEqual(['FILE', 'LINK']);
  });

  it('says plainly when there is nothing attached', async () => {
    await db.tasks.add(task());

    const [found] = await findEvidence('electricity');

    expect(found.hasEvidence).toBe(false);
    expect(found.missingEvidence).toBe(true);
  });

  it('distinguishes a file saved to Drive with no openable link', async () => {
    await db.tasks.add(task());
    await photoOn('task_phys');
    await db.attachments.update('att_task_phys', { driveMirroredAt: Date.now() });

    const [found] = await findEvidence('electricity');

    // Safe from a restore, but there is nothing to click - a third state, not
    // a synonym for either of the other two.
    expect(found.evidence[0].savedWithoutLink).toBe(true);
    expect(found.evidence[0].url).toBeUndefined();
  });
});

describe('what counts as missing', () => {
  it('does not expect proof from unfinished work', async () => {
    await db.tasks.add(task({ completed: false, completedAt: undefined }));

    expect(await workMissingEvidence()).toHaveLength(0);
  });

  it('does not expect proof from a task the student set themselves', async () => {
    await db.tasks.add(task({ isHomework: false, isRemediation: false }));

    // Marked work and fix-ups are worth being able to show. Self-set revision
    // is not held to the same bar, or the report is noise.
    expect(await workMissingEvidence()).toHaveLength(0);
  });

  it('does expect notes behind a topic ticked off', async () => {
    await db.syllabusTopics.add(topic());

    const missing = await workMissingEvidence();

    expect(missing.map((m) => m.entityId)).toContain('topic_circuits');
  });

  it('clears once a notes link is added', async () => {
    await db.syllabusTopics.add(topic({ driveNotesUrl: 'https://notebooklm.google.com/abc' }));

    expect(await workMissingEvidence()).toHaveLength(0);
  });

  it('puts the most recently finished work first', async () => {
    await db.tasks.bulkAdd([
      task({ id: 'old', title: 'Older homework', completedAt: 1_000 }),
      task({ id: 'new', title: 'Newer homework', completedAt: 9_000 }),
    ]);

    const missing = await workMissingEvidence();

    expect(missing.map((m) => m.entityId)).toEqual(['new', 'old']);
  });
});

describe('the summary', () => {
  it('counts what has proof against what should', async () => {
    await db.tasks.bulkAdd([
      task({ id: 'with', driveProofUrl: 'https://drive.google.com/x' }),
      task({ id: 'without' }),
    ]);

    expect(await evidenceSummary()).toEqual({
      expected: 2,
      withEvidence: 1,
      missing: 1,
      savedWithoutLink: 0,
      awaitingReply: 0,
    });
  });

  it('counts nothing when there is no work at all', async () => {
    expect(await evidenceSummary()).toEqual({
      expected: 0,
      withEvidence: 0,
      missing: 0,
      savedWithoutLink: 0,
      awaitingReply: 0,
    });
  });
});

describe('the index', () => {
  it('covers every kind of record that can carry proof', async () => {
    await db.tasks.add(task());
    await db.syllabusTopics.add(topic());

    const kinds = new Set((await evidenceIndex()).map((i) => i.entity));

    expect(kinds.has('Task')).toBe(true);
    expect(kinds.has('Syllabus topic')).toBe(true);
  });
});

describe('asking for evidence, and tracking the ask', () => {
  it('flags the work as chased, so nobody asks twice', async () => {
    await db.tasks.add(task());

    await requestEvidence({
      entityId: 'task_phys',
      entityLabel: 'Task',
      title: 'Physics session — Electricity and Circuits',
      authorRole: 'PARENT',
    });

    const [found] = await findEvidence('electricity');
    expect(found.openRequests).toHaveLength(1);
    expect(found.missingEvidence).toBe(true);
  });

  it('separates chased from merely missing', async () => {
    await db.tasks.bulkAdd([
      task({ id: 'asked', title: 'Physics asked about' }),
      task({ id: 'quiet', title: 'Physics not asked about' }),
    ]);
    await requestEvidence({
      entityId: 'asked',
      entityLabel: 'Task',
      title: 'Physics asked about',
      authorRole: 'PARENT',
    });

    const waiting = await awaitingEvidenceReply();

    expect(waiting.map((w) => w.entityId)).toEqual(['asked']);
    expect((await workMissingEvidence()).length).toBe(2);
  });

  it('drops out of the waiting list once answered', async () => {
    await db.tasks.add(task());
    const ask = await requestEvidence({
      entityId: 'task_phys',
      entityLabel: 'Task',
      title: 'Physics session',
      authorRole: 'PARENT',
    });

    expect(await awaitingEvidenceReply()).toHaveLength(1);
    await resolveComment(ask.id, 'STUDENT', 'Added the notebook link');
    expect(await awaitingEvidenceReply()).toHaveLength(0);
  });

  it('counts outstanding asks in the summary', async () => {
    await db.tasks.add(task());
    await requestEvidence({
      entityId: 'task_phys',
      entityLabel: 'Task',
      title: 'Physics session',
      authorRole: 'PARENT',
    });

    expect((await evidenceSummary()).awaitingReply).toBe(1);
  });

  it('hangs the ask off the record’s latest activity row, so the feed shows it', async () => {
    await db.tasks.add(task());
    const entry = await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'Task',
      entityId: 'task_phys',
      newValue: 'Completed "Physics Session"',
    });

    const ask = await requestEvidence({
      entityId: 'task_phys',
      entityLabel: 'Task',
      title: 'Physics session',
      authorRole: 'PARENT',
    });

    // The same flag the comment feature already uses, so it lands in the feed's
    // review list without a second mechanism.
    expect(ask.activityId).toBe(entry.id);
    expect(ask.needsResponse).toBe(true);
    expect(ask.kind).toBe('EVIDENCE_REQUEST');
  });

  it('still tracks an ask about a record with no activity history', async () => {
    await db.tasks.add(task());

    const ask = await requestEvidence({
      entityId: 'task_phys',
      entityLabel: 'Task',
      title: 'Physics session',
      authorRole: 'PARENT',
    });

    // No feed row to hang from, but the request is not lost.
    expect(ask.activityId).toBe('task_phys');
    expect(await awaitingEvidenceReply()).toHaveLength(1);
  });
});

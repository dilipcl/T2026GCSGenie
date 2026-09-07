import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { Task, SyllabusTopic } from '../types';
import { addEvidenceNote, requestEvidence, resolveComment } from './activityCommentService';
import { logAuditEvent } from './auditService';
import {
  evidenceIndex,
  evidenceSummary,
  findEvidence,
  isUsableLink,
  saveEvidenceLink,
  workMissingEvidence,
  workNeedingEvidence,
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
      explained: 0,
      unexplained: 1,
      savedWithoutLink: 0,
      awaitingReply: 0,
    });
  });

  it('counts nothing when there is no work at all', async () => {
    expect(await evidenceSummary()).toEqual({
      expected: 0,
      withEvidence: 0,
      missing: 0,
      explained: 0,
      unexplained: 0,
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

/**
 * The half of this module that did not exist.
 *
 * The tab could report that a piece of homework had been closed with nothing
 * attached, and the only thing it could offer you was to message somebody about
 * it - there was no path anywhere in the app that put a link or a photo onto a
 * task. Tejas asked how evidence is added; for the commonest kind of work, the
 * honest answer was that it could not be.
 */
describe('adding the evidence', () => {
  it('puts a link on a task where the index reads it back', async () => {
    await db.tasks.add(task());

    await saveEvidenceLink('Task', 'task_phys', 'https://drive.google.com/file/d/abc/view');

    const [item] = await findEvidence('physics electricity');
    expect(item.hasEvidence).toBe(true);
    expect(item.missingEvidence).toBe(false);
    expect(item.evidence[0].url).toBe('https://drive.google.com/file/d/abc/view');
  });

  it('writes each kind of record to the field that record actually uses', async () => {
    // The read side already knew a link lives under a different name on each
    // table. If the write side disagreed, the evidence would be saved and the
    // row would still say it was missing.
    await db.tasks.add(task());
    await db.syllabusTopics.add(topic());

    await saveEvidenceLink('Task', 'task_phys', 'https://example.com/task');
    await saveEvidenceLink('Syllabus topic', 'topic_circuits', 'https://example.com/topic');

    expect((await db.tasks.get('task_phys'))?.driveProofUrl).toBe('https://example.com/task');
    expect((await db.syllabusTopics.get('topic_circuits'))?.driveNotesUrl).toBe(
      'https://example.com/topic'
    );
  });

  it('clears the row it was attached for', async () => {
    await db.tasks.add(task());
    expect(await workMissingEvidence()).toHaveLength(1);

    await saveEvidenceLink('Task', 'task_phys', 'https://example.com/x');
    expect(await workMissingEvidence()).toEqual([]);
  });

  it('refuses something that is not a link at all', async () => {
    await db.tasks.add(task());
    await expect(saveEvidenceLink('Task', 'task_phys', 'my drive folder')).rejects.toThrow(
      /https/i
    );
  });

  it('accepts a link to anywhere the working might live, not just Drive', async () => {
    // A school portal, OneNote and a shared album are all legitimate. A
    // whitelist would only teach people to paste the link out of reach.
    expect(isUsableLink('https://onenote.com/x')).toBe(true);
    expect(isUsableLink('https://classroom.school.uk/y')).toBe(true);
    expect(isUsableLink('drive/my-folder')).toBe(false);
  });

  it('records the attachment in the audit log', async () => {
    await db.tasks.add(task());
    await saveEvidenceLink('Task', 'task_phys', 'https://example.com/x');

    const rows = await db.auditLogs.toArray();
    expect(rows.some((row) => row.fieldChanged === 'driveProofUrl')).toBe(true);
  });

  it('takes a link back off when it is cleared', async () => {
    await db.tasks.add(task({ driveProofUrl: 'https://example.com/old' }));
    await saveEvidenceLink('Task', 'task_phys', '');

    expect((await db.tasks.get('task_phys'))?.driveProofUrl).toBeUndefined();
  });
});

/**
 * Not every piece of work leaves something to attach. Marked verbally, done in
 * a book that stayed in school, a practical - all real, none of them a file.
 * Without somewhere to say so, the only way to clear a row was to attach
 * something that did not exist.
 */
describe('saying why there is nothing to attach', () => {
  it('leaves the work missing its evidence, because it is', async () => {
    await db.tasks.add(task());
    await addEvidenceNote({
      entityId: 'task_phys',
      title: 'Physics session',
      text: 'Classwork - the book stayed in school',
      authorRole: 'STUDENT',
    });

    const [item] = await findEvidence('physics');
    expect(item.missingEvidence).toBe(true);
    expect(item.hasEvidence).toBe(false);
  });

  it('marks it explained, so nobody chases it again', async () => {
    await db.tasks.add(task());
    await addEvidenceNote({
      entityId: 'task_phys',
      title: 'Physics session',
      text: 'Marked verbally in the lesson',
      authorRole: 'PARENT',
    });

    const [item] = await findEvidence('physics');
    expect(item.explained).toBe(true);
    expect(item.unexplained).toBe(false);
    expect(item.notes?.[0].text).toBe('Marked verbally in the lesson');
  });

  it('drops it out of the list the inbox nags about', async () => {
    await db.tasks.add(task());
    expect(await workNeedingEvidence()).toHaveLength(1);

    await addEvidenceNote({
      entityId: 'task_phys',
      title: 'Physics session',
      text: 'Classwork',
      authorRole: 'STUDENT',
    });

    expect(await workNeedingEvidence()).toEqual([]);
    // Still listed by the tab, which audits every gap rather than only the
    // chaseable ones.
    expect(await workMissingEvidence()).toHaveLength(1);
  });

  it('counts explained and unexplained apart in the summary', async () => {
    await db.tasks.bulkAdd([task({ id: 'explained' }), task({ id: 'silent' })]);
    await addEvidenceNote({
      entityId: 'explained',
      title: 'Physics session',
      text: 'Classwork',
      authorRole: 'STUDENT',
    });

    const summary = await evidenceSummary();
    expect(summary.missing).toBe(2);
    expect(summary.explained).toBe(1);
    expect(summary.unexplained).toBe(1);
  });

  it('refuses an empty note', async () => {
    await expect(
      addEvidenceNote({
        entityId: 'task_phys',
        title: 'Physics session',
        text: '   ',
        authorRole: 'STUDENT',
      })
    ).rejects.toThrow();
  });

  it('shows the latest word first when there is more than one', async () => {
    await db.tasks.add(task());
    await addEvidenceNote({
      entityId: 'task_phys',
      title: 'Physics session',
      text: 'first',
      authorRole: 'STUDENT',
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await addEvidenceNote({
      entityId: 'task_phys',
      title: 'Physics session',
      text: 'second',
      authorRole: 'PARENT',
    });

    const [item] = await findEvidence('physics');
    expect(item.notes?.[0].text).toBe('second');
  });
});

describe('the detail a missing row carries', () => {
  it('says when the work was due and when it was closed', async () => {
    const closedAt = Date.parse('2026-09-03T18:00:00');
    await db.tasks.add(task({ dueDate: '2026-09-02', completedAt: closedAt }));

    const [item] = await findEvidence('physics');
    expect(item.dueDate).toBe('2026-09-02');
    expect(item.completedAt).toBe(closedAt);
  });
});

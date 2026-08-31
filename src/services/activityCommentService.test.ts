import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { logAuditEvent } from './auditService';
import { nameDevice } from './deviceRegistryService';
import { getDeviceId } from '../utils/device';
import { buildActivityFeed, needingReview, outstanding } from './activityService';
import {
  addComment,
  commentCounts,
  openClarifications,
  reopenComment,
  resolveComment,
  summarise,
} from './activityCommentService';

/**
 * The worked example throughout is the one that prompted the feature: a parent
 * sees "Physics session completed" and wants to know whether the Notebook link
 * and a follow-up task went with it.
 */

beforeEach(async () => {
  await emptyDatabase();
});

async function physicsCompleted() {
  const entry = await logAuditEvent({
    user: 'STUDENT',
    action: 'UPDATE',
    entity: 'Task',
    entityId: 'task_physics',
    fieldChanged: 'completed',
    oldValue: 'not completed',
    newValue: 'Completed "Physics Session" (+50 XP)',
  });
  return entry.id;
}

describe('asking a question about a change', () => {
  it('attaches the comment to the activity row', async () => {
    const activityId = await physicsCompleted();

    await addComment({
      activityId,
      authorRole: 'PARENT',
      text: 'Have you added the link to the Notebook, and a follow-up task?',
      needsResponse: true,
    });

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].comments).toHaveLength(1);
    expect(feed.items[0].comments?.[0].text).toContain('Notebook');
  });

  it('flags the row as needing review while the question is open', async () => {
    const activityId = await physicsCompleted();
    await addComment({
      activityId,
      authorRole: 'PARENT',
      text: 'Notebook link?',
      needsResponse: true,
    });

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].commentSummary?.openClarifications).toBe(1);
    expect(needingReview(feed.items)).toHaveLength(1);
  });

  it('does not flag a plain remark', async () => {
    const activityId = await physicsCompleted();
    await addComment({ activityId, authorRole: 'PARENT', text: 'Nice one' });

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].commentSummary?.total).toBe(1);
    expect(feed.items[0].commentSummary?.openClarifications).toBe(0);
    expect(needingReview(feed.items)).toHaveLength(0);
  });

  it('refuses an empty comment', async () => {
    const activityId = await physicsCompleted();
    await expect(
      addComment({ activityId, authorRole: 'PARENT', text: '   ' })
    ).rejects.toThrow();
  });

  it('names the author by person once the device is claimed', async () => {
    const activityId = await physicsCompleted();
    await buildActivityFeed('PARENT');
    await nameDevice(getDeviceId(), "Dad's laptop", 'Dad');

    await addComment({
      activityId,
      authorRole: 'PARENT',
      text: 'Notebook link?',
      needsResponse: true,
    });

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].comments?.[0].authorLabel).toBe('Dad');
  });
});

describe('answering it', () => {
  it('clears the flag and keeps what was actually done', async () => {
    const activityId = await physicsCompleted();
    const comment = await addComment({
      activityId,
      authorRole: 'PARENT',
      text: 'Notebook link?',
      needsResponse: true,
    });

    await resolveComment(comment.id, 'STUDENT', 'Added, and made a follow-up for Friday');

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].commentSummary?.openClarifications).toBe(0);
    expect(feed.items[0].comments?.[0].resolutionNote).toContain('follow-up');
    expect(feed.items[0].comments?.[0].resolvedByRole).toBe('STUDENT');
  });

  it('lets a student resolve, not only a parent', async () => {
    const activityId = await physicsCompleted();
    const comment = await addComment({
      activityId,
      authorRole: 'PARENT',
      text: 'Notebook link?',
      needsResponse: true,
    });

    // The person who does the thing is usually the one who can answer.
    await expect(resolveComment(comment.id, 'STUDENT')).resolves.toBeDefined();
  });

  it('can be reopened when it was ticked off too early', async () => {
    const activityId = await physicsCompleted();
    const comment = await addComment({
      activityId,
      authorRole: 'PARENT',
      text: 'Notebook link?',
      needsResponse: true,
    });

    await resolveComment(comment.id, 'STUDENT');
    await reopenComment(comment.id);

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].commentSummary?.openClarifications).toBe(1);
  });
});

describe('what still needs review', () => {
  it('lists open clarifications oldest first', async () => {
    const activityId = await physicsCompleted();

    const older = await addComment({
      activityId,
      authorRole: 'PARENT',
      text: 'Asked on Tuesday',
      needsResponse: true,
    });
    // Force a later timestamp so ordering is deterministic.
    const newer = await addComment({
      activityId,
      authorRole: 'PARENT',
      text: 'Asked just now',
      needsResponse: true,
    });
    await db.activityComments.update(older.id, { createdAt: Date.now() - 86_400_000 });

    const review = await openClarifications();
    expect(review.map((r) => r.comment.id)).toEqual([older.id, newer.id]);
  });

  it('drops answered questions from the review list', async () => {
    const activityId = await physicsCompleted();
    const comment = await addComment({
      activityId,
      authorRole: 'PARENT',
      text: 'Notebook link?',
      needsResponse: true,
    });

    expect(await openClarifications()).toHaveLength(1);
    await resolveComment(comment.id, 'STUDENT');
    expect(await openClarifications()).toHaveLength(0);
  });

  it('counts open questions separately from total comments', async () => {
    const activityId = await physicsCompleted();
    await addComment({ activityId, authorRole: 'PARENT', text: 'Nice' });
    await addComment({
      activityId,
      authorRole: 'PARENT',
      text: 'Notebook?',
      needsResponse: true,
    });

    expect(await commentCounts()).toEqual({ total: 2, open: 1 });
  });

  it('filters the feed to rows needing review', async () => {
    const flagged = await physicsCompleted();
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'Task',
      entityId: 'task_other',
      newValue: 'Something unrelated',
    });
    await addComment({
      activityId: flagged,
      authorRole: 'PARENT',
      text: 'Notebook?',
      needsResponse: true,
    });

    const all = await buildActivityFeed('PARENT');
    const review = await buildActivityFeed('PARENT', { needsReviewOnly: true });

    expect(all.items).toHaveLength(2);
    expect(review.items).toHaveLength(1);
    expect(review.items[0].id).toBe(flagged);
  });

  it('keeps a question that is waiting on a person distinct from a pending step', async () => {
    const activityId = await physicsCompleted();
    await addComment({
      activityId,
      authorRole: 'PARENT',
      text: 'Notebook?',
      needsResponse: true,
    });

    const feed = await buildActivityFeed('PARENT');

    // A pending step is the app waiting; a clarification is a person waiting.
    expect(needingReview(feed.items)).toHaveLength(1);
    expect(outstanding(feed.items)).toHaveLength(0);
  });
});

describe('summarising a thread', () => {
  it('returns nothing for a row with no comments', () => {
    expect(summarise(undefined)).toBeUndefined();
    expect(summarise([])).toBeUndefined();
  });
});

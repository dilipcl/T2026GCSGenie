import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import {
  FOLLOW_UP_XP,
  addEntityComment,
  commentsForEntity,
  resolveCommentForTask,
} from './activityCommentService';
import { todayISO } from '../utils/date';

/**
 * A comment expecting an answer used to leave a flag on a row in the activity
 * feed and nothing else, so answering it depended on somebody scrolling back to
 * a screen they had no reason to open. A question worth asking is worth a place
 * on the list people actually work from.
 */

beforeEach(async () => {
  await emptyDatabase();
});

const ask = (over: Record<string, unknown> = {}) =>
  addEntityComment({
    entityId: 'task_1',
    entityLabel: 'homework',
    title: 'Physics past paper',
    text: 'Which questions did you actually do?',
    authorRole: 'PARENT',
    needsResponse: true,
    subjectId: 'physics',
    ...over,
  });

describe('commenting on a piece of work', () => {
  it('keeps the comment against the record, not the feed row', async () => {
    await ask({ needsResponse: false });

    const [comment] = await commentsForEntity('task_1');
    expect(comment.subjectEntityId).toBe('task_1');
    expect(comment.text).toBe('Which questions did you actually do?');
  });

  it('refuses an empty comment', async () => {
    await expect(ask({ text: '   ' })).rejects.toThrow();
  });

  it('reads a thread oldest first, because that is how a thread is read', async () => {
    await ask({ text: 'first', needsResponse: false });
    await new Promise((r) => setTimeout(r, 2));
    await ask({ text: 'second', needsResponse: false });

    expect((await commentsForEntity('task_1')).map((c) => c.text)).toEqual(['first', 'second']);
  });

  it('keeps threads about different records apart', async () => {
    await ask({ needsResponse: false });
    await ask({ entityId: 'task_2', text: 'about the other one', needsResponse: false });

    expect(await commentsForEntity('task_1')).toHaveLength(1);
    expect(await commentsForEntity('task_2')).toHaveLength(1);
  });
});

describe('a question becomes work', () => {
  it('raises a follow-up task on the list', async () => {
    await ask();

    const [task] = await db.tasks.toArray();
    expect(task.isFollowUp).toBe(true);
    expect(task.title).toContain('Which questions did you actually do?');
    expect(task.bucket).toBe('THIS_WEEK');
    expect(task.xpValue).toBe(FOLLOW_UP_XP);
  });

  it('dates it today, not the day the work was set', async () => {
    // A question asked today about last Tuesday's homework is not already a
    // week overdue, and a task that arrives late is one nobody believes.
    await ask();
    const [task] = await db.tasks.toArray();
    expect(task.dueDate).toBe(todayISO());
  });

  it('carries the subject over, so it counts towards the right goal', async () => {
    await ask();
    expect((await db.tasks.toArray())[0].subjectId).toBe('physics');
  });

  it('says what it is about, so the task reads on its own', async () => {
    await ask();
    expect((await db.tasks.toArray())[0].description).toContain('Physics past paper');
  });

  it('raises nothing for a remark', async () => {
    // "Nice one" becoming a chore is how a comment box stops being used.
    await ask({ needsResponse: false });
    expect(await db.tasks.toArray()).toEqual([]);
  });

  it('links the two, so one can settle the other', async () => {
    const comment = await ask();
    const [task] = await db.tasks.toArray();

    expect(comment.followUpTaskId).toBe(task.id);
    expect(task.followUpCommentId).toBe(comment.id);
  });
});

describe('answering it', () => {
  it('settles the question when its follow-up is ticked off', async () => {
    const comment = await ask();
    const [task] = await db.tasks.toArray();

    await resolveCommentForTask(task.id, 'STUDENT');

    const [after] = await commentsForEntity('task_1');
    expect(after.id).toBe(comment.id);
    expect(after.resolvedAt).toBeTruthy();
    expect(after.resolvedByRole).toBe('STUDENT');
  });

  it('does nothing for a task that answers no question', async () => {
    await expect(resolveCommentForTask('not_a_follow_up', 'STUDENT')).resolves.toBeUndefined();
  });

  it('leaves an already-answered question alone', async () => {
    const comment = await ask();
    const [task] = await db.tasks.toArray();

    await resolveCommentForTask(task.id, 'STUDENT');
    const first = (await commentsForEntity('task_1'))[0].resolvedAt;
    await resolveCommentForTask(task.id, 'PARENT');

    const after = (await commentsForEntity('task_1'))[0];
    expect(after.resolvedAt).toBe(first);
    expect(after.resolvedByRole).toBe('STUDENT');
    expect(comment.id).toBe(after.id);
  });
});

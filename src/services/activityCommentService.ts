import { db } from '../db';
import { ActivityComment, CommentSummary, UserRole } from '../types';
import { newId } from '../utils/id';
import { getDeviceId } from '../utils/device';
import { deviceLabelMap, describeActor } from './deviceRegistryService';

/**
 * Talking about a change, attached to the change.
 *
 * The activity feed answers "what happened". The next question is almost never
 * an objection - it is a follow-up. "Physics session completed" prompts "did you
 * add the Notebook link, and is there a follow-up task?", and until now that
 * conversation happened at dinner, detached from the thing it was about, with no
 * record of whether it was ever answered.
 *
 * Two kinds of comment, and the distinction is the entire feature. A remark
 * needs nothing. A **clarification** expects an answer and leaves the row
 * flagged until somebody deals with it, so "what still needs review" is a
 * question the app can answer rather than something a parent has to hold in
 * their head.
 *
 * Anyone may comment and anyone may resolve. A parent-only resolve was
 * tempting and wrong: the student is usually the person who actually does the
 * thing being asked about, and making them wait for a parent to tick it off
 * turns a two-second answer into a second round trip.
 */

export interface AddCommentInput {
  activityId: string;
  text: string;
  authorRole: UserRole;
  /** True when an answer is expected. Drives the review flag. */
  needsResponse?: boolean;
}

export async function addComment(input: AddCommentInput): Promise<ActivityComment> {
  const text = input.text.trim();
  if (!text) throw new Error('A comment needs something in it.');

  const comment: ActivityComment = {
    id: newId('cmt'),
    activityId: input.activityId,
    createdAt: Date.now(),
    authorRole: input.authorRole,
    authorDeviceId: getDeviceId(),
    text,
    needsResponse: input.needsResponse ?? false,
  };

  await db.activityComments.add(comment);
  return comment;
}

/**
 * Marks a clarification dealt with.
 *
 * The note matters more than the flag. "Yes, added" and "not needed, it was
 * classwork" are different answers, and a bare resolved tick preserves neither.
 */
export async function resolveComment(
  id: string,
  role: UserRole,
  resolutionNote?: string
): Promise<ActivityComment | undefined> {
  const existing = await db.activityComments.get(id);
  if (!existing) return undefined;

  const updated: ActivityComment = {
    ...existing,
    resolvedAt: Date.now(),
    resolvedByRole: role,
    resolutionNote: resolutionNote?.trim() || existing.resolutionNote,
  };
  await db.activityComments.put(updated);
  return updated;
}

/** Reopens a clarification that was ticked off too early. */
export async function reopenComment(id: string): Promise<ActivityComment | undefined> {
  const existing = await db.activityComments.get(id);
  if (!existing) return undefined;

  const updated = { ...existing };
  delete updated.resolvedAt;
  delete updated.resolvedByRole;
  await db.activityComments.put(updated);
  return updated;
}

export async function deleteComment(id: string): Promise<void> {
  await db.activityComments.delete(id);
}

/** Records that a comment has been handed to WhatsApp. */
export async function markCommentShared(id: string): Promise<void> {
  await db.activityComments.update(id, { sharedAt: Date.now() });
}

/**
 * Every comment, grouped by the activity row it belongs to, with author names
 * resolved.
 *
 * Loaded in one pass rather than per row - the feed renders tens of rows and a
 * query each would be tens of round trips for a table holding a handful of
 * entries.
 */
export async function commentsByActivity(): Promise<Map<string, ActivityComment[]>> {
  const [comments, devices] = await Promise.all([
    db.activityComments.toArray(),
    deviceLabelMap(),
  ]);

  const byActivity = new Map<string, ActivityComment[]>();
  for (const comment of comments.sort((a, b) => a.createdAt - b.createdAt)) {
    const actor = describeActor(comment.authorRole, comment.authorDeviceId, devices);
    const withLabel: ActivityComment = {
      ...comment,
      authorLabel: actor.person ?? actor.label,
    };
    byActivity.set(comment.activityId, [
      ...(byActivity.get(comment.activityId) ?? []),
      withLabel,
    ]);
  }
  return byActivity;
}

export function summarise(comments: ActivityComment[] | undefined): CommentSummary | undefined {
  if (!comments || comments.length === 0) return undefined;

  const open = comments.filter((c) => c.needsResponse && !c.resolvedAt);
  return {
    total: comments.length,
    openClarifications: open.length,
    latestOpenText: open.at(-1)?.text,
  };
}

export interface ReviewItem {
  comment: ActivityComment;
  /** The activity row it hangs off, for rendering context. */
  activityId: string;
}

/**
 * Everything still awaiting an answer, oldest first.
 *
 * Oldest first on purpose: a question from Tuesday that nobody has answered is
 * more urgent than one asked ten minutes ago, and a newest-first list buries it
 * exactly as reliably as not having a list at all.
 */
export async function openClarifications(): Promise<ReviewItem[]> {
  const [comments, devices] = await Promise.all([
    db.activityComments.toArray(),
    deviceLabelMap(),
  ]);

  return comments
    .filter((c) => c.needsResponse && !c.resolvedAt)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((comment) => {
      const actor = describeActor(comment.authorRole, comment.authorDeviceId, devices);
      return {
        comment: { ...comment, authorLabel: actor.person ?? actor.label },
        activityId: comment.activityId,
      };
    });
}

export async function commentCounts(): Promise<{ total: number; open: number }> {
  const all = await db.activityComments.toArray();
  return {
    total: all.length,
    open: all.filter((c) => c.needsResponse && !c.resolvedAt).length,
  };
}

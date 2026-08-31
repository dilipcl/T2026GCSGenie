import React, { useState } from 'react';
import { ActivityComment, ActivityItem, UserRole } from '../../types';
import {
  addComment,
  markCommentShared,
  reopenComment,
  resolveComment,
} from '../../services/activityCommentService';
import {
  activityCommentMessage,
  messageContext,
  WHATSAPP_ACTION_LABEL,
} from '../../services/whatsappService';
import { WhatsAppShare } from '../shared/WhatsAppShare';
import { db } from '../../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useFeedback } from '../shared/FeedbackProvider';
import { MessageSquare, Check, HelpCircle, Send, RotateCcw } from 'lucide-react';

/**
 * The conversation about one change.
 *
 * A comment is either a remark or a question. Only a question flags the row,
 * because a flag that appears for "nice one" is a flag people stop looking at.
 *
 * Resolving asks for what was actually done rather than just ticking. "Added,
 * and made a follow-up for Friday" and "not needed, it was classwork" are
 * different answers to the same question, and a bare tick preserves neither.
 */

function timeOf(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const CommentRow: React.FC<{
  comment: ActivityComment;
  currentRole: UserRole;
  item: ActivityItem;
  onChanged: () => void;
}> = ({ comment, currentRole, item, onChanged }) => {
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const [sharing, setSharing] = useState(false);

  const settings = useLiveQuery(() => db.parentSettings.get('active_settings'), []);

  /**
   * The message carries the change, who logged it and when - not just the
   * comment. Forwarded on its own, "have you added the notebook link?" gives
   * the reader nothing to work out which session it means.
   */
  const shareText = activityCommentMessage(messageContext(settings), {
    summary: item.summary,
    detail: item.detail,
    entityType: item.entityType,
    actor: item.actorPerson || item.actorLabel,
    activityAt: item.timestamp,
    comment: comment.text,
    commentBy: comment.authorLabel || (comment.authorRole === 'PARENT' ? 'Parent' : 'Student'),
    commentAt: comment.createdAt,
    needsResponse: comment.needsResponse,
    links: item.links,
  });

  const isOpenQuestion = comment.needsResponse && !comment.resolvedAt;

  return (
    <li
      className={`rounded-xl border p-2.5 ${
        isOpenQuestion
          ? 'bg-amber-500/5 border-amber-500/30'
          : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      <div className="flex items-start gap-2">
        {comment.needsResponse ? (
          <HelpCircle
            className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
              comment.resolvedAt ? 'text-emerald-400' : 'text-amber-400'
            }`}
          />
        ) : (
          <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-500" />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-100 leading-snug break-words">{comment.text}</p>

          <p className="text-[10px] text-slate-500 mt-1">
            {comment.authorLabel || (comment.authorRole === 'PARENT' ? 'Parent' : 'Student')}
            {' · '}
            {timeOf(comment.createdAt)}
            {comment.needsResponse && !comment.resolvedAt && (
              <span className="text-amber-400 font-bold"> · needs an answer</span>
            )}
          </p>

          {comment.resolvedAt && (
            <p className="text-[11px] text-emerald-400 mt-1.5 pl-2 border-l-2 border-emerald-500/40 leading-snug">
              {comment.resolutionNote || 'Sorted'}
              <span className="text-slate-500">
                {' '}
                — {comment.resolvedByRole === 'PARENT' ? 'parent' : 'student'},{' '}
                {timeOf(comment.resolvedAt)}
              </span>
            </p>
          )}

          {resolving ? (
            <div className="mt-2 flex gap-1.5">
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you do?"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={async () => {
                  await resolveComment(comment.id, currentRole, note);
                  setResolving(false);
                  setNote('');
                  onChanged();
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {isOpenQuestion && (
                <button
                  type="button"
                  onClick={() => setResolving(true)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-bold text-emerald-400"
                >
                  <Check className="w-3 h-3" /> Answer it
                </button>
              )}

              {comment.resolvedAt && comment.needsResponse && (
                <button
                  type="button"
                  onClick={async () => {
                    await reopenComment(comment.id);
                    onChanged();
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-400"
                >
                  <RotateCcw className="w-3 h-3" /> Reopen
                </button>
              )}

              {/* Opening a link is all the app can observe, so it never claims
                  the message was sent - the same rule as every other WhatsApp
                  surface here. */}
              <button
                type="button"
                onClick={() => setSharing((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-400"
              >
                <Send className="w-3 h-3" /> {sharing ? 'Hide' : WHATSAPP_ACTION_LABEL}
              </button>
            </div>
          )}

          {sharing && (
            <div className="mt-2">
              <WhatsAppShare
                text={shareText}
                compact
                previewLabel="Show the message"
                onOpened={async () => {
                  await markCommentShared(comment.id);
                  onChanged();
                }}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

export const ActivityComments: React.FC<{
  item: ActivityItem;
  currentRole: UserRole;
  onChanged: () => void;
}> = ({ item, currentRole, onChanged }) => {
  const { toast } = useFeedback();
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [needsResponse, setNeedsResponse] = useState(true);
  const [saving, setSaving] = useState(false);

  const comments = item.comments ?? [];

  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      await addComment({
        activityId: item.id,
        text,
        authorRole: currentRole,
        needsResponse,
      });
      setText('');
      setComposing(false);
      onChanged();
    } catch (err) {
      toast.error('Could not save that', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2">
      {comments.length > 0 && (
        <ul className="space-y-1.5 mb-1.5">
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              currentRole={currentRole}
              item={item}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}

      {composing ? (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-2.5 space-y-2">
          <textarea
            autoFocus
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Have you added the Notebook link and a follow-up task?"
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder:text-slate-600"
          />

          <label className="flex items-center gap-2 text-[11px] text-slate-300">
            <input
              type="checkbox"
              checked={needsResponse}
              onChange={(e) => setNeedsResponse(e.target.checked)}
              className="accent-amber-500"
            />
            This needs an answer — flag it for review
          </label>

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setComposing(false)}
              className="flex-1 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-bold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!text.trim() || saving}
              onClick={submit}
              className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Add comment'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-300"
        >
          <MessageSquare className="w-3 h-3" />
          {comments.length > 0 ? 'Add another comment' : 'Comment or ask a question'}
        </button>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { UserRole } from '../../types';
import {
  addEntityComment,
  commentsForEntity,
  resolveComment,
} from '../../services/activityCommentService';
import { evidenceIndex } from '../../services/evidenceService';
import { EvidencePanel } from './EvidencePanel';
import { useFeedback } from './FeedbackProvider';
import { formatShortDate } from '../../utils/date';
import { whenLabel } from '../../services/whatsappService';
import {
  Paperclip,
  Link as LinkIcon,
  MessageSquare,
  HelpCircle,
  Check,
  AlertTriangle,
  Plus,
} from 'lucide-react';

/**
 * Everything about one piece of work, and the conversation about it.
 *
 * The record and the sign-off list could both tell you a thing had been
 * finished and neither could show you the thing. The photo was in one tab, the
 * link on the record itself, the notes somewhere else again, and there was
 * nowhere at all to say "which questions did you actually do?" - so the
 * follow-up happened at dinner, detached from the work, with no record of
 * whether it was ever answered.
 *
 * Shared between both screens because they are asking the same question about
 * the same row, and two drill-downs would answer it differently within a month.
 *
 * A question here raises a task. That is the part worth being deliberate about:
 * a comment that only flags a row depends on somebody scrolling back to a
 * screen they have no reason to open, and the honest version of "please look at
 * this" is a thing on the list they already work from.
 */

interface TaskDetailPanelProps {
  taskId: string;
  role: UserRole;
  /** Hides the evidence editor where the host has its own. */
  allowAttach?: boolean;
}

export const TaskDetailPanel: React.FC<TaskDetailPanelProps> = ({
  taskId,
  role,
  allowAttach = true,
}) => {
  const { toast } = useFeedback();
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attaching, setAttaching] = useState(false);

  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId]);
  const comments = useLiveQuery(() => commentsForEntity(taskId), [taskId], []);
  /**
   * Through the evidence index rather than reading the fields here, so this
   * panel and the Evidence tab can never disagree about whether a piece of work
   * has anything attached to it.
   */
  const evidence = useLiveQuery(
    async () => (await evidenceIndex()).find((item) => item.entityId === taskId),
    [taskId]
  );

  if (!task) return null;

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;

    setBusy(true);
    try {
      await addEntityComment({
        entityId: taskId,
        entityLabel: task.isRemediation ? 'fix-up' : task.isHomework ? 'homework' : 'task',
        title: task.title,
        text,
        authorRole: role,
        needsResponse: asking,
        subjectId: task.subjectId,
      });
      setDraft('');
      if (asking) {
        toast.success('Asked', 'It is on the list as a follow-up to answer.');
        setAsking(false);
      }
    } catch (err) {
      toast.error('Could not save that', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
      <p className="text-[10px] text-slate-500">
        {task.subjectId.replace(/_/g, ' ')} · due {formatShortDate(task.dueDate)} · +{task.xpValue} XP
        {task.completedAt && ` · closed ${whenLabel(task.completedAt)}`}
      </p>

      {task.description && (
        <p className="text-[11px] text-slate-300 leading-relaxed">{task.description}</p>
      )}

      {/* What there is to look at. The whole point of a drill-down. */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          What is attached
        </p>
        {evidence && evidence.evidence.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {evidence.evidence.map((ref, index) =>
              ref.url ? (
                <a
                  key={index}
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={ref.url}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-[10px] text-indigo-300 hover:bg-indigo-500/20"
                >
                  {ref.kind === 'LINK' ? (
                    <LinkIcon className="w-3 h-3" />
                  ) : (
                    <Paperclip className="w-3 h-3" />
                  )}
                  <span className="truncate max-w-[12rem]">{ref.label}</span>
                </a>
              ) : (
                <span
                  key={index}
                  title="Held on the device it was taken on."
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10px] text-slate-400"
                >
                  <Paperclip className="w-3 h-3" />
                  <span className="truncate max-w-[12rem]">{ref.label}</span>
                  <span className="opacity-70">· no link</span>
                </span>
              )
            )}
          </div>
        ) : (
          <p className="text-[10px] text-amber-300 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Nothing attached — no photo, no link.
          </p>
        )}

        {allowAttach && (
          <button
            type="button"
            onClick={() => setAttaching((prev) => !prev)}
            className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300"
          >
            <Plus className="w-3 h-3" />
            {attaching ? 'Close' : 'Add or change what is attached'}
          </button>
        )}

        {attaching && (
          <div className="mt-2">
            <EvidencePanel
              entity="Task"
              entityId={taskId}
              title={task.title}
              role={role}
              existingLink={task.driveProofUrl}
              compact
            />
          </div>
        )}
      </div>

      {/* The conversation. */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
          Comments
        </p>

        {comments.length === 0 ? (
          <p className="text-[10px] text-slate-500">Nothing said about this yet.</p>
        ) : (
          <ul className="space-y-1.5 mb-2">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className={`px-2.5 py-1.5 rounded-lg border ${
                  comment.needsResponse && !comment.resolvedAt
                    ? 'bg-amber-950/25 border-amber-500/40'
                    : 'bg-slate-900/70 border-slate-800'
                }`}
              >
                <p className="text-[10px] text-slate-500 flex items-center gap-1">
                  {comment.needsResponse ? (
                    <HelpCircle className="w-3 h-3 text-amber-400" />
                  ) : (
                    <MessageSquare className="w-3 h-3" />
                  )}
                  <span className="font-bold">
                    {comment.authorLabel ??
                      (comment.authorRole === 'PARENT' ? 'A parent' : 'Tejas')}
                  </span>
                  <span>· {whenLabel(comment.createdAt)}</span>
                  {comment.needsResponse && !comment.resolvedAt && (
                    <span className="text-amber-300 font-bold">· waiting</span>
                  )}
                </p>
                <p className="text-[11px] text-slate-200 leading-relaxed">{comment.text}</p>

                {comment.resolutionNote && (
                  <p className="text-[10px] text-emerald-300 mt-0.5">
                    Answered: {comment.resolutionNote}
                  </p>
                )}

                {comment.needsResponse && !comment.resolvedAt && (
                  <button
                    type="button"
                    onClick={() => resolveComment(comment.id, role)}
                    className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-emerald-400"
                  >
                    <Check className="w-3 h-3" /> Mark it answered
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
            placeholder={asking ? 'What do you want to ask?' : 'Add a comment'}
            className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder:text-slate-600"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !draft.trim()}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[10px] font-bold whitespace-nowrap"
          >
            {asking ? 'Ask' : 'Post'}
          </button>
        </div>

        {/* A remark raises nothing; a question becomes work. Stated on the
            control, because a comment box that silently created chores would be
            a comment box nobody used twice. */}
        <label className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={asking}
            onChange={(e) => setAsking(e.target.checked)}
            className="accent-amber-500"
          />
          This needs an answer — put it on the list as a follow-up
        </label>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  groupByCategory,
  markReported,
  unreportedChanges,
} from '../../services/changeLogService';
import {
  buildChatUrl,
  changeLogMessage,
  formatE164,
  messageContext,
  WHATSAPP_ACTION_LABEL,
} from '../../services/whatsappService';
import { useFeedback } from './FeedbackProvider';
import { formatFriendlyDate } from '../../utils/date';
import { Copy, Check, MessageCircle, Users, ExternalLink, ClipboardList } from 'lucide-react';

/**
 * The confirmed changes that the family has not been told about yet.
 *
 * The purpose is narrow and worth stating: to stop the same conversation
 * happening every evening. "Did you do it?" is only a question while the answer
 * lives on one phone. Once each confirmed change is posted to the group as it
 * happens, the question is already answered and the evening can be about
 * something else.
 *
 * What this cannot do is post on its own. WhatsApp has no URL that targets a
 * group with a prefilled message - `wa.me/?text=` opens the chat picker and the
 * sender chooses. So the app writes the message, opens the picker, and says
 * plainly that the last tap is a person's. Claiming otherwise would be the same
 * lie as labelling the button "Send".
 *
 * Renders nothing when there is nothing to report.
 */
export const ChangeLogCard: React.FC = () => {
  const { toast } = useFeedback();
  const [comment, setComment] = useState('');
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const pending = useLiveQuery(() => unreportedChanges(), [], []);
  const settings = useLiveQuery(() => db.parentSettings.get('active_settings'), []);

  if (pending.length === 0) return null;

  const numbers = settings?.parentWhatsAppNumbers?.filter((n) => n.e164) ?? [];
  const groupUrl = settings?.familyGroupInviteUrl;

  const grouped = groupByCategory(pending);
  const dates = Array.from(new Set(pending.map((e) => e.date))).sort();
  const dateLabel =
    dates.length === 1
      ? formatFriendlyDate(dates[0])
      : `${formatFriendlyDate(dates[0])} – ${formatFriendlyDate(dates[dates.length - 1])}`;

  const text = changeLogMessage(messageContext(settings), {
    dateLabel,
    groups: grouped.map((g) => ({
      label: CATEGORY_LABEL[g.category],
      icon: CATEGORY_ICON[g.category],
      lines: g.entries.map((e) => e.summary + (e.detail ? ` — ${e.detail}` : '')),
    })),
    comment: comment.trim() || undefined,
    commentFrom: 'Note',
  });

  /**
   * Marks the batch as reported.
   *
   * Deliberately triggered by handing the message off, not by delivery - the
   * app cannot observe delivery. The wording everywhere reflects that.
   */
  const settle = async (howMany: number) => {
    try {
      await markReported(pending);
      setComment('');
      toast.success(
        'Logged as sent',
        `${howMany} update${howMany === 1 ? '' : 's'} marked as reported to the family.`
      );
    } catch (err) {
      console.error('Could not mark the log as sent:', err);
      toast.error('Could not update the log', 'The updates are still listed as unsent.');
    }
  };

  const openChat = async (e164?: string) => {
    window.open(buildChatUrl(text, e164), '_blank', 'noopener,noreferrer');
    await settle(pending.length);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await settle(pending.length);
    } catch {
      toast.error('Could not copy that', 'Open it in WhatsApp instead, or select the text below.');
      setShowAll(true);
    }
  };

  const visible = showAll ? pending : pending.slice(-4);

  return (
    <div className="glass-card p-5 border-emerald-500/30">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center justify-center">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">
              {pending.length} update{pending.length === 1 ? '' : 's'} to log
            </h2>
            <p className="text-[11px] text-slate-400">
              Confirmed {dateLabel.toLowerCase()} — not yet sent to the family group.
            </p>
          </div>
        </div>

        {groupUrl && (
          <a
            href={groupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Open the group</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <ul className="space-y-1 mb-3">
        {pending.length > visible.length && (
          <li>
            <button
              onClick={() => setShowAll(true)}
              className="text-[11px] text-slate-400 hover:text-slate-200 underline underline-offset-2"
            >
              Show {pending.length - visible.length} earlier
            </button>
          </li>
        )}
        {visible.map((entry) => (
          <li key={entry.id} className="flex items-start gap-2 text-[11px] text-slate-300">
            <span className="leading-4" aria-hidden="true">
              {CATEGORY_ICON[entry.category]}
            </span>
            <span className="min-w-0">
              {entry.summary}
              {entry.detail && <span className="text-slate-500"> — {entry.detail}</span>}
            </span>
          </li>
        ))}
      </ul>

      <label htmlFor="changelog-comment" className="sr-only">
        Add a comment
      </label>
      <input
        id="changelog-comment"
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment for Mum or Dad (optional)"
        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 mb-2.5"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => openChat()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all"
        >
          <Users className="w-3.5 h-3.5" />
          <span>Send to family group</span>
        </button>

        {numbers.map((n) => (
          <button
            key={n.id}
            onClick={() => openChat(n.e164)}
            title={formatE164(n.e164)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition-all"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>{n.label || WHATSAPP_ACTION_LABEL}</span>
          </button>
        ))}

        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition-all"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <p className="mt-2 text-[10px] text-slate-500">
        WhatsApp cannot be posted to automatically — this opens it with the message ready and you
        pick the group. Tapping any of these marks the updates as logged.
      </p>
    </div>
  );
};

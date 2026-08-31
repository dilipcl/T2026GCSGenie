import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { ChangeLogEntry } from '../../types';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  confirmChanges,
  confirmedChanges,
  groupByCategory,
  markDriveLogged,
  markReported,
  pendingConfirmation,
} from '../../services/changeLogService';
import { buildDriveLog, downloadDriveLog, formatStamp } from '../../services/driveLogService';
import {
  buildChatUrl,
  changeLogMessage,
  formatE164,
  messageContext,
} from '../../services/whatsappService';
import { WORKING_FOLDER_PATH } from '../../db/driveFolders';
import { useFeedback } from '../shared/FeedbackProvider';
import { formatFriendlyDate, formatLogTimestamp } from '../../utils/date';
import {
  ClipboardCheck,
  FileDown,
  FolderOpen,
  MessageCircle,
  Users,
  Check,
  Copy,
  History,
  ExternalLink,
} from 'lucide-react';

/**
 * Everything the student changed, waiting to be signed off.
 *
 * The confirmation at the point of action is a reflex guard - it stops a thumb
 * on a scrolling list from ticking something off. It is not a review, and it
 * cannot be: nobody reads carefully in the second before they meant to tap
 * something else.
 *
 * This is the review. It is unhurried, it shows the day's changes together
 * rather than one at a time, and it ends in three things that only make sense
 * once: a signature, a file in Drive with a timestamp, and - if the family has
 * asked for it - a message.
 */
export const UpdatesView: React.FC = () => {
  const { toast } = useFeedback();

  const pending = useLiveQuery(() => pendingConfirmation(), [], []);
  const confirmed = useLiveQuery(() => confirmedChanges(), [], []);
  const settings = useLiveQuery(() => db.parentSettings.get('active_settings'), []);

  const [comment, setComment] = useState('');
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  /** The batch just confirmed, so forwarding stays available afterwards. */
  const [justConfirmed, setJustConfirmed] = useState<ChangeLogEntry[] | null>(null);

  const selected = useMemo(
    () => pending.filter((e) => !deselected.has(e.id)),
    [pending, deselected]
  );

  const forwarding = settings?.updateForwarding;
  const numbers = (settings?.parentWhatsAppNumbers ?? []).filter(
    (n) => n.e164 && (forwarding?.toNumberIds ?? []).includes(n.id)
  );
  const groupUrl = settings?.familyGroupInviteUrl;

  const forwardBatch = justConfirmed ?? [];
  const forwardText =
    forwardBatch.length > 0
      ? changeLogMessage(messageContext(settings), {
          dateLabel: batchDateLabel(forwardBatch),
          groups: groupByCategory(forwardBatch).map((g) => ({
            label: CATEGORY_LABEL[g.category],
            icon: CATEGORY_ICON[g.category],
            lines: g.entries.map((e) => e.summary + (e.detail ? ` — ${e.detail}` : '')),
          })),
          comment: forwardBatch[0]?.confirmComment,
          commentFrom: 'Note',
        })
      : '';

  const toggle = (id: string) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * The signature, the file, and the record that both happened.
   *
   * The Drive file is written first: if saving it fails the batch stays
   * unconfirmed, because a confirmation whose evidence never got written is
   * worse than one that has not happened yet.
   */
  const handleConfirm = async () => {
    if (busy || selected.length === 0) return;
    setBusy(true);

    try {
      const file = buildDriveLog(selected, { settings, comment });
      const fileName = downloadDriveLog(file);

      const updated = await confirmChanges(selected, comment);
      await markDriveLogged(updated, fileName);

      setJustConfirmed(updated);
      setComment('');
      setDeselected(new Set());

      toast.celebrate(
        `${updated.length} update${updated.length === 1 ? '' : 's'} confirmed`,
        `Saved as ${fileName} — put it in your Drive folder.`
      );
    } catch (err) {
      console.error('Could not confirm those updates:', err);
      toast.error('Could not confirm those', 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  const forward = async (e164?: string) => {
    if (forwardBatch.length === 0) return;
    window.open(buildChatUrl(forwardText, e164), '_blank', 'noopener,noreferrer');
    await markReported(forwardBatch);
    // Not "sent": opening the link is all this can observe, and every other
    // WhatsApp surface in the app is careful about the same distinction.
    toast.success('Opened in WhatsApp', 'Pick the chat and send it from there.');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(forwardText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await markReported(forwardBatch);
    } catch {
      toast.error('Could not copy that', 'Open it in WhatsApp instead.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-6 bg-gradient-to-r from-slate-900 via-emerald-950/25 to-slate-900 border-emerald-500/30">
        <div className="flex items-center gap-2 mb-1">
          <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <ClipboardCheck className="w-5 h-5" />
          </span>
          <h2 className="text-xl font-bold text-white">Updates</h2>
        </div>
        <p className="text-xs text-slate-300 max-w-2xl">
          Everything you changed, ready to sign off. Confirming writes a dated file for the Google
          Drive folder and, if it is switched on, offers to send it to the family.
        </p>
      </div>

      {/* ── Waiting to be confirmed ───────────────────────────────────── */}
      {pending.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <ClipboardCheck className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-white">Nothing waiting</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Everything you have changed has been confirmed and logged.
          </p>
        </div>
      ) : (
        <div className="glass-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h3 className="text-sm font-bold text-white">
              {pending.length} waiting to confirm
            </h3>
            <span className="text-[11px] text-slate-400">
              {selected.length} of {pending.length} selected
            </span>
          </div>

          <div className="space-y-1.5 mb-4">
            {pending.map((entry) => {
              const isOn = !deselected.has(entry.id);
              return (
                <label
                  key={entry.id}
                  className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    isOn
                      ? 'bg-slate-900/70 border-slate-700'
                      : 'bg-slate-950/60 border-slate-800/70 opacity-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={() => toggle(entry.id)}
                    className="mt-0.5 w-4 h-4 accent-emerald-500 flex-shrink-0"
                  />
                  <span className="text-base leading-5 flex-shrink-0" aria-hidden="true">
                    {CATEGORY_ICON[entry.category]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-slate-100">{entry.summary}</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">
                      {CATEGORY_LABEL[entry.category]} · {formatLogTimestamp(entry.timestamp)}
                      {entry.detail ? ` · ${entry.detail}` : ''}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <label
            htmlFor="confirm-comment"
            className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5"
          >
            Anything to add? <span className="font-normal normal-case">(optional)</span>
          </label>
          <textarea
            id="confirm-comment"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Ran out of time on the Physics one — will finish it tomorrow"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 mb-3 resize-none"
          />

          <button
            onClick={handleConfirm}
            disabled={busy || selected.length === 0}
            className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all"
          >
            <FileDown className="w-4 h-4" />
            <span>
              {busy
                ? 'Confirming...'
                : `Confirm ${selected.length} update${selected.length === 1 ? '' : 's'} and log to Drive`}
            </span>
          </button>

          <p className="mt-2 text-[10px] text-slate-500">
            Saves a dated Markdown file. Put it in{' '}
            <span className="font-mono text-slate-400">{WORKING_FOLDER_PATH}</span> — Drive for
            Desktop syncs it from there. The app cannot upload to Drive on its own.
          </p>
        </div>
      )}

      {/* ── Forward the batch just confirmed ──────────────────────────── */}
      {forwardBatch.length > 0 && forwarding?.promptAfterConfirm !== false && (
        <div className="glass-card p-5 border-indigo-500/30">
          <h3 className="text-sm font-bold text-white mb-0.5">Send it on</h3>
          <p className="text-[11px] text-slate-400 mb-3">
            {forwardBatch.length} update{forwardBatch.length === 1 ? '' : 's'} confirmed just now.
            Nothing is sent until you tap.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {/* Always offered, and always first. This used to sit behind a
                `toGroup` setting, so a parent who had unticked it saw only the
                individual buttons - and a confirmed batch meant for everyone
                went to whichever single person was on the left. The group is
                where these belong; asking one person is the exception. */}
            <button
              onClick={() => forward()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Family group</span>
            </button>

            {numbers.map((n) => (
              <button
                key={n.id}
                onClick={() => forward(n.e164)}
                title={formatE164(n.e164)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>{n.label || 'Send'}</span>
              </button>
            ))}

            <button
              onClick={copy}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            {groupUrl && (
              <a
                href={groupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold ml-auto"
              >
                <span>Open the group</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <p className="mt-2 text-[10px] text-slate-500">
            WhatsApp cannot be posted to automatically, and gives no way to open a group directly —
            this opens the chat list with the message ready, and the group is what you pick.
          </p>
        </div>
        )}

      {/* ── What has already been signed off ──────────────────────────── */}
      <div className="glass-card p-5">
        <button
          onClick={() => setShowHistory((prev) => !prev)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-bold text-white">
              Already confirmed ({confirmed.length})
            </span>
          </span>
          <span className="text-[11px] text-indigo-400 font-semibold">
            {showHistory ? 'Hide' : 'Show'}
          </span>
        </button>

        {showHistory && (
          <div className="mt-3 space-y-1.5">
            {confirmed.length === 0 ? (
              <p className="text-[11px] text-slate-500">Nothing confirmed yet.</p>
            ) : (
              confirmed.map((entry) => (
                <div
                  key={entry.id}
                  className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm leading-5" aria-hidden="true">
                      {CATEGORY_ICON[entry.category]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-100">{entry.summary}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Confirmed {formatStamp(new Date(entry.confirmedAt!))}
                        {entry.driveFileName && (
                          <span className="text-slate-400"> · {entry.driveFileName}</span>
                        )}
                        {entry.reported && <span className="text-emerald-400"> · sent</span>}
                      </p>
                      {entry.confirmComment && (
                        <p className="text-[10px] text-slate-400 italic mt-0.5">
                          “{entry.confirmComment}”
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {settings?.googleDriveFolderUrl && (
          <a
            href={settings.googleDriveFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Open the Drive folder</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
};

/** "Today", or a range when a batch spans days. */
function batchDateLabel(entries: ChangeLogEntry[]): string {
  const days = Array.from(new Set(entries.map((e) => e.date))).sort();
  if (days.length === 0) return 'Today';
  return days.length === 1
    ? formatFriendlyDate(days[0])
    : `${formatFriendlyDate(days[0])} – ${formatFriendlyDate(days[days.length - 1])}`;
}

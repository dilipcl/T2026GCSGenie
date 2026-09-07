import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  EvidenceSubject,
  evidenceIndex,
  evidenceSummary,
  matches,
} from '../../services/evidenceService';
import {
  Search,
  Link as LinkIcon,
  Paperclip,
  AlertTriangle,
  CheckCircle2,
  Send,
  Check,
  Plus,
  MessageSquare,
  CalendarClock,
} from 'lucide-react';
import { EvidencePanel } from '../shared/EvidencePanel';
import { EVIDENCE_TARGETS } from '../../services/evidenceService';
import { formatShortDate } from '../../utils/date';
import { UserRole } from '../../types';
import { requestEvidence, resolveComment } from '../../services/activityCommentService';
import { WhatsAppShare } from '../shared/WhatsAppShare';
import { evidenceMessage, messageContext, whenLabel } from '../../services/whatsappService';
import { db } from '../../db';

/**
 * "Did he add the links and images for the Physics electricity session?"
 *
 * That question was previously unanswerable from inside the app. Photos sit in
 * one table keyed by owner; links sit on the records themselves under five
 * different field names. Answering meant exporting the database and reading the
 * JSON - which is exactly what happened, and is not a thing to ask of anyone.
 *
 * Searching rather than browsing, because the question always arrives with its
 * subject already in it. Nobody opens this to see everything; they open it
 * knowing roughly what they are looking for.
 */

const EvidenceRow: React.FC<{
  item: EvidenceSubject;
  studentName: string;
  subjectName?: string;
  currentRole: UserRole;
}> = ({ item, studentName, subjectName, currentRole }) => {
  const [sharing, setSharing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');

  const openAsk = item.openRequests?.[0];
  const given = item.notes?.[0];

  /**
   * The link already on the record, picked out of the evidence refs by the
   * source the index stamped on it. The panel needs the current value or its
   * field opens blank and a save wipes a link that was already there.
   */
  const existingLink = item.evidence.find(
    (ref) => ref.kind === 'LINK' && ref.source === EVIDENCE_TARGETS[item.entity].linkLabel
  )?.url;

  /**
   * The message says when the work was done, not just what it was called.
   * "Physics session" with no date is unanswerable once there have been two of
   * them, which is the whole reason the timestamp is in here.
   */
  const shareText = evidenceMessage(
    { studentName },
    {
      title: item.title,
      entity: item.entity,
      subjectName,
      completed: item.completed,
      completedAt: item.completedAt,
      evidence: item.evidence,
    }
  );

  return (
  <li className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-xl">
    <div className="flex items-start gap-2">
      {item.missingEvidence ? (
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
      ) : item.hasEvidence ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
      ) : (
        <span className="w-3.5 flex-shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-100 leading-snug break-words">{item.title}</p>
        {/* Enough to know which piece of work this actually was.

            "Marked done with nothing attached" over a bare title is not
            something anybody can act on - the first question is always which
            one, and by the time a row reaches this list it is usually a week
            old. The date it was due and the date it was closed are what pin it
            down, so they are on the row rather than a tap away. */}
        <p className="text-[10px] text-slate-500 flex flex-wrap items-center gap-x-1.5">
          <span>{item.entity}</span>
          {item.subjectId && <span>· {item.subjectId.replace(/_/g, ' ')}</span>}
          {item.dueDate && (
            <span className="inline-flex items-center gap-0.5">
              {/* A plain calendar date. `formatFriendlyDate` answers "how
                  soon?" and returns "Overdue by 12 days", which reads as
                  nonsense after the word "due". */}
              · <CalendarClock className="w-2.5 h-2.5" /> due {formatShortDate(item.dueDate)}
            </span>
          )}
          {item.completed ? (
            <span className="text-slate-400">
              · closed {item.completedAt ? whenLabel(item.completedAt) : 'at some point'}
            </span>
          ) : (
            <span>· not finished</span>
          )}
        </p>

        {item.evidence.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {item.evidence.map((ref, index) =>
              ref.url ? (
                <a
                  key={`${ref.source}-${index}`}
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={ref.url}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-[10px] text-indigo-300 hover:bg-indigo-500/20"
                >
                  {ref.kind === 'LINK' ? (
                    <LinkIcon className="w-3 h-3" />
                  ) : (
                    <Paperclip className="w-3 h-3" />
                  )}
                  <span className="truncate max-w-[12rem]">{ref.label}</span>
                </a>
              ) : (
                /* A photo that exists only as a blob on one device, or one saved
                   into the Drive folder with no id to link to. Rendering a dead
                   link would be worse than saying so. */
                <span
                  key={`${ref.source}-${index}`}
                  title={
                    ref.savedWithoutLink
                      ? 'Saved into your Drive backup folder. Links need the Drive API, which this device does not use.'
                      : 'Held on the device it was taken on. Connect Drive backup to keep a copy.'
                  }
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] ${
                    ref.savedWithoutLink
                      ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400/80'
                      : 'bg-slate-800/60 border-slate-800 text-slate-500'
                  }`}
                >
                  <Paperclip className="w-3 h-3" />
                  <span className="truncate max-w-[12rem]">{ref.label}</span>
                  <span className="opacity-70">· no link</span>
                </span>
              )
            )}
          </div>
        )}

        {item.unexplained && (
          <p className="text-[10px] text-amber-300 mt-1 leading-snug">
            Marked done with nothing attached — no photo, no link, and nothing said about why.
          </p>
        )}

        {/* Missing, but accounted for. A different row from the one above, and
            deliberately quieter: somebody has already dealt with this, and
            colouring it like an unanswered problem is how a list of real
            problems gets ignored. */}
        {given && (
          <div className="mt-1.5 rounded-lg bg-slate-800/60 border border-slate-700 p-2">
            <p className="text-[10px] text-slate-300 leading-snug flex items-start gap-1.5">
              <MessageSquare className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
              <span>
                <span className="font-bold">No proof, and that is explained</span> — “{given.text}”
                <span className="text-slate-500">
                  {' '}
                  ·{' '}
                  {given.authorLabel ||
                    (given.authorRole === 'PARENT' ? 'a parent' : 'the student')}
                  , {whenLabel(given.createdAt)}
                </span>
                {(item.notes?.length ?? 0) > 1 && (
                  <span className="text-slate-500"> · {item.notes!.length - 1} more</span>
                )}
              </span>
            </p>
          </div>
        )}

        {/* Chased, and still nothing back. A different situation from simply
            missing, and the one that actually needs following up. */}
        {openAsk && (
          <div className="mt-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 p-2">
            <p className="text-[10px] text-rose-200 leading-snug">
              <span className="font-bold">Asked and not answered</span> —{' '}
              {openAsk.authorLabel || (openAsk.authorRole === 'PARENT' ? 'a parent' : 'the student')}
              , {whenLabel(openAsk.createdAt)}.
            </p>

            {resolving ? (
              <div className="flex gap-1.5 mt-1.5">
                <input
                  autoFocus
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What happened?"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white placeholder:text-slate-600"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await resolveComment(openAsk.id, currentRole, note);
                    setResolving(false);
                    setNote('');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                >
                  Done
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setResolving(true)}
                className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-emerald-400"
              >
                <Check className="w-3 h-3" /> Mark it answered
              </button>
            )}
          </div>
        )}

        {/* The action that was missing entirely.

            This tab could say a piece of homework had been closed with nothing
            attached, and then offer exactly one thing to do about it: message
            somebody on WhatsApp. Adding the evidence - the obvious answer, and
            usually the right one - was not possible from anywhere in the app.
            It is the first control on the row now, and chasing is the fallback
            behind it. */}
        <div className="flex flex-wrap items-center gap-3 mt-1.5">
          <button
            type="button"
            onClick={() => setAdding((prev) => !prev)}
            className={`inline-flex items-center gap-1 text-[10px] font-bold ${
              item.unexplained
                ? 'text-amber-300 hover:text-amber-200'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Plus className="w-3 h-3" />
            {adding ? 'Close' : item.hasEvidence ? 'Add more evidence' : 'Add the evidence'}
          </button>

          <button
            type="button"
            onClick={() => setSharing((prev) => !prev)}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-300"
          >
            <Send className="w-3 h-3" />
            {sharing
              ? 'Hide'
              : item.missingEvidence
              ? 'Ask for it on WhatsApp'
              : 'Share on WhatsApp'}
          </button>
        </div>

        {adding && (
          <div className="mt-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <EvidencePanel
              entity={item.entity}
              entityId={item.entityId}
              title={item.title}
              role={currentRole}
              existingLink={existingLink}
              compact
            />
          </div>
        )}

        {sharing && (
          <div className="mt-1.5">
            <WhatsAppShare
              text={shareText}
              compact
              previewLabel="Show the message"
              /* Recorded on open, so an ask that went out is visible here and in
                 the activity feed rather than disappearing into WhatsApp. Only
                 for work that is actually missing its evidence - forwarding a
                 row that already has its links is sharing, not chasing. */
              onOpened={
                item.missingEvidence && !openAsk
                  ? () => {
                      void requestEvidence({
                        entityId: item.entityId,
                        entityLabel: item.entity,
                        title: item.title,
                        authorRole: currentRole,
                      });
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  </li>
  );
};

export const EvidenceCheck: React.FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const [query, setQuery] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [askedOnly, setAskedOnly] = useState(false);

  const index = useLiveQuery(() => evidenceIndex(), []);
  const summary = useLiveQuery(() => evidenceSummary(), []);
  const settings = useLiveQuery(() => db.parentSettings.get('active_settings'), []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  const { studentName } = messageContext(settings);

  const results = useMemo(() => {
    if (!index) return [];
    return index
      .filter((item) => (missingOnly ? item.missingEvidence : true))
      .filter((item) => (askedOnly ? (item.openRequests?.length ?? 0) > 0 : true))
      .filter((item) => matches(item, query))
      /* Chased-and-unanswered first, then gaps nobody has accounted for. Those
         are the two states waiting on a person; burying either under everything
         finished recently would defeat the point of recording them at all. A
         gap with a reason against it sorts with the ordinary rows, because it
         is finished business. */
      .sort((a, b) => {
        const asked = (item: typeof a) => ((item.openRequests?.length ?? 0) > 0 ? 1 : 0);
        if (asked(a) !== asked(b)) return asked(b) - asked(a);

        const open = (item: typeof a) => (item.unexplained ? 1 : 0);
        if (open(a) !== open(b)) return open(b) - open(a);

        return (b.completedAt ?? 0) - (a.completedAt ?? 0);
      });
  }, [index, query, missingOnly, askedOnly]);

  if (!index || !summary) return null;

  return (
    <div className="glass-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-white">Check the evidence</h3>
        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
          Search any piece of work to see the photos and links attached to it — for example{' '}
          <span className="font-mono text-slate-300">physics electricity</span>.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Subject and topic, e.g. physics electricity"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-600"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setMissingOnly((prev) => !prev);
            setAskedOnly(false);
          }}
          className={`px-2.5 py-2 rounded-xl border text-[10px] font-bold whitespace-nowrap ${
            missingOnly
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          Missing only ({summary.missing})
        </button>

        <button
          type="button"
          onClick={() => {
            setAskedOnly((prev) => !prev);
            setMissingOnly(false);
          }}
          className={`px-2.5 py-2 rounded-xl border text-[10px] font-bold whitespace-nowrap ${
            askedOnly
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          Awaiting reply ({summary.awaitingReply})
        </button>
      </div>

      <p className="text-[11px] text-slate-400">
        <span className="font-bold text-white">
          {summary.withEvidence} of {summary.expected}
        </span>{' '}
        finished pieces of work have something attached.
        {/* The split matters more than the total. A gap somebody has already
            accounted for is finished business; only the unexplained ones are
            worth anybody's evening. */}
        {summary.missing > 0 && (
          <>
            {' '}
            <span className={summary.unexplained > 0 ? 'text-amber-300 font-bold' : ''}>
              {summary.unexplained} of the {summary.missing} without proof have nothing said about
              them
            </span>
            {summary.explained > 0 && <> · {summary.explained} explained</>}.
          </>
        )}
        {summary.awaitingReply > 0 && (
          <>
            {' '}
            <span className="text-rose-300 font-bold">
              {summary.awaitingReply} asked about and not answered.
            </span>
          </>
        )}
        {summary.savedWithoutLink > 0 && (
          <>
            {' '}
            {summary.savedWithoutLink} file{summary.savedWithoutLink === 1 ? ' is' : 's are'} in
            your Drive backup folder but have no link to open.
          </>
        )}
      </p>

      {results.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">
          {query
            ? `Nothing matches “${query}”. Every word has to appear, so try fewer.`
            : 'No work recorded yet.'}
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-96 overflow-y-auto">
          {results.slice(0, 40).map((item) => (
            <EvidenceRow
              key={`${item.entity}-${item.entityId}`}
              item={item}
              studentName={studentName}
              subjectName={subjects?.find((s) => s.id === item.subjectId)?.name}
              currentRole={currentRole}
            />
          ))}
        </ul>
      )}

      {results.length > 40 && (
        <p className="text-[10px] text-slate-500">
          Showing 40 of {results.length}. Add a word to narrow it.
        </p>
      )}
    </div>
  );
};

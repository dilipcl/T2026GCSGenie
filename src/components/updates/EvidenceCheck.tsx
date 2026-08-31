import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  EvidenceSubject,
  evidenceIndex,
  evidenceSummary,
  matches,
} from '../../services/evidenceService';
import { Search, Link as LinkIcon, Paperclip, AlertTriangle, CheckCircle2, Send } from 'lucide-react';
import { WhatsAppShare } from '../shared/WhatsAppShare';
import { evidenceMessage, messageContext } from '../../services/whatsappService';
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

const EvidenceRow: React.FC<{ item: EvidenceSubject; studentName: string; subjectName?: string }> = ({
  item,
  studentName,
  subjectName,
}) => {
  const [sharing, setSharing] = useState(false);

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
        <p className="text-[10px] text-slate-500">
          {item.entity}
          {item.subjectId ? ` · ${item.subjectId.replace(/_/g, ' ')}` : ''}
          {item.completed ? ' · done' : ' · not finished'}
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

        {item.missingEvidence && (
          <p className="text-[10px] text-amber-300 mt-1 leading-snug">
            Marked done with nothing attached — no photo, no link.
          </p>
        )}

        <button
          type="button"
          onClick={() => setSharing((prev) => !prev)}
          className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300"
        >
          <Send className="w-3 h-3" />
          {sharing ? 'Hide' : item.missingEvidence ? 'Ask for it on WhatsApp' : 'Share on WhatsApp'}
        </button>

        {sharing && (
          <div className="mt-1.5">
            <WhatsAppShare text={shareText} compact previewLabel="Show the message" />
          </div>
        )}
      </div>
    </div>
  </li>
  );
};

export const EvidenceCheck: React.FC = () => {
  const [query, setQuery] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);

  const index = useLiveQuery(() => evidenceIndex(), []);
  const summary = useLiveQuery(() => evidenceSummary(), []);
  const settings = useLiveQuery(() => db.parentSettings.get('active_settings'), []);
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);
  const { studentName } = messageContext(settings);

  const results = useMemo(() => {
    if (!index) return [];
    return index
      .filter((item) => (missingOnly ? item.missingEvidence : true))
      .filter((item) => matches(item, query))
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  }, [index, query, missingOnly]);

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
          onClick={() => setMissingOnly((prev) => !prev)}
          className={`px-2.5 py-2 rounded-xl border text-[10px] font-bold whitespace-nowrap ${
            missingOnly
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          Missing only ({summary.missing})
        </button>
      </div>

      <p className="text-[11px] text-slate-400">
        <span className="font-bold text-white">
          {summary.withEvidence} of {summary.expected}
        </span>{' '}
        finished pieces of work have something attached.
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

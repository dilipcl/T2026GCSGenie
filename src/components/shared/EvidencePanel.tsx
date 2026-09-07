import React, { useState } from 'react';
import {
  EVIDENCE_TARGETS,
  EvidenceEntity,
  isUsableLink,
  saveEvidenceLink,
} from '../../services/evidenceService';
import { addEvidenceNote } from '../../services/activityCommentService';
import { UserRole } from '../../types';
import { ProofUploader } from './ProofUploader';
import { Link as LinkIcon, MessageSquare, Check } from 'lucide-react';

/**
 * The one place evidence is added, wherever the question comes up.
 *
 * "How is evidence added?" turned out to have no answer for the most common
 * kind of work in the app. The Evidence tab could tell you a piece of homework
 * had been ticked off with nothing attached and then offer you exactly one
 * action: message somebody about it on WhatsApp. `ProofUploader` existed but
 * had never been pointed at a task, and no screen anywhere wrote the Drive link
 * field that the evidence check reads back. So the app asked a question it gave
 * you no way to answer, which is the worst kind of nag.
 *
 * Three answers, because there are three real ones and the third is the one
 * that was missing entirely. Photograph it. Paste the link to where it lives.
 * Or say why there is no proof - "it was classwork, the book is in school" is a
 * complete answer, and a system that will not accept it forces people to either
 * lie or leave the row open forever.
 *
 * Shared between the moment work is closed and the tab that audits it later, so
 * a piece of evidence lands in the same fields whichever door it came through.
 */

interface EvidencePanelProps {
  entity: EvidenceEntity;
  entityId: string;
  title: string;
  role: UserRole;
  /** The link the record already carries, so the field is not silently blank. */
  existingLink?: string;
  /** Called after anything is saved, so a host can re-read or close. */
  onSaved?: () => void;
  /** Hides the "no proof" note where the caller has its own place for one. */
  allowNote?: boolean;
  compact?: boolean;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  entity,
  entityId,
  title,
  role,
  existingLink,
  onSaved,
  allowNote = true,
  compact = false,
}) => {
  const target = EVIDENCE_TARGETS[entity];

  const [link, setLink] = useState(existingLink ?? '');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSaved, setLinkSaved] = useState(false);

  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const saveLink = async () => {
    const value = link.trim();
    if (value && !isUsableLink(value)) {
      setLinkError('That should start with https:// — paste the whole address.');
      return;
    }

    setBusy(true);
    setLinkError(null);
    try {
      await saveEvidenceLink(entity, entityId, value, role);
      setLinkSaved(true);
      onSaved?.();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not save that link.');
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    const value = note.trim();
    if (!value) return;

    setBusy(true);
    try {
      await addEvidenceNote({ entityId, title, text: value, authorRole: role });
      setNote('');
      setNoteSaved(true);
      onSaved?.();
    } catch (err) {
      console.error('Could not save that note:', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
      <ProofUploader
        ownerType={target.ownerType}
        ownerId={entityId}
        onChange={onSaved}
        label="Photo of the work"
        hint="A phone photo of the page is enough. It is shrunk on the way in."
      />

      <div>
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 uppercase mb-1.5">
          <LinkIcon className="w-3 h-3 text-indigo-400" />
          {target.linkLabel}
        </label>
        <div className="flex gap-1.5">
          <input
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setLinkSaved(false);
              setLinkError(null);
            }}
            placeholder="https://… Drive, OneNote, wherever it lives"
            className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={saveLink}
            disabled={busy || link.trim() === (existingLink ?? '')}
            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-[11px] font-bold whitespace-nowrap transition-colors"
          >
            {linkSaved ? 'Saved' : 'Save link'}
          </button>
        </div>
        {linkError && (
          <p className="text-[10px] text-rose-400 font-semibold mt-1" role="alert">
            {linkError}
          </p>
        )}
        {linkSaved && !linkError && (
          <p className="text-[10px] text-emerald-400 font-semibold mt-1 flex items-center gap-1">
            <Check className="w-3 h-3" /> Attached to “{title}”.
          </p>
        )}
      </div>

      {/* The third answer, and the one that never existed.

          Not every piece of work leaves something to attach. Marked verbally,
          done in an exercise book that stayed in school, a practical - all real,
          none of them a file. Without somewhere to say so, the only way to clear
          the row was to attach something that did not exist, so the list filled
          with rows nobody could ever act on. */}
      {allowNote && (
        <div>
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 uppercase mb-1.5">
            <MessageSquare className="w-3 h-3 text-slate-400" />
            Or say why there is nothing to attach
          </label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setNoteSaved(false);
              }}
              placeholder="Classwork — the book stayed in school"
              className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={saveNote}
              disabled={busy || !note.trim()}
              className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:hover:bg-slate-700 text-white text-[11px] font-bold whitespace-nowrap transition-colors"
            >
              Save note
            </button>
          </div>
          {noteSaved && (
            <p className="text-[10px] text-emerald-400 font-semibold mt-1 flex items-center gap-1">
              <Check className="w-3 h-3" /> Recorded. It stops being chased.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { db } from '../../db';
import { ProofAttachment } from '../../types';
import {
  ExtractionOutcome,
  InsightStatus,
  extractPending,
  insightStatus,
} from '../../services/materialInsightService';
import { liveProvider } from '../../services/llmClient';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { useFeedback } from '../shared/FeedbackProvider';
import { BookOpenCheck, Loader2, AlertTriangle, Check } from 'lucide-react';

/**
 * Letting a model read the photographs, once, with the parent saying so.
 *
 * Everything the app is meant to build from Tejas's work - a revision sheet, a
 * set of mock questions - needs the words on the page, and the pages are
 * photographs of handwriting. Reading them is the only step in the app that
 * sends his schoolwork somewhere else, and it is his schoolwork with his name on
 * it, so it is opt-in, it happens here rather than on his screen, and this panel
 * says plainly what leaves the device before anything does.
 *
 * Batched and capped rather than automatic. A background job that read every
 * new photo would be a standing charge nobody had agreed to, and restoring a
 * backup would silently re-read a term of material.
 */
export const MaterialReadingPanel: React.FC = () => {
  const { toast, confirm } = useFeedback();
  const [status, setStatus] = useState<InsightStatus | undefined>(undefined);
  const [outcome, setOutcome] = useState<ExtractionOutcome | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [providerNote, setProviderNote] = useState<string | undefined>(undefined);

  const reload = async () => {
    setStatus(await insightStatus());
    const settings = await db.parentSettings.get('active_settings');
    setProviderNote(settings ? liveProvider(settings).reason : undefined);
  };

  useEffect(() => {
    reload();
  }, []);

  /**
   * Which subject a photo sits under, so the model is told before it guesses.
   * Looked up per batch rather than per file - the owner tables are small and
   * one pass beats a query per photograph.
   */
  const subjectNamer = async (): Promise<(a: ProofAttachment) => string | undefined> => {
    const [tasks, topics, assessments] = await Promise.all([
      db.tasks.toArray(),
      db.syllabusTopics.toArray(),
      db.assessments.toArray(),
    ]);

    const subjectOf = new Map<string, string>();
    for (const t of tasks) if (t.subjectId) subjectOf.set(t.id, t.subjectId);
    for (const t of topics) subjectOf.set(t.id, t.subjectId);
    for (const a of assessments) subjectOf.set(a.id, a.subjectId);

    return (attachment) => {
      const id = attachment.topicId
        ? subjectOf.get(attachment.topicId)
        : subjectOf.get(attachment.ownerId);
      return INITIAL_SUBJECTS.find((s) => s.id === id)?.name;
    };
  };

  const run = async () => {
    const settings = await db.parentSettings.get('active_settings');
    if (!settings) return;

    const pending = status?.pending ?? 0;
    const ok = await confirm({
      title: `Send ${pending} photo${pending === 1 ? '' : 's'} to be read?`,
      body:
        'Each photograph is sent to the AI provider set in AI Audit Settings, along with the ' +
        'subject it is filed under. Nothing else about Tejas goes with it. The text that comes ' +
        'back is stored in the app and syncs to his devices; the photographs themselves are not ' +
        'kept by the provider. Each file is read once.',
      confirmLabel: 'Read them',
    });
    if (!ok) return;

    setBusy(true);
    try {
      const result = await extractPending(settings, 20, await subjectNamer());
      setOutcome(result);
      await reload();

      if (result.read > 0) toast.success(`Read ${result.read} of ${result.attempted}`);
      else if (result.errors.length) toast.error('Nothing was read', result.errors[0]);
    } catch (err) {
      console.error('The reading batch did not complete:', err);
      toast.error('Could not read the material', 'Nothing was lost - try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  const nothingToDo = status.pending === 0;

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <BookOpenCheck className="w-4 h-4 text-fuchsia-400" />
        <h3 className="font-bold text-sm text-white">Read the material</h3>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
        Genie can show you Tejas's photographs but cannot read them. Having them read once turns a
        pile of pictures into text the app can build revision sheets and mock questions from later.
        It is the only thing in the app that sends his work anywhere.
      </p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Photos', value: status.images },
          { label: 'Read', value: status.read },
          { label: 'Waiting', value: status.pending },
        ].map((cell) => (
          <div
            key={cell.label}
            className="rounded-xl bg-slate-900/70 border border-slate-800 px-3 py-2"
          >
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{cell.label}</p>
            <p className="text-base font-bold text-white">{cell.value}</p>
          </div>
        ))}
      </div>

      {status.unreadable > 0 && (
        <p className="text-[10px] text-amber-300 mb-2 flex items-start gap-1 leading-snug">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-px" />
          <span>
            {status.unreadable} could not be read — too faint or blurred. They are still proof;
            Genie just cannot build questions from them. A clearer photo would fix it.
          </span>
        </p>
      )}

      {providerNote && (
        <p className="text-[10px] text-amber-300 mb-2 leading-snug">
          {providerNote} Reading runs only on the device holding the key — the results sync
          everywhere.
        </p>
      )}

      <button
        type="button"
        onClick={run}
        disabled={busy || nothingToDo || !!providerNote}
        className="w-full px-3 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-40 disabled:hover:bg-fuchsia-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"
      >
        {busy ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Reading…</span>
          </>
        ) : nothingToDo ? (
          <>
            <Check className="w-3.5 h-3.5" />
            <span>Everything has been read</span>
          </>
        ) : (
          <span>Read {Math.min(status.pending, 20)} waiting</span>
        )}
      </button>

      {/* Twenty at a time. Every item costs money, and a restored backup should
          not quietly re-read a term of photographs. */}
      {status.pending > 20 && (
        <p className="text-[10px] text-slate-500 mt-1.5">
          Twenty at a time, so the bill stays something you chose. {status.pending - 20} will be
          left after this run.
        </p>
      )}

      {outcome && (
        <div className="mt-3 pt-3 border-t border-slate-800 text-[10px] text-slate-400 leading-snug">
          <p>
            Read {outcome.read} of {outcome.attempted}
            {outcome.unreadable > 0 && ` · ${outcome.unreadable} unreadable`}
            {outcome.failed > 0 && ` · ${outcome.failed} failed`}.
          </p>
          {outcome.errors.map((error) => (
            <p key={error} className="text-rose-300 mt-0.5">
              {error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

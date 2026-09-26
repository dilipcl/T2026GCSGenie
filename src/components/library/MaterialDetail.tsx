import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MaterialInsight, ProofAttachment, SyllabusTopic, UserRole } from '../../types';
import { Material } from '../../services/materialLibrary';
import {
  captionAttachment,
  getAttachment,
  tagAttachmentToTopic,
} from '../../services/attachmentService';
import { tagOccurrenceToTopic } from '../../services/checkInOccurrenceService';
import { insightFor } from '../../services/materialInsightService';
import { MaterialViewer } from '../shared/MaterialViewer';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { useFeedback } from '../shared/FeedbackProvider';
import { formatShortDate } from '../../utils/date';
import { X, Tag, Check, Maximize2, ExternalLink, BookOpenCheck, EyeOff } from 'lucide-react';

/**
 * One piece of material, and the two things that can be said about it.
 *
 * Opening it is the obvious half. The half that matters for everything after
 * this is the tagging: a photograph attached to a task knows which homework it
 * proves and nothing about what it is *of*, so a term of captured work is
 * unsearchable by the only question anybody actually asks of it - "what have we
 * got on bonding?". Nothing can be built out of an untagged pile, and saying so
 * once, here, where the photo is already open, is far likelier to get done than
 * a tidying screen nobody visits.
 *
 * A caption for the same reason at a smaller scale: `IMG_4821.jpg` off a phone
 * camera is no help to anyone six weeks later.
 *
 * Portalled, like `MaterialViewer` and for the same reason - it is opened from
 * inside a `.glass-card`, whose `backdrop-filter` makes it the containing block
 * for anything `fixed` underneath it.
 */
/**
 * What a model read off the page, shown beside the page itself.
 *
 * Deliberately labelled as a reading rather than presented as fact. It is a
 * machine's transcription of a fourteen-year-old's handwriting, and a parent
 * looking at a list of "key facts" needs to know whether they are looking at
 * what Tejas wrote or at what a model thinks he meant. The unreadable case gets
 * the most space, because an empty answer with a reason is the outcome most
 * likely to be mistaken for a bug.
 */
const ReadMaterial: React.FC<{ insight: MaterialInsight }> = ({ insight }) => {
  if (insight.legibility === 'UNREADABLE') {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
          <EyeOff className="w-3.5 h-3.5" />
          <span>Could not be read</span>
        </p>
        <p className="text-[10px] text-amber-200/80 mt-1 leading-snug">
          {insight.unreadableNote ||
            'The handwriting was too faint or blurred to make out.'}{' '}
          It is still proof that the work was done — Genie just cannot build questions from it. A
          clearer photo would fix that.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 space-y-2">
      <p className="text-[10px] font-bold text-fuchsia-300 uppercase flex items-center gap-1.5">
        <BookOpenCheck className="w-3 h-3" />
        <span>What is on the page</span>
      </p>

      {insight.legibility === 'PARTIAL' && (
        <p className="text-[10px] text-amber-300/90 leading-snug">
          Only partly legible{insight.unreadableNote ? ` — ${insight.unreadableNote}` : ''}.
        </p>
      )}

      {insight.definitions.length > 0 && (
        <ul className="space-y-0.5">
          {insight.definitions.map((entry) => (
            <li key={entry.term} className="text-[11px] text-slate-200 leading-snug">
              <span className="font-bold text-white">{entry.term}</span> — {entry.meaning}
            </li>
          ))}
        </ul>
      )}

      {insight.keyFacts.length > 0 && (
        <ul className="space-y-0.5 list-disc list-inside">
          {insight.keyFacts.map((fact) => (
            <li key={fact} className="text-[11px] text-slate-200 leading-snug">
              {fact}
            </li>
          ))}
        </ul>
      )}

      {insight.workedExamples.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Worked examples</p>
          <ul className="space-y-0.5">
            {insight.workedExamples.map((example) => (
              <li key={example} className="text-[11px] text-slate-300 leading-snug">
                {example}
              </li>
            ))}
          </ul>
        </div>
      )}

      {insight.specPoints.length > 0 && (
        <p className="text-[10px] text-slate-500">Spec: {insight.specPoints.join(' · ')}</p>
      )}

      <p className="text-[10px] text-slate-600">
        Read by {insight.model}. This is a transcription of the photo, not a check of whether it is
        right.
      </p>
    </div>
  );
};

export const MaterialDetail: React.FC<{
  material: Material;
  topics: SyllabusTopic[];
  role: UserRole;
  onClose: () => void;
  onChanged?: () => void;
}> = ({ material, topics, role, onClose, onChanged }) => {
  const { toast } = useFeedback();
  const [attachment, setAttachment] = useState<ProofAttachment | undefined>(undefined);
  const [insight, setInsight] = useState<MaterialInsight | undefined>(undefined);
  const [viewing, setViewing] = useState(false);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);

  useEscapeToClose(!viewing, onClose);

  const attachmentId = material.ref?.attachmentId;

  useEffect(() => {
    let cancelled = false;
    if (!attachmentId) {
      setAttachment(undefined);
      return;
    }

    getAttachment(attachmentId).then((row) => {
      if (cancelled) return;
      setAttachment(row);
      setCaption(row?.caption ?? '');
    });

    insightFor(attachmentId).then((row) => {
      if (!cancelled) setInsight(row);
    });

    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  /**
   * Which topics can be offered.
   *
   * Narrowed to the subject when the material has one, because a picker listing
   * every topic in nine subjects is one nobody scrolls to the end of. When the
   * subject is unknown - a check-in with no subject on it - the full list is
   * better than nothing.
   */
  const choices = material.subjectId
    ? topics.filter((t) => t.subjectId === material.subjectId)
    : topics;

  /**
   * Where a tag can be stored. A file has a field; a lesson note has a field.
   * A link lives on the record it is a field of, and there is nowhere to put a
   * topic without inventing one - so the panel says so rather than offering a
   * control that would quietly do nothing.
   */
  const taggable =
    (material.kind === 'FILE' || material.kind === 'PAPER') && !!attachmentId
      ? 'FILE'
      : material.kind === 'NOTE' && material.owner.entity === 'Lesson'
        ? 'LESSON'
        : undefined;

  const applyTag = async (topicId: string | undefined) => {
    if (!taggable || saving) return;
    setSaving(true);
    try {
      if (taggable === 'FILE' && attachmentId) {
        await tagAttachmentToTopic(attachmentId, topicId, role);
      } else if (taggable === 'LESSON') {
        await tagOccurrenceToTopic(material.owner.id, topicId, role);
      }
      toast.success(topicId ? 'Tagged' : 'Tag removed');
      onChanged?.();
    } catch (err) {
      console.error('Could not tag that material:', err);
      toast.error('Could not save that tag', 'Nothing was lost - try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveCaption = async () => {
    if (!attachmentId || saving) return;
    if (caption.trim() === (attachment?.caption ?? '').trim()) return;

    setSaving(true);
    try {
      await captionAttachment(attachmentId, caption, role);
      toast.success('Saved');
      onChanged?.();
    } catch (err) {
      console.error('Could not save that caption:', err);
      toast.error('Could not save that', 'Nothing was lost - try again.');
    } finally {
      setSaving(false);
    }
  };

  const tagged = topics.find((t) => t.id === material.topicId);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[68] bg-slate-950/85 flex items-end sm:items-center justify-center p-3"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={material.title}
      >
        <div
          className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2 px-4 py-3 border-b border-slate-800 sticky top-0 bg-slate-900">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white break-words">{material.title}</p>
              <p className="text-[10px] text-slate-500">
                {formatShortDate(material.capturedOn)} · {material.owner.entity.toLowerCase()} ·{' '}
                {material.owner.title}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {material.excerpt && (
              <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                {material.excerpt}
              </p>
            )}

            {attachment && (
              <button
                type="button"
                onClick={() => setViewing(true)}
                className="w-full px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Open the file</span>
              </button>
            )}

            {insight && <ReadMaterial insight={insight} />}

            {material.kind === 'LINK' && material.ref?.url && (
              <a
                href={material.ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open the link</span>
              </a>
            )}

            {attachmentId && (
              <div>
                <label
                  htmlFor={`caption-${material.id}`}
                  className="block text-[10px] font-bold text-slate-300 uppercase mb-1"
                >
                  What is it?
                </label>
                <div className="flex gap-1.5">
                  <input
                    id={`caption-${material.id}`}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    onBlur={saveCaption}
                    onKeyDown={(e) => {
                      // Blur alone is not enough on a phone, where the
                      // keyboard's "go" often moves focus nowhere.
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveCaption();
                      }
                    }}
                    placeholder="Crude oil notes — fractionating column"
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-slate-600"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  A filename off a camera says nothing. One line here is what the library shows
                  instead.
                </p>
              </div>
            )}

            <div>
              <p className="text-[10px] font-bold text-slate-300 uppercase mb-1 flex items-center gap-1">
                <Tag className="w-3 h-3 text-teal-400" />
                <span>What is it about?</span>
              </p>

              {!taggable ? (
                <p className="text-[10px] text-slate-500 leading-snug">
                  A link lives on the record that carries it, so it is already filed with{' '}
                  {material.owner.title}. Photos and lesson notes are the ones worth tagging.
                </p>
              ) : choices.length === 0 ? (
                <p className="text-[10px] text-slate-500 leading-snug">
                  No syllabus topics for this subject yet. Add one under Subjects &amp; Goals and
                  it will show up here.
                </p>
              ) : (
                <>
                  <select
                    value={material.topicId ?? ''}
                    onChange={(e) => applyTag(e.target.value || undefined)}
                    disabled={saving}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white disabled:opacity-50"
                  >
                    <option value="">Not tagged yet</option>
                    {choices.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.unit} — {topic.title}
                      </option>
                    ))}
                  </select>

                  <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                    {tagged ? (
                      <span className="text-emerald-300 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Filed under {tagged.unit}.
                      </span>
                    ) : (
                      <>
                        Untagged material counts towards nothing and cannot be revised from. One
                        tap fixes it.
                        {insight?.suggestedTopicTitle && (
                          <span className="block mt-0.5 text-slate-400">
                            Reading it suggested: “{insight.suggestedTopicTitle}”.
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {viewing && attachment && (
        <MaterialViewer attachment={attachment} onClose={() => setViewing(false)} />
      )}
    </>,
    document.body
  );
};

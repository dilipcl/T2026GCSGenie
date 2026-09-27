import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { wrapUpFocusBlock } from '../../services/focusSessionService';
import { closeTask } from '../../services/taskCompletionService';
import { ProofUploader } from '../shared/ProofUploader';
import { TaskCloseModal } from '../tasks/TaskCloseModal';
import { useFeedback } from '../shared/FeedbackProvider';
import { triggerCelebration } from '../../utils/confetti';
import { CheckCircle2, NotebookPen } from 'lucide-react';

/**
 * Thirty seconds about the block that just finished, asked during the break.
 *
 * This is where the detail the evening check-in used to ask for now lives: the
 * work is still on the desk, the page is still open, and the break is five
 * minutes that are going to pass anyway. Every field is optional and the block
 * is already logged - "Skip" loses the detail, never the minutes.
 *
 * The photo attaches to the topic when there is one, because "what do we have
 * on bonding" is the question the Library answers; to the work otherwise, so
 * it still counts as that work's proof.
 */

const CONFIDENCE: Array<{ value: 1 | 2 | 3 | 4 | 5; label: string }> = [
  { value: 1, label: 'Lost' },
  { value: 2, label: 'Shaky' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Solid' },
];

interface FocusWrapUpProps {
  checkInId: string;
  onDone: () => void;
}

export const FocusWrapUp: React.FC<FocusWrapUpProps> = ({ checkInId, onDone }) => {
  const { toast } = useFeedback();
  const block = useLiveQuery(() => db.checkIns.get(checkInId), [checkInId]);
  const subjectId = block?.studySubjectId;

  const topics = useLiveQuery(
    async () =>
      subjectId
        ? (await db.syllabusTopics.where('subjectId').equals(subjectId).toArray()).sort(
            (a, b) => a.unit.localeCompare(b.unit) || a.title.localeCompare(b.title)
          )
        : [],
    [subjectId],
    []
  );
  const task = useLiveQuery(
    async () => (block?.taskId ? db.tasks.get(block.taskId) : undefined),
    [block?.taskId]
  );

  const [topicId, setTopicId] = useState('');
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | 5 | undefined>(undefined);
  const [note, setNote] = useState('');
  const [question, setQuestion] = useState('');
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Start from what the block was begun on, once it has loaded.
  useEffect(() => {
    if (block?.topicId) setTopicId(block.topicId);
  }, [block?.id, block?.topicId]);

  const topic = topics.find((t) => t.id === topicId);

  const save = async () => {
    setSaving(true);
    try {
      await wrapUpFocusBlock(checkInId, {
        topicId: topicId || undefined,
        note,
        question,
        confidence,
      });
      toast.success(
        'Noted',
        question.trim() ? 'Your question is on tomorrow’s list.' : 'It is in the Library under this topic.'
      );
      onDone();
    } finally {
      setSaving(false);
    }
  };

  if (!block) return null;

  return (
    <div className="mt-4 p-3.5 rounded-2xl bg-slate-900/70 border border-teal-500/30 space-y-3">
      <div className="flex items-center gap-2">
        <NotebookPen className="w-4 h-4 text-teal-300" />
        <p className="text-xs font-bold text-teal-100">While you rest - what was that block?</p>
        <span className="text-[10px] text-slate-500">all optional</span>
      </div>

      {subjectId && (
        <div className="space-y-1.5">
          <select
            value={topicId}
            onChange={(e) => {
              setTopicId(e.target.value);
              setConfidence(undefined);
            }}
            aria-label="Topic this block covered"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white"
          >
            <option value="">Which topic? (optional)</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.unit} · {t.title}
              </option>
            ))}
          </select>

          {topic && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-slate-400 mr-1">How sure are you now?</span>
              {CONFIDENCE.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setConfidence(c.value)}
                  aria-pressed={confidence === c.value}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    confidence === c.value
                      ? 'bg-teal-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="One line on what you covered"
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500"
      />
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Anything to ask the teacher? It goes on tomorrow’s list."
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500"
      />

      {(topic || task) && (
        <ProofUploader
          ownerType={topic ? 'TOPIC' : 'TASK'}
          ownerId={topic ? topic.id : task!.id}
          label="Photo of the page"
          hint={
            topic
              ? `Filed under ${topic.title}.`
              : `Attached to "${task!.title}" as its proof.`
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-[11px] font-bold"
        >
          Save
        </button>
        {task && !task.completed && (
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[11px] font-bold"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Finished “{task.title.length > 28 ? task.title.slice(0, 28) + '…' : task.title}”?
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-2 rounded-xl text-slate-400 hover:text-slate-200 text-[11px]"
        >
          Skip - the time is already logged
        </button>
      </div>

      {/* Portalled: this card is a .glass-card, whose backdrop-filter makes it
          the containing block for anything position: fixed inside it. The
          close sheet would open as a letterbox the size of the card. */}
      {closing &&
        task &&
        createPortal(
          <TaskCloseModal
            task={task}
            role="STUDENT"
            onCancel={() => setClosing(false)}
            onConfirm={async (hadEvidence) => {
              setClosing(false);
              await closeTask(task, 'STUDENT', hadEvidence);
              triggerCelebration({ particleCount: 50 });
              toast.success(`+${task.xpValue} XP`, hadEvidence ? 'Done, with the proof attached.' : 'Done.');
            }}
          />,
          document.body
        )}
    </div>
  );
};

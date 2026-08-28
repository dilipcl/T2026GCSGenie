import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { RemediationAction, SubjectId } from '../../types';
import { logAuditEvent, logFieldChanges } from '../../services/auditService';
import { useFeedback } from '../shared/FeedbackProvider';
import { newId } from '../../utils/id';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { X, Wrench, Save } from 'lucide-react';

interface RemediationEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Omitted when writing a new fix-up. */
  quest?: RemediationAction | null;
}

const DEFAULT_XP = 75;

/**
 * Writing a fix-up by hand, and correcting one that already exists.
 *
 * Every quest came from seedData - the Year 9 papers, transcribed once. That
 * covered the launch and nothing after it: a mock in November produces exactly
 * the same kind of dropped mark and there was no way to record it, and a
 * mistyped deficit could not be corrected without losing the quest.
 */
export const RemediationEditorModal: React.FC<RemediationEditorModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  quest,
}) => {
  const { toast } = useFeedback();
  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);

  const [subjectId, setSubjectId] = useState<SubjectId | ''>('');
  const [sourceDoc, setSourceDoc] = useState('');
  const [diagnosticError, setDiagnosticError] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskInstructions, setTaskInstructions] = useState('');
  const [formulaOrHint, setFormulaOrHint] = useState('');
  const [xpReward, setXpReward] = useState(DEFAULT_XP);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setBusy(false);
    setSubjectId(quest?.subjectId ?? '');
    setSourceDoc(quest?.sourceDoc ?? '');
    setDiagnosticError(quest?.diagnosticError ?? '');
    setTaskTitle(quest?.taskTitle ?? '');
    setTaskInstructions(quest?.taskInstructions ?? '');
    setFormulaOrHint(quest?.formulaOrHint ?? '');
    setXpReward(quest?.xpReward ?? DEFAULT_XP);
  }, [isOpen, quest]);

  // Escape closes, like every other dialog in the app. Must sit above the
  // early return - a hook cannot be called conditionally.
  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  const canSave = !!subjectId && taskTitle.trim().length > 0 && diagnosticError.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || busy) return;
    setBusy(true);

    try {
      const fields = {
        subjectId: subjectId as SubjectId,
        sourceDoc: sourceDoc.trim() || 'Added by hand',
        diagnosticError: diagnosticError.trim(),
        taskTitle: taskTitle.trim(),
        taskInstructions: taskInstructions.trim(),
        formulaOrHint: formulaOrHint.trim() || undefined,
        xpReward: Math.max(0, Math.round(xpReward)),
      };

      if (quest) {
        await db.remediations.update(quest.id, fields);
        await logFieldChanges({
          user: 'PARENT',
          entity: 'RemediationAction',
          entityId: quest.id,
          before: quest as unknown as Record<string, unknown>,
          after: fields as unknown as Record<string, unknown>,
          labels: {
            sourceDoc: 'source',
            diagnosticError: 'deficit',
            taskTitle: 'quest title',
            taskInstructions: 'instructions',
            formulaOrHint: 'hint',
            xpReward: 'XP reward',
          },
        });
        toast.success('Fix-up updated', fields.taskTitle);
      } else {
        const created: RemediationAction = {
          id: newId('rem'),
          ...fields,
          isCompleted: false,
        };
        await db.remediations.add(created);
        await logAuditEvent({
          user: 'PARENT',
          action: 'INSERT',
          entity: 'RemediationAction',
          entityId: created.id,
          newValue: `${created.taskTitle} (${created.subjectId}, +${created.xpReward} XP)`,
        });
        toast.success('Fix-up added', `${fields.taskTitle} · +${fields.xpReward} XP`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Could not save fix-up:', err);
      toast.error('Could not save that fix-up', 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={quest ? 'Edit fix-up' : 'Add a fix-up'}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-lg bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 pb-nav-safe shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {quest ? 'Edit fix-up' : 'Add a fix-up'}
              </h2>
              <p className="text-[11px] text-slate-400">
                A dropped mark, turned into something short enough to actually do.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="fixup-subject"
                className="block text-[11px] font-bold text-slate-300 uppercase mb-1"
              >
                Subject
              </label>
              <select
                id="fixup-subject"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value as SubjectId | '')}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              >
                <option value="">Pick one</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="fixup-xp"
                className="block text-[11px] font-bold text-slate-300 uppercase mb-1"
              >
                XP reward
              </label>
              <input
                id="fixup-xp"
                type="number"
                min="0"
                step="5"
                value={xpReward}
                onChange={(e) => setXpReward(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="fixup-source"
              className="block text-[11px] font-bold text-slate-300 uppercase mb-1"
            >
              Where it came from
            </label>
            <input
              id="fixup-source"
              type="text"
              placeholder="e.g. Nov mock paper 2 (Score: 52/80)"
              value={sourceDoc}
              onChange={(e) => setSourceDoc(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white placeholder-slate-500"
            />
          </div>

          <div>
            <label
              htmlFor="fixup-deficit"
              className="block text-[11px] font-bold text-slate-300 uppercase mb-1"
            >
              What went wrong
            </label>
            <textarea
              id="fixup-deficit"
              rows={2}
              placeholder="e.g. Lost 6 marks on rearranging formulae with a negative coefficient"
              value={diagnosticError}
              onChange={(e) => setDiagnosticError(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white placeholder-slate-500"
            />
          </div>

          <div>
            <label
              htmlFor="fixup-title"
              className="block text-[11px] font-bold text-slate-300 uppercase mb-1"
            >
              Quest title
            </label>
            <input
              id="fixup-title"
              type="text"
              placeholder="e.g. Ten rearrangement questions, negatives only"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white placeholder-slate-500"
            />
          </div>

          <div>
            <label
              htmlFor="fixup-instructions"
              className="block text-[11px] font-bold text-slate-300 uppercase mb-1"
            >
              What to actually do
            </label>
            <textarea
              id="fixup-instructions"
              rows={3}
              placeholder="Name the exercise, the page, the file - anywhere the real work lives."
              value={taskInstructions}
              onChange={(e) => setTaskInstructions(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white placeholder-slate-500"
            />
          </div>

          <div>
            <label
              htmlFor="fixup-hint"
              className="block text-[11px] font-bold text-slate-300 uppercase mb-1"
            >
              Formula or hint (optional)
            </label>
            <input
              id="fixup-hint"
              type="text"
              value={formulaOrHint}
              onChange={(e) => setFormulaOrHint(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!canSave || busy}
            className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>{busy ? 'Saving...' : quest ? 'Save changes' : 'Add this fix-up'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Task } from '../../types';
import { db } from '../../db';
import { getAttachmentsFor } from '../../services/attachmentService';
import { EvidencePanel } from '../shared/EvidencePanel';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { formatShortDate } from '../../utils/date';
import { UserRole } from '../../types';
import { X, CheckCircle2, AlertTriangle, Wrench, Paperclip } from 'lucide-react';

/**
 * Closing a piece of work, with the proof of it, in one step.
 *
 * Two problems met here. The first is Tejas's: a task could be closed with one
 * tap of a circle in a scrolling list, which is indistinguishable from a thumb
 * catching it on the way past - and the whole XP and week-execution model rests
 * on that tick meaning something. The second is that the Evidence tab has
 * always been able to say a piece of homework was marked done with nothing
 * attached, and there was no screen anywhere that could attach anything to a
 * task.
 *
 * Solving them separately would have produced two dialogs in a row - confirm
 * the tick, then be asked for a photo - and nobody would use the second one. So
 * the confirmation *is* the evidence step: the moment the work is finished is
 * the only moment the photo is actually to hand.
 *
 * It never blocks. "Mark it done anyway" is always there, and says plainly what
 * it costs - the row shows up under Evidence until somebody attaches something
 * or explains why there is nothing. Refusing to close the work would send it
 * somewhere the app cannot see, which is the failure this is trying to avoid,
 * not cause.
 */

/**
 * How long the primary button refuses input, matching `ChangeGuardProvider`.
 * A double-tap that opened the sheet must not also accept it - which is the
 * exact accident a confirm step is otherwise powerless against.
 */
const ARM_DELAY_MS = 300;

interface TaskCloseModalProps {
  task: Task;
  role: UserRole;
  onCancel: () => void;
  /** Marks it done. The modal has already taken care of the evidence. */
  onConfirm: (hadEvidence: boolean) => Promise<void>;
}

export const TaskCloseModal: React.FC<TaskCloseModalProps> = ({
  task,
  role,
  onCancel,
  onConfirm,
}) => {
  const [isArmed, setIsArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEscapeToClose(true, onCancel);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsArmed(true);
      confirmRef.current?.focus();
    }, ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  /**
   * Read live rather than passed in, so attaching a photo inside this sheet
   * changes the button underneath it. A dialog that still says "anyway" after
   * you have just added the photo it asked for reads as broken.
   */
  const files = useLiveQuery(() => getAttachmentsFor('TASK', task.id), [task.id], []);
  const current = useLiveQuery(() => db.tasks.get(task.id), [task.id]);
  const linkUrl = current?.driveProofUrl;

  const hasEvidence = files.length > 0 || !!linkUrl?.trim();

  const notes = useLiveQuery(
    async () =>
      (await db.activityComments.toArray()).filter(
        (c) => c.kind === 'EVIDENCE_NOTE' && c.subjectEntityId === task.id
      ),
    [task.id],
    []
  );

  const explained = notes.length > 0;

  const kind = useMemo(
    () => (task.isRemediation ? 'Fix-up' : task.isHomework ? 'Homework' : 'Task'),
    [task]
  );

  const finish = async () => {
    if (!isArmed || busy) return;
    setBusy(true);
    try {
      await onConfirm(hasEvidence);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-task-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-slate-900 border border-slate-700/80 sm:rounded-2xl rounded-t-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="close-task-title" className="text-base font-bold text-white leading-snug">
              Finished “{task.title}”?
            </h2>
            <p className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="inline-flex items-center gap-1">
                {task.isRemediation && <Wrench className="w-3 h-3 text-amber-400" />}
                {kind}
              </span>
              <span>· {task.subjectId.replace(/_/g, ' ')}</span>
              {/* A plain calendar date. `formatFriendlyDate` answers "how
                  soon?" and returns phrases like "Overdue by 11 days", which
                  after the word "due" reads as gibberish. */}
              <span>· due {formatShortDate(task.dueDate)}</span>
              <span className="text-amber-300 font-bold">· +{task.xpValue} XP</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div
            className={`rounded-xl border p-3 flex items-start gap-2 ${
              hasEvidence
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : explained
                ? 'bg-slate-800/60 border-slate-700'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}
          >
            {hasEvidence ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            )}
            <p className="text-[11px] leading-snug text-slate-200">
              {hasEvidence ? (
                <>
                  <span className="font-bold text-emerald-200">
                    {files.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="w-3 h-3" />
                        {files.length} file{files.length === 1 ? '' : 's'}
                      </span>
                    )}
                    {files.length > 0 && linkUrl ? ' and a link' : linkUrl ? 'A link' : ''}
                  </span>{' '}
                  attached. This will not show up as missing evidence.
                </>
              ) : explained ? (
                <>
                  No proof attached, but you have said why:{' '}
                  <span className="text-slate-300 italic">“{notes[0].text}”</span>
                </>
              ) : (
                <>
                  Nothing is attached yet. Add it now while it is in front of you — a photo of the
                  page, or the link to where the work lives. You can close it without, and it will
                  sit under <span className="font-bold">Updates → Evidence</span> until somebody
                  deals with it.
                </>
              )}
            </p>
          </div>

          {/* 'Task' even for a fix-up: a fix-up raised from a paper is a row in
              `tasks` with a flag, not a row in `remediations`, and pointing the
              panel at the wrong table would write the link somewhere the
              evidence check never reads back. */}
          <EvidencePanel
            entity="Task"
            entityId={task.id}
            title={task.title}
            role={role}
            existingLink={linkUrl}
          />
        </div>

        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-5 py-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
          >
            Not yet
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={finish}
            disabled={!isArmed || busy}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            {busy
              ? 'Saving…'
              : hasEvidence || explained
              ? `Mark it done · +${task.xpValue} XP`
              : 'Mark it done anyway'}
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Task } from '../../types';
import { AmendmentPlan } from '../../services/planBaselineService';
import { taskHours } from '../../services/planService';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { formatFriendlyDate } from '../../utils/date';
import { ArrowLeftRight, X, AlertTriangle, Plus } from 'lucide-react';

interface Props {
  task: Task | null;
  plan?: AmendmentPlan;
  onCancel: () => void;
  onConfirm: (displaced: Task | undefined, reason: string) => Promise<void>;
}

/**
 * Bringing work into a week that has already been agreed.
 *
 * Before the baseline, pulling something in is one tap and this never appears.
 * After it, the question is not "may I add this" - the answer is always yes,
 * because school does not check the plan before setting homework - but "what
 * gives". A week that only ever grows is the same over-promising the baseline
 * existed to stop, arrived at one reasonable addition at a time.
 *
 * So the swap is offered first and the trade is priced in hours, and adding on
 * top stays available with a reason attached. Refusing outright would only send
 * the work somewhere the app cannot see it, which is worse than recording an
 * honest overrun.
 */
export const BringIntoWeekModal: React.FC<Props> = ({ task, plan, onCancel, onConfirm }) => {
  const [displacedId, setDisplacedId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEscapeToClose(!!task, onCancel);

  if (!task || !plan) return null;

  const displaced = plan.swapCandidates.find((t) => t.id === displacedId);
  const netHours =
    Math.round((plan.hoursAdded - (displaced ? taskHours(displaced) : 0)) * 10) / 10;
  const hoursAfter = Math.round((plan.hoursAfter - (displaced ? taskHours(displaced) : 0)) * 10) / 10;
  const stillOver = hoursAfter > plan.safeStudyHours;

  // Adding on top of an agreed week is the thing worth a sentence. A swap
  // explains itself: the hours did not move.
  const needsReason = !displaced;
  const canConfirm = !needsReason || reason.trim().length > 0;

  const confirm = async () => {
    if (saving || !canConfirm) return;
    setSaving(true);
    try {
      await onConfirm(displaced, reason.trim());
      setDisplacedId('');
      setReason('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bring work into this week"
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full sm:max-w-md p-5 shadow-2xl relative max-h-[85vh] overflow-y-auto"
      >
        <button
          onClick={onCancel}
          aria-label="Cancel"
          className="absolute top-3.5 right-3.5 p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 mb-4 pr-6">
          <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex-shrink-0">
            <ArrowLeftRight className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white">This week is already agreed</h2>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              Adding <strong className="text-slate-200">“{task.title}”</strong> puts{' '}
              {plan.hoursAdded}h on a week that was signed off. Take something out to make room,
              or add it on top and say why.
            </p>
          </div>
        </div>

        <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
          Move something out to make room
        </label>
        <div className="space-y-1.5">
          <button
            onClick={() => setDisplacedId('')}
            className={`w-full text-left px-3 py-2 rounded-xl border text-[11px] transition-colors ${
              displacedId === ''
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-100'
                : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-1.5 font-semibold">
              <Plus className="w-3 h-3" />
              Nothing — add it on top
            </span>
            <span className="block text-[10px] text-slate-400 mt-0.5">
              The week grows by {plan.hoursAdded}h. Recorded as a change.
            </span>
          </button>

          {plan.swapCandidates.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic px-1 py-1">
              Nothing else is committed, so there is nothing to swap.
            </p>
          ) : (
            plan.swapCandidates.map((candidate) => (
              <button
                key={candidate.id}
                onClick={() => setDisplacedId(candidate.id)}
                className={`w-full text-left px-3 py-2 rounded-xl border text-[11px] transition-colors ${
                  displacedId === candidate.id
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-100'
                    : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span className="block font-semibold truncate">{candidate.title}</span>
                <span className="block text-[10px] text-slate-400 mt-0.5">
                  {formatFriendlyDate(candidate.dueDate)} · {taskHours(candidate)}h — moves to next
                  week
                </span>
              </button>
            ))
          )}
        </div>

        {/* The arithmetic, stated. The whole mechanism is the trade being
            visible at the moment it is made. */}
        <div className="mt-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">This week after the change</span>
            <span className={`font-bold ${stillOver ? 'text-rose-300' : 'text-emerald-300'}`}>
              {hoursAfter}h of {plan.safeStudyHours}h
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-slate-500">Net</span>
            <span className={netHours > 0 ? 'text-amber-300' : 'text-emerald-300'}>
              {netHours >= 0 ? '+' : ''}
              {netHours}h
            </span>
          </div>
        </div>

        {stillOver && (
          <div className="mt-2.5 p-2.5 bg-rose-950/40 border border-rose-500/40 rounded-xl text-[11px] text-rose-100 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>
              That still puts the week over the time you actually have. It is allowed — it is just
              on the record.
            </span>
          </div>
        )}

        <label className="block text-[11px] font-bold text-slate-300 mt-3 mb-1.5">
          {needsReason ? 'Why is this going on top?' : 'Anything to add? (optional)'}
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Cover lesson set new homework, due Friday"
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={confirm}
            disabled={!canConfirm || saving}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all"
          >
            {saving ? 'Saving…' : displaced ? 'Swap them over' : 'Add it on top'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

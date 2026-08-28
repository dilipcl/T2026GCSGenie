import React, { useEffect, useState } from 'react';
import { Task } from '../../types';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { X } from 'lucide-react';

interface DeferReasonModalProps {
  task: Task | null;
  onCancel: () => void;
  /** '' means moved without a reason, which is a perfectly good answer. */
  onConfirm: (reason: string) => void;
}

/**
 * Why a promise is being moved out of the week.
 *
 * The planner's whole stance is that deferring is "planning, not failing", so
 * this cannot become a gate. The reason is optional, one tap, and skipping it
 * moves the task exactly as before - the button that does nothing but move it
 * is as prominent as the ones that explain.
 *
 * What it buys is the Sunday review: "three of six done" is an argument
 * waiting to happen, and "three of six, two moved for mock prep" is a
 * conversation about a real week.
 */
const REASONS = [
  'Ran out of time',
  'Mock exam prep took priority',
  'Was unwell',
  'Deadline moved',
  'Too big for one week',
  'Waiting on someone else',
];

export const DeferReasonModal: React.FC<DeferReasonModalProps> = ({
  task,
  onCancel,
  onConfirm,
}) => {
  const [custom, setCustom] = useState('');

  useEscapeToClose(!!task, onCancel);
  useEffect(() => setCustom(''), [task]);

  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onCancel} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Move ${task.title} out of this week`}
        className="relative w-full sm:max-w-md bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 pb-nav-safe sm:pb-5 shadow-2xl"
      >
        <button
          onClick={onCancel}
          aria-label="Close"
          className="absolute top-3 right-3 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-sm font-bold text-white pr-8">Moving it out of this week</h3>
        <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
          "{task.title}" — optional, but it helps the Sunday review remember what actually happened.
        </p>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {REASONS.map((reason) => (
            <button
              key={reason}
              onClick={() => onConfirm(reason)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-indigo-600 hover:border-indigo-400 border border-slate-700 text-slate-200 text-[11px] font-semibold transition-all"
            >
              {reason}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && custom.trim()) onConfirm(custom.trim());
          }}
          placeholder="Or say it in your own words"
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 mb-3"
        />

        <div className="flex items-center gap-2">
          <button
            onClick={() => onConfirm(custom.trim())}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
          >
            {custom.trim() ? 'Move it' : 'Move it, no reason'}
          </button>
          <button
            onClick={onCancel}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-xs"
          >
            Keep it
          </button>
        </div>
      </div>
    </div>
  );
};

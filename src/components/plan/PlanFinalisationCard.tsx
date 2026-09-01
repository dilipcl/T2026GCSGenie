import React, { useState } from 'react';
import { PlanAmendment, WeekPlanBaseline } from '../../types';
import {
  ReadinessCheck,
  canSubmit,
  outstandingSteps,
} from '../../services/planBaselineService';
import { InfoTip } from '../shared/InfoTip';
import {
  CheckCircle2,
  Circle,
  Lock,
  Send,
  Clock,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';

interface Props {
  checks: ReadinessCheck[];
  baseline?: WeekPlanBaseline;
  amendments: PlanAmendment[];
  onSubmit: (note?: string) => Promise<void>;
}

/**
 * The step that turns a week's plan into a promise.
 *
 * The planner could always say what this week held, but nothing ever closed the
 * decision - the list stayed editable all week, so "committed" only ever meant
 * "currently in the left-hand column". This is the missing moment: here is what
 * is still outstanding, and here is the button that sends the week to be
 * agreed.
 *
 * The checklist is the substance. A nudge that says "finalise your plan" and
 * leaves you to work out what that means is a nudge that gets ignored; every
 * row here names one specific thing and, where it can, names the tasks it is
 * about.
 */
export const PlanFinalisationCard: React.FC<Props> = ({
  checks,
  baseline,
  amendments,
  onSubmit,
}) => {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const status = baseline?.status ?? 'DRAFT';
  const outstanding = outstandingSteps(checks);
  const blocking = outstanding.filter((c) => c.blocking);
  const ready = canSubmit(checks);

  const send = async () => {
    if (sending || !ready) return;
    setSending(true);
    try {
      await onSubmit(note.trim() || undefined);
      setNote('');
    } finally {
      setSending(false);
    }
  };

  const net = Math.round(amendments.reduce((sum, a) => sum + a.hoursAdded, 0) * 10) / 10;

  return (
    <div
      className={`glass-card p-5 border ${
        status === 'BASELINED'
          ? 'border-emerald-500/40'
          : status === 'AWAITING_APPROVAL'
          ? 'border-indigo-500/40'
          : blocking.length > 0
          ? 'border-amber-500/40'
          : 'border-slate-700'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3 pb-3 border-b border-slate-800">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <span>Finalising this week</span>
            <InfoTip label="Why finalise">
              Until the week is agreed, "committed" only means "currently in the left-hand
              column" — it can drift all week and nobody would know. Once it is baselined, the
              plan can still change, but each change is recorded with what came out to make room.
            </InfoTip>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {status === 'BASELINED'
              ? 'Agreed. Anything added now is recorded as a change.'
              : status === 'AWAITING_APPROVAL'
              ? 'Sent for approval. Nothing else to do.'
              : 'Finish these steps, then send the week to be agreed.'}
          </p>
        </div>

        <span
          className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 flex-shrink-0 ${
            status === 'BASELINED'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
              : status === 'AWAITING_APPROVAL'
              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}
        >
          {status === 'BASELINED' ? (
            <ShieldCheck className="w-3 h-3" />
          ) : status === 'AWAITING_APPROVAL' ? (
            <Clock className="w-3 h-3" />
          ) : (
            <Lock className="w-3 h-3" />
          )}
          <span>
            {status === 'BASELINED'
              ? 'Baselined'
              : status === 'AWAITING_APPROVAL'
              ? 'Awaiting approval'
              : 'Draft'}
          </span>
        </span>
      </div>

      {/* Sent back, and why. Leads, because it is the only thing to act on. */}
      {status === 'DRAFT' && baseline?.returnedNote && (
        <div className="mb-3 p-3 bg-amber-950/40 border border-amber-500/50 rounded-xl text-xs text-amber-100 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>
            <strong className="font-bold">Sent back:</strong> {baseline.returnedNote}
          </span>
        </div>
      )}

      <ul className="space-y-2">
        {checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2.5">
            {check.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : (
              <Circle
                className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                  check.blocking ? 'text-amber-400' : 'text-slate-500'
                }`}
              />
            )}
            <div className="min-w-0">
              <p
                className={`text-xs font-semibold leading-snug ${
                  check.ok ? 'text-slate-400 line-through decoration-slate-600' : 'text-white'
                }`}
              >
                {check.label}
                {!check.ok && !check.blocking && (
                  <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    advisory
                  </span>
                )}
              </p>
              {check.detail && (
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{check.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* What has changed since it was agreed. Only ever shown once there is
          something to show - a "0 changes" line is noise. */}
      {status === 'BASELINED' && amendments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <p className="text-[11px] font-bold text-slate-300 mb-1.5">
            {amendments.length} {amendments.length === 1 ? 'change' : 'changes'} since it was
            agreed{' '}
            <span className="font-normal text-slate-500">
              ({net >= 0 ? '+' : ''}
              {net}h net)
            </span>
          </p>
          <ul className="space-y-1">
            {amendments.slice(-4).map((a) => (
              <li key={a.id} className="text-[11px] text-slate-400 leading-snug">
                <span className="text-slate-200">{a.addedTitle}</span>
                {a.displacedTitle ? (
                  <span> — swapped for “{a.displacedTitle}”</span>
                ) : (
                  <span className="text-amber-300/80"> — added on top</span>
                )}
                {a.reason && <span className="text-slate-500"> · {a.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status === 'DRAFT' && (
        <div className="mt-4 pt-3 border-t border-slate-800">
          {/* Asked for only when the week is over its headroom, which is the one
              case a parent needs a sentence to approve against. */}
          {!checks.find((c) => c.id === 'FITS_HEADROOM')?.ok && (
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="This week is over your headroom — say why (mocks, coursework deadline…)"
              className="w-full mb-2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          )}

          <button
            onClick={send}
            disabled={!ready || sending}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all"
          >
            <Send className="w-4 h-4" />
            <span>
              {sending
                ? 'Sending…'
                : ready
                ? 'Send this week for approval'
                : `${blocking.length} ${blocking.length === 1 ? 'step' : 'steps'} to go`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

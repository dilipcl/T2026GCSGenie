import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Sanction, SanctionSeverity } from '../../types';
import {
  ESCALATION_WINDOW_DAYS,
  SANCTION_TIERS,
  SEVERITY_ORDER,
  applyEscalation,
  liftSanction,
  logSanction,
  severityOf,
} from '../../services/sanctionService';
import { useFeedback } from '../shared/FeedbackProvider';
import { useChangeGuard } from '../shared/ChangeGuardProvider';
import { formatFriendlyDate, todayISO } from '../../utils/date';
import { ShieldAlert, TrendingUp, Lock, Unlock } from 'lucide-react';

/**
 * Logging misbehaviour against a rule rather than against a mood.
 *
 * The old form had one button - "Log Detention (-500 XP & Freeze Shop)" - and a
 * free-text reason. Every incident was priced identically, so the penalty
 * carried no information about what had happened, and the only way to be
 * proportionate was not to log the small things at all.
 *
 * Here the parent picks what happened and the consequence follows from the
 * tier. The escalation is shown before the button is pressed, because a
 * punishment that turns out to be double what was expected reads as arbitrary
 * even when the rule is written down.
 */
export const SanctionPanel: React.FC = () => {
  const { toast } = useFeedback();
  const { confirmChange } = useChangeGuard();

  const [severity, setSeverity] = useState<SanctionSeverity>('DETENTION');
  const [reason, setReason] = useState('');
  const [remediation, setRemediation] = useState(
    'Complete 45 minutes of focused revision and show the notes'
  );

  const sanctions = useLiveQuery(
    async () => (await db.sanctions.orderBy('date').reverse().toArray()) as Sanction[],
    [],
    [] as Sanction[]
  );

  const today = todayISO();
  // Anything inside the window escalates the next one, so the count and the
  // outcome are both worth showing before anything is written.
  const recent = sanctions.filter((s) => {
    const since = new Date(today);
    since.setDate(since.getDate() - ESCALATION_WINDOW_DAYS);
    return s.date >= since.toISOString().slice(0, 10) && s.date <= today;
  });
  const outcome = applyEscalation(severity, recent.length);
  const effective = SANCTION_TIERS[outcome.severity];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    await confirmChange({
      title: 'Log this sanction?',
      subject: reason.trim(),
      effect:
        `${effective.label} · ${effective.penaltyXP} XP` +
        (effective.freezesShop ? ' · shop frozen' : '') +
        (outcome.escalatedFrom ? ' (escalated)' : ''),
      category: 'SANCTION',
      entity: 'Sanction',
      actor: 'PARENT',
      tone: 'danger',
      confirmLabel: 'Log it',
      summary:
        `${effective.label} logged — ${reason.trim()} (${effective.penaltyXP} XP` +
        (effective.freezesShop ? ', Rewards Shop frozen' : '') +
        ')',
      run: async () => {
        await logSanction({ severity, reason, remediation });
        setReason('');
      },
    });
  };

  const lift = async (sanction: Sanction) => {
    await confirmChange({
      title: 'Lift this freeze?',
      subject: sanction.reason,
      effect: 'The Rewards Shop reopens. The XP penalty stays.',
      category: 'SANCTION',
      entity: 'Sanction',
      entityId: sanction.id,
      actor: 'PARENT',
      confirmLabel: 'Lift it',
      summary: `Freeze lifted — ${sanction.reason}. The Rewards Shop is open again.`,
      run: async () => {
        await liftSanction(sanction);
        toast.success('Freeze lifted', 'The Rewards Shop is unlocked again.');
      },
    });
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
        <ShieldAlert className="w-5 h-5 text-rose-400" />
        <h3 className="font-bold text-sm text-white">Log a sanction</h3>
      </div>

      <p className="text-[11px] text-slate-400 mb-3 max-w-2xl">
        Pick what happened; the penalty follows from the tier. It is fixed in advance so the number
        is a consequence rather than a decision made while cross — and so the small things can be
        logged without pricing them like the serious ones.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SEVERITY_ORDER.map((id) => {
            const tier = SANCTION_TIERS[id];
            const chosen = severity === id;
            return (
              <button
                type="button"
                key={id}
                onClick={() => setSeverity(id)}
                className={`text-left p-3 rounded-xl border transition-all ${
                  chosen
                    ? 'bg-rose-600/20 border-rose-500/60'
                    : 'bg-slate-900 border-slate-700 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-xs font-bold ${chosen ? 'text-white' : 'text-slate-200'}`}>
                    {tier.label}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-rose-300">
                    {tier.penaltyXP}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-snug">{tier.blurb}</p>
                <p className="text-[10px] mt-1.5 flex items-center gap-1">
                  {tier.freezesShop ? (
                    <>
                      <Lock className="w-2.5 h-2.5 text-rose-400" />
                      <span className="text-rose-300">Freezes the shop</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-2.5 h-2.5 text-slate-500" />
                      <span className="text-slate-500">Shop stays open</span>
                    </>
                  )}
                </p>
              </button>
            );
          })}
        </div>

        {/* Said before the button, never after. */}
        {outcome.escalatedFrom && (
          <div className="p-2.5 bg-amber-950/40 border border-amber-500/50 rounded-xl text-[11px] text-amber-100 flex items-start gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              {recent.length} already in the last {ESCALATION_WINDOW_DAYS} days, so this is logged
              as <strong>{effective.label}</strong> rather than{' '}
              {SANCTION_TIERS[outcome.escalatedFrom].label} — {effective.penaltyXP} XP
              {effective.freezesShop ? ' and the shop freezes' : ''}.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
              What happened
            </label>
            <input
              type="text"
              placeholder="e.g. Late to period 3 for the third time"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          {/* Only the top tier shuts the shop, and only a shut shop needs a way
              to reopen. Asking otherwise implies a condition nothing checks. */}
          {effective.requiresRemediation && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                What reopens the shop
              </label>
              <input
                type="text"
                value={remediation}
                onChange={(e) => setRemediation(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-950/50"
        >
          Log {effective.label} ({effective.penaltyXP} XP
          {effective.freezesShop ? ' & freeze shop' : ''})
        </button>
      </form>

      {sanctions.length > 0 && (
        <div className="mt-5 space-y-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase">History</h4>
          {sanctions.map((s) => {
            const tier = SANCTION_TIERS[severityOf(s)];
            return (
              <div
                key={s.id}
                className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-rose-400 uppercase text-[10px] tracking-wider">
                      {tier.label}
                    </span>
                    <span className="text-slate-300">{s.reason}</span>
                    {s.escalatedFrom && (
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        escalated
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {formatFriendlyDate(s.date)} · {s.penaltyXP} XP
                    {s.remediationTaskIdRequired ? ` · ${s.remediationTaskIdRequired}` : ''}
                  </p>
                </div>

                {s.shopFrozen && !s.resolvedAt ? (
                  <button
                    onClick={() => lift(s)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg shadow flex-shrink-0"
                  >
                    Approve & lift freeze
                  </button>
                ) : (
                  <span className="text-emerald-400 text-[11px] font-semibold flex-shrink-0">
                    {s.resolvedAt ? 'Resolved' : 'No freeze'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

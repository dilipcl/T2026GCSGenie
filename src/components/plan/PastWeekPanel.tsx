import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  STANDING_LABEL,
  WeekRecord,
  reopenWeek,
  weekRecord,
  writeOffWeek,
} from '../../services/weekLedger';
import { UserRole } from '../../types';
import { formatShortDate } from '../../utils/date';
import { whenLabel } from '../../services/whatsappService';
import { weeksAgo } from '../../services/weekWindow';
import { useFeedback } from '../shared/FeedbackProvider';
import { recordChange } from '../../services/changeLogService';
import {
  Archive,
  CheckCircle2,
  History,
  RotateCcw,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';

/**
 * What became of a week that is already over.
 *
 * The planner could look back at a finished week and tell you a score. What it
 * could never do was let you *finish* with one. Tejas's last week had run
 * without ever being finalised; he decided, sensibly, that it was too late to
 * be worth reconstructing, and there was nowhere in the app to say so - so the
 * week stayed in the same half-done state forever, looking exactly like one he
 * had merely not got round to.
 *
 * Two ways out, and the second is the one that was missing. Review it, which is
 * the good path and lives in the weekly review. Or write it off, which is not a
 * failure state: it records that somebody looked, decided it was not worth
 * reconstructing, and said why. Both close the week. Leaving it open forever
 * was the only outcome the app used to offer, and it is the one genuinely bad
 * one - a week that can never be finished is a permanent quiet reproach, and
 * people stop opening screens that carry those.
 */

interface PastWeekPanelProps {
  weekStart: string;
  role: UserRole;
  /** Opens the weekly review, which is the other way to close a week. */
  onOpenReview?: () => void;
}

export const PastWeekPanel: React.FC<PastWeekPanelProps> = ({
  weekStart,
  role,
  onOpenReview,
}) => {
  const record = useLiveQuery(() => weekRecord(weekStart), [weekStart]);
  const { toast, confirm } = useFeedback();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!record) return null;

  const closed = record.standing === 'REVIEWED' || record.standing === 'WRITTEN_OFF';

  /**
   * The weekly review only ever looks at the week just gone - its first step is
   * headed "Last week" and every figure on it is read from the current
   * commitment. Offering it as the way to close a three-week-old week would
   * stamp the wrong week reviewed and show the wrong numbers while doing it, so
   * for anything older the honest route is the write-off, which says exactly
   * what it is.
   */
  const reviewableHere = weekStart === weeksAgo(1).start;

  const writeOff = async () => {
    const note = reason.trim();
    if (!note || busy) return;

    setBusy(true);
    try {
      await writeOffWeek(weekStart, note, role);
      await recordChange({
        category: 'PLAN',
        summary: `Wrote off the week of ${formatShortDate(weekStart)}`,
        detail: note,
        entity: 'WeekPlanBaseline',
        entityId: weekStart,
        actor: role,
      });
      setReason('');
      toast.info('Written off', 'The week stops asking. The reason is on the record.');
    } catch (err) {
      toast.error('Could not write it off', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    const ok = await confirm({
      title: 'Reopen this week?',
      body: 'It goes back on the list of weeks still to be dealt with.',
      confirmLabel: 'Reopen it',
    });
    if (!ok) return;

    await reopenWeek(weekStart, role);
    toast.info('Reopened', 'It is back among the weeks waiting on a decision.');
  };

  return (
    <div
      className={`glass-card p-4 border ${
        record.needsClosing
          ? 'border-amber-500/40 bg-amber-950/10'
          : closed
          ? 'border-slate-700'
          : 'border-slate-800'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
            <History className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">
              {formatShortDate(record.weekStart)} – {formatShortDate(record.weekEnd)}
            </h3>
            <p className="text-[11px] text-slate-400">This week is over. {STANDING_LABEL[record.standing]}.</p>
          </div>
        </div>

        <span
          className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${
            record.standing === 'REVIEWED'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
              : record.standing === 'WRITTEN_OFF'
              ? 'bg-slate-800 text-slate-300 border-slate-700'
              : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
          }`}
        >
          {STANDING_LABEL[record.standing]}
        </span>
      </div>

      {/* What the week actually came to, whatever became of it. */}
      <WeekFigures record={record} />

      {record.needsClosing && (
        <div className="mt-3 p-3 rounded-xl bg-amber-950/30 border border-amber-500/40">
          <p className="text-[11px] text-amber-100 leading-snug flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong className="font-bold">{record.todo}.</strong> {record.because}
            </span>
          </p>

          <div className="mt-3 space-y-2">
            {record.standing === 'NEEDS_REVIEW' && reviewableHere && onOpenReview && (
              <button
                type="button"
                onClick={onOpenReview}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                Review it together and close it
              </button>
            )}

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                {/* A sentence, and it is required. Four seconds to type, and
                    what it rules out is a button that silently makes weeks
                    disappear - which is the version a parent stops trusting. */}
                Or write it off — say why
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Too late to be worth reconstructing"
                  className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={writeOff}
                  disabled={busy || !reason.trim()}
                  className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:hover:bg-slate-700 text-white text-[11px] font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Write it off
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                Writing a week off is not a failure — it records a decision. Nothing already earned
                is taken away.
                {record.standing === 'NEEDS_REVIEW' && !reviewableHere && (
                  <>
                    {' '}
                    The weekly review only looks at the week just gone, so this is the way to close
                    an older one.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {closed && (
        <div className="mt-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
          <p className="text-[11px] text-slate-300 leading-snug">
            <strong className="font-bold text-white">
              {record.standing === 'REVIEWED' ? 'Reviewed' : 'Written off'}
            </strong>{' '}
            {(() => {
              const at = record.baseline?.reviewedAt ?? record.baseline?.writtenOffAt;
              return at ? whenLabel(at) : 'at some point';
            })()}
            {(record.baseline?.reviewedNote || record.baseline?.writtenOffNote) && (
              <>
                {' '}
                — “{record.baseline.reviewedNote ?? record.baseline.writtenOffNote}”
              </>
            )}
            .
          </p>
          <button
            type="button"
            onClick={reopen}
            className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-slate-500 hover:text-slate-300"
          >
            <RotateCcw className="w-3 h-3" />
            Reopen it
          </button>
        </div>
      )}
    </div>
  );
};

/** The week's numbers, stated the same way whatever became of the week. */
const WeekFigures: React.FC<{ record: WeekRecord }> = ({ record }) => {
  const { execution } = record;
  const paid =
    execution.isClosed && execution.wasBaselined ? execution.bonusXp + execution.extraXp : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <Figure
        label="Committed work done"
        value={
          execution.committed > 0 ? `${execution.delivered} of ${execution.committed}` : 'Nothing agreed'
        }
      />
      <Figure
        label="Check-ins answered"
        value={
          execution.occurrencesExpected > 0
            ? `${execution.occurrencesAnswered} of ${execution.occurrencesExpected}`
            : '—'
        }
      />
      {/* Only an agreed week pays, so only an agreed week may claim a figure.

          `extraXp` is the *value* of work pulled in on top, and it is computed
          for any week so the live one can show what it is running towards.
          Whether it is actually paid is a separate question, settled by
          `closedWeekExecutions`, and a panel that added the two up regardless
          would show a week that was never agreed earning XP that is nowhere in
          the balance. */}
      <Figure
        label="Earned for the week"
        value={paid > 0 ? `+${paid} XP` : execution.wasBaselined ? 'No bonus' : 'Never agreed'}
        tone={paid > 0 ? 'good' : undefined}
        icon={paid > 0}
      />
    </div>
  );
};

const Figure: React.FC<{
  label: string;
  value: string;
  tone?: 'good';
  icon?: boolean;
}> = ({ label, value, tone, icon }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
    <p className="text-[10px] text-slate-400">{label}</p>
    <p
      className={`text-[11px] font-bold flex items-center gap-1 ${
        tone === 'good' ? 'text-fuchsia-200' : 'text-slate-200'
      }`}
    >
      {icon && <Sparkles className="w-3 h-3" />}
      {value}
    </p>
  </div>
);

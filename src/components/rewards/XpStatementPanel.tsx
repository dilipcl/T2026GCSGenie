import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { UserRole } from '../../types';
import {
  CONCERN_DETAIL,
  CONCERN_LABEL,
  SOURCE_LABEL,
  XpEntry,
  XpSource,
  reconcileXp,
} from '../../services/xpLedgerService';
import { calculateTotalXP } from '../../services/ragCalculator';
import { useChangeGuard } from '../shared/ChangeGuardProvider';
import { logAuditEvent } from '../../services/auditService';
import { formatShortDate } from '../../utils/date';
import { whenLabel } from '../../services/whatsappService';
import { InfoTip } from '../shared/InfoTip';
import { Receipt, AlertTriangle, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

/**
 * What the balance is made of, and which lines rest on a close worth checking.
 *
 * The number in the header has never been decomposable. That is fine right up
 * until somebody asks whether it is right - at which point there is nothing to
 * look at, no way to answer, and the argument is about the app rather than
 * about the work. The first job of this panel is simply to make the total
 * legible.
 *
 * The second is the reconciliation Tejas asked for. Points may have been
 * granted for work that was closed by accident, back when closing something was
 * a single tap in a scrolling list. Two things are worth being clear about.
 *
 * Nothing needs clawing back: XP is derived from the rows on every read, never
 * banked, so reopening a task removes its points immediately and exactly. The
 * fix is not an adjustment, it is a correction to the underlying record.
 *
 * And the app never decides. It shows the closes carrying the *signature* of an
 * accident - three things closed inside ten seconds, homework marked done with
 * nothing attached and nothing said - and leaves the judgement to a person,
 * because the app cannot know what somebody meant by a tap and a system that
 * pretended otherwise would start silently deleting real achievements.
 */

const SOURCE_TONE: Record<XpSource, string> = {
  TASK: 'text-indigo-300',
  FIX_UP: 'text-amber-300',
  CHECK_IN: 'text-emerald-300',
  OCCURRENCE: 'text-fuchsia-300',
  CHORE: 'text-sky-300',
  WEEK_BONUS: 'text-emerald-300',
  EXTRA_WORK: 'text-teal-300',
  SANCTION: 'text-rose-300',
  REDEEMED: 'text-slate-300',
  RESERVED: 'text-amber-300',
};

interface Props {
  role: UserRole;
}

export const XpStatementPanel: React.FC<Props> = ({ role }) => {
  const reconciliation = useLiveQuery(() => reconcileXp(), []);
  const headline = useLiveQuery(() => calculateTotalXP(), []);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (!reconciliation || !headline) return null;

  const { entries, earned, deducted, balance, questionable, questionableXp, bySource } =
    reconciliation;

  /**
   * The statement is computed from the same rows as the headline, so these
   * agree by construction and a mismatch would mean a real bug rather than a
   * rounding difference. Said out loud rather than assumed: a statement whose
   * own total is not checked is a statement nobody should trust.
   */
  const reconciles = earned === headline.totalXP;

  const shown = showAll ? entries : entries.slice(0, 25);

  return (
    <div className="glass-card p-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex flex-wrap items-start justify-between gap-3 text-left"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
            <Receipt className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              Where the XP came from
              <InfoTip label="How XP is counted">
                Nothing is banked. The balance is added up from your work every time it is shown,
                so reopening something takes its points straight back off — and closing it again
                puts them back.
              </InfoTip>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {earned.toLocaleString()} earned − {deducted.toLocaleString()} spent, held and
              penalised = <strong className="text-white">{balance.toLocaleString()} XP</strong>
            </p>
          </div>
        </div>

        <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-300 flex-shrink-0">
          {open ? 'Hide' : 'Show the log'}
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>

      {!reconciles && (
        /* Should be unreachable - both numbers come from the same rows. If it
           ever shows, the statement is the thing to trust least, so it says so
           rather than quietly presenting a total that does not match. */
        <p className="text-[11px] text-rose-300 font-semibold" role="alert">
          This statement adds up to {earned.toLocaleString()} XP but the balance says{' '}
          {headline.totalXP.toLocaleString()}. Something is wrong — please report it.
        </p>
      )}

      {/* Where it came from, before the line-by-line. Most of the time this is
          the whole answer and nobody needs to open the log at all. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {bySource.map((row) => (
          <div
            key={row.source}
            className="rounded-xl border border-slate-800 bg-slate-900/60 px-2.5 py-1.5"
          >
            <p className="text-[10px] text-slate-400 truncate">{SOURCE_LABEL[row.source]}</p>
            <p className={`text-[11px] font-bold ${SOURCE_TONE[row.source]}`}>
              {row.total > 0 ? '+' : ''}
              {row.total.toLocaleString()} XP
              <span className="text-slate-500 font-normal"> · {row.count}</span>
            </p>
          </div>
        ))}
      </div>

      {questionable.length > 0 && (
        <QuestionablePanel entries={questionable} totalXp={questionableXp} role={role} />
      )}

      {open && (
        <div className="pt-1">
          <ul className="space-y-1 max-h-96 overflow-y-auto">
            {shown.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 px-2.5 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800"
              >
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-100 leading-snug break-words">
                    {entry.title}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {SOURCE_LABEL[entry.source]}
                    {entry.at
                      ? ` · ${whenLabel(entry.at)}`
                      : entry.on
                      ? ` · ${formatShortDate(entry.on)}`
                      : ' · no date recorded'}
                    {entry.concerns.length > 0 && (
                      <span className="text-amber-300 font-bold">
                        {' '}
                        · {CONCERN_LABEL[entry.concerns[0]]}
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className={`text-[11px] font-bold whitespace-nowrap ${
                    entry.amount > 0 ? 'text-emerald-300' : 'text-slate-400'
                  }`}
                >
                  {entry.amount > 0 ? '+' : ''}
                  {entry.amount.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>

          {entries.length > shown.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-2 text-[10px] font-bold text-indigo-300 hover:text-indigo-200"
            >
              Show all {entries.length} lines
            </button>
          )}

          {entries.length === 0 && (
            <p className="text-[11px] text-slate-500 py-2">
              Nothing has earned or spent XP yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * The lines worth a second look, and the one action that corrects them.
 *
 * Reopening is the whole remedy: it puts the work back on the list and takes
 * its points off in the same movement, because the points were only ever a sum
 * over what was closed. There is deliberately no "write off these points"
 * button - that would be an adjustment nobody could later explain, where
 * reopening is just the record being made accurate.
 */
const QuestionablePanel: React.FC<{
  entries: XpEntry[];
  totalXp: number;
  role: UserRole;
}> = ({ entries, totalXp, role }) => {
  const { confirmChange } = useChangeGuard();
  const [expanded, setExpanded] = useState(false);

  const reopen = async (entry: XpEntry) => {
    if (!entry.entityId) return;
    const task = await db.tasks.get(entry.entityId);
    if (!task) return;

    await confirmChange({
      title: 'Put this back on the list?',
      subject: task.title,
      effect: `−${task.xpValue} XP · it counts as unfinished again`,
      category: 'HOMEWORK',
      entity: 'Task',
      entityId: task.id,
      confirmLabel: 'Yes, reopen it',
      summary: `Reopened "${task.title}" while checking the XP log`,
      detail: entry.concerns.map((c) => CONCERN_LABEL[c]).join('; '),
      actor: role,
      run: async () => {
        await db.tasks.update(task.id, { completed: false, completedAt: undefined });
        await logAuditEvent({
          user: role,
          action: 'UPDATE',
          entity: 'Task',
          entityId: task.id,
          fieldChanged: 'completed',
          oldValue: 'completed',
          newValue: `Reopened "${task.title}" — ${entry.concerns
            .map((c) => CONCERN_LABEL[c])
            .join('; ')}`,
        });
      },
    });
  };

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-start justify-between gap-3 text-left"
      >
        <p className="text-[11px] text-amber-100 leading-snug flex items-start gap-2 min-w-0">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>
            <strong className="font-bold">
              {totalXp.toLocaleString()} XP rests on {entries.length}{' '}
              {entries.length === 1 ? 'close' : 'closes'} worth checking.
            </strong>{' '}
            Nothing has been taken off — reopening one is what corrects its points, and only you
            can say whether it was real.
          </span>
        </p>
        <span className="text-[10px] font-bold text-amber-200 flex-shrink-0">
          {expanded ? 'Hide' : 'Check them'}
        </span>
      </button>

      {expanded && (
        <ul className="mt-2.5 space-y-1.5 max-h-80 overflow-y-auto">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="px-2.5 py-2 rounded-lg bg-slate-900/70 border border-slate-800"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] text-slate-100 leading-snug break-words min-w-0">
                  {entry.title}
                </p>
                <span className="text-[11px] font-bold text-emerald-300 whitespace-nowrap">
                  +{entry.amount.toLocaleString()}
                </span>
              </div>

              <ul className="mt-1 space-y-0.5">
                {entry.concerns.map((concern) => (
                  <li key={concern} className="text-[10px] text-amber-200/90 leading-snug">
                    <span className="font-bold">{CONCERN_LABEL[concern]}</span> —{' '}
                    {CONCERN_DETAIL[concern]}
                  </li>
                ))}
              </ul>

              <p className="text-[10px] text-slate-500 mt-1">
                {entry.at ? `Closed ${whenLabel(entry.at)}` : 'No completion time recorded'}
              </p>

              {/* Only a task can be reopened from here. A fix-up quest is
                  claimed on its own screen with its working attached, and a
                  week bonus is a consequence of the tasks under it rather than
                  a thing in its own right. */}
              {entry.entityId && (entry.source === 'TASK' || entry.source === 'FIX_UP') && (
                <button
                  type="button"
                  onClick={() => reopen(entry)}
                  className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-slate-400 hover:text-rose-300"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reopen it and take the points back
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Task } from '../../types';
import {
  amendmentsFor,
  approveBaseline,
  loadBaseline,
  returnForChanges,
  weekStartISO,
} from '../../services/planBaselineService';
import { taskHours } from '../../services/planService';
import { useFeedback } from '../shared/FeedbackProvider';
import { useChangeGuard } from '../shared/ChangeGuardProvider';
import { formatFriendlyDate } from '../../utils/date';
import { ClipboardCheck, Clock, ShieldCheck, Target, AlertTriangle } from 'lucide-react';

/**
 * Where a week's plan is agreed to.
 *
 * The approval is deliberately here, behind the PIN, rather than as a second
 * button on the planner. What it is checking for is the thing a student cannot
 * see from inside their own week: a steady drift of over-promising, or a
 * fortnight where all the committed hours are pointed at no goal at all. Both
 * look perfectly reasonable one task at a time.
 *
 * Sending it back returns the week to a draft with a note. There is no rejected
 * state, because "no" and "not yet" need the same next step - change something
 * and send it again - and a third status would only be a worse way of saying
 * the same thing.
 */
export const PlanApprovalPanel: React.FC = () => {
  const { toast } = useFeedback();
  const { confirmChange } = useChangeGuard();
  const [note, setNote] = useState('');

  const weekStart = weekStartISO();
  const baseline = useLiveQuery(() => loadBaseline(weekStart), [weekStart]);
  const amendments = useLiveQuery(() => amendmentsFor(weekStart), [weekStart], []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [] as Task[]);
  const goals = useLiveQuery(() => db.goals.toArray(), [], []);

  const status = baseline?.status ?? 'DRAFT';
  const submitted = (baseline?.taskIds ?? [])
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => !!t);

  const offGoal = submitted.filter((t) => !t.linkedGoalId);
  const offGoalHours = Math.round(offGoal.reduce((sum, t) => sum + taskHours(t), 0) * 10) / 10;

  const approve = async () => {
    await confirmChange({
      title: 'Approve this week?',
      subject: `${submitted.length} tasks · ${baseline?.hours ?? 0}h`,
      effect: 'It becomes the baseline. Later additions are recorded as changes.',
      category: 'PLAN',
      entity: 'WeekPlanBaseline',
      entityId: weekStart,
      actor: 'PARENT',
      confirmLabel: 'Approve it',
      summary: `Approved the week of ${formatFriendlyDate(weekStart)} — ${submitted.length} tasks, ${
        baseline?.hours ?? 0
      }h`,
      run: async () => {
        await approveBaseline(weekStart);
        toast.success('Week approved', 'This is the baseline now.');
      },
    });
  };

  const sendBack = async () => {
    if (!note.trim()) return;
    await confirmChange({
      title: 'Send this week back?',
      subject: note.trim(),
      effect: 'It goes back to a draft with your note.',
      category: 'PLAN',
      entity: 'WeekPlanBaseline',
      entityId: weekStart,
      actor: 'PARENT',
      tone: 'danger',
      confirmLabel: 'Send it back',
      summary: `Sent the week back for a change — ${note.trim()}`,
      run: async () => {
        await returnForChanges(note, weekStart);
        setNote('');
        toast.info('Sent back', 'Tejas can change it and submit again.');
      },
    });
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
        <ClipboardCheck className="w-5 h-5 text-indigo-400" />
        <h3 className="font-bold text-sm text-white">This week&rsquo;s plan</h3>
        <span
          className={`ml-auto text-[10px] font-bold px-2.5 py-1 rounded-full border ${
            status === 'BASELINED'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
              : status === 'AWAITING_APPROVAL'
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          {status === 'BASELINED'
            ? 'Approved'
            : status === 'AWAITING_APPROVAL'
            ? 'Waiting on you'
            : 'Draft'}
        </span>
      </div>

      {status === 'DRAFT' && (
        <p className="text-xs text-slate-400">
          Nothing to approve. Tejas has not sent this week yet
          {baseline?.returnedNote ? ' — you sent it back for a change.' : '.'}
        </p>
      )}

      {status === 'AWAITING_APPROVAL' && (
        <>
          <p className="text-xs text-slate-300 mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {submitted.length} tasks, {baseline?.hours}h promised for the week of{' '}
              {formatFriendlyDate(weekStart)}.
            </span>
          </p>

          {/* The drift a student cannot see from inside their own week. */}
          {offGoal.length > 0 && (
            <div className="mb-3 p-2.5 bg-amber-950/40 border border-amber-500/50 rounded-xl text-[11px] text-amber-100 flex items-start gap-2">
              <Target className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <span>
                {offGoalHours}h of this ({offGoal.length}{' '}
                {offGoal.length === 1 ? 'task' : 'tasks'}) is not linked to any goal
                {goals.length === 0 ? ', and no goals are set up yet' : ''}.
              </span>
            </div>
          )}

          <ul className="space-y-1.5 mb-4">
            {submitted.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px]"
              >
                <span className="text-slate-200 truncate">{t.title}</span>
                <span className="text-slate-500 flex-shrink-0">
                  {formatFriendlyDate(t.dueDate)} · {taskHours(t)}h
                  {!t.linkedGoalId && <span className="text-amber-400"> · no goal</span>}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={approve}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Approve the week</span>
            </button>
          </div>

          <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Or say what needs changing…"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
            />
            <button
              onClick={sendBack}
              disabled={!note.trim()}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs disabled:opacity-40"
            >
              Send back
            </button>
          </div>
        </>
      )}

      {status === 'BASELINED' && (
        <>
          <p className="text-xs text-slate-300">
            Agreed: {submitted.length} tasks, {baseline?.hours}h.
          </p>

          {amendments.length > 0 ? (
            <div className="mt-3">
              <p className="text-[11px] font-bold text-amber-200 flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {amendments.length} {amendments.length === 1 ? 'change' : 'changes'} since you
                  approved it
                </span>
              </p>
              <ul className="space-y-1">
                {amendments.map((a) => (
                  <li key={a.id} className="text-[11px] text-slate-400 leading-snug">
                    <span className="text-slate-200">{a.addedTitle}</span>
                    {a.displacedTitle ? (
                      <span> — swapped for “{a.displacedTitle}”</span>
                    ) : (
                      <span className="text-amber-300/80">
                        {' '}
                        — added on top ({a.hoursAdded >= 0 ? '+' : ''}
                        {a.hoursAdded}h)
                      </span>
                    )}
                    {a.reason && <span className="text-slate-500"> · {a.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 mt-1.5">
              Unchanged since you approved it.
            </p>
          )}
        </>
      )}
    </div>
  );
};

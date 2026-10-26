import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { INITIAL_SUBJECTS } from '../../db/seedData';
import { loadWeekCommitment } from '../../services/planService';
import { calculateStreakStats, calculateEffortStats } from '../../services/habitEngine';
import { calculateTotalXP } from '../../services/ragCalculator';
import { choreWeekSummary, saveChore, CADENCE_LABEL } from '../../services/choreService';
import { lockedGoalProgress } from '../../services/goalProgress';
import { goalTrend, type Trend } from '../../services/goalTrend';
import { calculateBurnoutCapacity } from '../../services/burnoutEngine';
import { weekExceptions, REASON_LABEL, STATUS_LABEL } from '../../services/commitmentService';
import { messageContext, weeklyDigestMessage } from '../../services/whatsappService';
import { WhatsAppShare } from '../shared/WhatsAppShare';
import { Sparkline } from '../shared/Sparkline';
import { PACE_TEXT } from '../shared/PaceBar';
import { ChoreCadence } from '../../types';
import { logAuditEvent } from '../../services/auditService';
import { useFeedback } from '../shared/FeedbackProvider';
import {
  addDaysISO,
  formatFriendlyDate,
  formatShortDate,
  daysUntil,
} from '../../utils/date';
import { markWeekReviewed } from '../../services/weekLedger';
import { DayNote, notesForWeek } from '../../services/dayRecordService';
import { readWeekDetail } from '../../services/weekDetail';
import { WeekNavigator } from './WeekNavigator';
import { WeekBurndownCard } from '../progress/WeekBurndownCard';
import { WeekDetailPanel } from '../progress/WeekDetailPanel';

/**
 * A reason is tapped rather than typed, and saying so matters: "Missed —
 * Illness" read as though somebody had written a sentence would overstate what
 * was actually recorded.
 */
const NOTE_LABEL: Record<DayNote['kind'], string> = {
  OCCURRENCE: 'Note',
  FOLLOW_UP: 'Follow-up',
  CHECK_IN: 'Check-in',
  REASON: 'Reason given',
  COMMENT: 'Comment',
  ASKED: 'Asked for evidence',
  EXPLAINED: 'Why there is none',
};

const NOTE_TONE: Record<DayNote['kind'], string> = {
  OCCURRENCE: 'text-slate-200',
  FOLLOW_UP: 'text-violet-200',
  CHECK_IN: 'text-slate-200',
  REASON: 'text-amber-200',
  COMMENT: 'text-sky-200',
  ASKED: 'text-rose-200',
  EXPLAINED: 'text-slate-300',
};
import { weekContaining, weeksAgo } from '../../services/weekWindow';
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,

  Handshake,
} from 'lucide-react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';

interface WeeklyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: () => void;
}

type Step = 'LAST_WEEK' | 'NEXT_WEEK' | 'APPROVALS' | 'SIGN_OFF';

const STEPS: { id: Step; label: string }[] = [
  { id: 'LAST_WEEK', label: 'How it went' },
  { id: 'NEXT_WEEK', label: 'Next week' },
  { id: 'APPROVALS', label: 'Approvals' },
  { id: 'SIGN_OFF', label: 'Sign off' },
];

/**
 * The weekly review: fifteen minutes, student and parent together.
 *
 * Everything it shows already exists somewhere in the app. What did not exist
 * was a moment that puts it in one order and ends in an agreement - the habit
 * contract. The student drives; the parent reviews and adds what was missed.
 *
 * The sign-off is written to the change history deliberately: it makes the
 * ritual something with a record, which is what turns it from a good intention
 * into a routine.
 */
export const WeeklyReviewModal: React.FC<WeeklyReviewModalProps> = ({
  isOpen,
  onClose,
  onAddItem,
}) => {
  const { toast } = useFeedback();
  const [step, setStep] = useState<Step>('LAST_WEEK');

  /**
   * The week this review is about, and it is a choice rather than a constant.
   *
   * The first step was headed "Last week" and read most of its numbers from
   * the week in progress: the committed count, the hours studied and the goal
   * hours were this week's, "XP earned" was the all-time total, and only the
   * notes were last week's. On a Sunday evening the two weeks are close enough
   * to pass for each other; on a Tuesday the review described two days of a
   * week nobody was reviewing. Every week-shaped figure on that step now reads
   * from this one value, so they cannot drift apart again.
   *
   * It opens on the week just finished, and steps back as far as the record
   * goes but never forward past it: an unfinished week has no burn-down to
   * look back on, and is on Progress, "so far", for anyone who wants it.
   * Signing off closes whichever week is on screen, so a review that was
   * skipped can still be held, for the week it was about.
   */
  const lastWeek = weeksAgo(1).start;
  const [weekStart, setWeekStart] = useState(lastWeek);
  const [showDetail, setShowDetail] = useState(false);
  const week = weekContaining(weekStart);

  // Each opening starts again from the week just finished: a review left on
  // 28 Sep last Sunday should not open there this Sunday.
  useEffect(() => {
    if (!isOpen) return;
    setWeekStart(weeksAgo(1).start);
    setShowDetail(false);
    setStep('LAST_WEEK');
  }, [isOpen]);

  const commitment = useLiveQuery(() => (isOpen ? loadWeekCommitment() : undefined), [isOpen]);
  const streak = useLiveQuery(() => (isOpen ? calculateStreakStats() : undefined), [isOpen]);
  const effort = useLiveQuery(() => (isOpen ? calculateEffortStats() : undefined), [isOpen]);
  const xp = useLiveQuery(() => (isOpen ? calculateTotalXP() : undefined), [isOpen]);
  const chores = useLiveQuery(() => (isOpen ? choreWeekSummary() : undefined), [isOpen]);
  const goalHours = useLiveQuery(
    () => (isOpen ? lockedGoalProgress(weekContaining(weekStart)) : []),
    [isOpen, weekStart],
    []
  );
  const capacity = useLiveQuery(() => (isOpen ? calculateBurnoutCapacity() : undefined), [isOpen]);
  const exceptions = useLiveQuery(
    () => (isOpen ? weekExceptions(weekContaining(weekStart)) : []),
    [isOpen, weekStart],
    []
  );
  const detail = useLiveQuery(
    () => (isOpen ? readWeekDetail(weekStart) : undefined),
    [isOpen, weekStart]
  );

  /**
   * What was actually written during the week being reviewed.
   *
   * The review had every number about the week and not one word from it, so
   * "how did it go?" was answered by four statistics while the sentences
   * somebody wrote at the time sat unread. The notes are the only part of the
   * record that says *why*, which is the half a review is for.
   *
   * Up here with the other queries rather than beside the value it feeds,
   * because everything below line 132 sits under an early return - and a hook
   * called conditionally is a React fault that shows up later as unrelated
   * state appearing in the wrong component.
   */
  const weekNotes = useLiveQuery(
    () => (isOpen ? notesForWeek(weekStart) : undefined),
    [isOpen, weekStart]
  );
  const settings = useLiveQuery(
    () => (isOpen ? db.parentSettings.get('active_settings') : undefined),
    [isOpen]
  );
  const goalTrends = useLiveQuery<Record<string, Trend>, Record<string, Trend>>(
    async () => {
      if (!isOpen) return {};
      const entries = await Promise.all(
        (await lockedGoalProgress(weekContaining(weekStart))).map(async (p) => [p.goal.id, await goalTrend(p.goal)] as const)
      );
      return Object.fromEntries(entries);
    },
    [isOpen, weekStart],
    {}
  );

  // Adding a chore inline rather than sending the parent to the Parent Portal.
  // This is a fifteen-minute ritual with both people sitting down; navigating
  // away from it to log "put the bins out" is how the ritual stops happening.
  const [choreTitle, setChoreTitle] = useState('');
  const [choreCadence, setChoreCadence] = useState<ChoreCadence>('WEEKLY');

  const pendingRewards = useLiveQuery(
    async () =>
      isOpen ? (await db.redemptions.toArray()).filter((r) => r.status === 'PENDING') : [],
    [isOpen]
  );
  const pendingGoals = useLiveQuery(
    async () =>
      isOpen ? (await db.goals.toArray()).filter((g) => g.status === 'PENDING_DISCUSSION') : [],
    [isOpen]
  );
  const unverifiedPapers = useLiveQuery(
    async () => (isOpen ? (await db.assessments.toArray()).filter((a) => !a.verifiedByParent) : []),
    [isOpen]
  );
  const upcoming = useLiveQuery(
    async () =>
      isOpen
        ? (await db.milestones.orderBy('date').toArray()).filter(
            (m) => !m.isCompleted && daysUntil(m.date) <= 21
          )
        : [],
    [isOpen]
  );

  // Escape closes, like every other dialog in the app. Must sit above the
  // early return - a hook cannot be called conditionally.
  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;
  if (!commitment || !streak || !effort || !xp || !detail) return null;

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const examDays = settings?.examSeriesStartDate
    ? daysUntil(settings.examSeriesStartDate)
    : undefined;

  /**
   * The week on screen, in the terms the sign-off and the family message use.
   * Planned pieces include any since deleted, as the detail card counts them,
   * so "3 of 5" here is "3 of 5" there.
   */
  const plannedCount = detail.committed.length + detail.committedGone;
  const studiedHours = Math.round((detail.time.loggedMinutes / 60) * 10) / 10;
  const weekDates = `${formatShortDate(week.start)} – ${formatShortDate(week.end)}`;

  const digestText = weeklyDigestMessage(messageContext(settings), {
    weekLabel: `Week of ${formatShortDate(week.start)}`,
    targetGrade: settings?.studentTargetGrade,
    daysToExams: examDays !== undefined && examDays >= 0 ? examDays : undefined,
    goals: goalHours.map((p) => ({
      title: p.goal.title,
      actualHours: p.actualHours,
      targetHours: p.targetHours,
      onTrack: !p.needsAction,
    })),
    commitments:
      capacity?.commitmentBreakdown.map((c) => ({
        label: c.label,
        netHours: c.netHours,
        excusedHours: c.excusedHours,
      })) ?? [],
    exceptions: exceptions.map((e) => ({
      title: e.title,
      date: e.date,
      reasonLabel: REASON_LABEL[e.reasonCategory],
    })),
    streakCurrent: streak.current,
    streakBest: streak.best,
    choresDone: chores?.done ?? 0,
    choresDue: chores?.due ?? 0,
    xpEarnedThisWeek: detail.points.earned,
    xpBalance: xp.availableXP,
    studyHours: studiedHours,
    committedDone: detail.delivered,
    committedCount: plannedCount,
    // The three things carried into next week: whatever is still committed.
    focusNextWeek: commitment.columns.THIS_WEEK.filter((t) => !t.completed)
      .slice(0, 3)
      .map((t) => t.title),
  });
  const approvalCount =
    (pendingRewards?.length ?? 0) + (pendingGoals?.length ?? 0) + (unverifiedPapers?.length ?? 0);

  const handleAddChore = async () => {
    const title = choreTitle.trim();
    if (!title) return;
    try {
      await saveChore({ title, cadence: choreCadence });
      setChoreTitle('');
      toast.success('Chore added', `${title} · ${CADENCE_LABEL[choreCadence].toLowerCase()}`);
    } catch (err) {
      console.error('Could not add chore:', err);
      toast.error('Could not add that chore', 'Nothing was changed.');
    }
  };

  /**
   * The week this review closes: the one on screen.
   *
   * Until the sign-off recorded which week it was about, nothing could say
   * which week had actually been closed - which is why the gate timeline
   * settled "close the week" from the calendar instead of from anybody's
   * decision, and why a week nobody had reviewed still showed a green tick.
   * The summary written with it is that week's own numbers; it used to be the
   * current week's, so the record of a review described a different week from
   * the one it marked as reviewed.
   */
  const reviewedWeek = week.start;
  const weekSummary = `${detail.delivered}/${plannedCount} planned pieces done, ${studiedHours}h studied`;

  const handleSignOff = async () => {
    await markWeekReviewed(reviewedWeek, weekSummary);

    await logAuditEvent({
      user: 'PARENT',
      action: 'UPDATE',
      entity: 'WeeklyReview',
      entityId: `review_${addDaysISO(0)}`,
      newValue:
        `Weekly review completed for the week of ${formatShortDate(reviewedWeek)}. ` +
        `${weekSummary}, ${streak.current}-day streak at the time, ` +
        `${approvalCount} items were awaiting approval.`,
    });
    toast.celebrate('Reviewed together', 'Logged to the change history. Same time next week.');
    setStep('LAST_WEEK');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Weekly review"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-2xl bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-2xl p-5 pb-safe sm:pb-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Weekly review</h2>
            <p className="text-[11px] text-slate-400">
              Fifteen minutes, together. Tejas drives; a parent reviews and adds anything missed.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress through the four steps. Any step is reachable directly -
            nothing is gated behind "Next" - but at py-1.5 these were 24px tall,
            well under a thumb, which is why jumping straight to Sign off could
            look like it had been refused. */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              aria-current={i === stepIndex ? 'step' : undefined}
              className={`flex-1 min-h-[44px] px-1 rounded-lg text-[10px] font-bold border transition-all ${
                i === stepIndex
                  ? 'bg-indigo-600 border-indigo-400 text-white'
                  : i < stepIndex
                  ? 'bg-slate-800 border-slate-700 text-emerald-400'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {step === 'LAST_WEEK' && (
          <div className="space-y-3">
            <WeekNavigator
              weekStart={weekStart}
              onChange={(next) => {
                setWeekStart(next);
                setShowDetail(false);
              }}
              onToday={() => setWeekStart(lastWeek)}
              latest={lastWeek}
              home={{ weekStart: lastWeek, label: 'Last week' }}
            />

            <WeekBurndownCard key={weekStart} detail={detail} />

            <p className="text-[11px] text-slate-400">
              {studiedHours}h studied · {detail.usage.daysCheckedIn} of 7 days checked in
              {detail.usage.lessonsExpected > 0 &&
                ` · ${detail.usage.lessonsAnswered} of ${detail.usage.lessonsExpected} lessons answered`}{' '}
              · {detail.points.earned} XP earned that week.
            </p>

            {/* Everything behind the chart: each planned piece and what became
                of it, where the time went, how the week was recorded. Folded
                away because a fifteen-minute review needs the shape first and
                the list only when the shape raises a question. */}
            <button
              type="button"
              onClick={() => setShowDetail(!showDetail)}
              aria-expanded={showDetail}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-between"
            >
              <span>Every piece of {weekDates}</span>
              <ChevronRight
                className={`w-4 h-4 transition-transform ${showDetail ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
            </button>
            {showDetail && <WeekDetailPanel weekStart={weekStart} showBurndown={false} />}

            {commitment.overdueCommitted > 0 && (
              <p className="text-[11px] text-amber-300 p-2.5 bg-amber-950/30 border border-amber-500/40 rounded-xl">
                {commitment.overdueCommitted} committed{' '}
                {commitment.overdueCommitted === 1 ? 'task is past its' : 'tasks are past their'} date in the
                week now running. Worth deciding now whether they move on or come off the list.
              </p>
            )}

            {/* The week in its own words.

                In full, never truncated, and grouped by the day they were
                written on - a note is about a moment, and stripping the day off
                it turns a record into a pile of sentences. Silent when there
                are none rather than showing an empty heading, because a review
                that opens with "nothing written" reads as an accusation. */}
            {weekNotes && weekNotes.length > 0 && (
              <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl space-y-2.5">
                <p className="text-xs font-bold text-white">What was written during the week</p>
                {weekNotes.map((day) => (
                  <div key={day.date}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      {formatShortDate(day.date)}
                    </p>
                    <ul className="space-y-1">
                      {day.notes.map((note, index) => (
                        <li
                          key={index}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800"
                        >
                          <p className="text-[10px] text-slate-500">
                            {NOTE_LABEL[note.kind]} · {note.about}
                          </p>
                          <p
                            className={`text-[11px] leading-relaxed ${NOTE_TONE[note.kind]}`}
                          >
                            {note.text}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Every locked goal against the hours it reserved. The review is the
            natural place for it: this is the conversation where a goal that is
            not getting its time either gets it or gets renegotiated. */}
        {step === 'LAST_WEEK' && goalHours.length > 0 && (
          <div className="mt-3 p-3 bg-slate-900/70 border border-slate-800 rounded-xl space-y-2">
            <p className="text-xs font-bold text-white">
              Goals against their weekly hours, {weekDates}
            </p>
            {goalHours.map((p) => (
              <div key={p.goal.id} className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-300 flex-1 min-w-0 truncate">
                  {p.goal.title}
                </span>
                {p.isUnattributable ? (
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">no subject set</span>
                ) : (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[11px] font-bold whitespace-nowrap ${PACE_TEXT[p.pace]}`}>
                      {p.actualHours} / {p.targetHours}h
                    </span>
                    {/* The month behind the week. A goal can hit its hours this
                        week and still be on a four-week slide. */}
                    {goalTrends[p.goal.id] && (
                      <Sparkline
                        trend={goalTrends[p.goal.id]}
                        targetHours={p.targetHours}
                        width={60}
                        height={18}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* EXC-4. Excused hours changed the week's arithmetic, so the review
            has to say which evenings were missed and why - otherwise the
            capacity gauge simply went down and nobody knows what for. */}
        {step === 'LAST_WEEK' && exceptions.length > 0 && (
          <div className="mt-3 p-3 bg-slate-900/70 border border-slate-800 rounded-xl">
            <p className="text-xs font-bold text-white mb-1.5">Missed or moved</p>
            <ul className="space-y-1">
              {exceptions.map((e) => (
                <li key={e.id} className="text-[11px] text-slate-300">
                  <span className="text-slate-200 font-medium">{e.title}</span>{' '}
                  <span className="text-slate-500">
                    {formatShortDate(e.date)} · {STATUS_LABEL[e.status]} ·{' '}
                    {REASON_LABEL[e.reasonCategory]}
                  </span>
                  {e.reasonNotes && (
                    <span className="block text-[10px] text-slate-500 italic">{e.reasonNotes}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 'NEXT_WEEK' && (chores?.due ?? 0) > 0 && (
          <div className="mt-3 p-3 bg-slate-900/70 border border-slate-800 rounded-xl">
            <p className="text-xs font-bold text-white">
              Chores this week so far: {chores!.done} of {chores!.due} done
              {chores!.xp > 0 ? ` · ${chores!.xp} XP` : ''}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              The small reliable jobs. Worth naming out loud - they are the easiest evidence that
              the week held together.
            </p>
          </div>
        )}

        {step === 'NEXT_WEEK' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-300">
              What Tejas has committed to. Anything that will not realistically happen is better
              moved now than missed later.
            </p>

            {commitment.columns.THIS_WEEK.filter((t) => !t.completed).length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-900/70 rounded-xl border border-slate-800">
                Nothing committed for the coming week yet — do that on the Plan tab together.
              </p>
            ) : (
              <div className="space-y-1.5">
                {commitment.columns.THIS_WEEK.filter((t) => !t.completed).map((t) => {
                  const subject = INITIAL_SUBJECTS.find((s) => s.id === t.subjectId);
                  return (
                    <div
                      key={t.id}
                      className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-xl flex items-center gap-2"
                    >
                      <span className="text-sm">{subject?.icon}</span>
                      <span className="text-xs text-white flex-1 min-w-0 truncate">{t.title}</span>
                      <span className="text-[10px] text-slate-500">
                        {formatFriendlyDate(t.dueDate)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {(upcoming?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                  Key dates within three weeks
                </p>
                <div className="space-y-1">
                  {upcoming!.map((m) => (
                    <p key={m.id} className="text-[11px] text-slate-300">
                      · {m.title} — {formatFriendlyDate(m.date)}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-1 space-y-2">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Parent: add anything missed
              </p>

              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  value={choreTitle}
                  onChange={(e) => setChoreTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddChore();
                  }}
                  placeholder="A recurring chore"
                  className="flex-1 min-w-[8rem] bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={() =>
                    setChoreCadence(choreCadence === 'WEEKLY' ? 'DAILY' : 'WEEKLY')
                  }
                  className="px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-bold"
                >
                  {CADENCE_LABEL[choreCadence]}
                </button>
                <button
                  onClick={handleAddChore}
                  disabled={!choreTitle.trim()}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-40"
                >
                  Add
                </button>
              </div>

              <button
                onClick={onAddItem}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-all"
              >
                Or add a one-off: homework, key date or lesson
              </button>
            </div>
          </div>
        )}

        {step === 'APPROVALS' && (
          <div className="space-y-3">
            {approvalCount === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-900/70 rounded-xl border border-slate-800">
                Nothing waiting. Approvals for rewards, goals and marked papers would appear here.
              </p>
            ) : (
              <>
                {(pendingRewards?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                      Reward requests ({pendingRewards!.length})
                    </p>
                    {pendingRewards!.map((r) => (
                      <p key={r.id} className="text-[11px] text-slate-300">
                        · {r.rewardTitle} — {r.costXP} XP held
                      </p>
                    ))}
                  </div>
                )}
                {(pendingGoals?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                      Goals awaiting approval ({pendingGoals!.length})
                    </p>
                    {pendingGoals!.map((g) => (
                      <p key={g.id} className="text-[11px] text-slate-300">
                        · {g.title} — {g.weeklyHoursRequired} hrs/wk
                      </p>
                    ))}
                  </div>
                )}
                {(unverifiedPapers?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                      Marked work not yet verified ({unverifiedPapers!.length})
                    </p>
                    {unverifiedPapers!.map((a) => (
                      <p key={a.id} className="text-[11px] text-slate-300">
                        · {a.title} — {a.marksScored}/{a.marksAvailable} ({a.percentage}%)
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-slate-500">
                  Handle these in Rewards, Subjects &amp; Goals and the Proof Log — this is the
                  checklist, not the controls.
                </p>
              </>
            )}
          </div>
        )}

        {step === 'SIGN_OFF' && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-300 p-3 bg-slate-900/70 border border-slate-800 rounded-xl">
              Signing off closes the week of{' '}
              <span className="font-bold text-white">{weekDates}</span>: {weekSummary}.
              {weekStart !== lastWeek &&
                ' That is not the week just finished - step forward on the first page to close that one instead.'}
            </p>

            <div className="p-4 bg-emerald-950/25 border border-emerald-500/40 rounded-2xl">
              <div className="flex items-center gap-2 mb-2">
                <Handshake className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Agreed for the week now running</h3>
              </div>
              <p className="text-xs text-emerald-100">
                {commitment.committedCount - commitment.committedDone} tasks committed
                {commitment.committedHours > 0 && `, about ${commitment.committedHours} hours`}.
                Signing off records this in the change history so next week starts from something
                real rather than memory.
              </p>
            </div>

            {/* WA-4. The one output in the app addressed to more than one
                person - the film's last scene. Built from the numbers this
                modal is already showing, so it can never report a different
                week from the one on screen. */}
            <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl">
              <h3 className="text-sm font-bold text-white mb-0.5">Send the week to the family</h3>
              <p className="text-[11px] text-slate-400 mb-2.5">
                Everything above in one message. Nothing is sent until you tap.
              </p>
              <WhatsAppShare text={digestText} previewLabel="Read it first" />
            </div>

            <button
              onClick={handleSignOff}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Reviewed together</span>
            </button>
          </div>
        )}

        {/* Step navigation */}
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-800">
          <button
            onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].id)}
            disabled={stepIndex === 0}
            className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold disabled:opacity-30 flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          {stepIndex < STEPS.length - 1 && (
            <button
              onClick={() => setStep(STEPS[stepIndex + 1].id)}
              className="ml-auto px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Answer,
  GoalPace,
  GoalSeries,
  WeekSummary,
  WEEKS_SHOWN,
  readGoalSeries,
  readProgress,
  readWeekStrip,
} from '../../services/progressReport';
import { loadOutstanding } from '../../services/outstandingService';
import { HeadlineTone } from '../../services/headlineMetrics';
import { UserRole } from '../../types';
import { formatShortDate } from '../../utils/date';
import type { NavTab } from '../layout/Navigation';
import { LostTimeCard } from './LostTimeCard';
import { TimeCleanupCard } from './TimeCleanupCard';
import { WeekDetailPanel } from './WeekDetailPanel';
import {
  TrendingUp,
  ArrowRight,
  Inbox,
  FileCheck2,
  CheckCircle2,
  AlertTriangle,
  Circle,
  ChevronDown,
} from 'lucide-react';

/**
 * How Tejas is doing, looking back - the one screen that reports rather than
 * asks for something.
 *
 * Home, Plan and Updates each answer "what next?", and on 18 Oct 2026 it took
 * a database export and a script to answer a parent's three real questions:
 * is he doing the work, is the time going where we agreed, is it working. This
 * screen answers those three first, in a sentence each, and then shows the
 * term a week at a time so a trend is visible without remembering last week.
 *
 * Nothing here can be ticked or edited. A screen that both reports and asks is
 * read as one more list of jobs; the fixes it points at open the screen where
 * the decision is made. Built phone-first, because the Sunday review usually
 * happens on one.
 */

const TONE: Record<
  HeadlineTone,
  { ring: string; text: string; label: string; icon: typeof Circle }
> = {
  GOOD: {
    ring: 'border-emerald-500/40',
    text: 'text-emerald-300',
    label: 'On track',
    icon: CheckCircle2,
  },
  NEUTRAL: {
    ring: 'border-slate-700',
    text: 'text-sky-300',
    label: 'For information',
    icon: Circle,
  },
  WATCH: {
    ring: 'border-amber-500/40',
    text: 'text-amber-300',
    label: 'Worth a look',
    icon: AlertTriangle,
  },
  BAD: {
    ring: 'border-rose-500/40',
    text: 'text-rose-300',
    label: 'Needs a fix',
    icon: AlertTriangle,
  },
};

const weekLabel = (start: string, end: string) =>
  `${formatShortDate(start)} – ${formatShortDate(end)}`;

export const ProgressView: React.FC<{
  role: UserRole;
  onOpenTab: (tab: NavTab) => void;
  /**
   * The weekly review, from where the week is being looked at. Closing last
   * week and planning the next one used to start on the Plan tab, away from
   * the numbers the conversation is about.
   */
  onOpenReview?: () => void;
}> = ({ role, onOpenTab, onOpenReview }) => {
  const [weeks, setWeeks] = useState(WEEKS_SHOWN);
  const progress = useLiveQuery(() => readProgress(), []);
  const strip = useLiveQuery(() => readWeekStrip(weeks), [weeks]);
  const series = useLiveQuery(() => readGoalSeries(4), []);
  const waiting = useLiveQuery(() => loadOutstanding('PARENT'), []);

  if (!progress || !strip || !series) {
    return (
      <div className="glass-card p-5">
        <p className="text-[11px] text-slate-500">Adding it up…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="glass-card p-5 bg-gradient-to-r from-slate-900 via-emerald-950/20 to-slate-900 border-emerald-500/20">
        <div className="flex items-center gap-2 mb-1">
          <span className="p-2 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <TrendingUp className="w-5 h-5" aria-hidden="true" />
          </span>
          <h2 className="text-xl font-bold text-white">Progress</h2>
        </div>
        <p className="text-xs text-slate-300 max-w-2xl">
          How things are going, for looking at together. Week of{' '}
          {weekLabel(progress.week.start, progress.week.end)}. Nothing here needs ticking.
        </p>
        {onOpenReview && (
          <button
            type="button"
            onClick={onOpenReview}
            className="mt-3 flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
          >
            Start the weekly review
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <AnswerCard answer={progress.work} />
        <AnswerCard answer={progress.time} />
        <AnswerCard answer={progress.working} />
      </div>

      <LostTimeCard account={progress.account} onOpenTab={onOpenTab} />
      <TimeCleanupCard role={role} />

      {progress.keyDate && (
        <section className="glass-card p-4 border-sky-500/30 flex flex-wrap items-center gap-3">
          <FileCheck2 className="w-5 h-5 text-sky-300" aria-hidden="true" />
          <p className="flex-1 min-w-0 text-xs text-slate-200">
            <strong className="text-white">{progress.keyDate.title}</strong> is on{' '}
            {formatShortDate(progress.keyDate.date)}. When the mark comes back, logging it says more
            than any number on this page.
          </p>
          <button
            type="button"
            onClick={() => onOpenTab('LIBRARY')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-[10px] font-bold text-white"
          >
            Log a test
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </section>
      )}

      <WeekStrip
        strip={strip}
        weeks={weeks}
        onToggle={() => setWeeks(weeks === WEEKS_SHOWN ? 16 : WEEKS_SHOWN)}
      />

      <GoalRows series={series} />

      <section className="glass-card p-4">
        <h3 className="text-sm font-bold text-white mb-1">Latest marks</h3>
        {progress.latestMarks.length === 0 ? (
          <p className="text-xs text-slate-400">
            No marked work logged yet. {progress.topicsSecure} of {progress.topicsTotal} topics are
            secure, which is the only measure of understanding there is until a mark arrives.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {progress.latestMarks.map((mark) => (
              <li
                key={mark.subjectId}
                className="py-2 flex flex-wrap items-baseline gap-x-3 text-xs"
              >
                <span className="font-semibold text-white min-w-[8rem]">{mark.subjectName}</span>
                <span className="text-slate-300 tabular-nums">
                  {mark.assessment.marksScored}/{mark.assessment.marksAvailable} ·{' '}
                  {Math.round(mark.assessment.percentage)}%
                  {mark.assessment.gradeAwarded && ` · grade ${mark.assessment.gradeAwarded}`}
                </span>
                <span className="text-slate-500">
                  {mark.assessment.title}, {formatShortDate(mark.assessment.date)}
                  {mark.targetGrade ? ` · target ${mark.targetGrade}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {waiting && waiting.length > 0 && (
        <section className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Inbox className="w-4 h-4 text-indigo-300" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white">
              Waiting on a parent ({waiting.reduce((sum, item) => sum + (item.count ?? 1), 0)})
            </h3>
          </div>
          <ul className="space-y-1.5">
            {waiting.slice(0, 5).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="flex-1 min-w-0 text-slate-200">{item.title}</span>
                {role === 'PARENT' && (
                  <button
                    type="button"
                    onClick={() => onOpenTab(item.tab)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-bold text-indigo-200"
                  >
                    {item.action}
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

const AnswerCard: React.FC<{ answer: Answer }> = ({ answer }) => {
  const tone = TONE[answer.tone];
  const Icon = tone.icon;
  return (
    <section className={`glass-card p-4 border ${tone.ring}`}>
      <p
        className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold ${tone.text}`}
      >
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        {tone.label}
      </p>
      <h3 className="mt-1 text-xs font-semibold text-slate-400">{answer.question}</h3>
      <p className="mt-1 text-sm font-semibold text-white">{answer.headline}</p>
      <p className="mt-1 text-[11px] text-slate-400">{answer.detail}</p>
    </section>
  );
};

/**
 * The term, a row a week. Hours are drawn as counted against logged, so a
 * week where most of the time went nowhere looks different from a quiet week.
 */
const WeekStrip: React.FC<{
  strip: WeekSummary[];
  weeks: number;
  onToggle: () => void;
}> = ({ strip, weeks, onToggle }) => {
  const [open, setOpen] = useState<string | null>(null);
  const most = Math.max(1, ...strip.map((w) => w.loggedHours));
  const newestFirst = [...strip].reverse();

  return (
    <section className="glass-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-bold text-white">Week by week</h3>
          <p className="text-[10px] text-slate-500">
            Tap a week for its plan, what got done, and how it was recorded.
          </p>
        </div>
        <span className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" aria-hidden="true" /> counted
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/60" aria-hidden="true" /> towards
            nothing
          </span>
        </span>
      </div>
      <ul className="divide-y divide-slate-800">
        {newestFirst.map((w) => {
          const lost = Math.max(0, w.loggedHours - w.countedHours);
          const isOpen = open === w.week.start;
          return (
            <li key={w.week.start} className="py-2.5">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : w.week.start)}
                aria-expanded={isOpen}
                className="w-full text-left"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-xs font-semibold text-white">
                    {weekLabel(w.week.start, w.week.end)}
                    {w.isCurrent && (
                      <span className="ml-1.5 text-[10px] text-emerald-300">so far</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    {w.standingLabel}
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div
                    className="flex-1 h-2 rounded-full bg-slate-800/70 overflow-hidden flex gap-0.5"
                    role="img"
                    aria-label={`${w.countedHours} of ${w.loggedHours} hours counted`}
                  >
                    {w.countedHours > 0 && (
                      <span
                        className="h-full bg-emerald-400 rounded-l-full"
                        style={{ width: `${(w.countedHours / most) * 100}%` }}
                      />
                    )}
                    {lost > 0 && (
                      <span
                        className="h-full bg-amber-400/60 rounded-r-full"
                        style={{ width: `${(lost / most) * 100}%` }}
                      />
                    )}
                  </div>
                  <span className="w-24 text-right text-[11px] tabular-nums text-slate-200">
                    {w.loggedHours === 0 ? 'nothing' : `${w.countedHours}h of ${w.loggedHours}h`}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-slate-500 tabular-nums">
                  {w.workClosed} work finished · {w.daysCheckedIn}/7 days checked in ·{' '}
                  {w.topicsTaught} topics taught
                  {w.marksLogged > 0 && ` · ${w.marksLogged} marked`}
                </p>
              </button>
              {isOpen && <WeekDetailPanel weekStart={w.week.start} />}
            </li>
          );
        })}
      </ul>
      {/* Only when there is more to show: a strip already shorter than its
          window has nothing further back. */}
      {(strip.length >= weeks || weeks !== WEEKS_SHOWN) && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-[10px] font-bold"
        >
          {weeks === WEEKS_SHOWN ? 'Go back further' : `Last ${WEEKS_SHOWN} weeks only`}
        </button>
      )}
    </section>
  );
};

/**
 * The line's colour is what it says about the goal, so a flat line can never
 * pass for a healthy one - which, drawn green whatever the numbers, four of ten
 * did on 19 Oct 2026. Each pace is also written beside the line, so the colour
 * is never the only signal.
 */
const PACE: Record<GoalPace, { stroke: string; text: string; label: string }> = {
  MEETING: { stroke: 'rgb(52 211 153)', text: 'text-emerald-300', label: 'meeting its ask' },
  BELOW: { stroke: 'rgb(251 191 36)', text: 'text-amber-300', label: 'below its ask' },
  NO_ASK: { stroke: 'rgb(125 211 252)', text: 'text-sky-300', label: 'no weekly ask set' },
  NONE: { stroke: 'rgb(100 116 139)', text: 'text-slate-400', label: 'nothing counted' },
};

/**
 * Each agreed goal over four weeks against what it asks for - a trend, not a
 * burn-down. The dashed line is the ask; the last point is the week so far.
 */
const GoalRows: React.FC<{ series: GoalSeries[] }> = ({ series }) => (
  <section className="glass-card p-4">
    <h3 className="text-sm font-bold text-white mb-1">Agreed goals, last four weeks</h3>
    {series.length === 0 ? (
      <p className="text-xs text-slate-400">
        No goals agreed yet, so there is nothing for time to count towards.
      </p>
    ) : (
      <ul className="divide-y divide-slate-800">
        {series.map((s) => (
          <li key={s.goal.id} className="py-2 flex items-center gap-3">
            <span className="flex-1 min-w-0 text-xs text-slate-200">
              {s.goal.title}
              <span className="block text-[10px] text-slate-500 tabular-nums">
                <span className={PACE[s.pace].text}>{PACE[s.pace].label}</span>
                {s.pace === 'NONE'
                  ? ` · ${s.quietReason}`
                  : ` · averaging ${s.averageHours}h a week · asks ${s.askedHours}h`}
              </span>
            </span>
            <Sparkline values={s.weeklyHours} asked={s.askedHours} stroke={PACE[s.pace].stroke} />
          </li>
        ))}
      </ul>
    )}
  </section>
);

const Sparkline: React.FC<{ values: number[]; asked: number; stroke: string }> = ({
  values,
  asked,
  stroke,
}) => {
  const width = 96;
  const height = 28;
  const pad = 4;
  const top = Math.max(asked, ...values, 0.5);
  const x = (i: number) => pad + (i * (width - pad * 2)) / Math.max(1, values.length - 1);
  const y = (v: number) => height - pad - (v / top) * (height - pad * 2);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = values.length - 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Hours by week: ${values.join(', ')}. Asks ${asked} a week.`}
      className="flex-shrink-0"
    >
      {asked > 0 && (
        <line
          x1={pad}
          x2={width - pad}
          y1={y(asked)}
          y2={y(asked)}
          stroke="rgb(100 116 139)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <circle
        cx={x(last)}
        cy={y(values[last])}
        r={3}
        fill={stroke}
        stroke="rgb(15 23 42)"
        strokeWidth={1.5}
      />
    </svg>
  );
};

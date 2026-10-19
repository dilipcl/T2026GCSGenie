import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { WeekDetail, WeekWorkItem, WorkOutcome, readWeekDetail } from '../../services/weekDetail';
import { formatShortDate } from '../../utils/date';
import { CheckCircle2, Clock3, Circle } from 'lucide-react';

/**
 * One week, opened from the strip on Progress: the plan against what happened,
 * where the time went, how the week was recorded, and what it earned.
 *
 * Read-only, like the rest of the screen. A piece that slipped is fixed on the
 * Plan tab, where moving it is recorded as a decision; offering a tick here
 * would make the review screen one more list of jobs.
 */

const OUTCOME: Record<WorkOutcome, { label: string; icon: typeof Circle; className: string }> = {
  DONE_IN_WEEK: { label: 'Done', icon: CheckCircle2, className: 'text-emerald-300' },
  DONE_LATER: { label: 'Done later', icon: Clock3, className: 'text-sky-300' },
  NOT_DONE: { label: 'Not done', icon: Circle, className: 'text-amber-300' },
};

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

const PLAN_LINE: Record<WeekDetail['plan'], string> = {
  AGREED: 'Plan agreed',
  NOT_AGREED: 'Plan sent, never agreed',
  NONE: 'No plan for this week',
};

export const WeekDetailPanel: React.FC<{ weekStart: string }> = ({ weekStart }) => {
  const detail = useLiveQuery(() => readWeekDetail(weekStart), [weekStart]);
  const subjects = useLiveQuery(() => db.subjects.toArray(), []);

  if (!detail || !subjects) {
    return <p className="mt-2 text-[11px] text-slate-500">Opening the week…</p>;
  }

  const name = (id?: string) =>
    id ? (subjects.find((s) => s.id === id)?.shortName ?? id) : 'No subject';
  const { usage, points, time } = detail;
  const planned = detail.committed.length + detail.committedGone;
  const doneInWeek = detail.committed.filter((i) => i.outcome === 'DONE_IN_WEEK').length;

  return (
    <div className="mt-3 grid gap-4 border-t border-slate-800 pt-3">
      {/* The plan ----------------------------------------------------------- */}
      <div>
        <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
          {PLAN_LINE[detail.plan]}
          {detail.plannedHours !== undefined && ` · ${detail.plannedHours}h promised`}
        </h4>
        {planned > 0 && (
          <p className="mt-1 text-xs text-slate-200">
            {detail.plan === 'AGREED' ? (
              <>
                <strong className="text-white">
                  {detail.delivered} of {planned}
                </strong>{' '}
                planned pieces done
                {detail.delivered !== doneInWeek && ` (${doneInWeek} inside the week)`}.
              </>
            ) : (
              <>
                {planned} pieces were on it; {doneInWeek} got done that week.
              </>
            )}
          </p>
        )}
        {detail.notes.map((note) => (
          <p
            key={note.label}
            className="mt-1.5 text-[11px] text-slate-300 border-l-2 border-indigo-400/60 pl-2"
          >
            <span className="text-slate-500">{note.label}: </span>
            {note.text}
          </p>
        ))}
        <WorkList items={detail.committed} name={name} />
        {detail.committedGone > 0 && (
          <p className="mt-1 text-[10px] text-slate-500">
            {detail.committedGone} planned{' '}
            {detail.committedGone === 1 ? 'piece has' : 'pieces have'} since been deleted.
          </p>
        )}
        {detail.added.length > 0 && (
          <>
            <h5 className="mt-2 text-[10px] font-semibold text-slate-400">Added during the week</h5>
            <WorkList items={detail.added} name={name} />
          </>
        )}
        {detail.extra.length > 0 && (
          <>
            <h5 className="mt-2 text-[10px] font-semibold text-slate-400">
              {planned > 0 ? 'Also finished, not on the plan' : 'Finished this week'} (
              {detail.extra.length})
            </h5>
            <WorkList items={detail.extra} name={name} />
          </>
        )}
        {planned === 0 && detail.extra.length === 0 && (
          <p className="mt-1 text-xs text-slate-400">Nothing finished this week.</p>
        )}
      </div>

      {/* Where the time went ------------------------------------------------ */}
      {time.loggedMinutes > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
            Time · {hours(time.loggedMinutes)}h logged, {hours(time.countedMinutes)}h towards agreed
            goals
          </h4>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {detail.timeBySubject.map((s) => (
              <li
                key={s.subjectId ?? 'none'}
                className="px-2 py-0.5 rounded-md bg-slate-800 text-[11px] text-slate-200 tabular-nums"
              >
                {name(s.subjectId)} {hours(s.minutes)}h
              </li>
            ))}
          </ul>
          {time.lost.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {time.lost.map((lost) => (
                <li
                  key={`${lost.reason}-${lost.goal?.id ?? ''}-${lost.subjectId ?? ''}`}
                  className="text-[10px] text-amber-200/90"
                >
                  {hours(lost.minutes)}h lost: {lost.explanation}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Using the app ------------------------------------------------------ */}
      <div>
        <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
          How the week was recorded
        </h4>
        <dl className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
          <Fact label="Days checked in" value={`${usage.daysCheckedIn} of 7`} />
          <Fact label="Check-ins" value={usage.checkIns} />
          <Fact
            label="Lessons answered"
            value={
              usage.lessonsExpected > 0
                ? `${usage.lessonsAnswered} of ${usage.lessonsExpected}`
                : usage.lessonsAnswered
            }
          />
          <Fact label="Lesson notes written" value={usage.lessonNotes} />
          <Fact
            label="Files attached"
            value={
              usage.filesAttached > 0
                ? `${usage.filesAttached} (${usage.filesCaptioned} captioned)`
                : 0
            }
          />
          <Fact label="Marks logged" value={usage.marksLogged} />
        </dl>
        {usage.topicsAdded.length > 0 && (
          <>
            <h5 className="mt-2 text-[10px] font-semibold text-slate-400">
              Topics taught ({usage.topicsAdded.length})
            </h5>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {usage.topicsAdded.map((t) => (
                <li
                  key={t.id}
                  className="px-2 py-0.5 rounded-md bg-slate-800/70 text-[11px] text-slate-300"
                >
                  <span className="text-slate-500">{name(t.subjectId)} </span>
                  {t.title}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Points ------------------------------------------------------------- */}
      <div>
        <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
          Points · {points.earned} XP earned
          {points.spent > 0 && `, ${points.spent} spent`}
        </h4>
        {points.bySource.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-300 tabular-nums">
            {points.bySource.map((s) => (
              <li key={s.source}>
                {s.label} <span className="text-white font-semibold">{s.amount}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-slate-500">Nothing earned this week.</p>
        )}
      </div>
    </div>
  );
};

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between gap-2 min-w-0">
    <dt className="text-slate-500 truncate">{label}</dt>
    <dd className="text-slate-200 tabular-nums">{value}</dd>
  </div>
);

const WorkList: React.FC<{ items: WeekWorkItem[]; name: (id?: string) => string }> = ({
  items,
  name,
}) =>
  items.length === 0 ? null : (
    <ul className="mt-1.5 space-y-1">
      {items.map((item) => {
        const outcome = OUTCOME[item.outcome];
        const Icon = outcome.icon;
        return (
          <li key={item.id} className="flex items-start gap-2 text-xs">
            <Icon
              className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${outcome.className}`}
              aria-hidden="true"
            />
            <span className="flex-1 min-w-0 text-slate-200">
              {item.title}
              <span className="block text-[10px] text-slate-500">
                {name(item.subjectId)}
                {item.isFixUp && ' · fix-up'} · {outcome.label}
                {item.doneOn && item.outcome !== 'NOT_DONE' && `, ${formatShortDate(item.doneOn)}`}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );

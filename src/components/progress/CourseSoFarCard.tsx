import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { topicLog } from '../../services/topicTimeline';
import { Measure, PlanMeasure, summariseSubject } from '../../services/courseSummary';
import { BookOpen, ArrowRight } from 'lucide-react';

/**
 * How far into each course the topics have got, and how the work on them is
 * going - a block per subject.
 *
 * The fourth question on a Sunday, after the three Progress already answers:
 * is the content moving, and is it being worked on? Sections of the board's
 * outline say how far; the four meters say whether the homework is done, the
 * taught topics revised, notes kept and topics secure; the sentence says it in
 * words. All of it counts the topic log's own steps, which "Open the topic
 * log" shows topic by topic.
 *
 * One colour for every bar, on purpose. The label beside each bar says what it
 * is; a different hue per meter would read as a status (green good, amber
 * bad) that the numbers do not claim.
 */

const pct = (m: Measure) => (m.of === 0 ? 0 : Math.round((m.done / m.of) * 100));

const Meter: React.FC<{ label: string; measure: Measure; empty: string }> = ({
  label,
  measure,
  empty,
}) => (
  <div className="min-w-0">
    <div className="flex items-baseline justify-between gap-1 text-[10px]">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 tabular-nums">
        {measure.of === 0 ? empty : `${measure.done}/${measure.of}`}
      </span>
    </div>
    <div
      className="mt-0.5 h-1 rounded-full bg-slate-800 overflow-hidden"
      role="img"
      aria-label={
        measure.of === 0 ? `${label}: ${empty}` : `${label}: ${measure.done} of ${measure.of}`
      }
    >
      <div className="h-full bg-sky-400 rounded-full" style={{ width: `${pct(measure)}%` }} />
    </div>
  </div>
);

/**
 * The school's plan as one bar in three parts - taught, due now, behind - with
 * the counts written out, since the parts are what matter and a bar alone
 * would make the reader estimate them.
 */
const PlanBar: React.FC<{ plan: PlanMeasure }> = ({ plan }) => {
  const part = (n: number) => `${(n / plan.planned) * 100}%`;
  return (
    <div className="mt-2 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[10px]">
        <span className="text-slate-400">School plan</span>
        <span className="text-slate-200 tabular-nums">
          {plan.taught}/{plan.planned} taught
          {plan.dueNow > 0 && ` · ${plan.dueNow} this half-term`}
          {plan.behind > 0 && ` · ${plan.behind} from earlier`}
        </span>
      </div>
      <div
        className="mt-0.5 h-1 rounded-full bg-slate-800 overflow-hidden flex gap-px"
        role="img"
        aria-label={`School plan: ${plan.taught} of ${plan.planned} taught, ${plan.dueNow} due this half-term, ${plan.behind} from earlier half-terms`}
      >
        <div className="h-full bg-sky-400" style={{ width: part(plan.taught) }} />
        <div className="h-full bg-sky-400/40" style={{ width: part(plan.dueNow) }} />
        <div className="h-full bg-amber-400/70" style={{ width: part(plan.behind) }} />
      </div>
    </div>
  );
};

export const CourseSoFarCard: React.FC<{ onOpenTopicLog?: () => void }> = ({ onOpenTopicLog }) => {
  const logs = useLiveQuery(() => topicLog(), []);
  if (!logs) return null;

  const withOutline = logs.filter((log) => log.outline);
  if (withOutline.length === 0) return null;

  return (
    <section className="glass-card p-4" aria-labelledby="course-so-far">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 id="course-so-far" className="flex items-center gap-2 text-sm font-bold text-white">
          <BookOpen className="w-4 h-4 text-sky-300" aria-hidden="true" />
          The course so far
        </h3>
        {onOpenTopicLog && (
          <button
            type="button"
            onClick={onOpenTopicLog}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-sky-200"
          >
            Open the topic log
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400 mb-2">
        How far through each specification and the school's plan, and how the work on its
        topics is going. Homework counts pieces done; everything else counts topics already
        taught. Resources are set per subject in Parent › Study setup.
      </p>

      <ul className="divide-y divide-slate-800">
        {withOutline.map((log) => {
          const s = summariseSubject(log);
          return (
            <li key={log.subject.id} className="py-2.5" data-testid="course-subject">
              <div className="flex items-center gap-3 text-xs">
                <span className="w-24 flex-shrink-0 font-semibold text-slate-100 truncate">
                  {log.subject.shortName}
                </span>
                <span
                  className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden"
                  role="img"
                  aria-label={`${s.sectionsStarted} of ${s.sectionsTotal} sections started`}
                >
                  <span
                    className="block h-full bg-sky-400 rounded-full"
                    style={{ width: `${(s.sectionsStarted / s.sectionsTotal) * 100}%` }}
                  />
                </span>
                <span className="flex-shrink-0 text-right text-[10px] text-slate-400 tabular-nums">
                  {s.sectionsStarted}/{s.sectionsTotal} sections
                </span>
              </div>

              {s.topics > 0 && (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
                  <Meter label="Homework" measure={s.homework} empty="none set" />
                  <Meter label="Revised" measure={s.revised} empty="none taught" />
                  <Meter label="Notes" measure={s.notes} empty="none taught" />
                  <Meter label="Secure" measure={s.secure} empty="-" />
                </div>
              )}

              {s.topics > 0 && s.resources.length > 0 && (
                <div
                  className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5"
                  aria-label={`${log.subject.shortName} resources`}
                >
                  {s.resources.map((r) => (
                    <Meter key={r.resource.id} label={r.resource.name} measure={r} empty="-" />
                  ))}
                </div>
              )}

              {s.plan && <PlanBar plan={s.plan} />}

              <p className="mt-1.5 text-[11px] text-slate-300 leading-snug">{s.sentence}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

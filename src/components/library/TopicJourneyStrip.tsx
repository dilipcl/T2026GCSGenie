import React from 'react';
import { TopicJourney, SectionCoverage } from '../../services/topicTimeline';
import { formatShortDate } from '../../utils/date';

/**
 * A topic's five steps, the same five in the same order everywhere a topic is
 * listed: taught, homework, revised, notes, secure.
 *
 * Every step is written out ("Not revised", "Homework 1 of 2") rather than
 * shown as a coloured dot, so it reads without the colour and survives a
 * screenshot sent to a parent. Done steps are bright, steps not reached are
 * dim; nothing here is red, because a topic taught yesterday that has not been
 * revised is not behind.
 */

type Step = { label: string; done: boolean; partial?: boolean };

export function journeySteps(j: TopicJourney): Step[] {
  return [
    j.taught
      ? { label: `Taught ${formatShortDate(j.taught)}`, done: true }
      : { label: 'Not taught yet', done: false },
    j.homework.set === 0
      ? { label: 'No homework', done: false }
      : {
          label: `Homework ${j.homework.done} of ${j.homework.set}`,
          done: j.homework.done === j.homework.set,
          partial: j.homework.done < j.homework.set,
        },
    j.revision.sessions === 0
      ? { label: 'Not revised', done: false }
      : {
          label: `Revised ${j.revision.sessions}×${
            j.revision.last ? `, last ${formatShortDate(j.revision.last)}` : ''
          }`,
          done: true,
        },
    j.notes.captured + j.notes.lessonNotes === 0
      ? { label: 'No notes', done: false }
      : { label: `Notes ${j.notes.captured + j.notes.lessonNotes}`, done: true },
    j.secure ? { label: 'Secure', done: true } : { label: `Sure ${j.confidence}/5`, done: false },
  ];
}

/**
 * Spans throughout, not a list: the strip sits inside the button that opens a
 * topic, and a button may only hold phrasing content. The step labels are the
 * button's text, which is how a screen reader hears them anyway.
 */
export const TopicJourneyStrip: React.FC<{ journey: TopicJourney; showGap?: boolean }> = ({
  journey,
  showGap = true,
}) => (
  <span className="mt-1 block">
    <span className="flex flex-wrap gap-1" data-testid="topic-journey">
      {journeySteps(journey).map((step) => (
        <span
          key={step.label}
          className={`px-1.5 py-0.5 rounded-md text-[10px] leading-tight border ${
            step.done
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : step.partial
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          {step.label}
        </span>
      ))}
    </span>
    {showGap && journey.gap && (
      <span className="mt-1 block text-[10px] text-amber-300/90">{journey.gap}</span>
    )}
  </span>
);

/**
 * A subject's specification, section by section, with how many of its topics
 * have been met. A section with nothing in it yet is listed too - that is the
 * point of having the outline at all.
 */
export const SpecOutline: React.FC<{
  name: string;
  coverage: SectionCoverage[];
  unplaced: number;
}> = ({ name, coverage, unplaced }) => {
  const started = coverage.filter((c) => c.topics > 0).length;
  return (
    <details className="rounded-xl bg-slate-950/50 border border-slate-800 group">
      <summary className="cursor-pointer list-none p-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[11px] font-semibold text-slate-100">
          Specification: {started} of {coverage.length} sections started
        </span>
        <span className="text-[10px] text-slate-500">
          {name} · <span className="group-open:hidden">show</span>
          <span className="hidden group-open:inline">hide</span>
        </span>
      </summary>
      <ul className="px-2.5 pb-2.5 space-y-1">
        {coverage.map((c) => (
          <li key={c.section.ref} className="flex items-baseline gap-2 text-[11px]">
            <span className="w-9 flex-shrink-0 text-slate-500 tabular-nums">{c.section.ref}</span>
            <span className={`flex-1 min-w-0 ${c.topics ? 'text-slate-200' : 'text-slate-500'}`}>
              {c.section.title}
            </span>
            <span className="flex-shrink-0 text-[10px] text-slate-400 tabular-nums">
              {c.topics === 0
                ? 'not started'
                : `${c.topics} topic${c.topics === 1 ? '' : 's'}${
                    c.secure ? ` · ${c.secure} secure` : ''
                  }`}
            </span>
          </li>
        ))}
        {unplaced > 0 && (
          <li className="pt-1 text-[10px] text-slate-500">
            {unplaced} topic{unplaced === 1 ? '' : 's'} not placed in a section - skills, or titles
            the outline could not match. Open one to say where it belongs.
          </li>
        )}
      </ul>
    </details>
  );
};

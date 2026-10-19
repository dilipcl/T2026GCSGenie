import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { topicLog } from '../../services/topicTimeline';
import { BookOpen, ArrowRight } from 'lucide-react';

/**
 * How far into each course the topics have got, a line per subject.
 *
 * The fourth question on a Sunday, after the three Progress already answers:
 * is the content moving? A count of topics cannot say - nine Maths topics
 * could all be algebra. Sections of the board's outline can, and the topic
 * log behind this card shows which.
 */
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
        Sections of each specification with at least one topic in them.
      </p>
      <ul className="divide-y divide-slate-800">
        {withOutline.map((log) => {
          const started = log.coverage.filter((c) => c.topics > 0).length;
          const total = log.coverage.length;
          const secure = log.topics.filter((t) => t.journey.secure).length;
          return (
            <li key={log.subject.id} className="py-1.5 flex items-center gap-3 text-xs">
              <span className="w-24 flex-shrink-0 text-slate-200 truncate">
                {log.subject.shortName}
              </span>
              <span
                className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden"
                role="img"
                aria-label={`${started} of ${total} sections started`}
              >
                <span
                  className="block h-full bg-sky-400 rounded-full"
                  style={{ width: `${(started / total) * 100}%` }}
                />
              </span>
              <span className="w-28 flex-shrink-0 text-right text-[10px] text-slate-400 tabular-nums">
                {started}/{total} sections · {log.topics.length} topic
                {log.topics.length === 1 ? '' : 's'}
                {secure > 0 && `, ${secure} secure`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { SubjectLog, TopicSummary, topicLog } from '../../services/topicTimeline';
import { SubjectId } from '../../types';
import { formatShortDate } from '../../utils/date';
import { SpecOutline, TopicJourneyStrip } from './TopicJourneyStrip';
import { ChevronRight } from 'lucide-react';

/**
 * Every topic, every subject, in the order it was taught - one structure for
 * all of them.
 *
 * Asked for on 19 Oct 2026: a log that says, for each topic, when it was
 * taught, whether the homework was done, whether it has been revised, whether
 * there are notes, and where it sits in the course - without anybody having to
 * record anything new to make it. Everything here is read from lessons, work,
 * focus blocks and captured material that already say which topic they were
 * about; a topic that shows empty steps is one nothing has been tagged to yet,
 * and the subject's inbox is where that is fixed in a few taps.
 *
 * Read-only. Tapping a topic opens its page inside its subject, where the
 * confidence, the section and the tags are changed.
 */

const ALL = 'ALL';

/** Months as a reader scans them: "October 2026", newest first. */
function monthOf(date?: string): string {
  if (!date) return 'No teaching date';
  const [y, m] = date.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

interface Row {
  summary: TopicSummary;
  log: SubjectLog;
}

export const TopicLogView: React.FC<{
  onOpenTopic: (subjectId: SubjectId, topicId: string) => void;
}> = ({ onOpenTopic }) => {
  const logs = useLiveQuery(() => topicLog(), []);
  const [subject, setSubject] = useState<string>(ALL);

  const rows = useMemo<Row[]>(() => {
    if (!logs) return [];
    return logs
      .filter((log) => subject === ALL || log.subject.id === subject)
      .flatMap((log) => log.topics.map((summary) => ({ summary, log })))
      .sort(
        (a, b) =>
          (b.summary.journey.taught ?? '').localeCompare(a.summary.journey.taught ?? '') ||
          a.summary.topic.title.localeCompare(b.summary.topic.title)
      );
  }, [logs, subject]);

  const months = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const key = monthOf(row.summary.journey.taught);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()];
  }, [rows]);

  if (!logs) {
    return (
      <div className="glass-card p-5">
        <p className="text-[11px] text-slate-500">Reading the topics…</p>
      </div>
    );
  }

  const chosen = logs.find((log) => log.subject.id === subject);
  const withTopics = logs.filter((log) => log.topics.length > 0);
  const total = withTopics.reduce((sum, log) => sum + log.topics.length, 0);
  const secure = withTopics.reduce(
    (sum, log) => sum + log.topics.filter((t) => t.journey.secure).length,
    0
  );

  return (
    <div className="glass-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-white">Topic log</h3>
        <p className="text-[11px] text-slate-400">
          {total} topic{total === 1 ? '' : 's'} across {withTopics.length} subject
          {withTopics.length === 1 ? '' : 's'}, {secure} secure. Each shows the same five steps:
          taught, homework, revised, notes, secure.
        </p>
      </div>

      <div role="group" aria-label="Subject" className="flex flex-wrap gap-1.5">
        {[
          { id: ALL, label: 'All' },
          ...logs.map((l) => ({ id: l.subject.id as string, label: l.subject.shortName })),
        ].map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setSubject(chip.id)}
            aria-pressed={subject === chip.id}
            className={`px-2.5 py-1 rounded-full border text-[10px] font-bold transition-colors ${
              subject === chip.id
                ? 'bg-indigo-600 border-indigo-400 text-white'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {chosen?.outline && (
        <SpecOutline
          name={chosen.outline.name}
          coverage={chosen.coverage}
          unplaced={chosen.topics.filter((t) => !t.section).length}
        />
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">
          No topics yet{chosen ? ` for ${chosen.subject.name}` : ''}. Topics are added from a
          subject in the Library, or from a lesson in the check-in.
        </p>
      ) : (
        months.map(([month, list]) => (
          <div key={month}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              {month} ({list.length})
            </p>
            <ul className="space-y-1.5">
              {list.map(({ summary, log }) => (
                <li key={summary.topic.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTopic(log.subject.id, summary.topic.id)}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-indigo-500/40 transition-colors"
                  >
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] text-slate-500">
                          {log.subject.shortName}
                          {summary.section &&
                            ` · ${summary.topic.specRef || summary.section.ref} ${summary.section.title}`}
                          {summary.journey.taught &&
                            ` · ${formatShortDate(summary.journey.taught)}`}
                        </span>
                        <span className="block text-xs text-slate-100 break-words">
                          {summary.topic.title}
                        </span>
                      </span>
                      <ChevronRight
                        className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-1"
                        aria-hidden="true"
                      />
                    </span>
                    <TopicJourneyStrip journey={summary.journey} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
};

import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { WeekType } from '../../types';
import { DayOccurrence } from '../../services/dayPlan';
import { dayProgress } from '../../services/checkInOccurrenceService';
import { REASON_LABEL } from '../../services/commitmentService';
import { OccurrenceAnswer } from './OccurrenceAnswer';
import { formatShortDate, todayISO } from '../../utils/date';
import { Sparkles, CalendarClock } from 'lucide-react';

/**
 * The day, one row at a time.
 *
 * This replaces a single weekly question - "did these happen?" against a list
 * carrying a count - which could record that the week went badly but never
 * which part of it did. Air Cadets runs Tuesday and Friday; "1 of 2" is not
 * something a plan can act on, because it cannot say which one to move.
 *
 * The buttons themselves live in `OccurrenceAnswer`, shared with the home
 * screen's schedule card. They are the control the whole evidence score is
 * built from, and two copies of them would drift silently - both screens would
 * keep working while recording subtly different things.
 *
 * The count and the XP sit in the header because they are the reason to finish
 * the list. "9 of 12 answered - 18 of a possible 41 XP" is a reason to carry
 * on. A row that silently pays +2 is not.
 */

interface DayOccurrenceChecklistProps {
  date: string;
  weekType: WeekType;
}

const KIND_LABEL: Record<DayOccurrence['kind'], string> = {
  LESSON: 'Lesson',
  COMMITMENT: 'Activity',
  STUDY: 'Study',
  WORK: 'Committed work',
};

export const DayOccurrenceChecklist: React.FC<DayOccurrenceChecklistProps> = ({
  date,
  weekType,
}) => {
  /**
   * Dexie observes every table the query touches, so answering a row re-runs
   * this and the counter, the XP line and the row states all move together.
   * No local copy of the answers, and nothing to keep in step by hand.
   */
  const progress = useLiveQuery(() => dayProgress(date, weekType), [date, weekType]);

  if (!progress) {
    return <p className="text-[11px] text-slate-400">Reading the day…</p>;
  }

  const { shape, answered, pending, xpEarned, xpAvailable } = progress;

  const answers = new Map(answered.map((row) => [row.occurrenceKey, row]));
  const isBackfill = date < todayISO();

  /**
   * Committed work answered "Done", kept on screen.
   *
   * The day's shape drops work once it is completed, so answering "Done"
   * closed the task and the row vanished on the tap - taking with it any chance
   * to say how long it took. Drawn back from the answer itself, for display
   * only: the day's shape is what the counts and the week's score are built
   * on, and moving it would move every week already scored.
   */
  const inShape = new Set(shape.occurrences.map((o) => o.key));
  const answeredWork: DayOccurrence[] = answered
    .filter((row) => row.kind === 'WORK' && row.taskId && !inShape.has(row.occurrenceKey))
    .map((row) => ({
      key: row.occurrenceKey,
      kind: 'WORK',
      label: row.label,
      subjectId: row.subjectId,
      taskId: row.taskId,
      xp: row.xpAwarded,
    }));
  const rows = [...shape.occurrences, ...answeredWork];

  // After the answered work is drawn back: a weekend whose only rows were
  // committed work, all answered, is not a day with nothing on it.
  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-slate-400">
        Nothing timetabled for {formatShortDate(date)} — no check-in needed.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Counted over the day's shape, which the XP is built on - so on a day
          whose only rows are answered work drawn back above, there is no count
          to show rather than a "0 of 0". */}
      {shape.occurrences.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-cyan-100">
            {shape.occurrences.length - pending.length} of {shape.occurrences.length} answered
            {isBackfill && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-amber-300 font-semibold">
                <CalendarClock className="w-3 h-3" />
                catching up {formatShortDate(date)}
              </span>
            )}
          </p>
          <p className="text-[11px] text-slate-300 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-fuchsia-300" />
            <span className="font-bold text-fuchsia-200">{xpEarned}</span>
            <span className="text-slate-500">of a possible {xpAvailable} XP</span>
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <p className="text-[10px] text-slate-400">
          {pending.length} still to answer. Answering all of them is where most of the XP is —
          {isBackfill
            ? ' a late answer earns everything except the same-day bonus.'
            : ' finishing today keeps the on-the-day bonus.'}
        </p>
      )}

      <div className="space-y-1.5">
        {rows.map((occurrence) => {
          const existing = answers.get(occurrence.key);

          return (
            <div
              key={occurrence.key}
              className={`rounded-xl border px-3 py-2 transition-colors ${
                existing ? 'border-slate-700 bg-slate-900/60' : 'border-cyan-500/40 bg-cyan-950/25'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-[8rem] flex-1">
                  <p className="text-[11px] font-semibold text-white truncate">
                    {occurrence.label}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {KIND_LABEL[occurrence.kind]}
                    {occurrence.startTime && ` · ${occurrence.startTime}`}
                    {existing?.reasonCategory && ` · ${REASON_LABEL[existing.reasonCategory]}`}
                  </p>
                </div>

                <OccurrenceAnswer date={date} occurrence={occurrence} existing={existing} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

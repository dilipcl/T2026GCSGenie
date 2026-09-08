import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DayNote,
  DayRecord,
  dayMatches,
  dayRecords,
  summarise,
} from '../../services/dayRecordService';
import { REASON_LABEL } from '../../services/commitmentService';
import { OccurrenceOutcome } from '../../types';
import { formatPastDate, formatShortDate } from '../../utils/date';
import {
  BookOpen,
  Search,
  Check,
  Minus,
  X,
  MessageSquare,
  ArrowRightCircle,
  Paperclip,
  Link as LinkIcon,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

/**
 * The record: what happened, day by day, and everything anybody wrote about it.
 *
 * Tejas's report was that the app gives no overview - that tasks, check-ins and
 * evidence are visible only in fragments, and the notes hardest of all. He was
 * right, and the notes case was the worst of it: a note typed against a Physics
 * lesson was stored faithfully and then rendered nowhere afterwards, except
 * truncated on the row it was typed on.
 *
 * Organised by day because that is the unit the answers were given in. A
 * lesson, the note about the lesson, the homework finished that evening and the
 * photo of it are one episode; splitting them by type across four panes is what
 * made the record unreadable. Its own tab rather than a fifth pane inside
 * Updates, because "hard to find" is not fixed by adding another thing to
 * choose between.
 *
 * Notes are shown in full and never truncated. A note worth writing is worth
 * reading, and this is the only screen that shows them at all.
 */

const OUTCOME_STYLE: Record<OccurrenceOutcome, { tone: string; icon: typeof Check; label: string }> =
  {
    HAPPENED: { tone: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', icon: Check, label: 'Done' },
    PARTIAL: { tone: 'text-amber-300 bg-amber-500/15 border-amber-500/30', icon: Minus, label: 'Partly' },
    MISSED: { tone: 'text-rose-300 bg-rose-500/15 border-rose-500/30', icon: X, label: 'Missed' },
  };

const NOTE_STYLE: Record<DayNote['kind'], { label: string; icon: typeof MessageSquare; tone: string }> =
  {
    OCCURRENCE: { label: 'Note', icon: MessageSquare, tone: 'text-slate-300' },
    FOLLOW_UP: { label: 'Follow-up', icon: ArrowRightCircle, tone: 'text-violet-200' },
    CHECK_IN: { label: 'Check-in', icon: MessageSquare, tone: 'text-cyan-200' },
    // Never rendered here - see `written` below - but the map is exhaustive so
    // that adding a kind cannot silently fall through to nothing.
    REASON: { label: 'Reason', icon: MessageSquare, tone: 'text-amber-200' },
  };

/** How far back the diary reaches by default, and when asked for more. */
const DEFAULT_DAYS = 14;
const EXTENDED_DAYS = 60;

export const RecordView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [notesOnly, setNotesOnly] = useState(false);

  const records = useLiveQuery(() => dayRecords(days), [days]);

  const shown = useMemo(() => {
    if (!records) return [];
    return records
      .filter((day) => (notesOnly ? day.notes.length > 0 : true))
      .filter((day) => dayMatches(day, query));
  }, [records, query, notesOnly]);

  if (!records) {
    return (
      <div className="glass-card p-5">
        <p className="text-[11px] text-slate-500">Reading the record…</p>
      </div>
    );
  }

  const totals = summarise(records);

  return (
    <div className="space-y-4">
      <div className="glass-card p-5 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-indigo-500/30">
        <div className="flex items-center gap-2 mb-1">
          <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <BookOpen className="w-5 h-5" />
          </span>
          <h2 className="text-xl font-bold text-white">The record</h2>
        </div>
        <p className="text-xs text-slate-300 max-w-2xl">
          Every day, with how each lesson went, the work finished, what was written about it and
          the proof attached — in one place rather than four.
        </p>

        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
          <span>
            <strong className="text-white">{totals.days}</strong> days with something in them
          </span>
          <span>
            <strong className="text-white">{totals.occurrencesAnswered}</strong> check-ins answered
          </span>
          <span>
            <strong className="text-white">{totals.workFinished}</strong> pieces of work finished
          </span>
          <span>
            <strong className="text-white">{totals.notesWritten}</strong> notes written
          </span>
          <span>
            <strong className="text-white">{totals.filesAttached}</strong> files attached
          </span>
          <span className="flex items-center gap-1 text-fuchsia-200">
            <Sparkles className="w-3 h-3" />
            <strong>{totals.xp}</strong> XP
          </span>
        </div>
      </div>

      <div className="glass-card p-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the record — a subject, a word from a note, a file name"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-600"
          />
        </div>

        <button
          type="button"
          onClick={() => setNotesOnly((prev) => !prev)}
          className={`px-2.5 py-2 rounded-xl border text-[10px] font-bold whitespace-nowrap ${
            notesOnly
              ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          Days with notes ({records.filter((d) => d.notes.length > 0).length})
        </button>

        <button
          type="button"
          onClick={() => setDays(days === DEFAULT_DAYS ? EXTENDED_DAYS : DEFAULT_DAYS)}
          className="px-2.5 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-[10px] font-bold whitespace-nowrap"
        >
          {days === DEFAULT_DAYS ? 'Go back further' : 'Last 2 weeks only'}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-300">
            {query || notesOnly ? 'Nothing matches that' : 'Nothing recorded yet'}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {query
              ? 'Every word has to appear, so try fewer.'
              : 'Answer a check-in or finish some work and it will show up here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((day) => (
            <DayCard key={day.date} day={day} />
          ))}
        </div>
      )}
    </div>
  );
};

const DayCard: React.FC<{ day: DayRecord }> = ({ day }) => {
  /**
   * Whether the heading still needs the date spelled out beside it.
   *
   * `formatPastDate` is relative for the last week - "Yesterday", "Wednesday" -
   * where the date genuinely adds something, and absolute beyond that - "Tue 1
   * Sept" - where repeating it reads as a stutter.
   *
   * Derived by asking what it actually returned rather than by re-deriving the
   * six-day rule here. A second copy of that rule is precisely the kind of
   * duplication that drifts the moment either side is tuned, and this file has
   * already been bitten once by two date helpers disagreeing.
   */
  const shortDate = formatShortDate(day.date);
  const showDate = !formatPastDate(day.date).includes(shortDate);

  /**
   * Reasons are excluded here and only here: the outcome chips above already
   * carry them ("Maths · Illness"), and repeating them underneath would say the
   * same thing twice on one card. The weekly review has no chips, so it shows
   * them - which is the whole reason they are on the day record at all.
   */
  const written = day.notes.filter((note) => note.kind !== 'REASON');

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2 mb-3 border-b border-slate-800">
        {/* `formatPastDate`, never `formatFriendlyDate`.

            The friendly one answers "how soon?" and returns "Overdue by 4 days"
            for a date in the past - which as the heading of a diary entry is
            nonsense: a day that has happened cannot be overdue. This one answers
            "how long ago?", which is the question a record is asking. */}
        <h3 className="text-sm font-bold text-white">
          {formatPastDate(day.date)}
          {showDate && (
            <span className="ml-2 text-[11px] font-normal text-slate-500">
              {shortDate}
            </span>
          )}
        </h3>
        <span className="text-[11px] text-slate-400 flex items-center gap-1">
          {day.xp > 0 && (
            <>
              <Sparkles className="w-3 h-3 text-fuchsia-300" />
              <span className="text-fuchsia-200 font-bold">{day.xp} XP</span>
            </>
          )}
        </span>
      </div>

      {day.occurrences.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            How the day went
          </p>
          <div className="flex flex-wrap gap-1.5">
            {day.occurrences.map((row) => {
              const style = OUTCOME_STYLE[row.outcome];
              const Icon = style.icon;
              return (
                <span
                  key={row.id}
                  title={row.reasonCategory ? REASON_LABEL[row.reasonCategory] : undefined}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold ${style.tone}`}
                >
                  <Icon className="w-3 h-3" />
                  {row.label}
                  {row.reasonCategory && (
                    <span className="font-normal opacity-80">· {REASON_LABEL[row.reasonCategory]}</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {day.work.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Work finished
          </p>
          <ul className="space-y-1">
            {day.work.map((item) => (
              <li
                key={item.taskId}
                className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800"
              >
                <span className="text-[11px] text-slate-100 min-w-0 flex-1">{item.title}</span>

                {item.evidence.map((ref, index) =>
                  ref.url ? (
                    <a
                      key={index}
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-[10px] text-indigo-300"
                    >
                      {ref.kind === 'LINK' ? (
                        <LinkIcon className="w-2.5 h-2.5" />
                      ) : (
                        <Paperclip className="w-2.5 h-2.5" />
                      )}
                      <span className="truncate max-w-[10rem]">{ref.label}</span>
                    </a>
                  ) : (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400"
                    >
                      <Paperclip className="w-2.5 h-2.5" />
                      <span className="truncate max-w-[10rem]">{ref.label}</span>
                    </span>
                  )
                )}

                {item.missingEvidence && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 font-semibold">
                    <AlertTriangle className="w-3 h-3" />
                    nothing attached
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* In full, never truncated. This is the only screen that shows them at
          all, and a note worth writing is worth reading. */}
      {written.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            What was written
          </p>
          <ul className="space-y-1.5">
            {written.map((note, index) => {
              const style = NOTE_STYLE[note.kind];
              const Icon = style.icon;
              return (
                <li
                  key={index}
                  className="px-2.5 py-2 rounded-lg bg-slate-900/70 border border-slate-800"
                >
                  <p className="text-[10px] text-slate-500 flex items-center gap-1 mb-0.5">
                    <Icon className={`w-3 h-3 ${style.tone}`} />
                    <span className="font-bold">{style.label}</span>
                    <span>· {note.about}</span>
                  </p>
                  <p className={`text-[11px] leading-relaxed ${style.tone}`}>{note.text}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {day.checkIn && (
        <p className="text-[10px] text-slate-500">
          Check-in · energy {day.checkIn.energyLevel}/5 · focus{' '}
          {day.checkIn.focusRating.toLowerCase()}
          {day.checkIn.completedRevisionMinutes > 0 &&
            ` · ${day.checkIn.completedRevisionMinutes} min of revision`}
        </p>
      )}

      {day.attachments.length > 0 && (
        <p className="text-[10px] text-slate-500 mt-1">
          {day.attachments.length} file{day.attachments.length === 1 ? '' : 's'} added this day
        </p>
      )}
    </div>
  );
};

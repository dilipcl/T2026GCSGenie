import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { OccurrenceOutcome, WeekType } from '../../types';
import { DayOccurrence } from '../../services/dayPlan';
import { dayProgress, recordOccurrence } from '../../services/checkInOccurrenceService';
import { formatShortDate, todayISO } from '../../utils/date';
import { Check, Minus, X, MessageSquarePlus, Sparkles, CalendarClock } from 'lucide-react';

/**
 * The day, one row at a time.
 *
 * This replaces a single weekly question - "did these happen?" against a list
 * carrying a count - which could record that the week went badly but never
 * which part of it did. Air Cadets runs Tuesday and Friday; "1 of 2" is not
 * something a plan can act on, because it cannot say which one to move.
 *
 * Every row is one dated occurrence and saves the moment it is tapped. There is
 * no separate save step on purpose: a form that can be half-filled and then
 * abandoned loses the answers that were already given, and this is the screen
 * most likely to be filled in on a phone, at night, with one thumb.
 *
 * Every button carries an explicit `type="button"`. This list renders inside
 * the check-in modal's form, where a button with no type is a submit button -
 * so ticking one row off saved and closed the entire check-in.
 *
 * The count and the XP sit in the header for the same reason. "9 of 12
 * answered - 18 of a possible 41 XP" is a reason to finish the list. A row that
 * silently pays +2 is not.
 */

interface DayOccurrenceChecklistProps {
  date: string;
  weekType: WeekType;
}

const OUTCOMES: Array<{
  value: OccurrenceOutcome;
  label: string;
  icon: typeof Check;
  tone: string;
}> = [
  { value: 'HAPPENED', label: 'Done', icon: Check, tone: 'bg-emerald-500 text-slate-950' },
  { value: 'PARTIAL', label: 'Partly', icon: Minus, tone: 'bg-amber-500 text-slate-950' },
  { value: 'MISSED', label: 'Missed', icon: X, tone: 'bg-rose-500 text-slate-950' },
];

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
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [followUpDraft, setFollowUpDraft] = useState('');

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

  if (shape.occurrences.length === 0) {
    return (
      <p className="text-[11px] text-slate-400">
        Nothing timetabled for {formatShortDate(date)} — no check-in needed.
      </p>
    );
  }

  const answers = new Map(answered.map((row) => [row.occurrenceKey, row]));
  const isBackfill = date < todayISO();

  const answer = async (occurrence: DayOccurrence, outcome: OccurrenceOutcome) => {
    await recordOccurrence({ date, occurrence, outcome });
  };

  const saveNote = async (occurrence: DayOccurrence) => {
    const existing = answers.get(occurrence.key);
    await recordOccurrence({
      date,
      occurrence,
      outcome: existing?.outcome ?? 'HAPPENED',
      notes: noteDraft,
      followUp: followUpDraft,
    });
    setOpenNote(null);
    setNoteDraft('');
    setFollowUpDraft('');
  };

  return (
    <div className="space-y-2">
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

      {pending.length > 0 && (
        <p className="text-[10px] text-slate-400">
          {pending.length} still to answer. Answering all of them is where most of the XP is —
          {isBackfill
            ? ' a late answer earns everything except the same-day bonus.'
            : ' finishing today keeps the on-the-day bonus.'}
        </p>
      )}

      <div className="space-y-1.5">
        {shape.occurrences.map((occurrence) => {
          const existing = answers.get(occurrence.key);
          const isOpen = openNote === occurrence.key;

          return (
            <div
              key={occurrence.key}
              className={`rounded-xl border px-3 py-2 transition-colors ${
                existing
                  ? 'border-slate-700 bg-slate-900/60'
                  : 'border-cyan-500/40 bg-cyan-950/25'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-white truncate">
                    {occurrence.label}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {KIND_LABEL[occurrence.kind]}
                    {occurrence.startTime && ` · ${occurrence.startTime}`}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  {OUTCOMES.map(({ value, label, icon: Icon, tone }) => {
                    const active = existing?.outcome === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => answer(occurrence, value)}
                        aria-pressed={active}
                        title={label}
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                          active ? tone : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setOpenNote(isOpen ? null : occurrence.key);
                      setNoteDraft(existing?.notes ?? '');
                      setFollowUpDraft(existing?.followUp ?? '');
                    }}
                    title="Add a note or something to follow up"
                    className={`p-1.5 rounded-lg transition-all ${
                      existing?.followUp
                        ? 'bg-violet-500/30 text-violet-200'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <MessageSquarePlus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-2 space-y-1.5">
                  <input
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="What happened?"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-white placeholder-slate-500"
                  />
                  <input
                    value={followUpDraft}
                    onChange={(e) => setFollowUpDraft(e.target.value)}
                    placeholder="Anything to do about it? This becomes work you get XP for."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-white placeholder-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => saveNote(occurrence)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[10px] font-bold"
                  >
                    Save
                  </button>
                </div>
              )}

              {!isOpen && existing?.followUp && (
                <p className="mt-1 text-[10px] text-violet-300 truncate">
                  Follow-up: {existing.followUp}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

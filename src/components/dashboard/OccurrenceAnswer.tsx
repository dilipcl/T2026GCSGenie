import React, { useState } from 'react';
import { CheckInOccurrence, ExceptionReasonCategory, OccurrenceOutcome } from '../../types';
import { DayOccurrence } from '../../services/dayPlan';
import { recordOccurrence } from '../../services/checkInOccurrenceService';
import { REASON_LABEL, REASON_ICON } from '../../services/commitmentService';
import { Check, Minus, X, MessageSquarePlus } from 'lucide-react';

/**
 * Answering one thing that was supposed to happen.
 *
 * Extracted because it now appears twice - on the home screen against each
 * lesson, and inside the full check-in - and these are the buttons the whole
 * evidence score is built from. Two copies of them would drift, and the drift
 * would be silent: both screens would keep working, while recording subtly
 * different things.
 *
 * Three taps wide, and it saves on the tap. There is no submit step on purpose:
 * this is the control most likely to be used on a phone, at night, with one
 * thumb, and a form that can be half-filled and abandoned loses the answers
 * already given.
 *
 * The reason picker only appears once an answer says something went wrong,
 * because that is the only time there is anything to explain. Asking "why?"
 * after "yes it happened" is the sort of unnecessary question that gets a
 * check-in skipped altogether.
 */

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

const REASONS: ExceptionReasonCategory[] = [
  'ILLNESS',
  'FAMILY',
  'SCHOOL_TRIP',
  'MOCK_PREP',
  'STAND_DOWN',
  'OTHER',
];

interface OccurrenceAnswerProps {
  date: string;
  occurrence: DayOccurrence;
  /** The answer already on record, if this has been answered before. */
  existing?: CheckInOccurrence;
  /** Hides the note affordance where the host has its own. */
  allowNote?: boolean;
}

export const OccurrenceAnswer: React.FC<OccurrenceAnswerProps> = ({
  date,
  occurrence,
  existing,
  allowNote = true,
}) => {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(existing?.notes ?? '');
  const [followUpDraft, setFollowUpDraft] = useState(existing?.followUp ?? '');

  /**
   * Every write carries the whole answer, because `recordOccurrence` replaces
   * the row rather than merging into it. Sending only the field that changed
   * would silently drop the reason the moment somebody added a note.
   */
  const save = async (patch: Partial<Parameters<typeof recordOccurrence>[0]>) => {
    await recordOccurrence({
      date,
      occurrence,
      outcome: existing?.outcome ?? 'HAPPENED',
      notes: existing?.notes,
      reasonCategory: existing?.reasonCategory,
      followUp: existing?.followUp,
      ...patch,
    });
  };

  const answered = !!existing;
  const wentWrong = existing?.outcome === 'PARTIAL' || existing?.outcome === 'MISSED';

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        {OUTCOMES.map(({ value, label, icon: Icon, tone }) => {
          const active = existing?.outcome === value;
          return (
            <button
              key={value}
              /* Explicit, because this renders inside the check-in modal's form
                 where a button with no type submits it - so answering one row
                 used to save and close the entire check-in. */
              type="button"
              onClick={() => save({ outcome: value })}
              aria-pressed={active}
              aria-label={`${label} — ${occurrence.label}`}
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

        {allowNote && answered && (
          <button
            type="button"
            onClick={() => {
              setNoteOpen((prev) => !prev);
              setNoteDraft(existing?.notes ?? '');
              setFollowUpDraft(existing?.followUp ?? '');
            }}
            title="Add a note, or something to follow up"
            aria-label={`Add a note about ${occurrence.label}`}
            className={`p-1.5 rounded-lg transition-all ${
              existing?.followUp
                ? 'bg-violet-500/30 text-violet-200'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            <MessageSquarePlus className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Why, from a list.

          Typing a sentence is a small tax, and this is the screen where a small
          tax means the check-in does not get done. It also makes the answer
          countable: "three Physics lessons missed for Cadets" is a pattern
          worth seeing, and free text will never yield it. */}
      {wentWrong && (
        <select
          value={existing?.reasonCategory ?? ''}
          onChange={(e) =>
            save({
              reasonCategory: (e.target.value || undefined) as
                | ExceptionReasonCategory
                | undefined,
            })
          }
          aria-label={`Why was ${occurrence.label} not done?`}
          className="mt-1.5 w-full bg-slate-950 border border-amber-500/40 rounded-lg px-2 py-1 text-[10px] text-amber-100"
        >
          <option value="">Why? (optional)</option>
          {REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {REASON_ICON[reason]} {REASON_LABEL[reason]}
            </option>
          ))}
        </select>
      )}

      {noteOpen && (
        <div className="mt-1.5 space-y-1.5">
          <input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Anything worth remembering?"
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
            onClick={async () => {
              await save({ notes: noteDraft, followUp: followUpDraft });
              setNoteOpen(false);
            }}
            className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[10px] font-bold"
          >
            Save
          </button>
        </div>
      )}

      {!noteOpen && existing?.followUp && (
        <p className="mt-1 text-[10px] text-violet-300 truncate">
          Follow-up: {existing.followUp}
        </p>
      )}
    </div>
  );
};

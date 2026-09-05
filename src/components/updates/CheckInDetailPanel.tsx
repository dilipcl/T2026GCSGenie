import React, { useState } from 'react';
import { CheckInDetail, checkInDetail, checkInNotes } from '../../services/checkInDetail';
import { OccurrenceOutcome } from '../../types';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

/**
 * What a check-in actually said, under the line saying that one happened.
 *
 * The feed's summary is a receipt: energy, focus, a count of tasks, some
 * minutes, the XP. It says two tasks were ticked without saying which, says 45
 * minutes without saying what was studied, and drops the notes entirely - and
 * the notes are the part somebody wrote down precisely so it would be read
 * later. Folded away rather than always open, because most rows are scrolled
 * past and a feed that prints everything is a feed nobody scans.
 */

const FOCUS_LABEL: Record<string, string> = {
  LOW: 'Low focus',
  NORMAL: 'Normal focus',
  HIGH: 'High focus',
};

const OUTCOME_STYLE: Record<OccurrenceOutcome, { label: string; className: string }> = {
  HAPPENED: { label: 'Happened', className: 'bg-emerald-500/15 text-emerald-300' },
  PARTIAL: { label: 'Partly', className: 'bg-amber-500/15 text-amber-300' },
  MISSED: { label: 'Missed', className: 'bg-rose-500/15 text-rose-300' },
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wide">{label}</p>
    <div className="text-xs text-slate-200 mt-0.5">{children}</div>
  </div>
);

export const CheckInDetailPanel: React.FC<{ checkInId: string }> = ({ checkInId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [detail, setDetail] = useState<CheckInDetail | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'gone'>('idle');

  const toggle = async () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    // Loaded on demand and kept, so scrolling the feed never queries a record
    // nobody opened and re-opening a row costs nothing.
    if (state !== 'idle') return;

    setState('loading');
    const loaded = await checkInDetail(checkInId);
    setDetail(loaded);
    setState(loaded ? 'ready' : 'gone');
  };

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-300 hover:text-indigo-200 transition-colors"
      >
        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {isOpen ? 'Hide what was said' : 'See what was said'}
      </button>

      {isOpen && state === 'loading' && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Reading it back...
        </p>
      )}

      {isOpen && state === 'gone' && (
        <p className="text-[11px] text-slate-500 mt-1.5">
          This check-in is no longer stored, so only the line above survives.
        </p>
      )}

      {isOpen && state === 'ready' && detail && (
        <div className="mt-2 p-3 rounded-xl bg-slate-950/50 border border-slate-800 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Session">{detail.checkIn.session.replace(/_/g, ' ').toLowerCase()}</Field>
            <Field label="Energy">{detail.checkIn.energyLevel} of 5</Field>
            <Field label="Focus">
              {FOCUS_LABEL[detail.checkIn.focusRating] ?? detail.checkIn.focusRating}
            </Field>
            <Field label="XP">
              +{detail.checkIn.xpEarned}
              {detail.checkIn.isDailyBaseXPAwarded && (
                <span className="text-slate-500"> · daily base paid</span>
              )}
            </Field>
          </div>

          {detail.checkIn.completedRevisionMinutes > 0 && (
            <Field label="Study logged">
              {detail.checkIn.completedRevisionMinutes} minutes
              {detail.studySubjectName && ` on ${detail.studySubjectName}`}
              {detail.studyGoalTitle && (
                <span className="text-slate-400"> · towards {detail.studyGoalTitle}</span>
              )}
            </Field>
          )}

          {detail.completedWork.length > 0 && (
            <Field label={`Work ticked off (${detail.completedWork.length})`}>
              <ul className="space-y-0.5">
                {detail.completedWork.map((work) => (
                  <li
                    key={work.id}
                    className={work.missing ? 'text-slate-500 italic' : 'text-slate-200'}
                  >
                    {work.title}
                  </li>
                ))}
              </ul>
            </Field>
          )}

          {/* The notes. The whole reason for opening this. */}
          {checkInNotes(detail.checkIn).map((note) => (
            <Field key={note.label} label={note.label}>
              <p className="whitespace-pre-wrap break-words leading-snug">{note.text}</p>
            </Field>
          ))}

          {detail.occurrences.length > 0 && (
            <Field label={`The day, answered (${detail.occurrences.length})`}>
              <ul className="space-y-1 mt-1">
                {detail.occurrences.map((o) => {
                  const style = OUTCOME_STYLE[o.outcome];
                  return (
                    <li key={o.id} className="flex items-baseline gap-2 flex-wrap">
                      <span
                        className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${style.className}`}
                      >
                        {style.label}
                      </span>
                      <span className="text-slate-200">{o.label}</span>
                      {!!o.minutes && <span className="text-slate-500">{o.minutes}m</span>}
                      {o.notes && <span className="text-slate-400">— {o.notes}</span>}
                    </li>
                  );
                })}
              </ul>
              {detail.occurrenceXp > 0 && (
                <p className="text-[10px] text-slate-500 mt-1">
                  +{detail.occurrenceXp} XP from the day, bonuses included.
                </p>
              )}
            </Field>
          )}

          {detail.followUps.length > 0 && (
            <Field label={`Raised for later (${detail.followUps.length})`}>
              <ul className="space-y-0.5">
                {detail.followUps.map((o) => (
                  <li key={o.id} className="text-amber-200/90">
                    {o.followUp}
                    <span className="text-slate-500"> · from {o.label}</span>
                    {!o.followUpTaskId && (
                      <span className="text-slate-500"> · not yet made into work</span>
                    )}
                  </li>
                ))}
              </ul>
            </Field>
          )}
        </div>
      )}
    </div>
  );
};

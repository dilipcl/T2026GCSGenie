import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { TimetableSlotConfig } from '../../types';
import { logFieldChanges } from '../../services/auditService';
import {
  applyPeriodTimeToLessons,
  previewPeriodTimeChange,
} from '../../services/periodTimeService';
import { useFeedback } from '../shared/FeedbackProvider';
import { Clock, ChevronDown, ChevronUp, Save, CalendarClock } from 'lucide-react';

/**
 * The bell times behind the period chips.
 *
 * Editing a single lesson has always changed that lesson, but the period
 * *defaults* came from seedData - so a school moving Period 1 by ten minutes
 * meant every new lesson was added at the old time and quietly corrected by
 * hand each time.
 *
 * Changing a default used to stop there, and that was the bug Tejas reported:
 * he moved a period and every day kept the old time, because the lessons
 * already on the timetable carry their own. "Apply to the lessons already on
 * the timetable" is on by default now, because moving the bell and expecting
 * the day to follow is the normal case, not the exception - and lessons
 * somebody has given custom times are excluded from it and named, so the
 * outlier a shortened Friday represents survives the change that caused it.
 */
export const PeriodTimesPanel: React.FC = () => {
  const { toast } = useFeedback();
  const slots = useLiveQuery(() => db.timetableSlots.toArray(), [], []);
  const entries = useLiveQuery(() => db.timetableEntries.toArray(), [], []);

  const [isOpen, setIsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { start: string; end: string }>>({});
  const [applyToLessons, setApplyToLessons] = useState(true);
  const [busy, setBusy] = useState(false);

  const ordered = [...slots].sort((a, b) => a.defaultStartTime.localeCompare(b.defaultStartTime));

  const draftFor = (slot: TimetableSlotConfig) =>
    drafts[slot.id] ?? { start: slot.defaultStartTime, end: slot.defaultEndTime };

  const setDraft = (slot: TimetableSlotConfig, patch: { start?: string; end?: string }) =>
    setDrafts((current) => ({ ...current, [slot.id]: { ...draftFor(slot), ...patch } }));

  const changedSlots = ordered.filter((slot) => {
    const draft = drafts[slot.id];
    return draft && (draft.start !== slot.defaultStartTime || draft.end !== slot.defaultEndTime);
  });
  const dirtyCount = changedSlots.length;

  /**
   * How many lessons the pending edits would move, counted from the times on
   * screen rather than from a query, so the number updates as the inputs do.
   */
  const impact = changedSlots.reduce(
    (totals, slot) => {
      for (const entry of entries) {
        if (entry.slotName !== slot.name) continue;
        if (entry.startTime === slot.defaultStartTime && entry.endTime === slot.defaultEndTime) {
          totals.following += 1;
        } else {
          totals.outliers += 1;
        }
      }
      return totals;
    },
    { following: 0, outliers: 0 }
  );

  const handleSave = async () => {
    if (busy || dirtyCount === 0) return;
    setBusy(true);

    try {
      let moved = 0;

      for (const slot of changedSlots) {
        const draft = drafts[slot.id];

        // Read before the default moves. Once the slot carries the new times,
        // "still at the old times" no longer matches anything.
        const lessons = applyToLessons ? await previewPeriodTimeChange(slot) : undefined;

        const fields = { defaultStartTime: draft.start, defaultEndTime: draft.end };
        await db.timetableSlots.update(slot.id, fields);
        await logFieldChanges({
          user: 'PARENT',
          entity: 'TimetableSlotConfig',
          entityId: slot.id,
          before: slot as unknown as Record<string, unknown>,
          after: fields as unknown as Record<string, unknown>,
          labels: { defaultStartTime: `${slot.name} starts`, defaultEndTime: `${slot.name} ends` },
        });

        if (lessons) {
          moved += await applyPeriodTimeToLessons(lessons, {
            startTime: draft.start,
            endTime: draft.end,
          });
        }
      }

      setDrafts({});
      toast.success(
        'Period times saved',
        moved > 0
          ? `${moved} lesson${moved === 1 ? '' : 's'} moved to match.`
          : 'New lessons will use these by default.'
      );
    } catch (err) {
      console.error('Could not save period times:', err);
      toast.error('Could not save those times', 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card p-4">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold text-white">Period times</span>
          <span className="text-[11px] text-slate-500">
            {ordered.length} slots · used as the default for new lessons
          </span>
        </span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-2">
          {ordered.map((slot) => {
            const draft = draftFor(slot);
            return (
              <div
                key={slot.id}
                className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-900/70 border border-slate-800 rounded-xl"
              >
                <span className="text-xs font-semibold text-white flex items-center gap-2">
                  {slot.name}
                  {slot.isBreakOrLunch && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      break
                    </span>
                  )}
                </span>

                <span className="flex items-center gap-1.5">
                  <input
                    type="time"
                    aria-label={`${slot.name} start time`}
                    value={draft.start}
                    onChange={(e) => setDraft(slot, { start: e.target.value })}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white"
                  />
                  <span className="text-slate-500 text-xs">to</span>
                  <input
                    type="time"
                    aria-label={`${slot.name} end time`}
                    value={draft.end}
                    onChange={(e) => setDraft(slot, { end: e.target.value })}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white"
                  />
                </span>
              </div>
            );
          })}

          <label className="flex items-start gap-2.5 p-2.5 bg-slate-900/70 border border-slate-800 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={applyToLessons}
              onChange={(e) => setApplyToLessons(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-emerald-500 shrink-0"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-white">
                <CalendarClock className="w-3.5 h-3.5 text-emerald-400" />
                Apply to lessons already on the timetable
              </span>
              <span className="block text-[10px] text-slate-400 mt-0.5">
                {dirtyCount === 0
                  ? 'Every day using this period moves with it, on both odd and even weeks.'
                  : `${impact.following} lesson${
                      impact.following === 1 ? '' : 's'
                    } across all days will move to match.`}
                {impact.outliers > 0 && (
                  <span className="text-amber-300/80">
                    {' '}
                    {impact.outliers} lesson{impact.outliers === 1 ? '' : 's'} with{' '}
                    {impact.outliers === 1 ? 'its' : 'their'} own times stay put - edit{' '}
                    {impact.outliers === 1 ? 'it' : 'them'} directly to move{' '}
                    {impact.outliers === 1 ? 'it' : 'them'}.
                  </span>
                )}
              </span>
            </span>
          </label>

          {!applyToLessons && (
            <p className="text-[10px] text-slate-500">
              Only the default for new lessons changes. Lessons already on the timetable keep the
              times they have.
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={busy || dirtyCount === 0}
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {busy
                ? 'Saving...'
                : dirtyCount === 0
                ? 'No changes'
                : `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

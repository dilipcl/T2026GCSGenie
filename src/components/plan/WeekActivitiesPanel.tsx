import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ActivityCategory, PlannedActivity, WeekType } from '../../types';
import {
  ACTIVITY_CATEGORIES,
  CATEGORY_ORDER,
  addsToLoad,
  expectedHours,
  isConfirmed,
  plannedHours,
  purgeSeededActivities,
  readActivityLoad,
  removeActivity,
  saveActivity,
} from '../../services/activityPlanService';
import { CommitmentOccasion, occasionsOn } from '../../services/commitmentService';
import { CommitmentExceptionModal } from '../commitments/CommitmentExceptionModal';
import { addDaysISO, parseISODate, formatFriendlyDate } from '../../utils/date';
import { useFeedback } from '../shared/FeedbackProvider';
import { InfoTip } from '../shared/InfoTip';
import { CalendarRange, Plus, Trash2, Check, SlidersHorizontal, Undo2 } from 'lucide-react';

interface Props {
  weekStart: string;
  weekType: WeekType;
}

/**
 * What the week is for, besides the work.
 *
 * The gauge knew about school and cadets because they recur and somebody set
 * them up once. It knew nothing about the birthday party, the film, or the
 * afternoon with friends - so a week with nine hours of real, non-negotiable
 * life in it looked identical to an empty one, and the planner cheerfully
 * advised committing the time twice over.
 *
 * Entry is "4 days of school", not four rows, because that is how a week gets
 * described out loud. The recurring things are filled in automatically and
 * marked as already counted; only the bespoke rows move the gauge.
 */
export const WeekActivitiesPanel: React.FC<Props> = ({ weekStart, weekType }) => {
  const { toast } = useFeedback();
  const [adding, setAdding] = useState(false);
  /** Which commitment row has its days expanded, if any. */
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [exceptionFor, setExceptionFor] = useState<CommitmentOccasion | null>(null);
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('FUN');
  const [occasions, setOccasions] = useState(1);
  const [hours, setHours] = useState(2);

  const load = useLiveQuery(() => readActivityLoad(weekStart, weekType), [weekStart, weekType]);

  /** Every occasion in the week, so a row can offer its own days to change. */
  const days = useLiveQuery(async () => {
    const dates = Array.from({ length: 7 }, (_, i) => addDaysISO(i, parseISODate(weekStart)));
    const perDay = await Promise.all(dates.map((date) => occasionsOn(date, weekType)));
    return perDay.flat();
  }, [weekStart, weekType], [] as CommitmentOccasion[]);

  // Clears the copies the first version stored. They are derived now, and a
  // survivor would show the week twice.
  useEffect(() => {
    purgeSeededActivities(weekStart).catch(() => {
      // Costs the tidy-up, never the panel.
    });
  }, [weekStart]);

  if (!load) return null;

  const save = async () => {
    if (!label.trim() || hours <= 0 || occasions <= 0) return;
    await saveActivity({ weekStart, label, category, plannedOccasions: occasions, hoursEach: hours });
    toast.success(
      `Added "${label.trim()}"`,
      `${(occasions * hours).toFixed(1)}h comes off the study time this week.`
    );
    setLabel('');
    setOccasions(1);
    setHours(2);
    setAdding(false);
  };

  const drop = async (activity: PlannedActivity) => {
    await removeActivity(activity);
    toast.info(`Removed "${activity.label}"`, 'Those hours go back into the week.');
  };

  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3 pb-3 border-b border-slate-800">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <CalendarRange className="w-4 h-4 text-cyan-400" />
            <span>What else this week holds</span>
            <InfoTip label="Why this matters">
              Study time is what is left after everything else. A party, a film and an afternoon
              with friends are real hours, and until they are written down the planner will happily
              advise committing them twice.
            </InfoTip>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {load.totalExpectedHours}h planned
            {load.bespokeExpectedHours > 0 && (
              <span className="text-cyan-300">
                {' '}
                · {load.bespokeExpectedHours}h of it counts against study time
              </span>
            )}
            {load.freedHours > 0 && (
              <span className="text-emerald-300"> · {load.freedHours}h given back</span>
            )}
          </p>
        </div>

        <button
          onClick={() => setAdding((prev) => !prev)}
          className="px-3 py-2 rounded-xl bg-cyan-600/20 border border-cyan-500/40 text-cyan-200 font-bold text-[11px] flex items-center gap-1.5 hover:bg-cyan-600/30 transition-colors flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add something</span>
        </button>
      </div>

      {adding && (
        <div className="mb-3 p-3 rounded-xl bg-slate-950/60 border border-slate-700 space-y-2.5">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Ravi's birthday party"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />

          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_ORDER.map((id) => {
              const meta = ACTIVITY_CATEGORIES[id];
              return (
                <button
                  key={id}
                  onClick={() => setCategory(id)}
                  title={meta.blurb}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors ${
                    category === id
                      ? 'bg-cyan-600/25 border-cyan-500/60 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {meta.icon} {meta.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                How many
              </label>
              <input
                type="number"
                min={1}
                value={occasions}
                onChange={(e) => setOccasions(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Hours each
              </label>
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white"
              />
            </div>
          </div>

          <button
            onClick={save}
            disabled={!label.trim() || hours <= 0 || occasions <= 0}
            className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] disabled:opacity-40"
          >
            Add {occasions > 0 && hours > 0 ? `(${(occasions * hours).toFixed(1)}h)` : ''}
          </button>
        </div>
      )}

      {load.activities.length === 0 ? (
        <p className="text-[11px] text-slate-500 italic py-3 text-center">
          Nothing listed yet. Add the parties, the films and the afternoons out — they are the
          hours the plan keeps forgetting.
        </p>
      ) : (
        <div className="space-y-1.5">
          {load.activities.map((a) => {
            const meta = ACTIVITY_CATEGORIES[a.category];
            const shortfall = plannedHours(a) - expectedHours(a);
            return (
              <div key={a.id} className="rounded-xl bg-slate-900/70 border border-slate-800">
                <div className="flex items-center gap-2 p-2.5">
                <span className="text-base leading-none flex-shrink-0">{meta.icon}</span>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{a.label}</p>
                  <p className="text-[10px] text-slate-500">
                    <span className={meta.accent}>{meta.label}</span>
                    {' · '}
                    {a.actualOccasions ?? a.plannedOccasions} × {a.hoursEach}h ={' '}
                    {expectedHours(a)}h
                    {shortfall > 0 && (
                      <span className="text-emerald-400"> · {shortfall}h given back</span>
                    )}
                  </p>
                </div>

                {isConfirmed(a) && addsToLoad(a) && (
                  <span title="Confirmed at a check-in" className="text-emerald-400 flex-shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}

                {/* A recurring commitment is editable through its own days.
                    The first version showed these locked, which left no way to
                    say "no school Monday" from the one screen that claims to
                    describe the week. */}
                {!addsToLoad(a) ? (
                  <button
                    onClick={() => setOpenRow((prev) => (prev === a.id ? null : a.id))}
                    aria-expanded={openRow === a.id}
                    className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 flex items-center gap-1 flex-shrink-0"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>Change</span>
                  </button>
                ) : (
                  <button
                    onClick={() => drop(a)}
                    aria-label={`Remove "${a.label}"`}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-rose-300 hover:bg-slate-800 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* The week's days for this commitment. Marking one writes a
                  `commitmentException`, which is the row the capacity gauge
                  actually reads - so the hours move here and there together. */}
              {openRow === a.id && (
                <div className="ml-8 mb-1.5 space-y-1">
                  {days
                    .filter((o) => o.commitment.id === a.fromCommitmentId)
                    .map((occasion) => {
                      const missed =
                        occasion.exception && occasion.exception.status !== 'ATTENDED';
                      return (
                        <button
                          key={`${occasion.commitment.id}_${occasion.date}_${occasion.title}`}
                          onClick={() => setExceptionFor(occasion)}
                          className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] transition-colors ${
                            missed
                              ? 'bg-slate-950 border-slate-800 text-slate-500'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className={missed ? 'line-through' : ''}>
                            {formatFriendlyDate(occasion.date)} · {occasion.title}
                          </span>
                          <span className="flex items-center gap-1.5 flex-shrink-0">
                            <span>{occasion.hours}h</span>
                            {missed ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <Undo2 className="w-3 h-3" />
                                not happening
                              </span>
                            ) : (
                              <span className="text-slate-500">change</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  {days.filter((o) => o.commitment.id === a.fromCommitmentId).length === 0 && (
                    <p className="text-[10px] text-slate-500 italic px-1">
                      No occasions in this week&rsquo;s timetable.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {load.byCategory.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap gap-x-4 gap-y-1">
          {load.byCategory.map((c) => {
            const meta = ACTIVITY_CATEGORIES[c.category];
            return (
              <span key={c.category} className="text-[10px] text-slate-400">
                {meta.icon} <span className={meta.accent}>{meta.label}</span>{' '}
                <span className="font-mono text-slate-300">{c.expectedHours}h</span>
              </span>
            );
          })}
        </div>
      )}

      <CommitmentExceptionModal
        occasion={exceptionFor}
        onClose={() => setExceptionFor(null)}
      />
    </div>
  );
};

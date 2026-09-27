import React from 'react';
import { Timer } from 'lucide-react';

/**
 * "How long did it take?" - asked once, when the work is closed.
 *
 * Finished work used to count towards no goal at all: study time was only ever
 * the minutes typed into a check-in, against one subject per check-in. The week
 * of 21 September finished thirteen pieces of work and reported 15% of its
 * goal hours. The answer given here is what makes a finished piece of work
 * count - see `studyLedger`.
 *
 * Built so the common case costs nothing. The work's own estimate is chosen
 * already, so an honest estimate is confirmed by simply closing. Time the focus
 * timer recorded is said out loud and never asked for again - the question
 * becomes "anything beyond that?", which is how the same hour is never counted
 * twice.
 *
 * A selected chip stays selected when tapped again. A chip that clears itself
 * on a second tap is how a subject got silently emptied in the add sheet.
 *
 * Renders inside the check-in `<form>`: every button declares its type, and
 * `checklistButtons.test.ts` reads this file to hold that.
 */

export const WORK_TIME_CHIPS = [15, 30, 45, 60, 90, 120] as const;

/**
 * What to start on. Nothing extra when the timer has the time already; the
 * nearest chip to the estimate otherwise; nothing chosen when there is no
 * estimate, because a guess the app made up is not time anyone confirmed.
 */
export function defaultWorkMinutes(
  estimateHours: number | undefined,
  timerMinutes: number
): number | undefined {
  if (timerMinutes > 0) return 0;
  if (!estimateHours || estimateHours <= 0) return undefined;
  const target = estimateHours * 60;
  return WORK_TIME_CHIPS.reduce((best, chip) =>
    Math.abs(chip - target) < Math.abs(best - target) ? chip : best
  );
}

function label(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1).replace('.0', '')}h`;
}

interface WorkTimeChipsProps {
  value: number | undefined;
  onChange: (minutes: number) => void;
  /** Minutes the focus timer already recorded on this work. */
  timerMinutes: number;
  /** Where the time will count, for the sentence under an empty choice. */
  countsTowards?: string;
}

export const WorkTimeChips: React.FC<WorkTimeChipsProps> = ({
  value,
  onChange,
  timerMinutes,
  countsTowards,
}) => {
  const chips: number[] = timerMinutes > 0 ? [0, ...WORK_TIME_CHIPS] : [...WORK_TIME_CHIPS];

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
        <Timer className="w-3 h-3 text-indigo-300" />
        {timerMinutes > 0 ? 'Any time beyond the timer?' : 'How long did it take?'}
      </p>

      {timerMinutes > 0 && (
        <p className="text-[10px] text-teal-300">
          {timerMinutes} min on the focus timer — already counted.
        </p>
      )}

      <div className="flex flex-wrap gap-1" role="group" aria-label="Time spent">
        {chips.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => onChange(minutes)}
            aria-pressed={value === minutes}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
              value === minutes
                ? 'bg-indigo-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {minutes === 0 ? 'No more' : label(minutes)}
          </button>
        ))}
      </div>

      {value === undefined && (
        <p className="text-[10px] text-slate-500">
          Pick one and it counts{countsTowards ? ` towards ${countsTowards}` : ''}. Leave it and the
          work is still done — the time just counts towards nothing.
        </p>
      )}
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { db } from '../../db';
import { newId } from '../../utils/id';
import { todayISO } from '../../utils/date';
import { logAuditEvent } from '../../services/auditService';
import { useFeedback } from '../shared/FeedbackProvider';
import {
  FOCUS_MINUTES,
  nextPhase,
  TimerPhase,
} from '../../services/breakEngine';
import { Play, Pause, RotateCcw, Coffee, Brain } from 'lucide-react';

/**
 * A 25-minute block with the break attached.
 *
 * Study time was only ever logged retrospectively at check-in, from memory, in
 * fifteen-minute steps on a slider - which is both a chore and a guess. Running
 * the block in the app makes the number real and puts the rest where it belongs:
 * the break is not a reward for finishing, it is part of the method.
 *
 * Finishing a focus block writes a check-in with the minutes actually worked, so
 * the streak, the heatmap and the weekly hours all pick it up with nothing
 * further to remember.
 */
export const SessionTimerCard: React.FC = () => {
  const { toast } = useFeedback();
  const [phase, setPhase] = useState<TimerPhase>('FOCUS');
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_MINUTES * 60);
  const [running, setRunning] = useState(false);
  const [blocksToday, setBlocksToday] = useState(0);

  /**
   * Anchor to wall-clock time rather than counting ticks. Browsers throttle
   * timers in a background tab, so a tick-counter would silently under-report
   * exactly when a student switches away to actually do the work.
   */
  const endsAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;

    if (endsAtRef.current === null) endsAtRef.current = Date.now() + secondsLeft * 1000;

    const id = window.setInterval(() => {
      // A tick can land between pausing and this interval being torn down. The
      // anchor is null by then, and `null - Date.now()` coerces to a large
      // negative - which would clamp to zero, snap the display to 00:00 and
      // log a block that was never finished.
      if (endsAtRef.current === null) return;

      const remaining = Math.max(0, Math.round((endsAtRef.current - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(id);
        void finishPhase();
      }
    }, 250);

    return () => window.clearInterval(id);
    // finishPhase is stable enough for this component's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const reset = (nextMinutes: number, nextPhaseName: TimerPhase) => {
    endsAtRef.current = null;
    setRunning(false);
    setPhase(nextPhaseName);
    setSecondsLeft(nextMinutes * 60);
  };

  const finishPhase = async () => {
    if (phase === 'FOCUS') {
      const completed = blocksToday + 1;
      setBlocksToday(completed);

      // The block is the log. Nothing to remember at check-in time.
      await db.checkIns.add({
        id: newId('checkin'),
        date: todayISO(),
        timestamp: Date.now(),
        session: 'STUDY_SESSION',
        energyLevel: 3,
        focusRating: 'NORMAL',
        completedHomeworkIds: [],
        completedRevisionMinutes: FOCUS_MINUTES,
        // The daily base XP belongs to a real check-in, not to a timer block
        xpEarned: 10,
        isDailyBaseXPAwarded: false,
        structuredNotes: { category: 'ACADEMIC' },
      });

      await logAuditEvent({
        user: 'STUDENT',
        action: 'INSERT',
        entity: 'DailyCheckIn',
        entityId: 'session-timer',
        newValue: `Focus block completed (${FOCUS_MINUTES} min), block ${completed} today`,
      });

      const next = nextPhase(completed);
      toast.celebrate(
        `${FOCUS_MINUTES} minutes done`,
        next.phase === 'LONG_BREAK'
          ? `Four blocks in. Take ${next.minutes} minutes properly - that is the method, not a reward.`
          : `Take ${next.minutes}. The break is part of it.`
      );
      reset(next.minutes, next.phase);
    } else {
      toast.info('Break over', 'Ready for another 25 when you are.');
      reset(FOCUS_MINUTES, 'FOCUS');
    }
  };

  const isBreak = phase !== 'FOCUS';
  const totalSeconds =
    (phase === 'FOCUS' ? FOCUS_MINUTES : phase === 'LONG_BREAK' ? 20 : 5) * 60;
  const progress = totalSeconds ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div
      className={`glass-card p-5 ${
        isBreak ? 'border-teal-500/40 bg-teal-950/10' : 'border-indigo-500/30'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${
              isBreak
                ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
            }`}
          >
            {isBreak ? <Coffee className="w-5 h-5" /> : <Brain className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">
              {isBreak ? (phase === 'LONG_BREAK' ? 'Long break' : 'Short break') : 'Focus block'}
            </h3>
            <p className="text-[11px] text-slate-400">
              {blocksToday > 0
                ? `${blocksToday} block${blocksToday === 1 ? '' : 's'} done today · ${
                    blocksToday * FOCUS_MINUTES
                  } min logged`
                : '25 minutes, then a proper break. Logs itself.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`font-mono text-2xl font-bold tabular-nums ${
              isBreak ? 'text-teal-300' : 'text-white'
            }`}
          >
            {mm}:{ss}
          </span>

          <button
            onClick={() => {
              if (running) {
                // pausing: keep the remaining time, drop the anchor
                endsAtRef.current = null;
                setRunning(false);
              } else {
                setRunning(true);
              }
            }}
            aria-label={running ? 'Pause the timer' : 'Start the timer'}
            className={`p-2.5 rounded-xl font-bold transition-all ${
              isBreak
                ? 'bg-teal-600 hover:bg-teal-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            onClick={() => reset(FOCUS_MINUTES, 'FOCUS')}
            aria-label="Reset the timer"
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            isBreak ? 'bg-teal-400' : 'bg-gradient-to-r from-indigo-500 to-purple-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

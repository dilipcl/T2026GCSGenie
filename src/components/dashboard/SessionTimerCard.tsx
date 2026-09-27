import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { SubjectId } from '../../types';
import { todayISO } from '../../utils/date';
import { useFeedback } from '../shared/FeedbackProvider';
import {
  FocusThread,
  focusThreads,
  logFocusBlock,
  timerBlocksOn,
} from '../../services/focusSessionService';
import { FocusWrapUp } from './FocusWrapUp';
import {
  FOCUS_MINUTES,
  nextPhase,
  TimerPhase,
} from '../../services/breakEngine';
import { Play, Pause, RotateCcw, Coffee, Brain } from 'lucide-react';

/**
 * The last subject worked on, remembered across reloads. A picker that resets
 * to "not set" every block is a picker that gets left at "not set", and the
 * whole point of asking is that the minutes land somewhere.
 */
const LAST_SUBJECT_KEY = 'genie.focus.lastSubject';

/**
 * The block whose wrap-up has not been answered or skipped yet.
 *
 * Kept outside the component because the break is exactly when somebody
 * wanders to another tab, and leaving Home unmounts this card - the wrap-up
 * vanished with it, and the question it asked was never seen again.
 */
const PENDING_WRAP_UP_KEY = 'genie.focus.pendingWrapUp';

function readPendingWrapUp(): string | undefined {
  try {
    return window.localStorage.getItem(PENDING_WRAP_UP_KEY) || undefined;
  } catch {
    return undefined;
  }
}

function writePendingWrapUp(id: string | undefined): void {
  try {
    if (id) window.localStorage.setItem(PENDING_WRAP_UP_KEY, id);
    else window.localStorage.removeItem(PENDING_WRAP_UP_KEY);
  } catch {
    // Storage blocked: the wrap-up still shows until the card unmounts.
  }
}

function readLastSubject(): SubjectId | '' {
  try {
    return (window.localStorage.getItem(LAST_SUBJECT_KEY) as SubjectId | null) || '';
  } catch {
    // Private mode, or storage blocked. Not worth failing the timer over.
    return '';
  }
}

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
  /**
   * What the block is on: `lesson:…` or `task:…` from today's threads, or
   * `subject:…` for a subject with nothing more specific. Starts on the last
   * subject used, as the subject-only picker did.
   */
  const [target, setTarget] = useState<string>(() => {
    const last = readLastSubject();
    return last ? `subject:${last}` : '';
  });
  /** The block just finished, while its wrap-up is on screen. */
  const [wrapUpId, setWrapUpIdState] = useState<string | undefined>(readPendingWrapUp);
  const setWrapUpId = (id: string | undefined) => {
    setWrapUpIdState(id);
    writePendingWrapUp(id);
  };

  const subjects = useLiveQuery(() => db.subjects.toArray(), [], []);
  const threads = useLiveQuery(() => focusThreads(todayISO()), [], [] as FocusThread[]);
  /**
   * Read from the database rather than counted in memory. The count used to be
   * component state, so a reload mid-evening reset it to zero and the fourth
   * block never earned its long break.
   */
  const blocksToday = useLiveQuery(
    async () => (await timerBlocksOn(todayISO())).length,
    [],
    0
  );

  const resolveTarget = (): { subjectId?: SubjectId; topicId?: string; taskId?: string } => {
    if (target.startsWith('subject:')) return { subjectId: target.slice(8) as SubjectId };
    const thread = threads.find((t) => t.key === target);
    return thread
      ? { subjectId: thread.subjectId, topicId: thread.topicId, taskId: thread.taskId }
      : {};
  };

  /**
   * Read through a ref, because `finishPhase` runs from an interval created
   * when the timer started. Called directly, a block begun on Maths and
   * switched to Physics halfway through was logged as Maths.
   */
  const resolveTargetRef = useRef(resolveTarget);
  resolveTargetRef.current = resolveTarget;

  const chooseTarget = (next: string) => {
    setTarget(next);
    const subject = next.startsWith('subject:')
      ? next.slice(8)
      : threads.find((t) => t.key === next)?.subjectId;
    try {
      if (subject) window.localStorage.setItem(LAST_SUBJECT_KEY, subject);
    } catch {
      // Nothing to do - the picker still works for this session.
    }
  };

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
      // The block is the log. Nothing to remember at check-in time, and
      // nothing lost if the wrap-up below is skipped.
      const id = await logFocusBlock(resolveTargetRef.current());
      const completed = (await timerBlocksOn(todayISO())).length;
      setWrapUpId(id);

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

      {/* What this block counts towards. Asked here rather than at check-in
          because it is known now and forgotten by then - and offered as the
          day's own lessons and work, so choosing one brings its topic and its
          task with it instead of just a subject. */}
      {!isBreak && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="focus-target" className="text-[11px] text-slate-400">
            Working on
          </label>
          <select
            id="focus-target"
            value={target}
            onChange={(e) => chooseTarget(e.target.value)}
            className="flex-1 min-w-[12rem] bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white"
          >
            <option value="">Not set - counts towards nothing</option>
            {threads.some((t) => t.kind === 'LESSON') && (
              <optgroup label="Going over today's lessons">
                {threads
                  .filter((t) => t.kind === 'LESSON')
                  .map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
              </optgroup>
            )}
            {threads.some((t) => t.kind === 'TASK') && (
              <optgroup label="Work due soon">
                {threads
                  .filter((t) => t.kind === 'TASK')
                  .map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
              </optgroup>
            )}
            <optgroup label="Just a subject">
              {subjects.map((sub) => (
                <option key={sub.id} value={`subject:${sub.id}`}>
                  {sub.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      )}

      <div className="mt-3 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            isBreak ? 'bg-teal-400' : 'bg-gradient-to-r from-indigo-500 to-purple-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {wrapUpId && (
        <FocusWrapUp key={wrapUpId} checkInId={wrapUpId} onDone={() => setWrapUpId(undefined)} />
      )}
    </div>
  );
};

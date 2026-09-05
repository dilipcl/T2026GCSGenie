import { PlanBaselineStatus, WeekPlanBaseline } from '../types';
import { addDaysISO, daysBetween, parseISODate, toLocalISODate, todayISO } from '../utils/date';

/**
 * The week's plan as a sequence of gates, each with a date it should be through.
 *
 * The planner could say what state the week was in - draft, awaiting approval,
 * baselined - and nothing at all about *when* each of those should have
 * happened. So a week could sit in draft indefinitely without anything looking
 * wrong, which is exactly how Tejas lost one: he was still learning the app,
 * never finalised the week, and no screen ever said that a step was late,
 * because no step had a date to be late against.
 *
 * A gate therefore carries two things the status alone never did. An ideal
 * window, derived from the week's own Monday rather than stored, so every week
 * gets the same shape and nobody has to maintain a schedule. And the actual
 * date it was passed, taken from the baseline's own timestamps. Showing both is
 * the point: "submitted Wednesday, should have been Monday" is a lesson, where
 * "AWAITING_APPROVAL" is only a label.
 *
 * Planning happens over the weekend before the week runs, which is why the
 * first gate opens on the Saturday. The alternative - opening it on Monday -
 * asks a 14-year-old to plan the week on the morning it starts.
 */

export type GateId = 'PLAN' | 'APPROVE' | 'RUN' | 'REVIEW';

/**
 * DONE is self-explanatory. The rest are all "not done", split by whether that
 * is currently a problem: OPEN is inside its window, DUE is inside it and
 * running out today, LATE is past it with the week still live, and MISSED is
 * past it on a week that has already finished - the only one nobody can fix.
 */
export type GateState = 'DONE' | 'OPEN' | 'DUE' | 'LATE' | 'MISSED' | 'UPCOMING';

export interface PlanGate {
  id: GateId;
  label: string;
  /** What passing it means, in one line. */
  blurb: string;
  /** First day this gate can reasonably be worked on. */
  idealStart: string;
  /** The day it should be through by. */
  idealEnd: string;
  /** When it actually happened, if it has. */
  actualOn?: string;
  state: GateState;
  /** Days late, counted only once it is. */
  daysLate?: number;
}

/** Day offsets from the week's Monday. Negative days are the weekend before. */
const WINDOWS: Record<GateId, { start: number; end: number; label: string; blurb: string }> = {
  PLAN: {
    start: -2,
    end: 0,
    label: 'Plan the week',
    blurb: 'Pick the work, estimate it, send it for approval.',
  },
  APPROVE: {
    start: -1,
    end: 1,
    label: 'Get it agreed',
    blurb: 'A parent approves the week. Until then it is not the baseline.',
  },
  RUN: {
    start: 0,
    end: 6,
    label: 'Do the work',
    blurb: 'The week runs. Changes after approval are recorded as amendments.',
  },
  REVIEW: {
    start: 6,
    end: 7,
    label: 'Close the week',
    blurb: 'Review what happened before the next week is planned.',
  },
};

const ORDER: GateId[] = ['PLAN', 'APPROVE', 'RUN', 'REVIEW'];

function offsetFrom(weekStart: string, days: number): string {
  return addDaysISO(days, parseISODate(weekStart));
}

function isoFrom(epochMs?: number): string | undefined {
  return epochMs === undefined ? undefined : toLocalISODate(new Date(epochMs));
}

/**
 * When each gate was actually passed.
 *
 * RUN and REVIEW have no timestamp of their own - the week running is not an
 * event somebody performs - so they are settled by the calendar. A week whose
 * Sunday has passed has run, whatever anybody recorded.
 */
function actualFor(
  gate: GateId,
  weekStart: string,
  baseline: WeekPlanBaseline | undefined,
  today: string
): string | undefined {
  if (gate === 'PLAN') return isoFrom(baseline?.submittedAt);
  if (gate === 'APPROVE') return isoFrom(baseline?.approvedAt);

  const end = offsetFrom(weekStart, WINDOWS[gate].end);
  return today > end ? end : undefined;
}

/**
 * The four gates for one week, with where each stands today.
 *
 * `today` is a parameter rather than a call inside, so the same week can be
 * rendered against a fixed date in a test without the result depending on the
 * day the suite happens to run.
 */
export function planGates(
  weekStart: string,
  baseline?: WeekPlanBaseline,
  today: string = todayISO()
): PlanGate[] {
  const status: PlanBaselineStatus = baseline?.status ?? 'DRAFT';
  const weekOver = today > offsetFrom(weekStart, 6);

  return ORDER.map((id) => {
    const window = WINDOWS[id];
    const idealStart = offsetFrom(weekStart, window.start);
    const idealEnd = offsetFrom(weekStart, window.end);

    const done = isGateDone(id, status, baseline, weekStart, today);
    const actualOn = done ? actualFor(id, weekStart, baseline, today) : undefined;

    return {
      id,
      label: window.label,
      blurb: window.blurb,
      idealStart,
      idealEnd,
      actualOn,
      state: gateState({ done, idealStart, idealEnd, today, weekOver }),
      daysLate: lateBy({ done, actualOn, idealEnd, today }),
    };
  });
}

function isGateDone(
  id: GateId,
  status: PlanBaselineStatus,
  baseline: WeekPlanBaseline | undefined,
  weekStart: string,
  today: string
): boolean {
  switch (id) {
    // A returned week is back in draft and its submission no longer counts:
    // the gate is open again, which is the whole meaning of "sent back".
    case 'PLAN':
      return status === 'AWAITING_APPROVAL' || status === 'BASELINED';
    case 'APPROVE':
      return status === 'BASELINED' && baseline?.approvedAt !== undefined;
    case 'RUN':
    case 'REVIEW':
      return today > offsetFrom(weekStart, WINDOWS[id].end);
  }
}

function gateState(input: {
  done: boolean;
  idealStart: string;
  idealEnd: string;
  today: string;
  weekOver: boolean;
}): GateState {
  const { done, idealStart, idealEnd, today, weekOver } = input;

  if (done) return 'DONE';
  if (today < idealStart) return 'UPCOMING';
  if (today > idealEnd) return weekOver ? 'MISSED' : 'LATE';
  return today === idealEnd ? 'DUE' : 'OPEN';
}

function lateBy(input: {
  done: boolean;
  actualOn?: string;
  idealEnd: string;
  today: string;
}): number | undefined {
  const { done, actualOn, idealEnd, today } = input;

  // A gate passed after its window still shows how late it was, because the
  // lesson is in the gap and it disappears the moment the tick goes green.
  const against = done ? actualOn : today;
  if (!against || against <= idealEnd) return undefined;

  return daysBetween(idealEnd, against);
}

/** The gate a reader should look at first: the earliest one not yet passed. */
export function currentGate(gates: PlanGate[]): PlanGate | undefined {
  return gates.find((gate) => gate.state !== 'DONE');
}

/**
 * Whether this week still needs somebody to do something about its plan.
 *
 * A week whose gates were all missed is finished, not actionable - nagging
 * about a fortnight-old plan teaches people to ignore the nag.
 */
export function needsAttention(gates: PlanGate[]): boolean {
  return gates.some((gate) => gate.state === 'LATE' || gate.state === 'DUE');
}

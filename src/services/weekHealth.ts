import { db } from '../db';
import { RAGStatus } from '../types';
import { currentWeek, WeekWindow } from './weekWindow';
import { lockedGoalProgress } from './goalProgress';
import { loadWeekCommitment } from './planService';
import { baselineStatus, loadBaseline } from './planBaselineService';
import { calculateBurnoutCapacity } from './burnoutEngine';

/**
 * How the week is going, in one letter.
 *
 * Every part of this already existed and none of it was ever added up. Goal
 * pace lived on one screen, the commitment count on another, whether the week
 * had even been agreed on a third. Each was honest on its own and none of them
 * answered the question a parent actually asks on a Wednesday evening, which is
 * simply: is this week going well or not?
 *
 * Composed, never recomputed. Every signal reads the service that already owns
 * that number - `goalProgress` for pace, `planService` for the commitment,
 * `burnoutEngine` for load. The last time this app grew a second copy of a
 * figure it already had, the copy drifted and the screen confidently reported
 * hours the capacity gauge was still charging for. One owner per number.
 *
 * Three rules keep the score honest:
 *
 *  - **It is explainable.** The letter is never shown without the signals under
 *    it. A score nobody can take apart is a score nobody believes, and an
 *    unbelieved score is worse than none because it still gets argued about.
 *  - **It is fair early in the week.** Nothing is judged against a full week's
 *    target on Tuesday morning. Targets are pro-rated by the day, the same way
 *    `goalProgress` already does it.
 *  - **A missing thing counts once.** A family with no approved goals has one
 *    problem, not three, so the signals that depend on goals drop out of the
 *    average rather than scoring zero and reporting a crisis three times over.
 */

export type HealthSignalId =
  | 'GOAL_EFFORT'
  | 'GOALS_AT_RISK'
  | 'COMMITMENT_KEPT'
  | 'WEEK_TARGET'
  | 'GOALS_FINALISED'
  | 'CAPACITY';

export interface HealthSignal {
  id: HealthSignalId;
  /** Short enough for a row in a card. */
  label: string;
  status: RAGStatus;
  /** 0-100. Absent when the signal does not apply this week. */
  score?: number;
  /** What the status is actually about, in one sentence. */
  detail: string;
  /** Relative importance in the overall score. */
  weight: number;
  /**
   * Nothing to measure - no approved goals, or nothing committed. Kept in the
   * list so its absence is visible, but left out of the average.
   */
  notApplicable?: boolean;
}

export interface WeekHealth {
  status: RAGStatus;
  /** 0-100, the weighted mean of the signals that apply. */
  score: number;
  headline: string;
  signals: HealthSignal[];
  /** The signals dragging it down, worst first. Empty when everything is green. */
  concerns: HealthSignal[];
  week: WeekWindow;
}

/**
 * Below this share of the pro-rated target, the week is failing its goals
 * outright rather than merely lagging. A fifth of what the week asked for is
 * not a slow start; it is a week that is not happening.
 */
export const EFFORT_RED_SHARE = 0.2;
/** Above this, the effort is broadly on track. Between the two is a warning. */
export const EFFORT_GREEN_SHARE = 0.6;

/** Share of goals off pace that turns the portfolio amber, then red. */
export const AT_RISK_AMBER_SHARE = 0.2;
export const AT_RISK_RED_SHARE = 0.5;

/** Before this weekday nothing is called red for being behind. Mon = 1. */
const EARLIEST_RED_WEEKDAY = 3;

const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

function bandFromScore(score: number): RAGStatus {
  if (score >= 70) return 'GREEN';
  if (score >= 40) return 'AMBER';
  return 'RED';
}

/**
 * The overall letter.
 *
 * Not simply the band of the mean. A week with one thing genuinely red is not
 * a green week, however well everything else is going - averaging that away is
 * how a dashboard ends up reassuring people about the exact thing that is
 * wrong. So a single red caps the result at amber, and two or more make it red
 * outright regardless of the arithmetic.
 */
export function overallStatus(score: number, signals: HealthSignal[]): RAGStatus {
  const reds = signals.filter((s) => !s.notApplicable && s.status === 'RED').length;
  if (reds >= 2) return 'RED';

  const band = bandFromScore(score);
  if (reds === 1 && band === 'GREEN') return 'AMBER';
  return band;
}

/** The weighted mean of whatever actually applies this week. */
export function weightedScore(signals: HealthSignal[]): number {
  const live = signals.filter((s) => !s.notApplicable && typeof s.score === 'number');
  const totalWeight = live.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return 0;
  return round(live.reduce((sum, s) => sum + (s.score ?? 0) * s.weight, 0) / totalWeight);
}

export async function readWeekHealth(window: WeekWindow = currentWeek()): Promise<WeekHealth> {
  const [goals, progress, commitment, baseline, capacity] = await Promise.all([
    db.goals.toArray(),
    lockedGoalProgress(window),
    loadWeekCommitment(),
    loadBaseline(),
    calculateBurnoutCapacity(),
  ]);

  const weekday = window.weekday;
  const lateEnoughForRed = weekday >= EARLIEST_RED_WEEKDAY;
  const signals: HealthSignal[] = [];

  // --- 1. Effort against what the week asked for so far -------------------
  const targetSoFar = round1(progress.reduce((sum, p) => sum + p.proRatedTargetHours, 0));
  const doneSoFar = round1(progress.reduce((sum, p) => sum + p.actualHours, 0));
  const effortShare = targetSoFar > 0 ? doneSoFar / targetSoFar : 0;

  signals.push({
    id: 'GOAL_EFFORT',
    label: 'Effort against your goals',
    weight: 25,
    notApplicable: progress.length === 0 || targetSoFar <= 0,
    score:
      progress.length === 0 || targetSoFar <= 0
        ? undefined
        : Math.min(100, round((effortShare / EFFORT_GREEN_SHARE) * 100)),
    status:
      progress.length === 0 || targetSoFar <= 0
        ? 'AMBER'
        : effortShare >= EFFORT_GREEN_SHARE
        ? 'GREEN'
        : effortShare < EFFORT_RED_SHARE && lateEnoughForRed
        ? 'RED'
        : 'AMBER',
    detail:
      progress.length === 0 || targetSoFar <= 0
        ? 'No approved goal is asking for hours yet.'
        : `${doneSoFar}h done of the ${targetSoFar}h expected by now — ` +
          `${round(effortShare * 100)}%.`,
  });

  // --- 2. How much of the portfolio is off pace ---------------------------
  const atRisk = progress.filter((p) => p.pace !== 'AHEAD');
  const atRiskShare = progress.length > 0 ? atRisk.length / progress.length : 0;

  signals.push({
    id: 'GOALS_AT_RISK',
    label: 'Goals at risk',
    weight: 20,
    notApplicable: progress.length === 0,
    score: progress.length === 0 ? undefined : round((1 - atRiskShare) * 100),
    status:
      progress.length === 0
        ? 'AMBER'
        : atRiskShare >= AT_RISK_RED_SHARE && lateEnoughForRed
        ? 'RED'
        : atRiskShare > AT_RISK_AMBER_SHARE
        ? 'AMBER'
        : 'GREEN',
    detail:
      progress.length === 0
        ? 'No approved goals to track.'
        : atRisk.length === 0
        ? `All ${progress.length} goals are on pace.`
        : `${atRisk.length} of ${progress.length} behind or stalled — ` +
          `${round(atRiskShare * 100)}%.`,
  });

  // --- 3. Keeping the promise actually made -------------------------------
  const { committedCount, committedDone, overdueCommitted } = commitment;
  // Pro-rated: finishing three of five by Tuesday is fine, by Friday it is not.
  const expectedDone = committedCount * (weekday / 7);
  const keptShare = committedCount === 0 ? 0 : committedDone / committedCount;
  const onTrack = committedDone >= expectedDone;

  signals.push({
    id: 'COMMITMENT_KEPT',
    label: 'Work promised this week',
    weight: 20,
    notApplicable: committedCount === 0,
    score: committedCount === 0 ? undefined : round(keptShare * 100),
    status:
      committedCount === 0
        ? 'AMBER'
        : overdueCommitted > 0 && lateEnoughForRed
        ? 'RED'
        : onTrack
        ? 'GREEN'
        : 'AMBER',
    detail:
      committedCount === 0
        ? 'Nothing committed for this week yet.'
        : `${committedDone} of ${committedCount} done` +
          (overdueCommitted > 0 ? `, ${overdueCommitted} already overdue.` : '.'),
  });

  // --- 4. Whether the week was ever agreed --------------------------------
  const status = baselineStatus(baseline);
  signals.push({
    id: 'WEEK_TARGET',
    label: 'Week target set',
    weight: 15,
    score: status === 'BASELINED' ? 100 : status === 'AWAITING_APPROVAL' ? 60 : 0,
    status:
      status === 'BASELINED'
        ? 'GREEN'
        : status === 'AWAITING_APPROVAL'
        ? 'AMBER'
        : lateEnoughForRed
        ? 'RED'
        : 'AMBER',
    detail:
      status === 'BASELINED'
        ? 'Agreed, so the week has something to be measured against.'
        : status === 'AWAITING_APPROVAL'
        ? 'Submitted and waiting on a parent.'
        : 'Still a draft — nothing has been agreed for this week.',
  });

  // --- 5. Whether the goals themselves are settled ------------------------
  const approved = goals.filter(
    (g) => g.status === 'APPROVED_LOCKED' || g.status === 'COMPLETED'
  ).length;
  const unfinalised = goals.filter(
    (g) => g.status !== 'APPROVED_LOCKED' && g.status !== 'COMPLETED'
  ).length;

  signals.push({
    id: 'GOALS_FINALISED',
    label: 'Key goals finalised',
    weight: 10,
    score: approved === 0 ? 0 : unfinalised === 0 ? 100 : 55,
    status: approved === 0 ? 'RED' : unfinalised > 0 ? 'AMBER' : 'GREEN',
    detail:
      approved === 0
        ? 'No goal has been approved, so nothing is reserving time or being tracked.'
        : unfinalised > 0
        ? `${approved} approved, ${unfinalised} still under discussion.`
        : `All ${approved} goals approved.`,
  });

  // --- 6. Whether the week is survivable ----------------------------------
  // Straight from the burnout gauge, which already owns this judgement.
  signals.push({
    id: 'CAPACITY',
    label: 'Workload',
    weight: 10,
    score:
      capacity.stressStatus === 'GREEN' ? 100 : capacity.stressStatus === 'AMBER' ? 55 : 15,
    status: capacity.stressStatus,
    detail:
      capacity.stressStatus === 'RED'
        ? `Overloaded — ${capacity.totalScheduledHours}h against a ${capacity.safeWeeklyHoursLimit}h ceiling.`
        : `${capacity.totalScheduledHours}h scheduled of ${capacity.safeWeeklyHoursLimit}h.`,
  });

  const score = weightedScore(signals);
  const overall = overallStatus(score, signals);

  const concerns = signals
    .filter((s) => !s.notApplicable && s.status !== 'GREEN')
    .sort(
      (a, b) =>
        (a.status === 'RED' ? 0 : 1) - (b.status === 'RED' ? 0 : 1) || b.weight - a.weight
    );

  return {
    status: overall,
    score,
    headline: headlineFor(overall, score, concerns, weekday),
    signals,
    concerns,
    week: window,
  };
}

/**
 * One sentence for the letter.
 *
 * Names the biggest problem rather than describing the colour, because "amber"
 * tells nobody what to do and the whole value of a score is the sentence
 * underneath it.
 */
export function headlineFor(
  status: RAGStatus,
  score: number,
  concerns: HealthSignal[],
  weekday: number
): string {
  if (status === 'GREEN') {
    return weekday <= 2
      ? 'A clean start. Nothing is off track yet.'
      : `On track — ${score}% of a good week.`;
  }

  const worst = concerns[0];
  if (!worst) return `Mostly fine, at ${score}%.`;

  if (status === 'RED') {
    const second = concerns[1];
    return second
      ? `${worst.label} and ${second.label.toLowerCase()} both need attention.`
      : `${worst.label}: ${worst.detail}`;
  }

  return `Holding, but ${worst.label.toLowerCase()} needs a look — ${worst.detail}`;
}

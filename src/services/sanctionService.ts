import { db } from '../db';
import { Sanction, SanctionSeverity } from '../types';
import { logAuditEvent } from './auditService';
import { newId } from '../utils/id';
import { addDaysISO, parseISODate, todayISO } from '../utils/date';

/**
 * What misbehaviour costs, decided in advance.
 *
 * Every incident used to cost 500 XP and freeze the Rewards Shop - being late
 * to a lesson and being sent out of one were priced identically. That is not a
 * rule, it is a single punishment with a text box, and it fails in both
 * directions: it is absurd for the small things, so it stops being applied, and
 * once it has stopped being applied it is not there for the serious ones
 * either.
 *
 * Three tiers, fixed here rather than typed in each time. The parent picks what
 * happened; the number follows. That is the part worth having - not the size of
 * the penalty but the fact that it was settled before anyone was cross.
 */

export interface SanctionTier {
  severity: SanctionSeverity;
  label: string;
  /** Examples, so a tier is picked by recognition rather than by judgement. */
  blurb: string;
  /** Stored negative. `calculateTotalXP` takes the absolute value. */
  penaltyXP: number;
  /** Only the top tier locks the shop; the lower two are a cost, not a wall. */
  freezesShop: boolean;
  /** The top tier is not lifted by time passing - something has to be put right. */
  requiresRemediation: boolean;
}

export const SANCTION_TIERS: Record<SanctionSeverity, SanctionTier> = {
  MINOR: {
    severity: 'MINOR',
    label: 'Minor',
    blurb: 'Late, kit missing, low-level disruption',
    penaltyXP: -50,
    freezesShop: false,
    requiresRemediation: false,
  },
  DETENTION: {
    severity: 'DETENTION',
    label: 'Detention',
    blurb: 'Lunchtime or break detention',
    penaltyXP: -150,
    freezesShop: false,
    requiresRemediation: false,
  },
  SERIOUS: {
    severity: 'SERIOUS',
    label: 'Serious',
    blurb: 'After-school detention, removal from a lesson, or a repeat',
    penaltyXP: -500,
    freezesShop: true,
    requiresRemediation: true,
  },
};

/** Lowest to highest, which is the order the escalation walks. */
export const SEVERITY_ORDER: SanctionSeverity[] = ['MINOR', 'DETENTION', 'SERIOUS'];

/**
 * How far back a previous incident still counts towards escalation.
 *
 * Two weeks, because that is roughly the span over which a pattern is a pattern
 * rather than a bad day. Longer, and one rough fortnight in September is still
 * inflating penalties at half term - which is what makes a system feel
 * vindictive rather than fair, and a system that feels vindictive gets argued
 * with instead of obeyed.
 */
export const ESCALATION_WINDOW_DAYS = 14;

/**
 * Rows written before tiers existed carry no severity. They were all logged at
 * the old flat rate with the shop frozen, which is exactly the top tier.
 */
export function severityOf(sanction: Sanction): SanctionSeverity {
  return sanction.severity ?? 'SERIOUS';
}

export function nextTierUp(severity: SanctionSeverity): SanctionSeverity {
  const i = SEVERITY_ORDER.indexOf(severity);
  return SEVERITY_ORDER[Math.min(i + 1, SEVERITY_ORDER.length - 1)];
}

/**
 * The date `days` before `iso`, as a local YYYY-MM-DD string.
 *
 * Through `addDaysISO` rather than `toISOString`, which resolves in UTC: east
 * of Greenwich that lands a day early, so the window silently reached fifteen
 * days back and a sanction that should have aged out still escalated the next
 * one. ISO strings then compare correctly with `>=`, which is the whole reason
 * the app stores dates this way.
 */
function daysBeforeISO(iso: string, days: number): string {
  return addDaysISO(-days, parseISODate(iso));
}

export interface EscalationOutcome {
  /** What it will actually be logged as. */
  severity: SanctionSeverity;
  /** The tier asked for, present only when a repeat pushed it up. */
  escalatedFrom?: SanctionSeverity;
  /** Prior incidents inside the window, not counting this one. */
  priorInWindow: number;
}

/**
 * A second incident inside the window is worse than the first, whatever it was.
 *
 * One tier, once - not one per prior incident. Compounding would take a run of
 * three small things to the top tier and freeze the shop over kit and lateness,
 * which is the point where a rule stops being believed.
 */
export function applyEscalation(
  requested: SanctionSeverity,
  priorInWindow: number
): EscalationOutcome {
  if (priorInWindow < 1) return { severity: requested, priorInWindow };

  const escalated = nextTierUp(requested);
  if (escalated === requested) return { severity: requested, priorInWindow };

  return { severity: escalated, escalatedFrom: requested, priorInWindow };
}

/** Incidents inside the window ending on `on`, which is what escalation counts. */
export async function priorSanctionsInWindow(on: string = todayISO()): Promise<number> {
  const since = daysBeforeISO(on, ESCALATION_WINDOW_DAYS);
  const all = await db.sanctions.toArray();
  return all.filter((s) => s.date >= since && s.date <= on).length;
}

export interface LogSanctionInput {
  severity: SanctionSeverity;
  reason: string;
  /** What has to be put right before the shop reopens. Top tier only. */
  remediation?: string;
  /** Overridable, so something that happened yesterday can be logged today. */
  date?: string;
}

export interface LoggedSanction {
  sanction: Sanction;
  outcome: EscalationOutcome;
  tier: SanctionTier;
}

/**
 * Writes the incident at whatever tier the rule arrives at.
 *
 * The audit row states the tier, the penalty and the escalation, because
 * "-500 XP" on its own is the sentence without the charge - and that is the
 * version that gets disputed a week later.
 */
export async function logSanction(input: LogSanctionInput): Promise<LoggedSanction> {
  const date = input.date ?? todayISO();
  const outcome = applyEscalation(input.severity, await priorSanctionsInWindow(date));
  const tier = SANCTION_TIERS[outcome.severity];

  const sanction: Sanction = {
    id: newId('sanc'),
    type: outcome.severity === 'MINOR' ? 'CUSTOM' : 'DETENTION',
    severity: outcome.severity,
    escalatedFrom: outcome.escalatedFrom,
    reason: input.reason.trim(),
    date,
    penaltyXP: tier.penaltyXP,
    shopFrozen: tier.freezesShop,
    remediationTaskIdRequired: tier.requiresRemediation ? input.remediation?.trim() : undefined,
    loggedBy: 'PARENT',
  };

  await db.sanctions.add(sanction);

  const escalationNote = outcome.escalatedFrom
    ? ` - escalated from ${SANCTION_TIERS[outcome.escalatedFrom].label}, ` +
      `${outcome.priorInWindow} already in the last ${ESCALATION_WINDOW_DAYS} days`
    : '';

  await logAuditEvent({
    user: 'PARENT',
    action: 'SANCTION_FREEZE',
    entity: 'Sanction',
    entityId: sanction.id,
    newValue:
      `${tier.label} (${tier.penaltyXP} XP, ` +
      `shop ${tier.freezesShop ? 'frozen' : 'open'})${escalationNote}. ` +
      `Reason: ${sanction.reason}`,
  });

  return { sanction, outcome, tier };
}

/** Ends a freeze. Only the top tier ever sets one, so only it can need lifting. */
export async function liftSanction(sanction: Sanction, note?: string): Promise<void> {
  await db.sanctions.update(sanction.id, { shopFrozen: false, resolvedAt: Date.now() });

  await logAuditEvent({
    user: 'PARENT',
    action: 'UPDATE',
    entity: 'Sanction',
    entityId: sanction.id,
    fieldChanged: 'shopFrozen',
    oldValue: 'true',
    newValue: `false - ${note?.trim() || 'remediation approved by parent'}`,
  });
}

/** Where things stand. Display only; the XP ledger does its own sums. */
export interface SanctionStanding {
  totalPenaltyXP: number;
  isShopFrozen: boolean;
  /** Unresolved top-tier incidents, which are the ones holding a freeze. */
  openSerious: Sanction[];
  recentCount: number;
  /**
   * What the next incident would land at if it happened today. Shown to the
   * student, because a consequence nobody can see coming does not deter
   * anything - it only explains a punishment afterwards.
   */
  nextTierIfRepeated: SanctionSeverity;
}

export async function readSanctionStanding(on: string = todayISO()): Promise<SanctionStanding> {
  const all = await db.sanctions.toArray();
  const since = daysBeforeISO(on, ESCALATION_WINDOW_DAYS);
  const recent = all.filter((s) => s.date >= since && s.date <= on);

  return {
    totalPenaltyXP: all.reduce((sum, s) => sum + Math.abs(s.penaltyXP || 0), 0),
    isShopFrozen: all.some((s) => s.shopFrozen && !s.resolvedAt),
    openSerious: all.filter((s) => severityOf(s) === 'SERIOUS' && !s.resolvedAt),
    recentCount: recent.length,
    nextTierIfRepeated: applyEscalation('MINOR', recent.length).severity,
  };
}

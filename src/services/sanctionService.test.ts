import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { resetDatabase } from '../test/harness';
import { Sanction } from '../types';
import {
  ESCALATION_WINDOW_DAYS,
  SANCTION_TIERS,
  applyEscalation,
  liftSanction,
  logSanction,
  nextTierUp,
  priorSanctionsInWindow,
  readSanctionStanding,
  severityOf,
} from './sanctionService';
import { calculateTotalXP } from './ragCalculator';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

const TODAY = '2026-09-01';

beforeEach(async () => {
  await resetDatabase();
  freezeAt(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the tiers price the incident, not the mood', () => {
  it('costs less for a small thing than a serious one', () => {
    expect(SANCTION_TIERS.MINOR.penaltyXP).toBeGreaterThan(SANCTION_TIERS.DETENTION.penaltyXP);
    expect(SANCTION_TIERS.DETENTION.penaltyXP).toBeGreaterThan(SANCTION_TIERS.SERIOUS.penaltyXP);
  });

  it('freezes the shop only at the top', () => {
    expect(SANCTION_TIERS.MINOR.freezesShop).toBe(false);
    expect(SANCTION_TIERS.DETENTION.freezesShop).toBe(false);
    expect(SANCTION_TIERS.SERIOUS.freezesShop).toBe(true);
  });

  it('asks for remediation only where the shop is shut', () => {
    // A freeze with no way to end it is a punishment with no exit.
    for (const tier of Object.values(SANCTION_TIERS)) {
      expect(tier.requiresRemediation).toBe(tier.freezesShop);
    }
  });

  it('stores every penalty as a negative number', () => {
    for (const tier of Object.values(SANCTION_TIERS)) {
      expect(tier.penaltyXP).toBeLessThan(0);
    }
  });
});

describe('escalation', () => {
  it('leaves a first incident where it was asked for', () => {
    expect(applyEscalation('MINOR', 0)).toMatchObject({ severity: 'MINOR' });
    expect(applyEscalation('MINOR', 0).escalatedFrom).toBeUndefined();
  });

  it('bumps a repeat up one tier', () => {
    const out = applyEscalation('MINOR', 1);
    expect(out.severity).toBe('DETENTION');
    expect(out.escalatedFrom).toBe('MINOR');
  });

  it('bumps by one tier only, however many came before', () => {
    // Compounding would take three late marks to a frozen shop, which is where
    // a rule stops being believed.
    expect(applyEscalation('MINOR', 5).severity).toBe('DETENTION');
    expect(applyEscalation('MINOR', 50).severity).toBe('DETENTION');
  });

  it('cannot climb past the top tier', () => {
    const out = applyEscalation('SERIOUS', 3);
    expect(out.severity).toBe('SERIOUS');
    // Nothing changed, so nothing is reported as having changed.
    expect(out.escalatedFrom).toBeUndefined();
  });

  it('walks the tiers in order', () => {
    expect(nextTierUp('MINOR')).toBe('DETENTION');
    expect(nextTierUp('DETENTION')).toBe('SERIOUS');
    expect(nextTierUp('SERIOUS')).toBe('SERIOUS');
  });
});

describe('the escalation window', () => {
  async function seedOn(date: string) {
    await db.sanctions.add({
      id: `s_${date}`,
      type: 'DETENTION',
      severity: 'MINOR',
      reason: 'late',
      date,
      penaltyXP: -50,
      shopFrozen: false,
      loggedBy: 'PARENT',
    });
  }

  it('counts an incident inside the window', async () => {
    await seedOn('2026-08-25');
    expect(await priorSanctionsInWindow(TODAY)).toBe(1);
  });

  it('ignores one that has aged out', async () => {
    // 15 days back, one day beyond the window.
    await seedOn('2026-08-17');
    expect(await priorSanctionsInWindow(TODAY)).toBe(0);
  });

  it('includes the incident exactly on the boundary', async () => {
    await seedOn('2026-08-18');
    expect(await priorSanctionsInWindow(TODAY)).toBe(1);
  });

  it('does not count something logged in the future', async () => {
    await seedOn('2026-09-20');
    expect(await priorSanctionsInWindow(TODAY)).toBe(0);
  });

  it('is the window the constant says it is', () => {
    expect(ESCALATION_WINDOW_DAYS).toBe(14);
  });
});

describe('logging an incident', () => {
  it('writes the tier that was asked for when it is the first', async () => {
    const { sanction, tier } = await logSanction({ severity: 'MINOR', reason: 'Late to period 3' });

    expect(sanction.severity).toBe('MINOR');
    expect(sanction.penaltyXP).toBe(-50);
    expect(sanction.shopFrozen).toBe(false);
    expect(tier.label).toBe('Minor');
  });

  it('escalates a second incident inside the window, and says so', async () => {
    await logSanction({ severity: 'MINOR', reason: 'Late' });
    const { sanction, outcome } = await logSanction({ severity: 'MINOR', reason: 'Late again' });

    expect(sanction.severity).toBe('DETENTION');
    expect(sanction.escalatedFrom).toBe('MINOR');
    expect(outcome.priorInWindow).toBe(1);
    expect(sanction.penaltyXP).toBe(-150);
  });

  it('freezes the shop and demands remediation at the top tier', async () => {
    const { sanction } = await logSanction({
      severity: 'SERIOUS',
      reason: 'Sent out of a lesson',
      remediation: 'Write an apology and catch the work up',
    });

    expect(sanction.shopFrozen).toBe(true);
    expect(sanction.remediationTaskIdRequired).toBe('Write an apology and catch the work up');
  });

  it('does not record a remediation for a tier that cannot use one', async () => {
    // The field would otherwise sit there implying a condition that nothing
    // checks, on a sanction that never froze anything.
    const { sanction } = await logSanction({
      severity: 'MINOR',
      reason: 'Kit missing',
      remediation: 'ignored',
    });
    expect(sanction.remediationTaskIdRequired).toBeUndefined();
  });

  it('leaves an audit row naming the tier and the escalation', async () => {
    await logSanction({ severity: 'MINOR', reason: 'Late' });
    const { sanction } = await logSanction({ severity: 'MINOR', reason: 'Late again' });

    // Found by the id it is about, not by being the newest. The clock is frozen
    // for these tests, so both rows carry the same timestamp and "latest" is
    // whichever way the sort happened to fall.
    const rows = await db.auditLogs.toArray();
    const row = rows.find((r) => r.entityId === sanction.id);

    expect(row?.newValue).toContain('Detention');
    expect(row?.newValue).toContain('escalated from Minor');
    expect(row?.newValue).toContain('Late again');
  });

  it('can log something that happened on an earlier day', async () => {
    const { sanction } = await logSanction({
      severity: 'DETENTION',
      reason: 'Friday detention',
      date: '2026-08-28',
    });
    expect(sanction.date).toBe('2026-08-28');
  });
});

describe('what it does to the XP ledger', () => {
  it('takes the penalty off the balance', async () => {
    const before = await calculateTotalXP();
    await logSanction({ severity: 'DETENTION', reason: 'Detention' });
    const after = await calculateTotalXP();

    expect(after.penaltyXP - before.penaltyXP).toBe(150);
  });

  it('a minor incident costs a tenth of what a serious one does', async () => {
    await logSanction({ severity: 'MINOR', reason: 'Late' });
    const minorOnly = (await calculateTotalXP()).penaltyXP;

    await resetDatabase();
    await logSanction({ severity: 'SERIOUS', reason: 'Removed from a lesson' });
    const seriousOnly = (await calculateTotalXP()).penaltyXP;

    expect(minorOnly).toBe(50);
    expect(seriousOnly).toBe(500);
  });

  it('shuts the shop only for the serious one', async () => {
    await logSanction({ severity: 'DETENTION', reason: 'Detention' });
    expect((await calculateTotalXP()).isShopFrozen).toBe(false);

    await logSanction({ severity: 'SERIOUS', reason: 'Removed', remediation: 'Catch up' });
    expect((await calculateTotalXP()).isShopFrozen).toBe(true);
  });
});

describe('lifting a freeze', () => {
  it('reopens the shop and dates the resolution', async () => {
    const { sanction } = await logSanction({
      severity: 'SERIOUS',
      reason: 'Removed',
      remediation: 'Catch up',
    });

    await liftSanction(sanction, 'Work handed in');

    const stored = await db.sanctions.get(sanction.id);
    expect(stored?.shopFrozen).toBe(false);
    expect(stored?.resolvedAt).toBeTypeOf('number');
    expect((await calculateTotalXP()).isShopFrozen).toBe(false);
  });

  it('keeps the penalty after the freeze is lifted', async () => {
    // The XP was the cost of the incident; the freeze was the condition. Lifting
    // one must not refund the other.
    const { sanction } = await logSanction({
      severity: 'SERIOUS',
      reason: 'Removed',
      remediation: 'Catch up',
    });
    await liftSanction(sanction);

    expect((await calculateTotalXP()).penaltyXP).toBe(500);
  });
});

describe('rows written before tiers existed', () => {
  const legacy: Sanction = {
    id: 'legacy_1',
    type: 'DETENTION',
    reason: 'Old flat-rate detention',
    date: '2026-08-30',
    penaltyXP: -500,
    shopFrozen: true,
    loggedBy: 'PARENT',
  };

  it('reads as the top tier, which is what they were logged at', () => {
    expect(severityOf(legacy)).toBe('SERIOUS');
  });

  it('still counts towards escalating a new incident', async () => {
    await db.sanctions.add(legacy);
    const { sanction } = await logSanction({ severity: 'MINOR', reason: 'Late' });
    expect(sanction.severity).toBe('DETENTION');
  });
});

describe('the standing shown to the student', () => {
  it('names the tier the next incident would land at', async () => {
    const clean = await readSanctionStanding(TODAY);
    expect(clean.nextTierIfRepeated).toBe('MINOR');

    await logSanction({ severity: 'MINOR', reason: 'Late' });

    const afterOne = await readSanctionStanding(TODAY);
    expect(afterOne.nextTierIfRepeated).toBe('DETENTION');
    expect(afterOne.recentCount).toBe(1);
  });

  it('totals what has been lost, and reports an open freeze', async () => {
    await logSanction({ severity: 'MINOR', reason: 'Late' });
    // The second escalates to DETENTION (-150), not MINOR (-50).
    await logSanction({ severity: 'MINOR', reason: 'Late again' });

    const standing = await readSanctionStanding(TODAY);
    expect(standing.totalPenaltyXP).toBe(200);
    expect(standing.isShopFrozen).toBe(false);
    expect(standing.openSerious).toHaveLength(0);
  });

  it('lists the unresolved serious incident holding the shop shut', async () => {
    await logSanction({ severity: 'SERIOUS', reason: 'Removed', remediation: 'Catch up' });
    const standing = await readSanctionStanding(TODAY);
    expect(standing.openSerious).toHaveLength(1);
    expect(standing.isShopFrozen).toBe(true);
  });
});

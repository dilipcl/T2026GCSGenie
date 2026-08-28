import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { readEnergySignal } from './energySignal';
import { DailyCheckIn } from '../types';

let clock = new Date('2026-09-01T08:00:00').getTime();

/** Appends a check-in later than every previous one. */
async function checkIn(energyLevel: 1 | 2 | 3 | 4 | 5, date = '2026-09-01') {
  clock += 3_600_000;
  const row: DailyCheckIn = {
    id: `c-${clock}`,
    date,
    timestamp: clock,
    session: 'EVENING',
    energyLevel,
    focusRating: 'NORMAL',
    completedHomeworkIds: [],
    completedRevisionMinutes: 0,
    xpEarned: 0,
    isDailyBaseXPAwarded: false,
  };
  await db.checkIns.add(row);
}

beforeEach(async () => {
  await emptyDatabase();
  clock = new Date('2026-09-01T08:00:00').getTime();
});

describe('readEnergySignal', () => {
  it('says nothing with no check-ins at all', async () => {
    const signal = await readEnergySignal();
    expect(signal.isLow).toBe(false);
    expect(signal.message).toBeUndefined();
    expect(signal.sampleSize).toBe(0);
  });

  it('says nothing when energy is fine', async () => {
    for (const e of [4, 5, 4, 3, 4] as const) await checkIn(e);
    const signal = await readEnergySignal();
    expect(signal.isLow).toBe(false);
    expect(signal.averageEnergy).toBe(4);
  });

  it('says nothing after one hard day', async () => {
    for (const e of [4, 4, 1, 4, 4] as const) await checkIn(e);
    expect((await readEnergySignal()).isLow).toBe(false);
  });

  it('says nothing after two hard days', async () => {
    for (const e of [4, 2, 4, 2, 4] as const) await checkIn(e);
    expect((await readEnergySignal()).isLow).toBe(false);
  });

  it('speaks up at three low check-ins out of five', async () => {
    for (const e of [4, 2, 3, 2, 1] as const) await checkIn(e);
    const signal = await readEnergySignal();
    expect(signal.isLow).toBe(true);
    expect(signal.lowCount).toBe(3);
    expect(signal.message).toBeTruthy();
  });

  /**
   * The acceptance criterion. This is the state the film spends two scenes on,
   * and until now every screen in the app stayed green through it.
   */
  it('responds to five consecutive check-ins on empty', async () => {
    for (let i = 0; i < 5; i++) await checkIn(1);

    const signal = await readEnergySignal();
    expect(signal.isLow).toBe(true);
    expect(signal.lowCount).toBe(5);
    expect(signal.currentRun).toBe(5);
    expect(signal.averageEnergy).toBe(1);
    expect(signal.message).toContain('make smaller');
  });

  it('only looks at the five most recent check-ins', async () => {
    // A bad week, then a recovery.
    for (let i = 0; i < 4; i++) await checkIn(1);
    for (let i = 0; i < 5; i++) await checkIn(4);

    const signal = await readEnergySignal();
    expect(signal.isLow).toBe(false);
    expect(signal.sampleSize).toBe(5);
    expect(signal.currentRun).toBe(0);
  });

  it('counts the run only up to the first good day', async () => {
    for (const e of [1, 1, 4, 1, 1] as const) await checkIn(e);
    const signal = await readEnergySignal();
    // Newest first: 1, 1, 4, 1, 1 -> the run ends at the 4.
    expect(signal.currentRun).toBe(2);
    expect(signal.lowCount).toBe(4);
  });

  it('phrases an unbroken run differently from a scattered one', async () => {
    for (const e of [3, 1, 1, 1] as const) await checkIn(e);
    expect((await readEnergySignal()).message).toContain('in a row');

    await emptyDatabase();
    for (const e of [1, 4, 1, 4, 1] as const) await checkIn(e);
    const scattered = await readEnergySignal();
    expect(scattered.message).toContain('of your last');
    expect(scattered.message).not.toContain('in a row');
  });

  it('works before five check-ins exist', async () => {
    for (const e of [1, 2, 1] as const) await checkIn(e);
    const signal = await readEnergySignal();
    expect(signal.sampleSize).toBe(3);
    expect(signal.isLow).toBe(true);
  });

  it('treats a check-in with no energy recorded as ordinary', async () => {
    // The focus timer writes energy 3 by default; a legacy row may have none.
    await db.checkIns.add({
      id: 'legacy',
      date: '2026-09-01',
      timestamp: clock + 1000,
      session: 'STUDY_SESSION',
      energyLevel: undefined as unknown as DailyCheckIn['energyLevel'],
      focusRating: 'NORMAL',
      completedHomeworkIds: [],
      completedRevisionMinutes: 30,
      xpEarned: 0,
      isDailyBaseXPAwarded: false,
    });
    const signal = await readEnergySignal();
    expect(signal.isLow).toBe(false);
    expect(signal.averageEnergy).toBe(3);
  });
});

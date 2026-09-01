import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { resetDatabase, emptyDatabase } from '../test/harness';
import { PlannedActivity } from '../types';
import {
  ACTIVITY_CATEGORIES,
  CATEGORY_ORDER,
  addsToLoad,
  confirmAttendance,
  expectedHours,
  guessCategory,
  isConfirmed,
  loadWeekActivities,
  plannedHours,
  readActivityLoad,
  removeActivity,
  saveActivity,
  seedWeekFromCommitments,
  shouldAskAboutActivities,
} from './activityPlanService';
import { calculateBurnoutCapacity, safeStudyHours } from './burnoutEngine';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

// Week of Mon 2026-08-31.
const MONDAY = '2026-08-31';
const WEDNESDAY = '2026-09-02';

async function add(over: Partial<PlannedActivity> = {}) {
  return saveActivity({
    weekStart: MONDAY,
    label: over.label ?? 'Birthday party',
    category: over.category ?? 'FUN',
    plannedOccasions: over.plannedOccasions ?? 1,
    hoursEach: over.hoursEach ?? 3,
    fromCommitmentId: over.fromCommitmentId,
  });
}

beforeEach(async () => {
  await resetDatabase();
  freezeAt(WEDNESDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the categories', () => {
  it('names all five, in a fixed order', () => {
    expect(CATEGORY_ORDER).toHaveLength(5);
    for (const id of CATEGORY_ORDER) {
      expect(ACTIVITY_CATEGORIES[id].label).toBeTruthy();
      expect(ACTIVITY_CATEGORIES[id].icon).toBeTruthy();
    }
  });

  it('guesses a sensible category from a commitment name', () => {
    expect(guessCategory('School')).toBe('ACADEMIC');
    expect(guessCategory('Air Cadets parade night')).toBe('EXTRA_CURRICULAR');
    expect(guessCategory('Drum practice')).toBe('EXTRA_CURRICULAR');
    expect(guessCategory('Work experience week')).toBe('CAREER');
    expect(guessCategory('Swim training')).toBe('RECREATIONAL');
  });

  it('falls back rather than claiming everything is academic', () => {
    // Defaulting to ACADEMIC would have the breakdown announce the week was all
    // school on the day this was introduced.
    expect(guessCategory('Something nobody anticipated')).toBe('EXTRA_CURRICULAR');
  });
});

describe('counting the hours', () => {
  it('multiplies occasions by the hours each', () => {
    const school = { plannedOccasions: 4, hoursEach: 6.5 } as PlannedActivity;
    expect(plannedHours(school)).toBe(26);
  });

  it('expects the plan until something says otherwise', () => {
    const a = { plannedOccasions: 2, hoursEach: 3 } as PlannedActivity;
    // Silence is not absence - it is a question nobody has asked yet.
    expect(expectedHours(a)).toBe(6);
    expect(isConfirmed(a)).toBe(false);
  });

  it('uses the confirmed count once there is one', () => {
    const a = { plannedOccasions: 2, hoursEach: 3, actualOccasions: 1 } as PlannedActivity;
    expect(expectedHours(a)).toBe(3);
    expect(isConfirmed(a)).toBe(true);
  });

  it('treats a confirmed zero as confirmed, not as missing', () => {
    // `?? ` on a falsy 0 is the classic way this goes wrong.
    const a = { plannedOccasions: 2, hoursEach: 3, actualOccasions: 0 } as PlannedActivity;
    expect(expectedHours(a)).toBe(0);
    expect(isConfirmed(a)).toBe(true);
  });

  it('never returns negative hours from bad input', () => {
    const a = { plannedOccasions: -3, hoursEach: -2 } as PlannedActivity;
    expect(plannedHours(a)).toBe(0);
  });
});

describe('the week as a whole', () => {
  it('totals the planned and the expected separately', async () => {
    await add({ label: 'Party', plannedOccasions: 1, hoursEach: 3 });
    const film = await add({ label: 'Film night', plannedOccasions: 1, hoursEach: 2.5 });
    await confirmAttendance(film, 0);

    const load = await readActivityLoad(MONDAY);
    expect(load.totalPlannedHours).toBe(5.5);
    expect(load.totalExpectedHours).toBe(3);
    expect(load.freedHours).toBe(2.5);
  });

  it('breaks the week down by category, dropping the empty ones', async () => {
    await add({ label: 'Party', category: 'FUN', hoursEach: 3 });
    await add({ label: 'Open day', category: 'CAREER', hoursEach: 4 });

    const load = await readActivityLoad(MONDAY);
    expect(load.byCategory.map((c) => c.category)).toEqual(['CAREER', 'FUN']);
    expect(load.byCategory.find((c) => c.category === 'FUN')!.expectedHours).toBe(3);
  });

  it('lists what has not been confirmed yet', async () => {
    const party = await add({ label: 'Party' });
    await add({ label: 'Film' });
    await confirmAttendance(party, 1);

    const load = await readActivityLoad(MONDAY);
    expect(load.unconfirmed.map((a) => a.label)).toEqual(['Film']);
  });

  it('keeps one week out of another', async () => {
    await add({ label: 'This week' });
    await saveActivity({
      weekStart: '2026-09-07',
      label: 'Next week',
      category: 'FUN',
      plannedOccasions: 1,
      hoursEach: 2,
    });

    expect((await loadWeekActivities(MONDAY)).map((a) => a.label)).toEqual(['This week']);
  });

  it('returns a stable order', async () => {
    await add({ label: 'A', category: 'FUN', hoursEach: 2 });
    await add({ label: 'B', category: 'FUN', hoursEach: 2 });

    const first = (await loadWeekActivities(MONDAY)).map((a) => a.label);
    const second = (await loadWeekActivities(MONDAY)).map((a) => a.label);
    expect(first).toEqual(second);
  });
});

describe('confirming what actually happened', () => {
  it('records the count and dates it', async () => {
    const cadets = await add({ label: 'Cadets', plannedOccasions: 2, hoursEach: 3 });
    const updated = await confirmAttendance(cadets, 1);

    expect(updated.actualOccasions).toBe(1);
    expect(updated.confirmedAt).toBeTypeOf('number');
    expect(expectedHours(updated)).toBe(3);
  });

  it('clamps a count above what was planned', async () => {
    // "5 of 4 parade nights" is a slip, not a fifth parade night.
    const a = await add({ plannedOccasions: 4, hoursEach: 1 });
    expect((await confirmAttendance(a, 5)).actualOccasions).toBe(4);
  });

  it('clamps a negative count', async () => {
    const a = await add({ plannedOccasions: 4, hoursEach: 1 });
    expect((await confirmAttendance(a, -2)).actualOccasions).toBe(0);
  });

  it('leaves the confirmation alone when the forecast is later corrected', async () => {
    const a = await add({ label: 'Cadets', plannedOccasions: 3, hoursEach: 2 });
    await confirmAttendance(a, 2);

    // Correcting the plan is not a claim about what happened.
    const edited = await saveActivity({
      id: a.id,
      weekStart: MONDAY,
      label: 'Cadets',
      category: 'EXTRA_CURRICULAR',
      plannedOccasions: 2,
      hoursEach: 2,
    });
    expect(edited.actualOccasions).toBe(2);
  });

  it('leaves an audit row saying what changed', async () => {
    const a = await add({ label: 'Cadets', plannedOccasions: 2, hoursEach: 3 });
    await confirmAttendance(a, 1);

    const rows = await db.auditLogs.toArray();
    const row = rows.find((r) => r.entityId === a.id && r.fieldChanged === 'actualOccasions');
    expect(row?.newValue).toContain('1 of 2 happened');
  });
});

describe('what the capacity gauge is allowed to count', () => {
  it('counts a bespoke activity', async () => {
    await add({ label: 'Party', hoursEach: 3, plannedOccasions: 1 });
    const load = await readActivityLoad(MONDAY);
    expect(load.bespokeExpectedHours).toBe(3);
  });

  it('does not count one standing in for a fixed commitment', async () => {
    // Those hours are already inside the commitment baseline. Counting them
    // here charges the week twice for the same Tuesday evening.
    await add({ label: 'Cadets', hoursEach: 3, plannedOccasions: 2, fromCommitmentId: 'c1' });
    const load = await readActivityLoad(MONDAY);

    expect(load.totalPlannedHours).toBe(6);
    expect(load.bespokeExpectedHours).toBe(0);
  });

  it('distinguishes the two kinds', async () => {
    const bespoke = await add({ label: 'Party' });
    const derived = await add({ label: 'School', fromCommitmentId: 'c1' });
    expect(addsToLoad(bespoke)).toBe(true);
    expect(addsToLoad(derived)).toBe(false);
  });
});

describe('seeding the week from the recurring commitments', () => {
  it('creates a row per active commitment', async () => {
    const created = await seedWeekFromCommitments(MONDAY);
    const commitments = (await db.commitments.toArray()).filter((c) => c.isActive);

    expect(created.length).toBeGreaterThan(0);
    expect(created).toHaveLength(commitments.length);
    expect(created.every((a) => a.fromCommitmentId)).toBe(true);
  });

  it('is safe to run twice', async () => {
    // Called on every open, and from two devices.
    await seedWeekFromCommitments(MONDAY);
    const again = await seedWeekFromCommitments(MONDAY);
    expect(again).toHaveLength(0);
  });

  it('does not overwrite a confirmation on re-run', async () => {
    const [first] = await seedWeekFromCommitments(MONDAY);
    await confirmAttendance(first, 0);
    await seedWeekFromCommitments(MONDAY);

    const stored = await db.plannedActivities.get(first.id);
    expect(stored?.actualOccasions).toBe(0);
  });

  it('uses a deterministic id, so two devices produce one row', async () => {
    const [first] = await seedWeekFromCommitments(MONDAY);
    expect(first.id).toContain(first.fromCommitmentId!);
    expect(first.id).toContain(MONDAY);
  });

  it('adds nothing to the load, since the hours are already counted', async () => {
    await seedWeekFromCommitments(MONDAY);
    expect((await readActivityLoad(MONDAY)).bespokeExpectedHours).toBe(0);
  });
});

describe('the effect on study headroom', () => {
  it('takes a bespoke activity out of the time available', async () => {
    const before = safeStudyHours(await calculateBurnoutCapacity());

    await saveActivity({
      weekStart: MONDAY,
      label: 'Birthday party',
      category: 'FUN',
      plannedOccasions: 1,
      hoursEach: 4,
    });

    const after = safeStudyHours(await calculateBurnoutCapacity());
    expect(before - after).toBeCloseTo(4, 1);
  });

  it('hands the hours back when it does not happen', async () => {
    const party = await saveActivity({
      weekStart: MONDAY,
      label: 'Birthday party',
      category: 'FUN',
      plannedOccasions: 1,
      hoursEach: 4,
    });
    const withParty = safeStudyHours(await calculateBurnoutCapacity());

    await confirmAttendance(party, 0);
    const without = safeStudyHours(await calculateBurnoutCapacity());

    expect(without - withParty).toBeCloseTo(4, 1);
  });

  it('does not charge the week twice for a recurring commitment', async () => {
    const before = safeStudyHours(await calculateBurnoutCapacity());
    await seedWeekFromCommitments(MONDAY);
    const after = safeStudyHours(await calculateBurnoutCapacity());

    // School and cadets already reach the gauge as commitments.
    expect(after).toBeCloseTo(before, 1);
  });

  it('reports the activity hours it counted', async () => {
    await saveActivity({
      weekStart: MONDAY,
      label: 'Film night',
      category: 'FUN',
      plannedOccasions: 1,
      hoursEach: 2.5,
    });
    expect((await calculateBurnoutCapacity()).plannedActivityHours).toBe(2.5);
  });

  it('counts nothing when the week has no activities', async () => {
    await emptyDatabase();
    expect((await calculateBurnoutCapacity()).plannedActivityHours).toBe(0);
  });
});

describe('when the check-in should ask', () => {
  const load = (over: Partial<Awaited<ReturnType<typeof readActivityLoad>>> = {}) =>
    ({
      activities: [{} as PlannedActivity],
      unconfirmed: [{} as PlannedActivity],
      ...over,
    }) as Awaited<ReturnType<typeof readActivityLoad>>;

  it('stays quiet on Monday, when nothing has happened yet', () => {
    expect(shouldAskAboutActivities(load(), 1)).toBe(false);
  });

  it('asks from midweek', () => {
    expect(shouldAskAboutActivities(load(), 3)).toBe(true);
    expect(shouldAskAboutActivities(load(), 6)).toBe(true);
  });

  it('stops once everything has been answered', () => {
    // A question with a known answer trains people to dismiss the form.
    expect(shouldAskAboutActivities(load({ unconfirmed: [] }), 5)).toBe(false);
  });

  it('stays quiet when the week has no activities at all', () => {
    expect(shouldAskAboutActivities(load({ activities: [], unconfirmed: [] }), 5)).toBe(false);
  });
});

describe('removing one', () => {
  it('takes it out of the week and logs it', async () => {
    const a = await add({ label: 'Cancelled party' });
    await removeActivity(a);

    expect(await loadWeekActivities(MONDAY)).toHaveLength(0);
    const rows = await db.auditLogs.toArray();
    expect(rows.some((r) => r.entityId === a.id && r.action === 'DELETE')).toBe(true);
  });
});

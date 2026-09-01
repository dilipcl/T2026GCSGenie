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
  derivedActivities,
  purgeSeededActivities,
  bespokeActivityHours,
  shouldAskAboutActivities,
} from './activityPlanService';
import { logException } from './commitmentService';
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
  // No recurring commitments, so these describe only what was typed in. The
  // derived rows are the real timetable and have their own block below.
  beforeEach(async () => {
    await db.commitments.clear();
  });

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

  it('ignores a stored row that stands in for a fixed commitment', async () => {
    // Those hours reach the gauge through the commitment itself. A stored copy
    // is the stale shape the first version wrote, and counting it would charge
    // the week twice for the same Tuesday evening.
    await db.commitments.clear();
    await add({ label: 'Cadets', hoursEach: 3, plannedOccasions: 2, fromCommitmentId: 'c1' });
    const load = await readActivityLoad(MONDAY);

    expect(load.bespokeExpectedHours).toBe(0);
    expect(load.totalPlannedHours).toBe(0);
  });

  it('distinguishes the two kinds', async () => {
    const bespoke = await add({ label: 'Party' });
    const derived = await add({ label: 'School', fromCommitmentId: 'c1' });
    expect(addsToLoad(bespoke)).toBe(true);
    expect(addsToLoad(derived)).toBe(false);
  });
});

describe('the recurring commitments, derived rather than stored', () => {
  it('lists a row for each commitment that has occasions this week', async () => {
    const rows = await derivedActivities(MONDAY, 'ODD');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.fromCommitmentId)).toBe(true);
  });

  it('stores nothing, so the panel and the gauge cannot disagree', async () => {
    await derivedActivities(MONDAY, 'ODD');
    // The first version wrote a copy here. That copy was a second record of the
    // same fact, and only the commitment half ever reached the capacity gauge.
    expect(await db.plannedActivities.toArray()).toHaveLength(0);
  });

  it('counts school as one occasion per weekday', async () => {
    const school = (await derivedActivities(MONDAY, 'ODD')).find((r) =>
      r.label.toLowerCase().includes('school')
    );
    expect(school?.plannedOccasions).toBe(5);
  });

  it('leaves an untouched week reading as a forecast, not a confirmation', async () => {
    const rows = await derivedActivities(MONDAY, 'ODD');
    expect(rows.every((r) => r.actualOccasions === undefined)).toBe(true);
  });

  it('drops the count when a day is marked as not happening', async () => {
    const commitments = await db.commitments.toArray();
    const school = commitments.find((c) => c.label.toLowerCase().includes('school'))!;

    await logException({
      commitment: school,
      date: MONDAY,
      title: school.label,
      scheduledHours: school.hoursPerOccasion,
      status: 'CANCELLED_BY_ORGANISER',
      reasonCategory: 'STAND_DOWN',
    });

    const row = (await derivedActivities(MONDAY, 'ODD')).find(
      (r) => r.fromCommitmentId === school.id
    )!;
    expect(row.plannedOccasions).toBe(5);
    expect(row.actualOccasions).toBe(4);
    expect(expectedHours(row)).toBeLessThan(plannedHours(row));
  });

  it('does not treat "attended after all" as a miss', async () => {
    const school = (await db.commitments.toArray()).find((c) =>
      c.label.toLowerCase().includes('school')
    )!;
    await logException({
      commitment: school,
      date: MONDAY,
      title: school.label,
      scheduledHours: school.hoursPerOccasion,
      status: 'ATTENDED',
      reasonCategory: 'OTHER',
    });

    const row = (await derivedActivities(MONDAY, 'ODD')).find(
      (r) => r.fromCommitmentId === school.id
    )!;
    expect(row.actualOccasions).toBeUndefined();
  });

  it('clears the copies the first version stored', async () => {
    await db.plannedActivities.add({
      id: 'activity_stale',
      weekStart: MONDAY,
      label: 'School',
      category: 'ACADEMIC',
      plannedOccasions: 5,
      hoursEach: 6.5,
      fromCommitmentId: 'commit_school',
      createdAt: Date.now(),
      createdBy: 'STUDENT',
    });

    expect(await purgeSeededActivities(MONDAY)).toBe(1);
    expect(await db.plannedActivities.toArray()).toHaveLength(0);
  });

  it('never purges a row somebody typed in', async () => {
    await add({ label: 'Birthday party' });
    expect(await purgeSeededActivities(MONDAY)).toBe(0);
    expect(await db.plannedActivities.toArray()).toHaveLength(1);
  });

  it('ignores a stale stored copy when totalling the load', async () => {
    await db.plannedActivities.add({
      id: 'activity_stale',
      weekStart: MONDAY,
      label: 'School',
      category: 'ACADEMIC',
      plannedOccasions: 5,
      hoursEach: 6.5,
      fromCommitmentId: 'commit_school',
      createdAt: Date.now(),
      createdBy: 'STUDENT',
    });
    expect(await bespokeActivityHours(MONDAY)).toBe(0);
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
    // Reading the panel must not move the gauge: the commitments reach it
    // through their own breakdown, and the panel only derives a view of them.
    await derivedActivities(MONDAY, 'ODD');
    const after = safeStudyHours(await calculateBurnoutCapacity());

    expect(after).toBeCloseTo(before, 1);
  });

  it('gives the hours back when a school day is cancelled', async () => {
    // The bug this whole rework is about: the panel used to show the day gone
    // while the gauge carried on charging for it.
    const school = (await db.commitments.toArray()).find((c) =>
      c.label.toLowerCase().includes('school')
    )!;
    const before = safeStudyHours(await calculateBurnoutCapacity());

    await logException({
      commitment: school,
      date: MONDAY,
      title: school.label,
      scheduledHours: school.hoursPerOccasion,
      status: 'CANCELLED_BY_ORGANISER',
      reasonCategory: 'STAND_DOWN',
    });

    const after = safeStudyHours(await calculateBurnoutCapacity());
    expect(after - before).toBeCloseTo(school.hoursPerOccasion, 1);

    // And the panel now says the same thing.
    const row = (await derivedActivities(MONDAY, 'ODD')).find(
      (r) => r.fromCommitmentId === school.id
    )!;
    expect(row.actualOccasions).toBe(row.plannedOccasions - 1);
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
    await db.commitments.clear();
    const a = await add({ label: 'Cancelled party' });
    await removeActivity(a);

    expect(await loadWeekActivities(MONDAY)).toHaveLength(0);
    const rows = await db.auditLogs.toArray();
    expect(rows.some((r) => r.entityId === a.id && r.action === 'DELETE')).toBe(true);
  });
});

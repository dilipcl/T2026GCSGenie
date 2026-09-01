import { db } from '../db';
import { ActivityCategory, PlannedActivity, UserRole } from '../types';
import { logAuditEvent } from './auditService';
import { newId } from '../utils/id';
import { startOfWeekISO, todayISO } from '../utils/date';

/**
 * What the week is for, besides the work.
 *
 * The capacity gauge knew about school and cadets because those are recurring
 * and someone set them up once. It knew nothing about the birthday party, the
 * film, or the afternoon spent with friends - so a week with nine hours of real,
 * good, non-negotiable life in it looked identical to an empty one, and the
 * planner cheerfully advised committing the time twice over.
 *
 * The unit is "4 days of school", not four rows. That is how a week is
 * described out loud, and one row per occasion would make an ordinary week a
 * chore to enter and therefore one nobody enters.
 *
 * Two things this is careful about:
 *
 *  - Recurring commitments already reach the gauge through `FixedCommitment`.
 *    They appear here so the week reads as a whole, carrying
 *    `fromCommitmentId`, and their hours are counted exactly once.
 *  - A plan is a forecast. Not every parade night happens and not every party
 *    is gone to, so the check-in asks, and until it does the forecast is
 *    labelled as one rather than reported as fact.
 */

export interface ActivityCategoryMeta {
  id: ActivityCategory;
  label: string;
  icon: string;
  /** Tailwind text colour, so a breakdown reads at a glance. */
  accent: string;
  blurb: string;
}

export const ACTIVITY_CATEGORIES: Record<ActivityCategory, ActivityCategoryMeta> = {
  ACADEMIC: {
    id: 'ACADEMIC',
    label: 'Academic',
    icon: '📚',
    accent: 'text-indigo-300',
    blurb: 'School, lessons, tutoring, revision sessions',
  },
  EXTRA_CURRICULAR: {
    id: 'EXTRA_CURRICULAR',
    label: 'Extra-curricular',
    icon: '🎖️',
    accent: 'text-emerald-300',
    blurb: 'Cadets, drums, sport, clubs',
  },
  CAREER: {
    id: 'CAREER',
    label: 'Career-focussed',
    icon: '🧭',
    accent: 'text-amber-300',
    blurb: 'Work experience, open days, careers evenings',
  },
  RECREATIONAL: {
    id: 'RECREATIONAL',
    label: 'Recreational',
    icon: '🏃',
    accent: 'text-cyan-300',
    blurb: 'Exercise, walks, hobbies, downtime that restores',
  },
  FUN: {
    id: 'FUN',
    label: 'Fun',
    icon: '🎉',
    accent: 'text-fuchsia-300',
    blurb: 'Parties, films, friends — the reason for the rest of it',
  },
};

export const CATEGORY_ORDER: ActivityCategory[] = [
  'ACADEMIC',
  'EXTRA_CURRICULAR',
  'CAREER',
  'RECREATIONAL',
  'FUN',
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** What the week was forecast to cost. */
export function plannedHours(activity: PlannedActivity): number {
  return round1(Math.max(0, activity.plannedOccasions) * Math.max(0, activity.hoursEach));
}

/**
 * What it is now expected to cost.
 *
 * Falls back to the plan until someone confirms otherwise, because an
 * unconfirmed activity has not been shown to be missed - it has only not been
 * asked about yet, and treating silence as absence would quietly hand back
 * hours nobody freed up.
 */
export function expectedHours(activity: PlannedActivity): number {
  const occasions = activity.actualOccasions ?? activity.plannedOccasions;
  return round1(Math.max(0, occasions) * Math.max(0, activity.hoursEach));
}

export function isConfirmed(activity: PlannedActivity): boolean {
  return typeof activity.actualOccasions === 'number';
}

/** Only bespoke rows add load; the rest are already in the capacity baseline. */
export function addsToLoad(activity: PlannedActivity): boolean {
  return !activity.fromCommitmentId;
}

export async function loadWeekActivities(
  weekStart: string = startOfWeekISO()
): Promise<PlannedActivity[]> {
  const rows = await db.plannedActivities.where('weekStart').equals(weekStart).toArray();
  // Category order, then longest first: the shape of the week, not its
  // insertion history. `id` breaks a tie so the list never reshuffles.
  return rows.sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      expectedHours(b) - expectedHours(a) ||
      a.id.localeCompare(b.id)
  );
}

export interface CategoryLoad {
  category: ActivityCategory;
  plannedHours: number;
  expectedHours: number;
  occasions: number;
}

export interface ActivityLoad {
  activities: PlannedActivity[];
  /** Everything in the week, whether or not it adds to the gauge. */
  totalPlannedHours: number;
  totalExpectedHours: number;
  /**
   * Only the bespoke rows. This is the number the capacity gauge adds, and the
   * only one that must never include a recurring commitment.
   */
  bespokeExpectedHours: number;
  byCategory: CategoryLoad[];
  /** Rows the check-in has not asked about yet. */
  unconfirmed: PlannedActivity[];
  /** Hours the week got back because something did not happen. */
  freedHours: number;
}

export async function readActivityLoad(
  weekStart: string = startOfWeekISO()
): Promise<ActivityLoad> {
  const activities = await loadWeekActivities(weekStart);

  const byCategory = CATEGORY_ORDER.map((category) => {
    const rows = activities.filter((a) => a.category === category);
    return {
      category,
      plannedHours: round1(rows.reduce((sum, a) => sum + plannedHours(a), 0)),
      expectedHours: round1(rows.reduce((sum, a) => sum + expectedHours(a), 0)),
      occasions: rows.reduce((sum, a) => sum + (a.actualOccasions ?? a.plannedOccasions), 0),
    };
  }).filter((c) => c.plannedHours > 0 || c.expectedHours > 0);

  const totalPlannedHours = round1(activities.reduce((sum, a) => sum + plannedHours(a), 0));
  const totalExpectedHours = round1(activities.reduce((sum, a) => sum + expectedHours(a), 0));

  return {
    activities,
    totalPlannedHours,
    totalExpectedHours,
    bespokeExpectedHours: round1(
      activities.filter(addsToLoad).reduce((sum, a) => sum + expectedHours(a), 0)
    ),
    byCategory,
    unconfirmed: activities.filter((a) => !isConfirmed(a)),
    freedHours: round1(Math.max(0, totalPlannedHours - totalExpectedHours)),
  };
}

export interface SaveActivityInput {
  id?: string;
  weekStart?: string;
  label: string;
  category: ActivityCategory;
  plannedOccasions: number;
  hoursEach: number;
  notes?: string;
  fromCommitmentId?: string;
  by?: UserRole;
}

export async function saveActivity(input: SaveActivityInput): Promise<PlannedActivity> {
  const weekStart = input.weekStart ?? startOfWeekISO();
  const existing = input.id ? await db.plannedActivities.get(input.id) : undefined;

  const activity: PlannedActivity = {
    id: existing?.id ?? input.id ?? newId('activity'),
    weekStart,
    label: input.label.trim(),
    category: input.category,
    plannedOccasions: Math.max(0, Math.round(input.plannedOccasions)),
    hoursEach: Math.max(0, input.hoursEach),
    // Editing the forecast leaves any confirmation alone: changing "3 nights"
    // to "2 nights" on Wednesday is a correction to the plan, not a claim about
    // what happened.
    actualOccasions: existing?.actualOccasions,
    confirmedAt: existing?.confirmedAt,
    fromCommitmentId: input.fromCommitmentId ?? existing?.fromCommitmentId,
    notes: input.notes?.trim() || undefined,
    createdAt: existing?.createdAt ?? Date.now(),
    createdBy: existing?.createdBy ?? input.by ?? 'STUDENT',
  };

  await db.plannedActivities.put(activity);
  await logAuditEvent({
    user: activity.createdBy,
    action: existing ? 'UPDATE' : 'INSERT',
    entity: 'PlannedActivity',
    entityId: activity.id,
    oldValue: existing
      ? `${existing.label} — ${existing.plannedOccasions} × ${existing.hoursEach}h`
      : undefined,
    newValue:
      `${activity.label} (${ACTIVITY_CATEGORIES[activity.category].label}) — ` +
      `${activity.plannedOccasions} × ${activity.hoursEach}h = ${plannedHours(activity)}h`,
  });

  return activity;
}

export async function removeActivity(activity: PlannedActivity): Promise<void> {
  await db.plannedActivities.delete(activity.id);
  await logAuditEvent({
    user: 'STUDENT',
    action: 'DELETE',
    entity: 'PlannedActivity',
    entityId: activity.id,
    oldValue: `${activity.label} — ${plannedHours(activity)}h`,
  });
}

/**
 * The check-in saying what actually happened.
 *
 * Clamped to the plan, because "5 of 4 parade nights" is a data-entry slip
 * rather than a fifth parade night, and letting it through would silently
 * inflate the week the gauge is trying to measure.
 */
export async function confirmAttendance(
  activity: PlannedActivity,
  actualOccasions: number
): Promise<PlannedActivity> {
  const actual = Math.min(
    Math.max(0, Math.round(actualOccasions)),
    Math.max(0, activity.plannedOccasions)
  );

  const updated: PlannedActivity = {
    ...activity,
    actualOccasions: actual,
    confirmedAt: Date.now(),
  };

  await db.plannedActivities.put(updated);
  await logAuditEvent({
    user: 'STUDENT',
    action: 'UPDATE',
    entity: 'PlannedActivity',
    entityId: activity.id,
    fieldChanged: 'actualOccasions',
    oldValue: `planned ${activity.plannedOccasions}`,
    newValue:
      `${actual} of ${activity.plannedOccasions} happened — ` +
      `${expectedHours(updated)}h of ${plannedHours(activity)}h`,
  });

  return updated;
}

/**
 * Puts the recurring commitments into the week's list, once.
 *
 * Without this the panel opens empty every Monday and the honest answer - "the
 * usual school week, plus these three things" - takes ten taps to express. Rows
 * already present are left exactly as they are, including any confirmation, so
 * this is safe to call on every open and safe to call from two devices.
 */
export async function seedWeekFromCommitments(
  weekStart: string = startOfWeekISO()
): Promise<PlannedActivity[]> {
  const [commitments, existing] = await Promise.all([
    db.commitments.toArray(),
    db.plannedActivities.where('weekStart').equals(weekStart).toArray(),
  ]);

  const alreadyThere = new Set(
    existing.flatMap((a) => (a.fromCommitmentId ? [a.fromCommitmentId] : []))
  );

  const created: PlannedActivity[] = [];
  for (const commitment of commitments.filter((c) => c.isActive)) {
    if (alreadyThere.has(commitment.id)) continue;

    const hoursEach = commitment.hoursPerOccasion || commitment.weeklyHours || 0;
    if (hoursEach <= 0) continue;

    const occasions = Math.max(1, Math.round((commitment.weeklyHours || 0) / hoursEach));

    const row: PlannedActivity = {
      // Deterministic, so two devices seeding the same week offline produce one
      // row and not two - the same reasoning as CommitmentException's id.
      id: `activity_${commitment.id}__${weekStart}`,
      weekStart,
      label: commitment.label,
      category: guessCategory(commitment.label),
      plannedOccasions: occasions,
      hoursEach: round1(hoursEach),
      fromCommitmentId: commitment.id,
      createdAt: Date.now(),
      createdBy: 'STUDENT',
    };

    await db.plannedActivities.put(row);
    created.push(row);
  }

  return created;
}

/**
 * A first guess at what a recurring commitment is for, from its name.
 *
 * Only ever a starting point - the row is editable, and getting this wrong
 * costs one tap. Guessing beats defaulting everything to ACADEMIC, which would
 * make the category breakdown say the week was all school on the day it was
 * introduced.
 */
export function guessCategory(label: string): ActivityCategory {
  const text = label.toLowerCase();
  if (/school|lesson|college|tuition|tutor|revision/.test(text)) return 'ACADEMIC';
  if (/cadet|drum|band|sport|football|club|scout|music|team/.test(text)) {
    return 'EXTRA_CURRICULAR';
  }
  if (/work experience|careers|open day|internship|apprentice/.test(text)) return 'CAREER';
  if (/gym|run|walk|swim|exercise|training/.test(text)) return 'RECREATIONAL';
  return 'EXTRA_CURRICULAR';
}

/**
 * Whether the check-in should ask about the week's activities today.
 *
 * Not on Monday: nothing has happened yet, and asking produces a confirmation
 * that means nothing. From midweek on there is something real to confirm, and
 * once every row has been answered it stops asking entirely - a question with a
 * known answer is the fastest way to train someone to dismiss the form.
 */
export function shouldAskAboutActivities(
  load: ActivityLoad,
  weekday: number,
  today: string = todayISO()
): boolean {
  void today;
  if (load.activities.length === 0) return false;
  if (load.unconfirmed.length === 0) return false;
  return weekday >= 3;
}

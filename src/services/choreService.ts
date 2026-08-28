import { db } from '../db';
import { Chore, ChoreCadence, ChoreCompletion, DayOfWeek, UserRole } from '../types';
import { addDaysISO, parseISODate, todayISO } from '../utils/date';
import { newId } from '../utils/id';
import { logAuditEvent } from './auditService';

/**
 * Recurring household chores.
 *
 * The weekly review asks a parent to "add anything missed", and until now that
 * meant opening Quick Add and filling in a homework form - subject, due date,
 * priority - for "put the bins out". So it did not get logged, and the small
 * reliable jobs that actually build the habit stayed invisible next to the
 * essays.
 *
 * Chores are deliberately outside the study plan: no due date, no subject, no
 * weekly load, no effect on the burnout gauge. They earn XP because the reward
 * shop is the loop everything else feeds, and because a job worth doing is
 * worth counting.
 */

/** Sensible defaults, kept small so chores cannot out-earn revision. */
export const DEFAULT_CHORE_XP: Record<ChoreCadence, number> = {
  DAILY: 10,
  WEEKDAYS: 10,
  WEEKLY: 25,
};

export const CADENCE_LABEL: Record<ChoreCadence, string> = {
  DAILY: 'Every day',
  WEEKDAYS: 'School days',
  WEEKLY: 'Once a week',
};

const DAY_ORDER: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const DAY_LABEL: Record<DayOfWeek, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

/**
 * Starter suggestions offered on the empty list, one tap each.
 *
 * These are suggestions in the UI, never seeded rows. Seeding re-inserts any
 * row it knows about and finds absent, so a seeded chore a parent deleted would
 * reappear on the next open - the list has to be genuinely theirs.
 */
export const CHORE_SUGGESTIONS: { title: string; cadence: ChoreCadence; dayOfWeek?: DayOfWeek }[] = [
  { title: 'Make your bed', cadence: 'DAILY' },
  { title: 'Tidy your room', cadence: 'WEEKLY', dayOfWeek: 'SAT' },
  { title: 'Load or empty the dishwasher', cadence: 'DAILY' },
  { title: 'Put the bins out', cadence: 'WEEKLY', dayOfWeek: 'TUE' },
  { title: 'Pack your bag the night before', cadence: 'WEEKDAYS' },
  { title: 'Hoover upstairs', cadence: 'WEEKLY', dayOfWeek: 'SUN' },
];

export function dayOfWeekFor(dateISO: string): DayOfWeek {
  return DAY_ORDER[parseISODate(dateISO).getDay()];
}

/** Whether a chore falls due on a given local date. */
export function isChoreDueOn(chore: Chore, dateISO: string): boolean {
  if (!chore.isActive) return false;
  const day = dayOfWeekFor(dateISO);

  switch (chore.cadence) {
    case 'DAILY':
      return true;
    case 'WEEKDAYS':
      return day !== 'SAT' && day !== 'SUN';
    case 'WEEKLY':
      return chore.dayOfWeek === day;
    default:
      return false;
  }
}

/**
 * One chore on one day is one row, whichever device ticks it.
 *
 * Two devices ticking the same chore offline and syncing later produce the same
 * primary key and merge into a single row, so the XP is paid once. A generated
 * id would have paid twice and read as a sync fault rather than a modelling one.
 */
export function completionId(choreId: string, dateISO: string): string {
  return `${choreId}__${dateISO}`;
}

export interface ChoreForDay {
  chore: Chore;
  done: boolean;
  completedAt?: number;
}

export async function choresForDay(dateISO = todayISO()): Promise<ChoreForDay[]> {
  const chores = (await db.chores.toArray())
    .filter((c) => isChoreDueOn(c, dateISO))
    .sort((a, b) => a.createdAt - b.createdAt);

  if (chores.length === 0) return [];

  const done = await db.choreCompletions.bulkGet(chores.map((c) => completionId(c.id, dateISO)));

  return chores.map((chore, i) => ({
    chore,
    done: !!done[i],
    completedAt: done[i]?.completedAt,
  }));
}

/**
 * Ticks or un-ticks a chore for a day.
 *
 * Un-ticking is a first-class action, not an oversight. A mis-tap that cannot
 * be taken back leaves XP that was never earned sitting in the balance, and the
 * whole economy depends on the number being true.
 */
export async function setChoreDone(
  chore: Chore,
  done: boolean,
  dateISO = todayISO()
): Promise<void> {
  const id = completionId(chore.id, dateISO);
  const existing = await db.choreCompletions.get(id);

  if (done) {
    if (existing) return;
    const row: ChoreCompletion = {
      id,
      choreId: chore.id,
      date: dateISO,
      completedAt: Date.now(),
      xpAwarded: chore.xpValue,
    };
    await db.choreCompletions.put(row);
  } else {
    if (!existing) return;
    await db.choreCompletions.delete(id);
  }

  await logAuditEvent({
    user: 'STUDENT',
    action: 'UPDATE',
    entity: 'Chore',
    entityId: chore.id,
    fieldChanged: 'completed',
    oldValue: done ? 'not done' : 'done',
    newValue: done
      ? `Done — "${chore.title}" (+${chore.xpValue} XP)`
      : `Un-ticked — "${chore.title}" (−${existing?.xpAwarded ?? chore.xpValue} XP)`,
  });
}

/** XP earned from chores. Folded into the ledger by ragCalculator. */
export async function choreXPEarned(): Promise<number> {
  const rows = await db.choreCompletions.toArray();
  return rows.reduce((sum, r) => sum + (r.xpAwarded || 0), 0);
}

export interface ChoreWeek {
  /** Chore slots that fell due since Monday. */
  due: number;
  done: number;
  xp: number;
}

/** How the week's chores went - read by the weekly review. */
export async function choreWeekSummary(): Promise<ChoreWeek> {
  const chores = await db.chores.toArray();
  if (chores.length === 0) return { due: 0, done: 0, xp: 0 };

  const dow = new Date().getDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const days = Array.from({ length: daysSinceMonday + 1 }, (_, i) =>
    addDaysISO(i - daysSinceMonday)
  );

  let due = 0;
  const ids: string[] = [];
  for (const date of days) {
    for (const chore of chores) {
      if (!isChoreDueOn(chore, date)) continue;
      due++;
      ids.push(completionId(chore.id, date));
    }
  }

  const found = (await db.choreCompletions.bulkGet(ids)).filter(Boolean) as ChoreCompletion[];

  return {
    due,
    done: found.length,
    xp: found.reduce((sum, r) => sum + (r.xpAwarded || 0), 0),
  };
}

export interface SaveChoreInput {
  id?: string;
  title: string;
  cadence: ChoreCadence;
  dayOfWeek?: DayOfWeek;
  xpValue?: number;
}

export async function saveChore(input: SaveChoreInput, by: UserRole = 'PARENT'): Promise<Chore> {
  const title = input.title.trim();
  if (!title) throw new Error('A chore needs a name.');

  const existing = input.id ? await db.chores.get(input.id) : undefined;

  const chore: Chore = {
    id: existing?.id ?? newId('chore'),
    title,
    cadence: input.cadence,
    // A day only means anything for a weekly chore; carrying a stale one on a
    // daily chore would make the row lie about itself if the cadence changed back.
    dayOfWeek: input.cadence === 'WEEKLY' ? (input.dayOfWeek ?? 'SAT') : undefined,
    xpValue:
      typeof input.xpValue === 'number' && input.xpValue > 0
        ? Math.round(input.xpValue)
        : (existing?.xpValue ?? DEFAULT_CHORE_XP[input.cadence]),
    isActive: existing?.isActive ?? true,
    createdAt: existing?.createdAt ?? Date.now(),
    createdBy: existing?.createdBy ?? by,
  };

  await db.chores.put(chore);

  await logAuditEvent({
    user: by,
    action: existing ? 'UPDATE' : 'INSERT',
    entity: 'Chore',
    entityId: chore.id,
    fieldChanged: existing ? 'chore' : undefined,
    oldValue: existing ? `${existing.title} (${CADENCE_LABEL[existing.cadence]}, ${existing.xpValue} XP)` : undefined,
    newValue: `${chore.title} (${CADENCE_LABEL[chore.cadence]}, ${chore.xpValue} XP)`,
  });

  return chore;
}

/**
 * Retires a chore without deleting it.
 *
 * Past completions keep pointing at a real row, and the XP already earned stays
 * earned - taking it back weeks later for a job that genuinely was done would
 * be the app breaking its own promise.
 */
export async function setChoreActive(chore: Chore, isActive: boolean): Promise<void> {
  if (chore.isActive === isActive) return;
  await db.chores.update(chore.id, { isActive });

  await logAuditEvent({
    user: 'PARENT',
    action: 'UPDATE',
    entity: 'Chore',
    entityId: chore.id,
    fieldChanged: 'isActive',
    oldValue: chore.isActive ? 'active' : 'retired',
    newValue: isActive ? `Back on the list — "${chore.title}"` : `Retired — "${chore.title}"`,
  });
}

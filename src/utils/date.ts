/**
 * Dates are stored throughout the app as local YYYY-MM-DD strings.
 *
 * Use these helpers rather than `new Date().toISOString().split('T')[0]`, which
 * resolves in UTC: during British Summer Time anything between 00:00 and 01:00
 * local returns the PREVIOUS day, so a check-in logged at 00:30 lands on
 * yesterday and silently breaks the streak.
 */
export function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today, as a local YYYY-MM-DD string. */
export function todayISO(): string {
  return toLocalISODate(new Date());
}

/**
 * A date offset by whole days, as a local YYYY-MM-DD string.
 * Uses setDate rather than millisecond arithmetic so clock changes stay correct.
 */
export function addDaysISO(days: number, from: Date = new Date()): string {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return toLocalISODate(date);
}

/** Parses a YYYY-MM-DD string as local midnight (not UTC midnight). */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

/**
 * Whole days between two local dates: `later` minus `earlier`.
 * Same-day is 0, consecutive days is 1.
 */
export function daysBetween(earlier: string, later: string): number {
  return Math.round(
    (parseISODate(later).getTime() - parseISODate(earlier).getTime()) / 86400000
  );
}

/** Whole days from today. Negative means overdue, 0 means today. */
export function daysUntil(iso: string): number {
  const target = parseISODate(iso).getTime();
  const today = parseISODate(todayISO()).getTime();
  return Math.round((target - today) / 86400000);
}

/**
 * A short human label: "Overdue by 2 days", "Today", "Tomorrow", "Fri 28 Aug".
 * Written for a 14 year old reading it at a glance, not for a log file.
 */
export function formatFriendlyDate(iso: string): string {
  const diff = daysUntil(iso);

  if (diff < -1) return `Overdue by ${Math.abs(diff)} days`;
  if (diff === -1) return 'Overdue by 1 day';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 6) {
    return parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'long' });
  }

  return parseISODate(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "in 12 days" / "in 3 weeks" - for milestones that are still a way off. */
export function formatCountdown(iso: string): string {
  const diff = daysUntil(iso);

  if (diff < 0) return 'Passed';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 14) return `in ${diff} days`;
  if (diff < 60) return `in ${Math.round(diff / 7)} weeks`;
  return `in ${Math.round(diff / 30)} months`;
}

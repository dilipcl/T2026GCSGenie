import { db } from '../db';
import { readWeekHealth } from './weekHealth';
import { goalsNeedingAction } from './goalProgress';
import { pendingConfirmation } from './changeLogService';
import { calculateStreakStats } from './habitEngine';
import { currentWeek } from './weekWindow';
import { formatShortDate, todayISO } from '../utils/date';

/**
 * What the family hub is told about the week, so Alexa can say it at 9pm.
 *
 * Every number here is read from the service that already owns it - the score
 * and colour from `readWeekHealth`, the goals from `goalsNeedingAction`, the
 * waiting updates from `pendingConfirmation`. Nothing is recomputed. A spoken
 * briefing that graded the week differently from the card on Home would be two
 * answers to one question, said out loud in the kitchen, and it would be the
 * spoken one that got argued about.
 */
export interface WeekBrief {
  score: number;
  /** Green, Amber or Red - the word, because it is spoken. */
  status: string;
  headline: string;
  /** The signals dragging the week down, worst first, as short labels. */
  concerns: string;
  goalsNeedAction: number;
  pendingUpdates: number;
  streak: number;
  streakAtRisk: boolean;
  checkedInToday: boolean;
  /** "28 Sep – 4 Oct": a date, not "this week", which is ambiguous on a Sunday. */
  weekLabel: string;
}

const STATUS_WORD: Record<string, string> = { GREEN: 'Green', AMBER: 'Amber', RED: 'Red' };

export async function readWeekBrief(): Promise<WeekBrief> {
  const week = currentWeek();
  const [health, behind, pending, streak, todays] = await Promise.all([
    readWeekHealth(week),
    goalsNeedingAction(week),
    pendingConfirmation(),
    calculateStreakStats(),
    db.checkIns.where('date').equals(todayISO()).count(),
  ]);

  return {
    score: health.score,
    status: STATUS_WORD[health.status] ?? health.status,
    headline: health.headline,
    concerns: health.concerns.map((c) => c.label).join('; '),
    goalsNeedAction: behind.length,
    pendingUpdates: pending.length,
    streak: streak.current,
    streakAtRisk: streak.atRisk,
    checkedInToday: todays > 0,
    weekLabel: `${formatShortDate(week.start)} – ${formatShortDate(week.end)}`,
  };
}

/**
 * Form-encoded rather than JSON, and that is what lets this work at all.
 *
 * The app lives on github.io and Home Assistant on nabu.casa. A JSON POST is
 * not a "simple" request, so the browser sends a CORS preflight first, Home
 * Assistant's webhook does not answer it, and the POST is never made - with
 * nothing in the app to show it failed. A form body under `no-cors` skips the
 * preflight; Home Assistant hands it to the automation as `trigger.data`.
 * The response is opaque, which costs nothing: there is nothing to read back.
 */
export function briefToForm(brief: WeekBrief): URLSearchParams {
  return new URLSearchParams({
    score: String(brief.score),
    status: brief.status,
    headline: brief.headline.slice(0, 250),
    concerns: brief.concerns.slice(0, 250),
    goals_need_action: String(brief.goalsNeedAction),
    pending_updates: String(brief.pendingUpdates),
    streak: String(brief.streak),
    streak_at_risk: brief.streakAtRisk ? 'yes' : 'no',
    checked_in_today: brief.checkedInToday ? 'yes' : 'no',
    week_label: brief.weekLabel,
  });
}

/** Only an https Home Assistant webhook. Anything else is a typo, not a destination. */
export function isWebhookUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && u.pathname.startsWith('/api/webhook/');
  } catch {
    return false;
  }
}

/**
 * Sends the brief. Never throws: the family hub being down is not something
 * Tejas should hear about in the middle of a check-in.
 */
export async function pushWeekBrief(url: string, brief: WeekBrief): Promise<boolean> {
  if (!isWebhookUrl(url)) return false;
  try {
    await fetch(url.trim(), { method: 'POST', mode: 'no-cors', body: briefToForm(brief) });
    return true;
  } catch (err) {
    console.warn('Could not reach the family hub:', err);
    return false;
  }
}

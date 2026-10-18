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

/** A check-in writes several rows in a burst; one report for the burst is enough. */
const SETTLE_MS = 4_000;
/** After a pull that did not land, how long a sync-state change alone waits to try again. */
const RETRY_AFTER_FAILURE_MS = 5 * 60_000;

export interface BriefSender {
  /** Send this brief to this hub, unless it is what was last sent there. Safe to call on every change. */
  request(url: string, brief: WeekBrief): void;
  /** The half-hourly resend: the next request sends even if nothing changed. */
  forget(): void;
  /** Signing in is a reason to try again straight away, whatever failed before. */
  forgetFailure(): void;
  cancelPending(): void;
}

/**
 * The sending, kept out of the hook so the thing that went wrong can be tested.
 *
 * The first version lived in an effect that re-ran on every sync-state change
 * and cancelled its own send on cleanup. But the send begins with a pull, and a
 * pull moves the sync state through pushing, pulling and in-sync - so every
 * send cancelled itself partway, scheduled another, and pulled again. Once a
 * parent saved a hub link, every signed-in device would have asked Dexie Cloud
 * for a full sync every few seconds, for ever, and never told the hub anything;
 * and enough of that trips the server's rate limiting, which holds up the sync
 * the rest of the app depends on.
 *
 * So a send that has started is never cancelled, nothing new is scheduled while
 * one is running, and a pull that fails is not retried just because the sync
 * state moved - that movement may be our own pull. What was last sent is keyed
 * by hub as well as brief, so changing the link sends to the new one.
 */
export function createBriefSender(
  deps: {
    pulled: () => Promise<boolean>;
    read: () => Promise<WeekBrief>;
    push: (url: string, brief: WeekBrief) => Promise<boolean>;
  },
  settleMs: number = SETTLE_MS
): BriefSender {
  let lastSent = '';
  let failedAt = -Infinity;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    request(url, brief) {
      const signature = `${url}\n${JSON.stringify(brief)}`;
      if (running || signature === lastSent) return;
      if (Date.now() - failedAt < RETRY_AFTER_FAILURE_MS) return;

      clearTimeout(timer);
      timer = setTimeout(async () => {
        running = true;
        try {
          if (!(await deps.pulled())) {
            failedAt = Date.now();
            return;
          }
          // Re-read after the pull: the brief that scheduled this may predate it.
          const fresh = await deps.read();
          if (await deps.push(url, fresh)) lastSent = `${url}\n${JSON.stringify(fresh)}`;
          else failedAt = Date.now();
        } catch (err) {
          failedAt = Date.now();
          console.warn('Could not prepare the family hub brief:', err);
        } finally {
          running = false;
        }
      }, settleMs);
    },
    forget() {
      lastSent = '';
      failedAt = -Infinity;
    },
    forgetFailure() {
      failedAt = -Infinity;
    },
    cancelPending() {
      clearTimeout(timer);
    },
  };
}

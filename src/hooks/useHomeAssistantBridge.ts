import { useEffect, useRef, useState } from 'react';
import { useLiveQuery, useObservable } from 'dexie-react-hooks';
import { db } from '../db';
import { pulledFromCloud } from '../services/fixUpConversion';
import { isWebhookUrl, pushWeekBrief, readWeekBrief } from '../services/homeAssistantBridge';

/**
 * Keeps the family hub's copy of the week current, so the 9pm briefing says
 * what Home says.
 *
 * Sends only after this device has pulled. A tablet woken after a day in a
 * drawer holds yesterday's week until its first pull lands, and if it reported
 * then it would overwrite the phone's fresh numbers with stale ones - and the
 * stale ones are what Alexa would read out. Same rule, same reason, as
 * `useQuestConversion`.
 *
 * Sends when the brief changes, and every half hour regardless. The live query
 * only re-runs when a row changes, and "checked in today" turns false at
 * midnight without any row changing at all.
 */
const RESEND_MS = 30 * 60_000;
/** A check-in writes several rows in a burst; one report for the burst is enough. */
const SETTLE_MS = 4_000;

export function useHomeAssistantBridge(): void {
  const url = useLiveQuery(
    async () => (await db.parentSettings.get('active_settings'))?.homeAssistantWebhookUrl,
    []
  );
  const brief = useLiveQuery(() => (isWebhookUrl(url) ? readWeekBrief() : undefined), [url]);
  const syncPhase = useObservable(db.cloud.syncState)?.phase;
  const userId = useObservable(db.cloud.currentUser)?.userId;
  const [tick, setTick] = useState(0);
  const lastSent = useRef('');

  useEffect(() => {
    if (!isWebhookUrl(url)) return;
    const timer = setInterval(() => {
      lastSent.current = '';
      setTick((t) => t + 1);
    }, RESEND_MS);
    return () => clearInterval(timer);
  }, [url]);

  useEffect(() => {
    if (!isWebhookUrl(url) || !brief) return;
    const signature = JSON.stringify(brief);
    if (signature === lastSent.current) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!(await pulledFromCloud()) || cancelled) return;
      // Re-read after the pull: the brief that scheduled this may predate it.
      const fresh = await readWeekBrief();
      if (cancelled) return;
      if (await pushWeekBrief(url, fresh)) lastSent.current = JSON.stringify(fresh);
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, brief, tick, syncPhase, userId]);
}

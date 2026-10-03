import { useEffect, useRef, useState } from 'react';
import { useLiveQuery, useObservable } from 'dexie-react-hooks';
import { db } from '../db';
import { pulledFromCloud } from '../services/fixUpConversion';
import {
  BriefSender,
  createBriefSender,
  isWebhookUrl,
  pushWeekBrief,
  readWeekBrief,
} from '../services/homeAssistantBridge';

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
 *
 * The effect only asks; `createBriefSender` decides. An effect that cancelled
 * its own send on cleanup, with the sync state among its dependencies, looped
 * on pulls without ever sending - see the sender for how.
 */
const RESEND_MS = 30 * 60_000;

export function useHomeAssistantBridge(): void {
  const url = useLiveQuery(
    async () => (await db.parentSettings.get('active_settings'))?.homeAssistantWebhookUrl,
    []
  );
  const brief = useLiveQuery(() => (isWebhookUrl(url) ? readWeekBrief() : undefined), [url]);
  const syncPhase = useObservable(db.cloud.syncState)?.phase;
  const userId = useObservable(db.cloud.currentUser)?.userId;
  const [tick, setTick] = useState(0);
  const sender = useRef<BriefSender | null>(null);
  if (!sender.current) {
    sender.current = createBriefSender({
      pulled: () => pulledFromCloud(),
      read: readWeekBrief,
      push: pushWeekBrief,
    });
  }

  useEffect(() => {
    if (!isWebhookUrl(url)) return;
    const timer = setInterval(() => {
      sender.current!.forget();
      setTick((t) => t + 1);
    }, RESEND_MS);
    return () => clearInterval(timer);
  }, [url]);

  useEffect(() => {
    sender.current!.forgetFailure();
  }, [userId]);

  useEffect(() => {
    // A link cleared or broken while a send waits to settle: it must not go.
    if (!isWebhookUrl(url)) {
      sender.current!.cancelPending();
      return;
    }
    if (brief) sender.current!.request(url, brief);
  }, [url, brief, tick, syncPhase, userId]);

  useEffect(() => () => sender.current!.cancelPending(), []);
}

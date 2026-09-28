import { useEffect, useRef } from 'react';
import { useLiveQuery, useObservable } from 'dexie-react-hooks';
import { db } from '../db';
import { convertQuestsToFixUps, pulledFromCloud } from '../services/fixUpConversion';

/**
 * Turns fix-up quests into fix-up tasks - but only once this device is sure it
 * is not converting stale copies.
 *
 * Dexie Cloud treats an insert exactly like an upsert: the whole row replaces
 * whatever the server holds. A device opened a day after the other one had
 * converted still has the quests locally until its first pull lands - and if it
 * converted then, its fresh `fixup__` rows would overwrite the fix-ups the other
 * device had since worked on: completion, score, working, and the XP with them.
 * That would be XP taken back, which never happens here.
 *
 * So a signed-in device converts only after a pull has completed with a good
 * licence. After the pull it holds the other device's fix-ups (so each `add` is
 * skipped) and the other device's deletions (so there are no quests left to
 * convert). Offline, signed out, or with sync stopped - an expired licence
 * resolves `sync()` happily and moves nothing - it waits, and tries again when
 * the sync state or the signed-in user changes, as well as when the quest count
 * does. A signed-out device never converts: see `pulledFromCloud`.
 *
 * The count is the live query and the conversion is the effect: writing inside
 * the query would invalidate the query that caused it.
 */
export function useQuestConversion(): void {
  const questCount = useLiveQuery(() => db.remediations.count(), [], 0);
  // Re-tried when these change too: reconnecting or signing in changes neither
  // the quest count nor anything else this effect would otherwise watch.
  const syncPhase = useObservable(db.cloud.syncState)?.phase;
  const userId = useObservable(db.cloud.currentUser)?.userId;
  const running = useRef(false);

  useEffect(() => {
    if (questCount === 0 || running.current) return;
    running.current = true;

    const run = async () => {
      // Converting can take long enough for another quest to sync in; go round
      // again while any remain, rather than waiting for the next change.
      for (let pass = 0; pass < 3; pass++) {
        if ((await db.remediations.count()) === 0) return;
        if (!(await pulledFromCloud())) return;
        await convertQuestsToFixUps();
      }
    };

    run()
      .catch((error: unknown) => console.error('Could not convert fix-up quests:', error))
      .finally(() => {
        running.current = false;
      });
  }, [questCount, syncPhase, userId]);
}

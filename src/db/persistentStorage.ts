/**
 * Asking the browser not to throw the family's data away.
 *
 * IndexedDB is "best-effort" storage by default, which means exactly what it
 * sounds like: the browser is free to delete it to reclaim space, and on Safari
 * it goes further than that - script-writable storage is cleared after seven
 * consecutive days without the user visiting the site. Nobody has to do
 * anything wrong. A half term where Tejas does not open the app, and the work
 * is gone.
 *
 * That was survivable while sync was working, because the server held a copy.
 * It stopped being survivable the week the licence expired and every push came
 * back 403: for days the only copy of a device's work was on that device, under
 * a seven-day timer nobody knew was running.
 *
 * `persist()` moves the origin to "persistent" storage, which is exempt from
 * eviction. It is a request, not a command, and the honest answer is that it
 * may be refused - Chrome grants it on engagement heuristics, WebKit on its own
 * - so this is a meaningful reduction in risk and not a guarantee. It is also
 * one call and costs nothing, which makes refusing to make it the harder
 * position to defend.
 *
 * Deliberately not awaited by anything. A storage permission has no business
 * delaying the first paint, and every path here is allowed to fail: the API is
 * absent in older browsers, and reading `navigator.storage` throws outright in
 * some privacy modes.
 */

export type PersistenceOutcome =
  | { state: 'GRANTED'; alreadyHad: boolean }
  | { state: 'REFUSED' }
  | { state: 'UNAVAILABLE'; reason: string };

/**
 * Requests persistent storage, once, and says what happened.
 *
 * Returns rather than only logging because the answer is worth showing a parent
 * eventually - "this device is protected from cleanup" is a different fact from
 * "this device has a backup", and the family currently has neither confirmed.
 */
export async function requestPersistentStorage(): Promise<PersistenceOutcome> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      return { state: 'UNAVAILABLE', reason: 'This browser does not offer persistent storage.' };
    }

    // Asking again when it has already been granted is harmless but pointless,
    // and on some engines a repeat request is what triggers a prompt.
    if (await navigator.storage.persisted()) {
      return { state: 'GRANTED', alreadyHad: true };
    }

    return (await navigator.storage.persist())
      ? { state: 'GRANTED', alreadyHad: false }
      : { state: 'REFUSED' };
  } catch (error) {
    // Private browsing modes throw here rather than returning false.
    return { state: 'UNAVAILABLE', reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The startup call. Logged at a level that survives in a real browser console,
 * because the one device whose answer actually matters is not the one the
 * developer is sitting at, and `console.debug` is hidden by default.
 */
export function ensurePersistentStorage(): void {
  void requestPersistentStorage().then((outcome) => {
    if (outcome.state === 'GRANTED') {
      console.info(
        `[Genie] Storage is persistent${
          outcome.alreadyHad ? '' : ' (granted just now)'
        } - the browser will not evict this data to reclaim space.`
      );
    } else if (outcome.state === 'REFUSED') {
      console.warn(
        '[Genie] The browser refused persistent storage. Data here can be evicted under storage ' +
          'pressure, and on Safari after seven days without a visit. Keep an exported backup.'
      );
    } else {
      console.warn(`[Genie] Persistent storage unavailable: ${outcome.reason}`);
    }
  });
}

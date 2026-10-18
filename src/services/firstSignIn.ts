import { db } from '../db';
import { pulledFromCloud } from './fixUpConversion';

/**
 * Signs a device in without its starter content overwriting the family's.
 *
 * Dexie Cloud uploads every row a signed-out device holds the first time it
 * signs in, as upserts. A new device has seeded the starter content by then,
 * so signing it in used to push pristine starter rows over the family's real
 * ones - an approved goal back to "waiting", deleted topics back on the list.
 * See `withdrawUntouchedStarterRows` for the 11 October incident.
 *
 * So the untouched starter rows come off the device first, and only come back
 * when it turns out there was no family to join:
 *
 * - **Sign-in cancelled or failed.** Still a signed-out device, so it gets its
 *   starter content back exactly as it was.
 * - **The pull brought the family's data.** Nothing to restore - the family's
 *   own rows are the ones that should be here, deletions included.
 * - **The pull brought nothing.** A new family; the starter rows go back, and
 *   now that the device is signed in they upload as its starting point.
 * - **The pull did not finish.** Left out. Restoring then would upload them
 *   over a family the device simply has not heard from yet - the very fault -
 *   whereas a brand-new family whose first pull fails goes without the starter
 *   examples, and has lost nothing it made.
 */
export interface SignInSteps {
  login: () => Promise<unknown>;
  pull: () => Promise<boolean>;
}

const cloudSteps = (): SignInSteps => ({
  login: () => db.cloud.login(),
  pull: () => pulledFromCloud(),
});

/** How many rows the starter tables hold, so a pull that brought nothing shows. */
async function starterTableRows(): Promise<number> {
  const counts = await Promise.all([
    db.subjects.count(),
    db.syllabusTopics.count(),
    db.goals.count(),
    db.tasks.count(),
    db.rewards.count(),
  ]);
  return counts.reduce((sum, n) => sum + n, 0);
}

export async function signInWithoutOverwriting(steps: SignInSteps = cloudSteps()): Promise<void> {
  const withdrawn = await db.withdrawUntouchedStarterRows();
  const before = await starterTableRows();

  try {
    await steps.login();
  } catch (error) {
    await db.restoreStarterRows(withdrawn);
    throw error;
  }

  if (!(await steps.pull())) {
    console.warn(
      'Signed in, but the first pull did not finish; starter content stays off this device.'
    );
    return;
  }

  if ((await starterTableRows()) === before) {
    await db.restoreStarterRows(withdrawn);
  }
}

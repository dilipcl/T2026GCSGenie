import { db } from '../db';

/**
 * Empties every table and re-runs seeding, so each test starts from the same
 * place a freshly installed app does.
 *
 * Deliberately does not delete the database between tests: Dexie's `ready`
 * hook - which is what performs the seeding - only fires on open, and reopening
 * per test costs more than it buys.
 */
export async function resetDatabase(): Promise<void> {
  if (!db.isOpen()) await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  // `seedMissingRows` is private; `ready` is the public route to it.
  await (db as unknown as { seedMissingRows(): Promise<void> }).seedMissingRows();
}

/** Empties every table and leaves it empty, for tests that need a blank slate. */
export async function emptyDatabase(): Promise<void> {
  if (!db.isOpen()) await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
}

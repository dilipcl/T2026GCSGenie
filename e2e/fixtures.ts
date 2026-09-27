import { test as base, expect, Page } from '@playwright/test';

/**
 * What every end-to-end test starts from.
 *
 * A fresh browser context is a fresh IndexedDB, so each test opens the app
 * exactly as a new device would: empty, then seeded. Nothing leaks between
 * tests, and nothing depends on the order they run in.
 *
 * Three things are pinned, each because its absence has cost a day before:
 *
 *  - The clock. A fixture built from "today" passes on one weekday and fails on
 *    another - CLAUDE.md records it happening in the unit suite. Friday 25
 *    September 2026, 17:30: a school day with a full timetable, after school,
 *    so the check-in is the natural next thing.
 *  - Dexie Cloud. Every request to it is refused. A test must never be able to
 *    reach the family's real database, whatever a future change to the sync
 *    configuration does, and "offline" is a state the app must handle anyway.
 *  - Uncaught errors. Any page error fails the test that caused it. The worst
 *    faults here - a conditional hook, a render loop in a live query - throw
 *    and leave a screen that looks merely empty.
 */

export const NOW = new Date('2026-09-25T17:30:00+01:00');
export const TODAY = '2026-09-25';

export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.route(/dexie\.cloud/, (route) => route.abort());
    await page.clock.install({ time: NOW });

    await use(page);

    expect(errors, 'uncaught errors in the page').toEqual([]);
  },
});

export { expect };

/**
 * Opens the app and waits until the seed has landed and Home is drawn.
 *
 * A new device opens on the welcome tour, which covers everything beneath it -
 * so it is closed here the way a person closes it, with "Got it". The smoke
 * suite asserts that it appears at all.
 */
export async function openApp(page: Page): Promise<void> {
  await page.goto('./');
  const tour = page.getByRole('dialog', { name: 'How Genie works' });
  await expect(tour).toBeVisible({ timeout: 30_000 });
  await tour.getByRole('button', { name: 'Got it' }).click();
  await expect(tour).toBeHidden();
  await expect(page.getByText('Focus block').first()).toBeVisible();

  /**
   * Home draws before the starter content has finished arriving: seeding runs
   * after the database opens and is never awaited, by design. A test that
   * opened the check-in straight away saw an empty homework list on a quiet
   * machine and four tasks on a busy one. The seed ledger is written last, so
   * its existence means the seed is done.
   */
  await expect
    .poll(() => page.evaluate(`(async () => {
      const { db } = await import('/T2026GCSGenie/src/db/index.ts');
      return db.seedLedger.count();
    })()`), { timeout: 15_000 })
    .toBeGreaterThan(0);
}

export function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

/**
 * Tabs by what the person sees: the full label on the desktop bar, the short
 * one on the phone's bottom bar. Weekly tabs live behind More on both.
 */
const TABS = {
  Home: { label: 'Home', short: 'Home', weekly: false },
  'My Work': { label: 'My Work', short: 'Work', weekly: false },
  Plan: { label: 'Plan', short: 'Plan', weekly: false },
  Updates: { label: 'Updates', short: 'Updates', weekly: false },
  Record: { label: 'Record', short: 'Record', weekly: false },
  Library: { label: 'Library', short: 'Library', weekly: true },
  Rewards: { label: 'Rewards', short: 'Rewards', weekly: true },
  Timetable: { label: 'Timetable', short: 'Timetable', weekly: true },
  'Subjects & Goals': { label: 'Subjects & Goals', short: 'Subjects', weekly: true },
  'Help & Careers': { label: 'Help & Careers', short: 'Help', weekly: true },
} as const;

export type TabName = keyof typeof TABS;
export const TAB_NAMES = Object.keys(TABS) as TabName[];

export async function openTab(page: Page, name: TabName): Promise<void> {
  const tab = TABS[name];
  const phone = isPhone(page);
  const text = phone ? tab.short : tab.label;

  if (tab.weekly) {
    await page
      .getByRole('button', phone ? { name: 'More sections' } : { name: 'More', exact: true })
      .click();
  }
  // The desktop More dropdown is a menu; everything else is a plain button.
  // Hidden duplicates (the other layout's bar) are excluded by getByRole.
  const role = tab.weekly && !phone ? 'menuitem' : 'button';
  await page.getByRole(role, { name: text, exact: true }).first().click();
}

/**
 * Reads rows straight out of the app's own database.
 *
 * Through the app's module rather than raw IndexedDB, so the rows are exactly
 * what the screens read. Passed as a string because Playwright transpiles the
 * test file, and a dynamic `import()` written as code would be rewritten for
 * Node before it ever reached the browser.
 */
export async function rows<T = Record<string, unknown>>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(`(async () => {
    const { db } = await import('/T2026GCSGenie/src/db/index.ts');
    return db.table(${JSON.stringify(table)}).toArray();
  })()`) as Promise<T[]>;
}

/** The daily check-in dialog, opened from the header. */
export async function openCheckIn(page: Page) {
  await page.getByRole('button', { name: /Check in$/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Daily check-in' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Confirms a change-guard sheet. Its primary button ignores input for 300ms so
 * the double-tap that opened it cannot also accept it - so this waits for the
 * button to be enabled rather than clicking on sight.
 */
export async function confirmSheet(page: Page, label: string): Promise<void> {
  const button = page.getByRole('button', { name: label, exact: true });
  await expect(button).toBeEnabled();
  await page.clock.runFor(400);
  await button.click();
}

/**
 * Puts a row in place before a test acts - the "arrange" step.
 *
 * Only for setting the scene. What a test is *about* is always done through
 * the screens, or it proves nothing about them.
 */
export async function insert(page: Page, table: string, row: Record<string, unknown>): Promise<void> {
  await page.evaluate(`(async () => {
    const { db } = await import('/T2026GCSGenie/src/db/index.ts');
    await db.table(${JSON.stringify(table)}).add(${JSON.stringify(row)});
  })()`);
}

/** A piece of homework due today, for journeys that need one to act on. */
export function homework(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    subjectId: 'maths',
    title,
    dueDate: TODAY,
    priority: 'MEDIUM',
    isHomework: true,
    isRemediation: false,
    bucket: 'THIS_WEEK',
    xpValue: 50,
    completed: false,
    createdAt: NOW.getTime(),
    ...extra,
  };
}

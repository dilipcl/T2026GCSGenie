import { test, expect, openApp, openTab, TAB_NAMES } from './fixtures';

/**
 * Every screen opens, on both layouts, from a brand-new device.
 *
 * The cheapest test in the suite and the one most likely to catch a release
 * that should not go out: a hook below an early return, a live query that
 * writes, a migration that stalls the database - each leaves a screen that is
 * blank or torn down, and each has shipped at least once.
 */

test('a brand-new device seeds and opens on Home, behind the welcome tour', async ({ page }) => {
  // openApp waits for the tour and closes it - so reaching Home at all proves
  // both that it appeared and that it can be dismissed.
  await openApp(page);
  await expect(page.getByText(/Genie hit a problem|Something went wrong/)).toHaveCount(0);
});

for (const name of TAB_NAMES) {
  test(`${name} opens without an error`, async ({ page }) => {
    await openApp(page);
    await openTab(page, name);
    await expect(page.getByText(/Genie hit a problem|Something went wrong/)).toHaveCount(0);
    await expect(page.locator('main')).not.toBeEmpty();
  });
}

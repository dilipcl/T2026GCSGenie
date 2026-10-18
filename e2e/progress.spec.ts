import { test, expect, openApp, openTab, insert, TODAY } from './fixtures';

/**
 * The Progress screen, from the parent's Sunday-review seat.
 *
 * Built after 18 Oct 2026, when "6.3h studied" and "1h done of 18h" sat a
 * scroll apart on Home and nothing said where 5.3 hours had gone. On a fresh
 * device every starter goal is still a draft, so an evening of Computer
 * Science counts towards nothing - the same shape, on demand.
 */

const csEvening = {
  id: 'e2e-cs-evening',
  date: TODAY,
  timestamp: 0,
  session: 'EVENING',
  energyLevel: 4,
  focusRating: 'NORMAL',
  completedHomeworkIds: [],
  completedRevisionMinutes: 90,
  studySubjectId: 'computer_science',
  xpEarned: 20,
  isDailyBaseXPAwarded: true,
};

test('says where the time went, and the fix opens the screen that makes it', async ({ page }) => {
  await openApp(page);
  await insert(page, 'checkIns', csEvening);
  await openTab(page, 'Progress');

  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible();
  await expect(page.getByText('1.5h studied, 0h of it towards agreed goals.')).toBeVisible();

  const lost = page.locator('section', {
    has: page.getByRole('heading', { name: "Where this week's time went" }),
  });
  await expect(lost.getByText(/Computer Science for ".+", which is not agreed yet/)).toBeVisible();

  await lost.getByRole('button', { name: /Agree the goal/ }).click();
  await expect(page.getByText(/Genie hit a problem|Something went wrong/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toHaveCount(0);
});

test('Home explains lost time beside the week, and is silent when nothing was lost', async ({
  page,
}) => {
  await openApp(page);
  const title = page.getByRole('heading', {
    name: "Where this week's time went",
  });
  await expect(title).toHaveCount(0);

  await insert(page, 'checkIns', csEvening);
  // On a phone the week is folded behind its one-line summary.
  const showWeek = page.getByRole('button', { name: /Show the week/ });
  if (await showWeek.isVisible()) await showWeek.click();
  await expect(title).toBeVisible();
});

test('starts the term strip where the record starts', async ({ page }) => {
  await openApp(page);
  await openTab(page, 'Progress');
  const strip = page.locator('section', {
    has: page.getByRole('heading', { name: 'Week by week' }),
  });
  await expect(strip.getByText('so far')).toBeVisible();
  // A fresh device has used the app for one week, so the strip starts there
  // rather than listing seven weeks that never happened.
  await expect(strip.locator('li')).toHaveCount(1);
  await expect(strip.getByText('Ran without a plan')).toHaveCount(0);
});

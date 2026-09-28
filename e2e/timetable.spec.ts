import { test, expect, openApp, openTab, rows } from './fixtures';

/**
 * Adding a lesson that is not a school period.
 *
 * Reported on 27 September 2026: a recurring Monday art class, 18:15-19:30,
 * "could not be added". It could - but the times were behind "More options",
 * the period defaulted to Registration, and it saved to the week on screen
 * only, so on the other week it simply was not there.
 */

test('an evening class gets its own time, every week, and says so', async ({ page }) => {
  await openApp(page);
  await openTab(page, 'Timetable');
  await page.getByRole('button', { name: 'Add lessons' }).click();

  const sheet = page.getByRole('dialog', { name: 'Quick add' });
  await sheet.getByRole('button', { name: /Art/ }).first().click();
  // Monday is the day on screen when the sheet opens from Monday.
  await expect(sheet.getByRole('button', { name: 'Every week' })).toBeVisible();
  await sheet.getByLabel('Starts').fill('18:15');
  await sheet.getByLabel('Ends').fill('19:30');
  await sheet.getByRole('button', { name: /^Add to / }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByText(/18:15-19:30 · every week/)).toBeVisible();

  const added = (
    await rows<{ startTime: string; endTime: string; weekType: string; slotName: string; dayOfWeek: string }>(
      page,
      'timetableEntries'
    )
  ).find((e) => e.startTime === '18:15');
  expect(added).toMatchObject({ dayOfWeek: 'MON', endTime: '19:30', weekType: 'BOTH', slotName: 'Own time' });
});

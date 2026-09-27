import { test, expect, openApp, insert, homework } from './fixtures';

/**
 * Closing work from Home goes through the same sheet as everywhere else.
 *
 * The "What's next" card used to close work behind a bare "Mark this as
 * done?" - no proof asked for, no time asked for - so every number that reads
 * finished work was only as good as the least careful of six close paths.
 */

test('ticking work on Home opens the close sheet, with its time question', async ({ page }) => {
  await openApp(page);
  await insert(page, 'tasks', homework('hw-home', 'Sparx Science', { estimatedHours: 0.5 }));

  await page.getByRole('button', { name: 'Mark "Sparx Science" as done' }).click();

  const sheet = page.getByRole('dialog', { name: /Finished “Sparx Science”\?/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('How long did it take?')).toBeVisible();
  await expect(page.getByText('Mark this as done?')).toHaveCount(0);
});

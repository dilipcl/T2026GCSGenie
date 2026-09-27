import { test, expect, openApp, openTab, openCheckIn, rows } from './fixtures';

/**
 * A subject by its topics: the inbox, bulk tagging, the topic's own page, and
 * adding a topic with its details.
 */

test.describe('topics in the Library', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  async function openSubject(page: import('@playwright/test').Page, name: string) {
    await openTab(page, 'Library');
    await page.getByRole('button', { name: new RegExp(name) }).first().click();
    await expect(page.getByRole('button', { name: 'By topic' })).toBeVisible();
  }

  test('an untagged lesson waits in the inbox, and tagging it files it under the topic', async ({
    page,
  }) => {
    const dialog = await openCheckIn(page);
    await dialog.getByRole('button', { name: 'Done — Biology (Triple)' }).click();
    // Escape, because the dialog's X has no accessible name to find it by.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await openSubject(page, 'Biology');
    await expect(page.getByText('1 not tagged to a topic yet')).toBeVisible();

    await page.getByRole('checkbox').first().check();
    const picker = page.getByLabel('Topic to tag the selected items to');
    const topic = (await picker.locator('option').nth(1).textContent())!.split(' · ')[1];
    await picker.selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Tag 1' }).click();

    await expect(page.getByText('not tagged to a topic yet')).toHaveCount(0);
    await page.getByRole('button', { name: new RegExp(topic) }).click();
    await expect(page.getByText('Biology (Triple)')).toBeVisible();
    await expect(page.getByText('1 lesson ·')).toBeVisible();
  });

  test('a new topic is saved with its details and listed under its unit', async ({ page }) => {
    await openSubject(page, 'Chemistry');
    await page.getByRole('button', { name: 'Add topic' }).click();

    await page.getByLabel('Topic', { exact: true }).fill('Covalent bonding');
    await page.getByLabel('Spec ref').fill('4.2.1');
    await page.getByLabel('Unit').selectOption('__new__');
    await page.getByPlaceholder('Name of the unit, as the teacher calls it').fill('Bonding');
    await page.getByRole('button', { name: 'Good' }).click();
    await page.getByRole('button', { name: 'Add topic' }).last().click();

    await expect(page.getByText('BONDING (1)', { exact: false })).toBeVisible();
    const topics = await rows<{ title: string; specRef?: string; unit: string; confidenceRating: number }>(
      page,
      'syllabusTopics'
    );
    const added = topics.find((t) => t.title === 'Covalent bonding');
    expect(added).toMatchObject({ specRef: '4.2.1', unit: 'Bonding', confidenceRating: 4 });
  });
});

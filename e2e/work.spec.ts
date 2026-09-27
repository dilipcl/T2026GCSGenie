import { test, expect, openApp, openTab, rows } from './fixtures';

/**
 * Adding work and closing it - the loop every XP and evidence number rests on.
 */

test.describe('my work', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await openTab(page, 'My Work');
  });

  async function addWork(
    page: import('@playwright/test').Page,
    kind: 'Homework' | 'Fix a mistake',
    title: string
  ) {
    await page.getByRole('button', { name: 'Add homework', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Quick add' });
    await sheet.getByRole('button', { name: new RegExp(`^${kind}`) }).click();
    // The sheet fills in a suggested subject from a database read that lands
    // after it opens, and that suggestion overwrites a subject tapped before
    // it arrives. A known fault, listed in the UX findings - waited out here
    // so the rest of the journey can be tested.
    await page.waitForTimeout(500);
    await sheet.locator('#quick-add-title').fill(title);
    const maths = sheet.getByRole('button', { name: /Maths/ }).first();
    const submit = sheet.getByRole('button', { name: /^Add (homework|fix-up) \(/ });
    await maths.click();
    // Subject chips toggle: tapping the one already suggested clears it, and
    // the only sign is a greyed-out Add button (listed in the UX findings).
    if (await submit.isDisabled()) await maths.click();
    await submit.click();
    await expect(sheet).toBeHidden();
  }

  test('homework added from the sheet appears in the list', async ({ page }) => {
    await addWork(page, 'Homework', 'Quadratics past paper Q12-18');
    await expect(page.getByText('Quadratics past paper Q12-18')).toBeVisible();

    const saved = (await rows<{ title: string; isHomework: boolean; subjectId: string }>(page, 'tasks')).find(
      (t) => t.title === 'Quadratics past paper Q12-18'
    );
    expect(saved).toMatchObject({ isHomework: true, subjectId: 'maths' });
  });

  test('a fix-up added from the sheet shows under the Fix-ups filter', async ({ page }) => {
    await addWork(page, 'Fix a mistake', 'Redo the quadratics I dropped marks on');
    await page.getByRole('button', { name: 'Fix-ups', exact: true }).click();
    await expect(page.getByText('Redo the quadratics I dropped marks on')).toBeVisible();
  });

  test('closing work with nothing attached says what it costs, and still closes it', async ({
    page,
  }) => {
    await addWork(page, 'Homework', 'Sparx Maths');
    // The tick has no accessible name (a finding in its own right), so it is
    // found as the first button in the row that carries the title.
    const row = page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Sparx Maths' }) }).last();
    await row.getByRole('button').first().click();

    const sheet = page.getByRole('dialog', { name: /Finished “Sparx Maths”\?/ });
    await expect(sheet.getByText(/Nothing is attached yet/)).toBeVisible();
    await sheet.getByRole('button', { name: 'Mark it done anyway' }).click();
    await expect(sheet).toBeHidden();

    const saved = (await rows<{ title: string; completed: boolean }>(page, 'tasks')).find(
      (t) => t.title === 'Sparx Maths'
    );
    expect(saved?.completed).toBe(true);
  });
});

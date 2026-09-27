import {
  test,
  expect,
  openApp,
  openTab,
  rows,
  insert,
  homework,
  CLEAN_UP_FRIDAY,
} from './fixtures';

/**
 * A focus block, start to wrap-up.
 *
 * The clock is Playwright's, so twenty-five minutes pass in a moment - but the
 * timer is anchored to wall-clock time, so jumping the clock is exactly what a
 * backgrounded tab looks like to it, which is the case it was built for.
 */

test.describe('a focus block', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await insert(page, 'tasks', homework('hw-venn', 'Venn diagram worksheet'));
  });

  async function runBlockOn(page: import('@playwright/test').Page, target: string) {
    await page.locator('#focus-target').selectOption({ label: target });
    await page.getByRole('button', { name: 'Start the timer' }).click();
    await page.clock.fastForward('25:02');
    await expect(page.getByText('While you rest - what was that block?')).toBeVisible();
  }

  test('offers the day’s subject lessons, and not a chore filed as one', async ({ page }) => {
    await insert(page, 'timetableEntries', CLEAN_UP_FRIDAY);
    // Proof the row has been read: it is on today's schedule. Without this the
    // negative check below passes before the timetable is re-read, and would
    // pass on the old code too.
    await expect(page.getByText('Clean up', { exact: true }).first()).toBeVisible();
    const picker = page.locator('#focus-target');

    await expect(picker.locator('option', { hasText: 'History (Weimar)' })).toHaveCount(1);
    await expect(picker.locator('option', { hasText: 'Clean up' })).toHaveCount(0);
  });

  test('logs its minutes before asking anything, against the work chosen', async ({ page }) => {
    await runBlockOn(page, 'Venn diagram worksheet');

    const blocks = (await rows<{ source?: string; taskId?: string; completedRevisionMinutes: number }>(
      page,
      'checkIns'
    )).filter((c) => c.source === 'FOCUS_TIMER');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].taskId).toBe('hw-venn');
    expect(blocks[0].completedRevisionMinutes).toBe(25);
    await expect(page.getByText(/1 block done today/)).toBeVisible();
  });

  test('turns a question in the wrap-up into work for tomorrow', async ({ page }) => {
    await runBlockOn(page, 'Venn diagram worksheet');

    await page.getByPlaceholder('One line on what you covered').fill('Conditional probability');
    await page
      .getByPlaceholder(/Anything to ask the teacher/)
      .fill('how to show P(A|B) on a Venn');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('While you rest - what was that block?')).toBeHidden();

    await openTab(page, 'My Work');
    await expect(page.getByText('Ask: how to show P(A|B) on a Venn')).toBeVisible();
  });

  test('keeps an unanswered wrap-up when the tab is left and come back to', async ({ page }) => {
    await runBlockOn(page, 'Venn diagram worksheet');

    await openTab(page, 'My Work');
    await openTab(page, 'Home');
    await expect(page.getByText('While you rest - what was that block?')).toBeVisible();
  });

  test('opens the close sheet over the whole screen, not inside the card', async ({ page }) => {
    await runBlockOn(page, 'Venn diagram worksheet');
    await page.getByRole('button', { name: /^Finished “Venn diagram worksheet/ }).click();

    // The timer is a .glass-card, whose backdrop-filter captures position:
    // fixed. Unportalled, this sheet opened as a letterbox the size of the card.
    const sheet = page.getByRole('dialog', { name: /Finished “Venn diagram worksheet”\?/ });
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box?.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(box?.height).toBeGreaterThanOrEqual(viewport.height - 1);
  });
});

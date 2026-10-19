import { test, expect, openApp, openTab, rows, isPhone } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The Parent Portal, redesigned into four tabs, and the study setup a parent
 * does there: resources per subject and the school's plan, read back on the
 * topic page, the topic log and Progress.
 *
 * A fresh device has no passphrase, so the test claims the portal the way a
 * parent does on first use - with a throwaway passphrase that exists only in
 * this test's empty database on localhost.
 */

const TEST_PASSPHRASE = 'e2e-only-passphrase-4471';

async function becomeParent(page: Page) {
  await page.getByRole('button', { name: /Student Mode/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Parent access' });
  await dialog.getByLabel('Parent passphrase').fill(TEST_PASSPHRASE);
  await dialog.getByLabel('Confirm passphrase').fill(TEST_PASSPHRASE);
  await dialog.getByRole('button', { name: 'Set passphrase' }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

async function openPortal(page: Page) {
  const phone = isPhone(page);
  await page
    .getByRole('button', phone ? { name: 'More sections' } : { name: 'More', exact: true })
    .click();
  await page
    .getByRole(phone ? 'button' : 'menuitem', { name: phone ? 'Parent' : 'Parent Portal', exact: true })
    .first()
    .click();
  await expect(page.getByRole('tablist', { name: 'Parent sections' })).toBeVisible();
}

async function portalTab(page: Page, name: string) {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

test.describe('the Parent Portal', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await becomeParent(page);
    await openPortal(page);
  });

  test('opens on what is waiting, with every old panel under a tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Waiting on you' })).toBeVisible();
    // The passphrase form is no longer the first thing on the page.
    await expect(page.getByRole('heading', { name: 'Parent passphrase' })).toHaveCount(0);

    await portalTab(page, 'Family');
    await expect(page.getByText('Family', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Household', { exact: true })).toBeVisible();

    await portalTab(page, 'Study setup');
    await expect(page.getByRole('heading', { name: 'Resources and the school plan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'AI Audit Settings' })).toBeVisible();

    await portalTab(page, 'Data & security');
    await expect(page.getByRole('heading', { name: 'Parent passphrase' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Backup & Restore' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Change History', exact: true })).toBeVisible();
  });

  test('a renamed and added resource is saved and shows on the topic page', async ({ page }) => {
    await portalTab(page, 'Study setup');
    await page.getByRole('group', { name: 'Subject to set up' }).getByRole('button', { name: 'Chemistry' }).click();
    await expect(page.getByText('Using the defaults')).toBeVisible();

    await page.getByLabel('Resource name').nth(1).fill('CGP Revision Guide');
    await page.getByRole('button', { name: 'Add a resource' }).click();
    await page.getByLabel('Resource name').last().fill('Seneca');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Your own list')).toBeVisible();

    const subjects = await rows<{ id: string; resources?: { id: string; name: string }[] }>(page, 'subjects');
    const names = subjects.find((s) => s.id === 'chemistry')?.resources?.map((r) => r.name);
    expect(names).toEqual(['Notebook', 'CGP Revision Guide', 'Sparx Science', 'Practical write-up', 'Seneca']);

    await openTab(page, 'Library');
    await page.getByRole('button', { name: /Chemistry/ }).first().click();
    await page.getByRole('button', { name: /Chromatography/ }).click();
    const worked = page.getByRole('region', { name: 'Worked through in' });
    await expect(worked.getByRole('button', { name: /CGP Revision Guide/ })).toBeVisible();
    await expect(worked.getByRole('button', { name: /Seneca/ })).toBeVisible();
  });

  test('a pasted school plan waits in the topic log and shows on Progress', async ({ page }) => {
    await portalTab(page, 'Study setup');
    await page.getByRole('group', { name: 'Subject to set up' }).getByRole('button', { name: 'Chemistry' }).click();
    await page.getByLabel('Half-term').selectOption('AUT2');
    await page.getByLabel('Topics, one per line').fill('- Ionic bonding\n- Covalent bonding\n');
    await page.getByRole('button', { name: 'Add 2 to Autumn 2' }).click();
    await expect(page.getByText('Ionic bonding')).toBeVisible();
    await expect(page.getByText('later').first()).toBeVisible();

    const topics = await rows<{ title: string; plannedTerm?: string; dateTaught?: string }>(page, 'syllabusTopics');
    expect(topics.filter((t) => t.plannedTerm === 'AUT2').map((t) => t.title).sort()).toEqual([
      'Covalent bonding',
      'Ionic bonding',
    ]);

    await openTab(page, 'Library');
    await page.getByRole('button', { name: 'Topic log' }).click();
    await expect(page.getByText('Planned for Autumn 2 (2)', { exact: false })).toBeVisible();

    await openTab(page, 'Progress');
    const chemistry = page.getByTestId('course-subject').filter({ hasText: 'Chemistry' });
    await expect(chemistry.getByText('School plan')).toBeVisible();
    await expect(chemistry.getByText(/0\/2 taught/)).toBeVisible();
  });
});

test.describe('ticking resources', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('one tap on the topic page ticks a resource, and the tick sheet agrees', async ({ page }) => {
    await openTab(page, 'Library');
    await page.getByRole('button', { name: /Biology/ }).first().click();
    await page.getByRole('button', { name: /Microscopy: Plant/ }).click();

    const notebook = page
      .getByRole('region', { name: 'Worked through in' })
      .getByRole('button', { name: /Notebook/ });
    await expect(notebook).toHaveAttribute('aria-pressed', 'false');
    await notebook.click();
    await expect(notebook).toHaveAttribute('aria-pressed', 'true');

    const topics = await rows<{ id: string; resources?: Record<string, { on: string }> }>(page, 'syllabusTopics');
    expect(topics.find((t) => t.id === 's-3')?.resources?.notebook?.on).toBe('2026-09-25');

    await page.getByRole('button', { name: 'All topics' }).click();
    await page.getByText(/^Tick sheet:/).click();
    const cell = page.getByRole('button', { name: 'Notebook: Microscopy: Plant & Animal Cell Magnification' });
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'CGP guide: Microscopy: Plant & Animal Cell Magnification' }).click();
    const after = await rows<{ id: string; resources?: Record<string, unknown> }>(page, 'syllabusTopics');
    expect(Object.keys(after.find((t) => t.id === 's-3')?.resources ?? {}).sort()).toEqual([
      'cgp',
      'notebook',
    ]);
  });

  test('Progress shows each resource per subject', async ({ page }) => {
    await openTab(page, 'Progress');
    const biology = page.getByTestId('course-subject').filter({ hasText: 'Biology' });
    await expect(biology.getByLabel('Biology resources')).toBeVisible();
    await expect(biology.getByText('Notebook', { exact: true })).toBeVisible();
    await expect(biology.getByText('CGP guide', { exact: true })).toBeVisible();
  });
});

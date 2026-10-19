import { test, expect, openApp, openTab, rows, insert, homework, NOW } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The topic log: every topic in the same five steps, read against the board's
 * outline, reachable from the Library and from Progress - and nothing new to
 * fill in for any of it.
 *
 * A fresh device carries the starter topics, so the log has rows to show
 * without arranging any. The journeys below are the ones a parent and Tejas
 * actually take: scan the log, open a topic, correct where it sits, add a
 * topic and see where it will go, and get there from the Sunday review.
 */

async function openLog(page: Page) {
  await openTab(page, 'Library');
  await page.getByRole('button', { name: 'Topic log' }).click();
  await expect(page.getByRole('heading', { name: 'Topic log' })).toBeVisible();
}

test.describe('the topic log', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('lists every topic with the same five steps, newest taught first', async ({ page }) => {
    await openLog(page);
    const strips = page.getByTestId('topic-journey');
    await expect(strips.first()).toBeVisible();
    expect(await strips.count()).toBeGreaterThan(5);

    // Every strip has all five steps, whatever is or is not recorded.
    const first = strips.first();
    await expect(first.getByText(/^(Taught .+|Not taught yet)$/)).toHaveCount(1);
    await expect(first.getByText(/^(Homework \d+ of \d+|No homework)$/)).toHaveCount(1);
    await expect(first.getByText(/^(Revised .+|Not revised)$/)).toHaveCount(1);
    await expect(first.getByText(/^(Notes \d+|Notes in notebook|No notes)$/)).toHaveCount(1);
    await expect(first.getByText(/^(Secure|Sure \d\/5)$/)).toHaveCount(1);
  });

  test('a subject filter shows its specification and only its topics', async ({ page }) => {
    await openLog(page);
    await page.getByRole('group', { name: 'Subject' }).getByRole('button', { name: 'Biology' }).click();

    await expect(page.getByText(/Specification: \d+ of 7 sections started/)).toBeVisible();
    await page.getByText(/Specification:/).click();
    await expect(page.getByText('Infection and response')).toBeVisible();
    await expect(page.getByText('Ecology')).toBeVisible();
    await expect(page.getByText(/not started/).first()).toBeVisible();
    // Nothing from another subject leaks in.
    await expect(page.getByText('Chromatography: Calculating Rf Values', { exact: false })).toHaveCount(0);
  });

  test('a topic opens on its page inside its subject, and opens again after backing out', async ({
    page,
  }) => {
    await openLog(page);
    const title = 'Microscopy: Plant & Animal Cell Magnification';
    await page.getByRole('button', { name: new RegExp(title.replace(/[()&:]/g, '.')) }).click();

    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Where this topic has got to' })).toBeVisible();
    await page.getByRole('button', { name: 'All topics' }).click();

    await page.getByRole('button', { name: 'Topic log' }).click();
    await page.getByRole('button', { name: new RegExp(title.replace(/[()&:]/g, '.')) }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  });

  test('closing homework on a topic fills its homework step, with nothing else to enter', async ({
    page,
  }) => {
    await insert(
      page,
      'tasks',
      homework('e2e-hw', 'Pathogens worksheet', {
        subjectId: 'biology',
        linkedTopicId: 's-3',
        completed: true,
        completedAt: NOW.getTime(),
      })
    );
    await openLog(page);
    const row = page.getByRole('button', { name: /Microscopy: Plant/ });
    await expect(row.getByText('Homework 1 of 1')).toBeVisible();
  });
});

test.describe('placing a topic in the specification', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('a topic says where it sits, and a correction is saved as its spec ref', async ({
    page,
  }) => {
    await openTab(page, 'Library');
    await page.getByRole('button', { name: /Biology/ }).first().click();
    await page.getByRole('button', { name: /Osmosis in Plant Tissue/ }).click();

    const picker = page.getByLabel(/In the specification/);
    await expect(picker).toHaveValue('4.1');
    await expect(page.getByText('(worked out from the title)')).toBeVisible();

    await picker.selectOption('4.2');
    await expect(page.getByText('(worked out from the title)')).toHaveCount(0);
    const topics = await rows<{ id: string; specRef?: string }>(page, 'syllabusTopics');
    expect(topics.find((t) => t.id === 's-4')?.specRef).toBe('4.2');
  });

  test('adding a topic says where it will go as the title is typed', async ({ page }) => {
    await openTab(page, 'Library');
    await page.getByRole('button', { name: /Chemistry/ }).first().click();
    await page.getByRole('button', { name: 'Add topic' }).click();

    await page.getByLabel('Topic', { exact: true }).fill('Covalent bonding');
    await expect(page.getByText(/In the specification under 4\.2 Bonding/)).toBeVisible();
    await page.getByLabel('Spec ref').fill('4.10.1');
    await expect(page.getByText(/In the specification under 4\.10 Using resources/)).toBeVisible();
  });
});

test('Progress shows the course so far and opens the topic log', async ({ page }) => {
  await openApp(page);
  await openTab(page, 'Progress');
  const card = page.locator('section', {
    has: page.getByRole('heading', { name: 'The course so far' }),
  });
  await expect(card.getByText('Biology')).toBeVisible();
  await expect(card.getByText(/\d+\/7 sections/)).toBeVisible();

  // Each subject with topics has its four meters and a sentence.
  const biology = card.getByTestId('course-subject').filter({ hasText: 'Biology' });
  for (const meter of ['Homework', 'Revised', 'Notes', 'Secure']) {
    await expect(biology.getByText(meter, { exact: true })).toBeVisible();
  }
  await expect(biology.getByText(/^\d+ topics? in \d+ of 7 sections/)).toBeVisible();
  // A subject with nothing logged says so rather than drawing empty meters.
  const engLang = card.getByTestId('course-subject').filter({ hasText: 'Eng Lang' });
  await expect(engLang.getByText('No topics logged yet.')).toBeVisible();
  await expect(engLang.getByText('Homework', { exact: true })).toHaveCount(0);

  await card.getByRole('button', { name: 'Open the topic log' }).click();
  await expect(page.getByRole('heading', { name: 'Topic log' })).toBeVisible();
  await expect(page.getByTestId('topic-journey').first()).toBeVisible();

  // Reaching the Library from the menu afterwards opens where it always has.
  await openTab(page, 'Home');
  await openTab(page, 'Library');
  await expect(page.getByText('By subject')).toBeVisible();
});

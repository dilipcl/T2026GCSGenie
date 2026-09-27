import {
  test,
  expect,
  openApp,
  openCheckIn,
  confirmSheet,
  rows,
  insert,
  homework,
  TODAY,
} from './fixtures';
import type { Locator } from '@playwright/test';

/**
 * The evening check-in - the one journey that has to work every single day.
 *
 * Each test here is a fault that reached Tejas, or a promise made to fix one:
 * a tap that submitted the whole form, a lesson that could not say what it
 * covered, half an hour of study logged that nobody did, a catch-up that
 * landed on the wrong day, work closed with nothing attached.
 */

/**
 * A row in the homework list, as opposed to the same task appearing in the
 * day's list above it as committed work - which it does, and which is a
 * finding of its own (see the UX notes), not something to hide here.
 */
function homeworkRow(dialog: Locator, title: string): Locator {
  return dialog.locator('.cursor-pointer', { hasText: title });
}

test.describe('the daily check-in', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
  });

  test('answering a lesson saves it and leaves the check-in open', async ({ page }) => {
    const dialog = await openCheckIn(page);

    await dialog.getByRole('button', { name: 'Done — History (Weimar)' }).click();

    // The row is answered and the dialog is still there: a typeless button
    // inside the form used to submit and close the whole check-in here.
    await expect(dialog.getByRole('button', { name: 'Done — History (Weimar)' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(dialog).toBeVisible();
  });

  test('an answered lesson can be tagged to a topic in one tap', async ({ page }) => {
    const dialog = await openCheckIn(page);
    await dialog.getByRole('button', { name: 'Done — History (Weimar)' }).click();

    const suggestion = dialog.getByTitle('Same topic as the last lesson - tap to confirm');
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(dialog.getByRole('button', { name: 'change' })).toBeVisible();

    const answered = await rows<{ label: string; topicId?: string }>(page, 'checkInOccurrences');
    expect(answered.find((r) => r.label === 'History (Weimar)')?.topicId).toBeTruthy();
  });

  test('a missed lesson is not asked what it covered', async ({ page }) => {
    const dialog = await openCheckIn(page);
    await dialog.getByRole('button', { name: 'Missed — History (Weimar)' }).click();

    await expect(dialog.getByLabel('Why was History (Weimar) not done?')).toBeVisible();
    await expect(dialog.getByText('Covered')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Which topic?' })).toHaveCount(0);
  });

  test('study time starts at zero, so an untouched check-in logs none', async ({ page }) => {
    const dialog = await openCheckIn(page);
    await expect(dialog.getByText('0 Minutes')).toBeVisible();

    await dialog.getByRole('button', { name: /Save Check-in/ }).click();
    await confirmSheet(page, 'Save it');
    await expect(dialog).toBeHidden();

    const saved = await rows<{ date: string; completedRevisionMinutes: number }>(page, 'checkIns');
    expect(saved).toHaveLength(1);
    expect(saved[0].completedRevisionMinutes).toBe(0);
    expect(saved[0].date).toBe(TODAY);
  });

  test('catching up an earlier day files the whole check-in on that day', async ({ page }) => {
    const dialog = await openCheckIn(page);
    await dialog.locator('input[type="date"]').fill('2026-09-23');
    await expect(dialog.getByRole('heading', { name: 'Log 23 Sept' })).toBeVisible();

    await dialog.getByRole('button', { name: /Save Check-in/ }).click();
    await confirmSheet(page, 'Save it');
    await expect(dialog).toBeHidden();

    const saved = await rows<{ date: string }>(page, 'checkIns');
    expect(saved.map((c) => c.date)).toEqual(['2026-09-23']);
  });

  test('ticking homework offers the photo step instead of skipping it', async ({ page }) => {
    await insert(page, 'tasks', homework('hw-venn', 'Venn diagram worksheet'));
    const dialog = await openCheckIn(page);
    await homeworkRow(dialog, 'Venn diagram worksheet').click();

    await expect(dialog.getByText('Photo of it (optional)')).toBeVisible();
    await expect(dialog.getByText(/waits under Evidence/)).toBeVisible();
  });

  test('the homework list leaves out work that is not due yet', async ({ page }) => {
    await insert(page, 'tasks', homework('hw-now', 'Due tonight'));
    await insert(
      page,
      'tasks',
      homework('hw-later', 'Due in October', { dueDate: '2026-10-20', bucket: 'LATER' })
    );
    const dialog = await openCheckIn(page);

    await expect(homeworkRow(dialog, 'Due tonight')).toBeVisible();
    await expect(homeworkRow(dialog, 'Due in October')).toHaveCount(0);
    // The starter content has later work of its own, so the count is not ours
    // to fix - only that the later work is behind this button.
    await dialog.getByRole('button', { name: /^Show \d+ more due later$/ }).click();
    await expect(homeworkRow(dialog, 'Due in October')).toBeVisible();
  });
});

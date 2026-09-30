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
  NOW,
  CLEAN_UP_FRIDAY,
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

/** A row in the homework list. */
function homeworkRow(dialog: Locator, title: string): Locator {
  return dialog.locator('.cursor-pointer', { hasText: title });
}

/**
 * Work due tomorrow: in the homework list, and not on today's day list.
 *
 * Work committed for today is asked about once, in the day list, so a test of
 * the homework list itself needs work that belongs there.
 */
const TOMORROW = '2026-09-26';
const dueTomorrow = (id: string, title: string, extra: Record<string, unknown> = {}) =>
  homework(id, title, { dueDate: TOMORROW, ...extra });

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
    await insert(page, 'tasks', dueTomorrow('hw-venn', 'Venn diagram worksheet'));
    const dialog = await openCheckIn(page);
    await homeworkRow(dialog, 'Venn diagram worksheet').click();

    await expect(dialog.getByText('Photo of it (optional)')).toBeVisible();
    await expect(dialog.getByText(/waits under Evidence/)).toBeVisible();
  });

  test('a focus block earlier does not cost the evening its daily +10', async ({ page }) => {
    await insert(page, 'checkIns', {
      id: 'block-1',
      date: TODAY,
      timestamp: NOW.getTime() - 3_600_000,
      session: 'STUDY_SESSION',
      source: 'FOCUS_TIMER',
      energyLevel: 3,
      focusRating: 'NORMAL',
      completedHomeworkIds: [],
      completedRevisionMinutes: 25,
      xpEarned: 10,
      isDailyBaseXPAwarded: false,
    });
    const dialog = await openCheckIn(page);

    await expect(dialog.getByRole('button', { name: 'Save Check-in (+10 XP)' })).toBeVisible();
    await expect(dialog.getByText(/already banked/)).toHaveCount(0);
    // The block's minutes are still acknowledged, so they are not logged twice.
    await expect(dialog.getByText(/25 min already logged/)).toBeVisible();
  });

  test('a lesson filed under General is not asked what topic it covered', async ({ page }) => {
    await insert(page, 'timetableEntries', CLEAN_UP_FRIDAY);
    const dialog = await openCheckIn(page);
    await dialog.getByRole('button', { name: 'Done — Clean up' }).click();

    await expect(dialog.getByRole('button', { name: 'Done — Clean up' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(dialog.getByRole('button', { name: 'Which topic?' })).toHaveCount(0);
    await expect(dialog.getByText('Covered')).toHaveCount(0);
  });

  test('homework ticked in the check-in is closed with its audit line', async ({ page }) => {
    await insert(page, 'tasks', dueTomorrow('hw-sparx', 'Sparx Maths'));
    const dialog = await openCheckIn(page);
    await homeworkRow(dialog, 'Sparx Maths').click();
    await dialog.getByRole('button', { name: /Save Check-in/ }).click();
    await confirmSheet(page, 'Save it');
    await expect(dialog).toBeHidden();

    // Polled rather than read once: failed once in ~70 runs under full load
    // and could not be reproduced (see docs/testing/ux-findings.md).
    await expect
      .poll(async () =>
        (await rows<{ id: string; completed: boolean }>(page, 'tasks')).find((t) => t.id === 'hw-sparx')
          ?.completed
      )
      .toBe(true);
    await expect
      .poll(async () =>
        (await rows<{ entityId: string; fieldChanged?: string }>(page, 'auditLogs')).some(
          (a) => a.entityId === 'hw-sparx' && a.fieldChanged === 'completed'
        )
      )
      .toBe(true);
  });

  test('ticked homework asks for its time, and saves it with the work', async ({ page }) => {
    await insert(page, 'tasks', dueTomorrow('hw-quad', 'Quadratics sheet', { estimatedHours: 0.5 }));
    const dialog = await openCheckIn(page);
    await homeworkRow(dialog, 'Quadratics sheet').click();

    await expect(dialog.getByRole('button', { name: '30m' })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: '45m' }).click();
    await expect(dialog.getByText(/45 min on the work ticked above is counted with it/)).toBeVisible();

    await dialog.getByRole('button', { name: /Save Check-in/ }).click();
    await confirmSheet(page, 'Save it');
    await expect(dialog).toBeHidden();

    const task = (await rows<{ id: string; loggedMinutes?: number }>(page, 'tasks')).find(
      (t) => t.id === 'hw-quad'
    );
    expect(task?.loggedMinutes).toBe(45);
    // The check-in's own minutes stay the "other study" figure - zero here -
    // so the same 45 minutes is not also counted through the check-in.
    const saved = await rows<{ completedRevisionMinutes: number }>(page, 'checkIns');
    expect(saved[0].completedRevisionMinutes).toBe(0);
  });

  test('a catch-up check-in dates its work time to the day it describes', async ({ page }) => {
    await insert(page, 'tasks', homework('hw-late', 'Combustion revision', { estimatedHours: 0.5 }));
    const dialog = await openCheckIn(page);
    await dialog.locator('input[type="date"]').fill('2026-09-23');
    await homeworkRow(dialog, 'Combustion revision').click();
    await dialog.getByRole('button', { name: /Save Check-in/ }).click();
    await confirmSheet(page, 'Save it');
    await expect(dialog).toBeHidden();

    await expect
      .poll(async () =>
        (await rows<{ id: string; workedOn?: string; loggedMinutes?: number }>(page, 'tasks')).find(
          (t) => t.id === 'hw-late'
        )
      )
      .toMatchObject({ workedOn: '2026-09-23', loggedMinutes: 30 });
  });

  test('the homework list leaves out work that is not due yet', async ({ page }) => {
    await insert(page, 'tasks', dueTomorrow('hw-now', 'Due tomorrow'));
    await insert(
      page,
      'tasks',
      homework('hw-later', 'Due in October', { dueDate: '2026-10-20', bucket: 'LATER' })
    );
    const dialog = await openCheckIn(page);

    await expect(homeworkRow(dialog, 'Due tomorrow')).toBeVisible();
    await expect(homeworkRow(dialog, 'Due in October')).toHaveCount(0);
    // The starter content has later work of its own, so the count is not ours
    // to fix - only that the later work is behind this button.
    await dialog.getByRole('button', { name: /^Show \d+ more due later$/ }).click();
    await expect(homeworkRow(dialog, 'Due in October')).toBeVisible();
  });

  /**
   * Committed work due today sat in the day list and again in the homework
   * list, and could be ticked in either - closing it twice, or closing it with
   * no time if the day list was the one ticked.
   */
  /**
   * The header button's name was "⚡ Check in", read aloud with the emoji, and
   * the dialog's close button had no name at all - announced as "button".
   */
  test('the check-in is opened and closed by controls with plain names', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Check in', exact: true })).toBeVisible();
    const dialog = await openCheckIn(page);
    await dialog.getByRole('button', { name: 'Close the check-in' }).click();
    await expect(dialog).toBeHidden();
  });

  test('work committed for today is asked about once, in the day list', async ({ page }) => {
    await insert(page, 'tasks', homework('hw-today', 'Sparx due today'));
    const dialog = await openCheckIn(page);

    await expect(dialog.getByRole('button', { name: 'Done — Sparx due today' })).toBeVisible();
    await expect(homeworkRow(dialog, 'Sparx due today')).toHaveCount(0);
  });

  test('"Done" on committed work closes it and asks its time, starting on the estimate', async ({
    page,
  }) => {
    await insert(page, 'tasks', homework('hw-today', 'Sparx due today', { estimatedHours: 0.5 }));
    const dialog = await openCheckIn(page);
    await dialog.getByRole('button', { name: 'Done — Sparx due today' }).click();

    // The row stays, now closed, with the two questions every close asks.
    await expect(dialog.getByRole('button', { name: '30m' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByText('Photo of it (optional)')).toBeVisible();
    await dialog.getByRole('button', { name: '45m' }).click();

    await expect
      .poll(async () =>
        (
          await rows<{ id: string; completed: boolean; loggedMinutes?: number; workedOn?: string }>(
            page,
            'tasks'
          )
        ).find((t) => t.id === 'hw-today')
      )
      .toMatchObject({ completed: true, loggedMinutes: 45, workedOn: TODAY });
  });
});

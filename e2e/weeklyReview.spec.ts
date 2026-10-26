import { test, expect, openApp, openTab, insert, rows, homework } from './fixtures';

/**
 * The weekly review, looking back.
 *
 * Built after 26 Oct 2026, when the review's "Last week" step was found to be
 * reading the plan and the hours from the week in progress while its notes came
 * from the week before. The clock is Friday 25 Sep, so the week just finished
 * is 14 – 20 Sep: a plan of two, one done on the Wednesday, plus a piece done
 * on the Thursday that nobody planned. The running week holds work of its own,
 * which must not appear.
 */

const at = (iso: string) => new Date(`${iso}T18:00:00+01:00`).getTime();

async function arrangeLastWeek(page: Parameters<typeof openApp>[0]) {
  await insert(
    page,
    'tasks',
    homework('e2e-planned-done', 'Sparx Maths', {
      dueDate: '2026-09-16',
      estimatedHours: 2,
      completed: true,
      completedAt: at('2026-09-16'),
    })
  );
  await insert(
    page,
    'tasks',
    homework('e2e-planned-open', 'Venn proofs', { dueDate: '2026-09-18', estimatedHours: 1 })
  );
  await insert(
    page,
    'tasks',
    homework('e2e-unplanned', 'English essay plan', {
      dueDate: '2026-09-17',
      estimatedHours: 1,
      completed: true,
      completedAt: at('2026-09-17'),
    })
  );
  await insert(
    page,
    'tasks',
    homework('e2e-this-week', 'Chemistry rates', {
      dueDate: '2026-09-23',
      completed: true,
      completedAt: at('2026-09-23'),
    })
  );
  await insert(page, 'planBaselines', {
    id: '2026-09-14',
    weekStart: '2026-09-14',
    status: 'BASELINED',
    taskIds: ['e2e-planned-done', 'e2e-planned-open'],
    hours: 3,
    createdAt: 0,
  });
}

async function openReview(page: Parameters<typeof openApp>[0]) {
  await openTab(page, 'Progress');
  await page.getByRole('button', { name: 'Start the weekly review' }).click();
  return page.getByRole('dialog', { name: 'Weekly review' });
}

test('opens on the week just finished, burned down from its own numbers', async ({ page }) => {
  await openApp(page);
  await arrangeLastWeek(page);
  const review = await openReview(page);

  await expect(review.getByText(/^14 Sept? – 20 Sept?$/)).toBeVisible();
  const chart = review.getByRole('region', { name: 'The week, day by day' });
  await expect(chart.getByText('Committed')).toBeVisible();
  await expect(chart.getByText('3h', { exact: true })).toBeVisible();
  await expect(chart.getByText('Left undone')).toBeVisible();
  await expect(chart.getByRole('img')).toHaveAttribute('aria-label', /Committed 3 hours/);

  // Drill into the Thursday: the unplanned piece, and nothing from this week.
  await chart.getByRole('button', { name: /Thu/ }).click();
  await expect(chart.getByText('English essay plan')).toBeVisible();
  await expect(chart.getByText(/Unplanned, done/)).toBeVisible();
  await expect(review.getByText('Chemistry rates')).toHaveCount(0);

  // Every piece, folded away until asked for.
  await review.getByRole('button', { name: /Every piece of 14 Sept? – 20 Sept?/ }).click();
  await expect(review.getByText('Venn proofs')).toBeVisible();
});

test('steps back through earlier weeks but not into the running one', async ({ page }) => {
  await openApp(page);
  await arrangeLastWeek(page);
  const review = await openReview(page);

  await expect(review.getByRole('button', { name: 'The week after' })).toBeDisabled();
  await review.getByRole('button', { name: 'The week before' }).click();
  await expect(review.getByText(/^7 Sept? – 13 Sept?$/)).toBeVisible();
  await expect(review.getByText(/No agreed plan this week/)).toBeVisible();

  await review.getByRole('button', { name: 'Last week' }).click();
  await expect(review.getByText(/^14 Sept? – 20 Sept?$/)).toBeVisible();
});

test('signing off closes the week on screen, with that week’s numbers', async ({ page }) => {
  await openApp(page);
  await arrangeLastWeek(page);
  const review = await openReview(page);

  await review.getByRole('button', { name: 'Sign off' }).click();
  await expect(review.getByText(/1\/2 planned pieces done/)).toBeVisible();
  await review.getByRole('button', { name: 'Reviewed together' }).click();

  const baselines = await rows<{ id: string; reviewedAt?: number; reviewedNote?: string }>(
    page,
    'planBaselines'
  );
  const reviewed = baselines.find((b) => b.id === '2026-09-14');
  expect(reviewed?.reviewedAt).toBeTruthy();
  expect(reviewed?.reviewedNote).toMatch(/^1\/2 planned pieces done/);
});

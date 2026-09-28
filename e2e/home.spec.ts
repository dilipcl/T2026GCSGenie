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

/**
 * On a phone the two things done every day come before the week's working.
 *
 * Home ran to a dozen cards on a phone before the focus timer and the lesson
 * list, which were below the fold for the person using it most. The week now
 * folds into one line there; on a laptop nothing moves.
 */
test('on a phone the daily actions come first, and the week folds into one line', async ({
  page,
}) => {
  await openApp(page);
  const timer = page.getByRole('heading', { name: 'Focus block' });
  const lessons = page.getByText('Today, and how it went');
  const health = page.getByRole('heading', { name: /This week.s health/ });
  const summary = page.getByRole('button', { name: /Show the week/ });

  if (test.info().project.name === 'phone') {
    await expect(summary).toBeVisible();
    await expect(health).toBeHidden();

    // Above the fold means above the lessons, which used to sit far below.
    const top = async (l: typeof timer) => (await l.boundingBox())!.y;
    expect(await top(timer)).toBeLessThan(await top(lessons));
    expect(await top(summary)).toBeLessThan(await top(timer));

    await summary.click();
    await expect(health).toBeVisible();
    await expect(page.getByRole('button', { name: /Hide the week/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  } else {
    // The laptop layout is unchanged: the week first, and no summary line.
    await expect(health).toBeVisible();
    await expect(summary).toBeHidden();
    expect((await health.boundingBox())!.y).toBeLessThan((await timer.boundingBox())!.y);
  }
});

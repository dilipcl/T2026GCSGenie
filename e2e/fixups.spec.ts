import { test, expect, openApp, openTab, rows, insert } from './fixtures';

/**
 * Fix-up quests are fix-up tasks: one kind of fix-up, in My Work and the plan.
 *
 * The conversion itself is unit-tested (`fixUpConversion.test.ts`). A test
 * browser is signed out, and a signed-out device must never convert - on
 * signing in it would upload its converted rows over the family's - so these
 * put fix-ups in place as the conversion writes them, and separately check
 * that a quest on a signed-out device is left alone.
 */

const FIX_UPS = [
  {
    id: 'fixup__rem-maths-1',
    subjectId: 'maths',
    title: 'Venn Diagram Probability Proofs',
    dueDate: '2026-10-17',
    bucket: 'FUTURE',
    priority: 'MEDIUM',
    isHomework: false,
    isRemediation: true,
    remediationSourceDoc: 'yr9- maths.pdf (Score: 60/75)',
    whatWentWrong: 'Scored 0/2 on proving event independence on Venn Diagram question.',
    fixSteps: 'Redo Q12-14 and compare P(A and B) with P(A)P(B).',
    hint: 'Independent if P(A∩B) = P(A)P(B)',
    xpValue: 200,
    completed: false,
    createdAt: 0,
  },
  {
    id: 'fixup__rem-cs-1',
    subjectId: 'computer_science',
    title: 'CS Homework Consistency 14-Day Challenge',
    dueDate: '2026-10-17',
    bucket: 'FUTURE',
    priority: 'MEDIUM',
    isHomework: false,
    isRemediation: true,
    whatWentWrong: 'Home learning below expected standard.',
    fixSteps: 'Fourteen days with nothing overdue.',
    xpValue: 300,
    completed: false,
    createdAt: 0,
  },
];

test.describe('fix-ups', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    for (const fixUp of FIX_UPS) await insert(page, 'tasks', fixUp);
  });

  test('quests arrive as fix-ups on Home and in My Work, saying what went wrong', async ({ page }) => {
    const fixUps = (await rows<{ isRemediation: boolean }>(page, 'tasks')).filter((t) => t.isRemediation);
    expect(fixUps).toHaveLength(FIX_UPS.length);
    await expect(page.getByText(`${fixUps.length} open`)).toBeVisible();

    await openTab(page, 'My Work');
    await page.getByRole('button', { name: 'Fix-ups', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Venn Diagram Probability Proofs' })).toBeVisible();
    await expect(page.getByText('What went wrong:').first()).toBeVisible();
    // The pointer to a separate quest screen is gone - there is nothing there.
    await expect(page.getByText(/older quests? from your Year 9 papers/)).toHaveCount(0);
  });

  test('closing a fix-up can name what is still shaky, which becomes a fix-up of its own', async ({
    page,
  }) => {
    await openTab(page, 'My Work');
    await page.getByRole('button', { name: 'Fix-ups', exact: true }).click();
    const row = page
      .locator('div.rounded-xl', {
        has: page.getByRole('heading', { name: 'Venn Diagram Probability Proofs' }),
      })
      .last();
    await row.getByRole('button').first().click();

    const sheet = page.getByRole('dialog', { name: /Finished “Venn Diagram Probability Proofs”\?/ });
    await sheet.getByLabel('Marks scored on the re-try').fill('5');
    await sheet.getByLabel('Marks available on the re-try').fill('6');
    await sheet.getByLabel('Still shaky on').fill('part (b) comparison');
    await sheet.getByRole('button', { name: 'Mark it done anyway' }).click();
    await expect(sheet).toBeHidden();

    await expect(
      page.getByRole('heading', { name: 'Venn Diagram Probability Proofs: part (b) comparison' })
    ).toBeVisible();
  });

  test('a starter fix-up that does not apply can be deleted from My Work', async ({ page }) => {
    await openTab(page, 'My Work');
    await page.getByRole('button', { name: 'Fix-ups', exact: true }).click();
    await page.getByRole('button', { name: 'Delete task CS Homework Consistency 14-Day Challenge' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(
      page.getByRole('heading', { name: 'CS Homework Consistency 14-Day Challenge' })
    ).toHaveCount(0);
    await expect
      .poll(async () =>
        (await rows<{ title: string }>(page, 'tasks')).some(
          (t) => t.title === 'CS Homework Consistency 14-Day Challenge'
        )
      )
      .toBe(false);
  });

  test('a quest on a signed-out device is left alone until it has signed in and synced', async ({
    page,
  }) => {
    await insert(page, 'remediations', {
      id: 'rem-history-1',
      subjectId: 'history',
      sourceDoc: 'history.pdf',
      diagnosticError: 'Lost marks on the definition of reparations.',
      taskTitle: 'Reparations Keyword Mastery',
      taskInstructions: 'Learn the definition.',
      xpReward: 100,
      isCompleted: false,
    });
    // Give the conversion every chance to (wrongly) run.
    await page.clock.runFor(3000);

    expect(await rows(page, 'remediations')).toHaveLength(1);
    expect((await rows<{ id: string }>(page, 'tasks')).some((t) => t.id === 'fixup__rem-history-1')).toBe(false);
  });
});

import { test, expect, openApp, openTab, rows, insert, homework } from './fixtures';

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
    // Straight in, with no wait for the suggestion: a tap wins whenever the
    // suggestion lands, and tapping the suggested chip agrees with it.
    await sheet.locator('#quick-add-title').fill(title);
    const maths = sheet.getByRole('button', { name: /Maths/ }).first();
    await maths.click();
    await expect(maths).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('button', { name: /^Add (homework|fix-up) \(/ }).click();
    await expect(sheet).toBeHidden();
  }

  /**
   * Holds every table in a read-write transaction until released, so any read
   * the app starts queues behind it. Tapping a subject needs no database at
   * all, so with this in place the tap is certain to come before the
   * suggestion - the order that used to lose the tap, and that the suite
   * otherwise only met by luck.
   */
  async function holdDatabase(page: import('@playwright/test').Page) {
    await page.evaluate(
      async () => {
        // Found rather than assumed: opening a name that does not exist
        // quietly creates an empty database and holds nothing.
        const name = (await indexedDB.databases())
          .map((d) => d.name ?? '')
          .find((n) => n.includes('GCSEGenie'));
        if (!name) throw new Error('No GCSE Genie database in this page');
        return new Promise<void>((resolve, reject) => {
          const open = indexedDB.open(name);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const idb = open.result;
            const tx = idb.transaction([...idb.objectStoreNames], 'readwrite');
            const store = tx.objectStore(idb.objectStoreNames[0]);
            const w = window as unknown as { __released?: boolean };
            w.__released = false;
            // A transaction stays open while it has requests in flight.
            const spin = () => {
              if (!w.__released) store.count().onsuccess = spin;
            };
            spin();
            tx.oncomplete = () => idb.close();
            resolve();
          };
        });
      }
    );
  }

  /**
   * A fix-up made here asked for less than one made anywhere else: its subject
   * read "optional", it had nowhere to say what went wrong, it could not name
   * a topic, and its goal came from a list of every goal in the house - which
   * is how a Computer Science fix-up was filed under General.
   */
  test('a fix-up from the sheet says what went wrong, and is filed under its own subject', async ({
    page,
  }) => {
    const goal = (id: string, subjectId: string, title: string) => ({
      id,
      title,
      category: 'ACADEMIC_GRADE_9',
      subjectId,
      smartSpecific: '',
      smartMeasurable: '',
      smartAchievable: '',
      smartRealistic: '',
      smartTimeBound: '',
      status: 'APPROVED_LOCKED',
      ragStatus: 'GREEN',
      weeklyHoursRequired: 2,
      createdAt: 0,
    });
    await insert(page, 'goals', goal('goal-maths', 'maths', 'Maths: grade 9 in the mock'));
    await insert(page, 'goals', goal('goal-physics', 'physics', 'Physics: grade 9 in the mock'));
    await insert(page, 'syllabusTopics', {
      id: 'topic-circle-area',
      subjectId: 'maths',
      unit: 'Geometry',
      title: 'Circle area',
      isCompleted: false,
      confidenceRating: 2,
      isImportantForGrade9: true,
    });

    await page.getByRole('button', { name: 'Add homework', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Quick add' });
    await sheet.getByRole('button', { name: /^Fix a mistake/ }).click();
    // The subject is required for a fix-up, as for homework; only the topic
    // below is optional.
    await expect(sheet.locator('label', { hasText: /^Subject/ })).not.toContainText('optional');

    await sheet.locator('#quick-add-title').fill('Redo the circle questions');
    const maths = sheet.getByRole('button', { name: /Maths/ }).first();
    await maths.click();
    await expect(maths).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByLabel('What went wrong?').fill('Forgot to square the radius');

    const goals = sheet.locator('#quick-add-goal option');
    await expect(goals).toContainText(['Maths: grade 9 in the mock']);
    await expect(sheet.locator('#quick-add-goal')).not.toContainText('Physics: grade 9');
    await sheet.locator('#quick-add-goal').selectOption('goal-maths');
    await sheet.locator('#quick-add-topic').selectOption('topic-circle-area');

    await sheet.getByRole('button', { name: /^Add fix-up \(/ }).click();
    await expect(sheet).toBeHidden();

    const saved = (
      await rows<{
        title: string;
        isRemediation: boolean;
        subjectId: string;
        whatWentWrong?: string;
        linkedGoalId?: string;
        linkedTopicId?: string;
      }>(page, 'tasks')
    ).find((t) => t.title === 'Redo the circle questions');
    expect(saved).toMatchObject({
      isRemediation: true,
      subjectId: 'maths',
      whatWentWrong: 'Forgot to square the radius',
      linkedGoalId: 'goal-maths',
      linkedTopicId: 'topic-circle-area',
    });
  });

  test('a subject tapped before the suggestion arrives is kept', async ({ page }) => {
    const sheet = page.getByRole('dialog', { name: 'Quick add' });
    const chip = (name: RegExp) => sheet.getByRole('button', { name }).first();
    const subjects = [/Maths/, /History/, /Physics/];

    // What the sheet suggests on its own, so the test can tap something else.
    await page.getByRole('button', { name: 'Add homework', exact: true }).click();
    await sheet.getByRole('button', { name: /^Homework/ }).click();
    await expect(sheet.locator('button[aria-pressed="true"]')).toHaveCount(1);
    let target = subjects[0];
    for (const name of subjects) {
      if ((await chip(name).getAttribute('aria-pressed')) !== 'true') {
        target = name;
        break;
      }
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await holdDatabase(page);
    await page.getByRole('button', { name: 'Add homework', exact: true }).click();
    await sheet.getByRole('button', { name: /^Homework/ }).click();
    await sheet.locator('#quick-add-title').fill('Tapped before the suggestion');
    await chip(target).click();
    await expect(chip(target)).toHaveAttribute('aria-pressed', 'true');

    await page.evaluate(() => ((window as unknown as { __released: boolean }).__released = true));
    // Let the queued reads - the suggestion among them - land.
    await page.waitForTimeout(1500);
    await expect(chip(target)).toHaveAttribute('aria-pressed', 'true');

    await sheet.getByRole('button', { name: /^Add homework \(/ }).click();
    await expect(sheet).toBeHidden();
  });

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

  test('closing work asks how long it took, starting on its estimate', async ({ page }) => {
    await insert(page, 'tasks', homework('hw-crude', 'Crude oil worksheet', { estimatedHours: 0.75 }));
    // My Work reads its list when the tab opens, not live (a finding of its
    // own), so the row arrives by opening the tab again.
    await openTab(page, 'Home');
    await openTab(page, 'My Work');
    const row = page
      .locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Crude oil worksheet' }) })
      .last();
    await row.getByRole('button').first().click();

    const sheet = page.getByRole('dialog', { name: /Finished “Crude oil worksheet”\?/ });
    await expect(sheet.getByRole('button', { name: '45m' })).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('button', { name: '1h', exact: true }).click();
    await sheet.getByRole('button', { name: 'Mark it done anyway' }).click();
    await expect(sheet).toBeHidden();

    const saved = (await rows<{ id: string; completed: boolean; loggedMinutes?: number }>(page, 'tasks')).find(
      (t) => t.id === 'hw-crude'
    );
    expect(saved).toMatchObject({ completed: true, loggedMinutes: 60 });
  });
});

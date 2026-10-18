import { test, expect, openApp, openTab, insert, TODAY } from './fixtures';

/**
 * The activity feed reads as a diary.
 *
 * On 18 Oct 2026 a day read as thirty-three rows led by "Changed
 * checkinoccurrences something". Each day now opens with what it was, and the
 * bookkeeping folds behind one button - still there for anyone checking.
 */

test('a day opens with what it was, and routine rows fold away', async ({ page }) => {
  await openApp(page);
  await page.evaluate(`(async () => {
    const { logAuditEvent } = await import('/T2026GCSGenie/src/services/auditService.ts');
    for (let i = 0; i < 3; i++) await logAuditEvent({ user: 'STUDENT', action: 'UPDATE', entity: 'checkInOccurrences', entityId: 'o' + i });
    await logAuditEvent({ user: 'STUDENT', action: 'INSERT', entity: 'SyllabusTopic', entityId: 's1', newValue: 'Macbeth: ambition' });
  })()`);
  await insert(page, 'checkIns', {
    id: 'e2e-diary',
    date: TODAY,
    timestamp: 0,
    session: 'EVENING',
    energyLevel: 4,
    focusRating: 'NORMAL',
    completedHomeworkIds: [],
    completedRevisionMinutes: 75,
    studySubjectId: 'english_lit',
    xpEarned: 20,
    isDailyBaseXPAwarded: true,
  });

  await openTab(page, 'Updates');
  await page.getByRole('button', { name: /All activity/ }).click();

  await expect(page.getByText('1.3h studied, added 1 topic, checked in.')).toBeVisible();
  await expect(page.getByText('Added syllabus topic “Macbeth: ambition”')).toBeVisible();
  await expect(page.getByText('Changed a lesson answer')).toHaveCount(0);

  await page.getByRole('button', { name: /Show every change/ }).click();
  await expect(page.getByText('Changed a lesson answer')).toHaveCount(3);
  await expect(page.getByText(/something|checkinoccurrences/i)).toHaveCount(0);
});

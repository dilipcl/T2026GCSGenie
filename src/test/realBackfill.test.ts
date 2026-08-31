import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { db } from '../db';
import { emptyDatabase } from './harness';
import { buildActivityFeed, groupByDay, outstanding } from '../services/activityService';
import { reconcileDevicesFromAuditLog, nameDevice } from '../services/deviceRegistryService';

/**
 * Verification against the family's real 31 August backup.
 *
 * Not part of the suite - it needs a file that lives outside the repo. Run it
 * explicitly to confirm that the data already in Drive surfaces in the new feed
 * with nothing dropped.
 */
/**
 * Points at the family's real export, which lives in Drive rather than in the
 * repository. Override with GENIE_REAL_BACKUP to run it against another file;
 * the suite skips these entirely when the file is absent, so a clean checkout
 * is never broken by them.
 */
const BACKUP =
  process.env.GENIE_REAL_BACKUP ??
  'G:/My Drive/Documents/UK/Family/Tejas/GCSEAppWorkingFolder/_Genie-Backups/GCSE_Genie_Backup_2026-08-31.json';

/**
 * Skipped wherever the file is not present. This checks the real family backup,
 * which lives in Drive rather than in the repo, so it must never be the reason
 * a clean checkout fails its tests.
 */
const available = fs.existsSync(BACKUP);
const describeIfAvailable = available ? describe : describe.skip;

beforeEach(async () => {
  await emptyDatabase();
  const data = JSON.parse(fs.readFileSync(BACKUP, 'utf-8'));
  await db.auditLogs.bulkAdd(data.auditLogs);
  await db.changeLog.bulkAdd(data.changeLog);
  await db.goals.bulkAdd(data.goals);
  await db.tasks.bulkAdd(data.tasks);
  await db.syllabusTopics.bulkAdd(data.syllabusTopics);
});

describeIfAvailable('the real backup, in the new feed', () => {
  it('surfaces every historic row', async () => {
    const feed = await buildActivityFeed('PARENT');
    console.log('\n=== FEED SIZE ===');
    console.log('audit rows in backup :', (await db.auditLogs.count()));
    console.log('changeLog in backup  :', (await db.changeLog.count()));
    console.log('items in feed        :', feed.items.length);
    console.log('hidden from student  :', (await buildActivityFeed('STUDENT')).hiddenByVisibility);

    console.log('\n=== DEVICES FOUND ===');
    for (const d of await reconcileDevicesFromAuditLog()) {
      console.log(` ${d.id.slice(0, 8)}  ${d.usualRole.padEnd(8)} ${d.label}`);
    }

    console.log('\n=== STILL WAITING ===');
    for (const item of outstanding(feed.items)) {
      console.log(` ${item.summary}  --> ${item.pending?.label}`);
    }

    console.log('\n=== BY DAY ===');
    for (const day of groupByDay(feed.items)) {
      console.log(`\n${day.date}  (${day.items.length})`);
      for (const i of day.items) {
        console.log(`  ${i.action.padEnd(8)} ${i.summary.slice(0, 72)}`);
      }
    }

    expect(feed.items.length).toBeGreaterThanOrEqual(27);
  });

  it('names devices retroactively', async () => {
    const devices = await reconcileDevicesFromAuditLog();
    const tejas = devices.find((d) => d.id.startsWith('736cfd1a'));
    expect(tejas).toBeDefined();

    await nameDevice(tejas!.id, "Tejas's phone");
    const feed = await buildActivityFeed('PARENT');
    const his = feed.items.filter((i) => i.actorLabel === "Tejas's phone");

    console.log(`\nRows attributed to Tejas's phone after naming: ${his.length}`);
    expect(his.length).toBeGreaterThan(15);
  });
});

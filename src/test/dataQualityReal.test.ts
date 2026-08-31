import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { db } from '../db';
import { emptyDatabase } from './harness';
import { inspectData, SEVERITY_LABEL } from '../services/dataQualityService';

/**
 * Points at the family's real export, which lives in Drive rather than in the
 * repository. Override with GENIE_REAL_BACKUP to run it against another file;
 * the suite skips these entirely when the file is absent, so a clean checkout
 * is never broken by them.
 */
const BACKUP =
  process.env.GENIE_REAL_BACKUP ??
  'G:/My Drive/Documents/UK/Family/Tejas/GCSEAppWorkingFolder/_Genie-Backups/GCSE_Genie_Backup_2026-08-31.json';
const available = fs.existsSync(BACKUP);
const describeIfAvailable = available ? describe : describe.skip;

beforeEach(async () => {
  await emptyDatabase();
  const d = JSON.parse(fs.readFileSync(BACKUP, 'utf-8'));
  await db.tasks.bulkAdd(d.tasks);
  await db.goals.bulkAdd(d.goals);
  await db.checkIns.bulkAdd(d.checkIns);
});

describeIfAvailable('data quality of the real export', () => {
  it('reports what is actually wrong', async () => {
    const report = await inspectData(new Date('2026-08-31T18:00:00').getTime());
    console.log(`\nrows examined: ${report.rowsExamined}`);
    for (const [sev, n] of Object.entries(report.countsBySeverity)) {
      console.log(`  ${SEVERITY_LABEL[sev as keyof typeof SEVERITY_LABEL]}: ${n}`);
    }
    console.log('');
    for (const i of report.issues) {
      console.log(`[${i.severity}] ${i.problem}`);
      console.log(`    -> ${i.consequence}`);
    }
    expect(report.issues.length).toBeGreaterThan(0);
  });
});

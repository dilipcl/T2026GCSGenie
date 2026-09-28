import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { resetDatabase } from '../test/harness';
import { exportReportCsv } from './csvService';
import { generateAgentAuditPackage } from './backupService';
import { Task } from '../types';

/**
 * The reports a parent sends on read fix-ups from the tasks they are.
 *
 * Both used to read the quest table. Once the quests were converted that table
 * was empty, so the CSV export listed no fix-ups and the AI audit told the
 * model there were none - while eleven were waiting, three of them written by
 * Tejas. Nothing looked broken: an empty section reads like good news.
 */

const fixUp: Task = {
  id: 'fixup__rem_venn',
  subjectId: 'maths',
  title: 'Venn diagram probability proofs',
  whatWentWrong: 'Counted the intersection twice',
  dueDate: '2026-11-02',
  priority: 'MEDIUM',
  isHomework: false,
  isRemediation: true,
  xpValue: 150,
  completed: false,
  createdAt: 1,
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-25T17:30:00'));
  await resetDatabase();
  await db.tasks.add(fixUp);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fix-ups in the reports', () => {
  it('the CSV export lists a fix-up under FIX-UPS, with what went wrong, and not again under TASKS', async () => {
    const lines = (await exportReportCsv()).split(/\r?\n/);
    const fixUps = lines.findIndex((l) => l.startsWith('FIX-UPS'));
    const tasks = lines.findIndex((l) => l.startsWith('TASKS'));
    expect(fixUps).toBeGreaterThan(-1);

    const row = lines.slice(fixUps).find((l) => l.includes('Venn diagram probability proofs'));
    expect(row).toContain('Counted the intersection twice');

    const tasksSection = lines.slice(tasks, lines.indexOf('', tasks));
    expect(tasksSection.some((l) => l.includes('Venn diagram probability proofs'))).toBe(false);
  }, 20_000);

  it('the AI audit carries the fix-up', async () => {
    const { jsonContent } = await generateAgentAuditPackage();
    const bundle = JSON.parse(jsonContent);
    expect(bundle.fixUpsStatus).toContainEqual(
      expect.objectContaining({
        title: 'Venn diagram probability proofs',
        whatWentWrong: 'Counted the intersection twice',
        isCompleted: false,
      })
    );
  }, 20_000);
});

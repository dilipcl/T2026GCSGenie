import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { emptyDatabase, resetDatabase } from '../test/harness';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  changesOn,
  confirmChanges,
  confirmedChanges,
  groupByCategory,
  markDriveLogged,
  markReported,
  pendingConfirmation,
  recordChange,
  unreportedChanges,
} from './changeLogService';
import { changeLogMessage, buildChatUrl } from './whatsappService';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

const TODAY = '2026-09-02';

beforeEach(async () => {
  await emptyDatabase();
  freezeAt(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('recordChange', () => {
  it('writes an unreported entry dated today', async () => {
    const entry = await recordChange({
      category: 'HOMEWORK',
      summary: 'Finished "Trig past paper" (+50 XP)',
    });

    expect(entry.date).toBe(TODAY);
    expect(entry.reported).toBe(false);
    expect(entry.actor).toBe('STUDENT');
    expect(await db.changeLog.count()).toBe(1);
  });

  it('trims the summary and drops an empty detail', async () => {
    const entry = await recordChange({
      category: 'CHORE',
      summary: '  Did chore "Bins"  ',
      detail: '   ',
    });
    expect(entry.summary).toBe('Did chore "Bins"');
    expect(entry.detail).toBeUndefined();
  });

  it('records who made the change', async () => {
    const entry = await recordChange({
      category: 'ATTENDANCE',
      summary: 'Cadets excused',
      actor: 'PARENT',
    });
    expect(entry.actor).toBe('PARENT');
  });
});

describe('the two stages', () => {
  it('starts every change waiting to be confirmed', async () => {
    await recordChange({ category: 'HOMEWORK', summary: 'first' });
    vi.setSystemTime(new Date(`${TODAY}T12:00:05`));
    await recordChange({ category: 'CHORE', summary: 'second' });

    expect((await pendingConfirmation()).map((e) => e.summary)).toEqual(['first', 'second']);
    expect(await confirmedChanges()).toEqual([]);
  });

  /**
   * Nothing reaches the family until it has been signed off. Forwarding an
   * unconfirmed change would send them a draft of somebody's day.
   */
  it('offers nothing to forward until it is re-confirmed', async () => {
    await recordChange({ category: 'HOMEWORK', summary: 'first' });
    expect(await unreportedChanges()).toEqual([]);

    await confirmChanges(await pendingConfirmation());
    expect((await unreportedChanges()).map((e) => e.summary)).toEqual(['first']);
  });

  it('moves a batch from waiting to confirmed', async () => {
    await recordChange({ category: 'HOMEWORK', summary: 'first' });
    vi.setSystemTime(new Date(`${TODAY}T12:00:05`));
    await recordChange({ category: 'CHORE', summary: 'second' });

    const waiting = await pendingConfirmation();
    await confirmChanges([waiting[0]], 'Ran out of time on the other one');

    expect((await pendingConfirmation()).map((e) => e.summary)).toEqual(['second']);
    expect((await confirmedChanges()).map((e) => e.summary)).toEqual(['first']);
  });

  it('keeps the comment against every entry in the batch', async () => {
    await recordChange({ category: 'HOMEWORK', summary: 'a' });
    await recordChange({ category: 'CHORE', summary: 'b' });

    const confirmedRows = await confirmChanges(await pendingConfirmation(), '  Busy evening  ');
    expect(confirmedRows.every((e) => e.confirmComment === 'Busy evening')).toBe(true);
    expect(confirmedRows.every((e) => typeof e.confirmedAt === 'number')).toBe(true);
  });

  it('leaves the comment off when none was written', async () => {
    await recordChange({ category: 'HOMEWORK', summary: 'a' });
    const [row] = await confirmChanges(await pendingConfirmation(), '   ');
    expect(row.confirmComment).toBeUndefined();
  });

  it('records which Drive file a batch was written into', async () => {
    await recordChange({ category: 'HOMEWORK', summary: 'a' });
    const confirmedRows = await confirmChanges(await pendingConfirmation());
    await markDriveLogged(confirmedRows, 'Genie-Updates-2026-09-02-1830.md');

    const stored = await db.changeLog.get(confirmedRows[0].id);
    expect(stored!.driveFileName).toBe('Genie-Updates-2026-09-02-1830.md');
    expect(stored!.driveLoggedAt).toBeGreaterThan(0);
  });

  it('drops entries from the forward queue once they are reported', async () => {
    await recordChange({ category: 'HOMEWORK', summary: 'first' });
    vi.setSystemTime(new Date(`${TODAY}T12:00:05`));
    await recordChange({ category: 'CHORE', summary: 'second' });

    const confirmedRows = await confirmChanges(await pendingConfirmation());
    await markReported([confirmedRows[0]]);

    expect((await unreportedChanges()).map((e) => e.summary)).toEqual(['second']);
    // Both still exist - it is a log, not a queue.
    expect(await db.changeLog.count()).toBe(2);
    expect((await confirmedChanges()).length).toBe(2);
  });

  it('stamps when it was reported', async () => {
    await recordChange({ category: 'HOMEWORK', summary: 'first' });
    const confirmedRows = await confirmChanges(await pendingConfirmation());
    await markReported(confirmedRows);

    const stored = await db.changeLog.get(confirmedRows[0].id);
    expect(stored!.reported).toBe(true);
    expect(stored!.reportedAt).toBeGreaterThan(0);
  });
});

describe('changesOn', () => {
  it('returns only the given day', async () => {
    await recordChange({ category: 'HOMEWORK', summary: 'today' });

    freezeAt('2026-09-03');
    await recordChange({ category: 'CHORE', summary: 'tomorrow' });

    expect((await changesOn(TODAY)).map((e) => e.summary)).toEqual(['today']);
    expect((await changesOn('2026-09-03')).map((e) => e.summary)).toEqual(['tomorrow']);
  });
});

describe('groupByCategory', () => {
  it('groups and orders categories, keeping entry order inside each', async () => {
    for (const [category, summary] of [
      ['REWARD', 'r1'],
      ['HOMEWORK', 'h1'],
      ['CHORE', 'c1'],
      ['HOMEWORK', 'h2'],
    ] as const) {
      vi.setSystemTime(new Date(`${TODAY}T12:00:0${summary.slice(-1)}`));
      await recordChange({ category, summary });
    }

    const grouped = groupByCategory(await pendingConfirmation());
    expect(grouped.map((g) => g.category)).toEqual(['HOMEWORK', 'CHORE', 'REWARD']);
    expect(grouped[0].entries.map((e) => e.summary)).toEqual(['h1', 'h2']);
  });

  it('omits categories with nothing in them', async () => {
    await recordChange({ category: 'GOAL', summary: 'g1' });
    expect(groupByCategory(await pendingConfirmation()).map((g) => g.category)).toEqual(['GOAL']);
  });

  it('has a label and an icon for every category it can group', async () => {
    for (const category of Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]) {
      expect(CATEGORY_LABEL[category]).toBeTruthy();
      expect(CATEGORY_ICON[category]).toBeTruthy();
    }
  });
});

describe('the message sent to the family group', () => {
  it('lists every confirmed change under its heading', async () => {
    await recordChange({ category: 'HOMEWORK', summary: 'Finished "Trig paper" (+50 XP)' });
    await recordChange({
      category: 'ATTENDANCE',
      summary: 'Cadets on 2026-09-01: Excused absence — Family outing',
      detail: 'Dad’s birthday dinner',
    });

    const grouped = groupByCategory(await pendingConfirmation());
    const text = changeLogMessage(
      { studentName: 'Tejas Dilip' },
      {
        dateLabel: 'Today',
        groups: grouped.map((g) => ({
          label: CATEGORY_LABEL[g.category],
          icon: CATEGORY_ICON[g.category],
          lines: g.entries.map((e) => e.summary + (e.detail ? ` — ${e.detail}` : '')),
        })),
      }
    );

    expect(text).toContain('Tejas Dilip');
    expect(text).toContain('Homework');
    expect(text).toContain('Finished "Trig paper" (+50 XP)');
    expect(text).toContain('Attendance');
    expect(text).toContain('Dad’s birthday dinner');
  });

  it('includes a comment when one is written', async () => {
    const text = changeLogMessage(
      { studentName: 'Tejas' },
      {
        dateLabel: 'Today',
        groups: [{ label: 'Homework', icon: '📚', lines: ['Did a thing'] }],
        comment: 'Struggled with question 14',
        commentFrom: 'Note',
      }
    );
    expect(text).toContain('Struggled with question 14');
  });

  it('leaves the comment line out when there is none', async () => {
    const text = changeLogMessage(
      { studentName: 'Tejas' },
      { dateLabel: 'Today', groups: [{ label: 'Homework', icon: '📚', lines: ['Did a thing'] }] }
    );
    expect(text).not.toContain('💬');
  });

  it('survives a round trip through the chat URL', async () => {
    const text = changeLogMessage(
      { studentName: 'Tejas' },
      {
        dateLabel: 'Today',
        groups: [{ label: 'Chores', icon: '🧹', lines: ['Bins out (+25 XP)'] }],
        comment: 'A & B',
      }
    );
    const decoded = decodeURIComponent(buildChatUrl(text).split('?text=')[1]);
    expect(decoded).toBe(text);
  });
});

describe('the handover reset', () => {
  /**
   * The reset exists to clear the student's activity, and it must not take the
   * parent's set-up with it. A parent who loses their WhatsApp numbers and
   * chore list every time they clear a test run stops using the reset.
   */
  it('clears the change log but keeps everything a parent configured', async () => {
    await resetDatabase();
    freezeAt(TODAY);

    await db.parentSettings.update('active_settings', {
      parentWhatsAppNumbers: [{ id: 'wa1', label: 'Mum', e164: '447700900123' }],
      familyGroupInviteUrl: 'https://chat.whatsapp.com/EXAMPLE',
      examSeriesStartDate: '2027-05-10',
      studentName: 'Tejas Dilip',
    });
    await db.chores.add({
      id: 'chore-1',
      title: 'Bins',
      xpValue: 25,
      cadence: 'WEEKLY',
      dayOfWeek: 'TUE',
      isActive: true,
      createdAt: 1,
      createdBy: 'PARENT',
    });
    await recordChange({ category: 'HOMEWORK', summary: 'Finished something' });

    const { performHandoverReset, previewHandoverReset } = await import('./handoverService');

    const preview = await previewHandoverReset();
    expect(preview.preserved.whatsAppNumbers).toBe(1);
    expect(preview.preserved.chores).toBe(1);
    expect(preview.preserved.commitments).toBeGreaterThan(0);
    expect(preview.preserved.hasFamilyGroup).toBe(true);

    await performHandoverReset();

    // Student activity: gone.
    expect(await db.changeLog.count()).toBe(0);
    expect(await db.checkIns.count()).toBe(0);
    expect(await db.choreCompletions.count()).toBe(0);
    expect(await db.commitmentExceptions.count()).toBe(0);

    // Parent set-up: untouched.
    const settings = await db.parentSettings.get('active_settings');
    expect(settings!.parentWhatsAppNumbers).toHaveLength(1);
    expect(settings!.familyGroupInviteUrl).toBe('https://chat.whatsapp.com/EXAMPLE');
    expect(settings!.examSeriesStartDate).toBe('2027-05-10');
    expect(settings!.studentName).toBe('Tejas Dilip');
    expect(await db.chores.get('chore-1')).toBeTruthy();
    expect(await db.commitments.count()).toBeGreaterThan(0);
    expect(await db.rewards.count()).toBeGreaterThan(0);
  });

  it('keeps the parent passphrase unless asked to clear it', async () => {
    await resetDatabase();
    await db.parentSettings.update('active_settings', {
      parentCredential: { salt: 's', hash: 'h', iterations: 1 } as never,
    });

    const { performHandoverReset } = await import('./handoverService');

    await performHandoverReset();
    expect((await db.parentSettings.get('active_settings'))!.parentCredential).toBeTruthy();

    await performHandoverReset({ clearPassphrase: true });
    expect((await db.parentSettings.get('active_settings'))!.parentCredential).toBeUndefined();
  });

  /**
   * A logged absence is a thing that happened on a Tuesday, not configuration.
   * Left behind, a handover would ship a week with hours already excused from
   * it and no record of why.
   */
  it('removes excused hours from the week it hands over', async () => {
    await resetDatabase();
    freezeAt(TODAY);

    const { logException } = await import('./commitmentService');
    const { calculateBurnoutCapacity } = await import('./burnoutEngine');

    const cadets = (await db.commitments.get('cadets'))!;
    await logException({
      commitment: cadets,
      date: '2026-09-01',
      title: 'Air Cadets',
      scheduledHours: 3,
      status: 'EXCUSED_ABSENT',
      reasonCategory: 'FAMILY',
    });
    expect((await calculateBurnoutCapacity()).excusedHours).toBe(3);

    const { performHandoverReset } = await import('./handoverService');
    await performHandoverReset();

    expect((await calculateBurnoutCapacity()).excusedHours).toBe(0);
  });
});

describe('settings backfill on an existing install', () => {
  /**
   * The failure this guards against is silent by nature. `seedMissingRows` only
   * inserts absent rows, so a field added to the single settings row never
   * reaches a device that already has one - the countdown just reads "This
   * week" and the family group link just never appears, with no error anywhere.
   */
  it('fills in fields added after the row was created', async () => {
    await resetDatabase();

    await db.parentSettings.update('active_settings', {
      examSeriesStartDate: undefined,
      familyGroupInviteUrl: undefined,
      updateForwarding: undefined,
    });

    const bare = await db.parentSettings.get('active_settings');
    expect(bare!.examSeriesStartDate).toBeUndefined();
    expect(bare!.familyGroupInviteUrl).toBeUndefined();
    expect(bare!.updateForwarding).toBeUndefined();

    // `ready` is the public route to the seeding and backfill.
    await (db as unknown as { backfillSettingsDefaults(): Promise<void> }).backfillSettingsDefaults();

    const filled = await db.parentSettings.get('active_settings');
    expect(filled!.examSeriesStartDate).toBe('2027-05-10');
    expect(filled!.familyGroupInviteUrl).toContain('chat.whatsapp.com');
    // Without this, the forward options silently never appear.
    expect(filled!.updateForwarding?.toGroup).toBe(true);
  });

  it('never overwrites a value somebody set', async () => {
    await resetDatabase();
    await db.parentSettings.update('active_settings', {
      examSeriesStartDate: '2028-01-01',
      familyGroupInviteUrl: 'https://chat.whatsapp.com/THEIRS',
    });

    await (db as unknown as { backfillSettingsDefaults(): Promise<void> }).backfillSettingsDefaults();

    const settings = await db.parentSettings.get('active_settings');
    expect(settings!.examSeriesStartDate).toBe('2028-01-01');
    expect(settings!.familyGroupInviteUrl).toBe('https://chat.whatsapp.com/THEIRS');
  });
});

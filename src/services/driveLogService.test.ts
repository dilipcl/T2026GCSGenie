import { describe, it, expect } from 'vitest';
import { buildDriveLog, driveLogFileName, formatStamp } from './driveLogService';
import { ChangeLogEntry } from '../types';

function entry(over: Partial<ChangeLogEntry> & { summary: string }): ChangeLogEntry {
  return {
    id: over.summary,
    timestamp: new Date('2026-09-02T17:05:00').getTime(),
    date: '2026-09-02',
    actor: 'STUDENT',
    category: 'HOMEWORK',
    reported: false,
    ...over,
  };
}

const AT = new Date('2026-09-02T18:30:45');

describe('driveLogFileName', () => {
  /**
   * The name is the index. A folder of these has to sort chronologically as
   * plain text, or nobody can find last Tuesday without opening six files.
   */
  it('is dated, timed, and sorts chronologically as text', () => {
    expect(driveLogFileName(AT)).toBe('Genie-Updates-2026-09-02-1830.md');

    const names = [
      driveLogFileName(new Date('2026-09-02T09:05:00')),
      driveLogFileName(new Date('2026-09-02T18:30:00')),
      driveLogFileName(new Date('2026-10-01T08:00:00')),
    ];
    expect([...names].sort()).toEqual(names);
  });

  it('pads single-digit months, days and times', () => {
    expect(driveLogFileName(new Date('2026-01-05T07:09:00'))).toBe(
      'Genie-Updates-2026-01-05-0709.md'
    );
  });
});

describe('formatStamp', () => {
  it('writes a readable local date and time', () => {
    expect(formatStamp(AT)).toBe('2026-09-02 18:30:45');
  });
});

describe('buildDriveLog', () => {
  const entries = [
    entry({ summary: 'Finished "Trig past paper" (+50 XP)' }),
    entry({
      summary: 'Did chore "Bins" (+25 XP)',
      category: 'CHORE',
      timestamp: new Date('2026-09-02T18:01:00').getTime(),
    }),
    entry({
      summary: 'Cadets: Excused absence — Family outing',
      category: 'ATTENDANCE',
      detail: 'Dad’s birthday dinner',
      actor: 'PARENT',
      timestamp: new Date('2026-09-02T18:10:00').getTime(),
    }),
  ];

  it('names the student, the confirmation time and the batch size', () => {
    const file = buildDriveLog(entries, {
      settings: { studentName: 'Tejas Dilip' } as never,
      confirmedAt: AT,
    });

    expect(file.fileName).toBe('Genie-Updates-2026-09-02-1830.md');
    expect(file.content).toContain('**Student:** Tejas Dilip');
    expect(file.content).toContain('**Confirmed:** 2026-09-02 18:30:45');
    expect(file.content).toContain('**Updates in this batch:** 3');
  });

  it('groups entries under their category headings', () => {
    const file = buildDriveLog(entries, { confirmedAt: AT });
    expect(file.content).toContain('## 📚 Homework');
    expect(file.content).toContain('## 🧹 Chores');
    expect(file.content).toContain('## 🗓️ Attendance');
  });

  /**
   * When it happened and when it was signed off are different facts, and the
   * gap between them is occasionally the interesting one.
   */
  it('keeps the time each change actually happened', () => {
    const file = buildDriveLog(entries, { confirmedAt: AT });
    expect(file.content).toContain('**2026-09-02 17:05:00** — Finished "Trig past paper" (+50 XP)');
    expect(file.content).toContain('**2026-09-02 18:01:00** — Did chore "Bins" (+25 XP)');
  });

  it('carries the detail and says when a parent logged it', () => {
    const file = buildDriveLog(entries, { confirmedAt: AT });
    expect(file.content).toContain('Dad’s birthday dinner');
    expect(file.content).toContain('Logged by: parent');
  });

  it('includes the comment when one was written', () => {
    const file = buildDriveLog(entries, { confirmedAt: AT, comment: '  Busy evening  ' });
    expect(file.content).toContain('**Note:** Busy evening');
  });

  it('leaves the note line out when there is no comment', () => {
    expect(buildDriveLog(entries, { confirmedAt: AT }).content).not.toContain('**Note:**');
  });

  it('states the span when a batch covers more than one day', () => {
    const spanning = [
      ...entries,
      entry({ summary: 'Older thing', date: '2026-08-31' }),
    ];
    expect(buildDriveLog(spanning, { confirmedAt: AT }).content).toContain(
      '**Covering:** 2026-08-31 to 2026-09-02'
    );
  });

  it('states a single day plainly', () => {
    expect(buildDriveLog(entries, { confirmedAt: AT }).content).toContain(
      '**Covering:** 2026-09-02'
    );
  });

  it('falls back to a neutral name with no settings', () => {
    expect(buildDriveLog(entries, { confirmedAt: AT }).content).toContain('**Student:** Student');
  });

  it('produces a file even for a single entry', () => {
    const file = buildDriveLog([entries[0]], { confirmedAt: AT });
    expect(file.content).toContain('**Updates in this batch:** 1');
    expect(file.content.split('\n').length).toBeGreaterThan(5);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { emptyDatabase } from '../test/harness';
import { logAuditEvent } from './auditService';
import { buildActivityFeed } from './activityService';
import { diarySentence } from './dayDiary';
import { DayRecord } from './dayRecordService';
import { ActivityItem } from '../types';

/**
 * The feed as a diary.
 *
 * Sunday 11 Oct 2026 was thirty-three rows, led by "Changed checkinoccurrences
 * something". The day was four pieces of work, seven topics with their photos,
 * and a check-in. These hold both halves: the day reads as a sentence, and the
 * bookkeeping folds away without being lost.
 */

const record = (extra: Partial<DayRecord>): DayRecord => ({
  date: '2026-10-11',
  occurrences: [],
  answered: 0,
  work: [],
  attachments: [],
  notes: [],
  xp: 0,
  isEmpty: false,
  ...extra,
});

const created = (entityType: string): ActivityItem =>
  ({ entityType, action: 'CREATED', date: '2026-10-11' }) as ActivityItem;

describe('a day in one sentence', () => {
  it('says what the day was, in the order a parent asks', () => {
    const day = record({
      work: Array.from({ length: 4 }, (_, i) => ({
        taskId: `t${i}`,
        title: 'x',
        xp: 0,
        evidence: [],
        missingEvidence: false,
      })),
      attachments: Array.from({ length: 11 }, () => ({}) as DayRecord['attachments'][number]),
      checkIn: {} as DayRecord['checkIn'],
    });
    const topics = Array.from({ length: 7 }, () => created('Syllabus topic'));

    expect(diarySentence(day, 198, topics)).toBe(
      'Finished 4 pieces of work, 3.3h studied, added 7 topics, attached 11 files, checked in.'
    );
  });

  it('uses the singular for one', () => {
    const day = record({
      work: [
        {
          taskId: 't',
          title: 'x',
          xp: 0,
          evidence: [],
          missingEvidence: false,
        },
      ],
    });
    expect(diarySentence(day, 0, [created('Marked work')])).toBe(
      'Finished 1 piece of work, logged 1 marked paper.'
    );
  });

  it('says nothing about a day of pure bookkeeping', () => {
    expect(diarySentence(undefined, 0, [])).toBe('');
  });
});

describe('the rows under it', () => {
  beforeEach(async () => {
    await emptyDatabase();
  });

  it('never says "something", and names entities that had no label', async () => {
    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'checkInOccurrences',
      entityId: 'o1',
    });
    await logAuditEvent({
      user: 'PARENT',
      action: 'INSERT',
      entity: 'WeekPlanBaseline',
      entityId: 'w1',
    });

    const summaries = (await buildActivityFeed('PARENT')).items.map((i) => i.summary);
    expect(summaries).toContain('Changed a lesson answer');
    expect(summaries).toContain('Added a week plan');
    expect(summaries.join(' ')).not.toMatch(/something|checkinoccurrences/i);
  });

  it('folds bookkeeping away, and keeps the news', async () => {
    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'checkInOccurrences',
      entityId: 'o1',
    });
    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'Task',
      entityId: 't1',
      fieldChanged: 'topicId',
      oldValue: 'a',
      newValue: 'b',
    });
    await logAuditEvent({
      user: 'STUDENT',
      action: 'DELETE',
      entity: 'Task',
      entityId: 't2',
      oldValue: 'Essay',
    });

    const items = (await buildActivityFeed('PARENT')).items;
    expect(items.filter((i) => i.isRoutine)).toHaveLength(2);
    expect(items.find((i) => i.action === 'DELETED')?.isRoutine).toBe(false);
  });
});

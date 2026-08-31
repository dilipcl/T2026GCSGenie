import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { emptyDatabase } from '../test/harness';
import { logAuditEvent, logFieldChanges } from './auditService';
import { recordChange } from './changeLogService';
import { nameDevice, people } from './deviceRegistryService';
import { buildActivityFeed, groupByDay, outstanding } from './activityService';
import { getDeviceId } from '../utils/device';
import { Goal } from '../types';

/**
 * These tests are written against the session that exposed the gap.
 *
 * On 30 August 2026 Tejas deleted four tasks and three syllabus topics, revised
 * two grade targets downwards and checked in once. The Updates tab showed five
 * lines and mentioned none of the deletions, because `changeLog` is only
 * written by the confirmation sheet and deletions do not pass through it.
 *
 * Every assertion below is a fact about that session. If the feed stops
 * reporting deletions, or stops attributing them, these fail.
 */

beforeEach(async () => {
  await emptyDatabase();
});

/** Reproduces the shape of the 30 August session. */
async function seedRealSession() {
  await logAuditEvent({
    user: 'STUDENT',
    action: 'DELETE',
    entity: 'Task',
    entityId: 'task_cs_networks',
    oldValue: 'OCR CS Network Protocols (TCP/IP 4-Layer Model) [computer_science, due 2026-08-31]',
  });

  await logAuditEvent({
    user: 'STUDENT',
    action: 'DELETE',
    entity: 'SyllabusTopic',
    entityId: 'topic_art_ao2',
    oldValue: 'AO2: Creative Media Experimentation & Refinement',
  });

  await logFieldChanges({
    user: 'STUDENT',
    entity: 'Goal',
    entityId: 'goal_cs',
    before: { title: 'Achieve Grade 9 in OCR Computer Science', weeklyHoursRequired: 3.5 },
    after: { title: 'Achieve Grade 7+ in Computer Science', weeklyHoursRequired: 3 },
    labels: { weeklyHoursRequired: 'weekly hours' },
  });
}

describe('the deletions that the Updates tab used to miss', () => {
  it('reports a deleted task, which changeLog never recorded', async () => {
    await seedRealSession();

    const feed = await buildActivityFeed('PARENT');
    const deletions = feed.items.filter((i) => i.action === 'DELETED');

    expect(deletions).toHaveLength(2);
    expect(deletions.map((d) => d.summary)).toContain(
      'Deleted task “OCR CS Network Protocols (TCP/IP 4-Layer Model)”'
    );
  });

  it('names the deleted syllabus topic rather than saying "a record"', async () => {
    await seedRealSession();

    const feed = await buildActivityFeed('PARENT');
    const topic = feed.items.find((i) => i.entityType === 'Syllabus topic');

    expect(topic?.summary).toBe(
      'Deleted syllabus topic “AO2: Creative Media Experimentation & Refinement”'
    );
  });

  it('shows a downgraded grade target as a before and after', async () => {
    await seedRealSession();

    const feed = await buildActivityFeed('PARENT');
    const retitle = feed.items.find((i) => i.fieldChanged === 'title');

    expect(retitle?.detail).toBe(
      'Achieve Grade 9 in OCR Computer Science → Achieve Grade 7+ in Computer Science'
    );
  });

  it('counts every write, not just the confirmable ones', async () => {
    await seedRealSession();
    await recordChange({
      category: 'CHECK_IN',
      summary: 'Checked in (energy 2/5, 30 min studied) — +20 XP',
      actor: 'STUDENT',
    });

    const feed = await buildActivityFeed('PARENT');

    // 2 deletes + 2 field changes + 1 uncorrelated check-in
    expect(feed.items).toHaveLength(5);
  });
});

describe('who did it', () => {
  it('uses the device label once the device has been named', async () => {
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'Task',
      entityId: 'task_1',
      newValue: 'Logic Gate revision [computer_science]',
    });

    // Registration is synthesised from the log, then renamed.
    await buildActivityFeed('PARENT');
    await nameDevice(getDeviceId(), "Tejas's phone");

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].actorLabel).toBe("Tejas's phone");
  });

  it('falls back to the role when a row predates device ids', async () => {
    const entry = await logAuditEvent({
      user: 'PARENT',
      action: 'UPDATE',
      entity: 'RewardItem',
      entityId: 'reward_1',
      fieldChanged: 'isArchived',
      oldValue: 'false',
      newValue: 'true',
    });
    // Older rows genuinely have no deviceId.
    await db.auditLogs.update(entry.id, { deviceId: '' });

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].actorLabel).toBe('Parent');
  });
});

describe('what the student is allowed to see', () => {
  it('hides a passphrase change from the student but shows it to a parent', async () => {
    await logAuditEvent({
      user: 'PARENT',
      action: 'UPDATE',
      entity: 'ParentSettings',
      entityId: 'active_settings',
      fieldChanged: 'parentCredential',
      newValue: 'Parent passphrase set for the first time',
    });

    const asParent = await buildActivityFeed('PARENT');
    const asStudent = await buildActivityFeed('STUDENT');

    expect(asParent.items).toHaveLength(1);
    expect(asStudent.items).toHaveLength(0);
    expect(asStudent.hiddenByVisibility).toBe(1);
  });

  it('hides a sanction from the student', async () => {
    await logAuditEvent({
      user: 'PARENT',
      action: 'SANCTION_FREEZE',
      entity: 'Sanction',
      entityId: 'sanction_1',
      newValue: 'Shop frozen',
    });

    const asStudent = await buildActivityFeed('STUDENT');
    expect(asStudent.items).toHaveLength(0);
  });

  it('still shows the student a parent approving their goal', async () => {
    await logAuditEvent({
      user: 'PARENT',
      action: 'UPDATE',
      entity: 'Goal',
      entityId: 'goal_maths',
      fieldChanged: 'status',
      oldValue: 'PENDING_DISCUSSION',
      newValue: 'APPROVED_LOCKED',
    });

    const asStudent = await buildActivityFeed('STUDENT');
    expect(asStudent.items).toHaveLength(1);
  });
});

describe('changes that are not finished yet', () => {
  it('marks a goal awaiting approval as waiting on a parent', async () => {
    await db.goals.add({
      id: 'goal_cs',
      title: 'Achieve Grade 7+ in Computer Science',
      category: 'ACADEMIC_GRADE_9',
      smartSpecific: '',
      smartMeasurable: '',
      smartAchievable: '',
      smartRealistic: '',
      smartTimeBound: '',
      status: 'PENDING_DISCUSSION',
      ragStatus: 'AMBER',
      weeklyHoursRequired: 3,
      createdAt: Date.now(),
    });

    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'Goal',
      entityId: 'goal_cs',
      fieldChanged: 'status',
      oldValue: 'DRAFT',
      newValue: 'PENDING_DISCUSSION',
    });

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].pending).toMatchObject({
      kind: 'GOAL_APPROVAL',
      label: 'Waiting for a parent to approve',
      waitingOn: 'PARENT',
    });
    expect(outstanding(feed.items)).toHaveLength(1);
  });

  it('stops advertising a goal as pending once it is approved', async () => {
    await db.goals.add({
      id: 'goal_cs',
      title: 'Achieve Grade 7+ in Computer Science',
      category: 'ACADEMIC_GRADE_9',
      smartSpecific: '',
      smartMeasurable: '',
      smartAchievable: '',
      smartRealistic: '',
      smartTimeBound: '',
      status: 'APPROVED_LOCKED',
      ragStatus: 'GREEN',
      weeklyHoursRequired: 3,
      lockedAt: Date.now(),
      createdAt: Date.now(),
    });

    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'Goal',
      entityId: 'goal_cs',
      fieldChanged: 'status',
      oldValue: 'DRAFT',
      newValue: 'PENDING_DISCUSSION',
    });

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].pending?.resolvedAt).toBeDefined();
    expect(outstanding(feed.items)).toHaveLength(0);
  });

  it('flags an update that was never signed off', async () => {
    await recordChange({
      category: 'ATTENDANCE',
      summary: 'School on 2026-08-31: Cancelled by organiser',
      actor: 'STUDENT',
    });

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].pending?.kind).toBe('CONFIRMATION');
  });
});

describe('filtering', () => {
  it('filters to a single day', async () => {
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'Task',
      entityId: 't1',
      newValue: 'Today task',
    });

    const feed = await buildActivityFeed('PARENT');
    const today = feed.items[0].date;

    const onDay = await buildActivityFeed('PARENT', { onDate: today });
    const otherDay = await buildActivityFeed('PARENT', { onDate: '2020-01-01' });

    expect(onDay.items).toHaveLength(1);
    expect(otherDay.items).toHaveLength(0);
  });

  it('filters by action, so "what got deleted" is one tap', async () => {
    await seedRealSession();

    const deletes = await buildActivityFeed('PARENT', { actions: ['DELETED'] });
    expect(deletes.items).toHaveLength(2);
    expect(deletes.items.every((i) => i.action === 'DELETED')).toBe(true);
  });

  it('searches summary text', async () => {
    await seedRealSession();

    const hits = await buildActivityFeed('PARENT', { search: 'network protocols' });
    expect(hits.items).toHaveLength(1);
  });

  it('groups into days newest first', async () => {
    await seedRealSession();

    const feed = await buildActivityFeed('PARENT');
    const days = groupByDay(feed.items);

    expect(days).toHaveLength(1);
    expect(days[0].items.length).toBe(feed.items.length);
  });
});

describe('correlation with the human log', () => {
  it('prefers the human sentence over the generated one', async () => {
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'DailyCheckIn',
      entityId: 'checkin_1',
      newValue: '[EVENING] Energy: 2, Focus: NORMAL',
    });
    await recordChange({
      category: 'CHECK_IN',
      summary: 'Checked in (energy 2/5, 30 min studied) — +20 XP',
      actor: 'STUDENT',
      entity: 'DailyCheckIn',
      entityId: 'checkin_1',
    });

    const feed = await buildActivityFeed('PARENT');

    // One event, not two: the two logs describe the same action.
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].summary).toBe('Checked in (energy 2/5, 30 min studied) — +20 XP');
  });

  it('does not let two near-simultaneous events swap wording', async () => {
    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'Goal',
      entityId: 'goal_cadets',
      fieldChanged: 'status',
      oldValue: 'DRAFT',
      newValue: 'PENDING_DISCUSSION',
    });
    await recordChange({
      category: 'GOAL',
      summary: 'Sent goal "Air Cadets Leadership & Skills Milestone" for approval (6 hrs/week)',
      actor: 'STUDENT',
      entity: 'Goal',
      entityId: 'goal_cadets',
    });
    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'Goal',
      entityId: 'goal_maths',
      fieldChanged: 'status',
      oldValue: 'DRAFT',
      newValue: 'PENDING_DISCUSSION',
    });
    await recordChange({
      category: 'GOAL',
      summary: 'Sent goal "Achieve Grade 8 in Edexcel Mathematics" for approval (4 hrs/week)',
      actor: 'STUDENT',
      entity: 'Goal',
      entityId: 'goal_maths',
    });

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items).toHaveLength(2);

    const cadets = feed.items.find((i) => i.entityId === 'goal_cadets');
    expect(cadets?.summary).toContain('Air Cadets');
  });
});

describe('wording generated from the audit log', () => {
  it('keeps parentheses that are part of a real title', async () => {
    // Stripping every trailing "(...)" turned this into "OCR CS Network
    // Protocols" - half a title is worse than a stray status token.
    await logAuditEvent({
      user: 'STUDENT',
      action: 'DELETE',
      entity: 'Task',
      entityId: 'task_cs',
      oldValue: 'OCR CS Network Protocols (TCP/IP 4-Layer Model) [computer_science]',
    });

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].summary).toBe(
      'Deleted task “OCR CS Network Protocols (TCP/IP 4-Layer Model)”'
    );
  });

  it('strips a machine status tail but not a descriptive one', async () => {
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'Goal',
      entityId: 'goal_art',
      newValue: 'Get a 7 or higher in Art (3h/wk, PENDING_DISCUSSION)',
    });

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].summary).toBe('Added goal “Get a 7 or higher in Art”');
  });

  it('does not prefix a second verb onto a value that is already prose', async () => {
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'SyllabusTopic',
      entityId: 'topic_cw',
      newValue: 'Added Year 10 Topic: Cold War (USA and USSR)',
    });

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].summary).toBe('Added Year 10 Topic: Cold War (USA and USSR)');
  });
});

describe('one person, several devices', () => {
  /**
   * The shape this family is already in: one person has written under two
   * device ids and two roles, because the laptop was used in student mode for
   * testing and parent mode afterwards. Add a phone to that and "what did Tejas
   * change" has to still have an answer.
   */
  async function writeFromDevice(
    deviceId: string,
    user: 'STUDENT' | 'PARENT',
    title: string
  ) {
    const entry = await logAuditEvent({
      user,
      action: 'INSERT',
      entity: 'Task',
      entityId: `task_${title}`,
      newValue: title,
    });
    await db.auditLogs.update(entry.id, { deviceId });
  }

  it('groups a person across their phone and laptop', async () => {
    await writeFromDevice('dev_phone', 'STUDENT', 'Physics on the bus');
    await writeFromDevice('dev_laptop', 'STUDENT', 'Maths at the desk');
    await writeFromDevice('dev_parent', 'PARENT', 'Approved a goal');

    // Both of Tejas's devices get claimed by the same person.
    await buildActivityFeed('PARENT');
    await nameDevice('dev_phone', "Tejas's phone", 'Tejas');
    await nameDevice('dev_laptop', "Tejas's laptop", 'Tejas');
    await nameDevice('dev_parent', "Dad's laptop", 'Dad');

    const everyone = await people();
    expect(everyone.map((p) => p.name).sort()).toEqual(['Dad', 'Tejas']);
    expect(everyone.find((p) => p.name === 'Tejas')?.deviceIds.sort()).toEqual([
      'dev_laptop',
      'dev_phone',
    ]);
  });

  it('filters by person across both of their devices at once', async () => {
    await writeFromDevice('dev_phone', 'STUDENT', 'Physics on the bus');
    await writeFromDevice('dev_laptop', 'STUDENT', 'Maths at the desk');
    await writeFromDevice('dev_parent', 'PARENT', 'Approved a goal');

    await buildActivityFeed('PARENT');
    await nameDevice('dev_phone', "Tejas's phone", 'Tejas');
    await nameDevice('dev_laptop', "Tejas's laptop", 'Tejas');
    await nameDevice('dev_parent', "Dad's laptop", 'Dad');

    const his = await buildActivityFeed('PARENT', { people: ['Tejas'] });

    expect(his.items).toHaveLength(2);
    // Two devices, one person - the whole point.
    expect(new Set(his.items.map((i) => i.deviceId))).toEqual(
      new Set(['dev_phone', 'dev_laptop'])
    );
    expect(his.items.every((i) => i.actorPerson === 'Tejas')).toBe(true);
  });

  it('still names the device, so a shared laptop is not mistaken for a person', async () => {
    await writeFromDevice('dev_laptop', 'STUDENT', 'Maths at the desk');
    await buildActivityFeed('PARENT');
    await nameDevice('dev_laptop', "Tejas's laptop", 'Tejas');

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].actorPerson).toBe('Tejas');
    expect(feed.items[0].actorLabel).toBe("Tejas's laptop");
  });

  it('keeps an unclaimed device usable, grouped under its own label', async () => {
    await writeFromDevice('dev_mystery', 'STUDENT', 'Something');

    const feed = await buildActivityFeed('PARENT');
    expect(feed.items[0].actorPerson).toBeUndefined();
    expect(feed.items[0].actorLabel).toContain('Student device');
  });
});

describe('what counts as still waiting', () => {
  async function goalWith(status: Goal['status'], lockedAt?: number) {
    await db.goals.add({
      id: 'goal_maths',
      title: 'Achieve Grade 9 in Edexcel Mathematics',
      category: 'ACADEMIC_GRADE_9',
      smartSpecific: '', smartMeasurable: '', smartAchievable: '',
      smartRealistic: '', smartTimeBound: '',
      status,
      ragStatus: 'GREEN',
      weeklyHoursRequired: 4,
      lockedAt,
      createdAt: Date.now(),
    });

    await logAuditEvent({
      user: 'STUDENT',
      action: 'UPDATE',
      entity: 'Goal',
      entityId: 'goal_maths',
      fieldChanged: 'status',
      oldValue: 'DRAFT',
      newValue: 'PENDING_DISCUSSION',
    });
  }

  it('does not count an approved goal as waiting when lockedAt is missing', async () => {
    // Seen live: the row read "Approved and locked" and was still listed under
    // "things still waiting", because resolution was inferred from a timestamp
    // that had never been set.
    await goalWith('APPROVED_LOCKED', undefined);

    const feed = await buildActivityFeed('PARENT');

    expect(feed.items[0].pending?.resolved).toBe(true);
    expect(outstanding(feed.items)).toHaveLength(0);
  });

  it('still counts a goal genuinely awaiting approval', async () => {
    await goalWith('PENDING_DISCUSSION');

    const feed = await buildActivityFeed('PARENT');

    expect(feed.items[0].pending?.resolved).toBe(false);
    expect(outstanding(feed.items)).toHaveLength(1);
  });

  it('excludes resolved rows from the pendingOnly filter', async () => {
    await goalWith('APPROVED_LOCKED', undefined);

    const onlyPending = await buildActivityFeed('PARENT', { pendingOnly: true });
    expect(onlyPending.items).toHaveLength(0);
  });
});

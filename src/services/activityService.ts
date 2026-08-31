import { db } from '../db';
import {
  ActivityAttachmentLink,
  ActivityItem,
  ActivityVisibility,
  AuditLogEntry,
  ChangeCategory,
  ChangeLogEntry,
  DeviceRegistration,
  PendingStep,
  SubjectId,
  UserRole,
} from '../types';
import { toLocalISODate } from '../utils/date';
import { describeActor, deviceLabelMap } from './deviceRegistryService';

/**
 * One feed of everything that has happened, assembled from the two logs that
 * already exist.
 *
 * The app has kept two records since August 2026 and neither one answers the
 * question a family actually asks.
 *
 * `auditLogs` is complete - every insert, update and delete goes through
 * `logAuditEvent` - but it is written for verification, not for reading. It is
 * hash-chained, so it cannot be edited to read more nicely without destroying
 * the property it exists for, and its viewer was capped at the newest 50 rows
 * behind a passphrase.
 *
 * `changeLog` is written for people, but only records what passed through a
 * confirmation sheet: eight categories, all of them additive. On 30 August that
 * meant a session in which Tejas deleted four tasks and three syllabus topics
 * and revised two grade targets downwards produced five log lines, none of
 * which mentioned a deletion. The Updates tab was not wrong; it was reporting
 * on a different, smaller thing than anyone believed.
 *
 * So this merges them at read time rather than migrating either. The audit log
 * is the backbone, because it is the complete one. Where a `changeLog` entry
 * describes the same action, its wording and its sign-off state are folded onto
 * the audit row - a human sentence is better than a generated one, and the
 * confirmed/reported flags only exist over there.
 *
 * Nothing here writes to `auditLogs`. That is deliberate and load-bearing.
 */

/**
 * How far apart a changeLog row and its audit row may sit and still be treated
 * as the same event, when there is no entity id to match on.
 *
 * Deliberately tight. This path only runs for rows written before changeLog
 * recorded what it was about, and a wide window on legacy data means two
 * same-category actions in quick succession can trade summaries - which is a
 * worse failure than simply showing both rows separately.
 */
const CORRELATION_WINDOW_MS = 2_500;

/** Entity names as they appear in `logAuditEvent` calls, in words. */
const ENTITY_LABEL: Record<string, string> = {
  Task: 'Task',
  Goal: 'Goal',
  SyllabusTopic: 'Syllabus topic',
  DailyCheckIn: 'Check-in',
  CommitmentException: 'Attendance',
  Assessment: 'Marked work',
  RemediationAction: 'Fix-up quest',
  Milestone: 'Key date',
  RewardItem: 'Reward',
  RewardRedemption: 'Reward request',
  Sanction: 'Sanction',
  ParentSettings: 'Settings',
  StudentProfile: 'Profile',
  AgentAuditReport: 'AI audit',
  TimetableEntry: 'Timetable lesson',
  Chore: 'Chore',
  ChoreCompletion: 'Chore',
  ImprovementIdea: 'Improvement',
};

/** Which changeLog category best describes an audit row, for filtering. */
const ENTITY_CATEGORY: Record<string, ChangeCategory> = {
  Task: 'HOMEWORK',
  DailyCheckIn: 'CHECK_IN',
  CommitmentException: 'ATTENDANCE',
  Goal: 'GOAL',
  RewardItem: 'REWARD',
  RewardRedemption: 'REWARD',
  Assessment: 'PROOF',
  Chore: 'CHORE',
  ChoreCompletion: 'CHORE',
};

/**
 * Rows the student must not see.
 *
 * Two kinds, for two different reasons. A passphrase change is a security
 * action and showing it to the person the passphrase is protecting against is
 * self-defeating. A sanction is a discipline action, and an app that announces
 * one on a phone before a parent has had the conversation turns that
 * conversation into an ambush - which is precisely the dynamic this app was
 * built to defuse.
 *
 * Everything else about schoolwork is shared, including every parent approval,
 * every reward change and every settings edit that is not a credential.
 */
function classifyVisibility(entry: AuditLogEntry): ActivityVisibility {
  if (entry.action === 'SANCTION_FREEZE') return 'PARENT_ONLY';
  if (entry.entity === 'Sanction') return 'PARENT_ONLY';

  const field = (entry.fieldChanged || '').toLowerCase();
  if (entry.entity === 'ParentSettings' && /credential|passphrase|pin|lockout/.test(field)) {
    return 'PARENT_ONLY';
  }
  return 'EVERYONE';
}

function mapAction(entry: AuditLogEntry): ActivityItem['action'] {
  switch (entry.action) {
    case 'INSERT':
      return 'CREATED';
    case 'UPDATE':
      return 'UPDATED';
    case 'DELETE':
      return 'DELETED';
    default:
      return 'SYSTEM';
  }
}

/**
 * Trims the metadata an audit value carries for machines.
 *
 * Values arrive in two shapes depending on which call site wrote them:
 * `Title [maths, due 2026-08-31]` and `Title (3h/wk, PENDING_DISCUSSION)`. Both
 * are useful in the raw log and both read as noise in a sentence.
 */
/**
 * A trailing parenthetical that is machine metadata rather than part of a name.
 *
 * Deliberately narrow. An earlier version stripped every trailing `(...)` and
 * turned "OCR CS Network Protocols (TCP/IP 4-Layer Model)" into "OCR CS Network
 * Protocols" - parentheses are ordinary punctuation in a real title, and losing
 * half the title is a worse outcome than keeping a status token. So this only
 * fires on the shapes the audit call sites actually emit: an ALL_CAPS status, a
 * weekly-hours figure, or a due date.
 */
const METADATA_TAIL = /\s*\((?=[^)]*(?:[A-Z]{3,}_[A-Z]|\d+\s*h\/wk|due\s))[^)]*\)\s*$/;

/** Trims the metadata an audit value carries for machines. */
function stripMetadata(value: string): string {
  return value.replace(/\s*\[[^\]]*\]\s*$/, '').replace(METADATA_TAIL, '').trim();
}

/**
 * Whether a value is already a sentence rather than a name.
 *
 * Some call sites write `newValue` as prose - "Added Year 10 Topic: Cold War",
 * "Proposed goal: Get a 7 or higher in Art". Wrapping those produces "Added
 * syllabus topic “Added Year 10 Topic: ...”", which is how this read on real
 * data before the check existed.
 */
const SENTENCE_PREFIX =
  /^(Added|Proposed|Generated|Removed|Deleted|Updated|Created|Parent|Shop|Reward|Checked|Sent)\b/;

function readsAsSentence(value: string): boolean {
  return SENTENCE_PREFIX.test(value.trim());
}

function quote(value: string): string {
  const clean = stripMetadata(value);
  return clean ? `“${clean}”` : '';
}

/**
 * Turns one audit row into a sentence.
 *
 * Used whenever no `changeLog` entry covers the same action - which, before
 * this existed, was 22 of the 27 rows in this database.
 */
function summariseAuditEntry(entry: AuditLogEntry): { summary: string; detail?: string } {
  const noun = ENTITY_LABEL[entry.entity] || entry.entity;

  if (entry.action === 'AGENT_AUDIT') {
    return { summary: `Genie ran an AI audit`, detail: entry.newValue || undefined };
  }
  if (entry.action === 'SANCTION_FREEZE') {
    return { summary: 'Reward shop frozen by a parent', detail: entry.newValue || undefined };
  }
  if (entry.action === 'REWARD_REDEEM') {
    return { summary: `Reward requested`, detail: entry.newValue || undefined };
  }

  if (entry.action === 'INSERT') {
    const raw = (entry.newValue || '').trim();
    const trimmed = stripMetadata(raw);
    const detail = trimmed !== raw ? raw : undefined;

    // Already prose - use it rather than prefixing a second verb onto it.
    if (readsAsSentence(trimmed)) return { summary: trimmed, detail };

    return {
      summary: trimmed
        ? `Added ${noun.toLowerCase()} ${quote(raw)}`
        : `Added a ${noun.toLowerCase()}`,
      detail,
    };
  }

  if (entry.action === 'DELETE') {
    const what = quote(entry.oldValue || '');
    return {
      summary: what
        ? `Deleted ${noun.toLowerCase()} ${what}`
        : `Deleted a ${noun.toLowerCase()}`,
      detail: entry.oldValue?.trim() || undefined,
    };
  }

  // UPDATE
  const field = entry.fieldChanged || 'something';
  const from = entry.oldValue ?? '';
  const to = entry.newValue ?? '';
  if (from && to) {
    return {
      summary: `Changed ${noun.toLowerCase()} ${field}`,
      detail: `${from} → ${to}`,
    };
  }
  return { summary: `Changed ${noun.toLowerCase()} ${field}`, detail: to || from || undefined };
}

/**
 * Correlates a changeLog row to the audit row describing the same action.
 *
 * Greedy nearest-match inside a short window, with claiming, because two goal
 * submissions three seconds apart would otherwise both match both audit rows
 * and one of them would end up with the other's wording.
 */
function correlate(
  changes: ChangeLogEntry[],
  audits: AuditLogEntry[]
): Map<string, ChangeLogEntry> {
  const byAuditId = new Map<string, ChangeLogEntry>();
  const claimed = new Set<string>();

  /**
   * Pass one: exact. A changeLog row that knows its entity id pairs with the
   * audit row for that same record, nearest in time. No ambiguity is possible,
   * which is the entire reason `entityId` was added.
   */
  const withEntity = changes.filter((c) => !!c.entityId);
  for (const change of withEntity.sort((a, b) => a.timestamp - b.timestamp)) {
    let best: AuditLogEntry | undefined;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const audit of audits) {
      if (claimed.has(audit.id)) continue;
      if (audit.entityId !== change.entityId) continue;
      const delta = Math.abs(audit.timestamp - change.timestamp);
      if (delta < bestDelta) {
        best = audit;
        bestDelta = delta;
      }
    }

    if (best) {
      claimed.add(best.id);
      byAuditId.set(best.id, change);
    }
  }

  /**
   * Pass two: legacy. Rows predating `entityId` have only a category and a
   * timestamp. Both must line up - an audit entity with no category mapping can
   * never be claimed this way, so a deleted syllabus topic will not absorb the
   * wording of an unrelated check-in that happened in the same second.
   */
  const withoutEntity = changes.filter((c) => !c.entityId);
  for (const change of withoutEntity.sort((a, b) => a.timestamp - b.timestamp)) {
    let best: AuditLogEntry | undefined;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const audit of audits) {
      if (claimed.has(audit.id)) continue;
      const expected = ENTITY_CATEGORY[audit.entity];
      if (!expected || expected !== change.category) continue;
      const delta = Math.abs(audit.timestamp - change.timestamp);
      if (delta > CORRELATION_WINDOW_MS) continue;
      if (delta < bestDelta) {
        best = audit;
        bestDelta = delta;
      }
    }

    if (best) {
      claimed.add(best.id);
      byAuditId.set(best.id, change);
    }
  }

  return byAuditId;
}

/**
 * What still has to happen for this change to be finished.
 *
 * Resolved against current state rather than stored, so a goal approved last
 * week stops advertising itself as pending without anyone having to rewrite the
 * history that recorded the request.
 */
async function derivePending(
  entry: AuditLogEntry,
  change: ChangeLogEntry | undefined
): Promise<PendingStep | undefined> {
  if (entry.entity === 'Goal' && /status/i.test(entry.fieldChanged || '')) {
    if (/PENDING_DISCUSSION/.test(entry.newValue || '')) {
      const goal = await db.goals.get(entry.entityId);
      if (!goal) return undefined;
      if (goal.status === 'PENDING_DISCUSSION') {
        return {
          kind: 'GOAL_APPROVAL',
          label: 'Waiting for a parent to approve',
          waitingOn: 'PARENT',
        };
      }
      return {
        kind: 'GOAL_APPROVAL',
        label: 'Approved and locked',
        waitingOn: 'PARENT',
        resolvedAt: goal.lockedAt,
        resolvedNote:
          goal.status === 'APPROVED_LOCKED'
            ? `Locked at ${goal.weeklyHoursRequired} hrs/week`
            : `Now ${goal.status.toLowerCase().replace(/_/g, ' ')}`,
      };
    }
  }

  if (entry.entity === 'RewardRedemption' || entry.action === 'REWARD_REDEEM') {
    const redemption = await db.redemptions.get(entry.entityId);
    if (redemption && redemption.status === 'PENDING') {
      return {
        kind: 'REWARD_APPROVAL',
        label: 'Waiting for a parent to approve',
        waitingOn: 'PARENT',
      };
    }
  }

  /**
   * A confirmed-at-the-point-of-action entry that was never signed off on the
   * Updates tab. It happened - the write went through - but nobody has read it
   * back and put it on the record, which is the step that makes it reportable.
   */
  if (change && !change.confirmedAt) {
    return {
      kind: 'CONFIRMATION',
      label: 'Not signed off yet',
      waitingOn: change.actor,
    };
  }

  return undefined;
}

/** Files attached to the record this row is about. */
async function attachmentsFor(entityId: string): Promise<ActivityAttachmentLink[] | undefined> {
  if (!entityId) return undefined;
  const rows = await db.attachments.where('ownerId').equals(entityId).toArray();
  if (rows.length === 0) return undefined;

  return rows.map((a) => ({
    attachmentId: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    byteSize: a.byteSize,
    driveFileId: a.driveFileId,
    driveViewUrl: a.driveViewUrl,
    /**
     * Saved into Drive but with no URL - the folder transport cannot learn the
     * id Drive assigns. Distinct from "not backed up", and the UI says so.
     */
    mirroredWithoutLink: !!a.driveMirroredAt && !a.driveViewUrl,
  }));
}

/**
 * Works out which subject a row concerns, for the subject filter.
 *
 * Looked up from the live record rather than parsed out of the audit text,
 * because the audit text is a human summary and was never meant to be machine
 * -readable. A deleted record simply has no subject, which is correct - there is
 * nothing left to attribute it to.
 */
async function subjectFor(entry: AuditLogEntry): Promise<SubjectId | undefined> {
  switch (entry.entity) {
    case 'Task':
      return (await db.tasks.get(entry.entityId))?.subjectId;
    case 'Goal':
      return (await db.goals.get(entry.entityId))?.subjectId;
    case 'SyllabusTopic':
      return (await db.syllabusTopics.get(entry.entityId))?.subjectId;
    case 'Assessment':
      return (await db.assessments.get(entry.entityId))?.subjectId;
    case 'RemediationAction':
      return (await db.remediations.get(entry.entityId))?.subjectId;
    case 'DailyCheckIn':
      return (await db.checkIns.get(entry.entityId))?.studySubjectId;
    default:
      return undefined;
  }
}

export interface ActivityFilter {
  /** Inclusive YYYY-MM-DD bounds. */
  fromDate?: string;
  toDate?: string;
  /** Exactly one day; overrides from/to when set. */
  onDate?: string;
  /**
   * Filter by person rather than device. This is the one people actually want:
   * a person routinely uses more than one device, and ticking each of their
   * device labels individually is not a filter anyone will use twice.
   */
  people?: string[];
  deviceIds?: string[];
  roles?: UserRole[];
  actions?: ActivityItem['action'][];
  categories?: ChangeCategory[];
  subjectIds?: SubjectId[];
  /** Only rows still waiting on somebody. */
  pendingOnly?: boolean;
  /** Free-text over summary and detail. */
  search?: string;
}

export interface ActivityFeed {
  items: ActivityItem[];
  devices: DeviceRegistration[];
  /** Everything before visibility and filters were applied, for honest counts. */
  totalBeforeFilters: number;
  /** How many rows the current viewer is not allowed to see. */
  hiddenByVisibility: number;
}

/**
 * Builds the whole feed.
 *
 * Reads both logs in full. That is affordable - this database holds tens of
 * rows, not millions - and the alternative, paging at the query layer, is what
 * produced the Parent Portal's silent `limit(50)`: a viewer that looked complete
 * and was not.
 */
export async function buildActivityFeed(
  viewerRole: UserRole,
  filter: ActivityFilter = {}
): Promise<ActivityFeed> {
  const [audits, changes, devices] = await Promise.all([
    db.auditLogs.toArray(),
    db.changeLog.toArray(),
    deviceLabelMap(),
  ]);

  const correlated = correlate(changes, audits);
  const usedChangeIds = new Set([...correlated.values()].map((c) => c.id));

  const items: ActivityItem[] = [];

  for (const entry of audits) {
    const change = correlated.get(entry.id);
    const generated = summariseAuditEntry(entry);
    const [pending, attachments, subjectId] = await Promise.all([
      derivePending(entry, change),
      attachmentsFor(entry.entityId),
      subjectFor(entry),
    ]);

    items.push({
      id: entry.id,
      timestamp: entry.timestamp,
      date: toLocalISODate(new Date(entry.timestamp)),
      actorRole: entry.user,
      deviceId: entry.deviceId,
      actorLabel: describeActor(entry.user, entry.deviceId, devices).label,
      actorPerson: describeActor(entry.user, entry.deviceId, devices).person,
      action: mapAction(entry),
      entityType: ENTITY_LABEL[entry.entity] || entry.entity,
      entityId: entry.entityId,
      // A human sentence beats a generated one wherever one exists.
      summary: change?.summary || generated.summary,
      detail: change?.detail || generated.detail,
      fieldChanged: entry.fieldChanged,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      subjectId,
      category: change?.category || ENTITY_CATEGORY[entry.entity],
      visibility: classifyVisibility(entry),
      pending,
      attachments,
      confirmedAt: change?.confirmedAt,
      reportedAt: change?.reportedAt,
      source: 'AUDIT',
    });
  }

  /**
   * changeLog rows with no audit counterpart.
   *
   * Should be rare - anything that writes should also audit - but a row that
   * exists in only one log is exactly the kind of thing worth showing rather
   * than dropping, and dropping it silently is how the original gap survived
   * this long.
   */
  for (const change of changes) {
    if (usedChangeIds.has(change.id)) continue;
    items.push({
      id: change.id,
      timestamp: change.timestamp,
      date: change.date,
      actorRole: change.actor,
      actorLabel: describeActor(change.actor, undefined, devices).label,
      action: 'CONFIRMED',
      entityType: 'Update',
      entityId: change.id,
      summary: change.summary,
      detail: change.detail,
      category: change.category,
      visibility: 'EVERYONE',
      pending: change.confirmedAt
        ? undefined
        : { kind: 'CONFIRMATION', label: 'Not signed off yet', waitingOn: change.actor },
      confirmedAt: change.confirmedAt,
      reportedAt: change.reportedAt,
      source: 'CHANGE_LOG',
    });
  }

  items.sort((a, b) => b.timestamp - a.timestamp);

  const totalBeforeFilters = items.length;

  const visible =
    viewerRole === 'PARENT'
      ? items
      : items.filter((i) => i.visibility === 'EVERYONE');
  const hiddenByVisibility = totalBeforeFilters - visible.length;

  return {
    items: applyFilter(visible, filter),
    devices: [...devices.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    totalBeforeFilters,
    hiddenByVisibility,
  };
}

export function applyFilter(items: ActivityItem[], filter: ActivityFilter): ActivityItem[] {
  const search = filter.search?.trim().toLowerCase();

  return items.filter((item) => {
    if (filter.onDate && item.date !== filter.onDate) return false;
    if (!filter.onDate) {
      if (filter.fromDate && item.date < filter.fromDate) return false;
      if (filter.toDate && item.date > filter.toDate) return false;
    }
    if (filter.people?.length && (!item.actorPerson || !filter.people.includes(item.actorPerson)))
      return false;
    if (filter.deviceIds?.length && (!item.deviceId || !filter.deviceIds.includes(item.deviceId)))
      return false;
    if (filter.roles?.length && !filter.roles.includes(item.actorRole)) return false;
    if (filter.actions?.length && !filter.actions.includes(item.action)) return false;
    if (filter.categories?.length && (!item.category || !filter.categories.includes(item.category)))
      return false;
    if (
      filter.subjectIds?.length &&
      (!item.subjectId || !filter.subjectIds.includes(item.subjectId))
    )
      return false;
    if (filter.pendingOnly && (!item.pending || item.pending.resolvedAt)) return false;
    if (search) {
      const haystack = `${item.summary} ${item.detail ?? ''} ${item.actorLabel}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export interface ActivityDay {
  date: string;
  items: ActivityItem[];
}

/** Groups a feed into days, newest first, for the day-by-day view. */
export function groupByDay(items: ActivityItem[]): ActivityDay[] {
  const byDate = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayItems]) => ({ date, items: dayItems }));
}

/** Every day that has any activity, newest first - drives the day filter chips. */
export function activeDates(items: ActivityItem[]): string[] {
  return [...new Set(items.map((i) => i.date))].sort((a, b) => b.localeCompare(a));
}

/** Rows still waiting on somebody, for the "needs attention" strip. */
export function outstanding(items: ActivityItem[]): ActivityItem[] {
  return items.filter((i) => i.pending && !i.pending.resolvedAt);
}

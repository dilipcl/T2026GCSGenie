import { db } from '../db';
import {
  ImprovementIdea,
  ImprovementKind,
  ImprovementStatus,
  UserRole,
} from '../types';
import { newId } from '../utils/id';
import { getDeviceId } from '../utils/device';
import { logAuditEvent } from './auditService';

/**
 * Somewhere to put "this bit is annoying" at the moment it is annoying.
 *
 * The useful complaints about this app have all arrived mid-task and been lost
 * by the evening - the bank-holiday subject picker was noticed on the day and
 * only surfaced a week later, by which time the data already carried the
 * consequence. A box inside the app catches them while they are still specific.
 *
 * Anyone can file one and everyone can see them, because an idea nobody can see
 * is the same as no idea. Only a parent can change a status, so `DONE` means a
 * decision was made rather than a wish being marked off by whoever wished it.
 */

export const KIND_LABEL: Record<ImprovementKind, string> = {
  BUG: 'Something is broken',
  CONFUSING: 'This confused me',
  MISSING: 'Something is missing',
  IDEA: 'Idea',
};

export const KIND_ICON: Record<ImprovementKind, string> = {
  BUG: '🐞',
  CONFUSING: '😕',
  MISSING: '🧩',
  IDEA: '💡',
};

export const STATUS_LABEL: Record<ImprovementStatus, string> = {
  OPEN: 'Open',
  UNDER_REVIEW: 'Being looked at',
  PLANNED: 'Planned',
  DONE: 'Done',
  DECLINED: 'Not doing',
};

/** Where in the app an idea is about. Kept short so the filter stays usable. */
export const IMPROVEMENT_AREAS = [
  'Home',
  'My Work',
  'Plan',
  'Fix My Mistakes',
  'Updates',
  'Proof Log',
  'Rewards',
  'Timetable',
  'Subjects & Goals',
  'Quick Add',
  'Check-in',
  'Parent Portal',
  'Something else',
] as const;

export interface FileImprovementInput {
  kind: ImprovementKind;
  title: string;
  detail?: string;
  area?: string;
  role: UserRole;
}

export async function fileImprovement(input: FileImprovementInput): Promise<ImprovementIdea> {
  const idea: ImprovementIdea = {
    id: newId('imp'),
    createdAt: Date.now(),
    createdByRole: input.role,
    createdOnDeviceId: getDeviceId(),
    kind: input.kind,
    title: input.title.trim(),
    detail: input.detail?.trim() || undefined,
    area: input.area,
    status: 'OPEN',
    supportedBy: [],
  };

  await db.improvements.add(idea);

  /**
   * Audited like anything else, so it appears in the activity feed. An idea
   * filed and never acknowledged is the most common way a suggestion box dies,
   * and the feed is where the family will notice one sitting untouched.
   */
  await logAuditEvent({
    user: input.role,
    action: 'INSERT',
    entity: 'ImprovementIdea',
    entityId: idea.id,
    newValue: `${KIND_LABEL[idea.kind]}: ${idea.title}`,
  });

  return idea;
}

/**
 * Changes a status. Parent only - enforced here rather than only in the UI,
 * because a rule that lives in a component is a rule that stops applying the
 * moment a second component is written.
 */
export async function setImprovementStatus(
  id: string,
  status: ImprovementStatus,
  role: UserRole,
  response?: string
): Promise<ImprovementIdea | undefined> {
  if (role !== 'PARENT') {
    throw new Error('Only a parent can change the status of an improvement.');
  }

  const existing = await db.improvements.get(id);
  if (!existing) return undefined;

  const updated: ImprovementIdea = {
    ...existing,
    status,
    response: response?.trim() || existing.response,
    statusChangedAt: Date.now(),
  };
  await db.improvements.put(updated);

  await logAuditEvent({
    user: role,
    action: 'UPDATE',
    entity: 'ImprovementIdea',
    entityId: id,
    fieldChanged: 'status',
    oldValue: STATUS_LABEL[existing.status],
    newValue: STATUS_LABEL[status],
  });

  return updated;
}

/** A second person saying "yes, this one". One vote per device. */
export async function toggleSupport(id: string): Promise<ImprovementIdea | undefined> {
  const existing = await db.improvements.get(id);
  if (!existing) return undefined;

  const deviceId = getDeviceId();
  const current = existing.supportedBy ?? [];
  const supportedBy = current.includes(deviceId)
    ? current.filter((d) => d !== deviceId)
    : [...current, deviceId];

  const updated = { ...existing, supportedBy };
  await db.improvements.put(updated);
  return updated;
}

export function isSupportedByThisDevice(idea: ImprovementIdea): boolean {
  return (idea.supportedBy ?? []).includes(getDeviceId());
}

export interface ImprovementFilter {
  statuses?: ImprovementStatus[];
  kinds?: ImprovementKind[];
  area?: string;
  search?: string;
}

/**
 * Open items first, then by support, then newest.
 *
 * Deliberately not newest-first overall: a suggestion box sorted purely by date
 * buries the thing three people agreed on under whatever was typed last night.
 */
export async function listImprovements(
  filter: ImprovementFilter = {}
): Promise<ImprovementIdea[]> {
  const all = await db.improvements.toArray();
  const search = filter.search?.trim().toLowerCase();

  const openRank: Record<ImprovementStatus, number> = {
    OPEN: 0,
    UNDER_REVIEW: 1,
    PLANNED: 2,
    DONE: 3,
    DECLINED: 4,
  };

  return all
    .filter((idea) => {
      if (filter.statuses?.length && !filter.statuses.includes(idea.status)) return false;
      if (filter.kinds?.length && !filter.kinds.includes(idea.kind)) return false;
      if (filter.area && idea.area !== filter.area) return false;
      if (search) {
        const haystack = `${idea.title} ${idea.detail ?? ''} ${idea.area ?? ''}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const byStatus = openRank[a.status] - openRank[b.status];
      if (byStatus !== 0) return byStatus;
      const bySupport = (b.supportedBy?.length ?? 0) - (a.supportedBy?.length ?? 0);
      if (bySupport !== 0) return bySupport;
      return b.createdAt - a.createdAt;
    });
}

export interface ImprovementCounts {
  total: number;
  open: number;
  done: number;
}

export async function improvementCounts(): Promise<ImprovementCounts> {
  const all = await db.improvements.toArray();
  return {
    total: all.length,
    open: all.filter((i) => i.status === 'OPEN' || i.status === 'UNDER_REVIEW').length,
    done: all.filter((i) => i.status === 'DONE').length,
  };
}

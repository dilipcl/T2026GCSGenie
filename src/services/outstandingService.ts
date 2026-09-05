import { db } from '../db';
import { NavTab } from '../components/layout/Navigation';
import { UserRole } from '../types';
import { todayISO } from '../utils/date';
import { readFinalisationState } from './planBaselineService';
import { pendingConfirmation } from './changeLogService';

/**
 * One list of everything still waiting on somebody.
 *
 * The app grew a screen per concern, which is right for doing the work and
 * wrong for finding it: the plan needed finalising on the Plan tab, a reward
 * sat unapproved on Rewards, a fix-up quest waited under Fix Ups, and nothing
 * anywhere said so. Tejas opened Updates, read "nothing pending", and reasonably
 * concluded there was nothing to do - while four things waited two taps away.
 *
 * The rule here is that an item earns its place only if somebody can act on it
 * now, and only if this list can take them to where that happens. A count with
 * nowhere to go is a nag; every row carries the tab it opens.
 *
 * Ordered by urgency rather than by source, because the point is to answer
 * "what should I do next", and an inbox sorted by which screen a thing came
 * from makes the reader do that sorting themselves.
 */

export type OutstandingUrgency = 'OVERDUE' | 'TODAY' | 'SOON' | 'WAITING';

/** Who has the ball. A student cannot approve a reward; a parent need not revise. */
export type OutstandingOwner = 'STUDENT' | 'PARENT';

export interface OutstandingItem {
  id: string;
  /** What to do, phrased as the action rather than the state. */
  title: string;
  /** Why it is here, named specifically enough to act on without opening it. */
  detail?: string;
  urgency: OutstandingUrgency;
  owner: OutstandingOwner;
  /** Where doing it happens. */
  tab: NavTab;
  /** Label for the link, e.g. "Open the plan". */
  action: string;
  /** How many underlying things this row stands for, when it stands for many. */
  count?: number;
}

const URGENCY_RANK: Record<OutstandingUrgency, number> = {
  OVERDUE: 0,
  TODAY: 1,
  SOON: 2,
  WAITING: 3,
};

/**
 * Everything outstanding, for one role.
 *
 * Reads every source in parallel and tolerates a source that fails: a broken
 * query should cost its own row, not the whole list. An inbox that renders
 * nothing because one table is mid-upgrade is worse than an inbox missing a
 * line, because the reader cannot tell the difference between the two.
 */
export async function loadOutstanding(role: UserRole): Promise<OutstandingItem[]> {
  const sources = [
    planItems,
    taskItems,
    checkInItems,
    remediationItems,
    rewardItems,
    goalItems,
    confirmationItems,
  ];

  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return await source();
      } catch (error) {
        console.error('Could not read one source of outstanding work:', error);
        return [];
      }
    })
  );

  return results
    .flat()
    .filter((item) => item.owner === role)
    .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]);
}

/** The week's plan, wherever it has got stuck. */
async function planItems(): Promise<OutstandingItem[]> {
  const { status, checks } = await readFinalisationState();
  const blocking = checks.filter((c) => !c.ok && c.blocking);

  if (status === 'BASELINED') return [];

  if (status === 'AWAITING_APPROVAL') {
    return [
      {
        id: 'plan:approve',
        title: 'Approve this week’s plan',
        detail: 'Tejas has sent the week for approval. It is not the baseline until it is agreed.',
        urgency: 'TODAY',
        owner: 'PARENT',
        tab: 'PLAN',
        action: 'Review the week',
      },
    ];
  }

  if (blocking.length === 0) {
    return [
      {
        id: 'plan:submit',
        title: 'Send this week’s plan for approval',
        detail: 'Every step is done. Nobody has agreed to the week yet.',
        urgency: 'TODAY',
        owner: 'STUDENT',
        tab: 'PLAN',
        action: 'Open the plan',
      },
    ];
  }

  // One row per outstanding step rather than a single "3 steps to go". The
  // detail on each is the thing to fix, which is what makes the list actionable
  // instead of merely accurate.
  return blocking.map((check) => ({
    id: `plan:${check.id}`,
    title: check.label,
    detail: check.detail,
    urgency: 'SOON' as const,
    owner: 'STUDENT' as const,
    tab: 'PLAN' as const,
    action: 'Open the plan',
  }));
}

async function taskItems(): Promise<OutstandingItem[]> {
  const today = todayISO();
  const open = (await db.tasks.toArray()).filter((t) => !t.completed);

  const overdue = open.filter((t) => t.dueDate < today);
  const dueToday = open.filter((t) => t.dueDate === today);

  const items: OutstandingItem[] = [];

  if (overdue.length) {
    items.push({
      id: 'tasks:overdue',
      title: `${overdue.length} piece${overdue.length === 1 ? '' : 's'} of work now overdue`,
      detail: namesOf(overdue.map((t) => t.title)),
      urgency: 'OVERDUE',
      owner: 'STUDENT',
      tab: 'TASKS',
      action: 'Open My Work',
      count: overdue.length,
    });
  }

  if (dueToday.length) {
    items.push({
      id: 'tasks:today',
      title: `${dueToday.length} piece${dueToday.length === 1 ? '' : 's'} of work due today`,
      detail: namesOf(dueToday.map((t) => t.title)),
      urgency: 'TODAY',
      owner: 'STUDENT',
      tab: 'TASKS',
      action: 'Open My Work',
      count: dueToday.length,
    });
  }

  return items;
}

async function checkInItems(): Promise<OutstandingItem[]> {
  const today = todayISO();
  const done = await db.checkIns.where('date').equals(today).count();
  if (done > 0) return [];

  return [
    {
      id: 'checkin:today',
      title: 'Do today’s check-in',
      detail: 'Two minutes. It is what keeps the streak alive and sets tomorrow’s first task.',
      urgency: 'TODAY',
      owner: 'STUDENT',
      tab: 'DASHBOARD',
      action: 'Go to Home',
    },
  ];
}

async function remediationItems(): Promise<OutstandingItem[]> {
  const active = (await db.remediations.toArray()).filter((r) => !r.isCompleted);
  if (active.length === 0) return [];

  return [
    {
      id: 'remediations:active',
      title: `${active.length} fix-up quest${active.length === 1 ? '' : 's'} waiting`,
      detail: namesOf(active.map((r) => r.taskTitle)),
      urgency: 'SOON',
      owner: 'STUDENT',
      tab: 'REMEDIATIONS',
      action: 'Open Fix Ups',
      count: active.length,
    },
  ];
}

async function rewardItems(): Promise<OutstandingItem[]> {
  const pending = (await db.redemptions.toArray()).filter((r) => r.status === 'PENDING');
  if (pending.length === 0) return [];

  return [
    {
      id: 'rewards:pending',
      title: `${pending.length} reward request${pending.length === 1 ? '' : 's'} to decide`,
      detail: namesOf(pending.map((r) => r.rewardTitle)),
      urgency: 'WAITING',
      owner: 'PARENT',
      tab: 'REWARDS',
      action: 'Open Rewards',
      count: pending.length,
    },
  ];
}

async function goalItems(): Promise<OutstandingItem[]> {
  const goals = await db.goals.toArray();
  const awaiting = goals.filter((g) => g.status === 'PENDING_DISCUSSION');
  if (awaiting.length === 0) return [];

  return [
    {
      id: 'goals:pending',
      title: `${awaiting.length} goal${awaiting.length === 1 ? '' : 's'} to agree`,
      detail: namesOf(awaiting.map((g) => g.title)),
      urgency: 'WAITING',
      owner: 'PARENT',
      tab: 'GOALS',
      action: 'Open Subjects & Goals',
      count: awaiting.length,
    },
  ];
}

async function confirmationItems(): Promise<OutstandingItem[]> {
  const pending = await pendingConfirmation();
  if (pending.length === 0) return [];

  return [
    {
      id: 'changes:pending',
      title: `${pending.length} change${pending.length === 1 ? '' : 's'} to sign off`,
      detail: 'Work Tejas has marked done since the last sign-off.',
      urgency: 'WAITING',
      owner: 'PARENT',
      tab: 'UPDATES',
      action: 'Review the changes',
      count: pending.length,
    },
  ];
}

/**
 * Names a few of the things, and counts the rest.
 *
 * Listing all of them turns a one-line row into a paragraph nobody reads; a
 * bare count says nothing about whether it matters. Three and a remainder is
 * enough to recognise what the row is about.
 */
function namesOf(titles: string[], limit = 3): string {
  const shown = titles.slice(0, limit).join(', ');
  const rest = titles.length - limit;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

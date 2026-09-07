import { db } from '../db';
import { NavTab } from '../components/layout/Navigation';
import { UserRole } from '../types';
import { formatShortDate, todayISO } from '../utils/date';
import { PlanHorizon, horizonWeekStart, readFinalisationState } from './planBaselineService';
import { inferBucket } from './planService';
import { pendingConfirmation } from './changeLogService';
import { daysNeedingBackfill } from './checkInOccurrenceService';
import { openWeeks } from './weekLedger';
import { workNeedingEvidence } from './evidenceService';
import { currentWeek } from './weekWindow';

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

/**
 * Which half of the Updates tab a row is asking you to open.
 *
 * Every other row here points at a different tab, so navigating there is
 * enough. Two of them point at Updates - and they are rendered *inside*
 * Updates, on its To do pane. Switching to the tab you are already on does
 * nothing at all, so those rows read as broken links: "8 changes to sign off ·
 * Review the changes" sat there absorbing clicks, because the sign-off list is
 * one pane over and nothing could reach it.
 *
 * Owned here rather than by the tab, in the same spirit as `tab` itself: this
 * module already decides where each row is dealt with, and splitting that
 * decision across two files is how a row ends up pointing somewhere its action
 * does not exist.
 */
export type UpdatesPane = 'TO_DO' | 'SIGN_OFF' | 'ACTIVITY' | 'EVIDENCE';

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
  /**
   * Which pane, for the rows that stay inside the Updates tab. Ignored
   * everywhere else, because no other tab has panes to land on.
   */
  pane?: UpdatesPane;
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
    pastWeekItems,
    evidenceItems,
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

/**
 * The plan, for whichever week is actually being decided.
 *
 * This asked about the current week and only the current week, which quietly
 * reproduced the bug it was written to catch. The planner switches to next week
 * from Thursday onwards - by then this week is agreed and there is nothing left
 * to decide about it - so from Thursday to Sunday the inbox had nothing to say
 * while the week about to start had no plan at all. The one stretch where
 * planning actually happens was the one stretch this was silent.
 *
 * Both horizons are asked, and the answer for each is only included when there
 * is something to do about it. A week already baselined contributes nothing,
 * which is what keeps the list short in the ordinary case.
 */
async function planItems(): Promise<OutstandingItem[]> {
  /**
   * Next week is only worth nagging about once it is close enough to plan.
   * Asking on a Monday for a plan covering seven days that have not started
   * yet is asking somebody to invent work, and the gate windows already say
   * planning opens on the Saturday before.
   */
  const horizons: PlanHorizon[] =
    currentWeek().weekday >= 4 ? ['THIS_WEEK', 'NEXT_WEEK'] : ['THIS_WEEK'];

  const perHorizon = await Promise.all(horizons.map(horizonItems));
  return perHorizon.flat();
}

async function horizonItems(horizon: PlanHorizon): Promise<OutstandingItem[]> {
  const { status, checks } = await readFinalisationState(horizon);
  const blocking = checks.filter((c) => !c.ok && c.blocking);

  if (status === 'BASELINED') return [];

  /**
   * Named by its dates, never by "this week" or "next week".
   *
   * Two rows both saying "this week's plan" on a Saturday - one about the week
   * ending and one about the week starting - is worse than one row, and a
   * relative word is exactly how that happens.
   */
  const weekStart = horizonWeekStart(horizon);
  const naming = `week of ${formatShortDate(weekStart)}`;
  const suffix = horizon === 'THIS_WEEK' ? '' : `:${horizon}`;

  if (status === 'AWAITING_APPROVAL') {
    return [
      {
        id: `plan:approve${suffix}`,
        title: `Approve the plan for the ${naming}`,
        detail: 'Tejas has sent it for approval. It is not the baseline until it is agreed.',
        urgency: 'TODAY',
        owner: 'PARENT',
        // The Parent Portal, not the planner. Approving happens in
        // `PlanApprovalPanel`, and the Plan tab has no control that can do it -
        // so this row used to hand a parent a screen where the action it was
        // asking for did not exist.
        tab: 'PARENT',
        action: 'Approve the week',
      },
    ];
  }

  if (blocking.length === 0) {
    return [
      {
        id: `plan:submit${suffix}`,
        title: `Send the plan for the ${naming} for approval`,
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
    id: `plan:${check.id}${suffix}`,
    title: `${check.label} — ${naming}`,
    detail: check.detail,
    urgency: 'SOON' as const,
    owner: 'STUDENT' as const,
    tab: 'PLAN' as const,
    action: 'Open the plan',
  }));
}

/**
 * Weeks that have run and that nobody ever closed.
 *
 * The gap Tejas described: he committed the current week and left the one
 * before it, because by then it was too late to be worth finalising. That was a
 * reasonable call, and no screen in the app ever mentioned the week again -
 * so from the outside it was indistinguishable from a week he had forgotten.
 *
 * Deliberately WAITING rather than OVERDUE. Nothing about a finished week is
 * urgent; what it needs is a decision, and dressing that up as an emergency
 * would push the genuinely time-critical rows below it.
 */
async function pastWeekItems(): Promise<OutstandingItem[]> {
  const weeks = await openWeeks();

  return weeks.map((week) => ({
    id: `week:${week.weekStart}`,
    title: `${week.todo} — ${formatShortDate(week.weekStart)} to ${formatShortDate(week.weekEnd)}`,
    detail: week.because,
    urgency: 'WAITING' as const,
    owner: 'STUDENT' as const,
    tab: 'PLAN' as const,
    action: 'Open the plan',
  }));
}

/**
 * Work marked done with nothing to show for it and nothing said about why.
 *
 * The Evidence tab has been able to list these for a while; nothing ever
 * carried them to the one screen people actually open to find out what needs
 * doing. Only the unexplained ones count - a gap somebody has already accounted
 * for is finished business, and an inbox row that can never be cleared is how
 * an inbox stops being read.
 */
async function evidenceItems(): Promise<OutstandingItem[]> {
  const missing = await workNeedingEvidence();
  if (missing.length === 0) return [];

  return [
    {
      id: 'evidence:missing',
      title: `${missing.length} finished ${missing.length === 1 ? 'thing has' : 'things have'} no proof attached`,
      detail:
        `${namesOf(missing.map((item) => item.title))} — attach a photo or a link, ` +
        `or say why there is nothing to attach.`,
      urgency: 'SOON',
      owner: 'STUDENT',
      tab: 'UPDATES',
      pane: 'EVIDENCE',
      action: 'Open Evidence',
      count: missing.length,
    },
  ];
}

async function taskItems(): Promise<OutstandingItem[]> {
  const today = todayISO();
  const open = (await db.tasks.toArray()).filter((t) => !t.completed);

  /**
   * Only work that was actually promised can be late.
   *
   * This filtered every open task by due date regardless of bucket, so planning
   * ahead was punished: a piece of work pulled into next week's column, or
   * parked in the backlog with an old date on it, was reported as "now overdue"
   * before anybody had agreed to do it. Being ahead of the plan should never
   * read as being behind it.
   *
   * NEXT_WEEK, FUTURE and BACKLOG are intentions. THIS_WEEK is the promise, and
   * a promise is the only thing that can be broken. An older row with no bucket
   * at all is treated as committed, because that is what it meant before the
   * buckets existed.
   *
   * Read through `inferBucket` rather than off the field, which also settles
   * the bucketless case it used to special-case by hand. It matters more now
   * that "next week" expires: work whose promised week has arrived is a promise
   * that can be broken, and reading the raw field would have gone on calling it
   * an intention.
   */
  const committed = open.filter((t) => inferBucket(t) === 'THIS_WEEK');

  const overdue = committed.filter((t) => t.dueDate < today);
  const dueToday = committed.filter((t) => t.dueDate === today);

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
  const items: OutstandingItem[] = [];

  const done = await db.checkIns.where('date').equals(today).count();
  if (done === 0) {
    items.push({
      id: 'checkin:today',
      title: 'Do today’s check-in',
      detail: 'Two minutes. It is what keeps the streak alive and sets tomorrow’s first task.',
      urgency: 'TODAY',
      owner: 'STUDENT',
      tab: 'DASHBOARD',
      action: 'Go to Home',
    });
  }

  /**
   * Days behind us that were never answered.
   *
   * Named rather than counted, and offered as work rather than as a telling-off.
   * A day can still be checked in after the fact - the answer is just as true on
   * Thursday as it was on Tuesday - and a plan cannot be repaired from evidence
   * nobody ever recorded. The only thing lost by answering late is the
   * same-day bonus, which is never taken back, only not earned.
   */
  const behind = await daysNeedingBackfill(today);
  if (behind.length > 0) {
    const dates = behind.map((day) => formatShortDate(day.date));
    items.push({
      id: 'checkin:backfill',
      title: `${behind.length} day${behind.length === 1 ? '' : 's'} still to check in`,
      detail: `${namesOf(dates)} — still worth doing; only the same-day bonus has gone.`,
      urgency: 'SOON',
      owner: 'STUDENT',
      tab: 'DASHBOARD',
      action: 'Catch up',
      count: behind.length,
    });
  }

  return items;
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
      pane: 'SIGN_OFF',
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

import { db } from '../db';
import { Assessment, Goal, MilestoneReminder, SubjectConfig, SubjectId } from '../types';
import { HeadlineTone } from './headlineMetrics';
import { loadWeekCommitment } from './planService';
import { isTopicSecure } from './ragCalculator';
import { StudyEntry, minutesForGoal, studyEntries, studyEntriesFrom } from './studyLedger';
import { STANDING_LABEL, WeekStanding, weekRecord } from './weekLedger';
import { WeekWindow, currentWeek, lastWeeks, weekContaining } from './weekWindow';
import { addDaysISO, parseISODate, toLocalISODate, todayISO } from '../utils/date';

/**
 * How Tejas is doing, for looking back rather than for doing the next thing.
 *
 * Every other screen answers "what next?". On 18 Oct 2026 the question a parent
 * actually had - is he doing the work, is the time going where we agreed, is it
 * working - took a database export and a script to answer, because the answer
 * was spread across five screens and about forty numbers, several of which
 * disagreed with each other on the same page: "6.3h studied" and "1h done of
 * 18h" a scroll apart, with nothing saying where the other 5.3 hours went.
 *
 * Nothing new is counted here. Time is `studyLedger`'s, attribution is
 * `minutesForGoal`, a week's standing is `weekLedger`'s, "this week" is
 * `weekWindow`'s, a secure topic is `isTopicSecure`. This file only puts them
 * side by side and says out loud the rules that were already being applied
 * silently - which is what makes the numbers on Home reconcile.
 *
 * Derived on every read, like everything else that counts.
 */

const round1 = (n: number) => Math.round(n * 10) / 10;
const hours = (minutes: number) => round1(minutes / 60);

/* -------------------------------------------------------------------------- */
/* Where the time went                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Why a logged minute counted towards no agreed goal.
 *
 * Each one is a different fix by a different person, which is why they are
 * kept apart rather than summed into one "unattributed" figure: "2.5h waiting
 * on an approval" is a parent's job, "0.5h with no subject" is Tejas's.
 */
export type LostReason =
  /** Tagged to a goal, or a subject whose only goal is, that is not agreed yet. */
  | 'GOAL_NOT_AGREED'
  /** An agreed goal that names no subject, so subject time can never reach it. */
  | 'GOAL_HAS_NO_SUBJECT'
  /** Tagged to a goal that no longer exists. */
  | 'GOAL_GONE'
  /** A subject no agreed goal covers. Sometimes deliberate. */
  | 'NO_GOAL_FOR_SUBJECT'
  /** Logged against nothing at all. */
  | 'NO_SUBJECT';

export interface LostTime {
  reason: LostReason;
  minutes: number;
  subjectId?: SubjectId;
  /** The goal the fix is about, where there is one. */
  goal?: Goal;
  /** One line, naming the thing and the cause. */
  explanation: string;
  /** What fixes it, phrased as the action. */
  fix: string;
  /** Who can do it. */
  owner: 'PARENT' | 'STUDENT';
}

export interface TimeAccount {
  loggedMinutes: number;
  countedMinutes: number;
  lost: LostTime[];
}

const isAgreed = (goal: Goal) => goal.status === 'APPROVED_LOCKED';
/** Goals still in play. A completed or deferred goal is not a fix anyone should be sent to make. */
const isOpen = (goal: Goal) => goal.status === 'DRAFT' || goal.status === 'PENDING_DISCUSSION';

/**
 * Whether a goal with no subject is plainly about this one.
 *
 * Only used to name the fix - "give the Chemistry goal its subject" - never to
 * count time towards the goal. Crediting time on a guess from a title would be
 * a second attribution rule, and `minutesForGoal` is the only one.
 */
export function looksLikeGoalFor(goal: Goal, subject?: SubjectConfig): boolean {
  if (!subject) return false;
  const title = goal.title.toLowerCase();
  return [subject.name, subject.shortName]
    .filter((name) => name && name.length > 2)
    .some((name) => title.includes(name.toLowerCase()));
}

/**
 * Why one entry counted towards no agreed goal - or `undefined` when it counted.
 */
function lostBecause(
  entry: StudyEntry,
  goals: Goal[],
  subjects: Map<string, SubjectConfig>
): Omit<LostTime, 'minutes' | 'explanation' | 'fix' | 'owner'> | undefined {
  const agreed = goals.filter(isAgreed);
  if (agreed.some((goal) => minutesForGoal(entry, goal) > 0)) return undefined;

  if (entry.goalId) {
    const goal = goals.find((g) => g.id === entry.goalId);
    if (!goal) return { reason: 'GOAL_GONE', subjectId: entry.subjectId };
    return { reason: 'GOAL_NOT_AGREED', subjectId: entry.subjectId, goal };
  }

  if (!entry.subjectId) return { reason: 'NO_SUBJECT' };

  const subject = subjects.get(entry.subjectId);
  const waiting = goals.find((g) => isOpen(g) && g.subjectId === entry.subjectId);
  if (waiting)
    return {
      reason: 'GOAL_NOT_AGREED',
      subjectId: entry.subjectId,
      goal: waiting,
    };

  const unfiled = agreed.find((g) => !g.subjectId && looksLikeGoalFor(g, subject));
  if (unfiled)
    return {
      reason: 'GOAL_HAS_NO_SUBJECT',
      subjectId: entry.subjectId,
      goal: unfiled,
    };

  return { reason: 'NO_GOAL_FOR_SUBJECT', subjectId: entry.subjectId };
}

function describe(
  lost: Omit<LostTime, 'explanation' | 'fix' | 'owner'>,
  subjects: Map<string, SubjectConfig>
): LostTime {
  const subject = lost.subjectId
    ? (subjects.get(lost.subjectId)?.name ?? lost.subjectId)
    : undefined;
  const goal = lost.goal?.title;
  switch (lost.reason) {
    case 'GOAL_NOT_AGREED':
      return {
        ...lost,
        explanation: `${subject ?? 'Time'} for "${goal}", which is not agreed yet`,
        fix: 'Agree the goal',
        owner: 'PARENT',
      };
    case 'GOAL_HAS_NO_SUBJECT':
      return {
        ...lost,
        explanation: `${subject}: "${goal}" has no subject, so ${subject} time cannot reach it`,
        fix: `Give the goal its subject`,
        owner: 'PARENT',
      };
    case 'GOAL_GONE':
      return {
        ...lost,
        explanation: `${subject ?? 'Time'} logged against a goal that has since been deleted`,
        fix: 'Pick a goal for it',
        owner: 'STUDENT',
      };
    case 'NO_GOAL_FOR_SUBJECT':
      return {
        ...lost,
        explanation: `${subject}: no agreed goal covers it`,
        fix: 'Set a goal, if it needs one',
        owner: 'PARENT',
      };
    case 'NO_SUBJECT':
      return {
        ...lost,
        explanation: 'Logged with no subject',
        fix: 'Name the subject when logging',
        owner: 'STUDENT',
      };
  }
}

/**
 * Logged against counted, and why each lost minute was lost - largest first.
 *
 * Counted means "reached at least one agreed goal". Two agreed goals on one
 * subject are each credited the same minutes (see `weeklyMinutesForGoal`), so
 * this counts each minute once, which is the only honest total.
 *
 * Goal status is today's, not the status the goal had on the day. That is
 * deliberate: the question being answered is "what would count if we fixed
 * it", and approving a goal does make its earlier hours count.
 */
export function accountForTime(
  entries: StudyEntry[],
  goals: Goal[],
  subjects: SubjectConfig[]
): TimeAccount {
  const bySubject = new Map(subjects.map((s) => [s.id as string, s]));
  const groups = new Map<string, Omit<LostTime, 'explanation' | 'fix' | 'owner'>>();
  let loggedMinutes = 0;
  let countedMinutes = 0;

  for (const entry of entries) {
    loggedMinutes += entry.minutes;
    const lost = lostBecause(entry, goals, bySubject);
    if (!lost) {
      countedMinutes += entry.minutes;
      continue;
    }
    const key = `${lost.reason}|${lost.goal?.id ?? ''}|${lost.subjectId ?? ''}`;
    const group = groups.get(key);
    if (group) group.minutes += entry.minutes;
    else groups.set(key, { ...lost, minutes: entry.minutes });
  }

  const lost = [...groups.values()]
    .map((group) => describe(group, bySubject))
    .sort((a, b) => b.minutes - a.minutes);

  return { loggedMinutes, countedMinutes, lost };
}

/** The account for one week, read from the database. */
export async function readTimeAccount(window: WeekWindow = currentWeek()): Promise<TimeAccount> {
  const [entries, goals, subjects] = await Promise.all([
    studyEntries({ start: window.start, end: window.end }),
    db.goals.toArray(),
    db.subjects.toArray(),
  ]);
  return accountForTime(entries, goals, subjects);
}

/* -------------------------------------------------------------------------- */
/* The term, week by week                                                      */
/* -------------------------------------------------------------------------- */

export interface WeekSummary {
  week: WeekWindow;
  isCurrent: boolean;
  loggedHours: number;
  countedHours: number;
  /** Pieces of work closed inside the week. */
  workClosed: number;
  /** Days with at least one check-in. */
  daysCheckedIn: number;
  /** Topics whose taught date falls in the week. */
  topicsTaught: number;
  /** Marked papers dated in the week. */
  marksLogged: number;
  standing: WeekStanding;
  standingLabel: string;
  /** Anything recorded at all: a plan, a check-in, work finished, time logged. */
  hadActivity: boolean;
}

/** How many weeks the strip shows. Roughly a half-term and a bit. */
export const WEEKS_SHOWN = 8;

const dateOf = (epochMs: number) => toLocalISODate(new Date(epochMs));

export async function readWeekStrip(
  count: number = WEEKS_SHOWN,
  reference: string = todayISO()
): Promise<WeekSummary[]> {
  const windows = lastWeeks(count, reference);
  const span = {
    start: windows[0].start,
    end: windows[windows.length - 1].end,
  };

  const [checkIns, tasks, goals, subjects, topics, assessments, records] = await Promise.all([
    db.checkIns.where('date').between(span.start, span.end, true, true).toArray(),
    db.tasks.toArray(),
    db.goals.toArray(),
    db.subjects.toArray(),
    db.syllabusTopics.toArray(),
    db.assessments.where('date').between(span.start, span.end, true, true).toArray(),
    Promise.all(windows.map((w) => weekRecord(w.start, reference))),
  ]);
  const entries = studyEntriesFrom(checkIns, tasks);
  const inWeek = (date: string | undefined, w: WeekWindow) =>
    !!date && date >= w.start && date <= w.end;

  const summaries = windows.map((week, i) => {
    const account = accountForTime(
      entries.filter((e) => inWeek(e.date, week)),
      goals,
      subjects
    );
    const standing = records[i].standing;
    return {
      week,
      isCurrent: inWeek(reference, week),
      loggedHours: hours(account.loggedMinutes),
      countedHours: hours(account.countedMinutes),
      workClosed: tasks.filter(
        (t) => t.completed && t.completedAt && inWeek(dateOf(t.completedAt), week)
      ).length,
      daysCheckedIn: new Set(checkIns.filter((c) => inWeek(c.date, week)).map((c) => c.date)).size,
      topicsTaught: topics.filter((t) => inWeek(t.dateTaught, week)).length,
      marksLogged: assessments.filter((a) => inWeek(a.date, week)).length,
      standing,
      // A week with nothing in it has no plan to have run without. "Ran
      // without a plan" under a week the app was not yet in use reads as a
      // criticism of a week that never happened.
      standingLabel: records[i].hadActivity ? STANDING_LABEL[standing] : 'Nothing recorded',
      hadActivity: records[i].hadActivity || account.loggedMinutes > 0,
    };
  });

  /**
   * Weeks from before the app was in use are left off the front, so the strip
   * starts where the record does. The current week always stays.
   */
  const first = summaries.findIndex((w) => w.hadActivity || w.isCurrent);
  return summaries.slice(first);
}

/* -------------------------------------------------------------------------- */
/* Each agreed goal, week by week                                              */
/* -------------------------------------------------------------------------- */

export interface GoalSeries {
  goal: Goal;
  /** Hours per week, oldest first, the current week last. */
  weeklyHours: number[];
  /** What the goal asks for each week. */
  askedHours: number;
  /** Mean of the finished weeks only - the current one is partial by definition. */
  averageHours: number;
  pace: GoalPace;
  /** Why the line is flat, when nothing at all reached the goal. */
  quietReason?: string;
}

/**
 * How a goal's recent weeks compare with what it asks.
 *
 * Every line on the goal rows used to be drawn green, so a goal nothing had
 * reached in a month looked exactly as healthy as one meeting its ask - four of
 * ten were flat on 19 Oct 2026, and the colour said all was well. Judged on the
 * finished weeks only; the current week is partial and would mark every goal
 * behind on a Monday.
 */
export type GoalPace =
  /** Averaging what it asks, or more. */
  | 'MEETING'
  /** Some time reaching it, less than it asks. */
  | 'BELOW'
  /** Time reaching it, and it asks for no particular amount. */
  | 'NO_ASK'
  /** Nothing has reached it in the whole window, current week included. */
  | 'NONE';

export function goalPace(
  weeklyHours: number[],
  askedHours: number,
  averageHours: number
): GoalPace {
  if (weeklyHours.every((h) => h === 0)) return 'NONE';
  if (askedHours <= 0) return 'NO_ASK';
  return averageHours >= askedHours ? 'MEETING' : 'BELOW';
}

/**
 * Why nothing reached a goal, in the terms of the one attribution rule: a goal
 * with no subject can only collect time tagged to it directly, which almost
 * nothing is, so that is a different fix from a subject nobody studied.
 */
function quietReasonFor(goal: Goal, subjects: Map<string, SubjectConfig>): string {
  if (!goal.subjectId) return 'No subject set, so only time tagged to this goal itself counts';
  const subject = subjects.get(goal.subjectId);
  const name = subject?.shortName || subject?.name || goal.subjectId;
  return `No ${name} time logged in these weeks`;
}

export async function readGoalSeries(
  count = 4,
  reference: string = todayISO()
): Promise<GoalSeries[]> {
  const windows = lastWeeks(count, reference);
  const span = {
    start: windows[0].start,
    end: windows[windows.length - 1].end,
  };
  const [entries, goals, subjects] = await Promise.all([
    studyEntries(span),
    db.goals.toArray(),
    db.subjects.toArray(),
  ]);
  const bySubject = new Map(subjects.map((s) => [s.id as string, s]));

  return goals
    .filter(isAgreed)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((goal) => {
      const weeklyHours = windows.map((w) =>
        hours(
          entries
            .filter((e) => e.date >= w.start && e.date <= w.end)
            .reduce((sum, e) => sum + minutesForGoal(e, goal), 0)
        )
      );
      const finished = weeklyHours.slice(0, -1);
      const askedHours = goal.weeklyHoursRequired || 0;
      const averageHours = round1(finished.reduce((a, b) => a + b, 0) / (finished.length || 1));
      const pace = goalPace(weeklyHours, askedHours, averageHours);
      return {
        goal,
        weeklyHours,
        askedHours,
        averageHours,
        pace,
        quietReason: pace === 'NONE' ? quietReasonFor(goal, bySubject) : undefined,
      };
    });
}

/* -------------------------------------------------------------------------- */
/* The three answers                                                           */
/* -------------------------------------------------------------------------- */

export interface Answer {
  question: string;
  tone: HeadlineTone;
  /** One sentence, the answer itself. */
  headline: string;
  /** The figures behind it, short. */
  detail: string;
}

export interface LatestMark {
  subjectId: SubjectId;
  subjectName: string;
  assessment: Assessment;
  targetGrade?: number;
}

export interface ProgressSnapshot {
  week: WeekWindow;
  work: Answer;
  time: Answer;
  working: Answer;
  account: TimeAccount;
  latestMarks: LatestMark[];
  /** A test or deadline close enough that its mark should be logged soon. */
  keyDate?: MilestoneReminder;
  topicsSecure: number;
  topicsTotal: number;
}

/** How long a mark stays "recent" for the third answer. Half a term. */
const RECENT_MARK_DAYS = 42;
/** How far either side of a key date to ask for its mark. */
const KEY_DATE_WINDOW_DAYS = 7;

/** Key dates whose mark is worth asking for: tests and mocks, not cadet camps. */
const MARKED_CATEGORIES: MilestoneReminder['category'][] = [
  'EXAM_MOCK',
  'COURSEWORK',
  'PORTFOLIO_DEADLINE',
  'REQUIRED_PRACTICAL',
];

export async function readProgress(reference: string = todayISO()): Promise<ProgressSnapshot> {
  const week = weekContaining(reference);
  const [account, commitment, tasks, topics, assessments, subjects, milestones] = await Promise.all(
    [
      readTimeAccount(week),
      loadWeekCommitment(),
      db.tasks.toArray(),
      db.syllabusTopics.toArray(),
      db.assessments.toArray(),
      db.subjects.toArray(),
      db.milestones.toArray(),
    ]
  );

  /* Doing the work ---------------------------------------------------------- */
  const closedThisWeek = tasks.filter(
    (t) =>
      t.completed &&
      t.completedAt &&
      dateOf(t.completedAt) >= week.start &&
      dateOf(t.completedAt) <= week.end
  ).length;
  const { committedCount, committedDone, overdueCommitted } = commitment;
  const expectedByNow = Math.floor(committedCount * week.elapsedFraction);

  let work: Answer;
  if (committedCount === 0) {
    work = {
      question: 'Doing the work',
      tone: closedThisWeek > 0 ? 'NEUTRAL' : 'WATCH',
      headline:
        closedThisWeek > 0
          ? `${closedThisWeek} pieces of work finished, with nothing planned for the week.`
          : 'Nothing planned for this week, and nothing finished yet.',
      detail: 'A week with a plan is one you can measure.',
    };
  } else {
    const overdue =
      overdueCommitted > 0
        ? ` ${overdueCommitted} planned ${overdueCommitted === 1 ? 'piece is' : 'pieces are'} past due.`
        : '';
    work = {
      question: 'Doing the work',
      tone: overdueCommitted > 0 ? 'WATCH' : committedDone >= expectedByNow ? 'GOOD' : 'WATCH',
      headline: `${committedDone} of ${committedCount} planned pieces done.${overdue}`,
      detail: `${closedThisWeek} finished this week in all, planned or not.`,
    };
  }

  /* Time where we agreed ---------------------------------------------------- */
  const { loggedMinutes, countedMinutes, lost } = account;
  const lostMinutes = loggedMinutes - countedMinutes;
  const time: Answer =
    loggedMinutes === 0
      ? {
          question: 'Time where we agreed',
          tone: 'NEUTRAL',
          headline: 'No study time logged yet this week.',
          detail: 'Check-ins, focus blocks and finished work all count.',
        }
      : {
          question: 'Time where we agreed',
          tone: lostMinutes === 0 ? 'GOOD' : countedMinutes >= lostMinutes ? 'WATCH' : 'BAD',
          headline:
            lostMinutes === 0
              ? `${hours(loggedMinutes)}h studied, all of it towards agreed goals.`
              : `${hours(loggedMinutes)}h studied, ${hours(countedMinutes)}h of it towards agreed goals.`,
          detail:
            lostMinutes === 0
              ? 'Nothing lost to an unagreed goal or a missing subject.'
              : `${hours(lostMinutes)}h counted towards nothing — ${lost.length} ${
                  lost.length === 1 ? 'reason' : 'reasons'
                }, each with its fix below.`,
        };

  /* Is it working ----------------------------------------------------------- */
  const names = new Map(subjects.map((s) => [s.id as string, s]));
  const newestFirst = [...assessments].sort((a, b) => (a.date < b.date ? 1 : -1));
  const latestBySubject = new Map<string, Assessment>();
  for (const a of newestFirst)
    if (!latestBySubject.has(a.subjectId)) latestBySubject.set(a.subjectId, a);
  const latestMarks: LatestMark[] = [...latestBySubject.values()].map((assessment) => ({
    subjectId: assessment.subjectId,
    subjectName: names.get(assessment.subjectId)?.name ?? assessment.subjectId,
    assessment,
    targetGrade: names.get(assessment.subjectId)?.targetGrade,
  }));

  const recentSince = addDaysISO(-RECENT_MARK_DAYS, parseISODate(reference));
  const recent = assessments.filter((a) => a.date >= recentSince && a.date <= reference);
  const topicsSecure = topics.filter(isTopicSecure).length;

  const windowStart = addDaysISO(-KEY_DATE_WINDOW_DAYS, parseISODate(reference));
  const windowEnd = addDaysISO(KEY_DATE_WINDOW_DAYS, parseISODate(reference));
  const keyDate = milestones
    .filter((m) => MARKED_CATEGORIES.includes(m.category))
    .filter((m) => m.date >= windowStart && m.date <= windowEnd)
    // A mark already logged for that subject since the key date settles it.
    .filter(
      (m) =>
        !assessments.some((a) => a.date >= m.date && (!m.subjectId || a.subjectId === m.subjectId))
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  const working: Answer = {
    question: 'Is it working',
    tone: recent.length > 0 ? 'NEUTRAL' : 'WATCH',
    headline:
      recent.length > 0
        ? `${recent.length} marked ${recent.length === 1 ? 'paper' : 'papers'} logged in the last six weeks.`
        : assessments.length > 0
          ? 'No marked work logged in the last six weeks.'
          : 'No marked work logged yet — effort is all there is to go on.',
    detail: `${topicsSecure} of ${topics.length} topics secure (ticked off, or rated 4 or 5).`,
  };

  return {
    week,
    work,
    time,
    working,
    account,
    latestMarks,
    keyDate,
    topicsSecure,
    topicsTotal: topics.length,
  };
}

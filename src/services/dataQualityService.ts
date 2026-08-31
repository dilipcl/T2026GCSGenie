import { db } from '../db';
import { DailyCheckIn, Goal, SubjectId, Task, isNonExamSubject } from '../types';

/**
 * Keeping the data worth analysing.
 *
 * Every rule below was written against a real defect found in the family's own
 * 31 August export, not from imagining what might go wrong:
 *
 *  - 7 of 8 tasks had no `bucket`, so "what did he commit to this week" had no
 *    answer.
 *  - 6 of 8 had no `estimatedHours`, so the Plan tab's load meter was measuring
 *    two tasks and calling it a week.
 *  - A check-in logged 30 minutes of study against no subject at all, so the
 *    time counted towards nothing - the same failure as the blank subject
 *    picker, one table over.
 *  - A task title was `Lock in Physic Session(Electricity,Circuits,Energy,Forces
 *    and matter` - truncated mid-phrase, bracket never closed, no space after
 *    the word.
 *  - All four goals sat in PENDING_DISCUSSION carrying a `ragStatus` of GREEN,
 *    which is a judgement about a goal that has not started.
 *
 * Two halves, deliberately separate. `normalise*` runs at the point of entry and
 * quietly fixes what can be fixed without asking. `inspect*` runs over data that
 * already exists and reports what cannot be fixed automatically, because
 * guessing a missing estimate is how you get a load meter that is confidently
 * wrong rather than honestly empty.
 */

// ---------------------------------------------------------------------------
// Normalisation - applied on the way in
// ---------------------------------------------------------------------------

/**
 * Tidies a title without changing what it says.
 *
 * Collapses runs of whitespace, inserts the space a bracket needs after a word,
 * puts one after each comma in a run-on list, and closes a bracket that was
 * opened and never shut. It never truncates and never rewords - a title is the
 * user's own text and the only safe edits are the ones that cannot alter
 * meaning.
 */
export function normaliseTitle(raw: string): string {
  let value = raw.trim().replace(/\s+/g, ' ');
  if (!value) return value;

  // "Session(Electricity" -> "Session (Electricity"
  value = value.replace(/(\w)\(/g, '$1 (');
  // "Circuits,Energy" -> "Circuits, Energy" - but leave "1,000" alone.
  value = value.replace(/,(?=[^\s\d])/g, ', ');

  const opens = (value.match(/\(/g) || []).length;
  const closes = (value.match(/\)/g) || []).length;
  if (opens > closes) value = `${value}${')'.repeat(opens - closes)}`;

  return value.replace(/\s+/g, ' ').trim();
}

/**
 * The smallest title that will still mean something in six months.
 *
 * "Art Hw" is a real example from the export: it identifies nothing once the
 * week it was written in has passed. Warned about rather than blocked - a
 * refusal here would just teach people to type "Art Homework xx" instead.
 */
/**
 * Genuine abbreviations only.
 *
 * An earlier version included whole words like "revision" and "notes", which
 * rejected "Logic Gate revision" - a perfectly good title. A real word carries
 * meaning even when it is generic; "Hw" does not.
 */
const ABBREVIATIONS = /^(hw|hwk|cw|pp|qs|hmk)$/i;

export function isTitleTooThin(title: string): boolean {
  const clean = normaliseTitle(title);
  if (!clean) return true;

  const words = clean.split(' ').filter(Boolean);
  if (words.length < 2) return true;

  /**
   * "Art Hw" is the real example, and it passed the first version of this rule
   * at exactly six characters and two words. A short pair of words where one is
   * a stock abbreviation identifies nothing once the week has passed.
   */
  // Only in a short title. "Physics Paper 1 PP walkthrough" is descriptive
  // enough that the abbreviation inside it does no harm.
  if (words.length <= 3 && words.some((w) => ABBREVIATIONS.test(w))) return true;

  return clean.length < 10 && words.length <= 2;
}

export interface TaskDefaults {
  bucket: Task['bucket'];
  estimatedHours?: number;
}

/**
 * Fills the fields a task must have to be countable.
 *
 * `bucket` gets a real value rather than being left undefined. The type has
 * always said "treated as LATER until it is planned", and treating and being
 * are not the same thing: an undefined bucket cannot be grouped, counted or
 * filtered, so seven of eight tasks were invisible to any query that asked
 * about planning.
 *
 * `estimatedHours` is deliberately NOT invented. An unestimated task is a known
 * unknown; a task silently assigned one hour is a wrong number that looks right,
 * and the load meter would then under- or over-report with no way to tell which.
 */
export function withTaskDefaults(task: Partial<Task>): TaskDefaults {
  return {
    bucket: task.bucket ?? 'LATER',
    estimatedHours: task.estimatedHours,
  };
}

// ---------------------------------------------------------------------------
// Inspection - applied to data that already exists
// ---------------------------------------------------------------------------

export type IssueSeverity = 'BLOCKS_ANALYSIS' | 'DEGRADES_ANALYSIS' | 'TIDINESS';

export interface DataIssue {
  id: string;
  severity: IssueSeverity;
  /** Which table and row, so the UI can offer to open it. */
  entity: string;
  entityId: string;
  /** What is wrong, in words. */
  problem: string;
  /** What it costs, so a person can decide whether to care. */
  consequence: string;
  /** The fix, where there is one a person can apply. */
  remedy: string;
  /** True when the app can correct it without asking. */
  autoFixable: boolean;
}

export const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  BLOCKS_ANALYSIS: 'Blocks analysis',
  DEGRADES_ANALYSIS: 'Weakens analysis',
  TIDINESS: 'Tidy-up',
};

function taskIssues(tasks: Task[], goals: Goal[]): DataIssue[] {
  const issues: DataIssue[] = [];
  const goalsBySubject = new Map<SubjectId, Goal[]>();
  for (const goal of goals) {
    if (!goal.subjectId) continue;
    goalsBySubject.set(goal.subjectId, [...(goalsBySubject.get(goal.subjectId) ?? []), goal]);
  }

  for (const task of tasks) {
    if (task.completed) continue;

    if (task.bucket === undefined) {
      issues.push({
        id: `task-bucket-${task.id}`,
        severity: 'BLOCKS_ANALYSIS',
        entity: 'Task',
        entityId: task.id,
        problem: `“${task.title}” has never been planned into a bucket.`,
        consequence:
          'It counts towards no week, so the load meter and the weekly commitment both ignore it.',
        remedy: 'Move it to This week, Next up or Later on the Plan tab.',
        autoFixable: true,
      });
    }

    if (task.estimatedHours === undefined || task.estimatedHours <= 0) {
      issues.push({
        id: `task-hours-${task.id}`,
        severity: 'DEGRADES_ANALYSIS',
        entity: 'Task',
        entityId: task.id,
        problem: `“${task.title}” has no time estimate.`,
        consequence: 'It contributes zero hours to the workload, so the week looks emptier than it is.',
        remedy: 'Add a rough estimate — being roughly right beats being absent.',
        autoFixable: false,
      });
    }

    if (isTitleTooThin(task.title)) {
      issues.push({
        id: `task-title-${task.id}`,
        severity: 'TIDINESS',
        entity: 'Task',
        entityId: task.id,
        problem: `“${task.title}” is too short to identify later.`,
        consequence: 'In a month nobody will know what this was.',
        remedy: 'Say what the work actually is.',
        autoFixable: false,
      });
    }

    if (normaliseTitle(task.title) !== task.title) {
      issues.push({
        id: `task-format-${task.id}`,
        severity: 'TIDINESS',
        entity: 'Task',
        entityId: task.id,
        problem: `“${task.title}” has spacing or bracket problems.`,
        consequence: 'Cosmetic, but it makes exports and grouping messier than they need to be.',
        remedy: `Rewrite as “${normaliseTitle(task.title)}”.`,
        autoFixable: true,
      });
    }

    /**
     * Only flagged when a goal for that subject actually exists. Nagging about
     * an unlinked task when there is nothing to link it to is noise, and noise
     * is what makes a quality report get ignored.
     */
    if (!task.linkedGoalId && !isNonExamSubject(task.subjectId)) {
      const candidates = goalsBySubject.get(task.subjectId) ?? [];
      if (candidates.length > 0) {
        issues.push({
          id: `task-goal-${task.id}`,
          severity: 'DEGRADES_ANALYSIS',
          entity: 'Task',
          entityId: task.id,
          problem: `“${task.title}” is not linked to a goal.`,
          consequence: `Work on it does not show as progress against “${candidates[0].title}”.`,
          remedy: 'Link it to the goal it serves.',
          autoFixable: false,
        });
      }
    }
  }

  /**
   * Near-duplicates. Compared on the significant words rather than the whole
   * string, so "Physics Energy Transfer Safety Step Problems" and "Finish
   * physics energy questions" - both real, both about the same work - are
   * recognisable as a possible pair.
   */
  const signature = (task: Task) =>
    new Set(
      normaliseTitle(task.title)
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, '')
        .split(' ')
        .filter((w) => w.length > 3)
    );

  const open = tasks.filter((t) => !t.completed);
  for (let i = 0; i < open.length; i += 1) {
    for (let j = i + 1; j < open.length; j += 1) {
      if (open[i].subjectId !== open[j].subjectId) continue;
      const a = signature(open[i]);
      const b = signature(open[j]);
      if (a.size === 0 || b.size === 0) continue;
      const shared = [...a].filter((w) => b.has(w)).length;
      const overlap = shared / Math.min(a.size, b.size);
      if (overlap >= 0.5) {
        issues.push({
          id: `task-dupe-${open[i].id}-${open[j].id}`,
          severity: 'TIDINESS',
          entity: 'Task',
          entityId: open[i].id,
          problem: `“${open[i].title}” and “${open[j].title}” look like the same work.`,
          consequence: 'Duplicated work double-counts against the week and the subject.',
          remedy: 'Merge them, or delete whichever is stale.',
          autoFixable: false,
        });
      }
    }
  }

  return issues;
}

function checkInIssues(checkIns: DailyCheckIn[]): DataIssue[] {
  const issues: DataIssue[] = [];

  for (const checkIn of checkIns) {
    /**
     * The defect that motivated this whole file: 30 minutes logged on 30 August
     * against no subject. `studySubjectId` is optional because a check-in with
     * no study time does not need one - but this one had time and no subject,
     * so the minutes counted towards nothing at all.
     */
    if (checkIn.completedRevisionMinutes > 0 && !checkIn.studySubjectId) {
      issues.push({
        id: `checkin-subject-${checkIn.id}`,
        severity: 'BLOCKS_ANALYSIS',
        entity: 'DailyCheckIn',
        entityId: checkIn.id,
        problem: `${checkIn.completedRevisionMinutes} minutes logged on ${checkIn.date} with no subject.`,
        consequence:
          'The time counts towards no subject and no goal, so study hours look lower than they were.',
        remedy: 'Set the subject on that check-in, or use General if it spanned several.',
        autoFixable: false,
      });
    }
  }

  return issues;
}

function goalIssues(goals: Goal[], now: number): DataIssue[] {
  const issues: DataIssue[] = [];
  const STUCK_AFTER_DAYS = 3;

  for (const goal of goals) {
    if (goal.status !== 'PENDING_DISCUSSION') continue;

    const ageDays = (now - goal.createdAt) / 86_400_000;
    if (ageDays >= STUCK_AFTER_DAYS) {
      issues.push({
        id: `goal-stuck-${goal.id}`,
        severity: 'DEGRADES_ANALYSIS',
        entity: 'Goal',
        entityId: goal.id,
        problem: `“${goal.title}” has been waiting for approval for ${Math.floor(ageDays)} days.`,
        consequence: `Its ${goal.weeklyHoursRequired} hrs/week are reserved by nobody, so capacity is understated.`,
        remedy: 'Approve and lock it, or send it back with a note.',
        autoFixable: false,
      });
    }
  }

  return issues;
}

export interface QualityReport {
  issues: DataIssue[];
  countsBySeverity: Record<IssueSeverity, number>;
  checkedAt: number;
  /** Rows examined, so an empty report is distinguishable from an empty database. */
  rowsExamined: number;
}

export async function inspectData(now: number = Date.now()): Promise<QualityReport> {
  const [tasks, goals, checkIns] = await Promise.all([
    db.tasks.toArray(),
    db.goals.toArray(),
    db.checkIns.toArray(),
  ]);

  const issues = [
    ...taskIssues(tasks, goals),
    ...checkInIssues(checkIns),
    ...goalIssues(goals, now),
  ];

  const order: Record<IssueSeverity, number> = {
    BLOCKS_ANALYSIS: 0,
    DEGRADES_ANALYSIS: 1,
    TIDINESS: 2,
  };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  const countsBySeverity: Record<IssueSeverity, number> = {
    BLOCKS_ANALYSIS: 0,
    DEGRADES_ANALYSIS: 0,
    TIDINESS: 0,
  };
  for (const issue of issues) countsBySeverity[issue.severity] += 1;

  return {
    issues,
    countsBySeverity,
    checkedAt: now,
    rowsExamined: tasks.length + goals.length + checkIns.length,
  };
}

export interface AutoFixResult {
  fixed: number;
  descriptions: string[];
}

/**
 * Applies only the corrections that cannot be wrong.
 *
 * Bucket defaults and title formatting. Nothing that requires a judgement -
 * estimates, goal links and subject attribution are all left to a person,
 * because a plausible guess in those fields is indistinguishable from a real
 * value once it is written.
 */
export async function autoFix(): Promise<AutoFixResult> {
  const tasks = await db.tasks.toArray();
  const descriptions: string[] = [];
  let fixed = 0;

  for (const task of tasks) {
    const patch: Partial<Task> = {};

    if (task.bucket === undefined) patch.bucket = 'LATER';

    const tidied = normaliseTitle(task.title);
    if (tidied !== task.title) patch.title = tidied;

    if (Object.keys(patch).length > 0) {
      await db.tasks.update(task.id, patch);
      fixed += 1;
      descriptions.push(
        patch.title
          ? `“${task.title}” → “${patch.title}”`
          : `“${task.title}” placed in the Later bucket`
      );
    }
  }

  return { fixed, descriptions };
}

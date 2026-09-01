import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { resetDatabase } from '../test/harness';
import { MilestoneReminder, Task } from '../types';
import { loadWeekCommitment } from './planService';
import {
  KEY_DATE_HORIZON_DAYS,
  OFF_GOAL_ALERT_SHARE,
  amendmentsFor,
  approveBaseline,
  baselineStatus,
  canSubmit,
  commitToWeek,
  finalisationNudge,
  goalFocus,
  loadBaseline,
  planAmendment,
  readinessChecks,
  returnForChanges,
  submitForApproval,
  weekStartISO,
} from './planBaselineService';

function freezeAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

// Week of Mon 2026-08-31.
const MONDAY = '2026-08-31';
const TUESDAY = '2026-09-01';
const THURSDAY = '2026-09-03';

let seq = 0;
function makeTask(over: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `task_${seq}`,
    subjectId: 'maths',
    bucket: 'THIS_WEEK',
    title: `Task ${seq}`,
    dueDate: THURSDAY,
    priority: 'MEDIUM',
    isHomework: true,
    isRemediation: false,
    xpValue: 50,
    completed: false,
    createdAt: Date.now(),
    estimatedHours: 1,
    linkedGoalId: 'goal_1',
    ...over,
  };
}

function makeMilestone(over: Partial<MilestoneReminder> = {}): MilestoneReminder {
  return {
    id: 'ms_1',
    title: 'Physics mock',
    date: '2026-09-08',
    category: 'EXAM_MOCK',
    priority: 'HIGH',
    isCompleted: false,
    createdAt: Date.now(),
    ...over,
  };
}

async function commitmentOf(tasks: Task[]) {
  await db.tasks.clear();
  await db.tasks.bulkAdd(tasks);
  return loadWeekCommitment();
}

/** Every check passing, so a test can knock out exactly one thing. */
async function readyInput(tasks: Task[] = [makeTask()], milestones: MilestoneReminder[] = []) {
  const commitment = await commitmentOf(tasks);
  return {
    commitment,
    safeStudyHours: 20,
    milestones,
    allTasks: tasks,
    today: TUESDAY,
  };
}

beforeEach(async () => {
  await resetDatabase();
  seq = 0;
  freezeAt(TUESDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('which week a date belongs to', () => {
  it('puts a midweek day in its own Monday', () => {
    expect(weekStartISO(THURSDAY)).toBe(MONDAY);
  });

  it('treats Monday as the start of its own week', () => {
    expect(weekStartISO(MONDAY)).toBe(MONDAY);
  });

  it('closes the week on Sunday rather than opening the next one', () => {
    // Sunday 2026-09-06 belongs to the week that began Mon 2026-08-31.
    expect(weekStartISO('2026-09-06')).toBe(MONDAY);
    expect(weekStartISO('2026-09-07')).toBe('2026-09-07');
  });
});

describe('what is outstanding before a week can be baselined', () => {
  it('passes everything when the week is in order', async () => {
    const checks = readinessChecks(await readyInput());
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(canSubmit(checks)).toBe(true);
  });

  it('objects to an empty week', async () => {
    const input = await readyInput([makeTask({ bucket: 'FUTURE', dueDate: '2026-10-20' })]);
    const check = readinessChecks(input).find((c) => c.id === 'HAS_COMMITMENT')!;
    expect(check.ok).toBe(false);
    expect(canSubmit(readinessChecks(input))).toBe(false);
  });

  it('names the tasks with no hours estimate', async () => {
    const input = await readyInput([
      makeTask({ title: 'Trig practice', estimatedHours: undefined }),
      makeTask(),
    ]);
    const check = readinessChecks(input).find((c) => c.id === 'ESTIMATES_SET')!;

    expect(check.ok).toBe(false);
    expect(check.detail).toContain('Trig practice');
  });

  it('treats a zero estimate as no estimate', async () => {
    // Zero hours is not a plan, it is an unanswered question.
    const input = await readyInput([makeTask({ estimatedHours: 0 })]);
    expect(readinessChecks(input).find((c) => c.id === 'ESTIMATES_SET')!.ok).toBe(false);
  });

  it('objects to committed work that is already overdue', async () => {
    const input = await readyInput([makeTask({ dueDate: '2026-08-25' })]);
    const check = readinessChecks(input).find((c) => c.id === 'NOTHING_OVERDUE')!;
    expect(check.ok).toBe(false);
    expect(canSubmit(readinessChecks(input))).toBe(false);
  });

  it('objects to a key date with no work planned against it', async () => {
    const input = await readyInput([makeTask()], [makeMilestone()]);
    const check = readinessChecks(input).find((c) => c.id === 'KEY_DATES_COVERED')!;

    expect(check.ok).toBe(false);
    expect(check.detail).toContain('Physics mock');
  });

  it('is satisfied once a task points at that key date', async () => {
    const tasks = [makeTask({ linkedMilestoneId: 'ms_1' })];
    const input = await readyInput(tasks, [makeMilestone()]);
    expect(readinessChecks(input).find((c) => c.id === 'KEY_DATES_COVERED')!.ok).toBe(true);
  });

  it('ignores a key date beyond the horizon', async () => {
    const far = makeMilestone({ date: '2026-12-01' });
    const input = await readyInput([makeTask()], [far]);
    expect(readinessChecks(input).find((c) => c.id === 'KEY_DATES_COVERED')!.ok).toBe(true);
  });

  it('ignores a key date that is already done', async () => {
    const input = await readyInput([makeTask()], [makeMilestone({ isCompleted: true })]);
    expect(readinessChecks(input).find((c) => c.id === 'KEY_DATES_COVERED')!.ok).toBe(true);
  });

  it('does not count a completed task as cover for a key date', async () => {
    // The mock is still coming; the revision that was done for it is spent.
    const tasks = [makeTask({ linkedMilestoneId: 'ms_1', completed: true }), makeTask()];
    const input = await readyInput(tasks, [makeMilestone()]);
    expect(readinessChecks(input).find((c) => c.id === 'KEY_DATES_COVERED')!.ok).toBe(false);
  });

  it('uses the horizon the constant declares', () => {
    expect(KEY_DATE_HORIZON_DAYS).toBe(14);
  });
});

describe('an over-full week is stated, not forbidden', () => {
  it('flags the load without blocking the submission', async () => {
    const input = { ...(await readyInput([makeTask({ estimatedHours: 30 })])), safeStudyHours: 5 };
    const checks = readinessChecks(input);
    const check = checks.find((c) => c.id === 'FITS_HEADROOM')!;

    expect(check.ok).toBe(false);
    expect(check.blocking).toBe(false);
    // A mock fortnight is legitimately over the ceiling. Refusing it would push
    // the planning outside the app, which helps nobody.
    expect(canSubmit(checks)).toBe(true);
  });
});

describe('work that is not pointed at a goal', () => {
  it('reports nothing adrift when every task has a goal', () => {
    const focus = goalFocus([makeTask(), makeTask()]);
    expect(focus.offGoal).toHaveLength(0);
    expect(focus.offGoalShare).toBe(0);
  });

  it('picks out the unattached task', () => {
    const focus = goalFocus([makeTask(), makeTask({ linkedGoalId: undefined })]);
    expect(focus.offGoal).toHaveLength(1);
    expect(focus.offGoalHours).toBe(1);
    expect(focus.linkedHours).toBe(1);
    expect(focus.offGoalShare).toBeCloseTo(0.5);
  });

  it('measures drift in hours, not in task count', () => {
    // Three short attached tasks against one long unattached one: by count the
    // week looks fine, by hours it is mostly aimed at nothing.
    const focus = goalFocus([
      makeTask({ estimatedHours: 0.25 }),
      makeTask({ estimatedHours: 0.25 }),
      makeTask({ estimatedHours: 0.25 }),
      makeTask({ estimatedHours: 6, linkedGoalId: undefined }),
    ]);
    expect(focus.offGoal).toHaveLength(1);
    expect(focus.offGoalShare).toBeGreaterThan(OFF_GOAL_ALERT_SHARE);
  });

  it('ignores work already finished', () => {
    const focus = goalFocus([makeTask({ linkedGoalId: undefined, completed: true })]);
    expect(focus.offGoal).toHaveLength(0);
  });

  it('warns without blocking the week', async () => {
    const input = await readyInput([makeTask({ linkedGoalId: undefined })]);
    const checks = readinessChecks(input);
    const check = checks.find((c) => c.id === 'GOALS_LINKED')!;

    expect(check.ok).toBe(false);
    expect(check.blocking).toBe(false);
    expect(check.detail).toContain('not');
    // A permission slip belongs to no goal and must not stop the week.
    expect(canSubmit(checks)).toBe(true);
  });

  it('says so plainly when most of the week has drifted', async () => {
    const input = await readyInput([
      makeTask({ estimatedHours: 1 }),
      makeTask({ estimatedHours: 5, linkedGoalId: undefined }),
    ]);
    const check = readinessChecks(input).find((c) => c.id === 'GOALS_LINKED')!;
    expect(check.detail).toContain('nothing in particular');
  });

  it('does not overstate a single small stray task', async () => {
    const input = await readyInput([
      makeTask({ estimatedHours: 5 }),
      makeTask({ estimatedHours: 0.5, linkedGoalId: undefined }),
    ]);
    const check = readinessChecks(input).find((c) => c.id === 'GOALS_LINKED')!;
    expect(check.detail).not.toContain('nothing in particular');
  });
});

describe('submitting and approving', () => {
  it('starts as a draft', async () => {
    expect(baselineStatus(await loadBaseline(MONDAY))).toBe('DRAFT');
  });

  it('captures what was committed at the moment it was sent', async () => {
    const commitment = await commitmentOf([makeTask(), makeTask()]);
    const row = await submitForApproval(commitment, 'Ready', MONDAY);

    expect(row.status).toBe('AWAITING_APPROVAL');
    expect(row.taskIds).toHaveLength(2);
    expect(row.hours).toBe(2);
  });

  it('does not move the captured list when the plan moves afterwards', async () => {
    const commitment = await commitmentOf([makeTask()]);
    await submitForApproval(commitment, undefined, MONDAY);

    // Plan changes after submission; the thing awaiting approval must not.
    await db.tasks.add(makeTask({ title: 'Added later' }));

    const row = await loadBaseline(MONDAY);
    expect(row?.taskIds).toHaveLength(1);
  });

  it('becomes the baseline once a parent approves', async () => {
    await submitForApproval(await commitmentOf([makeTask()]), undefined, MONDAY);
    const row = await approveBaseline(MONDAY);

    expect(row?.status).toBe('BASELINED');
    expect(row?.approvedAt).toBeTypeOf('number');
  });

  it('goes back to draft when it is sent back, with the reason', async () => {
    await submitForApproval(await commitmentOf([makeTask()]), undefined, MONDAY);
    const row = await returnForChanges('Too much on Thursday', MONDAY);

    expect(row?.status).toBe('DRAFT');
    expect(row?.returnedNote).toBe('Too much on Thursday');
  });

  it('clears the rejection when it is submitted again', async () => {
    await submitForApproval(await commitmentOf([makeTask()]), undefined, MONDAY);
    await returnForChanges('Too much', MONDAY);
    const row = await submitForApproval(await commitmentOf([makeTask()]), undefined, MONDAY);

    // The note on screen must always be about the version in front of you.
    expect(row.returnedNote).toBeUndefined();
    expect(row.status).toBe('AWAITING_APPROVAL');
  });

  it('cannot approve a week that was never submitted', async () => {
    expect(await approveBaseline('2026-07-06')).toBeUndefined();
  });

  it('leaves an audit trail for the approval', async () => {
    await submitForApproval(await commitmentOf([makeTask()]), undefined, MONDAY);
    await approveBaseline(MONDAY);

    const rows = await db.auditLogs.toArray();
    const approval = rows.find((r) => r.newValue?.includes('BASELINED'));
    expect(approval?.user).toBe('PARENT');
  });
});

describe('adding work to a week that is already agreed', () => {
  async function baselinedWeek(tasks: Task[]) {
    const commitment = await commitmentOf(tasks);
    await submitForApproval(commitment, undefined, MONDAY);
    await approveBaseline(MONDAY);
    return commitment;
  }

  it('is not an amendment while the week is still a draft', async () => {
    const commitment = await commitmentOf([makeTask()]);
    const plan = planAmendment(makeTask(), commitment, 20, await loadBaseline(MONDAY));
    expect(plan.needsAmendment).toBe(false);
  });

  it('becomes an amendment once the week is approved', async () => {
    const commitment = await baselinedWeek([makeTask()]);
    const plan = planAmendment(makeTask(), commitment, 20, await loadBaseline(MONDAY));
    expect(plan.needsAmendment).toBe(true);
  });

  it('offers the committed work that could come out instead', async () => {
    const existing = makeTask({ title: 'Already promised' });
    const commitment = await baselinedWeek([existing]);
    const plan = planAmendment(makeTask(), commitment, 20, await loadBaseline(MONDAY));

    expect(plan.swapCandidates.map((t) => t.title)).toContain('Already promised');
  });

  it('does not offer the task being added as its own swap', async () => {
    const task = makeTask();
    const commitment = await baselinedWeek([task]);
    const plan = planAmendment(task, commitment, 20, await loadBaseline(MONDAY));
    expect(plan.swapCandidates.map((t) => t.id)).not.toContain(task.id);
  });

  it('says when the addition would push the week over its headroom', async () => {
    const commitment = await baselinedWeek([makeTask({ estimatedHours: 4 })]);
    const plan = planAmendment(makeTask({ estimatedHours: 3 }), commitment, 5, await loadBaseline(MONDAY));

    expect(plan.hoursAfter).toBe(7);
    expect(plan.wouldOvercommit).toBe(true);
  });

  it('records the addition, and what came out for it', async () => {
    const displaced = makeTask({ title: 'Bumped', estimatedHours: 2 });
    await baselinedWeek([displaced]);

    const added = makeTask({ title: 'Urgent cover work', estimatedHours: 1.5 });
    const amendment = await commitToWeek({
      task: added,
      displaced,
      reason: 'Cover lesson set new homework',
      weekStart: MONDAY,
    });

    expect(amendment?.addedTitle).toBe('Urgent cover work');
    expect(amendment?.displacedTitle).toBe('Bumped');
    // Net effect on the week, which is the number that matters.
    expect(amendment?.hoursAdded).toBe(-0.5);
  });

  it('counts the full hours when nothing is displaced', async () => {
    await baselinedWeek([makeTask()]);
    const amendment = await commitToWeek({
      task: makeTask({ estimatedHours: 2 }),
      weekStart: MONDAY,
    });

    expect(amendment?.hoursAdded).toBe(2);
    expect(amendment?.displacedTaskId).toBeUndefined();
  });

  it('writes nothing while the week is unapproved', async () => {
    await commitmentOf([makeTask()]);
    const amendment = await commitToWeek({ task: makeTask(), weekStart: MONDAY });

    // Before approval, adding work is simply planning.
    expect(amendment).toBeUndefined();
    expect(await amendmentsFor(MONDAY)).toHaveLength(0);
  });

  it('keeps every amendment, in the order they happened', async () => {
    await baselinedWeek([makeTask()]);

    await commitToWeek({ task: makeTask({ title: 'First' }), weekStart: MONDAY });
    // The clock is frozen for these tests, so without advancing it both rows
    // carry the same `at` and "the order they happened" is not a fact about
    // them. Two additions a minute apart is the case worth asserting.
    vi.setSystemTime(new Date(`${TUESDAY}T12:01:00`));
    await commitToWeek({ task: makeTask({ title: 'Second' }), weekStart: MONDAY });

    const rows = await amendmentsFor(MONDAY);
    expect(rows.map((r) => r.addedTitle)).toEqual(['First', 'Second']);
  });

  it('returns a stable order when two land in the same millisecond', async () => {
    // Two devices adding to the same approved week while offline. The order is
    // arbitrary, but it must not change between reads.
    await baselinedWeek([makeTask()]);
    await commitToWeek({ task: makeTask({ title: 'A' }), weekStart: MONDAY });
    await commitToWeek({ task: makeTask({ title: 'B' }), weekStart: MONDAY });

    const first = (await amendmentsFor(MONDAY)).map((r) => r.addedTitle);
    const second = (await amendmentsFor(MONDAY)).map((r) => r.addedTitle);
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
  });

  it("does not mix one week's amendments into another", async () => {
    await baselinedWeek([makeTask()]);
    await commitToWeek({ task: makeTask(), weekStart: MONDAY });

    expect(await amendmentsFor('2026-09-07')).toHaveLength(0);
  });
});

describe('the reminder to finalise the week', () => {
  const clean = [
    { id: 'HAS_COMMITMENT' as const, label: '', ok: true, blocking: true },
    { id: 'ESTIMATES_SET' as const, label: '', ok: true, blocking: true },
  ];
  const oneOutstanding = [
    { id: 'HAS_COMMITMENT' as const, label: '', ok: false, blocking: true },
    { id: 'FITS_HEADROOM' as const, label: '', ok: false, blocking: false },
  ];

  it('says nothing once the week is agreed', () => {
    // A banner that is always there stops being read.
    expect(finalisationNudge('BASELINED', oneOutstanding, 5)).toBeUndefined();
  });

  it('explains the wait after submission', () => {
    const nudge = finalisationNudge('AWAITING_APPROVAL', clean, 2);
    expect(nudge?.headline).toBe('Waiting on a parent');
    expect(nudge?.tone).toBe('INFO');
  });

  it('invites early in the week and presses later', () => {
    expect(finalisationNudge('DRAFT', clean, 1)?.tone).toBe('INFO');
    expect(finalisationNudge('DRAFT', clean, 4)?.tone).toBe('URGENT');
  });

  it('counts only the blocking steps', () => {
    // The headroom warning is advisory and must not read as a blocker.
    expect(finalisationNudge('DRAFT', oneOutstanding, 1)?.outstanding).toBe(1);
  });

  it('leads with the rejection when there was one', () => {
    const nudge = finalisationNudge('DRAFT', clean, 1, 'Too much on Thursday');
    expect(nudge?.headline).toBe('Sent back for a change');
    expect(nudge?.body).toContain('Too much on Thursday');
    expect(nudge?.tone).toBe('URGENT');
  });

  it('offers the submission when everything is done', () => {
    const nudge = finalisationNudge('DRAFT', clean, 1);
    expect(nudge?.outstanding).toBe(0);
    expect(nudge?.headline).toBe('Ready to finalise');
  });
});

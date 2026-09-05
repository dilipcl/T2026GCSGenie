import { describe, it, expect } from 'vitest';
import { WeekPlanBaseline } from '../types';
import { currentGate, needsAttention, planGates } from './planGates';
import { formatShortDate, todayISO } from '../utils/date';

/**
 * Tejas lost a week's plan because nothing ever said a step was late. Every
 * case here is about a date: when a gate opens, when it is due, and what it
 * looks like once that moment has gone past.
 *
 * The week under test is Monday 7 September 2026 to Sunday 13 September.
 */

const WEEK = '2026-09-07';
const SATURDAY_BEFORE = '2026-09-05';
const SUNDAY_BEFORE = '2026-09-06';
const MONDAY = '2026-09-07';
const TUESDAY = '2026-09-08';
const WEDNESDAY = '2026-09-09';
const SUNDAY = '2026-09-13';
const NEXT_MONDAY = '2026-09-14';
const NEXT_TUESDAY = '2026-09-15';

function baseline(overrides: Partial<WeekPlanBaseline> = {}): WeekPlanBaseline {
  return {
    id: WEEK,
    weekStart: WEEK,
    status: 'DRAFT',
    taskIds: [],
    hours: 0,
    createdAt: Date.parse(`${SATURDAY_BEFORE}T10:00:00`),
    ...overrides,
  };
}

const gate = (weekStart: string, id: string, base: WeekPlanBaseline | undefined, today: string) =>
  planGates(weekStart, base, today).find((g) => g.id === id)!;

describe('gate windows', () => {
  it('opens planning on the Saturday before the week', () => {
    const plan = gate(WEEK, 'PLAN', undefined, SATURDAY_BEFORE);
    expect(plan.idealStart).toBe(SATURDAY_BEFORE);
    expect(plan.idealEnd).toBe(MONDAY);
  });

  it('runs the week from its Monday to its Sunday', () => {
    const run = gate(WEEK, 'RUN', undefined, MONDAY);
    expect(run.idealStart).toBe(MONDAY);
    expect(run.idealEnd).toBe(SUNDAY);
  });

  it('gives every gate a window without needing a baseline', () => {
    const gates = planGates(WEEK, undefined, MONDAY);
    expect(gates).toHaveLength(4);
    for (const g of gates) {
      expect(g.idealStart).toBeTruthy();
      expect(g.idealEnd).toBeTruthy();
    }
  });
});

describe('gate states before the week starts', () => {
  it('marks planning UPCOMING before its window opens', () => {
    expect(gate(WEEK, 'PLAN', undefined, '2026-09-01').state).toBe('UPCOMING');
  });

  it('marks planning OPEN once the weekend arrives', () => {
    expect(gate(WEEK, 'PLAN', undefined, SATURDAY_BEFORE).state).toBe('OPEN');
  });

  it('marks planning DUE on the Monday itself', () => {
    expect(gate(WEEK, 'PLAN', undefined, MONDAY).state).toBe('DUE');
  });
});

describe('gate states once a week is running', () => {
  it('marks an unsubmitted plan LATE after its Monday', () => {
    const plan = gate(WEEK, 'PLAN', undefined, WEDNESDAY);
    expect(plan.state).toBe('LATE');
    expect(plan.daysLate).toBe(2);
  });

  it('counts the days late from the ideal end, not from the week start', () => {
    expect(gate(WEEK, 'PLAN', undefined, TUESDAY).daysLate).toBe(1);
  });

  it('marks a submitted plan DONE and records the day it happened', () => {
    const base = baseline({
      status: 'AWAITING_APPROVAL',
      submittedAt: Date.parse(`${SUNDAY_BEFORE}T18:00:00`),
    });

    const plan = gate(WEEK, 'PLAN', base, TUESDAY);
    expect(plan.state).toBe('DONE');
    expect(plan.actualOn).toBe(SUNDAY_BEFORE);
    expect(plan.daysLate).toBeUndefined();
  });

  it('keeps the lateness of a gate that was passed late', () => {
    const base = baseline({
      status: 'AWAITING_APPROVAL',
      submittedAt: Date.parse(`${WEDNESDAY}T18:00:00`),
    });

    const plan = gate(WEEK, 'PLAN', base, SUNDAY);
    expect(plan.state).toBe('DONE');
    expect(plan.daysLate).toBe(2);
  });

  it('leaves approval outstanding while the week is only submitted', () => {
    const base = baseline({ status: 'AWAITING_APPROVAL', submittedAt: Date.parse(MONDAY) });
    expect(gate(WEEK, 'APPROVE', base, WEDNESDAY).state).toBe('LATE');
  });

  it('marks approval DONE once a parent has agreed it', () => {
    const base = baseline({
      status: 'BASELINED',
      submittedAt: Date.parse(`${SUNDAY_BEFORE}T18:00:00`),
      approvedAt: Date.parse(`${MONDAY}T08:00:00`),
    });

    const approve = gate(WEEK, 'APPROVE', base, TUESDAY);
    expect(approve.state).toBe('DONE');
    expect(approve.actualOn).toBe(MONDAY);
  });

  it('reopens the plan gate when a parent sends the week back', () => {
    const base = baseline({
      status: 'DRAFT',
      submittedAt: Date.parse(MONDAY),
      returnedAt: Date.parse(TUESDAY),
      returnedNote: 'Too much for one week',
    });

    expect(gate(WEEK, 'PLAN', base, WEDNESDAY).state).toBe('LATE');
  });
});

describe('gate states after the week has finished', () => {
  it('marks a never-finalised plan MISSED once the week is over', () => {
    const plan = gate(WEEK, 'PLAN', undefined, NEXT_TUESDAY);
    expect(plan.state).toBe('MISSED');
  });

  it('treats the week as run once its Sunday has passed', () => {
    expect(gate(WEEK, 'RUN', undefined, NEXT_MONDAY).state).toBe('DONE');
  });

  it('still shows a finished week as approved when it was', () => {
    const base = baseline({
      status: 'BASELINED',
      submittedAt: Date.parse(SUNDAY_BEFORE),
      approvedAt: Date.parse(MONDAY),
    });

    expect(gate(WEEK, 'APPROVE', base, NEXT_TUESDAY).state).toBe('DONE');
  });
});

describe('currentGate', () => {
  it('points at planning on a week nobody has touched', () => {
    expect(currentGate(planGates(WEEK, undefined, MONDAY))?.id).toBe('PLAN');
  });

  it('moves to approval once the plan is submitted', () => {
    const base = baseline({ status: 'AWAITING_APPROVAL', submittedAt: Date.parse(MONDAY) });
    expect(currentGate(planGates(WEEK, base, MONDAY))?.id).toBe('APPROVE');
  });

  it('moves to the week itself once it is approved', () => {
    const base = baseline({
      status: 'BASELINED',
      submittedAt: Date.parse(SUNDAY_BEFORE),
      approvedAt: Date.parse(MONDAY),
    });
    expect(currentGate(planGates(WEEK, base, TUESDAY))?.id).toBe('RUN');
  });

  it('has nothing left to point at once every gate is behind us', () => {
    const base = baseline({
      status: 'BASELINED',
      submittedAt: Date.parse(SUNDAY_BEFORE),
      approvedAt: Date.parse(MONDAY),
    });
    expect(currentGate(planGates(WEEK, base, NEXT_TUESDAY))).toBeUndefined();
  });
});

describe('the dates a gate is rendered with', () => {
  /**
   * Day and month, and never a relative word. The month abbreviation itself is
   * left to the platform - Node's ICU says "Sept" where the browser says "Sep",
   * and pinning that would be testing ICU rather than the app.
   */
  const DAY_AND_MONTH = /^\d{1,2} [A-Z][a-z]+$/;

  it('formats a window as plain calendar dates, never relative ones', () => {
    // The timeline puts planned beside actual. "Today – Monday" cannot be
    // compared against a date, and means something else tomorrow.
    const plan = gate(WEEK, 'PLAN', undefined, SATURDAY_BEFORE);

    expect(formatShortDate(plan.idealStart)).toMatch(DAY_AND_MONTH);
    expect(formatShortDate(plan.idealStart)).toMatch(/^5 /);
    expect(formatShortDate(plan.idealEnd)).toMatch(/^7 /);
  });

  it('says nothing relative on a date that is today', () => {
    expect(formatShortDate(todayISO())).toMatch(DAY_AND_MONTH);
  });

  it('formats the actual date the same way', () => {
    const base = baseline({
      status: 'AWAITING_APPROVAL',
      submittedAt: Date.parse(`${WEDNESDAY}T18:00:00`),
    });
    const plan = gate(WEEK, 'PLAN', base, SUNDAY);

    expect(formatShortDate(plan.actualOn!)).toMatch(/^9 /);
  });
});

describe('needsAttention', () => {
  it('is true for a live week with a late gate', () => {
    expect(needsAttention(planGates(WEEK, undefined, WEDNESDAY))).toBe(true);
  });

  it('is true on the day a gate falls due', () => {
    expect(needsAttention(planGates(WEEK, undefined, MONDAY))).toBe(true);
  });

  it('is false for a week that is fully agreed', () => {
    const base = baseline({
      status: 'BASELINED',
      submittedAt: Date.parse(SUNDAY_BEFORE),
      approvedAt: Date.parse(MONDAY),
    });
    expect(needsAttention(planGates(WEEK, base, TUESDAY))).toBe(false);
  });

  it('is false for a finished week nobody can fix any more', () => {
    expect(needsAttention(planGates(WEEK, undefined, NEXT_TUESDAY))).toBe(false);
  });
});

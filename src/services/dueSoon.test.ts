import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isDueSoon } from './planService';
import { Task } from '../types';

/**
 * What the check-in and the focus picker offer as "due soon".
 *
 * Both used to test the stored bucket themselves, which hid a next-week task
 * whose week had arrived and a task with no bucket due within the week - work
 * every other screen counts as this week. These hold that "this week" comes
 * from `inferBucket`, the one owner of it.
 */

const task = (extra: Partial<Task>): Task => ({
  id: 't',
  subjectId: 'maths',
  title: 'Task',
  dueDate: '2026-09-25',
  priority: 'MEDIUM',
  isHomework: true,
  isRemediation: false,
  xpValue: 50,
  completed: false,
  createdAt: 0,
  ...extra,
});

describe('isDueSoon', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Wednesday: the week runs Monday 21 to Sunday 27 September.
    vi.setSystemTime(new Date('2026-09-23T18:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers anything due by tomorrow, whatever its column', () => {
    expect(isDueSoon(task({ dueDate: '2026-09-24', bucket: 'FUTURE' }))).toBe(true);
  });

  it('offers a next-week task whose week has arrived', () => {
    expect(isDueSoon(task({ dueDate: '2026-09-27', bucket: 'NEXT_WEEK' }))).toBe(true);
  });

  it('offers unplanned work due within the week', () => {
    expect(isDueSoon(task({ dueDate: '2026-09-27', bucket: undefined }))).toBe(true);
  });

  it('leaves out later work and finished work', () => {
    expect(isDueSoon(task({ dueDate: '2026-10-20', bucket: 'FUTURE' }))).toBe(false);
    expect(isDueSoon(task({ dueDate: '2026-09-24', completed: true }))).toBe(false);
  });
});

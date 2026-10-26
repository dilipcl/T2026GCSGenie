import { WeekDetail, WeekWorkItem } from './weekDetail';
import { addDaysISO, parseISODate, todayISO } from '../utils/date';

/**
 * One week as a burn-down: the plan falling to nothing by Sunday, against what
 * actually came off it day by day, with the work nobody planned drawn beside it.
 *
 * The weekly review answered "how did the week go?" with four totals, and two
 * of them were about a different week - the "Last week" step read the plan and
 * the study hours from the week in progress. A total cannot show *when* a week
 * went wrong either: five of seven done reads the same whether it was steady
 * all week or all of it on Sunday night, and those are different conversations.
 *
 * Deliberately a pure function of `readWeekDetail`, not a second reading of the
 * tables. The detail card and this chart describe the same week side by side;
 * if they each decided what "planned" and "unplanned" meant, the first piece of
 * work they disagreed about would make both untrustworthy.
 *
 * Three lines of work, and the distinction between them is the point:
 *
 *  - **Committed** is the plan as agreed. Its ideal line falls evenly to zero.
 *  - **Added** came in by an amendment - agreed, but after the week started. It
 *    raises what is left to do on the day it arrived, which is why the actual
 *    line can go *up*. Hiding that would make a week that took on more look
 *    like a week that fell behind.
 *  - **Unplanned** was finished without being on either list. It is real work
 *    and is counted, but it does not burn the plan down - otherwise a week of
 *    easy backlog pieces would draw a perfect line over a plan that never moved.
 *
 * In hours rather than pieces: a ten-minute vocab list and a past paper are not
 * the same amount of promise.
 */

export interface BurndownDay {
  /** Local ISO date. */
  date: string;
  /** Even fall from the committed hours to zero by Sunday. */
  idealRemaining: number;
  /**
   * Planned hours still open at the end of the day. Undefined for days that
   * have not happened, so the line stops at today instead of drawing a flat
   * prediction across the rest of the week.
   */
  actualRemaining?: number;
  /** Planned hours (committed or added) closed that day. */
  plannedDoneHours: number;
  /** Hours brought in by amendments that day. */
  addedHours: number;
  /** Hours finished that day that were on no list. */
  unplannedHours: number;
  /** What was closed that day, for drilling into. */
  closed: { item: WeekWorkItem; kind: 'COMMITTED' | 'ADDED' | 'UNPLANNED' }[];
  /** What came in that day by amendment. */
  arrived: WeekWorkItem[];
  isFuture: boolean;
}

export interface WeekBurndown {
  committedHours: number;
  /** Committed pieces already closed before Monday: the plan started lighter. */
  doneBeforeHours: number;
  /** Where the actual line starts, Monday morning. */
  startRemaining: number;
  addedHours: number;
  /** Planned hours closed inside the week. */
  deliveredHours: number;
  unplannedHours: number;
  /** Planned hours still open at the end of the week, or so far. */
  remainingHours: number;
  days: BurndownDay[];
  /** Whether there was a plan to burn down at all. */
  hasPlan: boolean;
}

const round = (hours: number) => Math.round(hours * 10) / 10;
const sum = (items: WeekWorkItem[]) => items.reduce((total, i) => total + i.hours, 0);

export function weekBurndown(detail: WeekDetail, today: string = todayISO()): WeekBurndown {
  const { week } = detail;
  const dates = Array.from({ length: 7 }, (_, i) => addDaysISO(i, parseISODate(week.start)));

  /**
   * A committed piece finished before Monday was never part of this week's
   * work, however it was listed when the plan was sent. Counting it as done on
   * Monday would draw a cliff on the first day that nobody did that day.
   */
  const doneBefore = detail.committed.filter((i) => i.doneOn && i.doneOn < week.start);
  const committedHours = sum(detail.committed);
  const startRemaining = committedHours - sum(doneBefore);

  const doneOnDay = (item: WeekWorkItem, date: string) =>
    item.outcome === 'DONE_IN_WEEK' && item.doneOn === date && date >= week.start;

  /**
   * An added piece that was closed before it was formally brought in still
   * belongs to the day it arrived: it adds and burns together, rather than
   * burning hours that were never on the line.
   */
  const addedDay = (item: WeekWorkItem) =>
    item.addedOn && item.addedOn >= week.start ? item.addedOn : week.start;

  const addedClosedOn = (item: WeekWorkItem) =>
    item.outcome === 'DONE_IN_WEEK' && item.doneOn
      ? item.doneOn > addedDay(item)
        ? item.doneOn
        : addedDay(item)
      : undefined;

  let remaining = startRemaining;
  const days: BurndownDay[] = dates.map((date, index) => {
    const arrived = detail.added.filter((i) => addedDay(i) === date);
    const committedClosed = detail.committed.filter((i) => doneOnDay(i, date));
    const addedClosed = detail.added.filter((i) => addedClosedOn(i) === date);
    const unplanned = detail.extra.filter((i) => i.doneOn === date);

    const addedHours = sum(arrived);
    const plannedDoneHours = sum(committedClosed) + sum(addedClosed);
    const isFuture = date > today;
    if (!isFuture) remaining = remaining + addedHours - plannedDoneHours;

    return {
      date,
      idealRemaining: round(committedHours * (1 - (index + 1) / 7)),
      actualRemaining: isFuture ? undefined : round(Math.max(0, remaining)),
      plannedDoneHours: round(plannedDoneHours),
      addedHours: round(addedHours),
      unplannedHours: round(sum(unplanned)),
      closed: [
        ...committedClosed.map((item) => ({ item, kind: 'COMMITTED' as const })),
        ...addedClosed.map((item) => ({ item, kind: 'ADDED' as const })),
        ...unplanned.map((item) => ({ item, kind: 'UNPLANNED' as const })),
      ],
      arrived,
      isFuture,
    };
  });

  const deliveredHours = days.reduce((total, d) => total + d.plannedDoneHours, 0);
  const lastKnown = [...days].reverse().find((d) => d.actualRemaining !== undefined);

  return {
    committedHours: round(committedHours),
    doneBeforeHours: round(sum(doneBefore)),
    startRemaining: round(startRemaining),
    addedHours: round(sum(detail.added)),
    deliveredHours: round(deliveredHours),
    unplannedHours: round(sum(detail.extra)),
    remainingHours: lastKnown?.actualRemaining ?? round(startRemaining),
    days,
    hasPlan: detail.plan !== 'NONE' && detail.committed.length + detail.added.length > 0,
  };
}

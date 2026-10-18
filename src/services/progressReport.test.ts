import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "../db";
import { emptyDatabase } from "../test/harness";
import { INITIAL_SUBJECTS } from "../db/seedData";
import {
  Assessment,
  DailyCheckIn,
  Goal,
  MilestoneReminder,
  Task,
} from "../types";
import { StudyEntry } from "./studyLedger";
import {
  accountForTime,
  readGoalSeries,
  readProgress,
  readTimeAccount,
  readWeekStrip,
} from "./progressReport";
import { lockedGoalProgress } from "./goalProgress";

/**
 * The Progress screen's numbers.
 *
 * The week of 12 Oct 2026 is the case these are built from: 6.3h studied and
 * 1h counted, with nothing on any screen saying why. Most of the gap was
 * Computer Science time for a goal that was not agreed (after a new device had
 * reverted its approval), and Chemistry time for an agreed goal that named no
 * subject. The account has to name both, and add up.
 */

const MONDAY = "2026-10-12";
const SATURDAY = "2026-10-17";

const goal = (extra: Partial<Goal>): Goal => ({
  id: "g",
  title: "A goal",
  category: "ACADEMIC_GRADE_9",
  smartSpecific: "",
  smartMeasurable: "",
  smartAchievable: "",
  smartRealistic: "",
  smartTimeBound: "",
  status: "APPROVED_LOCKED",
  ragStatus: "GREEN",
  weeklyHoursRequired: 2,
  createdAt: 0,
  ...extra,
});

const entry = (extra: Partial<StudyEntry>): StudyEntry => ({
  id: Math.random().toString(36),
  source: "CHECK_IN",
  date: MONDAY,
  minutes: 60,
  ...extra,
});

const checkIn = (extra: Partial<DailyCheckIn>): DailyCheckIn => ({
  id: Math.random().toString(36),
  date: MONDAY,
  timestamp: 0,
  session: "EVENING",
  energyLevel: 4,
  focusRating: "NORMAL",
  completedHomeworkIds: [],
  completedRevisionMinutes: 60,
  xpEarned: 20,
  isDailyBaseXPAwarded: true,
  ...extra,
});

const task = (extra: Partial<Task>): Task => ({
  id: Math.random().toString(36),
  subjectId: "maths",
  title: "Homework",
  dueDate: MONDAY,
  priority: "MEDIUM",
  isHomework: true,
  isRemediation: false,
  xpValue: 50,
  completed: false,
  createdAt: 0,
  ...extra,
});

const MATHS = goal({
  id: "g-maths",
  title: "Grade 9 in Maths",
  subjectId: "maths",
});
const CS_WAITING = goal({
  id: "g-cs",
  title: "Grade 9 in Computer Science",
  subjectId: "computer_science",
  status: "PENDING_DISCUSSION",
});
const CHEM_UNFILED = goal({
  id: "g-chem",
  title: "Grade 9 in Chemistry",
  subjectId: undefined,
  createdAt: 1,
});

describe("where the time went", () => {
  const goals = [MATHS, CS_WAITING, CHEM_UNFILED];

  it("counts time that reached an agreed goal", () => {
    const account = accountForTime(
      [entry({ subjectId: "maths" })],
      goals,
      INITIAL_SUBJECTS,
    );
    expect(account).toMatchObject({
      loggedMinutes: 60,
      countedMinutes: 60,
      lost: [],
    });
  });

  it("names a goal still waiting to be agreed, as a parent fix", () => {
    const { lost } = accountForTime(
      [entry({ subjectId: "computer_science", minutes: 150 })],
      goals,
      INITIAL_SUBJECTS,
    );
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({
      reason: "GOAL_NOT_AGREED",
      minutes: 150,
      owner: "PARENT",
    });
    expect(lost[0].goal?.id).toBe("g-cs");
  });

  it("names an agreed goal that has no subject, rather than calling the subject goal-less", () => {
    const { lost } = accountForTime(
      [entry({ subjectId: "chemistry", minutes: 138 })],
      goals,
      INITIAL_SUBJECTS,
    );
    expect(lost[0]).toMatchObject({
      reason: "GOAL_HAS_NO_SUBJECT",
      subjectId: "chemistry",
    });
    expect(lost[0].goal?.id).toBe("g-chem");
    expect(lost[0].explanation).toContain("Chemistry");
  });

  it("tells apart no subject, no goal for the subject, and a deleted goal", () => {
    const { lost } = accountForTime(
      [
        entry({ minutes: 30 }),
        entry({ subjectId: "physics", minutes: 20 }),
        entry({ subjectId: "maths", goalId: "g-deleted", minutes: 10 }),
      ],
      goals,
      INITIAL_SUBJECTS,
    );
    expect(lost.map((l) => l.reason)).toEqual([
      "NO_SUBJECT",
      "NO_GOAL_FOR_SUBJECT",
      "GOAL_GONE",
    ]);
  });

  it("adds up: everything logged is either counted or lost, once", () => {
    const entries = [
      entry({ subjectId: "maths", minutes: 60 }),
      entry({ subjectId: "computer_science", minutes: 150 }),
      entry({ subjectId: "chemistry", minutes: 138 }),
      entry({ minutes: 30 }),
    ];
    const account = accountForTime(entries, goals, INITIAL_SUBJECTS);
    const lost = account.lost.reduce((sum, l) => sum + l.minutes, 0);
    expect(account.loggedMinutes).toBe(378);
    expect(account.countedMinutes + lost).toBe(account.loggedMinutes);
    // Largest first, because that is the fix worth making first.
    expect(account.lost[0].minutes).toBe(150);
  });

  it("counts a minute once even when two agreed goals share its subject", () => {
    const second = goal({ id: "g-maths-2", subjectId: "maths" });
    const account = accountForTime(
      [entry({ subjectId: "maths" })],
      [MATHS, second],
      INITIAL_SUBJECTS,
    );
    expect(account.countedMinutes).toBe(60);
  });
});

describe("reading the week from the database", () => {
  beforeEach(async () => {
    await emptyDatabase();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${SATURDAY}T20:00:00`));
    await db.subjects.bulkAdd(INITIAL_SUBJECTS);
    await db.goals.bulkAdd([MATHS, CS_WAITING, CHEM_UNFILED]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * The disagreement that started this: Home's goal cards and the time
   * account must describe the same hours. What the cards credit is exactly
   * what the account calls counted.
   */
  it("agrees with what the goal cards credit", async () => {
    await db.checkIns.bulkAdd([
      checkIn({ studySubjectId: "maths", completedRevisionMinutes: 60 }),
      checkIn({
        studySubjectId: "computer_science",
        completedRevisionMinutes: 90,
      }),
    ]);
    const account = await readTimeAccount();
    const cards = await lockedGoalProgress();
    const credited = cards.reduce((sum, c) => sum + c.actualHours, 0);
    expect(account.countedMinutes / 60).toBe(credited);
    expect(account.loggedMinutes).toBe(150);
  });

  it("builds one row per week, the current week last", async () => {
    await db.checkIns.add(checkIn({ studySubjectId: "maths" }));
    await db.checkIns.add(
      checkIn({
        date: "2026-09-30",
        studySubjectId: "maths",
        completedRevisionMinutes: 30,
      }),
    );
    await db.tasks.add(
      task({
        completed: true,
        completedAt: new Date(`${MONDAY}T18:00:00`).getTime(),
        loggedMinutes: 30,
      }),
    );

    const strip = await readWeekStrip(3);
    expect(strip.map((w) => w.week.start)).toEqual([
      "2026-09-28",
      "2026-10-05",
      MONDAY,
    ]);
    const now = strip[2];
    expect(now).toMatchObject({
      isCurrent: true,
      loggedHours: 1.5,
      countedHours: 1.5,
      workClosed: 1,
      daysCheckedIn: 1,
    });
    expect(strip[0].loggedHours).toBe(0.5);
    // In use that week, but nothing on the week between: said plainly.
    expect(strip[1]).toMatchObject({
      loggedHours: 0,
      standingLabel: "Nothing recorded",
    });
  });

  it("starts where the record starts, not with weeks before the app was used", async () => {
    await db.checkIns.add(checkIn({ studySubjectId: "maths" }));
    const strip = await readWeekStrip(8);
    expect(strip.map((w) => w.week.start)).toEqual([MONDAY]);
  });

  it("gives each agreed goal its hours per week, and leaves unagreed goals out", async () => {
    await db.checkIns.add(
      checkIn({
        date: "2026-10-06",
        studySubjectId: "maths",
        completedRevisionMinutes: 120,
      }),
    );
    const series = await readGoalSeries(2);
    expect(series.map((s) => s.goal.id)).toEqual(["g-maths", "g-chem"]);
    expect(series[0]).toMatchObject({
      weeklyHours: [2, 0],
      askedHours: 2,
      averageHours: 2,
    });
  });

  it("answers the three questions", async () => {
    await db.checkIns.add(
      checkIn({
        studySubjectId: "computer_science",
        completedRevisionMinutes: 90,
      }),
    );
    const progress = await readProgress();

    expect(progress.time.tone).toBe("BAD");
    expect(progress.time.headline).toBe(
      "1.5h studied, 0h of it towards agreed goals.",
    );
    expect(progress.working.tone).toBe("WATCH");
    expect(progress.work.headline).toContain("Nothing planned");
  });

  it("asks for the mark of a test that has just happened, until one is logged", async () => {
    const mock: MilestoneReminder = {
      id: "ir1",
      title: "IR1 assessment",
      date: SATURDAY,
      category: "EXAM_MOCK",
      subjectId: "maths",
      priority: "HIGH",
      isCompleted: false,
      createdAt: 0,
    };
    await db.milestones.add(mock);
    expect((await readProgress()).keyDate?.id).toBe("ir1");

    const paper: Assessment = {
      id: "a1",
      subjectId: "maths",
      title: "IR1",
      type: "MOCK",
      date: SATURDAY,
      marksScored: 40,
      marksAvailable: 50,
      percentage: 80,
      questions: [],
      attachmentIds: [],
      createdAt: 0,
    } as unknown as Assessment;
    await db.assessments.add(paper);

    const after = await readProgress();
    expect(after.keyDate).toBeUndefined();
    expect(after.working.tone).toBe("NEUTRAL");
    expect(after.latestMarks[0]).toMatchObject({
      subjectName: "Mathematics",
      targetGrade: 9,
    });
  });
});

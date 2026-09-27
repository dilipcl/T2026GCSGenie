import { db } from '../db';
import { DailyCheckIn, SubjectId, Task } from '../types';
import { dayShape } from './dayPlan';
import { resolveWeekType } from './weekType';
import { occurrenceId, teachesTopics } from './checkInOccurrenceService';
import { isDueSoon } from './planService';
import { logAuditEvent } from './auditService';
import { FOCUS_MINUTES } from './breakEngine';
import { newId } from '../utils/id';
import { addDaysISO, todayISO } from '../utils/date';

/**
 * The focus block as the place where detail gets written down.
 *
 * The evening check-in used to carry every reflective question - what clicked,
 * what to ask, what is next - at the one moment of the day when a
 * fourteen-year-old least wants to answer them, while the timer, running at
 * the moment the work was actually in front of him, asked for a subject and
 * nothing else. So the check-in shrinks to facts and this is where the detail
 * lives: what the block was on, one line about it, a question for the teacher,
 * a photo of the page. Asked during the break, when the work is still on the
 * desk.
 *
 * Every part of the wrap-up is optional. The block has already been logged the
 * moment it finished, so skipping the wrap-up loses nothing but the detail.
 */

/** Something a focus block can be spent on, offered before it starts. */
export interface FocusThread {
  /** Stable within a day, for the picker's value. */
  key: string;
  kind: 'LESSON' | 'TASK';
  label: string;
  subjectId: SubjectId;
  topicId?: string;
  taskId?: string;
}

/**
 * A row the focus timer wrote, including the ones from before `source` existed.
 *
 * Those older rows are recognisable only by shape - a study session of exactly
 * one block, with the placeholder energy and focus the timer has always
 * written, no homework and no daily base. A person answering the check-in by
 * hand could produce the same shape only by choosing "Study", leaving both
 * ratings on their defaults and logging exactly 25 minutes, which the slider's
 * fifteen-minute steps cannot do.
 */
export function isTimerBlock(checkIn: DailyCheckIn): boolean {
  if (checkIn.source === 'FOCUS_TIMER') return true;
  return (
    checkIn.session === 'STUDY_SESSION' &&
    checkIn.completedRevisionMinutes === FOCUS_MINUTES &&
    checkIn.energyLevel === 3 &&
    checkIn.focusRating === 'NORMAL' &&
    (checkIn.completedHomeworkIds ?? []).length === 0 &&
    checkIn.xpEarned === 10 &&
    !checkIn.isDailyBaseXPAwarded
  );
}

/** Focus blocks logged on a date, oldest first. */
export async function timerBlocksOn(date: string): Promise<DailyCheckIn[]> {
  return (await db.checkIns.where('date').equals(date).toArray())
    .filter(isTimerBlock)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * What there is to work on today: the day's lessons, then work due soon.
 *
 * A lesson comes with the topic it was tagged with, so a block spent going
 * over it lands on that topic without being asked twice. Missed lessons are
 * left out - they covered nothing to go over. Work is capped, because a picker
 * of thirty tasks is the list the check-in used to show and nobody read.
 */
export async function focusThreads(date: string = todayISO()): Promise<FocusThread[]> {
  const shape = await dayShape(date, await resolveWeekType(date));
  const threads: FocusThread[] = [];

  for (const occurrence of shape.occurrences) {
    if (!teachesTopics(occurrence)) continue;
    const answer = await db.checkInOccurrences.get(occurrenceId(date, occurrence.key));
    if (answer?.outcome === 'MISSED') continue;

    threads.push({
      key: `lesson:${occurrence.key}`,
      kind: 'LESSON',
      label: occurrence.label,
      subjectId: occurrence.subjectId!,
      topicId: answer?.topicId,
    });
  }

  const open = (await db.tasks.orderBy('dueDate').toArray()).filter((t: Task) =>
    isDueSoon(t, date)
  );

  for (const task of open.slice(0, 6)) {
    threads.push({
      key: `task:${task.id}`,
      kind: 'TASK',
      label: task.title,
      subjectId: task.subjectId,
      topicId: task.linkedTopicId,
      taskId: task.id,
    });
  }

  return threads;
}

export interface FocusBlockInput {
  subjectId?: SubjectId;
  topicId?: string;
  taskId?: string;
  minutes?: number;
  date?: string;
}

/**
 * Logs a finished block, before anything is asked about it.
 *
 * Written first and on its own so that the minutes can never depend on the
 * wrap-up being answered: a block closed by walking away from the laptop still
 * counts in full.
 */
export async function logFocusBlock(input: FocusBlockInput): Promise<string> {
  const id = newId('checkin');
  const minutes = input.minutes ?? FOCUS_MINUTES;

  await db.checkIns.add({
    id,
    date: input.date ?? todayISO(),
    timestamp: Date.now(),
    session: 'STUDY_SESSION',
    source: 'FOCUS_TIMER',
    // Placeholders - nobody was asked. `isTimerBlock` keeps them out of the
    // energy signal.
    energyLevel: 3,
    focusRating: 'NORMAL',
    completedHomeworkIds: [],
    completedRevisionMinutes: minutes,
    // What the minutes were spent on. Without this they land in a global
    // bucket and no goal can ever be shown as worked.
    studySubjectId: input.subjectId,
    topicId: input.topicId,
    taskId: input.taskId,
    // The daily base XP belongs to a real check-in, not to a timer block
    xpEarned: 10,
    isDailyBaseXPAwarded: false,
    structuredNotes: { category: 'ACADEMIC' },
  });

  await logAuditEvent({
    user: 'STUDENT',
    action: 'INSERT',
    entity: 'DailyCheckIn',
    entityId: id,
    newValue:
      `Focus block completed (${minutes} min)` +
      (input.subjectId ? ` on ${input.subjectId}` : ''),
  });

  return id;
}

export interface FocusWrapUp {
  topicId?: string;
  /** What the block covered, in his words. Becomes library material. */
  note?: string;
  /** Something to ask a teacher. Becomes a task for tomorrow. */
  question?: string;
  /** How sure he now feels about the topic, 1-5. Moves the topic's own rating. */
  confidence?: 1 | 2 | 3 | 4 | 5;
}

/**
 * Adds the detail to a block that has already been logged.
 *
 * The question becomes a task, as it does from the check-in, because a
 * question written into a log is one nobody reads again. It is raised once:
 * editing the wrap-up afterwards does not raise a second copy.
 *
 * Confidence goes onto the topic itself rather than onto the block. The topic
 * list is where confidence is already read from - for the subject's health and
 * for choosing what to revise - and a second, per-block rating that nothing
 * read would be a number collected for its own sake.
 */
export async function wrapUpFocusBlock(checkInId: string, wrapUp: FocusWrapUp): Promise<void> {
  const block = await db.checkIns.get(checkInId);
  if (!block) return;

  const note = wrapUp.note?.trim() || undefined;
  const question = wrapUp.question?.trim() || undefined;
  const topicId = wrapUp.topicId ?? block.topicId;
  const alreadyAsked = !!block.structuredNotes?.blockersAndQuestions;

  await db.checkIns.update(checkInId, {
    topicId,
    structuredNotes: {
      ...block.structuredNotes,
      category: 'ACADEMIC',
      keyLearning: note,
      blockersAndQuestions: question,
    },
  });

  if (question && !alreadyAsked) {
    const task: Task = {
      id: newId('task'),
      subjectId: block.studySubjectId ?? 'general',
      bucket: 'THIS_WEEK',
      committedAt: Date.now(),
      title: /^ask\b/i.test(question) ? question : `Ask: ${question}`,
      description: `Question from a focus block on ${block.date}. Ask in your next lesson.`,
      dueDate: addDaysISO(1),
      priority: 'MEDIUM',
      isHomework: false,
      isRemediation: false,
      linkedTopicId: topicId,
      estimatedHours: 0.25,
      xpValue: 15,
      completed: false,
      createdAt: Date.now(),
    };
    await db.tasks.add(task);
    await logAuditEvent({
      user: 'STUDENT',
      action: 'INSERT',
      entity: 'Task',
      entityId: task.id,
      newValue: `${task.title} [from a focus block, due ${task.dueDate}]`,
    });
  }

  if (topicId && wrapUp.confidence) {
    const topic = await db.syllabusTopics.get(topicId);
    if (topic && topic.confidenceRating !== wrapUp.confidence) {
      await db.syllabusTopics.update(topicId, { confidenceRating: wrapUp.confidence });
      await logAuditEvent({
        user: 'STUDENT',
        action: 'UPDATE',
        entity: 'SyllabusTopic',
        entityId: topicId,
        fieldChanged: 'confidenceRating',
        oldValue: String(topic.confidenceRating),
        newValue: `${wrapUp.confidence} (after a focus block)`,
      });
    }
  }

  await logAuditEvent({
    user: 'STUDENT',
    action: 'UPDATE',
    entity: 'DailyCheckIn',
    entityId: checkInId,
    newValue: `Focus block wrapped up${note ? ': ' + note : ''}`,
  });
}

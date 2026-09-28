import { describe, it, expect } from 'vitest';
import { Assessment, Goal, SyllabusTopic } from '../types';
import { buildFixUpTasks, topicNamed } from './assessmentService';

/**
 * A fix-up from a marked paper is filed like any other fix-up.
 *
 * It was the odd one out: its mistake went into the description, where the
 * close sheet never looks for it, and it named no goal and no topic - so its
 * time counted towards nothing and its topic page never heard of it, while a
 * fix-up converted from a quest carried all three.
 */

const paper = (topic?: string): Assessment =>
  ({
    id: 'paper',
    subjectId: 'maths',
    title: 'October mock',
    type: 'MOCK_EXAM',
    date: '2026-10-05',
    marksScored: 3,
    marksAvailable: 6,
    percentage: 50,
    questions: [
      {
        id: 'q',
        questionNumber: 'Q7',
        topic,
        marksAvailable: 6,
        marksScored: 3,
        errorType: 'METHOD',
        notes: 'Used the wrong formula',
      },
    ],
    attachmentIds: [],
    createdAt: 0,
  }) as unknown as Assessment;

const goal = (id: string, subjectId: string, status: Goal['status'], createdAt = 0): Goal =>
  ({ id, subjectId, status, createdAt, title: id }) as unknown as Goal;

const topic = (id: string, subjectId: string, title: string): SyllabusTopic =>
  ({ id, subjectId, title, unit: 'Geometry' }) as unknown as SyllabusTopic;

describe('fix-ups from a marked paper', () => {
  it('says what went wrong in the fix-up field, not the notes', () => {
    const [task] = buildFixUpTasks(paper('Circle area'));
    expect(task.whatWentWrong).toBe('Lost 3 of 6 marks. Cause logged: method. Used the wrong formula');
    expect(task.description).toBeUndefined();
    expect(task.isRemediation).toBe(true);
  });

  it("is filed under the subject's agreed goal, by the same rule as a converted quest", () => {
    const [task] = buildFixUpTasks(paper(), {
      goals: [
        goal('draft-maths', 'maths', 'DRAFT'),
        goal('agreed-physics', 'physics', 'APPROVED_LOCKED'),
        goal('agreed-maths', 'maths', 'APPROVED_LOCKED', 5),
      ],
    });
    expect(task.linkedGoalId).toBe('agreed-maths');
  });

  it('names the topic when the question names one exactly', () => {
    const topics = [topic('area', 'maths', 'Circle  area'), topic('other', 'physics', 'Circle area')];
    expect(buildFixUpTasks(paper(' circle AREA '), { topics })[0].linkedTopicId).toBe('area');
  });

  it('leaves the topic for the inbox rather than guess at a near miss', () => {
    const topics = [topic('area', 'maths', 'Circle area')];
    expect(topicNamed('maths', 'Circles', topics)).toBeUndefined();
    expect(topicNamed('maths', undefined, topics)).toBeUndefined();
    expect(topicNamed('physics', 'Circle area', topics)).toBeUndefined();
  });
});

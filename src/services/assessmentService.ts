import { Assessment, AssessmentQuestion, Goal, SyllabusTopic, Task, SubjectId } from '../types';
import { agreedGoalFor } from './fixUpConversion';
import { addDaysISO } from '../utils/date';
import { newId } from '../utils/id';

/**
 * Which questions lost marks.
 *
 * Marks are the whole test. An earlier version also required `errorType !== 'NONE'`,
 * but a new question row defaults to no cause recorded - so a student who logged a
 * wrong answer without expanding the row and picking a reason got no fix-up task at
 * all, while the interface promised one unconditionally. The cause is useful
 * metadata for prioritising; it is not evidence that a mark was dropped.
 */
export function questionsWithDroppedMarks(
  questions: AssessmentQuestion[]
): AssessmentQuestion[] {
  return questions.filter(
    (q) => Number(q.marksScored) < Number(q.marksAvailable)
  );
}

/**
 * Turns dropped marks into scheduled work. A record that is only ever read does
 * not change what a student does next; a task on Thursday's list does.
 *
 * Pure and exported so it can be tested without rendering the modal - the
 * original bug survived precisely because this logic was buried in a submit
 * handler where no test could reach it.
 */
export function buildFixUpTasks(
  record: Assessment,
  /**
   * Goals and topics, so a fix-up from a paper is filed like any other: under
   * the subject's agreed goal, and under the topic the question named when one
   * matches. Without them its time counted towards no goal and its topic page
   * never heard of it.
   */
  context: { goals?: Goal[]; topics?: SyllabusTopic[] } = {}
): Task[] {
  const now = Date.now();
  const dueDate = addDaysISO(3);
  const linkedGoalId = agreedGoalFor(record.subjectId, context.goals ?? []);

  return questionsWithDroppedMarks(record.questions).map((q) => {
    const lost = Number(q.marksAvailable) - Number(q.marksScored);
    const cause =
      q.errorType && q.errorType !== 'NONE'
        ? `Cause logged: ${q.errorType.replace(/_/g, ' ').toLowerCase()}.`
        : '';

    return {
      id: newId('task'),
      subjectId: record.subjectId as SubjectId,
      title: `Fix up ${q.questionNumber}${q.topic ? ` - ${q.topic}` : ''} (${record.title})`,
      /**
       * In the fix-up's own field, where every other fix-up keeps it and the
       * close sheet shows it. A description is where homework keeps its notes;
       * a fix-up from a paper put its mistake there, so it was the one kind of
       * fix-up whose "what went wrong" read blank.
       */
      whatWentWrong: [`Lost ${lost} of ${q.marksAvailable} marks.`, cause, q.notes || '']
        .filter(Boolean)
        .join(' '),
      linkedGoalId,
      linkedTopicId: topicNamed(record.subjectId, q.topic, context.topics ?? []),
      dueDate,
      // A recorded knowledge gap is the one cause that will not fix itself with
      // practice, so it jumps the queue. Everything else is MEDIUM, including
      // questions where no cause was recorded.
      priority: q.errorType === 'KNOWLEDGE_GAP' ? 'HIGH' : 'MEDIUM',
      isHomework: false,
      isRemediation: true,
      remediationSourceDoc: record.title,
      xpValue: 50,
      completed: false,
      createdAt: now,
    };
  });
}

/**
 * The syllabus topic a question's own topic text names, if one does - matched
 * on the title, ignoring case and spacing. Only an exact name counts: a guess
 * that filed a fix-up under the wrong topic would be worse than none, which
 * leaves it in the topic inbox to be tagged.
 */
export function topicNamed(
  subjectId: string,
  text: string | undefined,
  topics: SyllabusTopic[]
): string | undefined {
  const key = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!text?.trim()) return undefined;
  return topics.find((t) => t.subjectId === subjectId && key(t.title) === key(text))?.id;
}

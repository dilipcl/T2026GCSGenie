import { Assessment, AssessmentQuestion, Task, SubjectId } from '../types';
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
export function buildFixUpTasks(record: Assessment): Task[] {
  const now = Date.now();
  const dueDate = addDaysISO(3);

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
      description: [
        `Lost ${lost} of ${q.marksAvailable} marks.`,
        cause,
        q.notes || '',
      ]
        .filter(Boolean)
        .join(' '),
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

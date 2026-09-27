import { db } from '../db';
import { SubjectId, SyllabusTopic, UserRole } from '../types';
import { logAuditEvent } from './auditService';
import { newId } from '../utils/id';
import { todayISO } from '../utils/date';

export interface NewTopicInput {
  subjectId: SubjectId;
  title: string;
  unit?: string;
  isRequiredPractical?: boolean;
  driveNotesUrl?: string;
  /** Defaults to today. A topic added from Tuesday's lesson was taught on Tuesday. */
  dateTaught?: string;
}

/**
 * Adds a syllabus topic, with the defaults a Year 10 topic starts from.
 *
 * Topics can now be created from two places - the subject screen and the lesson
 * row, where somebody tagging a lesson finds the topic it covered is not on the
 * list yet. Two copies of these defaults would drift the first time either was
 * tuned, and the drift would show up as topics from one screen sorting or
 * scoring differently from the other.
 */
export async function addSyllabusTopic(
  input: NewTopicInput,
  user: UserRole = 'STUDENT'
): Promise<SyllabusTopic> {
  const topic: SyllabusTopic = {
    id: newId('topic'),
    subjectId: input.subjectId,
    unit: input.unit?.trim() || 'Year 10',
    title: input.title.trim(),
    isCompleted: false,
    confidenceRating: 3,
    isImportantForGrade9: true,
    isRequiredPractical: input.isRequiredPractical ?? false,
    yearGroup: 'YEAR_10',
    dateTaught: input.dateTaught ?? todayISO(),
    driveNotesUrl: input.driveNotesUrl?.trim() || undefined,
  };

  await db.syllabusTopics.add(topic);
  await logAuditEvent({
    user,
    action: 'INSERT',
    entity: 'SyllabusTopic',
    entityId: topic.id,
    newValue: `Added Year 10 Topic: ${topic.title} [${topic.unit}]`,
  });

  return topic;
}

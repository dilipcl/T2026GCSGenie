import { db } from '../db';
import { ProofAttachment, SubjectId } from '../types';

/**
 * Where the proof for a piece of work actually is - and whether there is any.
 *
 * The question that prompted this was ordinary and the app could not answer it:
 * "did he add the links and images for the Physics electricity session?" Every
 * ingredient existed and none of them were in one place. Photos live in
 * `attachments`, keyed by `ownerId`. Links live on the records themselves,
 * under five different field names - `driveProofUrl` on a task,
 * `driveNotesUrl` on a topic and on a goal, `driveNotebookUrl` on a
 * remediation, `driveResourceUrl` on an assessment. Answering meant knowing all
 * five and checking two tables by hand.
 *
 * So evidence is defined once here, for every kind of work that can carry it,
 * and both the activity feed and the validation check read it from this module
 * rather than each re-deriving which field counts.
 *
 * A deliberate limit worth stating: this reports whether a link *exists*, not
 * whether it opens or points at the right thing. The app cannot follow a Drive
 * URL - it has no permission to, and a link that 404s for the app may be fine
 * for the family. Claiming to have verified a link would be a stronger promise
 * than the check can keep.
 */

export type EvidenceKind = 'FILE' | 'LINK';

export interface EvidenceRef {
  kind: EvidenceKind;
  /** Filename, or a human label for a link. */
  label: string;
  /** Openable address, when there is one. */
  url?: string;
  /**
   * A file saved into the Drive backup folder that has no URL. The desktop
   * folder transport never learns the id Drive assigns, so the file is safe but
   * unlinkable - which is neither "missing" nor "openable".
   */
  savedWithoutLink?: boolean;
  /** Which field it came from, so the UI can say where to look. */
  source: string;
}

/** The kinds of record that can carry proof. */
export type EvidenceEntity =
  | 'Task'
  | 'Syllabus topic'
  | 'Goal'
  | 'Assessment'
  | 'Fix-up'
  | 'Key date';

export interface EvidenceSubject {
  entity: EvidenceEntity;
  entityId: string;
  title: string;
  subjectId?: SubjectId;
  /** Whether the work itself is finished. Unfinished work is not expected to have proof. */
  completed: boolean;
  completedAt?: number;
  evidence: EvidenceRef[];
  hasEvidence: boolean;
  /**
   * Finished work of a kind that should show its working, with nothing
   * attached. The one actionable state.
   */
  missingEvidence: boolean;
}

const link = (url: string | undefined, source: string, label: string): EvidenceRef[] =>
  url && url.trim() ? [{ kind: 'LINK', label, url: url.trim(), source }] : [];

function filesFor(
  ownerId: string,
  attachments: ProofAttachment[]
): EvidenceRef[] {
  return attachments
    .filter((a) => a.ownerId === ownerId)
    .map((a) => ({
      kind: 'FILE' as const,
      label: a.caption?.trim() || a.fileName,
      url: a.driveViewUrl,
      savedWithoutLink: !!a.driveMirroredAt && !a.driveViewUrl,
      source: 'Proof photo',
    }));
}

/**
 * Every piece of work that can carry proof, with whatever proof it has.
 *
 * One pass over each table rather than a query per row: the check runs over the
 * whole database and a per-row lookup would be hundreds of round trips.
 */
export async function evidenceIndex(): Promise<EvidenceSubject[]> {
  const [tasks, topics, goals, assessments, remediations, milestones, attachments] =
    await Promise.all([
      db.tasks.toArray(),
      db.syllabusTopics.toArray(),
      db.goals.toArray(),
      db.assessments.toArray(),
      db.remediations.toArray(),
      db.milestones.toArray(),
      db.attachments.toArray(),
    ]);

  const subjects: EvidenceSubject[] = [];

  const push = (
    entity: EvidenceEntity,
    entityId: string,
    title: string,
    completed: boolean,
    evidence: EvidenceRef[],
    options: { subjectId?: SubjectId; completedAt?: number; proofExpected: boolean }
  ) => {
    subjects.push({
      entity,
      entityId,
      title,
      subjectId: options.subjectId,
      completed,
      completedAt: options.completedAt,
      evidence,
      hasEvidence: evidence.length > 0,
      missingEvidence: completed && options.proofExpected && evidence.length === 0,
    });
  };

  for (const task of tasks) {
    push(
      'Task',
      task.id,
      task.title,
      task.completed,
      [
        ...filesFor(task.id, attachments),
        ...link(task.driveProofUrl, 'Drive proof link', task.title),
      ],
      {
        subjectId: task.subjectId,
        completedAt: task.completedAt,
        /**
         * Homework and fix-ups are marked by somebody else, or exist because
         * something went wrong - both are worth being able to show. A task the
         * student set themselves is not held to that.
         */
        proofExpected: task.isHomework || task.isRemediation,
      }
    );
  }

  for (const topic of topics) {
    push(
      'Syllabus topic',
      topic.id,
      topic.title,
      topic.isCompleted,
      [
        ...filesFor(topic.id, attachments),
        ...link(topic.driveNotesUrl, 'Notes link', topic.title),
      ],
      // A topic ticked off with no notes anywhere is the classic "covered it,
      // cannot revise from it" case.
      { subjectId: topic.subjectId, proofExpected: true }
    );
  }

  for (const goal of goals) {
    push(
      'Goal',
      goal.id,
      goal.title,
      goal.status === 'COMPLETED',
      [...filesFor(goal.id, attachments), ...link(goal.driveNotesUrl, 'Notes link', goal.title)],
      { subjectId: goal.subjectId, proofExpected: false }
    );
  }

  for (const assessment of assessments) {
    const attached = assessment.attachmentIds
      .map((id) => attachments.find((a) => a.id === id))
      .filter((a): a is ProofAttachment => !!a)
      .map((a) => ({
        kind: 'FILE' as const,
        label: a.caption?.trim() || a.fileName,
        url: a.driveViewUrl,
        savedWithoutLink: !!a.driveMirroredAt && !a.driveViewUrl,
        source: 'Marked paper',
      }));

    push(
      'Assessment',
      assessment.id,
      assessment.title,
      true,
      [
        ...attached,
        ...filesFor(assessment.id, attachments),
        ...link(assessment.driveResourceUrl, 'Paper link', assessment.title),
      ],
      // The proof log exists to hold evidence. An entry without any is the
      // thing this whole feature is about.
      { subjectId: assessment.subjectId, completedAt: assessment.createdAt, proofExpected: true }
    );
  }

  for (const item of remediations) {
    push(
      'Fix-up',
      item.id,
      item.taskTitle,
      item.isCompleted,
      [
        ...filesFor(item.id, attachments),
        ...link(item.driveNotebookUrl, 'Working link', item.taskTitle),
      ],
      { subjectId: item.subjectId, completedAt: item.completedAt, proofExpected: true }
    );
  }

  for (const milestone of milestones) {
    push(
      'Key date',
      milestone.id,
      milestone.title,
      milestone.isCompleted,
      [
        ...filesFor(milestone.id, attachments),
        ...link(milestone.driveResourceUrl, 'Resource link', milestone.title),
      ],
      { subjectId: milestone.subjectId, proofExpected: false }
    );
  }

  return subjects;
}

/**
 * Finished work of a kind that should show its working, with nothing attached.
 *
 * Newest first: the question is almost always about what was just done.
 */
export async function workMissingEvidence(): Promise<EvidenceSubject[]> {
  const all = await evidenceIndex();
  return all
    .filter((item) => item.missingEvidence)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}

/**
 * Free-text lookup - "physics electricity" - across every kind of work.
 *
 * Every term must appear somewhere in the title, rather than any of them.
 * "Physics electricity" asking for anything mentioning physics *or* electricity
 * returns most of the database and answers nothing.
 */
export function matches(item: EvidenceSubject, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = `${item.title} ${item.subjectId ?? ''} ${item.entity}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export async function findEvidence(query: string): Promise<EvidenceSubject[]> {
  const all = await evidenceIndex();
  return all
    .filter((item) => matches(item, query))
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}

export interface EvidenceSummary {
  /** Work that should show its working. */
  expected: number;
  withEvidence: number;
  missing: number;
  /** Files saved to Drive that have no openable link. */
  savedWithoutLink: number;
}

export async function evidenceSummary(): Promise<EvidenceSummary> {
  const all = await evidenceIndex();
  const expected = all.filter((i) => i.completed && (i.missingEvidence || i.hasEvidence));

  return {
    expected: expected.length,
    withEvidence: expected.filter((i) => i.hasEvidence).length,
    missing: all.filter((i) => i.missingEvidence).length,
    savedWithoutLink: all.reduce(
      (count, item) => count + item.evidence.filter((e) => e.savedWithoutLink).length,
      0
    ),
  };
}

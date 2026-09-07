import { db } from '../db';
import { ActivityComment, ProofAttachment, SubjectId, UserRole } from '../types';
import { evidenceComments } from './activityCommentService';
import { logAuditEvent } from './auditService';

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

/**
 * Where a piece of evidence gets written, for each kind of record.
 *
 * The read side of this module already had to know that a link lives under
 * `driveProofUrl` on a task and `driveNotebookUrl` on a fix-up. What it did not
 * have was the other direction, and the consequence was worse than untidy: the
 * Evidence tab could tell you a piece of homework had been marked done with
 * nothing attached, and the only thing it could offer you was to ask somebody
 * about it on WhatsApp. There was no path anywhere in the app that put a link
 * or a photo onto a task at all. Tejas asked how evidence is added; the honest
 * answer was that for the most common kind of work, it could not be.
 *
 * So the same table drives both directions. A field named here is read back by
 * `evidenceIndex` above, which is what makes attaching something actually clear
 * the row it was attached for.
 */
export interface EvidenceTarget {
  /** The Dexie table holding the record. */
  table: 'tasks' | 'syllabusTopics' | 'goals' | 'assessments' | 'remediations' | 'milestones';
  /** The field a link goes in - the same one the index reads back. */
  linkField: 'driveProofUrl' | 'driveNotesUrl' | 'driveResourceUrl' | 'driveNotebookUrl';
  /** How a photo attached to this record is keyed. */
  ownerType: ProofAttachment['ownerType'];
  /** What the link is called on screen, in the words the record uses for it. */
  linkLabel: string;
}

export const EVIDENCE_TARGETS: Record<EvidenceEntity, EvidenceTarget> = {
  Task: {
    table: 'tasks',
    linkField: 'driveProofUrl',
    ownerType: 'TASK',
    linkLabel: 'Drive proof link',
  },
  'Syllabus topic': {
    table: 'syllabusTopics',
    linkField: 'driveNotesUrl',
    ownerType: 'TOPIC',
    linkLabel: 'Notes link',
  },
  Goal: {
    table: 'goals',
    linkField: 'driveNotesUrl',
    ownerType: 'GOAL',
    linkLabel: 'Notes link',
  },
  Assessment: {
    table: 'assessments',
    linkField: 'driveResourceUrl',
    ownerType: 'ASSESSMENT',
    linkLabel: 'Paper link',
  },
  'Fix-up': {
    table: 'remediations',
    linkField: 'driveNotebookUrl',
    ownerType: 'REMEDIATION',
    linkLabel: 'Working link',
  },
  'Key date': {
    table: 'milestones',
    linkField: 'driveResourceUrl',
    ownerType: 'MILESTONE',
    linkLabel: 'Resource link',
  },
};

/**
 * A link that can actually be opened later.
 *
 * Deliberately permissive about which host it points at - Drive, OneNote, a
 * school portal and a shared photo album are all legitimate places for a
 * fourteen-year-old's working to live, and a whitelist would only teach people
 * to paste the link somewhere the app cannot see. It refuses what cannot be a
 * link at all, which is the part that would otherwise be stored and then fail
 * silently at the moment somebody needs it.
 */
export function isUsableLink(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Puts a link onto the record it is proof of.
 *
 * Written through the audit log like every other consequential change. Evidence
 * arriving is exactly as interesting as evidence being asked for, and until now
 * only the asking left a trace.
 */
export async function saveEvidenceLink(
  entity: EvidenceEntity,
  entityId: string,
  url: string,
  user: UserRole = 'STUDENT'
): Promise<void> {
  const target = EVIDENCE_TARGETS[entity];
  const trimmed = url.trim();

  if (trimmed && !isUsableLink(trimmed)) {
    throw new Error('That does not look like a link. It should start with https://');
  }

  /**
   * Dispatched by hand rather than through `db[target.table].update(...)`.
   *
   * Dexie types each table against its own row, so indexing the database by a
   * variable collapses six update signatures into their intersection and
   * nothing satisfies it. The switch is longer and the compiler checks every
   * arm of it, which is the trade worth making for the one function that writes
   * to six tables.
   */
  const previous = await currentLink(entity, entityId);
  const value = trimmed || undefined;

  switch (entity) {
    case 'Task':
      await db.tasks.update(entityId, { driveProofUrl: value });
      break;
    case 'Syllabus topic':
      await db.syllabusTopics.update(entityId, { driveNotesUrl: value });
      break;
    case 'Goal':
      await db.goals.update(entityId, { driveNotesUrl: value });
      break;
    case 'Assessment':
      await db.assessments.update(entityId, { driveResourceUrl: value });
      break;
    case 'Fix-up':
      await db.remediations.update(entityId, { driveNotebookUrl: value });
      break;
    case 'Key date':
      await db.milestones.update(entityId, { driveResourceUrl: value });
      break;
  }

  await logAuditEvent({
    user,
    action: 'UPDATE',
    entity,
    entityId,
    fieldChanged: target.linkField,
    oldValue: previous ?? '(none)',
    newValue: trimmed || '(removed)',
  });
}

/** The link a record already carries, if any. Read before overwriting it. */
async function currentLink(
  entity: EvidenceEntity,
  entityId: string
): Promise<string | undefined> {
  switch (entity) {
    case 'Task':
      return (await db.tasks.get(entityId))?.driveProofUrl;
    case 'Syllabus topic':
      return (await db.syllabusTopics.get(entityId))?.driveNotesUrl;
    case 'Goal':
      return (await db.goals.get(entityId))?.driveNotesUrl;
    case 'Assessment':
      return (await db.assessments.get(entityId))?.driveResourceUrl;
    case 'Fix-up':
      return (await db.remediations.get(entityId))?.driveNotebookUrl;
    case 'Key date':
      return (await db.milestones.get(entityId))?.driveResourceUrl;
  }
}

export interface EvidenceSubject {
  entity: EvidenceEntity;
  entityId: string;
  title: string;
  subjectId?: SubjectId;
  /** Whether the work itself is finished. Unfinished work is not expected to have proof. */
  completed: boolean;
  completedAt?: number;
  /**
   * When it was meant to be done, where the record has a date at all.
   *
   * Carried because "marked done with nothing attached" is not, on its own,
   * enough to act on: the first thing anybody asks about such a row is which
   * piece of work it actually was, and a due date is usually what pins it
   * down.
   */
  dueDate?: string;
  evidence: EvidenceRef[];
  hasEvidence: boolean;
  /**
   * Finished work of a kind that should show its working, with nothing
   * attached. The one actionable state.
   */
  missingEvidence: boolean;
  /**
   * Requests for this evidence that nobody has answered yet.
   *
   * Carried so the tab can separate "nothing attached" from "nothing attached
   * and already chased" - which are different situations for whoever is
   * reading, and asking twice is how a parent stops being taken seriously.
   */
  openRequests?: ActivityComment[];
  /**
   * Reasons somebody has given for there being no proof.
   *
   * "It was classwork, the book is in school" is a complete answer to a missing
   * evidence row, and until there was somewhere to write it the only way to
   * clear the row was to attach something that did not exist. A note does not
   * make the evidence appear - `missingEvidence` stays true - but it does make
   * the row explained, which is what stops it being chased again.
   */
  notes?: ActivityComment[];
  /** Missing its proof, but with a reason on record. Not actionable. */
  explained: boolean;
  /** Missing its proof with nothing said about it. The one thing to chase. */
  unexplained: boolean;
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
  const [
    tasks,
    topics,
    goals,
    assessments,
    remediations,
    milestones,
    attachments,
    comments,
  ] = await Promise.all([
      db.tasks.toArray(),
      db.syllabusTopics.toArray(),
      db.goals.toArray(),
      db.assessments.toArray(),
      db.remediations.toArray(),
      db.milestones.toArray(),
      db.attachments.toArray(),
      evidenceComments(),
    ]);

  const { requests, notes } = comments;

  const subjects: EvidenceSubject[] = [];

  const push = (
    entity: EvidenceEntity,
    entityId: string,
    title: string,
    completed: boolean,
    evidence: EvidenceRef[],
    options: {
      subjectId?: SubjectId;
      completedAt?: number;
      dueDate?: string;
      proofExpected: boolean;
    }
  ) => {
    const missingEvidence = completed && options.proofExpected && evidence.length === 0;
    const given = notes.get(entityId);

    subjects.push({
      entity,
      entityId,
      title,
      subjectId: options.subjectId,
      completed,
      completedAt: options.completedAt,
      dueDate: options.dueDate,
      evidence,
      hasEvidence: evidence.length > 0,
      missingEvidence,
      openRequests: requests.get(entityId),
      notes: given,
      /**
       * Explained and unexplained are both derived here rather than left to
       * each caller, because "missing" on its own has been read two different
       * ways by two different screens - the tab counting every gap and the
       * inbox wanting only the ones still worth chasing - and the moment those
       * two definitions live in separate files they drift.
       */
      explained: missingEvidence && (given?.length ?? 0) > 0,
      unexplained: missingEvidence && (given?.length ?? 0) === 0,
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
        dueDate: task.dueDate,
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
      { subjectId: milestone.subjectId, dueDate: milestone.date, proofExpected: false }
    );
  }

  return subjects;
}

/**
 * When this family's app first offered to attach evidence as work is closed.
 *
 * Read by the XP statement, and by nothing else. The distinction is worth
 * stating because it is easy to get backwards: the Evidence *tab* deliberately
 * lists every gap regardless of age, because a gap is a gap and old work can
 * still have its photo added retroactively. What is date-gated is the
 * *accusation* in the XP log - "closed without doing the step you were offered"
 * - which is simply untrue of work closed before the step existed.
 */
export async function evidenceOnCloseFrom(): Promise<number | undefined> {
  return (await db.parentSettings.get('active_settings'))?.evidenceOnCloseFrom;
}

/**
 * Records that the close-with-evidence step is available, the first time the
 * app runs a build that has it.
 *
 * Written once and never rewritten - a later device opening the app must not
 * move the line forward and un-flag work that was closed with the step fully
 * available. Silently does nothing if there is no settings row yet; the next
 * open will catch it, and being a day late is harmless where being wrong is
 * not.
 */
export async function markEvidenceOnCloseAvailable(at: number = Date.now()): Promise<void> {
  const settings = await db.parentSettings.get('active_settings');
  if (!settings || settings.evidenceOnCloseFrom !== undefined) return;

  await db.parentSettings.update('active_settings', { evidenceOnCloseFrom: at });
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
 * Finished work with no proof and no explanation, newest first.
 *
 * What the inbox nags about, as distinct from what the tab lists. A row
 * somebody has already accounted for is not outstanding, and continuing to
 * count it is how a to-do list acquires items that can never be cleared.
 */
export async function workNeedingEvidence(): Promise<EvidenceSubject[]> {
  const all = await evidenceIndex();
  return all
    .filter((item) => item.unexplained)
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
  /** Missing, with a reason on record. Counted, not chased. */
  explained: number;
  /** Missing with nothing said about it. The number worth acting on. */
  unexplained: number;
  /** Files saved to Drive that have no openable link. */
  savedWithoutLink: number;
  /** Requests for evidence that nobody has answered. */
  awaitingReply: number;
}

export async function evidenceSummary(): Promise<EvidenceSummary> {
  const all = await evidenceIndex();
  const expected = all.filter((i) => i.completed && (i.missingEvidence || i.hasEvidence));

  return {
    expected: expected.length,
    withEvidence: expected.filter((i) => i.hasEvidence).length,
    missing: all.filter((i) => i.missingEvidence).length,
    explained: all.filter((i) => i.explained).length,
    unexplained: all.filter((i) => i.unexplained).length,
    savedWithoutLink: all.reduce(
      (count, item) => count + item.evidence.filter((e) => e.savedWithoutLink).length,
      0
    ),
    awaitingReply: all.filter((i) => (i.openRequests?.length ?? 0) > 0).length,
  };
}

/** Work somebody has asked about and nobody has answered, oldest ask first. */
export async function awaitingEvidenceReply(): Promise<EvidenceSubject[]> {
  const all = await evidenceIndex();
  return all
    .filter((item) => (item.openRequests?.length ?? 0) > 0)
    .sort(
      (a, b) => (a.openRequests![0].createdAt ?? 0) - (b.openRequests![0].createdAt ?? 0)
    );
}

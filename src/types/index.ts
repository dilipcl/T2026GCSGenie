// ============================================================================
// GCSE GENIE: MASTER TYPE DEFINITIONS (v2.0 Enhanced)
// ============================================================================

import type { ParentCredential } from '../utils/credential';

export type { ParentCredential };

export type SubjectId =
  | 'maths'
  | 'english_lang'
  | 'english_lit'
  | 'biology'
  | 'chemistry'
  | 'physics'
  | 'history'
  | 'computer_science'
  | 'art'
  | 'general'
  | 'revision';

/**
 * Subjects that exist so a task always has somewhere to go, not because they
 * are examined.
 *
 * Work happens on weekends, in half term and on bank holidays, and before these
 * existed the only way to log it was to attribute it to a real subject or not
 * log it at all - so Tejas picked something arbitrary on 30 August and the data
 * inherited a lie. Making `subjectId` optional would have been the smaller
 * change and the worse one: every analysis over the task table would then have
 * to decide what a null means, and they would not all decide the same way.
 *
 * These carry no exam board and no target grade, so they are excluded from RAG
 * health and syllabus coverage - a subject with nothing to master would sit at
 * a permanent RED and drag the dashboard down. They still count towards
 * workload and goal hours, because the time is real either way.
 */
export const NON_EXAM_SUBJECTS: readonly SubjectId[] = ['general', 'revision'] as const;

export function isNonExamSubject(id: SubjectId | undefined | null): boolean {
  return !!id && NON_EXAM_SUBJECTS.includes(id);
}

export type UserRole = 'STUDENT' | 'PARENT' | 'SYSTEM_AGENT';
export type RAGStatus = 'RED' | 'AMBER' | 'GREEN';
export type GoalStatus = 'DRAFT' | 'PENDING_DISCUSSION' | 'APPROVED_LOCKED' | 'COMPLETED' | 'DEFERRED';
export type PriorityLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type LLMProvider = 'GEMINI' | 'CLAUDE' | 'OPENAI' | 'LOCAL';
export type WeekType = 'ODD' | 'EVEN' | 'BOTH';
export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
export type CheckInSession = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'STUDY_SESSION';

export interface SubjectConfig {
  id: SubjectId;
  name: string;
  shortName: string;
  examBoard: 'Edexcel' | 'AQA' | 'OCR' | string;
  targetGrade: number; // e.g. 9
  currentEstimatedGrade: number; // 1-9
  color: string;
  icon: string;
  teacherName: string;
  teacherEmail?: string;
  teacherNotes?: string;
  courseworkWeight?: number;
  examStructure: string;
  driveFolderUrl?: string; // Link to Google Drive folder for this subject
  manualRAGOverride?: RAGStatus | null; // Manual override if parent/student wants to force RAG
  manualHealthScore?: number | null; // Optional manual health score 0-100
}

export interface SyllabusTopic {
  id: string;
  subjectId: SubjectId;
  unit: string;
  title: string;
  isCompleted: boolean;
  confidenceRating: 1 | 2 | 3 | 4 | 5; // 1 = Red, 5 = Mastered
  isImportantForGrade9: boolean;
  isRequiredPractical?: boolean;
  yearGroup?: 'YEAR_9' | 'YEAR_10' | 'YEAR_11';
  dateTaught?: string; // YYYY-MM-DD
  driveNotesUrl?: string; // Link to Google Notebook / Drive file for this topic
}

export interface StructuredCheckInNotes {
  blockersAndQuestions?: string; // e.g., Questions to ask teacher tomorrow
  keyLearning?: string; // What was the main takeaway today?
  actionForTomorrow?: string; // Action items for next day
  generalNotes?: string;
  category?: 'ACADEMIC' | 'CO_CURRICULAR' | 'PERSONAL' | 'WELL_BEING';
}

export interface DailyCheckIn {
  id: string; // Globally unique - see utils/id.ts
  date: string; // YYYY-MM-DD
  timestamp: number;
  session: CheckInSession;
  energyLevel: 1 | 2 | 3 | 4 | 5;
  focusRating: 'LOW' | 'NORMAL' | 'HIGH';
  completedHomeworkIds: string[];
  completedRevisionMinutes: number;
  /**
   * Which subject the logged minutes were spent on.
   *
   * Study time used to go into a single global bucket, which is why a locked
   * goal could reserve 3.5 hrs/week in the capacity model and the app still had
   * nothing to say about whether any of them had been worked. Optional, because
   * a check-in with no study time attached does not need one and older rows do
   * not have one.
   */
  studySubjectId?: SubjectId;
  /** Set when the session was worked against one specific goal. */
  studyGoalId?: string;
  structuredNotes?: StructuredCheckInNotes;
  notes?: string; // Legacy fallback
  xpEarned: number;
  isDailyBaseXPAwarded: boolean; // True if this check-in awarded the +10 XP daily base reward
}

/**
 * Which horizon a task sits in. The Work tab was one flat date-sorted list, so
 * a task due in October sat beside tomorrow's homework and there was no moment
 * where Tejas decided what he was actually taking on this week.
 *
 * THIS_WEEK is a promise; the other two are a backlog and carry no guilt. Only
 * committed work counts towards the weekly load and the slipping nudge.
 */
export type PlanBucket = 'THIS_WEEK' | 'NEXT_UP' | 'LATER';

export interface Task {
  id: string;
  subjectId: SubjectId;
  /** Undefined on older rows; treated as LATER until it is planned. */
  bucket?: PlanBucket;
  /** When it was moved into THIS_WEEK, so a commitment can be dated. */
  committedAt?: number;
  /** Rough hours, used by the planner's live workload total. */
  estimatedHours?: number;
  title: string;
  description?: string;
  dueDate: string;
  priority: PriorityLevel;
  isHomework: boolean;
  isRemediation: boolean;
  remediationSourceDoc?: string;
  linkedGoalId?: string;
  linkedTopicId?: string;
  xpValue: number;
  completed: boolean;
  completedAt?: number;
  createdAt: number;
  driveProofUrl?: string;
  score?: { scored: number; total: number };
}

export interface Goal {
  id: string;
  title: string;
  category: 'ACADEMIC_GRADE_9' | 'CO_CURRICULAR' | 'PERSONAL';
  subjectId?: SubjectId;
  targetDate?: string;
  priority?: PriorityLevel;
  smartSpecific: string;
  smartMeasurable: string;
  smartAchievable: string;
  smartRealistic: string;
  smartTimeBound: string;
  status: GoalStatus;
  ragStatus: RAGStatus;
  weeklyHoursRequired: number;
  parentNotes?: string;
  driveNotesUrl?: string;
  lockedAt?: number;
  createdAt: number;
}

export interface TimetableSlotConfig {
  id: string;
  name: string;
  defaultStartTime: string;
  defaultEndTime: string;
  isBreakOrLunch: boolean;
}

export interface TimetableEntry {
  id: string;
  weekType: WeekType;
  dayOfWeek: DayOfWeek;
  slotName: string;
  startTime: string;
  endTime: string;
  subjectId?: SubjectId;
  activityName: string;
  room?: string;
  isHardLocked: boolean;
}

export interface RemediationAction {
  id: string;
  subjectId: SubjectId;
  sourceDoc: string; // e.g. "yr9- maths.pdf (Score: 60/75)"
  diagnosticError: string;
  taskTitle: string;
  taskInstructions: string;
  formulaOrHint?: string;
  /**
   * Practice questions used to live here. They were removed in August 2026:
   * a single question inside a modal is neither real practice nor useful source
   * material, and Genie's job is to record where the real work lives, not to
   * host a quiz. A quest is now instructions plus the proof that they were
   * followed - see taskInstructions and the proof fields below.
   */
  xpReward: number;
  isCompleted: boolean;
  completedAt?: number;
  driveNotebookUrl?: string; // Link to Google Notebook / Drive working proof
  selfStudyScore?: { scored: number; total: number; percentage: number };
  studentWorkingNotes?: string; // Student's own calculations / solution steps
  weakAreasIdentified?: string; // Notes on sub-areas that need work
  followUpQuestIds?: string[]; // IDs of generated follow-up quests
  parentQuestId?: string; // If this is a follow-up sub-quest
}

export interface MilestoneReminder {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  category:
    | 'EXAM_MOCK'
    | 'PORTFOLIO_DEADLINE'
    | 'COURSEWORK'
    | 'REQUIRED_PRACTICAL'
    | 'CADETS'
    | 'PERSONAL_TARGET';
  subjectId?: SubjectId;
  priority: PriorityLevel;
  isCompleted: boolean;
  notes?: string;
  driveResourceUrl?: string;
  createdAt: number;
}

/**
 * A single marked question inside an assessment. `marksScored` vs `marksAvailable`
 * is what makes the record evidence rather than a claim - a percentage on its own
 * cannot tell you which topic went wrong.
 */
export interface AssessmentQuestion {
  id: string;
  questionNumber: string; // e.g. "Q1", "Q4 (b)"
  topic?: string; // what the question actually tested
  marksAvailable: number;
  marksScored: number;
  questionText?: string;
  yourAnswer?: string;
  correctAnswer?: string; // mark scheme / model answer
  errorType?: 'NONE' | 'CARELESS' | 'METHOD' | 'KNOWLEDGE_GAP' | 'MISREAD' | 'TIMING';
  notes?: string;
}

export type AssessmentType =
  | 'CLASS_TEST'
  | 'END_OF_TOPIC'
  | 'MOCK_EXAM'
  | 'PAST_PAPER'
  | 'MARKED_HOMEWORK'
  | 'REQUIRED_PRACTICAL';

/**
 * A marked piece of work with its evidence attached. This is the proof log: the
 * score, the per-question breakdown, and photographs of the actual paper.
 */
export interface Assessment {
  id: string;
  subjectId: SubjectId;
  title: string;
  type: AssessmentType;
  date: string; // YYYY-MM-DD
  marksScored: number;
  marksAvailable: number;
  percentage: number; // derived on save, stored so lists sort without recomputing
  gradeAwarded?: string; // "8", "A*", "Level 2 Merit"
  teacherName?: string;
  teacherFeedback?: string;
  questions: AssessmentQuestion[];
  attachmentIds: string[];
  driveResourceUrl?: string;
  weakTopics?: string;
  followUpTaskIds?: string[]; // fix-up tasks spawned from the wrong answers
  verifiedByParent?: boolean;
  verifiedAt?: number;
  createdAt: number;
}

/**
 * Binary proof (a photo of the paper, a scanned mark scheme, a PDF) held in
 * IndexedDB alongside the record it belongs to. Images are downscaled on the way
 * in - see attachmentService - because a backup bundle has to stay a file a
 * person can actually put in Google Drive.
 */
export interface ProofAttachment {
  id: string;
  ownerType: 'ASSESSMENT' | 'TASK' | 'REMEDIATION' | 'MILESTONE' | 'TOPIC';
  ownerId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  blob: Blob;
  caption?: string;
  createdAt: number;
  /**
   * Where a copy of this file lives outside the database.
   *
   * The blob is the original and stays local so the app works offline. The
   * mirror exists because a JSON backup cannot carry a blob - every export sets
   * `attachmentsOmitted`, so restoring from one has always silently lost every
   * photo in the proof log.
   *
   * Which fields get filled depends on the transport, and they are not
   * equivalent:
   *
   *  - The desktop folder writes a real file into `_Genie-Backups/Attachments`,
   *    which Drive for Desktop uploads. That preserves the file, but the app
   *    never learns the id Drive assigns it, so there is no URL to link to -
   *    only `driveMirroredAt` and `mirrorFileName` are set.
   *  - The Drive API returns an id and a link, so `driveFileId` and
   *    `driveViewUrl` are both available and the activity feed can hyperlink it.
   *
   * The UI must not imply a link exists when only the first ran.
   */
  driveMirroredAt?: number;
  mirrorFileName?: string;
  driveFileId?: string;
  driveViewUrl?: string;
  /** Why the last mirror attempt failed, so it is not retried silently forever. */
  mirrorError?: string;
}

/**
 * A recurring real-world commitment that occupies time whether or not anyone
 * plans for it: school, cadets, drums, DofE.
 *
 * These used to be a hardcoded `const` inside burnoutEngine, which had two
 * consequences. Quitting drums - or simply having a second child - needed a
 * source change; and an absence cannot be logged against a `const`, so a missed
 * parade night still counted its three hours and the burnout gauge told the
 * family the week was fuller than it was.
 *
 * `timetableEntryIds` is what makes an absence concrete. The same commitments
 * already existed as hard-locked timetable rows, unlinked, and one of them had
 * silently drifted out of agreement; joining them means "log absence" on
 * Tuesday knows which occasion it is cancelling and for how many hours.
 */
export interface FixedCommitment {
  id: string;
  label: string;
  weeklyHours: number;
  /**
   * Archived rather than deleted, following the chore precedent: seeding
   * re-inserts any absent row it knows about, so a deleted commitment would
   * come back on the next open, and past exceptions would point at nothing.
   */
  isActive: boolean;
  /** Hard-locked timetable rows this commitment is actually made of. */
  timetableEntryIds: string[];
  /**
   * What one missed occasion costs, when the timetable cannot say.
   *
   * A cadets absence is three hours, not the full six. Where a linked timetable
   * row covers the date its real duration wins; this is the fallback, and the
   * only answer available for school, whose periods are generated rather than
   * enumerated.
   */
  hoursPerOccasion: number;
  /**
   * An approved goal representing the same real hours. Those hours must not be
   * counted twice - once here and once as the goal's weekly budget.
   */
  coveredByGoalId?: string;
  /** Shown on the capacity breakdown; falls back to a neutral slate. */
  accentColor?: string;
  createdAt: number;
  createdBy: UserRole;
}

export type CommitmentExceptionStatus =
  | 'EXCUSED_ABSENT'
  | 'POSTPONED'
  | 'CANCELLED_BY_ORGANISER'
  | 'ATTENDED';

export type ExceptionReasonCategory =
  | 'FAMILY'
  | 'ILLNESS'
  | 'MOCK_PREP'
  | 'SCHOOL_TRIP'
  | 'STAND_DOWN'
  | 'OTHER';

/**
 * One occasion of a fixed commitment that did not happen as scheduled.
 *
 * `scheduledHours` is a snapshot taken when the exception is logged, not a live
 * lookup. Editing a commitment from 3h to 2h next term must not silently
 * rewrite what last October's absence deducted.
 */
export interface CommitmentException {
  /**
   * `${commitmentId}__${date}` by construction, never a random id - the same
   * reasoning as ChoreCompletion. Two devices logging the same absence offline
   * then syncing produce one row and one deduction; a generated id would have
   * deducted the hours twice and read as a sync fault rather than a modelling
   * one.
   */
  id: string;
  commitmentId: string;
  /** Local ISO date of the occasion being excused. */
  date: string;
  title: string;
  scheduledHours: number;
  status: CommitmentExceptionStatus;
  reasonCategory: ExceptionReasonCategory;
  reasonNotes?: string;
  /** ATTENDED rows exist for the record and never move the capacity total. */
  deductsFromCapacity: boolean;
  loggedBy: UserRole;
  createdAt: number;
}

/**
 * What kind of thing changed, so a digest can group a day's updates rather than
 * listing fourteen unrelated lines.
 */
export type ChangeCategory =
  | 'HOMEWORK'
  | 'CHORE'
  | 'CHECK_IN'
  | 'ATTENDANCE'
  | 'GOAL'
  | 'REWARD'
  | 'PLAN'
  | 'PROOF';

/**
 * One confirmed change, written the moment it is made.
 *
 * Separate from the audit log on purpose. The audit log is a tamper-evident
 * hash chain of every write, meant to be checked; this is a short, readable
 * list of the things a person deliberately confirmed, meant to be sent to the
 * family so nobody has to ask what happened today. One is evidence, the other
 * is a message.
 */
export interface ChangeLogEntry {
  id: string;
  timestamp: number;
  /** Local YYYY-MM-DD, so a day's changes group without re-deriving them. */
  date: string;
  actor: UserRole;
  category: ChangeCategory;
  /** One line, already written for a human: "Ticked off Maths past paper (+50 XP)". */
  summary: string;
  /** Optional extra context shown under the summary in the digest. */
  detail?: string;
  /**
   * Which record this change was about.
   *
   * Added in September 2026 so the activity feed can pair a human sentence with
   * the audit row describing the same write. The first version of that pairing
   * matched on timestamp proximity alone, which is fine until two goals are
   * submitted three seconds apart - at which point the two rows can swap
   * wording and the log quietly attributes an action to the wrong record.
   *
   * Optional because rows written before this existed do not have it; those
   * fall back to the time-and-category match, which is why that path still
   * exists rather than being deleted as dead code.
   */
  entity?: string;
  entityId?: string;
  /**
   * When it was re-confirmed on the Updates tab.
   *
   * Two stages, deliberately. The sheet at the point of action stops an
   * accidental tap from writing anything; this is the separate, unhurried pass
   * where a person reads back what they actually did, adds context, and puts it
   * on the record. The first is a reflex guard, the second is a signature - and
   * collapsing them into one would lose whichever job the survivor did not do.
   */
  confirmedAt?: number;
  /** A note added at re-confirmation, in the student's own words. */
  confirmComment?: string;
  /** When this was written to the Google Drive log, and to which file. */
  driveLoggedAt?: number;
  driveFileName?: string;
  /** Whether this has been included in a message sent to the family. */
  reported: boolean;
  reportedAt?: number;
}

/**
 * Where a confirmed batch of updates gets forwarded, if anywhere.
 *
 * Off by default for everything. Forwarding a fourteen year old's day to three
 * places automatically is a decision the family should make deliberately, not
 * one the app should assume.
 */
export interface UpdateForwardingSettings {
  /** Offer the family group as a destination. */
  toGroup: boolean;
  /** Which saved numbers to offer, by their id in parentWhatsAppNumbers. */
  toNumberIds: string[];
  /**
   * Whether the forward step is presented immediately after confirming, rather
   * than left as something to go and do.
   */
  promptAfterConfirm: boolean;
}

/** How often a chore comes round. */
export type ChoreCadence = 'DAILY' | 'WEEKDAYS' | 'WEEKLY';

/**
 * A small recurring household job.
 *
 * Deliberately not a Task. A task has a due date, a subject, a priority and a
 * place in the weekly load; a chore has none of those and must never touch the
 * study plan or the burnout arithmetic. Modelling chores as tasks would put
 * "empty the dishwasher" in the same list as a mock paper and count it against
 * revision hours, which is how a planning tool stops being believed.
 */
export interface Chore {
  id: string;
  title: string;
  xpValue: number;
  cadence: ChoreCadence;
  /** WEEKLY only: the day it falls on. */
  dayOfWeek?: DayOfWeek;
  /**
   * Archived rather than deleted. Seeding re-inserts any absent row it knows
   * about, so a deleted row can come back; an archived one stays gone. It also
   * keeps past completions pointing at something real.
   */
  isActive: boolean;
  createdAt: number;
  createdBy: UserRole;
}

export interface ChoreCompletion {
  /**
   * `${choreId}__${date}` by construction, never a random id.
   *
   * One chore on one day is one row whichever device ticks it. Two devices
   * ticking the same chore offline then syncing produce the same primary key
   * and merge into a single row, so the XP is paid once. A generated id would
   * have paid twice and looked like a sync bug rather than a modelling one.
   */
  id: string;
  choreId: string;
  /** Local ISO date the chore was done for. */
  date: string;
  completedAt: number;
  xpAwarded: number;
}

export interface RewardItem {
  id: string;
  title: string;
  description: string;
  costXP: number;
  icon: string;
  category: 'SCREEN_TIME' | 'PRIVILEGE' | 'ACTIVITY' | 'CUSTOM';
  /**
   * Retired rather than deleted, for the same reason as a chore: seeding
   * re-inserts any row it knows about and finds missing, so a deleted seed
   * reward would reappear on the next open. It also keeps past redemptions
   * pointing at something real.
   */
  isArchived?: boolean;
}

export interface RewardRedemption {
  id: string;
  rewardId: string;
  rewardTitle: string;
  costXP: number;
  requestedAt: number;
  /**
   * WITHDRAWN is the student cancelling their own pending request. Kept as a
   * status rather than deleting the row, so the history survives and the audit
   * trail has something to point at. Only PENDING reserves XP and only
   * APPROVED spends it, so a withdrawn request frees its hold by definition.
   */
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'WITHDRAWN';
  resolvedAt?: number;
  parentComments?: string;
}

export interface Sanction {
  id: string;
  type: 'DETENTION' | 'HOMEWORK_SANCTION' | 'CUSTOM';
  reason: string;
  date: string;
  penaltyXP: number;
  shopFrozen: boolean;
  remediationTaskIdRequired?: string;
  resolvedAt?: number;
  loggedBy: 'PARENT';
}

export interface AuditLogEntry {
  id: string;
  /**
   * Which browser profile wrote this row. Chains are per device: with sync, two
   * devices can both append while offline, and a single global chain would fork
   * every time that happened and look like tampering.
   */
  deviceId: string;
  /** Position within this device's chain, starting at 0. */
  sequence: number;
  /** `hash` of the preceding row on this device, or GENESIS_HASH for the first. */
  prevHash: string;
  timestamp: number;
  user: UserRole;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'AGENT_AUDIT' | 'SANCTION_FREEZE' | 'REWARD_REDEEM';
  entity: string;
  entityId: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
  hash: string;
}

export interface ParentSettings {
  /**
   * Who the app is for. Name, year, school and the headline target grade were
   * literal strings inside Header.tsx, so a second child - or simply moving up
   * a year - needed a code change. Optional so an existing settings row that
   * predates them still reads, with the previous values as the fallback.
   */
  studentName?: string;
  studentYearGroup?: string;
  studentSchool?: string;
  studentTargetGrade?: number;
  /**
   * The first morning of the GCSE exam series, as a local YYYY-MM-DD.
   *
   * The launch film opens on "Summer 2027" and the app never said it once. A
   * countdown is the cheapest way to make twenty-one months feel finite, and it
   * has to be a setting rather than a constant because the date moves and
   * because the app should still work for whoever uses it next.
   */
  examSeriesStartDate?: string;
  /**
   * Where a shared update goes. E.164 including the country code, because
   * that is what wa.me requires - "07..." silently fails to resolve.
   *
   * Family phone numbers, so they never enter a CSV export.
   */
  parentWhatsAppNumbers?: { id: string; label: string; e164: string }[];
  /**
   * The family WhatsApp group that confirmed changes are logged to.
   *
   * Stored as the group's invite link. WhatsApp has no URL scheme that targets
   * a specific group with a prefilled message - `wa.me/?text=` opens the chat
   * picker and the sender chooses - so this link is what makes the group
   * reachable in one tap, and the picker is what actually delivers the message.
   */
  familyGroupInviteUrl?: string;
  /** Where confirmed updates may be forwarded. Nothing is ever sent on its own. */
  updateForwarding?: UpdateForwardingSettings;
  /** @deprecated Bare SHA-256 of a 4-digit PIN. Read for migration only. */
  parentPinHash?: string;
  /** PBKDF2 passphrase credential. See utils/credential.ts. */
  parentCredential?: ParentCredential;
  /** Consecutive failed unlock attempts, reset on success. */
  failedUnlockAttempts?: number;
  /** Epoch ms until which unlocking is refused. */
  unlockLockedUntil?: number;
  /**
   * Highest audit sequence reached per device. Held outside auditLogs so that
   * deleting the newest entries - which otherwise leaves a perfectly valid
   * shorter chain - can still be spotted.
   */
  auditChainTips?: Record<string, number>;
  googleDriveBackupPath: string;
  /** The repository folder in Drive - clickable, works on mobile. */
  googleDriveFolderUrl?: string;
  /** Where Genie's JSON exports belong. */
  backupsFolderUrl?: string;
  /**
   * The same folder as seen by Drive for Desktop. Shown so files can be
   * found in Explorer; never rendered as a link, because a browser cannot
   * open file:// from an https page.
   */
  workingFolderPath?: string;
  llmProvider: LLMProvider;
  llmApiKey?: string;
  llmModelName?: string;
}

export interface AgentAuditReport {
  id: string;
  timestamp: number;
  generatedBy: string;
  curriculumStatusSummary: string;
  burnoutStressIndexScore: number;
  burnoutStatus: RAGStatus;
  subjectBalanceAlerts: string[];
  actionableRecommendations: string[];
  rawMarkdown: string;
  /**
   * Set when a live LLM call was attempted and failed, so the portal can say why
   * the offline engine produced this report instead of leaving the parent to
   * infer it from the "Generated By" line.
   */
  fallbackReason?: string;
}

export interface CareerGuidanceResource {
  id: string;
  title: string;
  category: 'A_LEVELS' | 'UNIVERSITY_DEGREE' | 'DEGREE_APPRENTICESHIP' | 'CAREER_INSIGHT';
  requiredGCSEGrade: number;
  relevantSubjectIds: SubjectId[];
  description: string;
  externalUrl?: string;
  icon: string;
}

export interface FreeRevisionLink {
  id: string;
  title: string;
  subjectId: SubjectId;
  description: string;
  url: string;
  type: 'PAST_PAPERS' | 'VIDEO_TUTORIALS' | 'INTERACTIVE' | 'SUMMARY_NOTES';
}

// ============================================================================
// ACTIVITY, DEVICES AND IMPROVEMENTS (v3 - September 2026)
// ============================================================================

/**
 * A friendly name for one browser profile.
 *
 * The audit log has always recorded a `deviceId` and a `UserRole`, and neither
 * one names a person. Role gets you as far as "a parent did this", which stops
 * being enough the moment two parents use the app; deviceId is a uuid nobody
 * can read. Naming the device closes the gap without asking the family to keep
 * separate cloud logins, and - because deviceId is already on every historic
 * row - it backfills onto the entries that already exist.
 *
 * The honest limitation, stated here so the UI can state it too: this labels a
 * device, not a human. Two people sharing a laptop are indistinguishable, and
 * the activity feed says "Dad's laptop", never "Dad".
 */
export interface DeviceRegistration {
  /** Matches AuditLogEntry.deviceId. */
  id: string;
  /** "Tejas's phone", "Dad's laptop". */
  label: string;
  /**
   * Which person normally uses this device.
   *
   * The layer above `label`, and the reason it exists: one person routinely uses
   * several devices. Tejas on a phone and a laptop is two device ids and two
   * labels, and without a name to group them "what has Tejas changed this week"
   * has no answer - you would have to know which devices are his and tick them
   * individually.
   *
   * It is also already true of the parent side. In this family's own data one
   * person has written under two device ids *and* two roles, because the laptop
   * was used in student mode for testing and parent mode afterwards.
   *
   * Optional: a device nobody has claimed still works, it just groups under its
   * own label instead of a person.
   */
  ownerName?: string;
  /** Who normally uses it. Used only to pick an icon and to sort. */
  usualRole: UserRole;
  firstSeenAt: number;
  lastSeenAt: number;
  /** Set when the label was inferred rather than typed, so the UI can prompt. */
  isProvisional?: boolean;
}

/**
 * How widely one activity row may be shown.
 *
 * Everything about schoolwork is visible to the whole family - that is the
 * point of the feed. Security and discipline actions are not: a sanction that
 * appears on Tejas's phone before anyone has spoken to him turns a conversation
 * into an ambush, and a passphrase change is nobody's business but the parent
 * who made it.
 */
export type ActivityVisibility = 'EVERYONE' | 'PARENT_ONLY';

/**
 * What still has to happen before a change is finished.
 *
 * A goal sent for approval is not a completed action, it is a request sitting
 * in somebody's queue - and the old Updates tab rendered it identically to a
 * ticked-off homework. Carrying the outstanding step on the row is what lets
 * the feed say "waiting on a parent" instead of implying the thing is done.
 */
export interface PendingStep {
  kind: 'GOAL_APPROVAL' | 'REWARD_APPROVAL' | 'CONFIRMATION' | 'PROOF_REQUIRED';
  /** "Waiting for a parent to approve" */
  label: string;
  /** Who has to act. */
  waitingOn: UserRole;
  /** Set once it happened, so history reads correctly after the fact. */
  resolvedAt?: number;
  resolvedNote?: string;
}

/**
 * A file attached to a record, and where it can be opened.
 *
 * Proof photos live in IndexedDB as blobs, which is why backups have always
 * carried `attachmentsOmitted` - a JSON export cannot hold them, so restoring
 * from one silently loses every photo. A Drive copy is the fix: the blob stays
 * local for offline viewing, and `driveFileId` points at the copy that survives.
 */
export interface ActivityAttachmentLink {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  /** Opens the local blob. Revoked when the view unmounts. */
  objectUrl?: string;
  /** Present once the file has been mirrored to Drive. */
  driveFileId?: string;
  driveViewUrl?: string;
  /**
   * Saved to Drive, but with no URL to open. True when the desktop folder
   * transport wrote the file - it is safe from a restore, but the app never
   * learns the id Drive gives it, so there is nothing to link to.
   */
  mirroredWithoutLink?: boolean;
}

/**
 * One row in the activity feed.
 *
 * Assembled at read time from `auditLogs` (which is complete but written for
 * machines) and `changeLog` (which is human-readable but only covers the eight
 * things that went through a confirmation sheet). Neither is edited to produce
 * this - the audit log is hash-chained and rewriting it to make it prettier
 * would destroy the one property it exists for.
 */
export interface ActivityItem {
  id: string;
  timestamp: number;
  /** Local YYYY-MM-DD, for day grouping and the day filter. */
  date: string;
  actorRole: UserRole;
  deviceId?: string;
  /** Resolved from DeviceRegistration; falls back to a role name. */
  actorLabel: string;
  /**
   * The person, where the device has been claimed by one. This is what the feed
   * groups and filters by; `actorLabel` is the device, shown as the smaller
   * detail beside it.
   */
  actorPerson?: string;
  action: 'CREATED' | 'UPDATED' | 'DELETED' | 'COMPLETED' | 'CONFIRMED' | 'SYSTEM';
  /** "Task", "Goal", "Syllabus topic" - already in words. */
  entityType: string;
  entityId: string;
  /** The headline, written for a person. */
  summary: string;
  /** "Grade 9 → Grade 8" */
  detail?: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
  subjectId?: SubjectId;
  category?: ChangeCategory;
  visibility: ActivityVisibility;
  pending?: PendingStep;
  attachments?: ActivityAttachmentLink[];
  /** True when this came from changeLog and was signed off on the Updates tab. */
  confirmedAt?: number;
  /** True when it has been forwarded to the family. */
  reportedAt?: number;
  /** Which log it came from, so the UI can explain provenance honestly. */
  source: 'AUDIT' | 'CHANGE_LOG';
}

export type ImprovementStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'PLANNED'
  | 'DONE'
  | 'DECLINED';

export type ImprovementKind = 'BUG' | 'IDEA' | 'CONFUSING' | 'MISSING';

/**
 * Something a user thinks the app should do better.
 *
 * Kept inside the app rather than in a chat message because the useful ones
 * arrive at the moment of friction and are forgotten by the evening. Anyone can
 * file one; only a parent can change its status, so "DONE" means something.
 */
export interface ImprovementIdea {
  id: string;
  createdAt: number;
  createdByRole: UserRole;
  createdOnDeviceId?: string;
  kind: ImprovementKind;
  title: string;
  detail?: string;
  /** Which part of the app it is about, e.g. "Plan", "Quick Add". */
  area?: string;
  status: ImprovementStatus;
  /** Parent's response, shown to whoever filed it. */
  response?: string;
  statusChangedAt?: number;
  /** Upvotes from other family members, by device id. */
  supportedBy?: string[];
}

/**
 * How this device reaches Google Drive, and what it has managed so far.
 *
 * One row, id `active`, never synced. Two transports, because no single one
 * covers the family:
 *
 *  - `folderHandle` is a File System Access directory handle pointing at
 *    `_Genie-Backups` inside Drive for Desktop. Granted once, it lets the app
 *    write a real file with no Google account, no token and no network call -
 *    which keeps the offline-first promise exactly intact. Chromium desktop
 *    only; Safari and every mobile browser have no such API.
 *  - `oauthToken` is a Drive API access token obtained by PKCE. It works on
 *    Tejas's phone, which the handle never will, at the cost of the app now
 *    holding a Google credential.
 *
 * Both are optional and independent. A device with neither still works; it just
 * cannot back itself up automatically, and the UI has to say so rather than
 * implying a backup happened.
 */
export interface DriveSyncState {
  id: 'active';
  /**
   * The folder's name, for display. The handle itself lives in its own object
   * store - see folderHandleStore.ts - because it is a live capability rather
   * than data and does not belong in a synced database's table.
   */
  folderName?: string;
  /** Set when the handle was granted but permission has since been revoked. */
  folderPermissionLost?: boolean;
  oauthToken?: string;
  oauthRefreshToken?: string;
  oauthExpiresAt?: number;
  /** The Drive folder id backups are uploaded into, over the API transport. */
  oauthFolderId?: string;
  lastBackupAt?: number;
  lastBackupFileName?: string;
  lastBackupBytes?: number;
  /** Populated when the most recent attempt failed, so the UI can be honest. */
  lastErrorAt?: number;
  lastError?: string;
  /** Hours between automatic attempts. 0 disables them. */
  intervalHours?: number;
  autoEnabled?: boolean;
  /**
   * How many backup files to keep. Older ones are deleted after a successful
   * backup. 0 keeps everything.
   *
   * Daily backups accumulate at 365 files a year, and the folder becomes
   * unreadable long before the storage matters - the point of a backup folder
   * is that you can find the right file in it.
   */
  keepBackups?: number;
}

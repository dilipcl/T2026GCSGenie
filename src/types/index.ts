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
  | 'art';

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

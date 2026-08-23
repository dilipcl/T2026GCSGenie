// ============================================================================
// GCSE GENIE: MASTER TYPE DEFINITIONS (v2.0 Enhanced)
// ============================================================================

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
  id: string; // Unique ID: checkin_YYYY-MM-DD_timestamp
  date: string; // YYYY-MM-DD
  timestamp: number;
  session: CheckInSession;
  energyLevel: 1 | 2 | 3 | 4 | 5;
  focusRating: 'LOW' | 'NORMAL' | 'HIGH';
  completedHomeworkIds: string[];
  completedRevisionMinutes: number;
  structuredNotes?: StructuredCheckInNotes;
  notes?: string; // Legacy fallback
  xpEarned: number;
  isDailyBaseXPAwarded: boolean; // True if this check-in awarded the +10 XP daily base reward
}

export interface Task {
  id: string;
  subjectId: SubjectId;
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

export interface ComprehensiveQuestion {
  id: string;
  questionNumber: string; // e.g. "Q1 (a)", "Q2"
  questionText: string;
  marksAllocated: number;
  modelAnswer: string;
  markSchemeNotes: string;
}

export interface RemediationAction {
  id: string;
  subjectId: SubjectId;
  sourceDoc: string; // e.g. "yr9- maths.pdf (Score: 60/75)"
  diagnosticError: string;
  taskTitle: string;
  taskInstructions: string;
  formulaOrHint?: string;
  sampleQuestions: {
    question: string;
    expectedOutcome: string;
  }[];
  comprehensiveQuestions?: ComprehensiveQuestion[];
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

export interface RewardItem {
  id: string;
  title: string;
  description: string;
  costXP: number;
  icon: string;
  category: 'SCREEN_TIME' | 'PRIVILEGE' | 'ACTIVITY' | 'CUSTOM';
}

export interface RewardRedemption {
  id: string;
  rewardId: string;
  rewardTitle: string;
  costXP: number;
  requestedAt: number;
  status: 'PENDING' | 'APPROVED' | 'DENIED';
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
  parentPinHash: string;
  googleDriveBackupPath: string;
  googleDriveFolderUrl?: string; // Direct link to open Google Drive folder
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

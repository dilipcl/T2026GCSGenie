// ============================================================================
// GCSE GENIE: MASTER TYPE DEFINITIONS
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
export type LLMProvider = 'GEMINI' | 'CLAUDE' | 'OPENAI' | 'LOCAL';
export type WeekType = 'ODD' | 'EVEN' | 'BOTH';
export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface SubjectConfig {
  id: SubjectId;
  name: string;
  shortName: string;
  examBoard: 'Edexcel' | 'AQA' | 'OCR';
  targetGrade: 9;
  currentEstimatedGrade: number; // 1-9
  color: string; // Tailwind color class or hex
  icon: string;
  teacherName: string;
  teacherEmail?: string;
  teacherNotes?: string;
  courseworkWeight?: number; // e.g. 60% for Art
  examStructure: string;
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
}

export interface DailyCheckIn {
  id: string; // YYYY-MM-DD
  date: string;
  timestamp: number;
  energyLevel: 1 | 2 | 3 | 4 | 5;
  focusRating: 'LOW' | 'NORMAL' | 'HIGH';
  completedHomeworkIds: string[];
  completedRevisionMinutes: number;
  notes?: string;
  xpEarned: number;
}

export interface Task {
  id: string;
  subjectId: SubjectId;
  title: string;
  description?: string;
  dueDate: string;
  isHomework: boolean;
  isRemediation: boolean;
  remediationSourceDoc?: string; // e.g. "yr9- maths.pdf"
  xpValue: number;
  completed: boolean;
  completedAt?: number;
  createdAt: number;
}

export interface Goal {
  id: string;
  title: string;
  category: 'ACADEMIC_GRADE_9' | 'CO_CURRICULAR' | 'PERSONAL';
  subjectId?: SubjectId;
  smartSpecific: string;
  smartMeasurable: string;
  smartAchievable: string;
  smartRealistic: string;
  smartTimeBound: string;
  status: GoalStatus;
  ragStatus: RAGStatus;
  weeklyHoursRequired: number;
  parentNotes?: string;
  lockedAt?: number;
  createdAt: number;
}

export interface TimetableSlotConfig {
  id: string;
  name: string; // e.g. "Registration", "Period 1", "Break"
  defaultStartTime: string; // "08:30"
  defaultEndTime: string; // "08:50"
  isBreakOrLunch: boolean;
}

export interface TimetableEntry {
  id: string;
  weekType: WeekType;
  dayOfWeek: DayOfWeek;
  slotName: string;
  startTime: string; // "08:30"
  endTime: string; // "08:50"
  subjectId?: SubjectId;
  activityName: string;
  room?: string;
  isHardLocked: boolean; // Air Cadets, School
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
  xpReward: number;
  isCompleted: boolean;
  completedAt?: number;
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
  penaltyXP: number; // e.g. -500
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
  parentPinHash: string; // SHA-256 of 4-digit PIN (default "1234")
  googleDriveBackupPath: string;
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
  requiredGCSEGrade: number; // e.g. 9
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

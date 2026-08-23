import Dexie, { type Table } from 'dexie';
import {
  SubjectConfig,
  SyllabusTopic,
  DailyCheckIn,
  Task,
  Goal,
  TimetableSlotConfig,
  TimetableEntry,
  RemediationAction,
  MilestoneReminder,
  RewardItem,
  RewardRedemption,
  Sanction,
  AuditLogEntry,
  ParentSettings,
  AgentAuditReport,
  CareerGuidanceResource,
  FreeRevisionLink,
} from '../types';
import {
  INITIAL_SUBJECTS,
  INITIAL_SYLLABUS_TOPICS,
  INITIAL_REMEDIATION_ACTIONS,
  INITIAL_MILESTONES,
  INITIAL_TIMETABLE_SLOTS,
  INITIAL_TIMETABLE_ENTRIES,
  INITIAL_REWARDS,
  INITIAL_CAREER_RESOURCES,
  INITIAL_FREE_REVISION_LINKS,
  INITIAL_GOALS,
  INITIAL_PARENT_SETTINGS,
  MICRO_REWARDS,
} from './seedData';

/**
 * IMPORTANT: IndexedDB cannot index boolean values. Fields such as `completed`,
 * `isCompleted`, `isHomework` and `shopFrozen` appear in the schema strings below
 * but are never actually indexed, so `.where('completed').equals(0)` silently
 * returns an empty array instead of the pending records.
 *
 * Always filter boolean fields in memory (`.filter(t => !t.completed)`), never
 * with `.where(...)`.
 */
export class GCSEGenieDatabase extends Dexie {
  subjects!: Table<SubjectConfig, string>;
  syllabusTopics!: Table<SyllabusTopic, string>;
  checkIns!: Table<DailyCheckIn, string>;
  tasks!: Table<Task, string>;
  goals!: Table<Goal, string>;
  timetableSlots!: Table<TimetableSlotConfig, string>;
  timetableEntries!: Table<TimetableEntry, string>;
  remediations!: Table<RemediationAction, string>;
  milestones!: Table<MilestoneReminder, string>;
  rewards!: Table<RewardItem, string>;
  redemptions!: Table<RewardRedemption, string>;
  sanctions!: Table<Sanction, string>;
  auditLogs!: Table<AuditLogEntry, string>;
  parentSettings!: Table<ParentSettings & { id: string }, string>;
  agentAuditReports!: Table<AgentAuditReport, string>;
  careerResources!: Table<CareerGuidanceResource, string>;
  revisionLinks!: Table<FreeRevisionLink, string>;

  constructor() {
    super('GCSEGenieDB');

    this.version(2).stores({
      subjects: 'id, examBoard, targetGrade',
      syllabusTopics: 'id, subjectId, unit, isCompleted, isImportantForGrade9, yearGroup',
      checkIns: 'id, date, timestamp, session',
      tasks: 'id, subjectId, dueDate, priority, isHomework, isRemediation, completed',
      goals: 'id, category, subjectId, status, ragStatus, priority',
      timetableSlots: 'id',
      timetableEntries: 'id, weekType, dayOfWeek, subjectId',
      remediations: 'id, subjectId, isCompleted, parentQuestId',
      milestones: 'id, date, category, priority, isCompleted',
      rewards: 'id, category, costXP',
      redemptions: 'id, rewardId, status, requestedAt',
      sanctions: 'id, date, shopFrozen',
      auditLogs: 'id, timestamp, user, action, entity',
      parentSettings: 'id',
      agentAuditReports: 'id, timestamp, burnoutStatus',
      careerResources: 'id, category, requiredGCSEGrade',
      revisionLinks: 'id, subjectId, type',
    });

    // v3 adds the low-cost rewards. `populate` only fires on a brand new
    // database, so an existing install needs an explicit upgrade to receive them.
    this.version(3).upgrade(async (tx) => {
      const rewards = tx.table<RewardItem, string>('rewards');
      for (const reward of MICRO_REWARDS) {
        const existing = await rewards.get(reward.id);
        if (!existing) await rewards.add(reward);
      }
    });

    this.on('populate', () => {
      this.populateInitialData();
    });
  }

  async populateInitialData() {
    await this.subjects.bulkAdd(INITIAL_SUBJECTS);
    await this.syllabusTopics.bulkAdd(INITIAL_SYLLABUS_TOPICS);
    await this.remediations.bulkAdd(INITIAL_REMEDIATION_ACTIONS);
    await this.milestones.bulkAdd(INITIAL_MILESTONES);
    await this.timetableSlots.bulkAdd(INITIAL_TIMETABLE_SLOTS);
    await this.timetableEntries.bulkAdd(INITIAL_TIMETABLE_ENTRIES);
    await this.rewards.bulkAdd(INITIAL_REWARDS);
    await this.careerResources.bulkAdd(INITIAL_CAREER_RESOURCES);
    await this.revisionLinks.bulkAdd(INITIAL_FREE_REVISION_LINKS);
    await this.goals.bulkAdd(INITIAL_GOALS);
    await this.parentSettings.add({
      ...INITIAL_PARENT_SETTINGS,
      id: 'active_settings',
    });

    // Initial Starter Tasks with Priorities and Goal Linkage
    await this.tasks.bulkAdd([
      {
        id: 't-maths-hw-1',
        subjectId: 'maths',
        title: 'Edexcel Paper 1 Past Paper Questions (Venn & Trig)',
        description: 'Complete questions 12 to 18 on independence probability proofs.',
        dueDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        priority: 'HIGH',
        isHomework: true,
        isRemediation: false,
        linkedGoalId: 'g-academic-maths',
        xpValue: 50,
        completed: false,
        createdAt: Date.now(),
      },
      {
        id: 't-cs-hw-1',
        subjectId: 'computer_science',
        title: 'OCR CS Network Protocols (TCP/IP 4-Layer Model)',
        description: 'Summarize Application, Transport, Network, and Link layers for teacher AMN.',
        dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        priority: 'HIGH',
        isHomework: true,
        isRemediation: false,
        linkedGoalId: 'g-academic-cs',
        xpValue: 50,
        completed: false,
        createdAt: Date.now(),
      },
      {
        id: 't-art-hw-1',
        subjectId: 'art',
        title: 'Portfolio AO2 Media Experimentation Sheet',
        description: 'Complete 2 mixed-media color studies for Component 1.',
        dueDate: new Date(Date.now() + 86400000 * 4).toISOString().split('T')[0],
        priority: 'MEDIUM',
        isHomework: true,
        isRemediation: false,
        xpValue: 50,
        completed: false,
        createdAt: Date.now(),
      },
      {
        id: 't-sci-hw-1',
        subjectId: 'physics',
        title: 'Physics Energy Transfer Safety Step Problems',
        description: 'Solve 5 questions converting time to seconds before calculating E=Pxt.',
        dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
        priority: 'MEDIUM',
        isHomework: true,
        isRemediation: false,
        xpValue: 50,
        completed: false,
        createdAt: Date.now(),
      },
    ]);
  }
}

export const db = new GCSEGenieDatabase();

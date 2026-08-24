import Dexie, { type Table } from 'dexie';
import dexieCloud from 'dexie-cloud-addon';
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
  Assessment,
  ProofAttachment,
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
  INITIAL_TASKS,
} from './seedData';

/**
 * The Dexie Cloud database backing sync. This is a public endpoint, not a
 * secret - access is granted by the signed-in user's token, not by knowing the
 * URL - so it belongs in source alongside the schema it serves.
 *
 * Override at build time with VITE_DEXIE_CLOUD_URL to point a branch at a
 * throwaway database instead of the family's real one.
 */
/**
 * dexie-cloud-addon needs browser APIs (WebSocket, WebCrypto, service workers).
 * Node tooling that exercises the data layer - the multi-device consistency
 * harness, for one - loads this module with fake-indexeddb, where `indexedDB`
 * exists but `window` does not. Sync is a browser concern, so it is simply left
 * off there rather than half-initialised.
 */
const IS_BROWSER = typeof window !== 'undefined';

const CLOUD_DATABASE_URL =
  import.meta.env?.VITE_DEXIE_CLOUD_URL || 'https://z80xp4ajs.dexie.cloud';

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
  assessments!: Table<Assessment, string>;
  attachments!: Table<ProofAttachment, string>;

  constructor() {
    super('GCSEGenieDB', IS_BROWSER ? { addons: [dexieCloud] } : {});

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

    // v4 adds the proof log: marked assessments and the binary evidence behind
    // them. No upgrade function is needed - new tables start empty on both a
    // fresh install and an existing one.
    this.version(4).stores({
      assessments: 'id, subjectId, date, type, createdAt',
      // ownerType+ownerId is the lookup that matters; booleans are never indexed
      attachments: 'id, ownerId, ownerType, createdAt, [ownerType+ownerId]',
    });

    /**
     * Dexie Cloud's guidance is explicit: do not write data from `populate`,
     * because it fires on a brand new local database - which is also the state
     * a second device is in moments before its first sync delivers everything.
     * Seeding there gives every new device its own copy of the starter content.
     *
     * `ready` fires on every open, so the seeding it triggers has to be
     * idempotent. `seedMissingRows` only inserts rows whose primary key is
     * absent, so it can never overwrite an edit made on another device.
     */
    this.on('ready', async () => {
      await this.seedMissingRows();
    });

    this.cloud?.configure({
      databaseUrl: CLOUD_DATABASE_URL,
      /**
       * The app has to keep working on a phone with no signal and before anyone
       * has logged in. With requireAuth off, everything runs locally and starts
       * syncing the moment a user authenticates.
       */
      requireAuth: false,
      /**
       * The parent's LLM API key must never leave the device. The PIN hash is
       * deliberately still synced so the same PIN works everywhere.
       */
      unsyncedProperties: {
        parentSettings: ['llmApiKey'],
      },
    });
  }

  /**
   * Inserts starter content, skipping anything already present.
   *
   * Never uses put/bulkPut: on a device that has just synced, the seed rows
   * already exist and may carry edits - a ticked-off topic, a teacher note, a
   * manual RAG override. Overwriting them with pristine copies would quietly
   * undo real work.
   */
  private async seedMissingRows() {
    const addMissing = async <T extends { id: string }>(table: Table<T, string>, rows: T[]) => {
      // Deduplicate the input first. bulkGet only reports what is already in the
      // database, so a seed array containing the same id twice - which is easy
      // to produce by spreading one seed list into another - still reaches
      // bulkAdd twice and fails the whole batch with a ConstraintError.
      const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
      if (unique.length === 0) return;

      const found = await table.bulkGet(unique.map((r) => r.id));
      const missing = unique.filter((_, i) => found[i] === undefined);
      if (missing.length) await table.bulkAdd(missing);
    };

    await addMissing(this.subjects, INITIAL_SUBJECTS);
    await addMissing(this.syllabusTopics, INITIAL_SYLLABUS_TOPICS);
    await addMissing(this.remediations, INITIAL_REMEDIATION_ACTIONS);
    await addMissing(this.milestones, INITIAL_MILESTONES);
    await addMissing(this.timetableSlots, INITIAL_TIMETABLE_SLOTS);
    await addMissing(this.timetableEntries, INITIAL_TIMETABLE_ENTRIES);
    // INITIAL_REWARDS already spreads in MICRO_REWARDS - do not add both
    await addMissing(this.rewards, INITIAL_REWARDS);
    await addMissing(this.careerResources, INITIAL_CAREER_RESOURCES);
    await addMissing(this.revisionLinks, INITIAL_FREE_REVISION_LINKS);
    await addMissing(this.goals, INITIAL_GOALS);
    await addMissing(this.tasks, INITIAL_TASKS);

    if (!(await this.parentSettings.get('active_settings'))) {
      await this.parentSettings.add({ ...INITIAL_PARENT_SETTINGS, id: 'active_settings' });
    }
  }

}

export const db = new GCSEGenieDatabase();

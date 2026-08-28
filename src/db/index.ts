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
  Chore,
  ChoreCompletion,
  FixedCommitment,
  CommitmentException,
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
  RETITLED_REWARDS,
  INITIAL_COMMITMENTS,
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
  chores!: Table<Chore, string>;
  choreCompletions!: Table<ChoreCompletion, string>;
  commitments!: Table<FixedCommitment, string>;
  commitmentExceptions!: Table<CommitmentException, string>;

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
    /**
     * v5 indexes the audit chain by [deviceId+sequence] so appending can find
     * the tail of this device's chain in one lookup rather than scanning.
     */
    this.version(5).stores({
      auditLogs: 'id, timestamp, user, action, entity, deviceId, [deviceId+sequence]',
    });

    /**
     * v6 indexes the planning bucket so the Plan tab can query each column
     * directly instead of loading every task and filtering in memory.
     */
    this.version(6).stores({
      tasks: 'id, subjectId, dueDate, priority, isHomework, isRemediation, completed, bucket',
    });

    /**
     * v7 rewrites a reward in place.
     *
     * `seedMissingRows` only ever inserts absent rows - deliberately, so a
     * synced device cannot have its edits overwritten by pristine seed copies.
     * That also means renaming an existing reward is invisible to it, so a
     * catalogue change a parent has actually asked for needs an explicit
     * upgrade. Only rewards still holding their seeded title are touched: one
     * edited in the Parent Portal is somebody's decision, not stale seed data.
     */
    this.version(7).upgrade(async (tx) => {
      const rewards = tx.table<RewardItem, string>('rewards');
      for (const { id, wasTitled } of RETITLED_REWARDS) {
        const existing = await rewards.get(id);
        if (!existing || existing.title !== wasTitled) continue;
        const replacement = INITIAL_REWARDS.find((r) => r.id === id);
        if (replacement) await rewards.put(replacement);
      }
    });

    /**
     * v8 adds recurring chores.
     *
     * `isActive` is in the schema string but is a boolean, so it is never
     * actually indexed - see the note at the top of this file. Chores are
     * filtered in memory.
     */
    this.version(8).stores({
      chores: 'id, cadence, dayOfWeek, isActive, createdAt',
      choreCompletions: 'id, choreId, date, [choreId+date]',
    });

    /**
     * v9 turns the fixed weekly commitments into rows, and gives them a place
     * to record an occasion that did not happen.
     *
     * They were a hardcoded `const` in burnoutEngine, which meant two things:
     * nobody could change them without a code change, and - because an absence
     * cannot be logged against a `const` - a missed parade night still charged
     * the week its three hours. The seeded hours are carried over exactly, so
     * no existing capacity total moves on the day this runs.
     *
     * `deductsFromCapacity` and `isActive` are booleans and therefore never
     * actually indexed (see the note at the top of this file); both are
     * filtered in memory.
     */
    this.version(9).stores({
      commitments: 'id, isActive, createdAt',
      commitmentExceptions:
        'id, commitmentId, date, status, [commitmentId+date]',
    });

    /**
     * v10 backfills the exam date onto an existing settings row.
     *
     * `seedMissingRows` only ever inserts rows whose primary key is absent, so
     * a new *field* on the single `active_settings` row is invisible to it: the
     * row already exists, so it is skipped, and the countdown that is supposed
     * to be the first thing on the Home screen quietly read "This week" on
     * every device that had ever been opened before.
     *
     * Only fills a blank. A date somebody has actually set is their decision.
     */
    this.version(10).upgrade(async (tx) => {
      const settings = tx.table<ParentSettings & { id: string }, string>('parentSettings');
      const existing = await settings.get('active_settings');
      if (existing && !existing.examSeriesStartDate) {
        await settings.update('active_settings', {
          examSeriesStartDate: INITIAL_PARENT_SETTINGS.examSeriesStartDate,
        });
      }
    });

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
      unsyncedProperties: {
        /**
         * The API key must never leave the device.
         *
         * The lockout counters are device-local for a different reason: they
         * are state about a keyboard, not about the family. Synced, three
         * fumbled attempts on the phone lock the parent out of the laptop, and
         * two devices counting into the same field through per-property merge
         * produce a total neither of them saw. The credential itself is still
         * synced, so the same passphrase works everywhere.
         */
        parentSettings: ['llmApiKey', 'failedUnlockAttempts', 'unlockLockedUntil'],
      },
      /**
       * The stock dexie-cloud dialog is a plain white box that reads as a
       * browser security prompt inside this app. CloudLoginDialog renders the
       * same interaction, styled like everything else.
       */
      customLoginGui: true,
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
    await addMissing(this.commitments, INITIAL_COMMITMENTS);

    const settings = await this.parentSettings.get('active_settings');
    if (!settings) {
      await this.parentSettings.add({ ...INITIAL_PARENT_SETTINGS, id: 'active_settings' });
    } else if (!settings.examSeriesStartDate) {
      // The v10 upgrade covers the normal path. This catches a row that
      // predates it on a database that never ran the version bump - a restored
      // backup, most likely - because a missing countdown is silent, and a
      // silent missing feature is the kind that ships.
      await this.parentSettings.update('active_settings', {
        examSeriesStartDate: INITIAL_PARENT_SETTINGS.examSeriesStartDate,
      });
    }
  }

}

export const db = new GCSEGenieDatabase();

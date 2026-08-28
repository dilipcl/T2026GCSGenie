import { db } from '../db';
import { ProofAttachment } from '../types';
import { calculateBurnoutCapacity } from './burnoutEngine';
import { calculateSubjectRAG, calculateTotalXP } from './ragCalculator';
import { calculateStreakStats } from './habitEngine';
import { INITIAL_SUBJECTS } from '../db/seedData';

export const BACKUP_FORMAT_VERSION = '2.0';

/**
 * Fields that must never leave the device inside a backup file. The bundle is
 * written to a Google Drive folder, so an LLM API key in it is a key published
 * to wherever that folder is shared.
 */
const REDACTED_PARENT_FIELDS = ['llmApiKey'] as const;

/**
 * Tables whose rows are pure seed content. They are still exported, but if an
 * older bundle is missing one the importer leaves the device's own copy alone
 * rather than emptying it.
 */
const TABLES_NEVER_EMPTIED = new Set(['careerResources', 'revisionLinks', 'rewards']);

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked so a multi-megabyte photo does not blow the argument limit on apply
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export interface ExportOptions {
  /**
   * Proof photos are the bulk of the bundle. Excluding them produces a small
   * file for quick off-device copies; the importer then knows not to touch the
   * attachments already on the target device.
   */
  includeAttachments?: boolean;
}

/**
 * Exports every table in the database.
 *
 * This walks `db.tables` rather than naming tables one by one. The previous
 * hand-written list silently omitted `milestones`, so every restore wiped all
 * key dates and exam milestones - enumerating the live schema means a new table
 * cannot be forgotten again.
 */
export async function exportDatabaseToJSON(options: ExportOptions = {}): Promise<string> {
  const includeAttachments = options.includeAttachments !== false;

  const exportData: Record<string, unknown> = {
    version: BACKUP_FORMAT_VERSION,
    exportTimestamp: Date.now(),
    exportDateISO: new Date().toISOString(),
    attachmentsOmitted: !includeAttachments,
  };

  for (const table of db.tables) {
    if (table.name === 'attachments') {
      const rows = (await table.toArray()) as ProofAttachment[];
      exportData.attachments = await Promise.all(
        rows.map(async ({ blob, ...meta }) => ({
          ...meta,
          blobBase64: includeAttachments ? await blobToBase64(blob) : undefined,
        }))
      );
      continue;
    }

    const rows = await table.toArray();

    if (table.name === 'parentSettings') {
      exportData.parentSettings = rows.map((row: Record<string, unknown>) => {
        const scrubbed = { ...row };
        for (const field of REDACTED_PARENT_FIELDS) delete scrubbed[field];
        return scrubbed;
      });
      continue;
    }

    exportData[table.name] = rows;
  }

  return JSON.stringify(exportData, null, 2);
}

export interface BackupSummary {
  version: string;
  exportDateISO?: string;
  attachmentsOmitted: boolean;
  /** Row counts per table as they appear in the file. */
  counts: Record<string, number>;
  /** Tables this database has that the file does not carry. */
  missingTables: string[];
  totalRows: number;
}

/**
 * Reads a backup file without applying it, so the confirm dialog can show what
 * a restore would actually do before anything is cleared.
 */
export function describeBackup(jsonString: string): BackupSummary {
  const data = JSON.parse(jsonString);

  if (!data.version || !data.subjects) {
    throw new Error('This does not look like a GCSE Genie backup file.');
  }

  const counts: Record<string, number> = {};
  const missingTables: string[] = [];
  let totalRows = 0;

  for (const table of db.tables) {
    const rows = data[table.name];
    if (Array.isArray(rows)) {
      counts[table.name] = rows.length;
      totalRows += rows.length;
    } else {
      missingTables.push(table.name);
    }
  }

  return {
    version: String(data.version),
    exportDateISO: data.exportDateISO,
    attachmentsOmitted: data.attachmentsOmitted === true,
    counts,
    missingTables,
    totalRows,
  };
}

/** Current row counts, for the before/after comparison shown on restore. */
export async function summariseCurrentDatabase(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of db.tables) counts[table.name] = await table.count();
  return counts;
}

export interface ImportResult {
  restored: Record<string, number>;
  /** Tables the bundle did not carry, left untouched instead of emptied. */
  preserved: string[];
}

/**
 * Replaces the database with the contents of a backup file.
 *
 * Only tables the bundle actually carries are cleared. An older backup that
 * predates a table therefore leaves that table alone rather than emptying it -
 * the failure mode that lost every milestone on restore.
 *
 * This is still a replace, not a merge: rows on this device that are absent
 * from the bundle are gone. Callers must take a rescue export first.
 */
export async function importDatabaseFromJSON(jsonString: string): Promise<ImportResult> {
  const data = JSON.parse(jsonString);

  if (!data.version || !data.subjects) {
    throw new Error('This does not look like a GCSE Genie backup file.');
  }

  const restored: Record<string, number> = {};
  const preserved: string[] = [];
  const attachmentsOmitted = data.attachmentsOmitted === true;

  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      const rows = data[table.name];

      // Attachment binaries were deliberately left out - keep what is here
      if (table.name === 'attachments' && attachmentsOmitted) {
        preserved.push(table.name);
        continue;
      }

      if (!Array.isArray(rows)) {
        if (!TABLES_NEVER_EMPTIED.has(table.name)) preserved.push(table.name);
        continue;
      }

      if (rows.length === 0 && TABLES_NEVER_EMPTIED.has(table.name)) {
        preserved.push(table.name);
        continue;
      }

      await table.clear();

      if (table.name === 'attachments') {
        const rehydrated: ProofAttachment[] = rows
          .filter((row: { blobBase64?: string }) => typeof row.blobBase64 === 'string')
          .map(({ blobBase64, ...meta }: ProofAttachment & { blobBase64: string }) => ({
            ...meta,
            blob: base64ToBlob(blobBase64, meta.mimeType),
          }));
        if (rehydrated.length) await db.attachments.bulkAdd(rehydrated);
        restored[table.name] = rehydrated.length;
        continue;
      }

      if (rows.length) await table.bulkAdd(rows);
      restored[table.name] = rows.length;
    }
  });

  return { restored, preserved };
}

export async function generateAgentAuditPackage(): Promise<{
  filename: string;
  jsonContent: string;
  markdownSummary: string;
}> {
  const xp = await calculateTotalXP();
  // The dashboard and the audit must agree on what the streak is. The legacy
  // calculateStreak reset on any single missed day and reported 1 where the
  // habit engine's never-miss-twice rule reports 6.
  const streak = await calculateStreakStats();
  const burnout = await calculateBurnoutCapacity();

  const ragResults = [];
  for (const sub of INITIAL_SUBJECTS) {
    const res = await calculateSubjectRAG(sub.id);
    ragResults.push({
      subject: sub.name,
      examBoard: sub.examBoard,
      healthScore: res.healthScore,
      ragStatus: res.ragStatus,
      homeworkRate: `${res.homeworkCompletionRate}%`,
      remediationsDone: `${res.remediationCompletionRate}%`,
      masteredTopics: `${res.topicsMastered}/${res.totalTopics}`,
      assessmentAverage:
        res.assessmentCount > 0 ? `${res.assessmentAveragePercent}% over ${res.assessmentCount} marked papers` : 'No marked work logged',
      details: res.details,
    });
  }

  const checkIns = await db.checkIns.orderBy('date').reverse().limit(14).toArray();
  // Booleans are not indexable in IndexedDB - filter in memory (see db/index.ts).
  const pendingTasks = (await db.tasks.toArray()).filter((t) => !t.completed);
  const remediations = await db.remediations.toArray();
  const sanctions = await db.sanctions.toArray();
  const assessments = await db.assessments.orderBy('date').reverse().limit(20).toArray();

  const auditBundle = {
    auditDate: new Date().toISOString(),
    student: 'Tejas Dilip',
    school: 'Guildford County School (GCS)',
    yearGroup: 'Year 10 (GCSE)',
    targetMilestone: 'Straight Grade 9s across all 6 subjects',
    currentMetrics: {
      streakDays: streak.current,
      bestStreakDays: streak.best,
      graceDaysUsedInCurrentRun: streak.graceDaysUsed,
      totalDaysCheckedIn: streak.totalDays,
      totalXP: xp.totalXP,
      availableXP: xp.availableXP,
      reservedXP: xp.reservedXP,
      isShopFrozen: xp.isShopFrozen,
      burnoutStressIndex: `${burnout.stressIndex}%`,
      burnoutStatus: burnout.stressStatus,
      totalScheduledHours: burnout.totalScheduledHours,
      safeHoursLimit: burnout.safeWeeklyHoursLimit,
    },
    subjectRAGMatrix: ragResults,
    recent14DayCheckIns: checkIns,
    pendingHomeworkTasks: pendingTasks,
    markedAssessments: assessments.map((a) => ({
      subjectId: a.subjectId,
      title: a.title,
      type: a.type,
      date: a.date,
      score: `${a.marksScored}/${a.marksAvailable} (${a.percentage}%)`,
      gradeAwarded: a.gradeAwarded,
      weakTopics: a.weakTopics,
      questionsLogged: a.questions.length,
      proofAttached: a.attachmentIds.length > 0,
      verifiedByParent: a.verifiedByParent === true,
    })),
    remediationActionsStatus: remediations.map((r) => ({
      subjectId: r.subjectId,
      taskTitle: r.taskTitle,
      isCompleted: r.isCompleted,
      sourceDoc: r.sourceDoc,
    })),
    sanctionsHistory: sanctions,
  };

  const markdownPrompt = `# GCSE Genie: Agentic Audit Manifest
**Student:** Tejas Dilip (Year 10, Guildford County School)
**Target:** Grade 9s in Edexcel Maths, AQA Eng Lang & Lit, AQA Triple Science, AQA History, OCR CS, AQA Art
**Audit Generated:** ${new Date().toLocaleString('en-GB')}

---

## 1. Academic Health & Subject RAG Matrix
${ragResults
  .map(
    (r) =>
      `- **${r.subject} (${r.examBoard})**: [${r.ragStatus}] Score: ${r.healthScore}/100 | HW: ${r.homeworkRate} | Remediation: ${r.remediationsDone} | Mastery: ${r.masteredTopics} | Marked work: ${r.assessmentAverage}\n  *Note:* ${r.details}`
  )
  .join('\n')}

---

## 2. Weekly Time Budget & Burnout Analysis
- **Safe Limit:** ${burnout.safeWeeklyHoursLimit} Hours/Week (total, including school hours)
- **Scheduled Commitments:** ${burnout.totalScheduledHours} Hours/Week
- **Stress Index:** ${burnout.stressIndex}% (${burnout.stressStatus})
- **Base Breakdown:** ${burnout.commitmentBreakdown.map((c) => `${c.label} (${c.netHours}h${c.excusedHours > 0 ? `, ${c.excusedHours}h excused` : ''})`).join(' + ')}

---

## 3. Habit Consistency
- **Current streak:** ${streak.current} days (best ever ${streak.best}, ${streak.totalDays} days logged in total)
- **Grace days used in this run:** ${streak.graceDaysUsed} (a single missed day is absorbed; two in a row ends the run)

---

## 4. Instructions for Reviewing Agent (Claude / Gemini)
Evaluate the above data and provide a concise 3-part **Plan Alignment Report**:
1. **Curriculum Status**: Highlight subjects falling behind or excelling towards Grade 9.
2. **Burnout Level**: Validate if sleep & rest boundaries are maintained.
3. **Actionable Adjustments**: Recommend specific schedule or habit adjustments for the upcoming week.
`;

  return {
    filename: `GCSE_Genie_Agent_Audit_${new Date().toISOString().split('T')[0]}.json`,
    jsonContent: JSON.stringify(auditBundle, null, 2),
    markdownSummary: markdownPrompt,
  };
}

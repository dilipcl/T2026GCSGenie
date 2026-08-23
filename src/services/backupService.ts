import { db } from '../db';
import { calculateBurnoutCapacity } from './burnoutEngine';
import { calculateSubjectRAG, calculateTotalXP, calculateStreak } from './ragCalculator';
import { INITIAL_SUBJECTS } from '../db/seedData';

export async function exportDatabaseToJSON(): Promise<string> {
  const exportData = {
    version: '1.0',
    exportTimestamp: Date.now(),
    exportDateISO: new Date().toISOString(),
    subjects: await db.subjects.toArray(),
    syllabusTopics: await db.syllabusTopics.toArray(),
    checkIns: await db.checkIns.toArray(),
    tasks: await db.tasks.toArray(),
    goals: await db.goals.toArray(),
    timetableSlots: await db.timetableSlots.toArray(),
    timetableEntries: await db.timetableEntries.toArray(),
    remediations: await db.remediations.toArray(),
    rewards: await db.rewards.toArray(),
    redemptions: await db.redemptions.toArray(),
    sanctions: await db.sanctions.toArray(),
    auditLogs: await db.auditLogs.toArray(),
    parentSettings: await db.parentSettings.toArray(),
    agentAuditReports: await db.agentAuditReports.toArray(),
    careerResources: await db.careerResources.toArray(),
    revisionLinks: await db.revisionLinks.toArray(),
  };

  return JSON.stringify(exportData, null, 2);
}

export async function importDatabaseFromJSON(jsonString: string): Promise<boolean> {
  try {
    const data = JSON.parse(jsonString);

    if (!data.version || !data.subjects) {
      throw new Error('Invalid GCSE Genie backup file format.');
    }

    await db.transaction('rw', db.tables, async () => {
      // Clear existing
      for (const table of db.tables) {
        await table.clear();
      }

      if (data.subjects?.length) await db.subjects.bulkAdd(data.subjects);
      if (data.syllabusTopics?.length) await db.syllabusTopics.bulkAdd(data.syllabusTopics);
      if (data.checkIns?.length) await db.checkIns.bulkAdd(data.checkIns);
      if (data.tasks?.length) await db.tasks.bulkAdd(data.tasks);
      if (data.goals?.length) await db.goals.bulkAdd(data.goals);
      if (data.timetableSlots?.length) await db.timetableSlots.bulkAdd(data.timetableSlots);
      if (data.timetableEntries?.length) await db.timetableEntries.bulkAdd(data.timetableEntries);
      if (data.remediations?.length) await db.remediations.bulkAdd(data.remediations);
      if (data.rewards?.length) await db.rewards.bulkAdd(data.rewards);
      if (data.redemptions?.length) await db.redemptions.bulkAdd(data.redemptions);
      if (data.sanctions?.length) await db.sanctions.bulkAdd(data.sanctions);
      if (data.auditLogs?.length) await db.auditLogs.bulkAdd(data.auditLogs);
      if (data.parentSettings?.length) await db.parentSettings.bulkAdd(data.parentSettings);
      if (data.agentAuditReports?.length) await db.agentAuditReports.bulkAdd(data.agentAuditReports);
      if (data.careerResources?.length) await db.careerResources.bulkAdd(data.careerResources);
      if (data.revisionLinks?.length) await db.revisionLinks.bulkAdd(data.revisionLinks);
    });

    return true;
  } catch (err) {
    console.error('Import failed:', err);
    throw err;
  }
}

export async function generateAgentAuditPackage(): Promise<{
  filename: string;
  jsonContent: string;
  markdownSummary: string;
}> {
  const xp = await calculateTotalXP();
  const streak = await calculateStreak();
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
      details: res.details,
    });
  }

  const checkIns = await db.checkIns.orderBy('date').reverse().limit(14).toArray();
  const pendingTasks = await db.tasks.where('completed').equals(0).toArray();
  const remediations = await db.remediations.toArray();
  const sanctions = await db.sanctions.toArray();

  const auditBundle = {
    auditDate: new Date().toISOString(),
    student: 'Tejas Dilip',
    school: 'Guildford County School (GCS)',
    yearGroup: 'Year 10 (GCSE)',
    targetMilestone: 'Straight Grade 9s across all 6 subjects',
    currentMetrics: {
      streakDays: streak,
      totalXP: xp.totalXP,
      availableXP: xp.availableXP,
      isShopFrozen: xp.isShopFrozen,
      burnoutStressIndex: `${burnout.stressIndex}%`,
      burnoutStatus: burnout.stressStatus,
      totalScheduledHours: burnout.totalScheduledHours,
      safeHoursLimit: burnout.safeWeeklyHoursLimit,
    },
    subjectRAGMatrix: ragResults,
    recent14DayCheckIns: checkIns,
    pendingHomeworkTasks: pendingTasks,
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
      `- **${r.subject} (${r.examBoard})**: [${r.ragStatus}] Score: ${r.healthScore}/100 | HW: ${r.homeworkRate} | Remediation: ${r.remediationsDone} | Mastery: ${r.masteredTopics}\n  *Note:* ${r.details}`
  )
  .join('\n')}

---

## 2. Weekly Time Budget & Burnout Analysis
- **Safe Limit:** 45.0 Hours/Week
- **Scheduled Commitments:** ${burnout.totalScheduledHours} Hours/Week
- **Stress Index:** ${burnout.stressIndex}% (${burnout.stressStatus})
- **Base Breakdown:** School (${burnout.schoolHours}h) + Cadets (${burnout.cadetsHours}h) + Art (${burnout.artSupportHours}h) + Drums (${burnout.drumsHours}h) + DofE (${burnout.dofeHours}h)

---

## 3. Instructions for Reviewing Agent (Claude / Gemini)
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

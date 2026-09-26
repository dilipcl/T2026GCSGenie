import { db } from '../db';
import { AgentAuditReport, ParentSettings, RAGStatus } from '../types';
import { calculateBurnoutCapacity, type BurnoutCapacityResult } from './burnoutEngine';
import { calculateSubjectRAG, calculateTotalXP } from './ragCalculator';
import { calculateStreakStats } from './habitEngine';
import { logAuditEvent } from './auditService';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { newId } from '../utils/id';
import { askForJson, liveProvider } from './llmClient';

export async function runAgenticAudit(settings: ParentSettings): Promise<AgentAuditReport> {
  const burnout = await calculateBurnoutCapacity();
  const xp = await calculateTotalXP();
  // Must match the dashboard. The legacy calculateStreak reset on any single
  // missed day, so the parent's audit contradicted the streak the student saw.
  const streakStats = await calculateStreakStats();
  const streak = streakStats.current;

  const ragList = [];
  const neglectedSubjects: string[] = [];

  for (const sub of INITIAL_SUBJECTS) {
    const rag = await calculateSubjectRAG(sub.id);
    ragList.push({
      id: sub.id,
      name: sub.name,
      ragStatus: rag.ragStatus,
      healthScore: rag.healthScore,
      hwRate: rag.homeworkCompletionRate,
      remRate: rag.remediationCompletionRate,
      mastered: rag.topicsMastered,
      total: rag.totalTopics,
    });

    if (rag.ragStatus === 'RED' || rag.homeworkCompletionRate < 70) {
      neglectedSubjects.push(`${sub.name} (HW: ${rag.homeworkCompletionRate}%, Status: ${rag.ragStatus})`);
    }
  }

  const checkIns = await db.checkIns.orderBy('date').reverse().limit(14).toArray();
  const recentTasks = await db.tasks.toArray();
  const remediations = await db.remediations.toArray();
  const pendingRemediations = remediations.filter((r) => !r.isCompleted);

  const context = {
    burnout,
    xp,
    streak,
    streakStats,
    ragList,
    neglectedSubjects,
    checkIns,
    pendingRemediations,
  };

  /**
   * Why the offline engine ended up producing the report. Left undefined when
   * offline was the deliberate choice, so the portal only shows a warning when
   * something actually went wrong.
   */
  let fallbackReason: string | undefined;

  /**
   * One call, whichever provider is configured.
   *
   * This was three functions - Gemini, Claude, OpenAI - each with its own
   * endpoint, auth header, response shape and JSON parsing, and each repeating
   * the same prompt with small drifts. `llmClient` owns all of that now, so
   * what is left here is the question and the schema, which is the only part
   * that is actually about auditing a fourteen-year-old's week.
   */
  const { provider, reason } = liveProvider(settings);

  if (!provider) {
    fallbackReason = reason;
  } else {
    try {
      const { data, model } = await askForJson<AuditAnswer>({
        settings,
        prompt: auditPrompt(context),
        schema: AUDIT_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 8000,
      });

      const report: AgentAuditReport = {
        id: newId('auditreport'),
        timestamp: Date.now(),
        generatedBy: `${provider} (${model})`,
        curriculumStatusSummary: data.curriculumStatusSummary,
        burnoutStressIndexScore: data.burnoutStressIndexScore || burnout.stressIndex,
        burnoutStatus: (data.burnoutStatus || burnout.stressStatus) as RAGStatus,
        subjectBalanceAlerts: data.subjectBalanceAlerts ?? [],
        actionableRecommendations: data.actionableRecommendations ?? [],
        rawMarkdown: data.rawMarkdown,
      };

      await saveAuditReport(report);
      return report;
    } catch (err) {
      fallbackReason =
        err instanceof Error ? err.message : `The ${provider} call failed for an unknown reason.`;
      console.warn('Live LLM call failed. Falling back to the deterministic agent engine:', err);
    }
  }

  // Built-in Deterministic Agentic Engine (Works 100% Offline & Private)
  const report = generateDeterministicAuditReport({
    ...context,
    recentTasks,
    fallbackReason,
  });

  await saveAuditReport(report);
  return report;
}

function generateDeterministicAuditReport(data: {
  burnout: BurnoutCapacityResult;
  xp: any;
  streak: number;
  ragList: any[];
  neglectedSubjects: string[];
  checkIns: any[];
  pendingRemediations: any[];
  recentTasks: any[];
  fallbackReason?: string;
}): AgentAuditReport {
  const alerts: string[] = [];
  const recommendations: string[] = [];

  // Subject alerts
  if (data.neglectedSubjects.length > 0) {
    alerts.push(`Subject attention required: ${data.neglectedSubjects.join(', ')}.`);
  } else {
    alerts.push('All 6 GCSE subjects maintain healthy homework and topic mastery rates.');
  }

  // Computer Science specific check (GCS IR3 report context)
  const csRag = data.ragList.find((r) => r.id === 'computer_science');
  if (csRag && csRag.hwRate < 100) {
    alerts.push('Computer Science Home Learning: IR3 highlighted missing homework risk under teacher AMN. Maintain strict on-time submissions.');
    recommendations.push('Dedicate 30 mins every Tuesday evening to complete OCR CS Component 1 networking & SQL questions.');
  }

  // Burnout check
  if (data.burnout.stressStatus === 'RED') {
    alerts.push(`Critical Stress Alert: ${data.burnout.totalScheduledHours}h scheduled vs ${data.burnout.safeWeeklyHoursLimit}h safe threshold.`);
    recommendations.push('Apply MoSCoW prioritization: Pause non-essential recreational goals.');
  } else if (data.burnout.stressStatus === 'AMBER') {
    recommendations.push(`Capacity is near safe limits (${data.burnout.totalScheduledHours}h/${data.burnout.safeWeeklyHoursLimit}h). Maintain strict 22:00 sleep cutoff.`);
  }

  // Remediation Quests
  if (data.pendingRemediations.length > 0) {
    recommendations.push(`Complete pending Year 9 diagnostic remediations (${data.pendingRemediations.length} active quests) to unlock up to +${data.pendingRemediations.reduce((s, r) => s + r.xpReward, 0)} XP.`);
  }

  // Curriculum summary
  const greenCount = data.ragList.filter((r) => r.ragStatus === 'GREEN').length;
  const amberCount = data.ragList.filter((r) => r.ragStatus === 'AMBER').length;
  const redCount = data.ragList.filter((r) => r.ragStatus === 'RED').length;

  const curriculumStatusSummary = `${greenCount}/6 Subjects On-Track (Green), ${amberCount}/6 Requiring Focus (Amber), ${redCount}/6 at Risk (Red). Target: Grade 9 across all 6 GCSEs.`;

  const rawMarkdown = `### GCSE Genie: Parent Agentic Alignment Report
**Student:** Tejas Dilip | **Date:** ${new Date().toLocaleDateString('en-GB')}  
**Target Milestone:** Grade 9 Excellence across all 6 GCSEs (Guildford County School)

#### 1. Curriculum Health Matrix
- **Academic Status:** ${curriculumStatusSummary}
${data.ragList.map((r) => `  * **${r.name}:** [${r.ragStatus}] Score: ${r.healthScore}/100 | HW: ${r.hwRate}% | Remediations: ${r.remRate}%`).join('\n')}

#### 2. Time-Capacity & Burnout Risk Analysis
- **Total Scheduled Load:** ${data.burnout.totalScheduledHours} hrs / ${data.burnout.safeWeeklyHoursLimit} hrs max safe capacity (includes school hours).
- **Stress Index:** ${data.burnout.stressIndex}% (${data.burnout.stressStatus}).
- **Base Commitments:** ${data.burnout.commitmentBreakdown.map((c) => `${c.label} (${c.netHours}h)`).join(' + ')}.
- **Excused This Week:** ${data.burnout.excusedHours > 0 ? `${data.burnout.excusedHours}h across ${data.burnout.exceptions.length} logged absence(s) - already deducted above.` : 'Nothing; every commitment ran as scheduled.'}
- **Logged Revision This Week:** ${data.burnout.loggedRevisionHours} hrs.

#### 3. Subject Balance & Key Alerts
${alerts.map((a) => `- ${a}`).join('\n')}

#### 4. Actionable Adjustments for Next Week
${recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}
`;

  return {
    id: newId('auditreport'),
    timestamp: Date.now(),
    generatedBy: 'GCSE Genie Rule & Agent Engine (Offline & Private)',
    curriculumStatusSummary,
    burnoutStressIndexScore: data.burnout.stressIndex,
    burnoutStatus: data.burnout.stressStatus as RAGStatus,
    subjectBalanceAlerts: alerts,
    actionableRecommendations: recommendations,
    rawMarkdown,
    fallbackReason: data.fallbackReason,
  };
}

/** The shape the audit answer has to come back in, for every provider. */
const AUDIT_SCHEMA = {
  type: 'object',
  properties: {
    curriculumStatusSummary: { type: 'string' },
    burnoutStressIndexScore: { type: 'number' },
    burnoutStatus: { type: 'string', enum: ['GREEN', 'AMBER', 'RED'] },
    subjectBalanceAlerts: { type: 'array', items: { type: 'string' } },
    actionableRecommendations: { type: 'array', items: { type: 'string' } },
    rawMarkdown: { type: 'string', description: 'The full report, formatted as markdown.' },
  },
  required: [
    'curriculumStatusSummary',
    'burnoutStressIndexScore',
    'burnoutStatus',
    'subjectBalanceAlerts',
    'actionableRecommendations',
    'rawMarkdown',
  ],
  additionalProperties: false,
} as const;

interface AuditAnswer {
  curriculumStatusSummary: string;
  burnoutStressIndexScore: number;
  burnoutStatus: string;
  subjectBalanceAlerts: string[];
  actionableRecommendations: string[];
  rawMarkdown: string;
}

/**
 * The question, written once.
 *
 * It was written three times - once per provider - and the three copies had
 * already drifted: two asked for an exact JSON schema and the third asked for a
 * list of fields in prose, so the same week produced a differently shaped report
 * depending on whose key was saved.
 */
function auditPrompt(context: unknown): string {
  return `You are the Parent Agentic Auditor for Tejas Dilip, a Year 10 GCSE student at Guildford County School targeting straight Grade 9s.

Analyse the following student data and report on it. Be specific about which subjects need attention and why, and make every recommendation something that can be done in a week.

Student data:
${JSON.stringify(context, null, 2)}`;
}

async function saveAuditReport(report: AgentAuditReport) {
  await db.agentAuditReports.add(report);
  await logAuditEvent({
    user: 'PARENT',
    action: 'AGENT_AUDIT',
    entity: 'AgentAuditReport',
    entityId: report.id,
    newValue: `Generated audit with status ${report.burnoutStatus}`,
  });
}

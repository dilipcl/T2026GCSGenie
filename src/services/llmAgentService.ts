import { db } from '../db';
import { AgentAuditReport, ParentSettings, RAGStatus } from '../types';
import { calculateBurnoutCapacity } from './burnoutEngine';
import { calculateSubjectRAG, calculateTotalXP, calculateStreak } from './ragCalculator';
import { logAuditEvent } from './auditService';
import { INITIAL_SUBJECTS } from '../db/seedData';

export async function runAgenticAudit(settings: ParentSettings): Promise<AgentAuditReport> {
  const burnout = await calculateBurnoutCapacity();
  const xp = await calculateTotalXP();
  const streak = await calculateStreak();

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

  // If parent provided API Key and selected a live LLM Provider
  if (settings.llmApiKey && settings.llmApiKey.trim() !== '') {
    try {
      if (settings.llmProvider === 'GEMINI') {
        const report = await callGeminiAudit(settings, {
          burnout,
          xp,
          streak,
          ragList,
          neglectedSubjects,
          checkIns,
          pendingRemediations,
        });
        await saveAuditReport(report);
        return report;
      } else if (settings.llmProvider === 'CLAUDE') {
        const report = await callClaudeAudit(settings, {
          burnout,
          xp,
          streak,
          ragList,
          neglectedSubjects,
          checkIns,
          pendingRemediations,
        });
        await saveAuditReport(report);
        return report;
      }
    } catch (err) {
      console.warn('Live LLM call failed or timed out. Falling back to deterministic agent engine:', err);
    }
  }

  // Built-in Deterministic Agentic Engine (Works 100% Offline & Private)
  const report = generateDeterministicAuditReport({
    burnout,
    xp,
    streak,
    ragList,
    neglectedSubjects,
    checkIns,
    pendingRemediations,
    recentTasks,
  });

  await saveAuditReport(report);
  return report;
}

function generateDeterministicAuditReport(data: {
  burnout: any;
  xp: any;
  streak: number;
  ragList: any[];
  neglectedSubjects: string[];
  checkIns: any[];
  pendingRemediations: any[];
  recentTasks: any[];
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
    alerts.push(`Critical Stress Alert: ${data.burnout.totalScheduledHours}h scheduled vs 45h safe threshold.`);
    recommendations.push('Apply MoSCoW prioritization: Pause non-essential recreational goals.');
  } else if (data.burnout.stressStatus === 'AMBER') {
    recommendations.push('Capacity is near safe limits (44h/45h). Maintain strict 22:00 sleep cutoff.');
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
- **Total Scheduled Load:** ${data.burnout.totalScheduledHours} hrs / 45.0 hrs max safe capacity.
- **Stress Index:** ${data.burnout.stressIndex}% (${data.burnout.stressStatus}).
- **Base Commitments:** School (32.5h) + Air Cadets (6h Tue/Fri) + Art (1.5h) + Drums (2h) + DofE (2h).

#### 3. Subject Balance & Key Alerts
${alerts.map((a) => `- ${a}`).join('\n')}

#### 4. Actionable Adjustments for Next Week
${recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}
`;

  return {
    id: `audit_report_${Date.now()}`,
    timestamp: Date.now(),
    generatedBy: 'GCSE Genie Rule & Agent Engine (Offline & Private)',
    curriculumStatusSummary,
    burnoutStressIndexScore: data.burnout.stressIndex,
    burnoutStatus: data.burnout.stressStatus as RAGStatus,
    subjectBalanceAlerts: alerts,
    actionableRecommendations: recommendations,
    rawMarkdown,
  };
}

async function callGeminiAudit(settings: ParentSettings, context: any): Promise<AgentAuditReport> {
  const model = settings.llmModelName || 'gemini-1.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.llmApiKey}`;

  const prompt = `You are the Parent Agentic Auditor for Tejas Dilip, a Year 10 GCSE student at Guildford County School targeting straight Grade 9s.
Analyze the following student data and return a JSON object with this exact schema:
{
  "curriculumStatusSummary": "string",
  "burnoutStressIndexScore": number,
  "burnoutStatus": "GREEN" | "AMBER" | "RED",
  "subjectBalanceAlerts": ["string"],
  "actionableRecommendations": ["string"],
  "rawMarkdown": "string (full markdown report formatted nicely)"
}

Student Data:
${JSON.stringify(context, null, 2)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  const json = await res.json();
  const text = json.candidates[0].content.parts[0].text;
  const parsed = JSON.parse(text);

  return {
    id: `audit_report_${Date.now()}`,
    timestamp: Date.now(),
    generatedBy: `Google Gemini (${model})`,
    curriculumStatusSummary: parsed.curriculumStatusSummary,
    burnoutStressIndexScore: parsed.burnoutStressIndexScore || context.burnout.stressIndex,
    burnoutStatus: parsed.burnoutStatus || context.burnout.stressStatus,
    subjectBalanceAlerts: parsed.subjectBalanceAlerts || [],
    actionableRecommendations: parsed.actionableRecommendations || [],
    rawMarkdown: parsed.rawMarkdown || text,
  };
}

async function callClaudeAudit(settings: ParentSettings, context: any): Promise<AgentAuditReport> {
  const model = settings.llmModelName || 'claude-3-5-sonnet-20241022';
  const url = 'https://api.anthropic.com/v1/messages';

  const prompt = `You are the Parent Agentic Auditor for Tejas Dilip, a Year 10 GCSE student at Guildford County School targeting straight Grade 9s.
Analyze the following student data and return a JSON object with:
- curriculumStatusSummary (string)
- burnoutStressIndexScore (number)
- burnoutStatus ("GREEN" | "AMBER" | "RED")
- subjectBalanceAlerts (array of strings)
- actionableRecommendations (array of strings)
- rawMarkdown (full markdown report)

Data:
${JSON.stringify(context, null, 2)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.llmApiKey || '',
      'anthropic-version': '2023-06-01',
      'dangerously-allow-browser': 'true',
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const json = await res.json();
  const text = json.content[0].text;
  let parsed;
  try {
    parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
  } catch {
    parsed = { rawMarkdown: text };
  }

  return {
    id: `audit_report_${Date.now()}`,
    timestamp: Date.now(),
    generatedBy: `Anthropic Claude (${model})`,
    curriculumStatusSummary: parsed.curriculumStatusSummary || 'Audit completed via Claude.',
    burnoutStressIndexScore: parsed.burnoutStressIndexScore || context.burnout.stressIndex,
    burnoutStatus: parsed.burnoutStatus || context.burnout.stressStatus,
    subjectBalanceAlerts: parsed.subjectBalanceAlerts || [],
    actionableRecommendations: parsed.actionableRecommendations || [],
    rawMarkdown: parsed.rawMarkdown || text,
  };
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

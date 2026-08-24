import { db } from '../db';
import { AgentAuditReport, ParentSettings, RAGStatus } from '../types';
import { calculateBurnoutCapacity } from './burnoutEngine';
import { calculateSubjectRAG, calculateTotalXP } from './ragCalculator';
import { calculateStreakStats } from './habitEngine';
import { logAuditEvent } from './auditService';
import { INITIAL_SUBJECTS } from '../db/seedData';
import { newId } from '../utils/id';

/** Turns whatever a provider returned into one line a parent can act on. */
async function describeHttpFailure(provider: string, res: Response): Promise<string> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.error?.type || JSON.stringify(body).slice(0, 200);
  } catch {
    detail = await res.text().catch(() => '');
  }

  if (res.status === 401 || res.status === 403) {
    return `${provider} rejected the API key (HTTP ${res.status}). Check the key in AI Audit Settings.`;
  }
  if (res.status === 429) {
    return `${provider} rate limit or quota reached (HTTP 429). Try again later, or check billing.`;
  }
  if (res.status === 404) {
    return `${provider} does not recognise the model name "${detail ? detail.slice(0, 80) : 'unknown'}" (HTTP 404).`;
  }
  return `${provider} returned HTTP ${res.status}. ${detail.slice(0, 160)}`.trim();
}

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

  const liveProviders: Record<string, (s: ParentSettings, c: unknown) => Promise<AgentAuditReport>> = {
    GEMINI: callGeminiAudit,
    CLAUDE: callClaudeAudit,
    OPENAI: callOpenAIAudit,
  };

  const caller = liveProviders[settings.llmProvider];

  if (caller) {
    if (!settings.llmApiKey || settings.llmApiKey.trim() === '') {
      fallbackReason = `${settings.llmProvider} is selected but no API key is saved, so the offline engine ran instead.`;
    } else {
      try {
        const report = await caller(settings, context);
        await saveAuditReport(report);
        return report;
      } catch (err) {
        fallbackReason =
          err instanceof Error ? err.message : `The ${settings.llmProvider} call failed for an unknown reason.`;
        console.warn('Live LLM call failed. Falling back to the deterministic agent engine:', err);
      }
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
  burnout: any;
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
- **Base Commitments:** School (${data.burnout.schoolHours}h) + Air Cadets (${data.burnout.cadetsHours}h Tue/Fri) + Art (${data.burnout.artSupportHours}h) + Drums (${data.burnout.drumsHours}h) + DofE (${data.burnout.dofeHours}h).
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

  // Without this an error body falls through to json.candidates[0] and throws a
  // bare TypeError, which told the parent nothing about the real cause.
  if (!res.ok) throw new Error(await describeHttpFailure('Google Gemini', res));

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Google Gemini returned an empty response.');
  const parsed = JSON.parse(text);

  return {
    id: newId('auditreport'),
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
  const model = settings.llmModelName || 'claude-opus-5';
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
      // The correct opt-in for calling the Anthropic API straight from a page.
      // This was previously spelled 'dangerously-allow-browser', which is not a
      // header the API recognises, so every browser call was blocked by CORS.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      // A full markdown report does not fit in 1500 tokens; the old ceiling cut
      // reports off mid-sentence.
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(await describeHttpFailure('Anthropic Claude', res));

  const json = await res.json();
  const text = json?.content?.find((b: { type: string }) => b.type === 'text')?.text;
  if (!text) throw new Error('Anthropic Claude returned no text content.');

  let parsed;
  try {
    parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
  } catch {
    parsed = { rawMarkdown: text };
  }

  return {
    id: newId('auditreport'),
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

/**
 * OpenAI was offered in the settings dropdown but had no execution branch, so
 * choosing it silently produced an offline report that claimed to be an audit.
 */
async function callOpenAIAudit(settings: ParentSettings, context: any): Promise<AgentAuditReport> {
  const model = settings.llmModelName || 'gpt-4o';
  const url = 'https://api.openai.com/v1/chat/completions';

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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.llmApiKey || ''}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(await describeHttpFailure('OpenAI', res));

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned an empty response.');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { rawMarkdown: text };
  }

  return {
    id: newId('auditreport'),
    timestamp: Date.now(),
    generatedBy: `OpenAI (${model})`,
    curriculumStatusSummary: parsed.curriculumStatusSummary || 'Audit completed via OpenAI.',
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

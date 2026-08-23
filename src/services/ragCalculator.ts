import { db } from '../db';
import { RAGStatus, SubjectId } from '../types';

export interface SubjectRAGResult {
  subjectId: SubjectId;
  healthScore: number; // 0 - 100
  ragStatus: RAGStatus;
  homeworkCompletionRate: number; // 0 - 100
  remediationCompletionRate: number; // 0 - 100
  topicsMastered: number;
  totalTopics: number;
  details: string;
}

export async function calculateSubjectRAG(subjectId: SubjectId): Promise<SubjectRAGResult> {
  // 1. Homework tasks for this subject
  const allTasks = await db.tasks.where('subjectId').equals(subjectId).toArray();
  const homeworkTasks = allTasks.filter((t) => t.isHomework);
  const completedHomework = homeworkTasks.filter((t) => t.completed);
  const hwRate = homeworkTasks.length > 0 ? (completedHomework.length / homeworkTasks.length) * 100 : 100;

  // 2. Remediation actions for this subject
  const remediations = await db.remediations.where('subjectId').equals(subjectId).toArray();
  const completedRemediations = remediations.filter((r) => r.isCompleted);
  const remRate = remediations.length > 0 ? (completedRemediations.length / remediations.length) * 100 : 100;

  // 3. Topics mastery
  const topics = await db.syllabusTopics.where('subjectId').equals(subjectId).toArray();
  const masteredTopics = topics.filter((t) => t.isCompleted || t.confidenceRating >= 4);
  const topicRate = topics.length > 0 ? (masteredTopics.length / topics.length) * 100 : 80;

  // Health Score Weighted: 40% Homework, 35% Remediations, 25% Topics Mastered
  const score = Math.round(hwRate * 0.4 + remRate * 0.35 + topicRate * 0.25);

  let ragStatus: RAGStatus = 'GREEN';
  let details = 'On track for Grade 9 mastery.';

  if (score < 65) {
    ragStatus = 'RED';
    details = 'Critical risk to Grade 9 target! Overdue tasks or unaddressed diagnostics.';
  } else if (score < 85) {
    ragStatus = 'AMBER';
    details = 'Attention needed. Incomplete remediations or pending homework.';
  }

  return {
    subjectId,
    healthScore: score,
    ragStatus,
    homeworkCompletionRate: Math.round(hwRate),
    remediationCompletionRate: Math.round(remRate),
    topicsMastered: masteredTopics.length,
    totalTopics: topics.length,
    details,
  };
}

export async function calculateTotalXP(): Promise<{
  totalXP: number;
  availableXP: number;
  redeemedXP: number;
  penaltyXP: number;
  isShopFrozen: boolean;
}> {
  // Check-ins XP
  const checkIns = await db.checkIns.toArray();
  const checkInXP = checkIns.reduce((sum, c) => sum + (c.xpEarned || 0), 0);

  // Completed Tasks XP
  const tasks = await db.tasks.toArray();
  const taskXP = tasks.filter((t) => t.completed).reduce((sum, t) => sum + (t.xpValue || 0), 0);

  // Completed Remediations XP
  const remediations = await db.remediations.toArray();
  const remXP = remediations.filter((r) => r.isCompleted).reduce((sum, r) => sum + (r.xpReward || 0), 0);

  // Sanctions penalty & freeze status
  const sanctions = await db.sanctions.toArray();
  const penaltyXP = sanctions.reduce((sum, s) => sum + Math.abs(s.penaltyXP || 0), 0);
  const isShopFrozen = sanctions.some((s) => s.shopFrozen && !s.resolvedAt);

  // Redeemed XP
  const redemptions = await db.redemptions.toArray();
  const redeemedXP = redemptions
    .filter((r) => r.status === 'APPROVED')
    .reduce((sum, r) => sum + (r.costXP || 0), 0);

  const totalEarned = checkInXP + taskXP + remXP;
  const availableXP = Math.max(0, totalEarned - penaltyXP - redeemedXP);

  return {
    totalXP: totalEarned,
    availableXP,
    redeemedXP,
    penaltyXP,
    isShopFrozen,
  };
}

export async function calculateStreak(): Promise<number> {
  const checkIns = await db.checkIns.orderBy('date').reverse().toArray();
  if (checkIns.length === 0) return 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const latestDate = checkIns[0].date;
  if (latestDate !== todayStr && latestDate !== yesterdayStr) {
    return 0;
  }

  let streak = 0;
  let currentDate = new Date(latestDate);

  for (const c of checkIns) {
    const expectedDateStr = currentDate.toISOString().split('T')[0];
    if (c.date === expectedDateStr) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

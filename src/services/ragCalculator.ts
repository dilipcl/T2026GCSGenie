import { db } from '../db';
import { RAGStatus, SubjectId, isNonExamSubject } from '../types';

export interface SubjectRAGResult {
  subjectId: SubjectId;
  healthScore: number; // 0 - 100
  ragStatus: RAGStatus;
  isManualOverride: boolean;
  homeworkCompletionRate: number; // 0 - 100
  remediationCompletionRate: number; // 0 - 100
  topicsMastered: number;
  totalTopics: number;
  /**
   * Mean percentage across every marked assessment logged for this subject.
   * Reported alongside the health score rather than folded into it: the score's
   * weighting is a deliberate 40/35/25 split and quietly changing it would move
   * every subject's RAG status without anyone asking for that.
   */
  assessmentAveragePercent: number;
  assessmentCount: number;
  details: string;
  /**
   * True for General and Revision. These have no syllabus and no target grade,
   * so a health score for them would be an arithmetic result with no meaning -
   * and, because the topic term defaults to 80 when there are no topics, a
   * consistently misleading one. Callers should hide the RAG chip entirely
   * rather than render a grey one.
   */
  isNonExam: boolean;
}

export async function calculateSubjectRAG(subjectId: SubjectId): Promise<SubjectRAGResult> {
  const subjectConfig = await db.subjects.get(subjectId);

  /**
   * General and Revision exit before any scoring happens.
   *
   * They carry no topics and no remediations, so the weighted score would be
   * 40% homework + 35% (default 100) + 25% (default 80) - a number that moves
   * only with homework and reads as a real health figure to anyone looking at
   * the dashboard. Returning a neutral 100 with the flag set keeps them out of
   * the RED count without inventing a judgement about them.
   */
  if (isNonExamSubject(subjectId)) {
    const tasks = await db.tasks.where('subjectId').equals(subjectId).toArray();
    return {
      subjectId,
      healthScore: 100,
      ragStatus: 'GREEN',
      isManualOverride: false,
      homeworkCompletionRate: 100,
      remediationCompletionRate: 100,
      topicsMastered: 0,
      totalTopics: 0,
      assessmentAveragePercent: 0,
      assessmentCount: 0,
      details: `Not an exam subject - ${tasks.length} item${
        tasks.length === 1 ? '' : 's'
      } logged. Time counts towards workload; no grade is tracked.`,
      isNonExam: true,
    };
  }

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

  // 4. Marked work actually handed back by a teacher
  const assessments = await db.assessments.where('subjectId').equals(subjectId).toArray();
  const assessmentAveragePercent =
    assessments.length > 0
      ? Math.round(assessments.reduce((sum, a) => sum + (a.percentage || 0), 0) / assessments.length)
      : 0;

  // Health Score Weighted: 40% Homework, 35% Remediations, 25% Topics Mastered
  let score = Math.round(hwRate * 0.4 + remRate * 0.35 + topicRate * 0.25);
  let ragStatus: RAGStatus = 'GREEN';
  let isManualOverride = false;

  // Check if subject has a manual override
  if (subjectConfig?.manualRAGOverride) {
    ragStatus = subjectConfig.manualRAGOverride;
    isManualOverride = true;
    if (subjectConfig.manualHealthScore !== undefined && subjectConfig.manualHealthScore !== null) {
      score = subjectConfig.manualHealthScore;
    }
  } else {
    if (score < 65) {
      ragStatus = 'RED';
    } else if (score < 85) {
      ragStatus = 'AMBER';
    } else {
      ragStatus = 'GREEN';
    }
  }

  let details = isManualOverride
    ? `Manually set by Parent/Student: [${ragStatus}].`
    : ragStatus === 'GREEN'
    ? 'On track for Grade 9 mastery.'
    : ragStatus === 'AMBER'
    ? 'Attention needed. Incomplete remediations or pending homework.'
    : 'Critical risk to Grade 9 target! Overdue tasks or unaddressed diagnostics.';

  return {
    subjectId,
    healthScore: score,
    ragStatus,
    isManualOverride,
    homeworkCompletionRate: Math.round(hwRate),
    remediationCompletionRate: Math.round(remRate),
    topicsMastered: masteredTopics.length,
    totalTopics: topics.length,
    assessmentAveragePercent,
    assessmentCount: assessments.length,
    details,
    isNonExam: false,
  };
}

export interface XPLedger {
  totalXP: number;
  /** What can actually be spent right now: earned, less penalties, redemptions and pending requests. */
  availableXP: number;
  /** Held against redemption requests the parent has not resolved yet. */
  reservedXP: number;
  redeemedXP: number;
  penaltyXP: number;
  /**
   * Negative balance carried by data that predates XP reservation, or by a
   * parent overriding the block. Surfaced rather than hidden by the clamp.
   */
  overdraftXP: number;
  isShopFrozen: boolean;
}

export async function calculateTotalXP(): Promise<XPLedger> {
  // Check-ins XP (daily base + task/revision bonuses across all check-ins)
  const checkIns = await db.checkIns.toArray();
  const checkInXP = checkIns.reduce((sum, c) => sum + (c.xpEarned || 0), 0);

  // Completed Tasks XP
  const tasks = await db.tasks.toArray();
  const taskXP = tasks.filter((t) => t.completed).reduce((sum, t) => sum + (t.xpValue || 0), 0);

  // Completed Remediations XP
  const remediations = await db.remediations.toArray();
  const remXP = remediations.filter((r) => r.isCompleted).reduce((sum, r) => sum + (r.xpReward || 0), 0);

  // Chores XP.
  //
  // Read straight from the completion rows rather than from the chore's current
  // value: changing a chore from 10 XP to 25 XP must not retroactively repay
  // every time it was already done.
  const choreCompletions = await db.choreCompletions.toArray();
  const choreXP = choreCompletions.reduce((sum, c) => sum + (c.xpAwarded || 0), 0);

  // Sanctions penalty & freeze status
  const sanctions = await db.sanctions.toArray();
  const penaltyXP = sanctions.reduce((sum, s) => sum + Math.abs(s.penaltyXP || 0), 0);
  const isShopFrozen = sanctions.some((s) => s.shopFrozen && !s.resolvedAt);

  // Redeemed and reserved XP.
  //
  // A PENDING request has to hold its cost aside. Counting only APPROVED rows
  // let the student queue three 1000 XP rewards against a 1200 XP balance -
  // each request passed the affordability check on its own, and approving all
  // three took the true balance to -1800, which the old Math.max(0, ...) then
  // hid as a clean zero.
  const redemptions = await db.redemptions.toArray();
  const redeemedXP = redemptions
    .filter((r) => r.status === 'APPROVED')
    .reduce((sum, r) => sum + (r.costXP || 0), 0);
  const reservedXP = redemptions
    .filter((r) => r.status === 'PENDING')
    .reduce((sum, r) => sum + (r.costXP || 0), 0);

  const totalEarned = checkInXP + taskXP + remXP + choreXP;
  const trueBalance = totalEarned - penaltyXP - redeemedXP - reservedXP;

  return {
    totalXP: totalEarned,
    availableXP: Math.max(0, trueBalance),
    reservedXP,
    redeemedXP,
    penaltyXP,
    overdraftXP: trueBalance < 0 ? Math.abs(trueBalance) : 0,
    isShopFrozen,
  };
}

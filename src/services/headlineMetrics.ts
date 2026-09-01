import { db } from '../db';
import { calculateTotalXP } from './ragCalculator';
import { calculateBurnoutCapacity, safeStudyHours } from './burnoutEngine';
import { loadWeekCommitment } from './planService';
import { baselineStatus, loadBaseline } from './planBaselineService';
import { readActivityLoad } from './activityPlanService';
import { portfolioBurndown } from './goalBurndown';
import { readSanctionStanding } from './sanctionService';
import { currentWeek } from './weekWindow';
import { daysUntil, todayISO } from '../utils/date';

/**
 * The week in one line, moving.
 *
 * Everything here already exists on some card somewhere, which is exactly the
 * problem it solves: the numbers that say how the term is going are spread over
 * four screens, and nobody visits four screens. A single passing line is the
 * one place a figure can appear without being asked for.
 *
 * Two rules keep it from becoming wallpaper. Nothing appears unless it is true
 * and current - a headline that says "0 day streak" every day for a month is
 * noise wearing the costume of information. And the tone is stated separately
 * from the text, so the ticker can be read at a glance without any item having
 * to shout.
 */

export type HeadlineTone = 'GOOD' | 'NEUTRAL' | 'WATCH' | 'BAD';

export interface Headline {
  /** Stable across renders so React can key the list and the marquee can loop. */
  id: string;
  icon: string;
  /** Short enough to read as it passes. Roughly six words. */
  text: string;
  tone: HeadlineTone;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Assembles the line.
 *
 * Reads are issued together rather than in sequence: this runs on every Home
 * render, and eight awaits in a row on a phone is a visible pause on the screen
 * people open most.
 */
export async function readHeadlines(today: string = todayISO()): Promise<Headline[]> {
  const [xp, capacity, commitment, baseline, activity, burndown, sanctions, checkIns, goals] =
    await Promise.all([
      calculateTotalXP(),
      calculateBurnoutCapacity(),
      loadWeekCommitment(),
      loadBaseline(),
      readActivityLoad(),
      portfolioBurndown(today),
      readSanctionStanding(today),
      db.checkIns.toArray(),
      db.goals.toArray(),
    ]);

  const week = currentWeek();
  const out: Headline[] = [];

  // --- XP, which is the number the student actually cares about ---
  out.push({
    id: 'xp',
    icon: '⚡',
    text: `${xp.availableXP.toLocaleString()} XP to spend`,
    tone: xp.availableXP > 0 ? 'GOOD' : 'NEUTRAL',
  });

  if (xp.isShopFrozen) {
    out.push({
      id: 'shop',
      icon: '🔒',
      text: 'Rewards Shop frozen until the sanction is cleared',
      tone: 'BAD',
    });
  }

  // --- The week's promise ---
  if (commitment.committedCount > 0) {
    out.push({
      id: 'committed',
      icon: '📋',
      text: `${commitment.committedDone} of ${commitment.committedCount} committed tasks done`,
      tone:
        commitment.committedDone === commitment.committedCount
          ? 'GOOD'
          : commitment.overdueCommitted > 0
          ? 'WATCH'
          : 'NEUTRAL',
    });
  }

  if (commitment.overdueCommitted > 0) {
    out.push({
      id: 'overdue',
      icon: '⏰',
      text: `${commitment.overdueCommitted} committed ${
        commitment.overdueCommitted === 1 ? 'task is' : 'tasks are'
      } overdue`,
      tone: 'BAD',
    });
  }

  // --- Whether the week has been agreed at all ---
  const status = baselineStatus(baseline);
  out.push({
    id: 'baseline',
    icon: status === 'BASELINED' ? '✅' : status === 'AWAITING_APPROVAL' ? '⏳' : '📝',
    text:
      status === 'BASELINED'
        ? "This week's plan is agreed"
        : status === 'AWAITING_APPROVAL'
        ? 'Plan sent — waiting on a parent'
        : 'This week is still a draft',
    tone: status === 'BASELINED' ? 'GOOD' : status === 'AWAITING_APPROVAL' ? 'NEUTRAL' : 'WATCH',
  });

  // --- Time: what is left, and what the week is spending it on ---
  const headroom = round1(Math.max(0, safeStudyHours(capacity)));
  out.push({
    id: 'headroom',
    icon: '⏳',
    text: `${headroom}h of study time left this week`,
    tone: headroom <= 0 ? 'BAD' : headroom < 3 ? 'WATCH' : 'NEUTRAL',
  });

  if (activity.bespokeExpectedHours > 0) {
    out.push({
      id: 'activities',
      icon: '🎉',
      text: `${activity.bespokeExpectedHours}h booked for life outside school`,
      tone: 'NEUTRAL',
    });
  }

  if (activity.freedHours > 0) {
    out.push({
      id: 'freed',
      icon: '↩️',
      text: `${activity.freedHours}h came back — plans changed`,
      tone: 'GOOD',
    });
  }

  // --- Study actually logged this week ---
  const weekMinutes = checkIns
    .filter((c) => c.date >= week.start && c.date <= week.end)
    .reduce((sum, c) => sum + (c.completedRevisionMinutes || 0), 0);
  if (weekMinutes > 0) {
    out.push({
      id: 'studied',
      icon: '📚',
      text: `${round1(weekMinutes / 60)}h studied so far this week`,
      tone: 'GOOD',
    });
  }

  // --- The long game ---
  if (burndown.goals.length > 0) {
    const behind = burndown.goals.filter((g) => g.varianceHours < 0).length;
    out.push({
      id: 'goals',
      icon: '🎯',
      text:
        behind === 0
          ? `All ${burndown.goals.length} goals on track`
          : `${behind} of ${burndown.goals.length} goals behind their line`,
      tone: behind === 0 ? 'GOOD' : 'WATCH',
    });

    if (burndown.varianceHours !== 0) {
      const ahead = burndown.varianceHours > 0;
      out.push({
        id: 'variance',
        icon: ahead ? '📈' : '📉',
        text: `${Math.abs(round1(burndown.varianceHours))}h ${ahead ? 'ahead of' : 'behind'} plan`,
        tone: ahead ? 'GOOD' : 'WATCH',
      });
    }
  }

  const locked = goals.filter((g) => g.status === 'APPROVED_LOCKED').length;
  if (locked > 0 && burndown.goals.length === 0) {
    out.push({
      id: 'nobudget',
      icon: '🎯',
      text: `${locked} approved ${locked === 1 ? 'goal has' : 'goals have'} no weekly hours set`,
      tone: 'WATCH',
    });
  }

  // --- Behaviour, stated without editorialising ---
  if (sanctions.recentCount > 0) {
    out.push({
      id: 'sanctions',
      icon: '⚠️',
      text: `${sanctions.recentCount} sanction${
        sanctions.recentCount === 1 ? '' : 's'
      } in the last fortnight`,
      tone: 'BAD',
    });
  }

  // --- What is coming ---
  const milestones = await db.milestones.toArray();
  const next = milestones
    .filter((m) => !m.isCompleted && daysUntil(m.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (next) {
    const days = daysUntil(next.date);
    out.push({
      id: 'next',
      icon: '📅',
      text: `${next.title} ${days === 0 ? 'is today' : days === 1 ? 'is tomorrow' : `in ${days} days`}`,
      tone: days <= 3 ? 'WATCH' : 'NEUTRAL',
    });
  }

  return out;
}

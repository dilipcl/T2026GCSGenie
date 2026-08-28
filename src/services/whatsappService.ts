import { Goal, ParentSettings, SubjectConfig } from '../types';

/**
 * Sharing the week with the family, over WhatsApp click-to-chat.
 *
 * Everything here is string construction. No API, no account, no key, no
 * request leaves the device - a `wa.me` link is a URL the operating system
 * hands to whichever WhatsApp is installed. That keeps the app's offline-first
 * promise intact and means nothing about the family's week is posted to a
 * server in order to reach the person sitting downstairs.
 *
 * Two rules the UI has to honour, both encoded here rather than left to a
 * component to remember:
 *
 *  - Nothing is ever sent automatically. Every message is composed, shown, and
 *    dispatched by a human tap.
 *  - The app must never claim a message was sent. Opening a link is all it can
 *    observe; on desktop `wa.me` lands on WhatsApp Web and can fail silently at
 *    a login screen. Hence `Open in WhatsApp`, never `Send`, and a copy
 *    fallback on every surface.
 */

export const WHATSAPP_ACTION_LABEL = 'Open in WhatsApp';

/**
 * WhatsApp resolves numbers in full international form only. A UK mobile typed
 * as "07700 900123" silently fails to open a chat, which looks like the feature
 * is broken rather than the number being wrong.
 */
export function normaliseE164(input: string, defaultCountryCode = '44'): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return '';

  // "+4477..." or "004477..." - already international.
  if (trimmed.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);

  // "07700900123" - a national trunk number.
  if (digits.startsWith('0')) return `${defaultCountryCode}${digits.slice(1)}`;

  return digits;
}

export function isValidE164(value: string): boolean {
  return /^\d{8,15}$/.test(value);
}

/** Formats a stored E.164 number for display: 447700900123 -> +44 7700 900123. */
export function formatE164(value: string): string {
  if (!isValidE164(value)) return value;
  return `+${value.replace(/^(\d{2})(\d{4})(\d+)$/, '$1 $2 $3')}`;
}

/**
 * The click-to-chat URL.
 *
 * `wa.me/<number>` with no number opens WhatsApp on a contact picker, which is
 * the right behaviour when a family has not saved one yet - better than a dead
 * button.
 */
export function buildChatUrl(text: string, e164?: string): string {
  const number = e164 ? normaliseE164(e164) : '';
  const base = number && isValidE164(number) ? `https://wa.me/${number}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

const RULE = '━━━━━━━━━━━━━━━━━━━━━';

/** WhatsApp renders *asterisks* as bold. */
const bold = (s: string) => `*${s}*`;

function block(title: string, lines: (string | false | undefined)[]): string {
  return [`🧞‍♂️ ${bold(title)}`, RULE, ...lines.filter((l): l is string => !!l), RULE].join('\n');
}

export interface MessageContext {
  studentName: string;
}

export function messageContext(settings?: ParentSettings): MessageContext {
  return { studentName: settings?.studentName?.trim() || 'Your student' };
}

/** Student to parent: something is in the way. */
export function questionMessage(
  ctx: MessageContext,
  input: { subject?: SubjectConfig; question: string }
): string {
  return block('GCSE Genie · Question for home', [
    `👤 ${bold('From:')} ${ctx.studentName}`,
    input.subject && `📚 ${bold('Subject:')} ${input.subject.name} (${input.subject.examBoard})`,
    `❓ ${bold('Stuck on:')}`,
    `"${input.question.trim()}"`,
  ]);
}

/** Student to parent: a goal is written and ready to be argued with. */
export function goalApprovalMessage(ctx: MessageContext, goal: Goal): string {
  return block('GCSE Genie · Goal ready to agree', [
    `👤 ${bold('From:')} ${ctx.studentName}`,
    `🎯 ${bold('Goal:')} ${goal.title}`,
    `⏱️ ${bold('Costs:')} ${goal.weeklyHoursRequired} hrs/week`,
    goal.smartMeasurable && `📝 ${bold('Measured by:')} ${goal.smartMeasurable}`,
    goal.targetDate && `📅 ${bold('By:')} ${goal.targetDate}`,
    '',
    'It stays a draft until you lock it in the Parent Portal.',
  ]);
}

/** Either direction: an occasion is not happening. */
export function exceptionMessage(
  ctx: MessageContext,
  input: {
    title: string;
    date: string;
    statusLabel: string;
    reasonLabel: string;
    notes?: string;
    hours: number;
    deducts: boolean;
  }
): string {
  return block('GCSE Genie · Schedule update', [
    `👤 ${bold('For:')} ${ctx.studentName}`,
    `📌 ${bold('Activity:')} ${input.title}`,
    `📅 ${bold('Date:')} ${input.date}`,
    `📋 ${bold('Status:')} ${input.statusLabel}`,
    `🏷️ ${bold('Reason:')} ${input.reasonLabel}`,
    input.notes && `🗒️ ${input.notes}`,
    input.deducts
      ? `⏱️ ${bold('This week:')} ${input.hours}h come off the scheduled load.`
      : `⏱️ ${bold('This week:')} unchanged.`,
  ]);
}

/** Parent to student: a reward went through. */
export function rewardApprovedMessage(
  ctx: MessageContext,
  input: { rewardTitle: string; costXP: number; note?: string }
): string {
  return block('GCSE Genie · Reward approved 🎉', [
    `🎁 ${bold('Reward:')} ${input.rewardTitle}`,
    `✨ ${bold('Cost:')} ${input.costXP} XP`,
    input.note && `💬 ${input.note}`,
    '',
    `Enjoy it, ${ctx.studentName.split(' ')[0]}.`,
  ]);
}

/** Student to parent: this one is hard to say out loud. */
export function needSupportMessage(
  ctx: MessageContext,
  input: { averageEnergy: number; lowCount: number; sampleSize: number; note?: string }
): string {
  return block('GCSE Genie · Running on empty', [
    `👤 ${bold('From:')} ${ctx.studentName}`,
    `🔋 ${bold('Energy:')} ${input.lowCount} of the last ${input.sampleSize} check-ins were low (avg ${input.averageEnergy}/5).`,
    input.note && `🗒️ ${input.note}`,
    '',
    'Not asking to quit anything — asking to make this week smaller.',
  ]);
}

/**
 * The log of what was confirmed, addressed to the family group.
 *
 * WhatsApp has no URL that targets a specific group with a prefilled message -
 * `wa.me/?text=` opens the chat picker and the sender chooses where it goes.
 * So this builds the text; `buildChatUrl` with no number opens the picker; and
 * the group's invite link is what gets the group into that picker in the first
 * place. The app cannot post here on its own, and does not claim to.
 */
export function changeLogMessage(
  ctx: MessageContext,
  input: {
    dateLabel: string;
    groups: { label: string; icon: string; lines: string[] }[];
    comment?: string;
    commentFrom?: string;
  }
): string {
  const body: (string | undefined)[] = [
    `🧞‍♂️ ${bold('GCSE Genie · Update log')}`,
    RULE,
    `👤 ${bold('Who:')} ${ctx.studentName}`,
    `📅 ${bold('When:')} ${input.dateLabel}`,
    '',
  ];

  for (const group of input.groups) {
    body.push(`${group.icon} ${bold(group.label)}`);
    for (const line of group.lines) body.push(`• ${line}`);
    body.push('');
  }

  if (input.comment?.trim()) {
    body.push(`💬 ${bold(input.commentFrom || 'Note')}: ${input.comment.trim()}`);
    body.push('');
  }

  body.push(RULE);
  body.push('_Logged automatically as each change was confirmed._');

  return body.filter((line): line is string => line !== undefined).join('\n');
}

export interface DigestInput {
  weekLabel: string;
  targetGrade?: number;
  goals: { title: string; actualHours: number; targetHours: number; onTrack: boolean }[];
  commitments: { label: string; netHours: number; excusedHours: number }[];
  exceptions: { title: string; date: string; reasonLabel: string }[];
  streakCurrent: number;
  streakBest: number;
  choresDone: number;
  choresDue: number;
  xpEarnedThisWeek: number;
  xpBalance: number;
  studyHours: number;
  committedDone: number;
  committedCount: number;
  focusNextWeek: string[];
  daysToExams?: number;
}

/**
 * The Sunday digest.
 *
 * This is the film's last scene - the family around one screen - and the only
 * output the app has that is addressed to more than one person. It is built
 * from the numbers the weekly review is already looking at, so it can never
 * report a week that differs from the one on screen.
 */
export function weeklyDigestMessage(ctx: MessageContext, input: DigestInput): string {
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  const goalLines = input.goals.length
    ? input.goals.map(
        (g) =>
          `• ${g.title}: ${g.actualHours}h / ${g.targetHours}h ${
            g.onTrack ? '✅' : '🟡'
          } (${pct(g.actualHours, g.targetHours)}%)`
      )
    : ['• No goals locked yet.'];

  const commitmentLines = input.commitments.map(
    (c) => `• ${c.label}: ${c.netHours}h${c.excusedHours > 0 ? ` (${c.excusedHours}h excused)` : ''}`
  );

  const exceptionLines = input.exceptions.map(
    (e) => `• ${e.title} on ${e.date} — ${e.reasonLabel}`
  );

  // `undefined` marks a line that does not apply and is dropped; `''` is a
  // deliberate blank between sections and has to survive the filter.
  const lines: (string | undefined)[] = [
    `🧞‍♂️ ${bold(`GCSE GENIE · ${input.weekLabel.toUpperCase()}`)}`,
    `${bold('Student:')} ${ctx.studentName}`,
    input.targetGrade ? `${bold('Target:')} Grade ${input.targetGrade}` : undefined,
    input.daysToExams !== undefined ? `${bold('Exams:')} ${input.daysToExams} days away` : undefined,
    RULE,
    '',
    `📊 ${bold('GOALS & STUDY')}`,
    ...goalLines,
    `• ${bold('Total studied:')} ${input.studyHours}h`,
    `• ${bold('Planned work done:')} ${input.committedDone}/${input.committedCount}`,
    '',
    `📌 ${bold('COMMITMENTS')}`,
    ...commitmentLines,
    ...(exceptionLines.length ? ['', `🗓️ ${bold('MISSED OR MOVED')}`, ...exceptionLines] : []),
    '',
    `🔥 ${bold('HABIT')}`,
    `• Check-in streak: ${input.streakCurrent} days (best ${input.streakBest})`,
    `• Chores: ${input.choresDone}/${input.choresDue}`,
    `• XP this week: +${input.xpEarnedThisWeek} (balance ${input.xpBalance})`,
    ...(input.focusNextWeek.length
      ? ['', `🎯 ${bold('FOCUS NEXT WEEK')}`, ...input.focusNextWeek.map((f, i) => `${i + 1}. ${f}`)]
      : []),
    '',
    RULE,
    '_Consistency > intensity. Start where you are._',
  ];

  return lines.filter((line): line is string => line !== undefined).join('\n');
}

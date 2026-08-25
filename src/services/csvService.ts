import { db } from '../db';
import {
  Task,
  MilestoneReminder,
  TimetableEntry,
  SyllabusTopic,
  SubjectId,
  DayOfWeek,
  WeekType,
  PriorityLevel,
} from '../types';
import { newId } from '../utils/id';
import { todayISO } from '../utils/date';
import { logAuditEvent } from './auditService';
import { calculateSubjectRAG, calculateTotalXP } from './ragCalculator';
import { calculateStreakStats } from './habitEngine';
import { INITIAL_SUBJECTS } from '../db/seedData';

/**
 * CSV in and out.
 *
 * Everything was entered one item at a time, which is the thing most likely to
 * kill the habit the app exists to build - a term of homework typed by hand is
 * a chore nobody repeats. And the only way out was a raw JSON backup, which is
 * a restore file, not something a parent can read.
 *
 * A spreadsheet is the right shape for both: it is the tool the family already
 * has, and CSV survives being opened, edited and saved by anyone.
 */

// ---------------------------------------------------------------- CSV basics

/** RFC-4180-ish escaping: quote anything containing a comma, quote or newline. */
function cell(value: unknown): string {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | boolean | undefined)[][]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/**
 * Parses CSV, honouring quoted fields.
 *
 * A naive split on commas breaks on the first task title containing one, which
 * in this app is most of them - "Complete questions 12, 14 and 18".
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }

    if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }

  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

// ---------------------------------------------------------------- import

export type ImportKind = 'tasks' | 'milestones' | 'timetable' | 'topics';

export const IMPORT_TEMPLATES: Record<ImportKind, { headers: string[]; example: string[] }> = {
  tasks: {
    headers: ['subject', 'title', 'dueDate', 'priority', 'estimatedHours'],
    example: ['maths', 'Edexcel Paper 2 questions 1-12', '2026-09-12', 'HIGH', '1.5'],
  },
  milestones: {
    headers: ['title', 'date', 'category', 'subject'],
    example: ['Maths mock paper 1', '2026-10-14', 'EXAM_MOCK', 'maths'],
  },
  timetable: {
    headers: ['week', 'day', 'period', 'startTime', 'endTime', 'subject', 'room'],
    example: ['ODD', 'MON', 'Period 1', '08:50', '09:50', 'maths', 'M2'],
  },
  topics: {
    headers: ['subject', 'unit', 'title', 'estimatedHours', 'confidence'],
    example: ['chemistry', 'Bonding', 'Ionic bonding and lattices', '2', '3'],
  },
};

export interface ImportRow {
  line: number;
  values: Record<string, string>;
  error?: string;
}

export interface ImportPreview {
  kind: ImportKind;
  valid: ImportRow[];
  invalid: ImportRow[];
}

const SUBJECT_IDS = new Set(INITIAL_SUBJECTS.map((s) => s.id));
const DAYS = new Set(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates without writing anything.
 *
 * Import is the one place a single bad file can quietly wreck a term of data,
 * so nothing is committed until the parent has seen exactly what will land and
 * what was rejected.
 */
export function previewImport(kind: ImportKind, csv: string): ImportPreview {
  const rows = parseCsv(csv);
  const preview: ImportPreview = { kind, valid: [], invalid: [] };
  if (rows.length === 0) return preview;

  const headers = rows[0].map((h) => h.trim());
  const expected = IMPORT_TEMPLATES[kind].headers;

  for (let i = 1; i < rows.length; i++) {
    const values: Record<string, string> = {};
    headers.forEach((h, j) => (values[h] = (rows[i][j] ?? '').trim()));
    const row: ImportRow = { line: i + 1, values };

    const missing = expected.filter((h) => !headers.includes(h));
    if (missing.length) {
      row.error = `Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`;
    } else if (kind === 'tasks') {
      if (!values.title) row.error = 'A title is required';
      else if (!SUBJECT_IDS.has(values.subject as SubjectId)) row.error = `Unknown subject "${values.subject}"`;
      else if (values.dueDate && !ISO_DATE.test(values.dueDate)) row.error = 'Date must be YYYY-MM-DD';
    } else if (kind === 'milestones') {
      if (!values.title) row.error = 'A title is required';
      else if (!ISO_DATE.test(values.date)) row.error = 'Date must be YYYY-MM-DD';
    } else if (kind === 'timetable') {
      if (!DAYS.has(values.day?.toUpperCase())) row.error = `Day must be MON-SUN, got "${values.day}"`;
      else if (!['ODD', 'EVEN', 'BOTH'].includes(values.week?.toUpperCase())) row.error = 'Week must be ODD, EVEN or BOTH';
      else if (!values.startTime || !values.endTime) row.error = 'Start and end times are required';
      else if (values.subject && !SUBJECT_IDS.has(values.subject as SubjectId)) row.error = `Unknown subject "${values.subject}"`;
    } else if (kind === 'topics') {
      if (!values.title) row.error = 'A title is required';
      else if (!SUBJECT_IDS.has(values.subject as SubjectId)) row.error = `Unknown subject "${values.subject}"`;
    }

    (row.error ? preview.invalid : preview.valid).push(row);
  }

  return preview;
}

/** Writes the rows a preview accepted. Invalid rows are never reached. */
export async function commitImport(preview: ImportPreview): Promise<number> {
  const { kind, valid } = preview;
  if (valid.length === 0) return 0;

  if (kind === 'tasks') {
    const tasks: Task[] = valid.map(({ values: v }) => ({
      id: newId('task'),
      subjectId: v.subject as SubjectId,
      title: v.title,
      dueDate: v.dueDate || todayISO(),
      priority: (['HIGH', 'MEDIUM', 'LOW'].includes(v.priority?.toUpperCase())
        ? v.priority.toUpperCase()
        : 'MEDIUM') as PriorityLevel,
      estimatedHours: v.estimatedHours ? Number(v.estimatedHours) || undefined : undefined,
      isHomework: true,
      isRemediation: false,
      xpValue: 50,
      completed: false,
      createdAt: Date.now(),
    }));
    await db.tasks.bulkAdd(tasks);
  } else if (kind === 'milestones') {
    const items: MilestoneReminder[] = valid.map(({ values: v }) => ({
      id: newId('mile'),
      title: v.title,
      date: v.date,
      category: (v.category as MilestoneReminder['category']) || 'PERSONAL_TARGET',
      subjectId: SUBJECT_IDS.has(v.subject as SubjectId) ? (v.subject as SubjectId) : undefined,
      priority: 'HIGH',
      isCompleted: false,
      createdAt: Date.now(),
    }));
    await db.milestones.bulkAdd(items);
  } else if (kind === 'timetable') {
    const entries: TimetableEntry[] = valid.map(({ values: v }) => ({
      id: newId('tt'),
      weekType: v.week.toUpperCase() as WeekType,
      dayOfWeek: v.day.toUpperCase() as DayOfWeek,
      slotName: v.period || 'Lesson',
      startTime: v.startTime,
      endTime: v.endTime,
      subjectId: SUBJECT_IDS.has(v.subject as SubjectId) ? (v.subject as SubjectId) : undefined,
      activityName:
        INITIAL_SUBJECTS.find((s) => s.id === v.subject)?.name || v.subject || 'Lesson',
      room: v.room || undefined,
      isHardLocked: false,
    }));
    await db.timetableEntries.bulkAdd(entries);
  } else {
    const topics: SyllabusTopic[] = valid.map(({ values: v }) => ({
      id: newId('topic'),
      subjectId: v.subject as SubjectId,
      unit: v.unit || 'General',
      title: v.title,
      isCompleted: false,
      confidenceRating: (Math.min(5, Math.max(1, Number(v.confidence) || 3)) as 1 | 2 | 3 | 4 | 5),
      isImportantForGrade9: true,
      yearGroup: 'YEAR_10',
    }));
    await db.syllabusTopics.bulkAdd(topics);
  }

  await logAuditEvent({
    user: 'PARENT',
    action: 'INSERT',
    entity: 'Import',
    entityId: `import_${kind}`,
    newValue: `Imported ${valid.length} ${kind} from CSV (${preview.invalid.length} rows rejected)`,
  });

  return valid.length;
}

export function templateCsv(kind: ImportKind): string {
  const { headers, example } = IMPORT_TEMPLATES[kind];
  return toCsv([headers, example]);
}

// ---------------------------------------------------------------- export

/**
 * The whole app as one readable spreadsheet.
 *
 * Sections are stacked with blank lines between them rather than produced as
 * separate files, so it opens as a single sheet a parent can scroll - which is
 * what was actually asked for.
 */
export async function exportReportCsv(): Promise<string> {
  const [tasks, milestones, goals, assessments, checkIns, quests, redemptions] = await Promise.all([
    db.tasks.toArray(),
    db.milestones.toArray(),
    db.goals.toArray(),
    db.assessments.toArray(),
    db.checkIns.toArray(),
    db.remediations.toArray(),
    db.redemptions.toArray(),
  ]);

  const xp = await calculateTotalXP();
  const streak = await calculateStreakStats();

  const rows: (string | number | boolean | undefined)[][] = [];
  const section = (title: string, headers: string[]) => {
    if (rows.length) rows.push([]);
    rows.push([title]);
    rows.push(headers);
  };

  section('OVERVIEW', ['Metric', 'Value']);
  rows.push(['Generated', new Date().toLocaleString('en-GB')]);
  rows.push(['Current streak (days)', streak.current]);
  rows.push(['Best streak (days)', streak.best]);
  rows.push(['Days checked in', streak.totalDays]);
  rows.push(['XP earned', xp.totalXP]);
  rows.push(['XP available', xp.availableXP]);
  rows.push(['XP held for pending requests', xp.reservedXP]);
  rows.push(['Tasks completed', tasks.filter((t) => t.completed).length]);
  rows.push(['Tasks outstanding', tasks.filter((t) => !t.completed).length]);

  section('SUBJECTS', ['Subject', 'Exam board', 'Health /100', 'RAG', 'Homework %', 'Remediations %', 'Topics mastered', 'Marked work avg %']);
  for (const s of INITIAL_SUBJECTS) {
    const r = await calculateSubjectRAG(s.id);
    rows.push([
      s.name, s.examBoard, r.healthScore, r.ragStatus,
      r.homeworkCompletionRate, r.remediationCompletionRate,
      `${r.topicsMastered}/${r.totalTopics}`,
      r.assessmentCount > 0 ? r.assessmentAveragePercent : '',
    ]);
  }

  section('TASKS', ['Subject', 'Title', 'Due', 'Priority', 'Bucket', 'Done', 'XP']);
  for (const t of tasks) {
    rows.push([t.subjectId, t.title, t.dueDate, t.priority, t.bucket ?? '', t.completed ? 'yes' : 'no', t.xpValue]);
  }

  section('KEY DATES', ['Title', 'Date', 'Category', 'Subject', 'Done']);
  for (const m of milestones) rows.push([m.title, m.date, m.category, m.subjectId ?? '', m.isCompleted ? 'yes' : 'no']);

  section('GOALS', ['Title', 'Category', 'Status', 'Hours/week', 'Measure']);
  for (const g of goals) rows.push([g.title, g.category, g.status, g.weeklyHoursRequired, g.smartMeasurable]);

  section('MARKED WORK', ['Date', 'Subject', 'Title', 'Score', 'Percent', 'Grade', 'Verified', 'Proof files']);
  for (const a of assessments) {
    rows.push([a.date, a.subjectId, a.title, `${a.marksScored}/${a.marksAvailable}`, a.percentage, a.gradeAwarded ?? '', a.verifiedByParent ? 'yes' : 'no', a.attachmentIds.length]);
  }

  section('FIX-UP QUESTS', ['Subject', 'Quest', 'Done', 'Score', 'XP']);
  for (const q of quests) {
    rows.push([q.subjectId, q.taskTitle, q.isCompleted ? 'yes' : 'no',
      q.selfStudyScore ? `${q.selfStudyScore.scored}/${q.selfStudyScore.total}` : '', q.xpReward]);
  }

  section('REWARDS', ['Reward', 'Cost XP', 'Status', 'Requested']);
  for (const r of redemptions) {
    rows.push([r.rewardTitle, r.costXP, r.status, new Date(r.requestedAt).toLocaleDateString('en-GB')]);
  }

  section('CHECK-INS', ['Date', 'Session', 'Study minutes', 'Energy', 'Focus', 'XP']);
  for (const c of [...checkIns].sort((a, b) => b.timestamp - a.timestamp)) {
    rows.push([c.date, c.session, c.completedRevisionMinutes, c.energyLevel, c.focusRating, c.xpEarned]);
  }

  return toCsv(rows);
}

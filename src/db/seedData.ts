import {
  SubjectConfig,
  SyllabusTopic,
  RemediationAction,
  TimetableSlotConfig,
  TimetableEntry,
  RewardItem,
  CareerGuidanceResource,
  FreeRevisionLink,
  Goal,
  ParentSettings,
  MilestoneReminder,
  Task,
  DayOfWeek,
  SubjectId,
  FixedCommitment,
} from '../types';
import { addDaysISO } from '../utils/date';
import {
  SUBJECT_DRIVE_FOLDERS,
  WORKING_FOLDER_URL,
  WORKING_FOLDER_PATH,
  BACKUPS_FOLDER_URL,
} from './driveFolders';

/**
 * No credential is seeded. A published default of '1234' meant every install
 * shipped with a known parent passphrase, so the first unlock now sets one
 * instead of checking one.
 */
export const INITIAL_PARENT_SETTINGS: ParentSettings = {
  studentName: 'Tejas Dilip',
  studentYearGroup: 'Year 10',
  studentSchool: 'GCS',
  studentTargetGrade: 9,
  // First morning of the Summer 2027 series. A default rather than a blank:
  // the countdown is the point, and nobody configures a field to be told
  // something they already half know.
  examSeriesStartDate: '2027-05-10',
  // The family log group. Changes the student confirms are reported here, so
  // nobody has to ask what was done today.
  familyGroupInviteUrl: 'https://chat.whatsapp.com/JAMiLpKQOt485Gj2G2MVKP',
  // The group is offered by default because it is the log everyone reads;
  // individual numbers are opt-in, and nothing is ever sent without a tap.
  updateForwarding: { toGroup: true, toNumberIds: [], promptAfterConfirm: true },
  googleDriveBackupPath: `${WORKING_FOLDER_PATH}\\_Genie-Backups`,
  googleDriveFolderUrl: WORKING_FOLDER_URL,
  backupsFolderUrl: BACKUPS_FOLDER_URL,
  workingFolderPath: WORKING_FOLDER_PATH,
  llmProvider: 'GEMINI',
  llmModelName: 'gemini-1.5-pro',
};

export const INITIAL_SUBJECTS: SubjectConfig[] = [
  {
    id: 'maths',
    name: 'Mathematics',
    shortName: 'Maths',
    examBoard: 'Edexcel',
    targetGrade: 9,
    currentEstimatedGrade: 8,
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: '📐',
    teacherName: 'Mr. Davies (Maths Faculty)',
    teacherNotes: 'Strong algebra foundation; focus on independence probability proofs & coordinate centers.',
    examStructure: '3 x 1.5h written papers in Year 11 (Paper 1 Non-Calc, Papers 2 & 3 Calculator).',
    driveFolderUrl: SUBJECT_DRIVE_FOLDERS.maths,
  },
  {
    id: 'english_lang',
    name: 'English Language',
    shortName: 'Eng Lang',
    examBoard: 'AQA',
    targetGrade: 9,
    currentEstimatedGrade: 8,
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    icon: '✍️',
    teacherName: 'Ms. Robinson',
    teacherNotes: 'Analyze fiction/non-fiction texts with precise linguistic terminology.',
    examStructure: 'Paper 1 (Explorations in Creative Reading & Writing) & Paper 2 (Writers Viewpoints).',
    driveFolderUrl: SUBJECT_DRIVE_FOLDERS.english_lang,
  },
  {
    id: 'english_lit',
    name: 'English Literature',
    shortName: 'Eng Lit',
    examBoard: 'AQA',
    targetGrade: 9,
    currentEstimatedGrade: 8,
    color: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    icon: '📚',
    teacherName: 'Ms. Robinson',
    teacherNotes: 'Master Shakespeare (Macbeth), 19th Century Prose, and Power & Conflict Poetry.',
    examStructure: 'Paper 1 (Shakespeare & 19th C Novel) & Paper 2 (Modern texts & Poetry).',
    driveFolderUrl: SUBJECT_DRIVE_FOLDERS.english_lit,
  },
  {
    id: 'biology',
    name: 'Separate Science: Biology',
    shortName: 'Biology',
    examBoard: 'AQA',
    targetGrade: 9,
    currentEstimatedGrade: 8,
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
    icon: '🧬',
    teacherName: 'Dr. Evans',
    teacherNotes: 'Focus on cell biology, osmosis, enzymes, bioenergetics, and 7 required practicals.',
    examStructure: '2 x 1h 45m papers (50% each) for Triple Science award.',
    driveFolderUrl: SUBJECT_DRIVE_FOLDERS.biology,
  },
  {
    id: 'chemistry',
    name: 'Separate Science: Chemistry',
    shortName: 'Chemistry',
    examBoard: 'AQA',
    targetGrade: 9,
    currentEstimatedGrade: 8,
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    icon: '🧪',
    teacherName: 'Mr. Gallagher',
    teacherNotes: 'Chromatography Rf formulas, mole calculations, electrolysis, and quantitative chemistry.',
    examStructure: '2 x 1h 45m papers (50% each) for Triple Science award.',
    driveFolderUrl: SUBJECT_DRIVE_FOLDERS.chemistry,
  },
  {
    id: 'physics',
    name: 'Separate Science: Physics',
    shortName: 'Physics',
    examBoard: 'AQA',
    targetGrade: 9,
    currentEstimatedGrade: 8,
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    icon: '⚡',
    teacherName: 'Mr. Clarke',
    teacherNotes: 'Strict unit conversion discipline (minutes -> seconds, kW -> W) and energy formulas.',
    examStructure: '2 x 1h 45m papers (50% each) for Triple Science award.',
    driveFolderUrl: SUBJECT_DRIVE_FOLDERS.physics,
  },
  {
    id: 'history',
    name: 'History',
    shortName: 'History',
    examBoard: 'AQA',
    targetGrade: 9,
    currentEstimatedGrade: 8,
    color: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    icon: '🏛️',
    teacherName: 'Mr. Harrison',
    teacherNotes: 'Weimar & Nazi Germany, Conflict & Tension (1918-1939), Health and the People, Normans.',
    examStructure: 'Paper 1 (Understanding Modern World - 2h) & Paper 2 (Shaping the Nation - 2h).',
    driveFolderUrl: SUBJECT_DRIVE_FOLDERS.history,
  },
  {
    id: 'computer_science',
    name: 'Computer Science',
    shortName: 'Comp Sci',
    examBoard: 'OCR',
    targetGrade: 9,
    currentEstimatedGrade: 7,
    color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    icon: '💻',
    teacherName: 'AMN (Home Learning Lead)',
    teacherNotes: 'CRITICAL: Maintain daily homework completion consistency. Master SQL & Networking.',
    examStructure: 'Component 1 (Computer Systems - 1.5h) & Component 2 (Algorithms & Programming - 1.5h).',
    driveFolderUrl: SUBJECT_DRIVE_FOLDERS.computer_science,
  },
  {
    id: 'art',
    name: 'Art, Craft & Design',
    shortName: 'Art & Design',
    examBoard: 'AQA',
    targetGrade: 9,
    currentEstimatedGrade: 8,
    color: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30',
    icon: '🎨',
    teacherName: 'Ms. Taylor',
    teacherNotes: 'Component 1 Portfolio (60%) ongoing targets + prepare for 10-hour supervised exam.',
    courseworkWeight: 60,
    examStructure: '60% Coursework Portfolio + 40% Externally Set Assignment (10-hour practical).',
    driveFolderUrl: SUBJECT_DRIVE_FOLDERS.art,
  },
  {
    id: 'general',
    name: 'General / Independent study',
    shortName: 'General',
    examBoard: 'None',
    targetGrade: 0,
    currentEstimatedGrade: 0,
    color: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    icon: '\u{1F9E9}',
    teacherName: 'Self-directed',
    teacherNotes:
      'Work that is real but belongs to no exam subject - reading, admin, catch-up, a weekend session that has not been aimed yet.',
    examStructure: 'Not examined. Excluded from subject health and syllabus coverage; hours still count towards workload.',
    driveFolderUrl: SUBJECT_DRIVE_FOLDERS.general,
  },
  {
    id: 'revision',
    name: 'Revision (mixed subjects)',
    shortName: 'Revision',
    examBoard: 'None',
    targetGrade: 0,
    currentEstimatedGrade: 0,
    color: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    icon: '\u{1F501}',
    teacherName: 'Self-directed',
    teacherNotes:
      'A session spanning several subjects at once, where forcing a single subject would misattribute the time.',
    examStructure: 'Not examined. Excluded from subject health and syllabus coverage; hours still count towards workload.',
    driveFolderUrl: SUBJECT_DRIVE_FOLDERS.revision,
  },
];

export const INITIAL_SYLLABUS_TOPICS: SyllabusTopic[] = [
  // Maths
  { id: 'm-1', subjectId: 'maths', unit: 'Probability', title: 'Independent Probability Proofs (P(A∩B)=P(A)P(B))', isCompleted: false, confidenceRating: 3, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-10', driveNotesUrl: '' },
  { id: 'm-2', subjectId: 'maths', unit: 'Geometry', title: 'Negative & Fractional Scale Factor Enlargements with (X,Y) Centers', isCompleted: false, confidenceRating: 3, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-17', driveNotesUrl: '' },
  { id: 'm-3', subjectId: 'maths', unit: 'Algebra', title: 'Expanding & Factorizing Complex Double Brackets with Negative Signs', isCompleted: false, confidenceRating: 4, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-24', driveNotesUrl: '' },
  { id: 'm-4', subjectId: 'maths', unit: 'Algebra', title: 'Quadratic Equations & Quadratic Formula Proofs', isCompleted: true, confidenceRating: 5, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-10-01', driveNotesUrl: '' },
  { id: 'm-5', subjectId: 'maths', unit: 'Trigonometry', title: 'Sine & Cosine Rules for Non-Right Angled Triangles', isCompleted: false, confidenceRating: 4, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-10-08', driveNotesUrl: '' },
  { id: 'm-6', subjectId: 'maths', unit: 'Algebra', title: 'Simultaneous Equations (One Linear, One Non-Linear Quadratic)', isCompleted: false, confidenceRating: 3, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-10-15', driveNotesUrl: '' },
  
  // Science Practicals
  { id: 's-1', subjectId: 'chemistry', unit: 'Required Practical 6', title: 'Chromatography: Calculating Rf Values (< 1.0)', isCompleted: false, confidenceRating: 3, isImportantForGrade9: true, isRequiredPractical: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-12' },
  { id: 's-2', subjectId: 'physics', unit: 'Required Practical 1', title: 'Specific Heat Capacity & Energy Transfers (E=Pxt)', isCompleted: false, confidenceRating: 3, isImportantForGrade9: true, isRequiredPractical: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-19' },
  { id: 's-3', subjectId: 'biology', unit: 'Required Practical 1', title: 'Microscopy: Plant & Animal Cell Magnification', isCompleted: true, confidenceRating: 5, isImportantForGrade9: true, isRequiredPractical: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-26' },
  { id: 's-4', subjectId: 'biology', unit: 'Required Practical 3', title: 'Osmosis in Plant Tissue (Mass change %)', isCompleted: false, confidenceRating: 4, isImportantForGrade9: true, isRequiredPractical: true, yearGroup: 'YEAR_10', dateTaught: '2026-10-03' },
  { id: 's-5', subjectId: 'physics', unit: 'Required Practical 2', title: 'Thermal Insulation & Rate of Cooling', isCompleted: false, confidenceRating: 4, isImportantForGrade9: true, isRequiredPractical: true, yearGroup: 'YEAR_10', dateTaught: '2026-10-10' },
  
  // History
  { id: 'h-1', subjectId: 'history', unit: 'Weimar Germany', title: 'Treaty of Versailles Terms & Reparations (£6.6 Billion)', isCompleted: false, confidenceRating: 3, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-14' },
  { id: 'h-2', subjectId: 'history', unit: 'Essay Skills', title: '12-Mark Comparative Essay Structure with Definite Judgment', isCompleted: false, confidenceRating: 3, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-21' },
  { id: 'h-3', subjectId: 'history', unit: 'America 1920-73', title: 'Boom to Bust: Wall Street Crash & Great Depression', isCompleted: true, confidenceRating: 4, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-28' },

  // Computer Science
  { id: 'cs-1', subjectId: 'computer_science', unit: 'Component 1', title: 'Networks: Protocols (TCP/IP, HTTP, HTTPS, DNS)', isCompleted: false, confidenceRating: 3, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-15' },
  { id: 'cs-2', subjectId: 'computer_science', unit: 'Component 2', title: 'SQL Queries & Relational Database Design', isCompleted: false, confidenceRating: 3, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-22' },
  { id: 'cs-3', subjectId: 'computer_science', unit: 'Home Learning', title: 'Consistent On-Time Homework Submission Streak', isCompleted: false, confidenceRating: 2, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-29' },
  
  // Art
  { id: 'a-1', subjectId: 'art', unit: 'Portfolio (60%)', title: 'AO1: Critical & Contextual Research Investigation', isCompleted: true, confidenceRating: 4, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-18' },
  { id: 'a-2', subjectId: 'art', unit: 'Portfolio (60%)', title: 'AO2: Creative Media Experimentation & Refinement', isCompleted: false, confidenceRating: 4, isImportantForGrade9: true, yearGroup: 'YEAR_10', dateTaught: '2026-09-25' },
];

export const INITIAL_REMEDIATION_ACTIONS: RemediationAction[] = [
  {
    id: 'rem-maths-1',
    subjectId: 'maths',
    sourceDoc: 'yr9- maths.pdf (Score: 60/75)',
    diagnosticError: 'Scored 0/2 on proving event independence on Venn Diagram question.',
    taskTitle: 'Venn Diagram Probability Proofs',
    taskInstructions: 'Solve mock exam questions proving independence using the exact formula: P(B ∩ S) = P(B) × P(S). Explain step-by-step why the product equals the intersection. Provide Google Notebook proof of working.',
    formulaOrHint: 'Independent events definition: P(A ∩ B) = P(A) × P(B). If equality holds, events are statistically independent.',
    xpReward: 200,
    isCompleted: false,
  },
  {
    id: 'rem-maths-2',
    subjectId: 'maths',
    sourceDoc: 'yr9- maths.pdf',
    diagnosticError: 'Scored 1/2 on scale-factor enlargement and transformation descriptions.',
    taskTitle: 'Scale-Factor Enlargements with Coordinate Centers',
    taskInstructions: 'Perform graph-based shape enlargement with negative fractional scale factors (e.g. -1/2, -2) from specified (X,Y) centers of origin. Upload notebook drawing proof.',
    formulaOrHint: 'Negative scale factors invert the shape through the center of enlargement: Distance = Scale Factor × Distance from Center.',
    xpReward: 150,
    isCompleted: false,
  },
  {
    id: 'rem-maths-3',
    subjectId: 'maths',
    sourceDoc: 'yr9- maths.pdf',
    diagnosticError: 'Calculation errors on expanding (2x+3)^2 - (2x+3)(x-5). Sign errors on negative distribution.',
    taskTitle: 'Double Bracket Quadratic Expansion & Factorization',
    taskInstructions: 'Solve complex expanding and factorizing quadratic expressions to reinforce strict sign consistency when subtracting expressions.',
    formulaOrHint: '(2x+3)^2 = 4x^2 + 12x + 9. (2x+3)(x-5) = 2x^2 - 7x - 15. Subtracting gives: (4x^2 + 12x + 9) - (2x^2 - 7x - 15) = 2x^2 + 19x + 24.',
    xpReward: 100,
    isCompleted: false,
  },
  {
    id: 'rem-science-1',
    subjectId: 'chemistry',
    sourceDoc: 'science .pdf (Year 9 End of Year Assessment)',
    diagnosticError: 'Erroneously calculated an Rf value of 5.6 by reversing numerator and denominator.',
    taskTitle: 'Chromatography Rf Value Safety Check',
    taskInstructions: 'Solve 5 chromatogram calculation problems. Ensure formula Rf = (Distance moved by solute) / (Distance moved by solvent) is strictly applied, and verify output < 1.0.',
    formulaOrHint: 'SAFETY RULE: Solute can never travel further than solvent front! Therefore, Rf is ALWAYS <= 1.0 (between 0 and 1).',
    xpReward: 150,
    isCompleted: false,
  },
  {
    id: 'rem-science-2',
    subjectId: 'physics',
    sourceDoc: 'science .pdf',
    diagnosticError: 'Multiplied 65W by 25 mins directly on drone battery, omitting minute-to-second conversion (got 1625J instead of 97,500J).',
    taskTitle: 'Physics Power-to-Energy Unit Conversion Safety Step',
    taskInstructions: 'Solve energy transfer problems involving E = P × t. Explicitly write the "Unit Safety Conversion" step (t in seconds) before multiplying.',
    formulaOrHint: '1 minute = 60 seconds. Energy (Joules) = Power (Watts) × Time (Seconds). 65W × (25 × 60s) = 65W × 1500s = 97,500 J (97.5 kJ).',
    xpReward: 200,
    isCompleted: false,
  },
  {
    id: 'rem-history-1',
    subjectId: 'history',
    sourceDoc: 'history.pdf (Score: 20.5/28)',
    diagnosticError: 'Lost marks on the exact definition of Weimar Germany "Reparations".',
    taskTitle: 'Reparations & Treaty of Versailles Keyword Mastery',
    taskInstructions: 'Match and define key terms: Reparations (£6.6 billion war damage compensation), Diktat, Demilitarisation (Rhineland), Lebensraum, Propaganda.',
    formulaOrHint: 'Reparations = £6.6 Billion (fixed in 1921 under Article 231 War Guilt Clause).',
    xpReward: 100,
    isCompleted: false,
  },
  {
    id: 'rem-history-2',
    subjectId: 'history',
    sourceDoc: 'history.pdf',
    diagnosticError: 'Lost 4 marks on 12-mark Treaty of Versailles essay for failing to explicitly compare land losses vs. reparations.',
    taskTitle: '12-Mark Essay Comparative Skeleton Quest',
    taskInstructions: 'Outline a standard 3-paragraph GCS essay skeleton that directly compares two historical causes and concludes with a definitive, justified judgment.',
    formulaOrHint: 'Paragraph 1: Factor A (Land losses). Paragraph 2: Factor B (Reparations). Paragraph 3: Direct comparative synthesis concluding which was primary.',
    xpReward: 250,
    isCompleted: false,
  },
  {
    id: 'rem-cs-1',
    subjectId: 'computer_science',
    sourceDoc: 'ir report.pdf (GCS Interim Report IR3)',
    diagnosticError: 'IR3 noted Home Learning under AMN was "Below expected standard" due to missing assignments.',
    taskTitle: 'CS Homework Consistency 14-Day Challenge',
    taskInstructions: 'Maintain a 14-day streak of logging and completing Computer Science tasks on the exact day they are set by teacher AMN.',
    formulaOrHint: 'Zero overdue assignments for 14 consecutive days.',
    xpReward: 300,
    isCompleted: false,
  },
];

export const INITIAL_MILESTONES: MilestoneReminder[] = [
  {
    id: 'mile-1',
    title: 'Year 10 Autumn Interim Assessment 1 (IR1)',
    date: '2026-10-18',
    category: 'EXAM_MOCK',
    priority: 'HIGH',
    isCompleted: false,
    notes: 'Key tracking point for Edexcel Maths and OCR Computer Science.',
    createdAt: Date.now(),
  },
  {
    id: 'mile-2',
    title: 'GCSE Art Component 1 Portfolio Checkpoint',
    date: '2026-11-05',
    category: 'PORTFOLIO_DEADLINE',
    subjectId: 'art',
    priority: 'HIGH',
    isCompleted: false,
    notes: 'Submit AO1 and AO2 research and experimentation sheets to Ms. Taylor.',
    createdAt: Date.now(),
  },
  {
    id: 'mile-3',
    title: 'AQA Chemistry Required Practical 6 Assessment',
    date: '2026-10-24',
    category: 'REQUIRED_PRACTICAL',
    subjectId: 'chemistry',
    priority: 'MEDIUM',
    isCompleted: false,
    notes: 'Chromatography Rf analysis and lab book write-up review.',
    createdAt: Date.now(),
  },
  {
    id: 'mile-4',
    title: 'Bronze DofE Expedition Skills Review',
    date: '2026-11-15',
    category: 'CADETS',
    priority: 'MEDIUM',
    isCompleted: false,
    notes: 'Submit navigation logs and volunteering hours evidence.',
    createdAt: Date.now(),
  },
];

export const INITIAL_TIMETABLE_SLOTS: TimetableSlotConfig[] = [
  { id: 'reg', name: 'Registration / Tutor', defaultStartTime: '08:30', defaultEndTime: '08:50', isBreakOrLunch: false },
  { id: 'p1', name: 'Period 1', defaultStartTime: '08:50', defaultEndTime: '09:50', isBreakOrLunch: false },
  { id: 'p2', name: 'Period 2', defaultStartTime: '09:50', defaultEndTime: '10:50', isBreakOrLunch: false },
  { id: 'break', name: 'Morning Break', defaultStartTime: '10:50', defaultEndTime: '11:10', isBreakOrLunch: true },
  { id: 'p3', name: 'Period 3', defaultStartTime: '11:10', defaultEndTime: '12:10', isBreakOrLunch: false },
  { id: 'p4', name: 'Period 4', defaultStartTime: '12:10', defaultEndTime: '13:10', isBreakOrLunch: false },
  { id: 'lunch', name: 'Lunch Break', defaultStartTime: '13:10', defaultEndTime: '13:55', isBreakOrLunch: true },
  { id: 'p5', name: 'Period 5', defaultStartTime: '13:55', defaultEndTime: '14:55', isBreakOrLunch: false },
  { id: 'after', name: 'After School / Study', defaultStartTime: '15:15', defaultEndTime: '17:00', isBreakOrLunch: false },
  { id: 'evening', name: 'Evening / Cadets Block', defaultStartTime: '19:00', defaultEndTime: '22:00', isBreakOrLunch: false },
];

export const INITIAL_TIMETABLE_ENTRIES: TimetableEntry[] = [
  { id: 'odd-mon-p1', weekType: 'ODD', dayOfWeek: 'MON', slotName: 'Period 1', startTime: '08:50', endTime: '09:50', subjectId: 'maths', activityName: 'Maths (Linear 9-1)', room: 'M2', isHardLocked: false },
  { id: 'odd-mon-p2', weekType: 'ODD', dayOfWeek: 'MON', slotName: 'Period 2', startTime: '09:50', endTime: '10:50', subjectId: 'english_lang', activityName: 'English Language', room: 'E4', isHardLocked: false },
  { id: 'odd-mon-p3', weekType: 'ODD', dayOfWeek: 'MON', slotName: 'Period 3', startTime: '11:10', endTime: '12:10', subjectId: 'physics', activityName: 'Physics (Triple)', room: 'S1', isHardLocked: false },
  { id: 'odd-mon-p4', weekType: 'ODD', dayOfWeek: 'MON', slotName: 'Period 4', startTime: '12:10', endTime: '13:10', subjectId: 'history', activityName: 'History (Weimar)', room: 'H3', isHardLocked: false },
  { id: 'odd-mon-p5', weekType: 'ODD', dayOfWeek: 'MON', slotName: 'Period 5', startTime: '13:55', endTime: '14:55', subjectId: 'art', activityName: 'Art & Design Portfolio', room: 'A1', isHardLocked: false },


  /**
   * PLACEHOLDER rotation - Tuesday-Friday of the odd week and the whole even
   * week, generated so the timetable is usable from day one instead of empty
   * everywhere but Monday. The subject spread is a plausible GCSE fortnight
   * (Maths x10, English x12, triple science x12, History x6, CS x5, Art x5),
   * NOT Tejas's real timetable. Correct it in the app - every entry can be
   * deleted and re-added via Quick Add's multi-day Lesson mode - or replace
   * this block when the real timetable is to hand. The workload maths already
   * assumes school is 32.5h/week either way.
   */
  ...(() => {
    const P: [string, string, string][] = [
      ['Period 1', '08:50', '09:50'],
      ['Period 2', '09:50', '10:50'],
      ['Period 3', '11:10', '12:10'],
      ['Period 4', '12:10', '13:10'],
      ['Period 5', '13:55', '14:55'],
    ];
    const S: Record<string, { name: string; room: string }> = {
      maths: { name: 'Maths (Linear 9-1)', room: 'M2' },
      english_lang: { name: 'English Language', room: 'E4' },
      english_lit: { name: 'English Literature', room: 'E5' },
      biology: { name: 'Biology (Triple)', room: 'S2' },
      chemistry: { name: 'Chemistry (Triple)', room: 'S3' },
      physics: { name: 'Physics (Triple)', room: 'S1' },
      history: { name: 'History (Weimar)', room: 'H3' },
      computer_science: { name: 'Computer Science (OCR)', room: 'IT1' },
      art: { name: 'Art & Design Portfolio', room: 'A1' },
    };
    // Monday odd week is seeded literally above and is skipped here.
    const rota: Record<'ODD' | 'EVEN', Partial<Record<DayOfWeek, string[]>>> = {
      ODD: {
        TUE: ['english_lit', 'maths', 'chemistry', 'computer_science', 'english_lang'],
        WED: ['biology', 'history', 'maths', 'art', 'physics'],
        THU: ['computer_science', 'english_lang', 'english_lit', 'maths', 'chemistry'],
        FRI: ['history', 'biology', 'art', 'english_lit', 'maths'],
      },
      EVEN: {
        MON: ['english_lang', 'maths', 'biology', 'computer_science', 'history'],
        TUE: ['maths', 'chemistry', 'english_lit', 'art', 'english_lang'],
        WED: ['physics', 'computer_science', 'history', 'maths', 'english_lit'],
        THU: ['art', 'english_lang', 'chemistry', 'biology', 'maths'],
        FRI: ['english_lit', 'physics', 'maths', 'history', 'computer_science'],
      },
    };

    const entries: TimetableEntry[] = [];
    for (const week of ['ODD', 'EVEN'] as const) {
      for (const [day, subjects] of Object.entries(rota[week])) {
        subjects.forEach((subjectId, i) => {
          const [slotName, startTime, endTime] = P[i];
          entries.push({
            id: `${week.toLowerCase()}-${day.toLowerCase()}-p${i + 1}`,
            weekType: week,
            dayOfWeek: day as DayOfWeek,
            slotName,
            startTime,
            endTime,
            subjectId: subjectId as SubjectId,
            activityName: S[subjectId].name,
            room: S[subjectId].room,
            isHardLocked: false,
          });
        });
      }
    }
    return entries;
  })(),

  // Extracurriculars
  { id: 'cadets-tue', weekType: 'BOTH', dayOfWeek: 'TUE', slotName: 'Evening / Cadets Block', startTime: '19:00', endTime: '22:00', activityName: 'Air Cadets Training', room: 'Cadet Sqn', isHardLocked: true },
  { id: 'cadets-fri', weekType: 'BOTH', dayOfWeek: 'FRI', slotName: 'Evening / Cadets Block', startTime: '19:00', endTime: '22:00', activityName: 'Air Cadets Parade & Skills', room: 'Cadet Sqn', isHardLocked: true },
  { id: 'art-support-wed', weekType: 'BOTH', dayOfWeek: 'WED', slotName: 'After School / Study', startTime: '15:15', endTime: '16:45', subjectId: 'art', activityName: 'GCSE Support Art Class', room: 'A1', isHardLocked: true },
  { id: 'drums-thu', weekType: 'BOTH', dayOfWeek: 'THU', slotName: 'After School / Study', startTime: '16:00', endTime: '17:00', activityName: 'Drum Lesson', room: 'Music Room', isHardLocked: true },
  // The capacity model has always counted 2.0h for drums against a single 1.0h
  // lesson in the timetable - the missing hour being home practice, which was
  // real, costed, and written down nowhere. Now that the two sources are
  // joined they have to agree, and deleting the hour would have understated a
  // week that genuinely contains it. Not hard-locked: unlike a lesson, the
  // practice slot is the family's to move.
  { id: 'drums-practice-sun', weekType: 'BOTH', dayOfWeek: 'SUN', slotName: 'After School / Study', startTime: '17:00', endTime: '18:00', activityName: 'Drum Practice (home)', isHardLocked: false },
  { id: 'dofe-sat', weekType: 'BOTH', dayOfWeek: 'SAT', slotName: 'Period 1', startTime: '10:00', endTime: '12:00', activityName: 'Bronze DofE Volunteering & Skills', room: 'Community', isHardLocked: true },
];

/**
 * The fixed weekly commitments, moved out of `burnoutEngine` where they were a
 * hardcoded `const`.
 *
 * The hours are carried over exactly as they were, Drums 2.0h included, so
 * nobody's capacity total moves on the day this migration runs. What changes is
 * that they are now rows: editable by a parent, joinable to the timetable, and
 * - the point of the whole exercise - something an absence can be logged
 * against.
 *
 * Unlike chores, these ARE seeded. A chore list has to be genuinely the
 * family's or it is noise; the baseline commitments are the load-bearing
 * assumption the burnout gauge has always made, and an empty capacity model on
 * first open would read as the app being broken.
 */
export const INITIAL_COMMITMENTS: FixedCommitment[] = [
  {
    id: 'school',
    label: 'School',
    weeklyHours: 32.5,
    // Periods are generated per week type rather than enumerated, so there is
    // no stable set of ids to point at. A day off school is the fallback.
    timetableEntryIds: [],
    hoursPerOccasion: 6.5,
    isActive: true,
    accentColor: 'slate',
    createdAt: 0,
    createdBy: 'SYSTEM_AGENT',
  },
  {
    id: 'cadets',
    label: 'Air Cadets',
    weeklyHours: 6.0,
    timetableEntryIds: ['cadets-tue', 'cadets-fri'],
    hoursPerOccasion: 3.0,
    // The Air Cadets goal reserves the same real hours. Counting both would
    // charge the week twice for one Tuesday evening.
    coveredByGoalId: 'g-cadets',
    isActive: true,
    accentColor: 'purple',
    createdAt: 0,
    createdBy: 'SYSTEM_AGENT',
  },
  {
    id: 'artSupport',
    label: 'Art Support',
    weeklyHours: 1.5,
    timetableEntryIds: ['art-support-wed'],
    hoursPerOccasion: 1.5,
    isActive: true,
    accentColor: 'slate',
    createdAt: 0,
    createdBy: 'SYSTEM_AGENT',
  },
  {
    id: 'drums',
    label: 'Drums',
    weeklyHours: 2.0,
    timetableEntryIds: ['drums-thu', 'drums-practice-sun'],
    hoursPerOccasion: 1.0,
    isActive: true,
    accentColor: 'slate',
    createdAt: 0,
    createdBy: 'SYSTEM_AGENT',
  },
  {
    id: 'dofe',
    label: 'Bronze DofE',
    weeklyHours: 2.0,
    timetableEntryIds: ['dofe-sat'],
    hoursPerOccasion: 2.0,
    isActive: true,
    accentColor: 'slate',
    createdAt: 0,
    createdBy: 'SYSTEM_AGENT',
  },
];

/**
 * Micro-rewards exist so there is something reachable within a day or two.
 * The original catalogue started at 800 XP, roughly ten days of steady work,
 * which is a savings account rather than a craving - too far away to reinforce
 * anything on the day the effort is actually made.
 */
export const MICRO_REWARDS: RewardItem[] = [
  { id: 'rew-m1', title: 'Pick Tonight\'s Dinner Music', description: 'Your playlist while everyone eats. No skipping allowed.', costXP: 50, icon: '🎵', category: 'PRIVILEGE' },
  { id: 'rew-m2', title: 'Skip One Chore Today', description: 'Nominate a single job and it is off your list.', costXP: 75, icon: '🧹', category: 'PRIVILEGE' },
  { id: 'rew-m3', title: '15 Minutes Extra Screen Time', description: 'A short top-up on today\'s allowance.', costXP: 100, icon: '📱', category: 'SCREEN_TIME' },
  { id: 'rew-m4', title: 'Choose the Weekend Film', description: 'You pick what the family watches this weekend.', costXP: 150, icon: '🍿', category: 'ACTIVITY' },
  { id: 'rew-m5', title: 'TV During Dinner (30 mins)', description: 'Something on the screen at the table tonight, for the length of the meal.', costXP: 50, icon: '📺', category: 'SCREEN_TIME' },
];

export const INITIAL_REWARDS: RewardItem[] = [
  ...MICRO_REWARDS,
  { id: 'rew-1', title: '1 Hour Extra Weekend Screen Time', description: 'Redeem for 60 mins of gaming / video time on Saturday or Sunday.', costXP: 1000, icon: '🎮', category: 'SCREEN_TIME' },
  { id: 'rew-2', title: 'Choose Weekend Family Takeaway / Dinner', description: 'Pick the family dinner location or delivery menu.', costXP: 1500, icon: '🍕', category: 'ACTIVITY' },
  { id: 'rew-3', title: 'Tech / Gaming Accessory (£15 budget)', description: 'Parent-sponsored £15 reward voucher or accessory.', costXP: 3000, icon: '🎧', category: 'CUSTOM' },
  { id: 'rew-4', title: '1-Day Chores Pass', description: 'Exemption from household chores for one full weekend day.', costXP: 800, icon: '✨', category: 'PRIVILEGE' },
  { id: 'rew-5', title: '£30 Into Pocket Money', description: 'Thirty pounds added to your pocket money, to spend on whatever you like.', costXP: 5000, icon: '💷', category: 'CUSTOM' },
];

/**
 * Rewards whose seeded wording has changed since first release.
 *
 * The old title is recorded, not just the id: it is the only way to tell a row
 * still carrying stale seed text from one a parent has since rewritten. See the
 * v7 upgrade in db/index.ts.
 */
export const RETITLED_REWARDS: { id: string; wasTitled: string }[] = [
  { id: 'rew-5', wasTitled: 'Air Cadets / Drone Gear Upgrade Support' },
];

export const INITIAL_CAREER_RESOURCES: CareerGuidanceResource[] = [
  {
    id: 'car-1',
    title: 'Aerospace Engineering & Avionics',
    category: 'UNIVERSITY_DEGREE',
    requiredGCSEGrade: 9,
    relevantSubjectIds: ['maths', 'physics', 'computer_science'],
    description: 'Combines flight principles, mechanics, and embedded software. Strong tie-in with Air Cadets experience and Grade 9s in Maths & Physics.',
    externalUrl: 'https://www.raeng.org.uk',
    icon: '🚀',
  },
  {
    id: 'car-2',
    title: 'Software Engineering & AI Systems',
    category: 'DEGREE_APPRENTICESHIP',
    requiredGCSEGrade: 9,
    relevantSubjectIds: ['computer_science', 'maths'],
    description: 'Top-tier Degree Apprenticeships (e.g., Rolls-Royce, BAE Systems, Google) pay full tuition + salary. Grade 9 in Maths & OCR CS is key.',
    externalUrl: 'https://www.instituteforapprenticeships.org',
    icon: '💻',
  },
  {
    id: 'car-3',
    title: 'Architecture & Spatial Design',
    category: 'A_LEVELS',
    requiredGCSEGrade: 9,
    relevantSubjectIds: ['art', 'maths', 'physics'],
    description: 'Bridges creative visual arts with mathematical precision and structural engineering. Requires a high-scoring Art GCSE portfolio.',
    externalUrl: 'https://www.architecture.com',
    icon: '🏛️',
  },
  {
    id: 'car-4',
    title: 'A-Level Pathway: Further Maths, Physics & CS',
    category: 'A_LEVELS',
    requiredGCSEGrade: 9,
    relevantSubjectIds: ['maths', 'physics', 'computer_science'],
    description: 'The golden combination for Imperial College, Cambridge, and Oxford STEM programs. Straight Grade 8/9s open immediate enrollment.',
    externalUrl: 'https://www.thecompleteuniversityguide.co.uk',
    icon: '🎓',
  },
];

export const INITIAL_FREE_REVISION_LINKS: FreeRevisionLink[] = [
  { id: 'rev-1', title: 'CorbettMaths 5-a-Day & Video Tutorials', subjectId: 'maths', description: 'Daily 5-a-day questions targeting Grade 7-9 topics with full worked answers.', url: 'https://corbettmaths.com', type: 'INTERACTIVE' },
  { id: 'rev-2', title: 'Physics & Maths Tutor (PMT)', subjectId: 'maths', description: 'Past papers, topic questions, and mark schemes for Edexcel Maths & AQA Sciences.', url: 'https://www.physicsandmathstutor.com', type: 'PAST_PAPERS' },
  { id: 'rev-3', title: 'FreeScienceLessons (AQA Triple Science)', subjectId: 'physics', description: 'Exact coverage of all 21 Required Practicals and key science theory.', url: 'https://www.freesciencelessons.co.uk', type: 'VIDEO_TUTORIALS' },
  { id: 'rev-4', title: 'Craig\'n\'Dave OCR J277 Computer Science', subjectId: 'computer_science', description: 'Syllabus-aligned video modules for OCR Computer Science Component 1 & 2.', url: 'https://craigndave.org', type: 'VIDEO_TUTORIALS' },
  { id: 'rev-5', title: 'CSNewbs OCR J277 Revision Portal', subjectId: 'computer_science', description: 'Clear, illustrated revision notes and interactive quizzes for OCR CS.', url: 'https://www.csnewbs.com', type: 'SUMMARY_NOTES' },
  { id: 'rev-6', title: 'Seneca Learning AQA History & Sciences', subjectId: 'history', description: 'Smart adaptive revision covering Weimar & Nazi Germany, Conflict & Tension.', url: 'https://senecalearning.com', type: 'INTERACTIVE' },
  { id: 'rev-7', title: 'Mr Bruff English Language & Literature', subjectId: 'english_lang', description: 'Mastery guides on essay structures, Shakespeare analysis, and language techniques.', url: 'https://mrbruff.com', type: 'VIDEO_TUTORIALS' },
];

/**
 * The starter goals, as drafts rather than settled targets.
 *
 * These ship DRAFT deliberately. A goal arriving pre-locked is a target somebody
 * else decided, and the whole point of the consultation flow is that Tejas
 * writes the SMART wording, proposes the hours, and a parent locks it only once
 * they have both agreed. Handing him three locked goals on first open skips the
 * one conversation the app exists to hold - and the hours meter would start
 * measuring him against a budget he never set.
 *
 * So they are a first draft to argue with: real titles, real dates, hours worth
 * challenging. Edit them, send them for discussion, and lock what survives.
 *
 * Until a goal is locked, its hours count towards nothing - not the weekly time
 * capacity, not the burnout gauge, not the goal-hours meter. That is correct:
 * an unagreed goal is not yet a commitment.
 */
export const INITIAL_GOALS: Goal[] = [
  {
    id: 'g-academic-maths',
    title: 'Achieve Grade 9 in Edexcel Mathematics',
    category: 'ACADEMIC_GRADE_9',
    subjectId: 'maths',
    targetDate: '2027-06-15',
    priority: 'HIGH',
    smartSpecific: 'Master all Grade 8/9 exam question types (functions, Venn independence proofs, coordinate enlargement).',
    smartMeasurable: 'Score 68+/80 on all mock papers.',
    smartAchievable: 'Weekly practice questions + completing Year 9 remediation actions.',
    smartRealistic: 'Building on strong 60/75 Year 9 foundation.',
    smartTimeBound: 'Maintain across Year 10 and mock exams in Year 11.',
    status: 'DRAFT',
    ragStatus: 'GREEN',
    weeklyHoursRequired: 4.0,
    parentNotes: 'Starting point for the first goals conversation. Focus on sign consistency in algebra.',
    createdAt: Date.now(),
  },
  {
    id: 'g-academic-cs',
    title: 'Achieve Grade 9 in OCR Computer Science',
    category: 'ACADEMIC_GRADE_9',
    subjectId: 'computer_science',
    targetDate: '2027-06-18',
    priority: 'HIGH',
    smartSpecific: 'Zero missing homework assignments for teacher AMN; master networking protocols and SQL.',
    smartMeasurable: '14-day homework completion streak + 90%+ on component quizzes.',
    smartAchievable: 'Log homework immediately on day set using Genie dashboard.',
    smartRealistic: 'Eliminates IR3 home learning deficit.',
    smartTimeBound: 'End of Term 1 Year 10.',
    status: 'DRAFT',
    ragStatus: 'AMBER',
    weeklyHoursRequired: 3.5,
    parentNotes: 'Starting point for the first goals conversation. Would be monitored via the weekly audit.',
    createdAt: Date.now(),
  },
  {
    id: 'g-cadets',
    title: 'Air Cadets Leadership & Skills Milestone',
    category: 'CO_CURRICULAR',
    targetDate: '2027-04-01',
    priority: 'MEDIUM',
    smartSpecific: 'Complete Leading Cadet classification exam & maintain parade attendance on Tue/Fri.',
    smartMeasurable: '100% parade attendance (Tue/Fri 19:00-22:00).',
    smartAchievable: 'Blocked out securely in weekly schedule.',
    smartRealistic: '6.0 hours/week built into base capacity.',
    smartTimeBound: 'By end of Year 10.',
    status: 'DRAFT',
    ragStatus: 'GREEN',
    weeklyHoursRequired: 6.0,
    parentNotes: 'Starting point for the first goals conversation. Key extracurricular commitment.',
    createdAt: Date.now(),
  },
];

/**
 * Starter homework so the dashboard is not empty on first run. Dates are
 * relative to first open, and use the local-date helper rather than
 * toISOString(), which resolves in UTC and drops a day during BST.
 */
export const INITIAL_TASKS: Task[] = [
      {
      id: 't-maths-hw-1',
      subjectId: 'maths',
      title: 'Edexcel Paper 1 Past Paper Questions (Venn & Trig)',
      description: 'Complete questions 12 to 18 on independence probability proofs.',
      dueDate: addDaysISO(2),
      priority: 'HIGH',
      isHomework: true,
      isRemediation: false,
      linkedGoalId: 'g-academic-maths',
      xpValue: 50,
      completed: false,
      createdAt: Date.now(),
      },
      {
      id: 't-cs-hw-1',
      subjectId: 'computer_science',
      title: 'OCR CS Network Protocols (TCP/IP 4-Layer Model)',
      description: 'Summarize Application, Transport, Network, and Link layers for teacher AMN.',
      dueDate: addDaysISO(1),
      priority: 'HIGH',
      isHomework: true,
      isRemediation: false,
      linkedGoalId: 'g-academic-cs',
      xpValue: 50,
      completed: false,
      createdAt: Date.now(),
      },
      {
      id: 't-art-hw-1',
      subjectId: 'art',
      title: 'Portfolio AO2 Media Experimentation Sheet',
      description: 'Complete 2 mixed-media color studies for Component 1.',
      dueDate: addDaysISO(4),
      priority: 'MEDIUM',
      isHomework: true,
      isRemediation: false,
      xpValue: 50,
      completed: false,
      createdAt: Date.now(),
      },
      {
      id: 't-sci-hw-1',
      subjectId: 'physics',
      title: 'Physics Energy Transfer Safety Step Problems',
      description: 'Solve 5 questions converting time to seconds before calculating E=Pxt.',
      dueDate: addDaysISO(3),
      priority: 'MEDIUM',
      isHomework: true,
      isRemediation: false,
      xpValue: 50,
      completed: false,
      createdAt: Date.now(),
      },
    ];

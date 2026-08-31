import { describe, it, expect } from 'vitest';
import {
  buildChatUrl,
  formatE164,
  goalApprovalMessage,
  isValidE164,
  messageContext,
  needSupportMessage,
  normaliseE164,
  questionMessage,
  weeklyDigestMessage,
  exceptionMessage,
  WHATSAPP_ACTION_LABEL,
  whenLabel,
  activityCommentMessage,
  evidenceMessage,
} from './whatsappService';
import { Goal } from '../types';

const ctx = { studentName: 'Tejas Dilip' };

describe('normaliseE164', () => {
  /**
   * WhatsApp resolves full international numbers only. "07700 900123" opens a
   * blank chat, which reads as the feature being broken rather than the number
   * being in the wrong form.
   */
  it('converts a UK trunk number to international', () => {
    expect(normaliseE164('07700 900123')).toBe('447700900123');
  });

  it('accepts an already-international number', () => {
    expect(normaliseE164('+44 7700 900123')).toBe('447700900123');
    expect(normaliseE164('0044 7700 900123')).toBe('447700900123');
  });

  it('strips punctuation people actually type', () => {
    expect(normaliseE164('+44 (0)7700-900123')).toBe('4407700900123');
    expect(normaliseE164('447700900123')).toBe('447700900123');
  });

  it('honours a different default country', () => {
    expect(normaliseE164('09123456789', '91')).toBe('919123456789');
  });

  it('returns empty for nothing usable', () => {
    expect(normaliseE164('   ')).toBe('');
    expect(normaliseE164('not a number')).toBe('');
  });
});

describe('isValidE164', () => {
  it('accepts plausible international numbers', () => {
    expect(isValidE164('447700900123')).toBe(true);
  });

  it('rejects the obviously wrong', () => {
    expect(isValidE164('')).toBe(false);
    expect(isValidE164('12345')).toBe(false);
    expect(isValidE164('+447700900123')).toBe(false); // stored bare, not prefixed
    expect(isValidE164('4477009001234567890')).toBe(false);
  });
});

describe('formatE164', () => {
  it('renders a stored number readably', () => {
    expect(formatE164('447700900123')).toBe('+44 7700 900123');
  });

  it('leaves something it cannot parse alone', () => {
    expect(formatE164('nonsense')).toBe('nonsense');
  });
});

describe('buildChatUrl', () => {
  it('builds a click-to-chat link with the text encoded', () => {
    const url = buildChatUrl('Hello there', '07700900123');
    expect(url).toBe('https://wa.me/447700900123?text=Hello%20there');
  });

  it('encodes the characters that would otherwise break the query string', () => {
    const url = buildChatUrl('*Bold* & line\nbreak — em dash');
    expect(url).toContain('%26'); // & would end the text parameter
    expect(url).toContain('%0A'); // newline
    expect(url).toContain('%E2%80%94'); // em dash
    expect(url).not.toContain('\n');
  });

  /**
   * `*` is left alone by encodeURIComponent, which is what the templates need:
   * WhatsApp reads *asterisks* as bold, and a percent-encoded one would render
   * literally in the message.
   */
  it('passes WhatsApp bold markers through untouched', () => {
    expect(buildChatUrl('*Goal* Grade 9')).toContain('*Goal*');
  });

  /**
   * A family that has not saved a number yet gets WhatsApp's own contact
   * picker, which is a better answer than a button that does nothing.
   */
  it('falls back to the contact picker with no number', () => {
    expect(buildChatUrl('Hi')).toBe('https://wa.me/?text=Hi');
    expect(buildChatUrl('Hi', 'rubbish')).toBe('https://wa.me/?text=Hi');
  });

  it('never points anywhere but wa.me', () => {
    for (const number of ['07700900123', '', 'rubbish', '+1 555 0100']) {
      expect(buildChatUrl('x', number).startsWith('https://wa.me/')).toBe(true);
    }
  });
});

describe('the action label (WA-5)', () => {
  /**
   * The app can observe that it opened a link and nothing more. On desktop the
   * link lands on WhatsApp Web and can stop at a login screen, so claiming the
   * message was sent would be a lie the user catches.
   */
  it('says open, not send', () => {
    expect(WHATSAPP_ACTION_LABEL).toBe('Open in WhatsApp');
    expect(WHATSAPP_ACTION_LABEL.toLowerCase()).not.toContain('send');
  });
});

describe('messageContext', () => {
  it('falls back when no student name is set', () => {
    expect(messageContext(undefined).studentName).toBe('Your student');
    expect(messageContext({ studentName: '  ' } as never).studentName).toBe('Your student');
    expect(messageContext({ studentName: 'Tejas' } as never).studentName).toBe('Tejas');
  });
});

describe('templates', () => {
  it('puts the question and the subject in the question message', () => {
    const text = questionMessage(ctx, {
      question: 'Stuck on Q14, the tree diagram method',
      subject: {
        id: 'maths',
        name: 'Mathematics',
        shortName: 'Maths',
        examBoard: 'Edexcel',
        targetGrade: 9,
        currentEstimatedGrade: 8,
        color: '',
        icon: '',
        teacherName: '',
        examStructure: '',
      },
    });

    expect(text).toContain('Tejas Dilip');
    expect(text).toContain('Mathematics (Edexcel)');
    expect(text).toContain('Stuck on Q14');
  });

  it('leads a goal request with what it costs', () => {
    const goal: Goal = {
      id: 'g1',
      title: 'Grade 9 in OCR Computer Science',
      category: 'ACADEMIC_GRADE_9',
      smartSpecific: '',
      smartMeasurable: '14-day homework streak',
      smartAchievable: '',
      smartRealistic: '',
      smartTimeBound: '',
      status: 'PENDING_DISCUSSION',
      ragStatus: 'GREEN',
      weeklyHoursRequired: 3.5,
      createdAt: 1,
    };

    const text = goalApprovalMessage(ctx, goal);
    expect(text).toContain('3.5 hrs/week');
    expect(text).toContain('14-day homework streak');
    // The film's line: goals are argued with, not handed down.
    expect(text).toContain('draft until you lock it');
  });

  it('says whether an exception changes the week', () => {
    const deducting = exceptionMessage(ctx, {
      title: 'Air Cadets Parade',
      date: '2026-09-01',
      statusLabel: 'Excused absence',
      reasonLabel: 'Family outing or dinner',
      hours: 3,
      deducts: true,
    });
    expect(deducting).toContain('3h come off the scheduled load');

    const attended = exceptionMessage(ctx, {
      title: 'Air Cadets Parade',
      date: '2026-09-01',
      statusLabel: 'Attended after all',
      reasonLabel: 'Something else',
      hours: 3,
      deducts: false,
    });
    expect(attended).toContain('unchanged');
  });

  it('asks for help without asking to quit', () => {
    const text = needSupportMessage(ctx, { averageEnergy: 1.4, lowCount: 5, sampleSize: 5 });
    expect(text).toContain('5 of the last 5');
    expect(text).toContain('make this week smaller');
  });
});

describe('the weekly digest', () => {
  const input = {
    weekLabel: 'Week of 31 Aug',
    targetGrade: 9,
    goals: [
      { title: 'Maths', actualHours: 4.2, targetHours: 4, onTrack: true },
      { title: 'Physics', actualHours: 2, targetHours: 3, onTrack: false },
    ],
    commitments: [
      { label: 'Air Cadets', netHours: 3, excusedHours: 3 },
      { label: 'Drums', netHours: 2, excusedHours: 0 },
    ],
    exceptions: [
      { title: 'Air Cadets Training', date: '2026-09-01', reasonLabel: 'Family outing or dinner' },
    ],
    streakCurrent: 14,
    streakBest: 19,
    choresDone: 4,
    choresDue: 4,
    xpEarnedThisWeek: 650,
    xpBalance: 2150,
    studyHours: 9.7,
    committedDone: 5,
    committedCount: 6,
    focusNextWeek: ['Trig past paper', 'CS homework streak'],
    daysToExams: 284,
  };

  it('reports every section it was given', () => {
    const text = weeklyDigestMessage(ctx, input);
    expect(text).toContain('WEEK OF 31 AUG');
    expect(text).toContain('Tejas Dilip');
    expect(text).toContain('284 days away');
    expect(text).toContain('Maths: 4.2h / 4h ✅ (105%)');
    expect(text).toContain('Physics: 2h / 3h 🟡 (67%)');
    expect(text).toContain('Air Cadets: 3h (3h excused)');
    expect(text).toContain('Family outing or dinner');
    expect(text).toContain('14 days (best 19)');
    expect(text).toContain('1. Trig past paper');
    expect(text).toContain('Consistency > intensity');
  });

  /**
   * The blank lines between sections are the whole reason it is readable on a
   * phone. An earlier version filtered every empty string out, including those.
   */
  it('keeps the blank lines between sections', () => {
    expect(weeklyDigestMessage(ctx, input)).toContain('\n\n');
  });

  it('drops sections that have nothing in them', () => {
    const bare = weeklyDigestMessage(ctx, {
      ...input,
      goals: [],
      exceptions: [],
      focusNextWeek: [],
      targetGrade: undefined,
      daysToExams: undefined,
    });

    expect(bare).toContain('No goals locked yet');
    expect(bare).not.toContain('MISSED OR MOVED');
    expect(bare).not.toContain('FOCUS NEXT WEEK');
    expect(bare).not.toContain('Target:');
    expect(bare).not.toContain('days away');
  });

  it('does not divide by zero on a goal with no budget', () => {
    const text = weeklyDigestMessage(ctx, {
      ...input,
      goals: [{ title: 'Unbudgeted', actualHours: 0, targetHours: 0, onTrack: true }],
    });
    expect(text).toContain('Unbudgeted: 0h / 0h ✅ (0%)');
    expect(text).not.toContain('NaN');
    expect(text).not.toContain('Infinity');
  });

  it('survives a round trip through the URL builder', () => {
    const text = weeklyDigestMessage(ctx, input);
    const url = buildChatUrl(text, '07700900123');
    const decoded = decodeURIComponent(url.split('?text=')[1]);
    expect(decoded).toBe(text);
  });
});

describe('context on a shared message', () => {
  const ctx = { studentName: 'Tejas' };
  // A Wednesday, so the weekday branch is unambiguous.
  const NOW = new Date('2026-09-30T20:00:00').getTime();
  const hoursAgo = (n: number) => NOW - n * 3_600_000;

  describe('whenLabel', () => {
    it('says today with the time', () => {
      expect(whenLabel(hoursAgo(3), NOW)).toMatch(/^today at \d{2}:\d{2}$/);
    });

    it('says yesterday rather than a weekday', () => {
      expect(whenLabel(hoursAgo(26), NOW)).toMatch(/^yesterday at/);
    });

    it('uses a weekday inside the last week', () => {
      expect(whenLabel(hoursAgo(24 * 3), NOW)).toMatch(/^Sunday at/);
    });

    it('falls back to a date once a weekday would be ambiguous', () => {
      // "Wednesday" eight days ago and today are both Wednesday.
      // Sep/Sept both appear depending on the ICU build; the point of the
      // assertion is the day and month, not the abbreviation length.
      expect(whenLabel(hoursAgo(24 * 8), NOW)).toMatch(/^22 Sept? at/);
    });
  });

  describe('a comment forwarded to the family', () => {
    const base = {
      summary: 'Completed "Physics Session" (+50 XP)',
      entityType: 'Task',
      actor: 'Tejas',
      activityAt: hoursAgo(26),
      comment: 'Have you added the link to the Notebook, and a follow-up task?',
      commentBy: 'Dad',
      commentAt: hoursAgo(2),
      needsResponse: true,
      now: NOW,
    };

    it('carries what the comment is about, and when it happened', () => {
      const text = activityCommentMessage(ctx, base);

      // Without these the message is a question with no subject - the reader
      // has to come back and ask which session, which is the round trip the
      // whole feature exists to remove.
      expect(text).toContain('Physics Session');
      expect(text).toContain('yesterday at');
      expect(text).toContain('Tejas');
    });

    it('dates the comment separately from the change', () => {
      const text = activityCommentMessage(ctx, base);

      expect(text).toContain('today at');
      expect(text).toContain('yesterday at');
    });

    it('says when an answer is expected', () => {
      expect(activityCommentMessage(ctx, base)).toContain('needing an answer');
      expect(
        activityCommentMessage(ctx, { ...base, needsResponse: false })
      ).not.toContain('needing an answer');
    });

    it('includes links already on the record', () => {
      const text = activityCommentMessage(ctx, {
        ...base,
        links: [{ source: 'Drive proof link', url: 'https://drive.google.com/x' }],
      });

      expect(text).toContain('Already attached');
      expect(text).toContain('https://drive.google.com/x');
    });
  });

  describe('an evidence check forwarded to the family', () => {
    it('lists the links when they are there', () => {
      const text = evidenceMessage(ctx, {
        title: 'Physics session — Electricity and Circuits',
        entity: 'Task',
        subjectName: 'Physics',
        completed: true,
        completedAt: NOW - 86_400_000,
        evidence: [{ label: 'Notebook', url: 'https://notebooklm.google.com/abc' }],
        now: NOW,
      });

      expect(text).toContain('https://notebooklm.google.com/abc');
      expect(text).toContain('marked done yesterday at');
    });

    it('asks for them when they are not, rather than reporting a blank', () => {
      const text = evidenceMessage(ctx, {
        title: 'Physics session — Electricity and Circuits',
        entity: 'Task',
        completed: true,
        completedAt: NOW,
        evidence: [],
        now: NOW,
      });

      expect(text).toContain('Nothing attached');
      expect(text).toContain('Could you add');
    });

    it('names a file that has no link instead of pretending it has one', () => {
      const text = evidenceMessage(ctx, {
        title: 'Physics working',
        entity: 'Task',
        completed: true,
        evidence: [{ label: 'circuit.jpg', savedWithoutLink: true }],
        now: NOW,
      });

      expect(text).toContain('circuit.jpg');
      expect(text).toContain('no link to share');
      expect(text).not.toContain('http');
    });
  });
});

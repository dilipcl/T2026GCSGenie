# GCSE Genie 🧞‍♂️

**A daily organiser for GCSE work — built for Tejas Dilip (Year 10, Guildford County School).**

Everything runs locally in the browser. No school-portal integrations, no accounts, no data leaving the device.

---

## What it's for

Answering one question fast, every day: **what do I need to do today?** Everything else — goals, syllabus tracking, the rewards economy — exists to support that, and is deliberately kept out of the daily path.

The interface is organised by **how often you actually use something**, not by how important it sounds:

| Tier | Sections | Typical use |
| :--- | :--- | :--- |
| **Every day** | Home · My Work · Key Dates · Fix My Mistakes | Check what's due, log the day, tick things off |
| **Weekly** | Rewards · Timetable · Subjects & Goals · Careers & Help | Planning, review, spending XP |
| **Parent only** | Parent Portal | Audits, sanctions, backups, PIN |

On mobile the four daily sections are the bottom bar; the rest live behind **More**. On desktop they're separated by a `WEEKLY` divider.

Section names are deliberately plain — *My Work*, *Key Dates*, *Fix My Mistakes* — and **each page banner repeats its navigation label exactly**, so tapping a tab never lands on a page that appears to be something else. Exam boards, rotations and other real detail live in the subtitle. See spec §8.5.

---

## Core features

### Quick Add — two taps from anywhere
A floating **+** button on every screen. Choose **Homework** or **Key date**, type it, tap a date chip (Today / Tomorrow / In 3 days / Next week), pick a subject. Priority, category and notes are folded behind *More options* because they're rarely changed.

### What's next
The top card on Home. Overdue first, then due today, then the next seven days, with upcoming key dates counting down beneath. Tasks can be ticked off without leaving the page.

### Streak, heat-map & the never-miss-twice rule
A 12-week contribution-style grid of every day checked in, alongside the current streak, the best
streak ever, total days and hours studied.

**A single missed day does not break the chain** — only two consecutive misses do. When exactly one
day has been missed the app says so directly (*"You missed yesterday. Don't miss twice."*) and the
header badge turns amber. Best streak and total days never decrease, so a broken run doesn't erase
the history behind it.

The card also shows **votes cast for being someone who does the work** — completed tasks, quests and
check-ins added together. Grades move slowly over two years; the vote count moves today.

### Daily check-in & learning log
Under two minutes: energy (1–5), focus, tick off homework, a study-time slider, and three structured questions —

1. Key concept mastered today
2. Follow-up / question to ask a teacher tomorrow
3. Key action item for tomorrow

Multiple check-ins per day are supported (Morning / Afternoon / Study / Evening). The daily base XP is only awarded once per day.

Answers 2 and 3 can be turned into **real tasks due tomorrow** — pick a subject and they land on
tomorrow's list automatically, so the reflection leads somewhere instead of ending in the log.

### Fix My Mistakes (diagnostic quests)
Real errors from Tejas's Year 9 scripts and GCS interim reports, converted into practice quests with worked mark schemes:

- **Maths** — Venn independence proofs, negative/fractional scale factors, double-bracket sign errors
- **Science** — chromatography Rf (must be < 1.0), power-to-energy minute→second conversion
- **History** — Treaty of Versailles reparations, 12-mark comparative essay structure
- **Computer Science** — 14-day homework consistency challenge (IR3 flagged Home Learning under AMN)

Each records a self-marked score, optional Google Notebook proof link, and working notes. A weak area can spawn a targeted follow-up sub-quest.

### Subjects & RAG status
Live Red/Amber/Green per subject, weighted **40% homework · 35% remediations · 25% topic mastery**, with a manual override if the calculated value is misleading. Covers Edexcel Maths, AQA English Lang & Lit, AQA Triple Science (+ required practicals), AQA History, OCR Computer Science, AQA Art & Design.

### Weekly time budget
Tracks total committed hours against a safe weekly ceiling and warns before a new goal pushes the load too high. See *Time budget* below for the numbers.

### XP & rewards
| Action | XP |
| :--- | :--- |
| First check-in of the day | +10 |
| Study time logged | +10 per 30 min |
| Homework completed | +50 (+60 if High priority) |
| Diagnostic quest completed | +100 to +300 |
| School sanction logged by parent | −500 and Rewards Shop frozen |

XP is banked once. Homework ticked off inside a check-in is credited through the task itself, not twice.

The rewards catalogue runs from **50 XP** (pick tonight's dinner music, skip a chore) up to 5,000 XP,
sorted cheapest first, with a progress bar to the next affordable item. Small rewards matter: if the
cheapest thing on the shelf is ten days away, nothing reinforces the effort made today.

### Parent Portal (PIN-protected)
Audit reports, rewards approval queue, sanction logger, full JSON backup/restore, a **Change History** of every mutation, and the PIN change form.

> The change history is *not* a tamper-proof ledger. Each row carries a SHA-256 checksum of its own payload, but there is no previous-hash chain and rows remain deletable. It is labelled accordingly in the UI.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build        # production build
npm run preview
```

> ⚠️ **Do not run `npm install` inside a Google Drive / OneDrive synced folder.** Sync will corrupt `node_modules` (zero-byte files) and the build will fail with confusing errors. Clone to a local path such as `C:\dev\gcse-genie` and keep only backups in Drive.

Deployment is automatic: pushing to `main` publishes to GitHub Pages via `.github/workflows`. The Vite `base` is set to `/T2026GCSGenie/` to match the repository name — change both together if the repo is renamed.

---

## Time budget

The ceiling is a **total** and includes school hours, so it is not a homework budget.

| Commitment | Hours/week |
| :--- | ---: |
| GCS school hours | 32.5 |
| Air Cadets (Tue & Fri, 19:00–22:00) | 6.0 |
| GCSE Support Art class | 1.5 |
| Drum lessons & practice | 2.0 |
| Bronze DofE | 2.0 |
| **Baseline total** | **44.0** |
| **Safe weekly ceiling** | **60.0** |

Logged study time and any approved co-curricular goals are added on top of the baseline.

| Status | Stress index | Roughly |
| :--- | :--- | :--- |
| 🟢 Green | < 90% | up to ~10 h/week of study |
| 🟠 Amber | 90–100% | 10–16 h/week |
| 🔴 Red | > 100% | more than ~16 h/week |

Overdue and stacked high-priority tasks add a surcharge on top, so the gauge reacts to workload pressure as well as raw hours.

The ceiling lives in one constant — `SAFE_WEEKLY_HOURS_LIMIT` in `src/services/burnoutEngine.ts`. It was raised from 45h because a 44h baseline against a 45h ceiling left under an hour a week for all homework, which pinned the gauge at CRITICAL permanently and made it meaningless.

---

## Mobile

Add to the home screen for a full-screen, chrome-free experience:

- **iPhone (Safari)** — Share → *Add to Home Screen*
- **Android (Chrome)** — ⋮ → *Add to Home screen*

> Note: there is no web app manifest or service worker yet, so Chrome will not offer a true "Install app" prompt and **the app does not work offline**. See *Known limitations*.

---

## Parent PIN

The default is `1234`. **Change it on first use** — Parent Portal → *Parent PIN*. Until you do, a warning banner appears on both the unlock screen and inside the portal, because anyone who has seen the app can otherwise open the Parent Portal, approve their own reward requests and lift their own sanctions.

Only the SHA-256 hash is stored, and the PIN is never written to the audit log.

---

## Data & backups

Everything is stored in the browser's IndexedDB on the device it was entered on. To back up, use **Parent Portal → Export Complete Backup JSON** and save the file to Google Drive.

> ⚠️ **Restoring wipes the current database before importing.** There is no merge and no undo. Export first.
>
> ⚠️ The backup JSON includes parent settings, which contain the **LLM API key in plain text**. Treat the file as a secret.

---

## Known limitations

Documented honestly so they aren't rediscovered as bugs:

1. **Data does not sync between devices.** IndexedDB is per-device and per-browser. A reward requested on Tejas's phone will not appear in the approval queue on a parent's phone. The parent-oversight features only work on the device the student uses, or via manual JSON export/import.
2. **Not a PWA.** No manifest, no service worker, no offline support.
3. **Goals cannot be approved or locked.** Proposed SMART goals enter `PENDING_DISCUSSION` and stay there — there is no approval UI, so they never count toward the time budget and can't be completed or deleted.
4. **No assessment results tracking.** There is nowhere to record "IR1 Maths: 62/80". The RAG score therefore measures *effort*, not *attainment*.
5. **The audit log is not chained.** Each entry carries a SHA-256 of its own payload; there is no previous-hash link, and Dexie permits deletion. It is a checksummed log, not a tamper-proof ledger.
6. **Live LLM audits fall back silently.** The Anthropic browser header and both default model IDs are out of date, and OpenAI has no implementation, so the audit quietly uses the built-in offline rules engine. The offline engine works fine; the label just doesn't explain why.
7. **The timetable is mostly empty.** Only Monday of the Odd week is seeded. Tuesday–Friday and the entire Even week need entering by hand.
8. **Nothing is editable after creation.** Tasks, key dates, goals and timetable blocks can be created and deleted, but not edited.

---

## Project layout

```
src/
├── components/
│   ├── shared/QuickAddSheet.tsx      # unified add - homework or key date
│   ├── dashboard/                     # Home: what's next, check-in, schedule, quests
│   ├── tasks/  calendar/  goals/      # My Work, Key Dates, Subjects & Goals
│   ├── remediation/                   # Fix My Mistakes
│   ├── timetable/  rewards/  guidance/
│   ├── parent/                        # PIN + Parent Portal
│   └── layout/                        # Header, Navigation (daily vs weekly tiers)
├── services/
│   ├── ragCalculator.ts               # subject health, XP totals, streak
│   ├── burnoutEngine.ts               # weekly time budget
│   ├── llmAgentService.ts             # agentic audit (live + offline)
│   ├── backupService.ts               # JSON export/import
│   └── auditService.ts                # append-only change log
├── db/                                # Dexie schema + seed data
├── utils/date.ts                      # local-date helpers (see below)
└── types/                             # shared type definitions
```

### Two traps worth knowing about

**Booleans cannot be indexed in IndexedDB.** Fields like `completed` and `isCompleted` appear in the Dexie schema strings but are never actually indexed, so `.where('completed').equals(0)` silently returns an empty array. Always filter booleans in memory: `.filter(t => !t.completed)`.

**Never use `toISOString()` for "today".** It resolves in UTC, so during British Summer Time anything between 00:00 and 01:00 local returns the *previous* day — a check-in at 00:30 lands on yesterday and breaks the streak. Use the helpers in `src/utils/date.ts` (`todayISO`, `addDaysISO`, `daysUntil`, `formatFriendlyDate`, `formatCountdown`).

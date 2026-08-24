# GCSE Genie 🧞‍♂️

**A daily organiser for GCSE work — built for Tejas Dilip (Year 10, Guildford County School).**

Offline-first in the browser, with optional sync across the family's devices. No school-portal integrations.

> Data lives in IndexedDB on each device and works with no login at all. Signing in enables
> [Dexie Cloud](https://dexie.org/cloud/) sync so a check-in on Tejas's phone reaches a parent's
> laptop. The LLM API key is explicitly excluded from sync and never leaves the device it was
> entered on.

---

## What it's for

Answering one question fast, every day: **what do I need to do today?** Everything else — goals, syllabus tracking, the rewards economy — exists to support that, and is deliberately kept out of the daily path.

The interface is organised by **how often you actually use something**, not by how important it sounds:

| Tier | Sections | Typical use |
| :--- | :--- | :--- |
| **Every day** | Home · My Work · Key Dates · Fix My Mistakes | Check what's due, log the day, tick things off |
| **Weekly** | Proof Log · Rewards · Timetable · Subjects & Goals · Careers & Help | Logging marked work, planning, review, spending XP |
| **Parent only** | Parent Portal | Audits, sanctions, backups, PIN |

On mobile the four daily sections are the bottom bar; the rest live behind **More**. On desktop they're separated by a `WEEKLY` divider.

Section names are deliberately plain — *My Work*, *Key Dates*, *Fix My Mistakes* — and **each page banner repeats its navigation label exactly**, so tapping a tab never lands on a page that appears to be something else. Exam boards, rotations and other real detail live in the subtitle. See spec §8.5.

---

## Core features

### Quick Add — two taps from anywhere
A floating **+** button on every screen, with three modes: **Homework**, **Key date** and **Lesson**.

Subjects and categories are icon chips rather than dropdowns — the whole set is visible and one tap
away. Dates use chips (Today / Tomorrow / In 3 days / Next week) with a picker underneath. Priority
and notes stay folded behind *More options*.

**Lesson** mode adds timetable entries and can write to **several days at once**: pick a period from
the preset chips (ordered by clock time, taken from the school day), tick Tue + Wed + Thu, and one
tap creates all three. Filling in a rotation no longer means retyping the same period twenty times.
Leaving the name blank takes it from the subject.

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

### Proof Log — marked work with the evidence attached
Every class test, mock, past paper or marked homework, recorded as evidence rather than a claim:

- Score with a live percentage, grade awarded, and the date sat
- **Question-by-question breakdown** — question number, topic tested, marks scored vs available, and
  *why* the marks went (careless / method / didn't know / misread / ran out of time), plus the
  question, your answer and the mark scheme
- **Photograph the paper.** Images are downscaled to 1600px on upload — a 6 MB phone photo becomes
  roughly 300 KB — so backups and sync stay a sensible size. PDFs are stored as-is.
- Teacher feedback and topics to revisit
- A parent can mark a result **Verified**

Questions that dropped marks optionally become **fix-up tasks due in three days**, so the log drives
work rather than just recording it. The subject average across marked papers is reported alongside
the RAG score — deliberately *not* folded into it, because changing the 40/35/25 weighting would
move every subject's status without anyone asking for that.

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

**Pending reward requests reserve their cost.** The balance shown is what can actually be spent; XP
held against requests awaiting a parent's decision is displayed separately. Without this the shop
could be overdrawn — three 1,000 XP requests each passed the affordability check individually
against a 1,200 XP balance, and approving all three took the true balance to −1,800, which the
old `Math.max(0, …)` then displayed as a tidy zero.

The rewards catalogue runs from **50 XP** (pick tonight's dinner music, skip a chore) up to 5,000 XP,
sorted cheapest first, with a progress bar to the next affordable item. Small rewards matter: if the
cheapest thing on the shelf is ten days away, nothing reinforces the effort made today.

### Parent Portal (PIN-protected)
Audit reports, rewards approval queue, sanction logger, backup/restore, a **Change History** of every
mutation (deletes included), proof-log storage usage, and the PIN change form.

> The change history is *not* a tamper-proof ledger. Each row carries a SHA-256 checksum of its own payload, but there is no previous-hash chain and rows remain deletable. It is labelled accordingly in the UI.

> The parent PIN gates the *interface*, not the data. Anyone who opens devtools can read and rewrite
> IndexedDB directly — approve their own reward requests, lift their own sanctions, edit the log.
> Making that boundary real needs Dexie Cloud realms and roles; see *Known limitations*.

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

## Parent passphrase

**There is no default.** The first time anyone opens the Parent Portal they are asked to *set* a
passphrase rather than enter one, so do it on a parent device before handing the app over — whoever
sets it first controls the portal. A published default of `1234` meant every install shipped with a
known parent credential, which is worse than no lock at all because it looks like one.

Stored as PBKDF2-SHA256 with a random 16-byte salt over 600,000 iterations, so each guess costs
around a third of a second rather than being instant. Three wrong attempts start an escalating
lockout, capped at five minutes. The passphrase itself is never written to the change history —
only the fact that it changed.

> **What this does and does not do.** It locks the *interface*. It does not protect the *data*:
> anyone who can open browser devtools can still edit IndexedDB directly. What changed is that doing
> so now breaks the change history's hash chain, and the Parent Portal will tell you. See
> *Change history integrity* below.

An older four-digit PIN, if one exists, still works once — and then the app requires you to replace
it with a passphrase before continuing.

## Change history integrity

Every entry is hashed together with the one before it, forming a chain per device. **Parent Portal →
Change history integrity → Run check** recomputes every hash and every link.

| Tampering | Detected by |
| :--- | :--- |
| A row's contents edited | Its hash no longer matches what the contents produce |
| Edited *and* its hash recomputed | The next row still points at the old hash |
| A row deleted from the middle | A gap in the sequence numbers |
| The newest rows deleted | A high-water mark kept outside the log, in parent settings |

Chains are **per device, not global**. With sync, two devices can both append while offline; a single
global chain would fork every time that happened and cry tampering when nothing had happened.

> This is tamper-**evident**, not tamper-proof. The hashes are unsigned, so someone who recomputes
> the entire chain after editing it would pass the check. Resisting that needs a signing key the
> student does not have, which a single shared account cannot provide — see *Known limitations*.

---

## Sync across devices

Sync is optional and off until someone signs in. Tap the sync chip in the header (**This device only**
→ sign in) and authenticate by email one-time code or Google. Sessions are long-lived — months, or
until an explicit logout — so it is a one-time step per device, not a daily login.

The chip then reports state: **Synced**, **Saving…**, **Updating…**, **Offline**, or **Sync problem**.
Tap it any time to force a sync.

| | |
| :--- | :--- |
| Backend | [Dexie Cloud](https://dexie.org/cloud/) — free tier covers 3 users, 25 MB structured data + 75 MB photos |
| Works signed out | Yes — full local functionality, syncs once you log in |
| **Never synced** | The LLM API key (`unsyncedProperties`), so it stays on the device that entered it |
| Photos | Offloaded to separate blob storage, not the structured-data quota |

New devices must be added to the origin whitelist before they can reach the database
(`npx dexie-cloud whitelist <origin>`). Currently whitelisted: the GitHub Pages site plus
`localhost:3000` and `localhost:5173` for development.

> ⚠️ `dexie-cloud.key` in the project root authorises administration of the cloud database. It is
> gitignored — **keep it that way**, and never paste it anywhere.

## Backups

**Parent Portal → Export everything** writes a JSON bundle covering every table, including the proof
log and its photos. *Export without photos* produces a much smaller file for quick copies.

The export walks the live schema rather than a hand-written table list, so a newly added table cannot
be silently omitted — which is exactly how every key date and exam milestone used to be destroyed on
restore.

> ⚠️ **Restoring replaces this device's data. It does not merge.** Anything logged here since the
> backup was taken is lost. Before clearing anything the app shows a before → after row count and
> automatically downloads a rescue copy of the current database.
>
> Tables the backup predates are left alone rather than emptied, and *without photos* bundles leave
> existing photos on the device untouched.

The LLM API key is **stripped from the export**, so the bundle is safe to keep in Google Drive. The
PIN hash is still included so a restore keeps the same PIN.

---

## Known limitations

Documented honestly so they aren't rediscovered as bugs.

1. **Sync is configured but unproven in the field.** The wiring is verified — cold start, seeding,
   unsynced API key, whitelisted origins — but no two real devices have yet been signed in and
   reconciled. Treat multi-device as untested until that happens.
2. **Parent governance is detective, not preventive.** The passphrase hides buttons; it does not
   protect data. Anyone with devtools can still edit IndexedDB directly — but the change history is
   now hash-chained, so edits and deletions show up in the integrity check. Genuine *prevention*
   needs server-enforced roles, which requires Tejas to have his own login; on a single shared
   account Dexie Cloud cannot tell who is acting, so it cannot enforce anything. That trade was made
   deliberately.
3. **Not a PWA.** No manifest, no service worker. Chrome will not offer "Install app", and while the
   data layer is offline-first the *assets* are not cached, so a cold load needs a network.
4. **The audit chain is unsigned.** It now catches edits, mid-chain deletions and tail truncation,
   but the hashes are not signed — a determined person who recomputes the whole chain after editing
   it would pass the check. Tamper-evident against casual editing; not tamper-proof.
5. **The timetable is mostly empty.** Only Monday of the Odd week is seeded. Tuesday–Friday and the
   whole Even week still need entering — though Quick Add's multi-day Lesson mode makes that quick.
6. **Tasks, key dates and timetable blocks still can't be edited** after creation, only created and
   deleted. Assessments in the Proof Log *can* be edited; subjects can be edited in place.
7. **Assessment results don't feed the RAG score.** The subject average over marked papers is
   calculated and displayed, but the health score is still 40% homework / 35% remediations / 25% topic
   mastery. Folding attainment in would move every subject's status, so it's a deliberate decision
   left open rather than an oversight.
8. **Free-tier storage will bind eventually.** 75 MB of photo storage is roughly 250 downscaled
   images — about a year at a realistic rate. The Pro tier (€3/month) raises that to 20 GB. The Parent
   Portal shows current usage so the trend is visible.

## Project layout

```
src/
├── components/
│   ├── shared/QuickAddSheet.tsx      # unified add - homework / key date / lesson
│   ├── shared/ProofUploader.tsx      # photo & PDF capture, thumbnails, cleanup
│   ├── assessments/                   # Proof Log: entry modal + log view
│   ├── dashboard/                     # Home: what's next, check-in, schedule, quests
│   ├── tasks/  calendar/  goals/      # My Work, Key Dates, Subjects & Goals
│   ├── remediation/                   # Fix My Mistakes
│   ├── timetable/  rewards/  guidance/
│   ├── parent/                        # PIN + Parent Portal
│   └── layout/                        # Header, Navigation, SyncStatus chip
├── services/
│   ├── ragCalculator.ts               # subject health, XP ledger (incl. reservations)
│   ├── habitEngine.ts                 # streaks, never-miss-twice, heat-map
│   ├── attachmentService.ts           # proof files: downscale, store, tally
│   ├── parentLockService.ts           # claim / unlock / change the passphrase
│   ├── auditService.ts                # hash-chained change log + verification
│   ├── burnoutEngine.ts               # weekly time budget
│   ├── llmAgentService.ts             # agentic audit (live + offline)
│   ├── backupService.ts               # schema-walking export, safe restore
├── db/                                # Dexie schema (+ Dexie Cloud) + seed data
├── utils/date.ts                      # local-date helpers (see below)
├── utils/id.ts                        # globally unique record IDs (see below)
├── utils/credential.ts                # PBKDF2 passphrase hashing + lockout curve
├── utils/device.ts                    # stable per-browser id (never synced)
└── types/                             # shared type definitions
```

### Three traps worth knowing about

**Booleans cannot be indexed in IndexedDB.** Fields like `completed` and `isCompleted` appear in the Dexie schema strings but are never actually indexed, so `.where('completed').equals(0)` silently returns an empty array. Always filter booleans in memory: `.filter(t => !t.completed)`.

**Never build IDs from the clock.** `task_${Date.now()}` is unique on one device and nowhere else —
two devices creating a record in the same millisecond produce the same key, and a sync then keeps one
and destroys the other. Dexie Cloud requires primary keys with "sufficient entropy for global
uniqueness". Use `newId('task')` from `src/utils/id.ts`, which pairs a readable prefix with a UUID.

**Never use `toISOString()` for "today".** It resolves in UTC, so during British Summer Time anything between 00:00 and 01:00 local returns the *previous* day — a check-in at 00:30 lands on yesterday and breaks the streak. Use the helpers in `src/utils/date.ts` (`todayISO`, `addDaysISO`, `daysUntil`, `formatFriendlyDate`, `formatCountdown`).

# Changelog

## August 2026 — Tamper-evident change history and a real parent passphrase

A QA field test put it plainly: the Parent Portal "is a client-side gate, not a real lock." True,
and the lock was weaker than it looked — a bare SHA-256 of four digits, with `1234` shipped as a
published default. Ten thousand candidates against one fast hash is milliseconds of guessing.

Server-enforced roles were considered and ruled out: Dexie Cloud enforces permissions by identity,
and on a single shared family account there is no student identity for the server to distinguish.
Prevention was therefore off the table, so this pass builds **detection** instead.

### The change history now catches tampering

Every entry is hashed together with its predecessor, forming a chain per device.

| Attack | Caught by |
| :--- | :--- |
| Edit a row, leave its hash | Recomputed hash no longer matches |
| Edit a row and fix its hash | The successor still points at the old hash |
| Delete from the middle | Gap in the sequence numbers |
| Delete the newest rows | A high-water mark kept outside the log |
| Recompute the whole chain | **Not caught** — the hashes are unsigned |

Chains are per device because sync makes a single global chain fork every time two devices append
while offline, which would cry tampering when nothing happened.

Tail truncation was the interesting case: deleting the newest entries leaves a shorter but
internally valid chain, so nothing inside the log can reveal it. The fix is a high-water mark in
parent settings. I got this wrong first time and wrote a test asserting it was undetectable; the
test was right that it failed, wrong about why.

**Parent Portal → Change history integrity → Run check** reports it in plain English.

### The passphrase

No default any more — first use *sets* one rather than checking one, because a published default is
worse than no lock in that it looks like protection. PBKDF2-SHA256, random 16-byte salt, 600,000
iterations (~310ms per attempt, measured), escalating lockout after three failures capped at five
minutes. An existing four-digit PIN works once and then must be replaced.

### Two bugs found while building this

`logAuditEvent` reads the chain tail and appends in one transaction, and awaiting WebCrypto's
promise inside it let IndexedDB auto-commit before the write — `PrematureCommitError`. Wrapped in
`Dexie.waitFor()`, which exists for exactly this.

`handleSaveSettings` did a whole-object `put` from React state, which would have silently erased the
new passphrase credential, the lockout counters and the audit high-water marks every time the AI
settings were saved. Narrowed to the fields that form actually owns.

Verified with 33 new assertions plus the existing 24, and in a real browser: tampering with a
redemption row and deleting the newest entry were both reported.

**Still not achieved:** the boundary is detective, not preventive. Anyone with devtools can still
edit the database; they just cannot do it invisibly.

---

## August 2026 — Multi-device sync, proof log, and the data-integrity pass

Started as a review of what would happen if the app were used on two devices at once. The answer was
worse than expected, so the fixes came first, then the two features requested on the back of them.

### Data loss, found by testing rather than reading

A harness ran the real service code against `fake-indexeddb`, one Node process per simulated device.
It reproduced, rather than predicted, the following:

| Scenario | Result |
| :--- | :--- |
| Export from phone → restore on laptop | milestones **4 → 0**; laptop-only sanction and check-in destroyed |
| Streak with one missed day | audit reported **1**, dashboard showed **6** |
| Two devices, same-day check-in merged | 40 XP where 30 was correct |
| Two devices create a record in the same millisecond | `ConstraintError`; a merge keeps one, destroys the other |
| Restore a backup older than a schema change | rewards **9 → 5**, permanently |
| Three 1,000 XP requests on a 1,200 XP balance | all approved; true balance −1,800, displayed as 0 |

**`milestones` was missing from the export list**, so every restore wiped all key dates and exam
milestones. Fixed structurally rather than by adding one line: the exporter now walks `db.tables`, so
a new table cannot be forgotten again. Restore also stopped being a silent bulldozer — it shows a
before → after row count, downloads a rescue copy of the current database first, and leaves tables a
bundle predates alone instead of emptying them.

The **LLM API key was being written into the backup file**, which is destined for Google Drive. It is
now stripped from exports and excluded from sync.

### Corrections to things the app asserted

- **Streak.** Audits called the legacy `calculateStreak()`, which reset on any single missed day,
  while the dashboard used the never-miss-twice rule. The parent's report contradicted the child's
  screen. The legacy function is deleted.
- **"Every change" in the change history** did not include deletions. A student could delete a task
  or a key date and leave no trace. All five delete paths are now logged.
- **Pending reward requests reserved nothing**, so the shop could be overdrawn and the overdraft
  hidden by a `Math.max(0, …)`. Pending requests now hold their cost, and an approval that would
  overdraw is refused.
- **Goals could never be approved.** `APPROVED_LOCKED` existed in the type and the burnout engine
  only counted goals in that state, but nothing could perform the transition — so the time-capacity
  gauge had been ignoring every goal Tejas proposed. Parents now have Approve & Lock, and unlocked
  goals show their hours struck through so the omission is visible.
- **Live LLM audits never reached the provider.** The Anthropic browser header was misspelled, both
  default models were retired, `max_tokens` truncated reports mid-sentence, OpenAI was offered in the
  dropdown with no implementation, and every failure was swallowed. All fixed; the portal now says
  *why* the offline engine ran.

> Several of these were **already recorded in spec §8.2 and §8.4**, including the correct Anthropic
> header. They were rediscovered by testing rather than read. Check §8 first.

### Simpler entry

One sheet now covers homework, key dates **and lessons**. Subjects and categories became icon chips
instead of dropdowns. Lesson mode writes to **several days at once** — pick a period, tick Tue/Wed/Thu,
one tap creates all three — which turns filling in a rotation from twenty repetitions into one pass.
Period chips are ordered by clock time, so the default is Registration rather than whatever sorted
first by primary key. `AddEventModal` is gone.

### Proof Log

Marked work recorded as evidence: score and grade, a question-by-question breakdown (topic, marks
scored vs available, and *why* the marks went), teacher feedback, and photographs of the paper.
Images are downscaled to 1600px on upload — a 6 MB phone photo becomes about 300 KB — so backups and
sync stay usable. Questions that dropped marks optionally become fix-up tasks due in three days, so
the log drives work rather than just recording it.

This closes the "no assessment results" gap in §8.2. The per-subject average is displayed but
deliberately **not** folded into the RAG score, because that would move every subject's status
without an explicit decision.

### Multi-device sync

Dexie Cloud, chosen over Supabase/Firebase because it layers onto the existing Dexie schema rather
than requiring the data layer to be rewritten, and because it keeps the offline-first behaviour.

- Optional and off until someone signs in; the app is fully usable signed out
- Sessions last months, so it is one login per device, not a daily ritual
- `unsyncedProperties` keeps the LLM API key on its own device permanently
- Photos are offloaded to blob storage automatically, away from the structured-data quota
- Seeding moved from `on('populate')` to `on('ready')` per Dexie's guidance — `populate` fires on a
  brand-new database, which is also the state a second device is in just before its first sync

**Prerequisite:** every record ID is now a UUID. `task_${Date.now()}` was unique on one device and
nowhere else.

**Caught during setup:** `dexie-cloud create` writes `dexie-cloud.key` — a credential authorising
administration of the cloud database — into the project root, and it was **not** gitignored in a
public repo. Nothing leaked; it is ignored now.

**Not done:** the parent/student boundary is still UI-level. The PIN hides buttons; devtools bypasses
it entirely. Dexie Cloud realms and roles would make it real. See §8.2.

### Also

The project moved to `C:\dev\GCSE-Genie`. `npm install` cannot write package contents inside the
Google Drive folder — every extracted file lands at zero bytes, even for a single 2 KB package — and
Drive's filesystem rejects directory junctions, so there is no in-place workaround. The README had
already warned about this; it was rediscovered the hard way.

---

## August 2026 — Page headings matched to navigation

The previous pass renamed the navigation tabs but not the pages behind them, so tapping *Fix My
Mistakes* landed on a page headed "Year 9 Assessment Diagnostic Remediation Portal". Every page
banner now repeats its nav label verbatim, with the useful detail moved into the subtitle:

| Page | Was | Now |
| :--- | :--- | :--- |
| Remediation hub | Year 9 Assessment Diagnostic Remediation Portal | Fix My Mistakes |
| Dashboard quests card | Year 9 Diagnostic Quests | Fix My Mistakes |
| Goals | GCSE Grade 9 Target Hierarchy | Subjects & Goals |
| Rewards | Parent-Managed Rewards Ledger | Rewards |
| Careers | General Guidance, Free Revision Links & Career Pathways | Careers & Help |
| Timetable | Guildford County School Rotational Timetable | Timetable |
| Parent portal | Parent Portal & Agentic Governance | Parent Portal |

Sub-headings followed: "What you can spend XP on" (was "Real-World Reward Catalog"), "Your
requests", "Your goals", "Topics covered", "Homework for this subject", "Three quick questions",
"This Week's Workload", "Log today", "Your check-in history", "AI Audit Settings", "Log a School
Sanction", "Backup & Restore".

**Corrected a false claim while in there.** The audit log was headed *"Immutable Write-Only Audit
Ledger"* with the subtitle *"Cryptographically Chained with SHA-256"*. Neither is true: each entry
carries a SHA-256 of its own payload with no previous-hash link, and rows remain deletable. It now
reads **"Change History — Every change, with a SHA-256 checksum per entry"**, which is accurate. The
architecture spec has been corrected in the same way, and section 8.5 records the naming rule so
nav labels and page headings cannot drift apart again.

---

## August 2026 — Habit mechanics (Atomic Habits)

Four changes drawn from James Clear's *Atomic Habits*, chosen for behavioural impact per line of
code. The app is solving Clear's hardest case: a behaviour whose real payoff is two years away.

### Never miss twice

The streak reset to zero after a single missed day. Clear's rule is the opposite — *one miss is an
accident, two is the start of a new habit* — and a hard reset punishes hardest at the exact moment
re-engagement matters most, erasing weeks of genuine evidence.

- A single missed day is now **absorbed**; the chain only breaks on two consecutive misses.
- **Best streak** and **total days** are tracked separately and never decrease, so history survives
  a broken run.
- At exactly one missed day the app surfaces a dedicated prompt — *"You missed yesterday. Don't miss
  twice."* — on the dashboard, and the header streak badge turns amber and reads *at risk*. This is
  the single highest-leverage nudge available, and it fires only on the day it matters.
- Added a **12-week contribution-style heat-map**. A number can be reset to zero; a visible history
  of 40 days with a few gaps still reads as success.

New `src/services/habitEngine.ts` and `src/components/dashboard/HabitStreakCard.tsx`.
`calculateStreak()` in `ragCalculator` is superseded by `calculateStreakStats()`.

### Reflection now produces scheduled work

The check-in's *"Key action item for tomorrow"* and *"Question to ask a teacher"* were written to a
log nobody re-read — reflection with no follow-through. Both now optionally become **real tasks due
tomorrow**, which is Clear's *implementation intention*: a stated action bound to a specific day.
A subject picker and two toggles appear only when there is something to schedule, so the check-in
stays under two minutes when those fields are unused. Log fields also now clear between check-ins,
which they previously did not.

### Reward horizon shortened

The cheapest reward was 800 XP — roughly ten days of steady work, which is a savings account rather
than a craving. Added four micro-rewards at **50–150 XP** (pick the dinner music, skip a chore, 15
minutes of screen time, choose the weekend film) so effort can be reinforced the same day. The
catalogue is now sorted cheapest-first, and a **progress bar to the next affordable reward** makes
the anticipation visible rather than just the balance. Delivered to existing installs via a Dexie
v3 migration, since `populate` only fires on a brand-new database.

### Identity and cumulative effort

Outcome framing ("Target: Grade 9") makes a missed day feel like a failed target. Clear's identity
framing makes it one lost vote. The dashboard now shows **votes cast for being someone who does the
work** (completed tasks + quests + check-in days), alongside **total hours studied** — so that a
flat grade during the *plateau of latent potential* does not read as failure.

### Verification

Streak logic was exercised against seeded data in a browser, covering all three cases: a single
missed day absorbed (5 check-ins across a 6-day span → streak 5), one missed day pending (streak
preserved at 4, nudge shown, header at-risk), and two consecutive misses (run ends at 0, but best 6
and total 6 survive). The check-in → task path was confirmed to write both items to tomorrow with
the correct subject, priority and XP.

---

## August 2026 — Correctness pass and frequency-based UX restructure

### Fixed — bugs that broke the core loop

- **The daily check-in never showed any homework.** `.where('completed').equals(0)` was querying a
  boolean field, and IndexedDB cannot index booleans, so the query always returned an empty array.
  The check-in displayed *"🎉 No pending tasks! All clear."* regardless of how much was outstanding —
  the app's central habit loop did nothing. The same query made `pendingHomeworkTasks` empty in the
  parent's audit bundle, so audits reported all-clear too. Both now filter in memory.
- **XP was double-counted.** Homework ticked off during a check-in was banked twice: once in the
  check-in's `xpEarned` and again through the task's own `xpValue`. The same task was worth 50 XP
  from My Work but 100 XP via the check-in. Check-ins now store only the XP they alone grant (daily
  base + study time); homework is credited through the task, which also means High-priority work
  correctly pays 60 rather than a flat 50.
- **The burnout gauge was permanently red.** Air Cadets was counted twice — once as a hardcoded 6h
  baseline constant, once as the seeded `g-cadets` approved goal — giving 50h against a 45h ceiling,
  i.e. 111% on first launch, forever. Baseline commitments now carry `coveredByGoalId` to exclude the
  duplicate. The ceiling was also raised to 60h; see *Recalibrated* below.
- **Quest state leaked between quests and working notes were discarded.** The solve modal stays
  mounted, so its `useState` initialisers only ran once with `quest === null`: saved scores and proof
  links never loaded, and values typed for one quest carried into the next. The *Student Working
  Notes* textarea was never persisted at all. Fixed with a reset keyed on `quest.id`, and a new
  `studentWorkingNotes` field.
- **Completing a quest opened from the dashboard reopened it with stale data** — a race between
  `onSuccess` (which re-read and re-set the active quest) and `onClose`. The active quest is now
  derived from the list rather than snapshotted, and auto-open fires once.
- **Rewards, Careers and the Parent Portal were unreachable on mobile.** The bottom bar rendered
  `navItems.slice(0, 5)`, silently truncating the rest. Diagnostic Quests and the entire rewards
  economy — the app's motivational engine — could not be opened on a phone.
- **The parent PIN was hardcoded, displayed on screen, and could not be changed.** The modal ignored
  the stored `parentPinHash`, accepted the literal string `'1234'` as a bypass, and printed the PIN
  in its own subtitle. The README claimed it was changeable; no such UI existed. It now checks the
  stored hash, the bypass is gone, the PIN is no longer shown, and a change form has been added with
  a warning while the default is still in use.
- **"Today" was computed in UTC everywhere.** `new Date().toISOString().split('T')[0]` returns the
  *previous* day between 00:00 and 01:00 during British Summer Time, so a late-night check-in filed
  against yesterday and broke the streak. Verified live: the old code returned `2026-08-23` while it
  was locally the 24th. All date handling moved to `src/utils/date.ts`.
- **The calendar opened on a hardcoded October 2026** rather than the current month.
- Division by zero produced `NaN%` on the quest progress ring when no quests existed.
- Settings could silently wipe the stored PIN hash if saved before the initial load completed.

### Recalibrated

- **Safe weekly ceiling: 45h → 60h.** It is a *total* including 32.5h of school. Against a 44h
  baseline, 45h left under an hour a week for all homework and revision, so the gauge could never be
  green. Measured behaviour now: 0–6 h/week of study is green, 10–16 h amber, 17 h+ red, with overdue
  work adding a surcharge. Lives in one named constant and is intended to be tuned.
- Logged study time still counts toward the total (it is real time), but the ceiling now leaves
  genuine headroom so that studying more does not push the student toward a burnout warning.
- Self-marked practice scores no longer claim a GCSE grade. `80% = Grade 9` is not how grade
  boundaries work; it now reads *Secure / Nearly / Needs work*.

### Changed — restructured by frequency of use

- **Navigation split into daily and weekly tiers.** Daily: Home, My Work, Key Dates, Fix My Mistakes.
  Weekly, behind a divider on desktop and a *More* sheet on mobile: Rewards, Timetable, Subjects &
  Goals, Careers & Help, Parent Portal. Goal creation and amendment moved out of the daily path.
- **Quick Add** — one floating action button on every screen adds either homework or a key date.
  Three required fields, quick date chips, everything else folded away. Replaces the previous
  three-step "find the right tab → find its Add button → fill a long form", and removes the duplicate
  add-task form that lived in My Work.
- **"What's next" card** added to the top of Home: overdue, then due today, then the next seven days,
  with key dates counting down beneath, all tickable in place. Previously the dashboard did not show
  a single task or due date — the one question a student opens the app to answer.
- Dashboard reordered to match the daily loop: what's next → log today → schedule and quests →
  time-capacity gauge (demoted, being a weekly readout rather than a daily action).
- Calendar made usable day to day: opens on the current month, today is highlighted, a **Today**
  button was added, and the list splits into *Coming up* with countdowns ("in 8 weeks") versus past
  dates behind a toggle.
- The XP badge in the header is now a button that opens the Rewards shop, keeping spending one tap
  away without consuming a navigation slot.
- Dates render as *Today / Tomorrow / Wednesday / Overdue by 3 days* instead of raw ISO strings.
- Headings rewritten in plain English — *My Work* rather than "Workload Prioritization & Homework
  Planning", *Fix My Mistakes* rather than "Year 9 Assessment Diagnostic Remediation Portal".
- Subject is now required when adding homework. It previously defaulted silently, filing an English
  essay under Maths and skewing that subject's RAG score. (Caught during runtime testing.)

### Documentation

- `README.md` rewritten to describe the app as it is, including a *Known limitations* section.
- `GCSE_Genie_Architecture_Spec.md` — section 8 added, reconciling spec against implementation;
  RAG formula and time-budget sections corrected.
- `context.txt` marked as the founding brief, with superseded figures flagged inline and a
  divergences appendix.

### Verification

Typechecks clean under `strict`, production build succeeds, and the changed paths were exercised in
a browser: check-in task list, XP totalling, streak increment, burnout gauge, Quick Add write path,
live dashboard refresh, and the calendar. Console clean.

Not verified at runtime: the mobile bottom bar (breakpoint-driven; logic verified by reading, but
worth checking on a real phone).

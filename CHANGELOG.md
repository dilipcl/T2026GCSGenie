# Changelog

## August 2026 — Priority 2: planning, breaks and spreadsheets

The second half of the 25 August field test. Five workstreams.

### A Plan tab, and a weekly review that ends in an agreement

Work was one flat date-sorted list, so a task due in October sat beside tomorrow's
homework and there was no moment where Tejas decided what the week actually holds.
Three buckets make that explicit: **This week** is a promise; **Next up** and
**Later this term** are a backlog that costs nothing.

Moving something out is one tap and says *"deferring is planning, not failing"* —
the release valve that turns a heavy week into a replanned one rather than a quit.
Only committed work counts towards the load meter and the slipping nudge.

The load bar measures against **study headroom** — the ceiling less school, cadets
and everything fixed — rather than the whole 60 hours, so it answers the question
actually being asked while planning.

Key dates moved in rather than keeping their own tab: a deadline means something
next to the work meant to meet it, and a sixth bottom-bar tab does not fit on a
phone.

The weekly review runs here — last week, next week, approvals, sign off. Everything
it shows already existed; what did not was a moment putting it in one order and
ending in an agreement. The sign-off writes to the change history, which is what
turns an intention into a routine with a record.

### Focus blocks, and the quiet failure modes

A 25-minute block now runs in the app with the break built in rather than offered
as a reward. Finishing one writes its own check-in, so the streak and weekly hours
pick it up with nothing to remember. The timer anchors to wall-clock time, because
browsers throttle intervals in a background tab — exactly where the tab goes when
someone starts working.

Two nudges catch the opposite of over-scheduling: a plan slipping late in the week,
and breaks displacing the study they were meant to punctuate. Both stay silent
unless they apply, and both offer one 25-minute block rather than a telling-off.
Streak repair makes the existing never-miss-twice grace explicit on the day it
matters.

All of it sits at the *top* of the dashboard — the field test found the burnout
banner unread at the bottom of a long scroll.

### Spreadsheets, both directions

Import for homework, timetable, key dates and topics, each with a template, always
previewing before it writes. The parser handles quoted fields, and rejects a
UK-format date rather than silently misreading it. Export is one readable sheet
with nine sections.

### Also

A subject per follow-up item at check-in — a CS question was being filed under
Maths, which skewed that subject's RAG score. Topic mastery taps land immediately
instead of flicking back. 

**B9 was not a defect.** No check-in is seeded at all; the +500 XP row the tester
saw was my own test data from an earlier session.

245 assertions pass.

---

## August 2026 — Handover Priority 1, from the 25 August field test

A second QA pass, playing both the student and the parent, found five things
blocking a confident handover. All five are fixed.

### Dashboards were stale, and the balance lied

"What's next" showed *Nothing due this week* while six tasks were due within three
days; a reload fixed it. The header advertised 520 spendable XP while 100 was held
against pending requests, and flashed 0 XP / 0 streak on first paint.

Both are one root cause. Every dashboard surface loaded once and waited for a
`refreshKey` prop that not all of them were given; the header polled every three
seconds instead. All six now use `useLiveQuery`, so Dexie re-runs each calculation
when the tables it reads change. Verified against the hardest case — a raw
database write with no component event at all — the header went 0 → 50 XP and
What's-next 4 → 3 tasks, unprompted.

Loading is now distinguishable from empty. The old code initialised state to
zeroes, so "not loaded yet" and "nothing due" rendered identically. That is the
whole bug.

### The rewards shop

Reading the balance live closes the affordability hole structurally. On top:
requests are confirmed before the hold is taken and debounced against double-taps,
and a pending request can now be **withdrawn** — status `WITHDRAWN`, which reserves
nothing and therefore refunds by definition, while keeping the row as history. A
mis-tap previously needed a parent to undo.

### The sign-in dialog

The stock dexie-cloud login is a plain white box that reads as a browser security
prompt. `customLoginGui` hands the interaction to the app, so it now renders in the
app's own styling and explains what signing in does — including that a different
email address gets a different, empty account.

### The timetable

Only Monday of the odd week existed, while the workload meter assumed 32.5h of
school. Fifty lessons now cover both weeks. It is explicitly a **placeholder** and
says so in the code — it is not Tejas's real timetable, which is in no document I
have. Correcting it is a handover task, not a code change; every entry can be
replaced through Quick Add's multi-day Lesson mode.

### Also

Parents can **Decline** a proposed goal — previously the only exit was Approve &
Lock, which is why the test left a stress-test goal stranded. The More sheet
scrolls on short viewports. A change-history row that read `true` now reads
*Completed "Portfolio AO2 Media Experimentation Sheet" (+50 XP)*. A disabled Add
button says which field is missing. The header badge reads **Target: Grade 9**
rather than "Grade 9 Accelerator", which collided with "Year 10" a line below.

166 assertions pass.

---

## August 2026 — Material capture on syllabus topics

The last of the P0s, and the smallest, because the pieces were already there: `ProofUploader`
existed, and `ProofAttachment.ownerType` only needed `TOPIC` adding to it.

Each topic row in the subject checklist gains a **Material** button that opens a notes link and
photo capture. The link accepts anything — NotebookLM, a Doc, a file in the subject folder — and
saves on blur, on Enter, or from an explicit Save button that appears once the field is dirty. Blur
alone is not enough on a phone, where the keyboard's "go" often moves focus nowhere.

The button carries a count once a topic has material, loaded for the whole checklist in one query
rather than one per row.

This completes the repository model: Drive holds the filed material, Genie records what exists and
where, and the photos in the app are the quick captures that would otherwise never be filed at all.

**Also fixed:** the icon-only delete buttons on tasks, key dates, timetable blocks and topics now
carry `aria-label` and `title`. That gap was logged as a known limitation last week after a test
could not find the buttons by label either; it is closed rather than carried.

12 new assertions, including that an assessment file sharing an id with a topic is not miscounted as
topic material, and that both the photos and the link survive a backup round trip. 154 in total.

---

## August 2026 — In-app toasts and confirms replace 24 native dialogs

The app leaned on `window.alert` and `window.confirm` in 24 places: 16 alerts and 8 confirms, for
everything from "+150 XP sub-quest added!" to every delete confirmation. Unstyled OS boxes that
block the whole page, in an app that otherwise fires confetti — the QA field test called it out, and
it was right.

One `FeedbackProvider` now supplies both:

- **Toasts** in four tones, stacked above the mobile bottom bar so they never cover the nav.
  `role="status"`, or `role="alert"` for errors, which linger longer because they usually need
  acting on. A `celebrate` tone fires confetti — the sub-quest reward finally gets the same
  treatment as the daily check-in.
- **A promise-based confirm**, so `if (await confirm({...}))` reads much like the call it replaces.
  Escape cancels, the backdrop cancels, the confirm button takes focus, and destructive actions get
  a red treatment. It can carry preformatted detail, which the restore pre-flight needs for its
  before/after row counts — something a native confirm could only render as a wall of text.

Several messages got better in the move, because a toast has a title *and* a description where an
alert had one string. "Not enough XP" now names the reward, the cost and the balance separately.

Verified by overriding `window.alert` and `window.confirm` in the running page to record any call,
then exercising the flows: zero native calls, Escape cancelled without deleting, confirming deleted,
and the celebrate toast rendered with confetti.

**Found while testing:** the delete buttons on tasks, key dates and timetable blocks are icon-only
with no `aria-label` — a screen reader announces nothing. Recorded in the README's known
limitations rather than fixed in passing.

---

## August 2026 — The Drive repository is wired up

Every subject pointed at `https://drive.google.com/drive/folders/` — the bare stub, no folder ID —
so tapping "Google Drive" opened an empty page. Ten of them, plus six topics with empty note URLs.

The repository now exists: `GCSEAppWorkingFolder`, nine subject folders each holding
`Notes` / `Papers` / `Practice`, plus `_Shared-Resources` and `_Genie-Backups`, with a README
documenting the layout and a filename convention.

Because the folders were readable directly from Drive, the nine links could be seeded rather than
pasted by hand. Every seeded ID was then cross-checked against live Drive to confirm each subject
points at its own correctly-named folder — a regex can prove a URL is well formed, but only a
lookup catches Chemistry pointing at the Physics folder.

Topics have no folder of their own, on purpose: the structure stops at subject level so there are
27 folders to keep tidy rather than several hundred. A topic with no link falls back to its
subject's folder, so the link is never simply absent.

Two constraints are worth writing down, because both are permanent:

- **Drive folder URLs are opaque IDs, not paths.** There is no way to derive the Maths folder's URL
  from the parent folder's URL, which is why each subject carries its own rather than a base path
  plus a name.
- **A browser cannot open `G:\My Drive\…`.** That path is Drive for Desktop, and Chrome blocks
  `file://` links from an https page. The path is shown so files can be found in Explorer; the URL
  is the part that clicks.

The Parent Portal gained direct links to the working folder and the backups folder, and its backup
path now points at `_Genie-Backups` rather than a directory that never existed.

---

## August 2026 — Two broken promises from the QA field test

A hands-on field test worked through the app as a Year 10 student would and found
three high-impact issues. Two are fixed here; the third (native browser dialogs) is
separate work.

### Logging a wrong answer now creates the fix-up task it promises

The Proof Log's headline pitch — "any question you got wrong becomes a fix-up task
automatically" — did nothing unless the student expanded the question row and picked a
*reason* for the dropped marks. Creation required `errorType !== 'NONE'`, and a new row
defaulted to exactly `'NONE'`.

Worth recording why this reached production: the feature was tested by its author, who set
the error causes while exercising the UI he had just designed. The field tester typed the
marks and moved on, which is what a tired 14-year-old does. That is the difference between
testing a feature and testing its use.

Tasks now key off marks alone. The recorded cause remains useful metadata — it still drives
HIGH priority for a knowledge gap — but it is not evidence that a mark was lost. New rows no
longer pre-select "Got it" either, which was untrue as a default and helped the bug hide.

The derivation moved into `services/assessmentService` as a pure function, because the bug
survived by sitting inside a submit handler where no test could reach it. The new tests were
run against the old predicate first and failed on exactly the reported case — and only that
case, because `undefined !== 'NONE'` meant every other scenario passed while broken.

The checkbox now states the outcome before saving — "3 will be created" — so a silent zero is
visible immediately rather than found by a tester weeks later.

### Quest XP now requires evidence

"Mark Complete & Claim +300 XP" paid out with the score, the notebook link and the working
notes all blank; the button was gated on nothing but `isSaving`. For an app whose premise is
"do the work", that made XP something a student could mint and every reward bought with it
something a parent could not trust.

Claiming now requires a score **and** either a notebook link or a photograph of the working,
with the button saying which is missing. A score of zero still claims — getting nothing right
is still doing the work.

### Practice questions removed

Entirely: rendering, seed data, both schema fields and the `ComprehensiveQuestion` type — 88
lines of seeded questions gone. Genie records where the real work lives; it does not host a
quiz. What replaces them is `taskInstructions`, which had been stored since the beginning and
never displayed — the modal showed a question bank but never told the student what to do.

Photo upload was added alongside the notebook link, so proof can be a picture of an exercise
book page.

Two smaller things fell out: the "1 Practice Questions" pluralisation bug went with the field
it counted, and sub-quests no longer generate a sample question.

**124 assertions pass**, including the browser confirming the claim button disabled with a
reason, enabled on adding a link, and blocked again when it is cleared.

---

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

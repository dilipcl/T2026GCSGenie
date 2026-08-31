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
| **Every day** | Home · My Work · Plan · Fix My Mistakes · Updates | Check what's due, log the day, tick things off, sign changes off |
| **Weekly** | Proof Log · Rewards · Timetable · Subjects & Goals · Help & Careers · Report Bugs | Logging marked work, planning, review, spending XP, filing friction |
| **Parent only** | Parent Portal | Audits, sanctions, backups, catalogue and profile setup |

On mobile the daily sections are the bottom bar; the rest live behind **More**. On desktop they're separated by a `WEEKLY` divider.

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

### Plan — the week's promise
Three buckets: **This week** (committed), **Next up** (roughly this month), **Later this term**.
Only committed work counts towards the load meter and the nudges, so the backlog carries no guilt.
Moving something out is one tap — that is the release valve that keeps a heavy week from becoming a
quit. The load bar measures against the study time actually left after school and fixed commitments.

Key dates live here too, and the **Weekly review** runs from here: four steps, fifteen minutes,
ending in a sign-off that is recorded.

### Focus blocks
25 minutes with the break attached, logging its own study time against the subject being worked on.
Three gentle nudges catch a plan slipping late in the week, breaks displacing the study they were
meant to punctuate, or a locked goal not getting the hours it reserved.

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
Real errors from Tejas's Year 9 scripts and GCS interim reports, turned into targeted work:

- **Maths** — Venn independence proofs, negative/fractional scale factors, double-bracket sign errors
- **Science** — chromatography Rf (must be < 1.0), power-to-energy minute→second conversion
- **History** — Treaty of Versailles reparations, 12-mark comparative essay structure
- **Computer Science** — 14-day homework consistency challenge (IR3 flagged Home Learning under AMN)

Each quest gives the Grade 9 formula or rule, then says what to do — and the work happens where
it actually happens: an exercise book, CorbettMaths, PMT, a past paper. Genie records the outcome,
not the exercise.

**Claiming the XP requires evidence.** A score, plus either a Google Notebook link or a photograph
of the working. Previously the full reward paid out with every field blank, which made XP something
a student could mint and every reward bought with it something a parent couldn't trust. A score of
zero still claims — getting nothing right is still doing the work.

A weak area can spawn a targeted follow-up sub-quest.

> Quests used to embed one practice question with a model answer. Those were removed in August 2026:
> a single question in a modal is neither real practice nor useful source material, and the app's job
> is to record where the work lives, not to host a quiz.

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

### The weekly cockpit — Home in one card

Home opens on a single card answering the three questions that actually get asked, so nothing has to be added up by scrolling:

- **Countdown** — days to the first morning of the exam series, the term week, and the target grade.
- **Goal pacing** — hours logged against each locked goal's weekly budget, with a pale tick marking the share expected *by the end of today*, and a four-week sparkline beside it.
- **Capacity** — the week's total against the 60h ceiling, broken down per commitment, with anything excused shown as a deduction.
- **Today** — the most pressing piece of work, the next fixed commitment, and today's chore. One tap each.

It computes nothing of its own. Every number comes from the same service the corresponding full screen uses, so the summary can never disagree with the page it summarises.

### Pacing: ahead, behind, stalled

A weekly budget is arithmetically "behind" one minute past midnight on Monday, which is true and useless. So nothing is called behind before **Wednesday**, and nothing is called **stalled** — nothing logged at all — before **Friday**. Three tiers rather than two, because "behind by twenty minutes on Wednesday" and "not started by Friday" deserve different volumes; one amber for both teaches people to ignore amber.

### Fixed commitments and attendance exceptions

School, Air Cadets, Art Support, Drums and Bronze DofE are rows in a table, editable in the Parent Portal, each linked to the timetable entries it is actually made of.

When an evening does not happen, **Log absence** takes about fifteen seconds: a reason chip, a status, an optional note. The hours come off that week's load and the capacity explanation says so explicitly — a figure that silently drops by three hours reads as a bug.

Exceptions are keyed `${commitmentId}__${date}`, so two devices logging the same absence offline merge into one row and one deduction rather than double-counting it.

### Confirming changes, and the Updates tab

Nothing a student changes is written until it is confirmed. The sheet states what will actually happen (`+50 XP`) rather than asking a vague yes/no, and its primary button refuses input for 300ms so a double-tap that opened it cannot also accept it. It never absorbs a tap silently — an early tap is refused *and explained*.

That sheet is a reflex guard, not a review. The review lives on the **Updates** tab: everything confirmed but not yet signed off, deselectable item by item, with one comment for the batch. Confirming does three things at once:

1. stamps each entry with a confirmation time and the comment,
2. writes a dated Markdown file for the Google Drive folder,
3. offers to forward the batch, if the family has switched that on.

Each entry keeps both the time it happened and the time it was confirmed. Nothing reaches the family until it has been re-confirmed.

### All activity - every change, by whom

The Updates tab has two panes. **Sign off & send** is the original screen: read
back what you did, put it on the record, forward it to the family. **All
activity** is the complete record - every insert, update and delete.

The two exist because they answer different questions. `changeLog` is written
only by the confirmation sheet, so it covers the eight things a person
deliberately says yes to; the audit log covers everything. `activityService`
merges them at read time, preferring the human sentence where one exists. Neither
log is rewritten - the audit log is hash-chained, and editing it to read more
nicely would destroy the property it exists for.

Rows say **who**, by person rather than role. Naming a device applies to every
entry it has ever written, and giving two devices the same person groups them, so
"what has Tejas changed this week" has an answer even though he uses a phone and
a laptop. The honest limit is stated in the UI: this names a device, not a human.

Filters: day, person, action, area, subject, free text, only-unfinished, and
needs-review. Sanctions and passphrase changes are parent-only; every content
change is shared, and the student is told how many rows are hidden rather than
being shown a quietly shorter list.

### Comments, and what still needs an answer

Any row takes a comment. A **remark** flags nothing. A **question** flags the row
until somebody answers it, so "Physics session completed" can carry "did you add
the Notebook link and a follow-up task?" against the thing it is about, instead
of at dinner where nobody records the answer.

Answering asks what was actually done - "added, and made a follow-up for Friday"
and "not needed, it was classwork" are different answers a bare tick would lose.
Either person can answer; the student is usually the one who did the thing.

### Automatic backups

Two transports, because neither covers the whole family.

**Folder handle (desktop).** Parent Portal → Backup & Restore → *Choose the
backup folder*. The browser hands back a directory handle that survives restarts
and the app writes straight into it; Drive for Desktop uploads within seconds. No
Google account, no token, nothing over the network. Chromium desktop only.

**Drive API (phones).** No mobile browser has the File System Access API, so a
phone uploads through the Drive API. Needs `VITE_DRIVE_OAUTH_CLIENT_ID`; without
it the panel says so rather than offering a button that cannot work. Google
Identity Services issues an access token lasting about an hour with **no refresh
token**, so this means *automatic while a token can be obtained*, not unattended
for weeks.

Backups run **when the app is opened** and a day has passed - not on a timer. A
backgrounded phone tab makes `setInterval` a promise the browser will not keep,
and the moment the app is definitely alive is the moment somebody opens it. **If
nobody opens the app, no backup is taken.** There is no server.

The newest 30 are kept. Pruning runs only after a successful write, matches an
anchored filename pattern so it can never remove a file Genie did not create, and
never deletes the backup just written - names sort chronologically, so a device
with a fast clock could otherwise push a fresh backup out of the keep window.

**Backups land in two places, deliberately.** The laptop writes into whichever folder its picker
was pointed at - `_Genie-Backups\AutoBackups`. A phone cannot write there: Genie asks for
`drive.file`, the narrowest Drive permission, which reaches only files the app itself created, so a
folder made by hand in Drive is invisible to it however correct the link. The phone therefore uses
its own `GCSE Genie Backups` folder. Both are in Drive, both are pruned to 30, and the alternative -
widening the permission to the whole of Drive to solve a filing problem - is a poor trade.

Proof photos mirror alongside each backup. This matters: the JSON export cannot
carry a blob, so before this every restore silently lost every photo. The folder
handle saves the file but never learns the id Drive assigns, so only the API
transport produces a link - the feed shows three states, not two.

### Data quality

Parent Portal → Data quality reports what would weaken an analysis, with the
consequence beside it so a person can decide whether to care. Auto-fix covers
only what cannot be wrong - bucket defaults and title formatting. Estimates, goal
links and subject attribution are left alone on purpose: a plausible guess is
indistinguishable from a real value the moment it is saved.

### Report Bugs / Suggest Improvements

Somewhere to file friction while it is still specific. Anyone files; only a
parent sets a status, so *Done* means a decision was made. Filed items appear in
the activity feed like anything else, because an idea nobody can see is the same
as no idea.

### The Drive log

Confirming produces `Genie-Updates-YYYY-MM-DD-HHMM.md`, named so a folder of them sorts chronologically as plain text, and written in Markdown so a parent can open it on a phone and read it.

**This is a save, not an upload.** The app holds no Drive credentials and no OAuth token — it is offline-first by design. The family runs Drive for Desktop over the working folder, so the file is saved and the folder path is shown next to the button. The interface says this rather than implying an upload.

### WhatsApp — the family log

Confirmed batches, questions from the check-in, goal approval requests, schedule exceptions, reward approvals and the Sunday digest can all be sent over WhatsApp click-to-chat. Pure string construction: no API, no account, no key, nothing leaves the device.

Two rules the UI enforces rather than leaving to a component to remember:

- **Nothing is ever sent automatically.** Every message is composed, shown and dispatched by a human tap.
- **The app never claims a message was sent.** Opening a link is all it can observe, so the button says *Open in WhatsApp*, never *Send*, and there is a copy fallback everywhere.

WhatsApp has no URL that targets a group with a prefilled message — `wa.me/?text=` opens the chat picker and the sender chooses. The group's invite link is stored in settings and offered alongside.

Which destinations are offered is a parent setting (`updateForwarding`): the family group, individual saved numbers, and whether the options appear straight after confirming.

### Running on empty

`energyLevel` is collected on every check-in. When three of the last five are at 2 or below, Home offers the smallest next step — cut this week's commitment, or send the "it's getting heavy" message. Written as an offer, never a telling-off.

### Doors still open

Each career route's `requiredGCSEGrade` is joined against the current estimated grade for its relevant subjects, so Help & Careers can say how many routes are in reach today and which single subject moving up one grade would open the most. Framed as doors open, not doors lost.

### Subjects & RAG status
Live Red/Amber/Green per subject, weighted **40% homework · 35% remediations · 25% topic mastery**, with a manual override if the calculated value is misleading. Covers Edexcel Maths, AQA English Lang & Lit, AQA Triple Science (+ required practicals), AQA History, OCR Computer Science, AQA Art & Design.

### Chores
The small reliable jobs, kept deliberately outside the study plan: no due date, no subject, no place
in the weekly load, no effect on the burnout gauge. Putting "empty the dishwasher" in the same list
as a mock paper — and counting it against revision hours — is how a planning tool stops being
believed.

Three cadences: **every day**, **school days**, or **one named day a week**. Today's appear as a
single card on Home that renders nothing at all when nothing is due. One tap to tick, one to
un-tick, no confirmation either way — a chore that takes four minutes cannot cost thirty seconds to
log, and a mis-tap that cannot be taken back leaves XP in the balance that was never earned.

A parent owns the list from the Parent Portal, with one-tap starter suggestions on an empty list;
the weekly review reports how the week went and can add one inline. Chores are **retired** rather
than deleted, so past completions keep pointing at a real row and XP already earned stays earned.

XP defaults are small on purpose — 10 for a daily chore, 25 for a weekly one — so chores cannot
out-earn revision. The ledger reads what was awarded at the time, so re-pricing a chore does not
retroactively repay every time it was already done.

### Editing
Everything the app holds can be changed after it was created, not only completed or deleted:
homework, key dates and lessons through the same Quick Add sheet with the row loaded into it;
syllabus topics in place; every field of a subject; goals; fix-up quests; the rewards catalogue;
revision and career links; the bell times behind the period chips; and the student profile.

Every field-level change writes its own row to the change history — *weekly hours: 2 → 4*, not
"goal updated". A summary row satisfies the letter of an audit trail and tells nobody anything.

### Goals: draft → discussion → locked
A goal is written the SMART way with a weekly hour budget and, optionally, the subject it belongs
to. It can be kept as a **draft** while the wording is still being worked out, **sent for approval**
when it reads right, and **locked** by a parent — only then do its hours count towards the weekly
capacity. A locked goal can still be edited, but only by a parent: the hours are live in the
capacity model, so student-side edits would be a way to edit around the lock.

Locked goals are then measured against their budget. Study time logged at check-in or by a focus
block carries the subject it was spent on (and the goal, when the homework being ticked off was
linked to one), so each locked goal shows **2.0 / 3.5h this week** — pro-rated by weekday, so
nothing is called behind on a Monday morning. Past mid-week, anything under pace surfaces on Home
and in the weekly review.

The SMART *measure* — "14-day homework streak + 90% on quizzes" — stays free text. Parsing an
English sentence into a tracker is a worse product than asking a person what the number should be.

### Weekly time budget
Tracks total committed hours against a safe weekly ceiling and warns before a new goal pushes the load too high. See *Time budget* below for the numbers.

### XP & rewards
| Action | XP |
| :--- | :--- |
| First check-in of the day | +10 |
| Study time logged | +10 per 30 min |
| Homework completed | +50 (+60 if High priority) |
| Chore ticked off | +10 daily / +25 weekly, set per chore |
| Diagnostic quest completed | +100 to +300 |
| School sanction logged by parent | −500 and Rewards Shop frozen |

XP is banked once. Homework ticked off inside a check-in is credited through the task itself, not twice.

**Pending reward requests reserve their cost.** The balance shown is what can actually be spent; XP
held against requests awaiting a parent's decision is displayed separately. Without this the shop
could be overdrawn — three 1,000 XP requests each passed the affordability check individually
against a 1,200 XP balance, and approving all three took the true balance to −1,800, which the
old `Math.max(0, …)` then displayed as a tidy zero.

The rewards catalogue runs from **50 XP** (pick tonight's dinner music, TV at the table) up to 5,000 XP,
sorted cheapest first, with a progress bar to the next affordable item. Small rewards matter: if the
cheapest thing on the shelf is ten days away, nothing reinforces the effort made today.

### Help & Careers
Opens on **How Genie works**: what each screen is for in the student's own language, plus how XP
works, how a streak survives one missed day but not two, and why a goal has to be locked before its
hours count. The same page opens once automatically on a first launch, so the tour can never
disagree with the help itself.

Behind it, the careers pathways, free revision sites and teacher directory — all three now editable
by a parent from the Parent Portal.

Beside the numbers the app expects people to act on — XP, the streak, subject health, a goal's
weekly hours, the workload gauge, committed-versus-capacity, the three check-in questions — there is
a small **i** that says what each one means. A number nobody understands is a number nobody trusts,
and an untrusted number gets ignored rather than questioned.

### Parent Portal (passphrase-protected)
Audit reports, rewards approval queue, sanction logger, backup/restore, CSV import/export, a
**Change History** of every mutation (deletes included) with its integrity check, proof-log storage
usage, and the passphrase form.

It is also where the things a family configures now live: the **student profile** (name, year,
school, headline target grade), the **chore list**, the **rewards catalogue**, and the **revision
sites and career pathways** that appear under Help & Careers. All of them used to be constants in
source.

**Prepare for launch** clears a fortnight of QA out before the app is handed over. The rule is one
sentence: everything that records *what happened* is cleared, everything that describes *the set-up*
is kept — so check-ins, reward requests, sanctions, marked work, photos, chore ticks, AI reports and
the change history go, while the timetable, subjects, syllabus, chores and the reward catalogue
stay, with the done-flags on homework, key dates, quests and topics reset. A topic's confidence
rating survives: that is a judgement someone made, not testing residue.

There is no XP counter to zero. XP and the streak are *derived* — XP from check-ins and completions
less sanctions and redemptions, the streak from check-in dates — so clearing the activity is what
resets them.

Two things sit on the line between activity and set-up. **The starter goals go back to draft** —
their wording is kept, only the lock is lifted — because a locked goal records a consultation that
has not happened yet, and its hours would start measuring the student against a budget he never
agreed. **The parent passphrase is kept unless the reset is asked to clear it**: a tick-box, off by
default, for the case where whoever holds it from launch day is not the person who set it during
testing. Ticking it returns the portal to unclaimed, and the next person to open it sets the
passphrase.

Three gates: a preview naming every row that will go, a rescue export downloaded before anything is
touched, and the word `RESET` typed out. Any goal that is not part of the seeded starting set is
named in the preview, because a stress-test goal left behind would distort the workload cap from
day one.

> The change history is tamper-**evident**, not tamper-proof. Rows are hash-chained per device, so
> edits, mid-chain deletions and tail truncation all fail the integrity check — but the hashes are
> unsigned, so someone who recomputes the whole chain after editing it would still pass. It is
> labelled accordingly in the UI.

> The parent passphrase gates the *interface*, not the data. Anyone who opens devtools can read and rewrite
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

## The material repository

Genie records *where* work lives; Google Drive holds the files.

```
GCSEAppWorkingFolder/
├── Mathematics/        Notes · Papers · Practice
├── English-Language/   …and the same three for every subject
├── …
├── _Shared-Resources/  anything spanning subjects
└── _Genie-Backups/     Genie's JSON exports
```

Each syllabus topic can hold its own material too — *Subjects & Goals* → a subject → **Material** on
any topic row. That opens a notes link (NotebookLM, a Doc, a file in the subject folder) and photo
capture for the things that would otherwise never get filed: a page of worked examples, a handout, a
diagram off the board. The button shows a count once a topic has anything attached.

Every subject links straight to its folder — *Subjects & Goals* → a subject → **Subject folder**.
A topic with no notes link of its own falls back to its subject's folder, so "open my notes" always
goes somewhere. All the links are editable per subject, so a folder that gets moved can be repointed
without a code change.

> **Why one link per subject rather than a base path?** Drive folder URLs are opaque IDs
> (`/drive/folders/1a2b3c…`), not paths — the Maths folder's link cannot be derived from the parent's.
> And the `G:\` path is Drive for Desktop, which a browser cannot open: Chrome blocks `file://` from
> an https page. So the path is shown for finding files in Explorer, and the URL is what's clickable.

Photos captured inside the app stay in the app's database and sync via Dexie Cloud — writing to
Drive needs upload permissions Genie doesn't ask for. Quick captures live in Genie; filed material
lives in Drive.

> ⚠️ `dexie-cloud.key` in the project root authorises administration of the cloud database. It is
> gitignored — **keep it that way**, and never paste it anywhere.

## Spreadsheets

**Parent Portal → Spreadsheets.** Export the whole app as one readable CSV — overview, subjects and
health, tasks, key dates, goals, marked work, quests, rewards, check-ins.

Import in bulk rather than typing a term of homework a row at a time: homework, timetable, key dates
and syllabus topics, each with a downloadable template. Imports always preview first and tell you
which rows were rejected and why.

## Backups

**Automatic backup** is set up under Parent Portal → Backup & Restore and is the path to prefer -
see *Automatic backups* above. **Export everything** remains for a manual copy: it writes a JSON
bundle covering every table. *Export without photos* produces a much smaller file.

> The JSON cannot carry photos - that is what `attachmentsOmitted` means. Mirror them to Drive from
> the same panel, or a restore will bring back every record and none of the evidence.

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
5. **The seeded timetable is a placeholder.** Both weeks are populated so the app is usable and the
   workload meter has something behind it, but the lesson pattern is invented, not Tejas's real
   timetable. Replace it via Quick Add's multi-day Lesson mode.
6. **Two things still cannot be edited.** Everything else can, as of the pre-launch QA pass. The
   subject *set* is fixed at nine - which subjects a student is entered for is not something the app
   should invent - though every field on one is editable. And a proposed goal's history is
   append-only: editing a goal rewrites the goal, and the previous wording lives only in the change
   history rather than on the goal itself.
7. **Assessment results don't feed the RAG score.** The subject average over marked papers is
   calculated and displayed, but the health score is still 40% homework / 35% remediations / 25% topic
   mastery. Folding attainment in would move every subject's status, so it's a deliberate decision
   left open rather than an oversight.
8. **Free-tier storage will bind eventually.** 75 MB of photo storage is roughly 250 downscaled
   images — about a year at a realistic rate. The Pro tier (€3/month) raises that to 20 GB. The Parent
   Portal shows current usage so the trend is visible.

## Testing

```bash
npm test          # vitest, once
npm run test:watch
```

Service-level tests run in Node with `fake-indexeddb` standing in for the browser's IndexedDB, so the **real schema, migrations and engines** are exercised rather than mocks. `db/index.ts` already guards the Dexie Cloud addon behind `typeof window !== 'undefined'`, so the sync layer stays out of the way.

Components are covered by `tsc` rather than a DOM harness: the logic lives in `services/`, and the components are thin renderers over it.

The suite deliberately includes the acceptance criteria from `docs/enhancement-spec.md`, not just unit behaviour — for example:

- a 3h cadets absence moves the baseline **44h → 41h**, and the explanation string says why;
- per-goal weekly hours can never exceed the capacity gauge's logged total, and both reset on the same Monday;
- the same absence logged on two devices offline merges to **one** row and one deduction;
- a subject with four weeks of declining hours shows a falling trend **while its RAG status is still green**;
- a handover reset clears activity while leaving every parent setting intact.

## Project layout

```
src/
├── components/
│   ├── shared/QuickAddSheet.tsx      # unified add AND edit - homework / key date / lesson
│   ├── shared/InfoTip.tsx            # the "i" beside a number the app never explained
│   ├── shared/ProofUploader.tsx      # photo & PDF capture, thumbnails, cleanup
│   ├── assessments/                   # Proof Log: entry modal + log view
│   ├── dashboard/                     # Home: what's next, check-in, schedule, quests
│   ├── tasks/  calendar/  goals/      # My Work, Key Dates, Subjects & Goals
│   ├── remediation/                   # Fix My Mistakes
│   ├── timetable/  rewards/  guidance/ # incl. How Genie works + first-run tour
│   ├── parent/                        # PIN + Parent Portal
│   └── layout/                        # Header, Navigation, SyncStatus chip
├── services/
│   ├── ragCalculator.ts               # subject health, XP ledger (incl. reservations)
│   ├── habitEngine.ts                 # streaks, never-miss-twice, heat-map
│   ├── goalProgress.ts                # locked goals vs the hours actually logged
│   ├── choreService.ts                # recurring jobs, idempotent per-day completions
│   ├── attachmentService.ts           # proof files: downscale, store, tally
│   ├── parentLockService.ts           # claim / unlock / change the passphrase
│   ├── auditService.ts                # hash-chained change log + field-level diffs
│   ├── burnoutEngine.ts               # weekly time budget
│   ├── llmAgentService.ts             # agentic audit (live + offline)
│   ├── backupService.ts               # schema-walking export, safe restore
│   ├── handoverService.ts             # preview + clear the QA activity before launch
├── hooks/useEscapeToClose.ts          # one Escape handler, layer-stacked (see below)
├── db/                                # Dexie schema (+ Dexie Cloud) + seed data
├── utils/date.ts                      # local-date helpers (see below)
├── utils/id.ts                        # globally unique record IDs (see below)
├── utils/credential.ts                # PBKDF2 passphrase hashing + lockout curve
├── utils/device.ts                    # stable per-browser id (never synced)
└── types/                             # shared type definitions
```

### Five traps worth knowing about

**Booleans cannot be indexed in IndexedDB.** Fields like `completed` and `isCompleted` appear in the Dexie schema strings but are never actually indexed, so `.where('completed').equals(0)` silently returns an empty array. Always filter booleans in memory: `.filter(t => !t.completed)`.

**Never build IDs from the clock.** `task_${Date.now()}` is unique on one device and nowhere else —
two devices creating a record in the same millisecond produce the same key, and a sync then keeps one
and destroys the other. Dexie Cloud requires primary keys with "sufficient entropy for global
uniqueness". Use `newId('task')` from `src/utils/id.ts`, which pairs a readable prefix with a UUID.

**A sheet flush with the bottom of the screen must clear the nav bar.** The mobile bottom bar is
`fixed` and paints over anything beneath it, so `pb-safe` alone leaves the last row of a bottom sheet
untappable — which is exactly how the More menu lost its second row. Use `pb-nav-safe`, which adds
the bar's height and collapses again above `md`, where the bar does not exist. Note that both
classes are defined *after* `@tailwind utilities`, so they beat a responsive `sm:pb-5` written
alongside them; that is why the breakpoint is handled inside the class itself.

**Escape belongs to the topmost layer only.** `useEscapeToClose(isOpen, onClose)` keeps a shared
stack, because a modal routinely opens the confirm dialog on top of itself and both listen on
`window` — without an ordering rule, one Escape cancels the confirm *and* closes the half-filled
form underneath it. The hook holds `onClose` in a ref and subscribes on `isOpen` alone, so a
background re-render cannot re-push a modal to the top of the stack. Call it above the
`if (!isOpen) return null` — a hook cannot be called conditionally.

**Never use `toISOString()` for "today".** It resolves in UTC, so during British Summer Time anything between 00:00 and 01:00 local returns the *previous* day — a check-in at 00:30 lands on yesterday and breaks the streak. Use the helpers in `src/utils/date.ts` (`todayISO`, `addDaysISO`, `daysUntil`, `formatFriendlyDate`, `formatCountdown`).

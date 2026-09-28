# UX findings

The open list of what gets in the way, kept by the `journey-tester` and
`data-consistency-auditor` agents and read by `release-gate`. An open
**blocker** stops a release; open **majors** are listed in every release
verdict so shipping over one is a decision, not an oversight.

Severity: **blocker** (a core journey cannot be completed, or data is wrong),
**major** (completed with real cost - lost detail, lost work, confusion that
leads to a wrong entry), **minor** (friction), **polish**.

Close a finding by moving it to *Closed* with the commit that fixed it. Never
delete one.

## Open

### Home

- **minor - Home is very long on a phone.** Ticker, six health signals, two
  banners, nine goal rows, capacity, today, what's next, check-in, streak,
  focus timer, schedule, then Fix My Mistakes. The two daily actions - the
  timer and the lesson list - are below the fold. Found 27 Sep 2026.

### Accessibility

- **minor - The "mark as done" tick in My Work has no accessible name.** The
  most-used control on the tab. `TaskManagerView.tsx:364`. Found by the e2e
  suite, 27 Sep 2026.
- **minor - The check-in dialog's close button has no accessible name.**
  `DailyCheckInModal.tsx:414`. Found by the e2e suite, 27 Sep 2026.
- **polish - The header check-in button's name includes an emoji**
  ("⚡ Check in"), which a screen reader reads aloud. `Header.tsx:141`. Found
  by the e2e suite, 27 Sep 2026.

### First run

- **polish - A new device opens on the welcome tour, covering everything.**
  Intended, and dismissable with "Got it"; noted because every journey on a
  new phone starts here. `WelcomeTourModal.tsx`. Found by the e2e suite, 27
  Sep 2026.

## Test suite health

- **Flake watch - "homework ticked in the check-in is closed with its audit
  line"** (phone) failed once in about seventy runs under full parallel load
  on 27 Sep 2026 and did not reproduce in the next 72. Every write in that path
  is awaited before the dialog closes, so no app fault is known; the spec now
  polls. If it fails again, keep the trace - `e2e-runner` should treat a second
  occurrence as real.
  - *Second occurrence, 27 Sep 2026*, during the release-gate's run - while
    the fix-up conversion was writing 11 tasks, 11 deletes and 11 audit rows
    on every page open, and while `QuickAddSheet` was being edited under the
    running dev server. Treated as real: the conversion no longer runs in the
    suite (quests are not seeded), and the spec was then run 120 times (5
    repeats, both layouts, full parallel load) with no failure. Still watched.
  - *Third occurrence, 28 Sep 2026*, full suite, phone, with nothing
    converting and nothing being edited - so the earlier explanations do not
    cover it. The trace narrows it: "Save it" was clicked and the dialog sat on
    **"Saving..."** for the whole 10s wait with no console error, so
    `applyCheckIn` started and did not finish - a slow or stalled write, not a
    missed tap or a lost close. It is a chain of about six awaited writes, each
    audit line a transaction held open over a SHA-256 by `Dexie.waitFor`. The
    only error in the page was "Startup housekeeping did not complete:
    DexieError2", 4s before the save, and not yet shown to be related. It then
    passed 30 of 30 alone. **Open, and now worth a real look:** if a save can
    stall under load for a tester, it can on a busy phone - where Tejas sees
    "Saving..." and closes the app. Trace kept in `test-results/` until the
    next run overwrites it.
  - *Looked into, 28 Sep 2026.* Reproducible on demand with CPU throttling:
    the save took about 0.5s normally but ten seconds at 8x slower, because
    it committed about eight times (check-in, attendance, each piece of work,
    an audit line after each) and every commit made Home re-read and redraw
    before the next write. It is now one transaction, which brought 8x down to
    under six seconds; `checkInSaveTransaction.test.ts` keeps it that way.
    Timed at 8x after the fix: about a second before the transaction starts,
    one to three seconds of writes, then about three seconds of redrawing
    before the dialog goes. Confetti and the forced Home refresh were each
    switched off and made no measurable difference. **Not eliminated:** one
    more stall, on the untouched check-in (one row and one audit line), in
    about 260 runs under parallel load after the fix. All of this is on the
    dev build, which is several times heavier than what the phone runs; how
    slow the production build is on a real phone has not been measured.
  - The "Startup housekeeping did not complete: DexieError2" line seen in
    every failing trace is most likely React's development double-run of
    effects: two `touchThisDevice` calls both find no device row and the
    second `add` fails. Dev only, not yet confirmed, not the cause of the stall.
- **Flake watch - "an answered lesson can be tagged to a topic in one tap"**
  (phone) failed once, 28 Sep 2026, in a full run that took 5.6 minutes
  against the usual 3.6: the "Same topic as the last lesson" suggestion had
  not appeared after 10s. It then passed 20 of 20 alone. The pending change
  was in closing fix-ups and does not touch the check-in. Same shape as the
  save flake - a check-in step slow under load - so if it recurs, look at what
  the suggestion waits on before calling it a flake.

## Data consistency

Nothing audited yet - the first `data-consistency-auditor` run goes here.

## Closed

- **minor - The same homework appeared twice in one check-in**, as committed
  work in the day list and again under "Homework completed", and could be
  ticked in either: closing it twice, or closing it with no time if the day
  list was the one ticked, since that list asked nothing and the homework list
  was where time was given. The day list's "Done" on committed work now asks
  the time (starting on the estimate) and offers the photo, under the row,
  which stays on screen once answered (`WorkRowClose`); the check-in's
  homework list leaves out whatever the day list asks about. The day's shape,
  and so every count, day bonus and week score, is unchanged. Fixed 28 Sep
  2026.

- **major - Details asked for depended on where a thing was created.** A
  fix-up from the add sheet read its subject as optional (Add stayed off
  without one), had no "what went wrong", fix or hint, and could name no
  topic; one from a marked paper put its mistake in the notes and named no
  goal or topic; the goal picker listed every goal in the house, which is how
  a Computer Science fix-up was filed under General. Now the add sheet asks a
  fix-up what went wrong in the open, with how to fix it and a hint under More
  options, both kinds of work can name a topic of their own subject, and the
  goal list is the chosen subject's (changing subject clears a goal from
  another). A marked paper's fix-ups carry what went wrong in its own field,
  the subject's agreed goal by the same rule as a converted quest
  (`agreedGoalFor`), and the topic the question names when it matches one
  exactly. Fixed 28 Sep 2026.

- **major - A subject tapped quickly was overwritten by the suggestion.** The
  suggestion is a database read that lands after the sheet opens, and it was
  applied whenever it arrived. A tap now always wins; a suggestion read for an
  earlier opening is ignored. The e2e spec holds the database so the tap is
  certain to come first, and fails on the old code. Fixed 28 Sep 2026.
- **minor - Subject chips toggled off, and said nothing when they did.**
  Tapping the suggested chip now agrees with it rather than clearing it; only
  a chip somebody chose clears on a second tap, and the hint then says "Pick a
  subject to add this". Chips carry `aria-pressed`. Same fix.

- **major - Topic pages read "Nothing recorded yet" beside work that exists**
  (History's "Economic Boom USA 1920s" beside "Ecenomic Boom USA" homework
  with photos). Work counted on a topic only through `linkedTopicId`, which
  nothing but a focus block's question ever set, and the untagged inbox never
  listed work. Work now sits in the inbox as "Work" and tags in bulk like
  the rest (`tagTaskToTopic`, with a history line), and a photo of work takes
  the work's topic unless the photo carries its own. Existing work still has
  to be tagged once - the inbox is where. Creating work still does not ask
  for a topic; that stays with the "details asked for" finding above. Fixed
  28 Sep 2026.

- **major - An evening class could not be added to the timetable** (reported
  27 Sep 2026: Monday art, 18:15-19:30). It saved, but looked as if it had
  not: the time boxes were behind "More options", the period defaulted to
  Registration, and it went to the week on screen only, so it was missing on
  the other. Times are now in the open under "When?", a time matching no
  period is labelled "Own time", "Which week?" sits under the days and
  defaults to every week, and the save says where the lesson went. Fixed in
  `fix: one kind of fix-up, and a timetable that takes an evening class`.
- **major - Fixed timetable blocks could not be moved anywhere.** Cadets,
  Drums, DofE and Art support had no edit button, and the Parent Portal
  changes only their name and hours. They can now be edited (day and time);
  removing one is still the Parent Portal's call. Same commit.

- **major - Fix-ups were two separate systems.** The 11 quests (1,900 XP,
  three written by Tejas) lived on their own screen with no due date and were
  never done. They are fix-up tasks now (`fixUpConversion`, run whenever a
  quest appears, idempotent, ids built from the quest id): due at the next
  mock, linked to the subject's agreed goal, carrying what went wrong, how to
  fix it, the hint and any photo. Closing a fix-up asks the quest dialog's
  questions - re-try score, working, what is still shaky - and a shaky part
  becomes a follow-up fix-up. Subject health reads fix-up tasks, which it never
  did. The quest screens are deleted. Rollout was gated twice (NO-GO both
  times) on sync: Dexie Cloud treats an insert as a whole-row upsert, so a
  device converting stale quests - before its first pull, or while signed out
  and then signing in - would overwrite the other device's fix-up work and its
  XP. A device now converts only when signed in and straight after a completed
  pull with a good licence; quests are no longer seeded. Fixed in `fix: one kind of fix-up, and a timetable
  that takes an evening class` (27 Sep 2026).
- **minor - Sub-quests all carried their parent's title.** Converted titles
  name the weak area: "Reparations & Treaty of Versailles Keyword Mastery:
  Lebensraum definition". Same commit.
- **minor - My Work did not update live.** Now a live query. Same commit.

- **major - Finished work counted towards no goal.** Goal hours came only
  from check-in minutes, one subject per check-in, so the week of 21 Sep
  finished thirteen pieces of work (about 9h by its own estimates) and read
  "3.3h of 21.5h - 7 of 9 goals behind". Closing work now asks how long it
  took, starting on its estimate, and never re-asks for time the focus timer
  recorded; `studyLedger` counts check-ins, focus blocks and finished work,
  and all seven screens that added up hours read from it. Work closed before
  this shipped (27 Sep 2026) keeps counting nothing, because its time is
  already in the check-ins of the time; a catch-up check-in dates its work time
  to the day it describes. All seven ways of closing work now go through one
  close sheet, so proof and time are asked wherever the tap happens - except
  the "committed work" row in the day's list, which closes the work without
  asking its time (the homework list below it asks). Fixed in `feat: finished
  work counts towards its goal, and every close asks the same two things` (27
  Sep 2026).

Unless noted, fixed in `fix: a focus block never costs the check-in, and PE is
not a lesson with a topic` (27 Sep 2026).

- **major - Timetable rows filed under General counted as lessons.** Tutor,
  PE, PSHE and "Clean up" were asked "Which topic?" and offered in the focus
  picker. One rule now, `teachesTopics` in `checkInOccurrenceService`, built on
  the existing `isNonExamSubject` and used by the lesson row, the focus picker
  and the topic view. Covered by unit and e2e
  tests. Fixed 27 Sep 2026.
- **major - A focus block cost the evening check-in its daily +10 XP.** The
  check-in counted timer rows as check-ins and said the base was "already
  banked" when it was not, and the outstanding list dropped "Do today's
  check-in" for the same reason. Timer rows are now left out of both. Found by
  the release-gate; fixed 27 Sep 2026, with tests shown to fail on the old
  code.
- **minor - "Due soon" had its own copy of "this week".** The check-in and
  the focus picker tested the stored bucket, missing a next-week task whose
  week had arrived. Both now use `isDueSoon` in `planService`, built on
  `inferBucket`. Found by the release-gate; fixed 27 Sep 2026.
- **minor - Homework ticked in the check-in closed with no audit line** and
  without settling a follow-up's comment. Now goes through
  `setTaskCompleted`. Found by the release-gate; fixed 27 Sep 2026, with an
  e2e test shown to fail on the old code.
- **polish - The check-in form's button guard did not read ProofUploader**,
  which now renders inside it. Added to `checklistButtons.test.ts`. Found by
  the release-gate; fixed 27 Sep 2026.

- **"Fractional Distillation and crude oil" filed under General** - moved to
  Chemistry through the edit sheet on 27 Sep 2026 (live data, no commit).

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

### Fix-ups and work

- **major - Fix-ups are two separate systems.** Fix-up *tasks* (from the +
  sheet and from marked papers) live in My Work. Fix-up *quests* - 11 live,
  1,900 XP, including three sub-quests Tejas wrote himself in Year 10 - live on
  a separate screen reached only from the Home card or a one-line link
  labelled "11 older quests from your Year 9 papers". Quests have no due date,
  so they never enter the week. None has been done. *Tejas persona, My Work →
  Fix-ups.* `RemediationHub.tsx`, `TaskManagerView.tsx:321`. Found 27 Sep 2026.
- **major - Details asked for depend on where a thing is created.** The same
  kind of record asks for different details on each screen. No creation path
  lets work be linked to a topic, although `Task.linkedTopicId` exists; a
  fix-up from the + sheet marks its subject *optional* and has no "what went
  wrong", no cause and no hint, while a quest has all three; closing a quest
  captures score, working and weak areas, closing a fix-up task only a photo,
  link or reason. The goal picker is not filtered by subject, which is how a
  Computer Science fix-up came to be filed under General. `QuickAddSheet.tsx`,
  `AssessmentEntryModal.tsx`, `assessmentService.ts:35`,
  `RemediationEditorModal.tsx`, `RemediationSolveModal.tsx`. Found 27 Sep 2026.
- **major - Topic pages read "Nothing recorded yet" beside work that exists.**
  Follows from the above: History's "Economic Boom USA 1920s" shows nothing
  while "Ecenomic Boom USA" homework with photos exists, and the
  "12-Mark Comparative Essay" topic has no link to the 12-mark essay quest.
  Found 27 Sep 2026.
- **minor - Sub-quests all carry their parent's title.** Three quests read
  "…(Targeted Sub-Quest)" identically; only the small deficit line tells them
  apart. `RemediationSolveModal.tsx:151`. Found 27 Sep 2026.

### Add sheet

- **major - A subject tapped quickly is overwritten by the suggestion.** The
  sheet sets a suggested subject from a database read that resolves after it
  opens (`suggestedSubjectId(...).then(setSubjectId)`), so a choice made first
  is replaced. Reproduced by the e2e suite. `QuickAddSheet.tsx:199`. Found 27
  Sep 2026.
- **minor - Subject chips toggle off, and say nothing when they do.** Tapping
  the already-suggested subject clears it; the only sign is the Add button
  greying out, beside a hint that says "Give it a name first" when a name is
  there. Chips expose no pressed state. `QuickAddSheet.tsx:565`. Found 27 Sep
  2026.

### Check-in and lessons

- **minor - The same homework appears twice in one check-in.** Work promised
  this week and due today is listed under "How did the day go?" as committed
  work and again under "Homework completed", and can be ticked in either.
  `DailyCheckInModal.tsx`, `dayPlan.ts`. Found by the e2e suite, 27 Sep 2026.

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

## Data consistency

Nothing audited yet - the first `data-consistency-auditor` run goes here.

## Closed

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

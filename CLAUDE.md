# Working on GCSE Genie

A local-first study planner for one family. Single student (Tejas, Year 10),
parent oversight, Dexie/IndexedDB with Dexie Cloud sync, deployed to GitHub
Pages. No backend of our own.

The conventions below are held consistently in the code but stated nowhere else.
Most were learned by getting them wrong.

## Commands

```
npm test              # vitest, ~930 tests, fake-indexeddb
npx tsc --noEmit      # typecheck; run before every commit
npm run build         # tsc && vite build
npm run dev           # localhost:3000/T2026GCSGenie/
npm run e2e           # Playwright, phone + desktop, starts the dev server
npm run e2e:phone     # phone layout only
npm run explore       # the journey tester's throwaway specs in e2e/explore/
```

The deploy workflow runs `npm run build` on push to `main` and nothing else.
`tests.yml` runs typecheck, unit and e2e on every push and PR, but does not
gate the deploy yet - a red run there blocks nothing, so read it.

## How code is written here

**Comments explain why, and name the failure.** This is the most distinctive
thing about the codebase and the easiest to get wrong by writing less. A comment
here is usually a paragraph that says what went wrong, what it cost, and what
would break if the code were written the obvious way. Read `weekWindow.ts` or
`weekExecution.ts` before writing anything substantial — they set the register.
Match the density of the file you are editing. Do not narrate what the code
does; the code already does that.

**Derived, not stored.** XP, week standings, day records and the evidence index
are all recomputed on read. A stored value needs invalidating from every place
that could change it, and the version that forgets pays the wrong number
forever. If you are tempted to cache something, check whether the thing it
depends on can change behind you — it usually can.

**One definition, in one place.** "This week" lives in `weekWindow`. What counts
as evidence lives in `evidenceService`, both directions. Which bucket a task is
in lives in `inferBucket`. What counts as study time, and which goal it is
credited to, lives in `studyLedger` - never add up `completedRevisionMinutes`
yourself. Closing a piece of work goes through `TaskCloseSheet` /
`setTaskCompleted`, never a raw `completed: true`. A fix-up is a task with
`isRemediation`; the `remediations` table only ever holds quests waiting to be
converted by `fixUpConversion`, and nothing should write to it. Two copies of a rule drift the moment either is
tuned, and the drift is silent — both screens keep working while describing
different things. When you find a second copy, delete it rather than keeping
them in step.

**One transport for every model call.** `llmClient` owns the endpoint, the auth,
the schema and the error sentence for all three providers; callers own their
prompts. This was three copies, and their prompts had drifted far enough that
the same week produced a differently shaped report depending on which key was
saved. If a caller needs a new question, that is a prompt — not a fourth copy of
the request.

**Never block; state the cost and record it.** A week can be over its headroom,
work can be closed with no evidence, a plan can be sent late. The app says what
that costs and lets the person decide. Refusing pushes the work somewhere the
app cannot see, which is worse than a recorded bad decision.

**XP is never taken back.** A bad week forfeits a bonus it had not yet earned;
it never deducts banked points. Sanctions are the one exception and are a
deliberate human act.

## Traps that have actually shipped

**Three date formatters, three questions.** `formatFriendlyDate` answers *how
soon* ("Tomorrow", "Overdue by 11 days"). `formatPastDate` answers *how long
ago*. `formatShortDate` answers *which date* and is safe anywhere. Picking the
wrong one has shipped four times, because all three return plausible strings —
"due Overdue by 11 days", "for the week of Today", a diary entry headed
"Overdue by 4 days". `dateLabels.test.ts` guards the two worst shapes.

Always use the local-date helpers in `utils/date.ts`. `toISOString()` resolves
in UTC and puts every Monday in the previous week for anyone east of Greenwich.

**A `<button>` with no `type` inside a form is a submit button.** The check-in
modal is a `<form>`, so a typeless button in the day checklist submitted and
closed the whole check-in on the first tap. `checklistButtons.test.ts` reads the
source to catch it. If you move those buttons, move the guard.

**Hooks go above every early return.** `WeeklyReviewModal` returns early in two
places; a `useLiveQuery` placed beside the value it feeds is a conditional hook.
`hookOrder.test.ts` catches it.

**A dialog opened from inside a card is not full-screen.** `.glass-card` carries
`backdrop-filter`, and an element with a filter becomes the containing block for
its `position: fixed` descendants. `MaterialViewer` opened as a 190px letterbox
with its footer clipped, and nothing about its markup was wrong — the cause was
three components up. Every other modal is mounted by `App`, which is why this
went so long without being met. Portal anything `fixed` to `document.body`.

**`window.open` after an `await` is a blocked popup.** A browser only treats it
as user-initiated inside the *synchronous* part of a click. `MaterialLink` reads
the attachment from the database first, so opening a tab there did nothing at
all: no tab, no error, no console warning. Hand the file to something on screen
and let a real click open it. `proofOpenable.test.ts` fails if `window.open(`
reappears in that component.

**Some read paths write.** `deviceLabelMap()` back-fills device registrations.
Calling it twice inside one `Promise.all` had both halves compute the same
backfill before either had written it — and inside a `useLiveQuery`, that write
invalidated the query that caused it. Check what a helper does before calling it
twice.

## Dexie

- **Booleans are never indexed.** Filter them in memory.
- **A new version is only needed when an index changes.** Optional unindexed
  fields read as `undefined` on old rows and need no migration. The schema
  history table in the architecture spec records both.
- **Build ids, do not generate them,** wherever two devices could write the same
  logical row: `${date}__${occurrenceKey}`, `${commitmentId}__${date}`,
  baselines keyed by the week's Monday. A random id means paying twice after an
  offline merge, and it looks like a sync fault rather than the modelling
  mistake it is.
- `driveSync` and `seedLedger` are unsynced on purpose — they hold
  device-specific state, as does `parentSettings.llmApiKey`. That last one has a
  consequence worth holding on to: reading a photograph can only happen on the
  device with the key, so anything derived from it (`materialInsights`) must
  sync, or the work happens on a laptop and never reaches the phone.
- Seeding only inserts rows the `seedLedger` has never offered, so a deleted
  starter row stays deleted.

## Testing

`src/test/harness.ts` gives `emptyDatabase()` (blank) and `resetDatabase()`
(blank plus seed). Freeze the clock with `vi.useFakeTimers({ toFake: ['Date'] })`
for anything week- or date-dependent — a fixture built from `todayISO()` will
pass on one weekday and fail on another, which has happened.

**Guard tests that read source files are a deliberate pattern**, not a hack.
They cover faults no type can see: a missing `type="button"`, a conditional
hook, a nav layer, the wrong date formatter. When the code they watch moves,
move them — a guard pointed at the old location still passes, which is worse
than no guard.

## End-to-end tests and the testing agents

`e2e/` drives the real app in Chromium at phone (Pixel 7) and desktop sizes.
`e2e/fixtures.ts` is the contract: every test starts on a fresh, empty
IndexedDB, with the clock pinned to Friday 25 September 2026 17:30 London,
every request to Dexie Cloud refused, and any uncaught page error failing the
test. Arrange with `insert()`, act through the screen, assert with `rows()`
as well as what is drawn. A new device opens on the welcome tour; `openApp()`
closes it.

Five agents in `.claude/agents/` share the work:

- `e2e-runner` - runs everything and triages failures (app / test / flake).
- `e2e-author` - writes specs for a new or changed journey.
- `journey-tester` - walks a journey as Tejas or a parent and files findings.
- `data-consistency-auditor` - checks numbers agree across screens and rows.
- `release-gate` - GO / NO-GO before a push to `main`, and verifies the deploy.

Findings live in `docs/testing/ux-findings.md`. An open blocker is a NO-GO.

Two rules the agents carry and so should you: tests run against localhost
only, never the live site - answering a lesson writes on the tap - and a hung
process is stopped by its PID, never by image name. `taskkill /IM node.exe`
stops every Node process on the machine, and it has been done.

## Deploying

Push to `main` → GitHub Actions builds and publishes to GitHub Pages
(`dilipcl.github.io/T2026GCSGenie`). The `github-pages` environment allows
deployments **only from `main`**, so a workflow change cannot be rehearsed on a
branch — a dispatch from one fails in about two seconds with zero steps. The
safety net is that a failed run publishes nothing and the previous bundle keeps
serving.

Verify a deploy by comparing the hash in the live `index.html` against
`dist/assets/`. This is not a PWA — no manifest, no service worker, nothing
caching the assets — so an ordinary reload gets the new bundle and there is no
service worker to go looking for when one appears not to. The corollary is that
a cold load needs the network, however offline-first the data layer is.

## Interface copy

Say the consequence rather than the rule: "a quiet week earns less — it never
costs you XP" rather than "bonus scaled by completion". Deferring work is framed
as planning rather than failing, and the backlog "counts towards nothing and
generates no guilt". The audience is a fourteen-year-old on a phone at night and
a parent who wants fewer arguments.

Prefer a date to a relative word anywhere two things are being compared. "Next
week" is ambiguous on a Sunday; "8 Sep – 14 Sep" cannot be misread.

Beyond that the house has no settled style — existing copy mixes sentence case
with shouted headings and the occasional exclamation mark. Match the screen you
are editing rather than imposing a rule.

## Environment

Windows, Git Bash. `LF will be replaced by CRLF` warnings from git are normal.

For the agent rather than the codebase: heredocs containing apostrophes break
mid-script here often enough that anything non-trivial is better written to a
file under the scratchpad directory and run from there.

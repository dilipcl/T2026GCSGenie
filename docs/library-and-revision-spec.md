# One place to see what has been captured — and a text layer under it

Status: draft for build · Date: 2026-09-26 · Baseline: `main` @ fa50e16

The ask, in the words it arrived in: the recorded content is hard to track or review, a single
dashboard with drill-down to individual materials is needed, the proof Tejas has uploaded cannot be
clicked, and the material he keeps adding should later feed an LLM that builds revision content and
sets mock tests. Both a parent and a fourteen-year-old have to be able to review what is already
there without exporting the database.

This spec reconciles that with `docs/tejas_gcse_genie_comprehensive_report.md` and with what is
actually in the code today. The report's corrections come first, because two of its diagnoses point
at the wrong layer and building from them would produce the wrong fix.

---

## Part 1 — Corrections to the report

| Report claim | Actual state | What the requirement becomes |
| :--- | :--- | :--- |
| Proof links cannot be opened because Drive backup is not connected, and the folder-handle transport never learns the URL | Half right, and the half it misses is the whole fix. The file is a `Blob` in `attachments` on the device that took it, and Dexie Cloud offloads and syncs blobs, so it is on the other devices too. `ProofUploader` already opens one with `URL.createObjectURL`. What breaks is one field: `evidenceService.filesFor` stamps `url` from `driveViewUrl` only and **drops the attachment id**, so `ActivityView`, `RecordView` and `EvidenceCheck` have nothing to open and honestly render an inert `<span>` instead. | Carry the id on `EvidenceRef` and open the blob. Not a Drive problem, and not blocked on Drive. |
| The fix list is deduplicate the timetable, add an inline camera, add a catch-up wizard, soften the burnout banner | All capture-side, and all defensible. None of them answers "I cannot review what is already recorded", which is the actual request. | Capture improvements stay on the list but move behind the review surface. |
| The evidence engine audits every completed piece of work | True, and it is already the single index — `evidenceIndex()` covers six entity types in both directions. | The dashboard needs a **second read of the same index**, organised by subject and topic rather than by gap. It does not need a new data model for proof. |
| (Not raised) | Every substantial piece of material named in the report — the *Jekyll & Hyde* homework, the RAM/ROM notes, the crude oil notes — is **handwriting in a photograph**. Nothing in the app has read a single one of them, and no field holds their content. | Revision sheets and mock tests are gated on a text layer that does not exist yet. That is the real long pole, not the dashboard. |
| (Not raised) | `llmApiKey` is in `unsyncedProperties` — deliberately, it must never leave the device. | Extraction and generation can only *run* from the device holding the key. Their **output has to sync**, or Tejas's phone gets a revision sheet it cannot see. |

Two further notes that change sequencing rather than design:

**The RAG matrix is currently lying, and the library will show why.** Chemistry reads 0/100 while
crude oil notes sit in Drive. Once material is browsable by subject, a screen that says a subject has
nothing while showing four photographs of it is worse than the present silence. The data corrections
in Part 6 are therefore not optional cleanup — they land with Phase 2 or the new screen contradicts
itself on its first open.

**Sync has to be alive for any of this to be a family-wide answer.** A photo taken on the laptop
reaches the phone through blob offload; an expired licence stops that and reports itself as being
offline. That failure has already cost a week (`CHANGELOG`, September 2026).

---

## Part 2 — Phase 1: every captured file opens (half a day)

The reported bug, fixed at its cause rather than per screen.

**`services/evidenceService.ts`** — `EvidenceRef` gains `attachmentId?`, `mimeType?`, `byteSize?`;
`filesFor` and the assessment branch fill them. Nothing else about the module changes: it still
reports whether proof *exists* and still refuses to claim it has followed a link.

**`components/shared/MaterialLink.tsx`** (new) — one chip that renders an `EvidenceRef` and knows
how to open it. The three states in the current code become four, and the correction is that two of
them were never unopenable:

| State | Openable | Badge |
| :--- | :--- | :--- |
| `driveViewUrl` present | Yes, anywhere, in a new tab | none |
| Blob present, mirrored to the Drive folder | **Yes, here** | `· in Drive folder` |
| Blob present, never mirrored | **Yes, here** | `· not backed up yet` |
| Row present, blob absent | No | `· on another device` |

Images open in a lightbox (`MaterialViewer.tsx`), PDFs in a tab. Object URLs are created on demand
and revoked on close — `ProofUploader` already sets the pattern and the reason: a term of photos held
open leaks megabytes.

**Call sites** — `ActivityView`, `RecordView`, `EvidenceCheck` and `EvidencePanel` all render the
same chip. `ProofUploader` keeps its own grid (it is an editor, not a reader) but routes its open
through `MaterialViewer` so there is one viewer.

**Guards** — `proofOpenable.test.ts`, a source-reading guard in the house pattern: assert that no
component renders an attachment ref as a bare `<span>`, and that `filesFor` carries the id. The fault
is invisible to the type system and has already shipped in four screens.

---

## Part 3 — Phase 2: the Library — one dashboard, three depths

**No new tab.** The bar already carries eleven. `PROOF` ("Proof Log") is `tier: 'weekly'` and holds
marked papers, which is one kind of material among five. It becomes **Library**, with marked papers
as a filter inside it. `AssessmentLogView` survives unchanged as that filter's body.

### `services/materialLibrary.ts` (new, derived)

One list, assembled on read from rows that already exist — the same discipline as the XP total and
`dayRecords`. Nothing is stored, so it cannot drift.

```ts
export type MaterialKind = 'FILE' | 'LINK' | 'NOTE' | 'PAPER';

export interface Material {
  id: string;                 // attachment id, or `${ownerType}__${ownerId}__link`
  kind: MaterialKind;
  subjectId?: SubjectId;
  topicId?: string;           // when tagged, or inferable from the owner
  unit?: string;              // from the topic, for grouping
  capturedOn: string;         // local ISO date — never toISOString()
  title: string;
  excerpt?: string;           // note text, caption, or teacher feedback
  ref?: EvidenceRef;          // what MaterialLink opens
  owner: { entity: EvidenceEntity | 'Lesson' | 'Check-in'; id: string; title: string };
  hasText: boolean;           // an insight exists — see Phase 3
}
```

Sources: `evidenceIndex()` for files and links on all six entity types; `checkInOccurrences.notes`
for what was covered in a lesson; `checkIns.structuredNotes` for `keyLearning` and blockers;
`assessments` for marked papers. The first two are the ones no screen has ever shown together, and
they are the only record of the seventeen days the report describes.

### Level 1 — coverage

Subject rows. Per subject: material count, last captured date, and how many of its completed topics
have nothing attached. Colour from `ragCalculator` so the two screens cannot disagree. This is the
screen that answers "what is in here", and it is also the honest answer to a gap: *"Chemistry —
4 items, last 21 Sep. 2 finished topics have nothing attached."*

### Level 2 — one subject

Newest first, grouped by unit where a topic is known and under **Not yet tagged** where it is not.
Filters: photos · links · lesson notes · marked papers · untagged. Search reuses
`evidenceService.matches` — every term must appear, for the reason already written there.

### Level 3 — one material

The lightbox. The file or the note in full, its caption, what it is attached to, who captured it and
when, and three actions:

- **Tag to a topic** — the field everything downstream needs.
- **Add a caption** — one line of what it is. Cheap, and it is what makes a photo findable.
- **Open the record it belongs to** — back into `TaskDetailPanel` or the topic checklist.

### Schema

`ProofAttachment.topicId?: string` and `CheckInOccurrence.topicId?: string`. Both optional and
unindexed, so they read as `undefined` on existing rows and **no Dexie version is required** — the
architecture spec's schema history table records that, and it should record this too. Filter by topic
in memory; the collections are small and a boolean-style index would buy nothing.

### Copy

Say the consequence. *"Nothing tagged to a topic yet — tagging is what lets Genie build revision
from it later"* rather than *"topicId is null"*. Dates over relative words wherever two things are
compared: `16 Sep`, not "last week".

---

## Part 4 — Phase 3: the text layer

This is the piece the report does not mention and everything downstream needs. A photograph of
handwriting is not content the app can do anything with; it is a file it can show you.

### One vision pass per file, stored

**`services/llmClient.ts`** (new) — provider selection, key handling, `describeHttpFailure` and the
browser-access header are lifted out of `llmAgentService` so the third and fourth caller do not each
grow a copy. `runAgenticAudit` moves onto it in the same commit; two copies of the auth path would
drift on the first key rotation.

**`services/materialInsightService.ts`** (new) — one call per file, structured output:

```ts
interface MaterialInsight {
  id: string;              // `${attachmentId}__${contentHash}` — built, never generated
  attachmentId: string;
  subjectId?: SubjectId;
  suggestedTopicTitle?: string;
  specPoints: string[];
  definitions: { term: string; meaning: string }[];
  keyFacts: string[];
  workedExamples: string[];
  legibility: 'CLEAR' | 'PARTIAL' | 'UNREADABLE';
  unreadableNote?: string;
  model: string;
  extractedAt: number;
}
```

Request shape: `claude-opus-5`, the blob as a base64 `image` block, `output_config.format` for the
schema, `thinking: { type: 'adaptive' }`. The existing 1600px / q0.72 downscale in
`attachmentService` is already close to ideal for this — a photo lands at roughly 1.1–1.6k input
tokens, so thirty of them is small change rather than a decision anybody needs to weigh.

**Why this one is stored, against the house rule.** "Derived, not stored" holds because a derived
value can be recomputed for free and a stored one goes stale behind you. Neither applies: an
extraction costs a paid network call, and the thing it derives from is an immutable blob. The staleness
risk is handled by putting a content hash in the id, so a replaced photo produces a new row rather
than a silently wrong old one. New synced table, `this.version(21).stores({ materialInsights: 'id,
attachmentId, subjectId, extractedAt' })` — synced because the key is not, and the point of extracting
is that Tejas's phone can read the result.

**Never block, and never invent.** `legibility: 'UNREADABLE'` is a real outcome and the UI says so —
*"Genie could not read this one. It is still your proof; it just cannot build questions from it."*
An extractor that guesses at unreadable handwriting produces a mock test on facts Tejas never wrote,
which is worse than a gap.

**Consent, once, in words.** The photos are a child's schoolwork with his name on them. Extraction is
opt-in per batch, from the Parent Portal, and the sheet says what leaves the device and to whom. The
key is already device-local; this is the part that is about the material rather than the credential.

---

## Part 5 — Phase 4: revision sheets and mock tests

Built from insights, **not from photographs**. Once the text layer exists a pack is a cheap text call,
and re-sending thirty images for every regeneration would make the feature too expensive to use twice.

**`services/revisionPackService.ts`** — given a subject and a set of topics, a pack of: definitions
and key facts consolidated across every material, ten recall questions with answers, and the gaps
worth filling before the next test. Stored with provenance — model, timestamp, and the material ids
it was built from — because the first question a parent asks of a generated revision sheet is whether
it came from Tejas's own work or from the model's general knowledge, and only stored provenance can
answer it.

**Mock tests close the loop into machinery that already exists.** A generated paper is sat, then
logged as an `Assessment` with its `questions` array filled — which means it flows into
`ragCalculator`, into the evidence index, and into the existing path that raises fix-ups from wrong
answers. A mock test that produced a PDF and nothing else would be a parallel, unmeasured world.

**Coverage honesty over padding.** Where a topic has one photograph, the pack says so — *"your notes
only support three questions here"* — rather than inventing seven. Same rule as the week that is over
its headroom: state the cost, let the person decide.

---

## Part 6 — The report's data corrections

Data, not code, and they belong with Phase 2 so the new screen does not contradict itself:

1. Mark `rem-history-1` complete against `att_a0735185` (+100 XP, already evidenced).
2. Close `"Ecenomic Boom USA"` and `"Crude Oil Revision"` against their existing attachments.
3. Add the two missing topics (*Jekyll & Hyde* ch. 2, CS primary storage) and tag the photos to them.
4. Move the eight academic goal target dates from `2026-09-09` to the exam series.
5. Prune the placeholder `odd-mon-p1..p5` / `odd-tue-p1..p5` timetable rows. Note that seeding only
   inserts rows the `seedLedger` has never offered, so a deleted starter row stays deleted.

One code guard is worth taking from the report: a Grade 9 goal saved with a target date before the
exam series should **say what it costs** — "this will read as expired from 10 Sep and flatten the
burndown" — and then save it anyway if that is what was meant. Refusing pushes the goal somewhere the
app cannot see.

---

## Sequencing

| Phase | Work | Size | Unblocks |
| :--- | :--- | :--- | :--- |
| 1 | `EvidenceRef.attachmentId`, `MaterialLink`, `MaterialViewer`, guard test | Half a day | The reported bug; every later screen |
| 2 | `materialLibrary`, Library view (3 depths), `topicId` tagging, data corrections | 2–3 days | Review by both people; tagging for Phase 3 |
| 3 | `llmClient` extraction, `materialInsightService`, v21, consent sheet | 1–2 days | Any generation at all |
| 4 | `revisionPackService`, mock tests into `Assessment` | 2 days | The original ambition |
| 5 | Capture-side work from the report: inline camera in the check-in, catch-up wizard, timetable prune | 1–2 days | Stops the library going thin again |

Phase 5 is last on purpose, and it is the one item here where that ordering is arguable. It is what
stops the problem recurring; it is also the part that is useless until somebody can see whether
capture is working, and that is Phase 2.

`npm test` and `npx tsc --noEmit` before each commit. Freeze the clock with
`vi.useFakeTimers({ toFake: ['Date'] })` in anything touching the library's date grouping — a fixture
built from `todayISO()` passes on one weekday and fails on another.

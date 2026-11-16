# Tasks: 11 dashboard, start and recording

_Written headlessly in Kiro CLI (claude-opus-5.5), 2026-11-16. Revised the same day (headless run, claude-sonnet-5.5) to apply every finding of `REVIEW.md`. Not yet approved by the founder; open questions are at the end._

One task at a time. Definition of done for each: prettier, typecheck, lint (0 warnings) and the touched package's tests green; UI tasks also pass their design check. **[kiro]** marks tasks suited to the headless `motionpop-builder` agent (pure logic, schemas, tests); they are logged in `KIRO_LOG.md`. The rest are done in the Kiro IDE or Claude Code and logged in their own log. **IDE** marks steps outside the builder agent's write paths (root files such as `firestore.rules`, `firestore.indexes.json`, `docs/**`, `.kiro/steering/**`, `.github/**`): the exact edit is in the task.

## Credits prerequisite (spec 13)

This spec calls spec 13's credit contract and adds no refund design. Before **paste-script voice generation** (tasks 17 and 18) runs on the hosted app, spec 13 must have landed:
- tasks 1 to 5: schemas, `costOf`, the pure ledger logic, the shared helper `services/render/src/store/ledger.ts` with `POST /api/credits/spend` and `/refund` (ledger ids `s-{key}` and `r-{key}`, refunds only for the caller's own spends within 15 minutes and `refundsPerDay`), and the emulator tests;
- task 8: `ServerCredits` and `useCredits`, the client of that route.

Until then, with Firebase on, Generate is **disabled with "Cloud AI is coming soon"** and nothing is stubbed (the first draft's "allowed, free" interim stub is gone). In local mode it is free. The dashboard chip uses `useCredits()`; if task 10 lands first it creates `lib/credits/use-credits.ts` read-only with the final signature and spec 13 task 8 extends it, so there is only one hook.

## Scope, risk and the cut order

Nov 25 scope: tasks 1–18 (with 4a and 6b) and 23–25. **Firestore sync (tasks 4a, 4b, 6, 6b, 7) is the largest risk.** If it slips, the dashboard runs on IndexedDB (R1.4, `IdbProjectRepository.list`) and the whole demo path still works; the account sync lands afterwards.

**Cut in this order if time runs short:** task 22 (cleanup toggle), task 13's list view and "Shared with me" tab content, task 16's inline hold-to-record (the mic then always opens `/start/record`), task 19 (voice previews), then **tasks 17–18 (paste-script TTS)**: the Script card stays but Generate is disabled with "Soon". Then, if sync is the cause, tasks 6, 6b and 7 (IDB only).

## A. Projects in the account

- [x] 1. **[kiro]** Schemas.
  - `packages/schemas/src/project.ts`: export the `z.object` as `EditorProjectBaseSchema` and make `EditorProjectSchema = EditorProjectBaseSchema.superRefine(...)` (no behaviour change; `.omit` does not exist on the refined schema). The base gains optional `ownerId` and `lastOpenedAt`. `Voiceover.source` already has `tts`; add optional `tts { voiceId, speed, script }` (data-model.md).
  - `packages/schemas/src/project-doc.ts`: `PosterSchema`, `ProjectDocSchema` **derived from the base schema** (design §2.1: `.omit` the arrays and `peaks`, `.extend` the summary fields; `status` is `draft | processing | ready`; no `exported`, `rendering` or `lastRenderId`), `TranscriptDocSchema`, `SlotDocSchema` and `VersionDocSchema` with `paramsJson`, `ProjectSummary`; `start.ts` (`StartDraftSchema`, `PendingIntakeSchema`, which holds a `ref`, not a blob). Export from `index.ts`.
  - Unit tests: valid docs parse; `readySlotCount > slotCount`, a title over 80 characters, a non-integer time, `peaks` on a project doc, `status: 'exported'` and an unknown `status` are rejected; every existing fixture still parses; **a field added to the base schema in the test (and `captions`, which spec 10 task 2b adds) survives `toDocs` → `fromDocs`**.
  - — R1.1, R1.7, R9.3
  - _Built (ship mode, 2026-11-17): `EditorProjectBaseSchema` + `ownerId?`, `lastOpenedAt?`, `Voiceover.tts?`; `project-doc.ts` with `PosterSchema`, `ProjectDocSchema` (derived, voiceover strict so `peaks` is rejected), `ProjectSummarySchema`; `start.ts`. Deferred to task 2: `TranscriptDocSchema`, `SlotDocSchema`, `VersionDocSchema` and the `toDocs`/`fromDocs` round-trip test (no Firestore path in this run)._
- [ ] 2. **[kiro]** `apps/web/lib/projects/project-docs.ts`: `toDocs`, `fromDocs`, `summarise`, `diffDocs` (design §2.2). Unit tests on the demo fixture plus fast-check properties 1–4 (round trip over random projects including `captions`, minimal diff after one random command from `lib/commands`, diff applies, summary honesty). — R1.1, R1.2, R1.7
- [x] 3. Extend `ProjectRepository` (`lib/projects/repository.ts`) with `list`, `subscribeList?`, `delete`, `duplicate`, `markOpened`; implement them in `MemoryProjectRepository` and `IdbProjectRepository` (list = summarise every stored project; delete removes the project and its audio; duplicate copies the audio, R1.9); tests with fake-indexeddb, including "deleting a duplicate leaves the original's audio readable". — R1.4, R1.5, R1.6, R1.9
  - _Built (ship mode, 2026-11-17): the new methods live on `ProjectLibrary extends ProjectRepository`, so the pipeline and test doubles that only save stay unchanged. Memory and IDB share `StoredProjectRepository` (`list` returns `{ projects, damaged }` so the dashboard can show damaged saves; `delete` removes the record first, then the audio of the current and backup copies; `duplicate` copies `src`/`originalSrc` blobs and rolls the copies back on failure, keeping slot and version ids because they are scoped to the project; `markOpened` does not rotate the backup). `summarise` is in `lib/projects/summary.ts` (no poster yet). `subscribeList` waits for the Firestore adapter (task 6). Tests: `lib/projects/library.test.ts` (memory + fake-indexeddb)._
- [ ] 4a. **IDE:** root-file edits for the rules and indexes. Run the rules through the Firebase MCP `firebase_validate_security_rules`; never deploy. **Prerequisite: spec 10 task 4a** (the explicit `transcript`, `slots`, `versions` and `chat` blocks and `projectOwnerAfter`) is applied first; this task does not repeat it. If spec 10 has not landed, apply that diff too.
  ```diff
  --- firestore.rules
  +++ firestore.rules
  @@ functions
  +    // The project document the dashboard lists and the editor saves (spec 11). `status` is written by the
  +    // client only; render state is derived from `renders` and is not stored here.
  +    function validProject(d) {
  +      return d.schemaVersion == 1
  +        && d.title is string && d.title.size() >= 1 && d.title.size() <= 80
  +        && d.createdAt is int && d.updatedAt is int && d.lastOpenedAt is int
  +        && d.status in ['draft', 'processing', 'ready'];
  +    }
  @@ match /projects/{pid}
  -      allow create: if signedIn() && request.resource.data.ownerId == request.auth.uid;
  +      allow create: if signedIn() && request.resource.data.ownerId == request.auth.uid
  +        && validProject(request.resource.data);
         allow read, delete: if signedIn() && resource.data.ownerId == request.auth.uid;
         allow update: if signedIn()
           && resource.data.ownerId == request.auth.uid
  -        && request.resource.data.ownerId == resource.data.ownerId;
  +        && request.resource.data.ownerId == resource.data.ownerId
  +        && validProject(request.resource.data);
  ```
  ```diff
  --- firestore.indexes.json
  +++ firestore.indexes.json
  -  "indexes": [],
  +  "indexes": [
  +    {
  +      "collectionGroup": "projects",
  +      "queryScope": "COLLECTION",
  +      "fields": [
  +        { "fieldPath": "ownerId", "order": "ASCENDING" },
  +        { "fieldPath": "updatedAt", "order": "DESCENDING" }
  +      ]
  +    },
  +    {
  +      "collectionGroup": "renders",
  +      "queryScope": "COLLECTION",
  +      "fields": [
  +        { "fieldPath": "ownerId", "order": "ASCENDING" },
  +        { "fieldPath": "status", "order": "ASCENDING" },
  +        { "fieldPath": "createdAt", "order": "DESCENDING" }
  +      ]
  +    }
  +  ],
  ```
  Spec 08's own `renders (ownerId, status)` index (its task 8, IDE) can sit beside these; do not duplicate it. The Storage rules need no change: `users/{uid}/audio/{file=**}` already covers `audio/{projectId}/…`. — R1.8, R5.4
- [ ] 4b. **[kiro]** Rules tests in `apps/web/rules/firestore.rules.test.ts`: owner create/read/update/delete; another user denied on the doc and on `slots`, `versions`, `transcript`, `chat`; create with someone else's `ownerId` denied; changing `ownerId` denied; a list query without the owner filter denied; an 81-character title denied; a `status` of `exported` denied; a first save of a new project (project document and 3 slots in one batch) succeeds; a 60-slot batch succeeds (if the emulator refuses it for the 20-access-call limit, add an `ownerId` field to every sub-document, change the rule to read it, and report it in the task note). **Update the existing `PROJECT` fixture of this file to a valid project document ("Changed by spec 11")**, since `validProject` now applies to its creates and updates. — R1.8
- [ ] 5. **[kiro]** Storage rules tests in `apps/web/rules/storage.rules.test.ts` for `users/{uid}/audio/{projectId}/voice-{hash16}.wav`: owner writes an `audio/wav` file and reads it back; another user can't read or write; `image/png` and a > 50 MB object are denied; delete by owner only. No rule change expected; if one is needed, say so in the commit. — R1.8
- [ ] 6. `FirestoreProjectRepository` (persistent local cache, `writeBatch` from `diffDocs` with the project document last, `list` + `subscribeList` on the index, `duplicate` with new ids and copied audio, `markOpened`; `delete` calls the route of task 6b) and `repository-provider.ts` (signed in → Firestore, else IDB). Re-check the Firestore cache API with Context7 first.
  - **Autosave flush (R10.2):** change `startAutosave` (`lib/stores/autosave.ts`) to return `{ flush, stop }` as in design §2.3; update `editor-screen.tsx` and the three callers in `editor.test.ts`; register `flush` in the editor store as `flushSave`. Test: `flush()` resolves only after the fake repository's `save` and the fake upload queue have both finished, and does not unsubscribe.
  - Emulator integration tests (`apps/web/rules/project-repository.emulator.test.ts`): save → load round trip, a one-slot edit writes 2 documents, list order, duplicate is independent (including its audio), `renderStatusOf` against real `renders` documents.
  - Wire the editor, autosave and Processing to the provider. — R1.1–R1.6, R1.9, R10.2
- [ ] 6b. The delete route `DELETE /api/projects/[id]` (`apps/web/app/api/projects/[id]/route.ts`; `verifyRequest`; owner check; Admin `recursiveDelete` of the project document, deletion of the project's `renders` and `shares` documents, deletion of the Storage prefixes `users/{uid}/audio/{id}/` and `users/{uid}/projects/{id}/`; idempotent, project document last). Emulator test (`apps/web/rules/project-delete.emulator.test.ts`): after the call no sub-collection document (including `chat`), no `renders` or `shares` document of the project and no Storage object remains, other projects are untouched, a non-owner gets 403, and a second call succeeds. — R1.6
- [ ] 7. `HybridAudioStore` + IDB-persisted upload queue with backoff (design §2.4): `put(blob, { projectId, kind })` stores at `users/{uid}/audio/{projectId}/{kind}-{hash16}.{ext}`, `copy`, `pending`; `loadVoice` resolves `storage:` refs; the editor's save indicator includes pending uploads ("Saving…", then "Couldn't upload audio · retrying"). **Export seam:** `resolveVoiceBlob` (spec 08 task 14) resolves `storage:` refs through `HybridAudioStore.get`, with a test that, once the editor's upload has finished, the export path uploads nothing (spec 08's hashed path already exists). Tests with a fake Storage: put returns before the upload ends, a failed upload retries and survives a new store instance, get falls back to Storage and caches, the path equals spec 08's `voicePathFor` shape, and a `put` of the same bytes twice gives one object. — R1.3

## B. Hand-off into Processing

- [x] 8. `lib/intake/pending.ts` (holds a `ref` to a blob already in the local `AudioStore`, plus `meta` and `draft` in `sessionStorage`, design §2.5); `PipelineInput` (`lib/pipeline/run.ts`) gains `title?`, `format?`, `styleId?`, `cleanup?`, `tts?` and source `tts`; `runPipeline` honours them (cleanup off skips the EDL but keeps the step card as "Skipped for generated voices") **and allocates the project id before the first audio `put`**; `/processing/new` takes a pending intake on mount and otherwise shows its drop zone. Extend `run.test.ts` for the new fields; a test that a new module instance (a reload) still resolves the pending intake. — R4.4, R7.1, R8.4, R9.3
  - _Built (ship mode, 2026-11-17): `setPending`/`setPendingRef`/`takePending`/`clearPending` plus `readDraft`/`writeDraft`. Deviation: the hand-off is cleared when Processing **succeeds** (not when it starts), so a reload mid-run restarts from the stored take; cancel, "Choose another file" and an intake rejection delete the take. `PipelineInput.storedRef` makes the stored take the original audio without a second copy, and a failed run leaves it for Retry. A pending sample re-uses `sampleWords()`. The id is allocated first; local `idb:` refs do not contain it yet (that is task 7's Storage path)._

## C. Dashboard

- [x] 9. **[kiro]** `lib/dashboard/greeting.ts`, `stats.ts`, `relative-time.ts`, `search.ts`, `copy.ts` (every exact string of the dashboard) and `lib/projects/render-status.ts` (`renderStatusOf`, design §2.3) with unit tests and properties 5 (stats sums, any time zone), 6 (one greeting per hour, night = 23..4) and 10 (render chip priority). — R2.2, R5.2, R5.3, R5.4
  - _Built (ship mode, 2026-11-17): `greeting.ts`, `copy.ts` (dashboard, Start and Recording strings) and `format.ts`, which holds stats, relative time, search, sort, `clock` and `formatSaved` in one module. One small example test file (`dashboard.test.ts`); properties 5, 6 and 10 are not written. `render-status.ts` is deferred with the Firestore `renders` query (local mode has no renders, so chips show the project status)._
- [x] 10. Dashboard shell at `/dashboard` (replaces `DashboardPlaceholder` in `components/auth/dashboard-placeholder.tsx`; `/` redirects here): top bar, avatar menu with Sign out, greeting with `Pip` (cursor look, nightcap at night, glow), footer, Help sheet (shared with Start), a `CreditsChip` with the new `variant="dashboard"` prop reading `useCredits()` (see the credits prerequisite; placeholder 120 in local mode), "Styles" toast. — R2
  - _Built (ship mode, 2026-11-17): `DashboardScreen` with `DashboardTopBar` (80 px, ember underline, "Styles" toast, `CreditsChip variant="dashboard"` on `useCreditsBalance()`, "+ New project" to `/start`, `AccountMenu` with Sign out), `GreetingHeader` (`greet` on `useNow()`, null during SSR so it never mismatches; nightcap at night; Pip has no pointer events), footer and `HelpSheet`. `/` redirects to `/dashboard`; the editor's "‹ Home" links there. The placeholder is deleted and `e2e/auth.spec.ts` follows the new greeting and the avatar-menu Sign out ("Changed by spec 11 task 10"). The capture bar arrives here as a visual with click-to-record and Enter-to-Start; task 16 adds hold-to-record. No `devSwitch` fixtures._
- [x] 11. Empty card (sleeping Pip on the cloud, waking on hover and click, CTA to `/start`) and the drop layer (window drag counter, whole-page dashed border, catching card in place or floating, intake validation with `validateIntake` from `lib/audio/intake.ts`, `caught` → Processing). Unit tests for the drag counter reducer. — R4
  - _Built (ship mode, 2026-11-17): `EmptyCard` (sleeping Pip on the cloud with the nightcap; hover shows the waking wink, click wakes him and focuses the capture bar) with its catching variant in place, `useFileDrop` (window drag counter, `Files` only, `validateIntake` through `handOffFile`, a one-line error toast on rejection, Pip `caught` for 600 ms, then `/processing/new`) and `DropOverlay` (dashed ember border as an SVG rect with dash 10/6 over the whole page; with projects a floating catching card over a 40 % scrim). The list comes from `useProjectList` over `IdbProjectRepository`. An untouched "Untitled Project" draft lets the file name title the project. The drag counter reducer has no unit test in this run (founder's ship-mode rule: tests only where data could be lost)._
- [ ] 12. `PosterPlayer` (lazy, one playing player at a time, **stills through a queue of at most 3 players**, 1.5 s fallback to the static poster, reduced motion = still), `StylePoster` stills for the five designed thumbnails, `apps/web/lib/motion/styles/*.sample.ts` for the built styles, and the Try a style row (live previews for built styles, `/start?style=`; toast for the others; "Explore styles ↗" toast). — R5.4–R5.7, R6
- [ ] 13. Full state: Continue card (highest `lastOpenedAt`, popcorn Pip, Resume), stat tiles with the new `Sparkline`, projects toolbar (count, search, sort, grid/list persisted in localStorage, tabs with the "Shared with me" empty state "Nothing shared with you yet."), project cards and rows (status chip from `renderStatusOf` over `use-project-list` and `use-renders`; `Rendering {p}%` from the active render's `progress`), ⋯ menu (Open, Rename, Duplicate, Delete with the confirm modal "Delete "{title}"?" / "This removes its graphics and voiceover. You can't undo this."; Delete disabled offline), the loading skeleton and the damaged-save card. — R5, R1.6

## D. Start, recording and script

- [ ] 14. `/start`: project top bar (rename, format pills, Brand kit toast, credits chip, Help, avatar), Pip with arcs, headline, the three cards, "Try a sample" line on the Upload card (deliberate deviation, design §0 #7), the single-graphic link toast, `StartDraft` in sessionStorage with `?style=`. Upload and drop go through intake → pending → Processing. — R7
- [ ] 15. `lib/audio/recorder.ts` + `recorder.worklet.ts` (capture, pause, device switch, 24 kHz WAV on stop; **the WAV is written to the local `AudioStore` the moment recording stops**, and the pending intake holds that ref) and **[kiro]**-style pure `level.ts` with property 8; `/start/record` screen (permission flow, mic selector, stop button, live waveform canvas, timer, feedback lines, Pause, Discard confirm, review state with play / "Use this take" / "Record again", 9:00 warning, 10:00 stop, keyboard map, mic-unplugged auto-pause, **a `beforeunload` warning while recording or reviewing**). Property 11 (a take survives a reload) over the fake IDB. — R8, R3.5
- [ ] 16. Capture bar: reducer (unit-tested), hold-to-record inline with the recorder, short press → `/start/record`, typing + Enter → `/start/script`, ⌘K focus, permission error with "Upload instead". — R3
- [ ] 17. `tts.generate` in `packages/ai`: `SpeechTaskDef`, router `speak()` (kill switch, zod input, audio-part check, usage event), Firebase provider `generateSpeech` (re-check the speech API and the Agent Platform backend with Context7 first), prompt `tts-generate.v1.ts`, chunking at sentence ends ≤ 1,500 characters, PCM concat + WAV (reuse `encodeWav` from `apps/web/lib/audio/wav.ts` with 24 000). **[kiro]** for the tests with a fake provider: kill switch blocks, a reply with no audio part is an error, chunk boundaries never split a word, the concatenated length equals the sum of chunk lengths plus the inserted silences. Moves spec 05 task 12 here (note added there). — R9.3, R9.7
- [ ] 18. `/start/script`: script editor with counts and the 3,000-character limit, moment underlines via `tagSpans(scriptWords(text))` (`scriptWords` is new, design §7), voice cards from `lib/script/voices.ts` (new `ttsVoices` field in `AppConfigSchema`, Remote Config key `tts_voices`, JSON decoded and zod-validated with typed defaults, plus a `parseRemoteConfig` test), speed "Relaxed / Natural / Brisk", cost chip from `estimate.ts` (`costOf('tts', ceil(estMs / 60 000))`, property 7), `copy.ts`, Generate → `ServerCredits.spend({ action: 'tts', units, refId })` → `speak` → pending intake → Processing, `ServerCredits.refund(txId)` + message on a failed call only, disabled states (offline, kill switch, out of credits through spec 13's modal, "Cloud AI is coming soon" while spec 13 has not landed). Measure once how far "Relaxed" and "Brisk" move the real duration and record it in D-065 and DEV_LOG or KIRO_LOG; adjust `wpm` defaults. — R9
- [ ] 19. _(needs the founder's go-ahead: about $0.01 of TTS)_ `apps/web/scripts/voice-previews.ts` generates one 4-second original line per voice into `apps/web/public/voices/`; record them in `docs/third-party.md` as generated audio. — R9.1

## E. Editor rail panels

- [ ] 20. Projects panel (design §12) in the spec 10 `LeftPanel` container (build the container here first if spec 10 task 1 is not done, and tick it there), calling the editor store's `flushSave()` (task 6) before switching. Voice and Projects replace their coming-soon panels from spec 10 task 1. — R10
- [ ] 21. Voice panel: source chip, duration, waveform, cleanup result, transcript with struck fillers and click-to-seek, Re-record / Replace audio with the new-take modal (new project via the start draft). — R11.1, R11.2
- [ ] 22. **[kiro]** `setCleanup(enabled)` command (design §12), the optional `Voiceover.cleanedSrc` / `EditorProject.cleanedTranscript` fields, `unmapTime` (new, the inverse of `mapTime` in `lib/audio/edl.ts`), and property 9 (off then on is identity; invariants kept or rejected unchanged) over random transcripts with fillers and pauses; then the toggle in the Voice panel. _(First to cut.)_ — R11.3

## F. Verification

- [ ] 23. **[kiro]** Playwright `apps/web/e2e/dashboard.spec.ts` in local mode: empty dashboard → "Create your first project" → Start → "Try a sample" → Processing → editor → "‹ Home" → the full dashboard shows the project card and the Continue card; drag a generated WAV onto the dashboard → Processing; `/start/record` with Chrome's fake mic → stop → reload → the take is still there → "Use this take" → Processing; `/start/script` shows the estimate and the chip, and Generate is disabled offline (`context.setOffline(true)`); **reduced motion emulated shows no floating, breathing or playing poster (R12.6)**; the text of every screen contains none of the forbidden names (R12.5); `?fixture=` is ignored by a production build (a unit test beside it); no page errors. — R3–R9, R12.2, R12.5, R12.6
- [ ] 24. Design check, dashboard (Chrome DevTools MCP): `resize_page` 1440×900, `navigate_page` to `/dashboard` in each state (fixtures behind `?fixture=empty|full|drag` through `devSwitch`, fixed clock at 23:30 so the night greeting matches), `take_screenshot` full page, compare with `projects-empty.png`, `projects-drag-over.png` and `projects.png` (1× exports, compare at device scale 1) region by region (top bar, header, capture bar, body, Try a style, footer) **within 2 px and the token colours (R12.1)**. Fix differences, re-check once, keep the screenshots and a contact sheet in the gitignored `.check/design/`, and log the findings. — R12.1
- [ ] 25. Design check, Start and Recording: the same procedure for `/start` against `start.png` and `/start/record?fixture=recording` (fake mic, frozen at 00:12.8) against `recording.png`. — R12.1
- [ ] 26. Same-language review (not designed): screenshots at 1440×900 of `/start/script`, the Projects panel and the Voice panel, with `screens.md` and `design-system.md` side by side; note and fix anything off-token. — R12.1, R12.3
- [ ] 27. Performance: a 50-project fixture on the emulator; dashboard interactive under 1.5 s on a warm cache with at most 3 poster players mounted at once; an instrumented Firestore wrapper asserts zero sub-document reads for the dashboard. Log the numbers; if 1.5 s is missed, switch posters to the static `StylePoster` and move the service-rendered thumbnail up from Later. — R12.4, R5.7
- [ ] 28. **IDE (after the founder approves the spec):** steering and decisions. Apply design §14 exactly (`data-model.md`, `design-system.md`, `ai-tasks.md` §8, `structure.md`); D-065 is already on this branch as a "proposed" entry in `docs/decisions.md`, change its status on approval. — workflow rule 1

## Later (not in the Nov 25 scope)

- Single-graphic mode behind "Or just make a single graphic →" (plan cut list #5).
- A real ⌘K command palette (cmdk).
- Moving IndexedDB projects from before sign-in into the account ("Move 2 local projects to your account").
- Sharing to other accounts ("Shared with me").
- Editable transcript in the Voice panel (word text edits flow into captions and reasons).
- Live dictation in the capture bar with the on-device Whisper worker.
- Per-project thumbnails rendered by the render service instead of live posters (the fallback of task 27).
- Local-mode render chips (offline-mode renders have no `renders` documents).

## Open questions for the founder

1. Is 5 minutes saved per ready graphic the figure you want behind "~1h 10m saved"? (D-065 #12)
2. OK to spend about $0.01 generating the four voice preview clips (task 19)?
3. The Try-a-style row follows the design (five named styles); three are not built yet and show stills. Do you want `field-notes` in the row instead of one of them until spec 14?
4. "Try a sample" on the Upload card is a small deviation from `start.png`. Happy with that spot?
5. Opening a project on a second device needs a CORS rule on the Storage bucket (`gsutil cors set` with the app's origins). It is a production configuration change, so it waits for your approval. Until then audio plays only on the device that recorded or uploaded it.

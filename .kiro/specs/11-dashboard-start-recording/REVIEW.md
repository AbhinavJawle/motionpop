# 11 · Dashboard, start and recording: spec review

_Reviewer: `spec-reviewer` (read-only), model claude-sonnet-5.5, 2026-11-16. Read: `requirements.md`, `design.md`, `tasks.md`, the steering files that apply, `docs/decisions.md` (D-034 to D-036 are "proposed" entries), `firestore.rules`, `storage.rules`, `.github/workflows/ci.yml`, spec 08's design and tasks, specs 10 and 12, and the code this spec reuses. I had no shell, so I could not run git or the tests. Specs 09 and 13 have no folder yet (`.kiro/specs/` holds 00 to 08, 10, 11, 12), so those seams are checked against `docs/plan.md`, the steering files and what specs 08, 10 and 11 assume._

## Verdict: ready after fixes

The spec is thorough. Requirements are numbered and testable, every requirement maps to a task, the pure logic has named properties, and the failure table is honest. Six findings would cause rework or a hole if left as written (F1 to F6). Fix them before task 1. The rest can be fixed on the way.

## Findings

### High

**F1. The credit contract is scheduled after the specs that need it, and a client-callable `refund` can be abused.**
- Evidence: design §8 and R9.3 to R9.5 call `spend(task, credits, refId)` and `refund(refId)` from "spec 13". `docs/plan.md` dates spec 11 on Nov 25 and spec 13 on Nov 27 (feature freeze). Task 18 says that with Firebase on, Generate stays disabled with "Credits are on their way" until 13 lands. So paste-script TTS cannot run in the hosted demo for the first two days of its life. Specs 09 (Nov 23; the Inspector's Generate button still says "Cloud generation is on its way", so it is probably the first caller) and 10 (task 11) wait on the same contract.
- The abuse: the TTS call runs in the browser through AI Logic. The server cannot see whether it succeeded. A user can `spend`, keep the audio, then `refund`. Or skip `spend` altogether, because AI Logic is not gated by the ledger. Nothing in design §8 says how the server limits this.
- Fix:
  1. Move "the spend/refund route, the ledger ids, `useCredits` and the rules test" out of spec 13 into a small first task of spec 13 that lands **before** spec 09's Generate (Nov 23). Spec 11 task 18 then drops its interim stub.
  2. Write the threat model into design §8 and D-034. Suggested rules: the ledger doc ids are `spend-{refId}` and `refund-{refId}`, as spec 08 does with `export-{renderId}` and `refund-{renderId}`. A refund needs an existing spend and no existing refund. A refund is allowed only within 10 minutes of the spend and counts against a per-day refund cap. Say plainly that a browser-side AI call cannot be fully enforced, and that this is why the cap and the hourly rate limit exist.
  3. Make `refId` unique per attempt (`{scriptHash}-{attempt}`). With fixed ledger ids, a second `spend` on a refunded `refId` is impossible, so "Retry" in R9.4 would fail. Spec 08's `isSafeId` regex (`^[A-Za-z0-9_-]{1,128}$`) is the id shape to follow. Spec 10 uses `msgId:step.id`, which that regex rejects.

**F2. Duplicate and Delete share audio and miss other data.**
- Evidence: design §2.3 `duplicate` creates new ids "for project, slots, versions" and says nothing about the voiceover, so the copy points at the same `storage:` object. R1.6 and the open delete flow remove "its audio objects". Deleting either copy then breaks the other.
- Delete also leaves behind: `chat` documents (spec 10), the `renders/{id}` documents (server-written, so a client cannot delete them), `renders/*` and `bed/*` objects in Storage (spec 08, spec 12), `music-*.wav` (spec 12), `originalSrc`, and `cleanedSrc`.
- Fix: in task 6, `duplicate` copies the audio objects to new keys (Storage copy or re-upload from the local copy). `delete` lists the sub-collections explicitly (`transcript`, `slots`, `versions`, `chat`) and deletes every `voiceover.*Src` and `audio.musicSrc` object. Add a server route `DELETE /api/projects/{id}` (Admin) for `renders`, `shares` and the Storage prefix `users/{uid}/projects/{id}/`, or list them under "Later" with the leak stated. Add a test that deleting a duplicate leaves the original playable.

**F3. Nobody owns `status` and `lastRenderId` on the project document.**
- Evidence: `ProjectDocSchema` has `status: …'rendering'|'exported'` and `lastRenderId`; R5.4 shows "Rendering {p}%" from `renders/{lastRenderId}`. Spec 08's "Later" list defers `lastRenderId` "to spec 11, once projects live in Firestore". Spec 11 has no task that writes either field. Meanwhile the editor autosave (`diffDocs`) rewrites the whole project document, including `status`, from the editor's copy, which would overwrite a server-written `exported`.
- Fix (pick one and say it in D-034):
  - (a) **Derive, don't store.** The dashboard queries `renders` (`where ownerId == uid`, newest first; spec 08 already adds the `(ownerId, status)` index) and joins by `projectId`. Remove `exported`, `rendering` and `lastRenderId` from `ProjectDocSchema`.
  - (b) **Server-owned fields.** The render route (Admin) writes them. Rules reject client changes to those keys (`affectedKeys().hasOnly(...)` with them excluded). `toDocs` leaves them out of `diffDocs`. Add rules tests.
  - Option (a) needs no change in spec 08. Prefer it.

**F4. `[kiro]` task 4 edits root files the headless agent may not write.**
- Evidence: handoff §7 allows only `apps/`, `packages/`, `services/`, `skills/`, `.kiro/specs/`. Task 4 edits `firestore.rules` and `firestore.indexes.json`. Task 5 only adds tests, which is fine. Spec 08's review F3 found the same pattern.
- Fix: split task 4. The test file stays `[kiro]`. The rule and index edits are marked "IDE" and run first.

**F5. The audio path conflicts with spec 08, and the stated reason is wrong.**
- Evidence: this spec stores audio at `users/{uid}/audio/{key}.wav` and resolves it through a new `HybridAudioStore`. Spec 08 §3 step 2 uploads the voice itself to `users/{uid}/audio/{projectId}/voice-{hash16}.{ext}` and the route requires `voicePath` to equal `voicePathFor(uid, project.id)`. Spec 08's `resolveVoiceBlob` only knows `idb:` and `synth:` refs. Result: every first export uploads up to 28 MB again into a second object. D-034 #1 says "export needs the audio in Storage"; spec 08 already does that.
- Fix: one rule for the whole product. Either this spec stores the voice at spec 08's path (hash computed in `put`), or spec 08's route accepts any object under the caller's `users/{uid}/audio/` that passes the id regex and the existence and size checks. In both cases `resolveVoiceBlob` calls `HybridAudioStore.get`. Record it in D-034 and add a line to spec 08's voice-upload task. Correct the D-034 rationale: the real reasons are the dashboard list and multi-device use.

**F6. `flushAutosave()` does not exist.**
- Evidence: R10.2 and design §12 call it as if it were there. In the repo, `startAutosave` (`apps/web/lib/stores/autosave.ts`) returns one function that "stops autosave and flushes", held in a `useEffect` cleanup in `editor-screen.tsx`. No task creates a callable flush.
- Fix: task 6 or 20 exposes `flush(): Promise<void>` from the autosave module through the editor store, with a test that it resolves after the repository write (including pending uploads for the `Saving…` state).

### Medium

**F7. Decision id clash with spec 08 (D-034).**
- Evidence: `docs/decisions.md` already holds D-034 (this spec), D-035 (spec 10) and D-036 (spec 12), all "proposed". Spec 08 still plans its own D-034 in `design.md` lines 34, 367, 636 and 656, `tasks.md` lines 29, 42, 213 and 215, and `REVIEW.md` lines 3 and 102. Its REVIEW said D-034 was free; it no longer is.
- Fix: renumber spec 08's decision to **D-037** (next free). Specs 09 and 13 take D-038 and later. Add a "reserved ids" line at the top of `docs/decisions.md` so parallel headless runs stop colliding. Spec 11 keeps D-034.

**F8. Scope for one day, and the cut order misses the paste-script TTS path.**
- Evidence: the Nov 25 scope is tasks 1 to 18 and 23 to 25 (21 tasks, about 7 of them the account sync). `docs/plan.md` §2.5 lists paste-script TTS as cut #6, but the "Cut in this order" line in `tasks.md` does not mention tasks 17 to 19 except the voice previews.
- Fix: add "task 18's TTS (17 to 19) falls back to the screen with Generate disabled and 'Soon'" to the cut order, after task 22. Add "if the Firestore repository (tasks 6 and 7) slips, the dashboard runs on IDB (R1.4) and the demo path still works". State that Firestore sync is the largest risk.

**F9. A finished take lives only in memory.**
- Evidence: design §2.5 `lib/intake/pending.ts` holds `{ blob, meta, draft }` in memory only; §6 keeps Float32 chunks in the main thread. A reload or crash during a 10-minute take, or between "Use this take" and the end of Processing, loses it. R8.1 promises "Your recording stays here until you're ready".
- Fix: on stop, `put` the WAV into the local `AudioStore` and keep only the ref in `pending`. Add a `beforeunload` warning while recording. A unit test: stop, reload (new module instance), the take is still there.

**F10. `ProjectDocSchema` will silently drop spec 12's fields.**
- Evidence: design §2.1 lists the fields by hand and a comment says "spec 12 adds `captions` and `audio` here". Zod strips unknown keys on parse. If spec 11 lands first (it does: Nov 25), saving a project would lose `captions` and `audio` once `EditorProject` has them. Spec 12 task 1 only adds them "if it exists".
- Fix: build `ProjectDocSchema` from `EditorProjectSchema` (`.omit` the arrays and `peaks`) so new project fields flow through automatically, and keep round-trip property 1 over random projects that include the spec 12 fields.

**F11. One credits hook, not three.**
- Evidence: spec 11 task 10 builds `useCredits()`, spec 08 design §12 builds `useCreditBalance()` ("the only spec 13 piece pulled forward"), and the top bar still has `CREDITS_PLACEHOLDER = 120` (`apps/web/components/editor/top-bar.tsx`). Two hooks over the same document will drift.
- Fix: the hook is built once in the spec 13 contract task from F1; specs 08 and 11 import it. Until then the first of them to land owns it and the other imports it.

**F12. Dashboard posters could load many iframes.**
- Evidence: design §3: a still means an iframe per card that seeks to `keyMomentMs`. R12.4 requires "interactive within 1.5 s with 50 projects". Lazy mounting helps, but a 3-column grid shows 6 to 9 cards at once.
- Fix: say how many players mount at once for stills (suggest at most 3, queued), and measure it in task 27. The service-rendered thumbnail is already in "Later"; point to it as the fallback if the budget is missed.

### Low

- **F13.** R12.1 says screens "SHALL match" the PNG with no tolerance. Add one ("every measured region within 2 px, colours within the token"). R12.5 and R12.3 have no automated check; add a string scan of the UI for provider and voice names, and a reduced-motion pass over the empty state. Clarify that R12.5 does not forbid "on-device AI" wording in the Help sheet.
- **F14.** The `?fixture=` and `?ai=fake` query switches (task 24 here, task 12 in spec 10) must be compiled out of production. Add one test that a production build ignores them, as spec 08 does with `renderMode()`.
- **F15.** Task 6's emulator integration tests should live under `apps/web/rules/*.emulator.test.ts` so the existing `rules` CI job runs them.
- **F16.** The wake-up and drop copy strings are exact; add them to a single `copy.ts` so tests assert them once.

## Checks that passed

- **EARS and numbering:** all 12 groups are numbered; criteria are WHEN/IF/WHILE or ubiquitous SHALL and are testable except as noted in F13.
- **Traceability:** every requirement group has at least one task (R1 → 1 to 7, R2 → 10, R3 → 16, R4 → 11, R5 → 12 and 13, R6 → 12, R7 → 14, R8 → 15, R9 → 17 to 19, R10 → 20, R11 → 21 and 22, R12 → 23 to 27). Every task cites requirement ids.
- **Steering:** zod at every boundary; integer milliseconds (epoch ms stored as integers); no GSAP; designs are the source of truth with deviations declared (D-034 #7); screens without a design reuse existing language (§12 of the handoff); TTS is `ONLY_IN_CLOUD` with the violet chip, as `hybrid-ai.md` requires; `tts.generate` costs 2 per started minute, as `ai-tasks.md` §8 says; the 3 000 character cap and 50 MB limits match `security-and-cost.md`.
- **Reality:** these exist as the design says: `validateIntake`, `runPipeline`, `loadVoice`, `buildEdl`, `mapTime`, `AudioStore` (`idb:` refs), `encodeWav` (default 22 050 Hz, so call it with 24 000), `tagSpans`, `UserSettings.defaultFormat`, `CreditReasonSchema` with `tts`, `Voiceover.source` with `tts`, the `rules` and `e2e` CI jobs, and the design PNGs and CSS frames (the line numbers 43809 and 80671 match). These are new and declared as new: `ProjectRepository.list/delete/duplicate/markOpened`, `unmapTime`, `HybridAudioStore`, `speak()`. `flushAutosave` is **not** declared as new (F6).
- **Testing:** nine named properties each have an owning task; rules tests for projects and Storage; an e2e; three design checks; a performance task.

## Seams

- **Spec 08 (export):** F5, F3, F2 and F11 above. Also: spec 08's route validates `EditorProjectSchema` on the snapshot; the new optional fields (`ownerId`, `lastOpenedAt`) must be optional there, which the design says.
- **Spec 09 (inspector and quick edits):** it has no folder yet. Its cloud Generate (3 credits) is, from the plan and the Inspector's current tooltip, the first caller of the spend contract and lands before this spec, so F1 applies to it first. Its cloud fallback for `edit.patch` needs the credit reason `edit`, which spec 10 task 2 plans to add; one spec should own it (the contract task).
- **Spec 10:** both specs need the left-panel container. This spec correctly defers to spec 10 task 1. The chat repository (spec 10 task 8) follows spec 11 task 6's provider; delete must also remove `chat` (F2).
- **Spec 12:** `ProjectDocSchema` needs `captions` and `audio` (F10); delete and duplicate must handle `audio.musicSrc` (F2).
- **Spec 13:** F1 and F11. This spec calls the contract; the contract must exist first.

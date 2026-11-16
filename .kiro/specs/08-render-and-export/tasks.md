# 08 · Render and export — tasks

_Written by Kiro CLI (headless, `motionpop-builder`, claude-opus-5.5) on 2026-11-16. Revised the same day (headless run, claude-sonnet-5.5) to apply every finding of `REVIEW.md`. Implementation starts after the founder approves `requirements.md` and `design.md`; the overnight run implements tasks 1–3 only, on Claude Code's instruction._

One task at a time. Each task ends with the definition of done (`handoff.md` §5, with the §11 cadence): prettier, typecheck, lint with 0 warnings, and tests green, using `pnpm -s turbo run test --force` when another package's tests read the changed files. UI tasks also need the web build and Playwright. Commit with `feat(08-render-and-export): task N …`.

- **[kiro]** marks tasks for headless Kiro CLI runs (`motionpop-builder`), logged in `KIRO_LOG.md`.
- **[approval]** marks tasks that spend money or touch production; they wait for the founder. Until the founder approves, everything runs locally (`offline` and `emulator` modes).
- **IDE** marks steps outside the builder agent's write paths (`.github/**`, `.kiro/hooks/**`, `docs/**`, steering, `turbo.json`, `firestore.indexes.json`, rules edits): they run from the IDE or Claude Code. The builder may still run `pnpm add`, which changes `pnpm-lock.yaml`; that diff is expected.

**Demo path first:** tasks 1–19 give a working export in offline and emulator modes. Task 6a puts a cloud walking skeleton right after the job core, so the cloud risk is met early (review F2). Tasks 20–22 finish the cloud. **Cut order if time runs short:** task 17's share page down to a disabled "Copy share link" ("Soon"), then 720p (1080p only), then the progress button in the top bar (the modal alone shows progress). **Cannot be cut:** the cloud skeleton passing (task 6a): without it nothing runs for the judges.

Two standing rules:
- A bug found by a property test gets a regression test and a note in the log (`testing.md`).
- Never run `npx hyperframes events`, `firebase deploy` or `gcloud … deploy` from a task that isn't marked **[approval]**.

## 0. Before implementation

- [x] 0. **[kiro]** `spec-reviewer` reads this spec against `.kiro/steering/` (read-only) and lists gaps. Fixes go into the three files before task 1, and the review is logged in KIRO_LOG (`handoff.md` §9). Claude Code reviews the spec too when the founder is back in it. — all
  - _Done: `REVIEW.md` (verdict "ready after fixes", F1–F18). Every finding is applied in `requirements.md`, `design.md` (§25 maps them) and this file, on 2026-11-16. The review run is auto-logged in KIRO_LOG._

## A. Foundations

- [x] 1. **Spike (local, $0): the producer against our compositions.**
  - Using `scripts/skeleton.ts` and parity fixtures, check on 0.9.46:
    - `outputResolution` 720p from a 1080p composition in 16:9, 9:16 and 1:1 (works, or needs the ffmpeg scale fallback);
    - `quality` high vs standard, and `workers: 2` vs automatic, on an 18 s project (time and peak memory).
  - Use Context7 for the producer API first (`handoff.md` §9).
  - Record the numbers in the task note here, and draft D-034 for the IDE to enter (the builder agent can't write `docs/`).
  - 4K and transparent WebM are not checked here: they moved to "Later" (review F7).
  - — R3.3, NFR1
  - _Done 2026-11-16 (headless run, claude-sonnet-5.5; Context7 `/heygen-com/hyperframes` read first: `createRenderJob`, `executeRenderJob`, `outputResolution` presets, "render at smaller sizes" since 0.8.168). Script: `services/render/scripts/spike-output.ts` (`pnpm --filter @motionpop/render spike [outDir]`), $0, local. Machine: Apple Silicon arm64 laptop, macOS, Node 24, producer 0.9.46, ffmpeg from Homebrew, the `field-notes` look with `stat-punch` and `hook-statement` scenes and a 48 kHz sine as the voice. Peak memory is the summed resident size of node + Chrome + ffmpeg, sampled every 400 ms._
    - _**720p works natively, no ffmpeg fallback needed.** `outputResolution: landscape-720p | portrait-720p | square-720p` gave 1280×720, 720×1280 and 720×720 from the 1080p compositions, with the exact frame count (`msToFrame(4600) = 138`), 4.60 s, AAC audio present. A 720p frame matches the 1080p frame scaled to 1280×720 with a mean absolute difference of 0.57 %, so it is scaled, not cropped. Native 1080p: 1920×1080, 1080×1920 and 1080×1080, 138 frames each._
    - _**18 s, 16:9, 1080p (540 frames, exact, 18.00 s):**_
      | quality | workers | wall | file | peak memory |
      |---|---|---|---|---|
      | high | 2 | 23.3 s | 8.42 MB | 1329 MB |
      | high | auto | 40.5 s | 8.41 MB | 828 MB |
      | standard | 2 | 27.8 s | 6.23 MB | 1170 MB |
      | standard | auto | 41.7 s | 6.26 MB | 991 MB |
    - _`auto` picked 1 worker on this machine, so `workers: 2` is about 1.7× faster for 0.5 GB more memory. `high` was not slower than `standard` (23 s vs 28 s, one run each, so within noise) and gives sharper text at +35 % size, so the choice stays `quality: 'high'`, `workers: 2` as in design §8. The numbers are one run each on a 10-core laptop: Cloud Run (4 vCPU) timing comes from task 6a. NFR1's 45 s offline target is met by a wide margin (23 s for 18 s of video, 9–16 s for 4.6 s)._
    - _Draft D-034 lines for the IDE (the builder agent can't write `docs/`): "Export 720p uses the producer's `outputResolution` presets (verified on 0.9.46); 1080p is native. Renders use `quality: 'high'`, `workers: 2` (18 s 1080p: 23 s wall, 1.3 GB peak on a laptop)."_
    - _First-run cost: the first render of each process took ~16 s for a 4.6 s clip against 9–11 s for the following ones (Chrome and font warm-up), which is a hint for the cold-start measurement in 6a._
    - _Follow-up in design: §1.1 and §14 now say the 720p check passed. Checks: prettier, typecheck and lint on `services/render` (the script has no unit tests; it is a measurement tool)._
- [x] 2. **Schemas** in `packages/schemas/src/render.ts`, with unit tests:
  - `RenderOptions` (720p and 1080p only), `RenderRequest`, `RenderDoc` (with invariants), `RenderErrorCode`, `ShareDoc`, the API response and error schemas;
  - `exportCost`, `renderPaths`, `sanitizeFilename`, `canTransition`, `nextProgress`, `outputResolutionFor`, `exportAvailability` (image slots count as left out, review F5), `voicePathFor`, `isSafeId`;
  - the four config keys with typed defaults (`exportsEnabled`, `exportMaxMs`, `rendersPerUserPerDay`, `exportCredits`);
  - export `IntMsSchema` from `project.ts` (review F12);
  - `DailyLimitsSchema`: `planCloud` gets `.default(0)` and a `renders` counter with `.default(0)`. Keep the existing tests passing, and add cases for a day doc with only `renders` and a day doc with only `planCloud` (review F1);
  - `renderIdFor` and `newShareId` are not here: they need Node `crypto` and live in `services/render/src/store/ids.ts` (task 8).
  - — R1.8, R1.11, R2.4, R3.5, R4.1, R5.3, R8.5
  - _Done 2026-11-16 (headless run, claude-sonnet-5.5). `packages/schemas/src/render.ts` plus `render.test.ts` (new), and edits to `limits.ts`, `config.ts`, `project.ts` (exports `IntMsSchema`) and `index.ts`. Typecheck, lint (0 warnings) and `pnpm -s turbo run typecheck lint test --force` are green across all packages (schemas 155 tests)._
    - _Built as designed, with these specifics: `renderDocIssues` is the invariant check (queued ⇒ progress 0; done ⇒ progress 100 and `outputPath`; progress 100 only when done; an error code exactly when the status is `error`); `canTransition` rejects same-status moves, so progress-only updates are not transitions; `nextProgress` rounds, clamps and ignores non-numbers; `exportAvailability(project, { format }, { isRenderable, maxMs })` takes the component check as a callback (the schemas package can't see the registry), counts image slots (`params.images` non-empty) as left out, and returns `{ renderableIds, renderable, leftOut, reasons }` with reasons `nothing-to-render` and `too-long`; `renderPaths` also returns `inputDir`, and `video.mp4` is the only output name._
    - _Additions beyond the list: `RENDER_API_ERROR_STATUS` (HTTP status per API error, design §10), `isActiveStatus` and `isFinalStatus`, `ExportCreditsSchema`, and `sanitizeFilenameBase` (the idempotent part of `sanitizeFilename`)._
    - _`sanitizeFilename` decisions: strips control, format and line-separator characters (bidi overrides can fake an extension) but keeps the zero width joiner so emoji sequences survive; Windows device names (`CON`, `NUL`, `COM1`…) fall back to "motionpop video"; the cap is 80 UTF-16 units and never ends on half a surrogate pair; the function re-runs its pass until stable (at most 4 times), so idempotence holds by construction. Task 3 property-tests this._
    - _F1 done: `planCloud` and `renders` both `.default(0)`; `limits.test.ts` covers a doc with only `renders`, only `planCloud` and both. The existing plan-allowance code already writes with `merge`, so nothing else changed there. The emulator test of the whole sequence is in task 10._
    - _F12 done: `IntMsSchema` is exported from `project.ts`. Config: `exportsEnabled`, `exportMaxMs` (positive), `rendersPerUserPerDay` and `exportCredits` with Remote Config keys `exports_enabled`, `export_max_ms`, `renders_per_user_per_day`, `export_credits`; a bad value falls back to its own default (tests)._
    - _Not done here by design: `renderIdFor` and `newShareId` (task 8, `store/ids.ts`), and the Remote Config template in the Firebase console (IDE, with the founder; the typed defaults apply until then)._
- [x] 3. **[kiro]** Property tests for task 2:
  - P4 (pure transition and progress rules over random event sequences);
  - P6 (cost function);
  - P7 (paths and filenames, including hostile titles and ids);
  - a property that a day doc written by either path (`planCloud` only, `renders` only, both) parses with `DailyLimitsSchema` (review F1).
  - — R2.4, R4.1, R8.5
  - _Done 2026-11-16 (headless run, claude-sonnet-5.5). `packages/schemas/src/render.property.test.ts`, 23 properties at 300 runs each (also run once at 5000 runs: green). Schemas package: typecheck, lint (0 warnings) and 179 tests green._
    - _P4: `canTransition` equals the legal table of design §6 for all 25 status pairs; over random event sequences (moves to any status, progress values including NaN, infinities and out-of-range) only legal moves happen, final states absorb, progress never decreases and stays an integer, and every state satisfies `renderDocIssues` and `RenderDocSchema`; a clamped-and-rounded maximum model for `nextProgress`; idempotence. The event reducer lives in the test: the real store applies the same two functions (`canTransition`, `nextProgress`) in task 8._
    - _P6: at least the base cost, integer, equal to base × started minutes; monotonic in duration and in resolution (strictly with the default table, non-strictly with random tables); constant within a started minute and stepping up one millisecond after it; equal to the table value up to 60 s (18 s at 1080p is 5)._
    - _P7: paths stay under the render folder with no `..` or `//`, have exactly 7 segments, are injective in the three ids, and throw for any id that fails the id regex in any position; `sanitizeFilename` over random and hostile titles (separators, controls, bidi overrides, zero width characters, line separators, device names, header-injection strings, lone surrogates, 400-character strings): 1–80 characters, no reserved, control or invisible-format characters, no leading or trailing space or dot, never a device name, idempotent, NFC, and always encodable._
    - _Day doc (review F1): any combination of `planCloud` and `renders` parses with the missing one at 0; any interleaving of the two merge writers parses at every step and keeps each writer's own count; negative or fractional counters are rejected._
    - _**Bug found by the property tests (regression added, `render.test.ts`):** a lone surrogate (for example the title "\ud83d") survived `sanitizeFilename`, so `encodeURIComponent` would throw when the job builds the download header (design §8 step 7) and the render would fail at upload. Fixed in `render.ts` by also removing `\p{Cs}`. One property of my own was wrong, not the code: it asserted that a name never contains `..`, but a dot run inside a name is harmless once separators are gone (the counterexample was `nul..; filename=evil.exe`), so it now only asserts that a name is never `.` or `..`._
    - _`String.prototype.isWellFormed` isn't in the package's TypeScript lib, so the tests use a small local helper._
- [ ] 4. **One compile input for preview and render.**
  - Move `componentFor`, `sceneFor`, `isScene` and `schemaFor` to `packages/motion/src/registry.ts`.
  - Add `lookFor(styleId)` there: `looks[styleId] ?? stylePacks[styleId] ?? editorialExplainer`. The preview and the render both resolve the project's look through it (review F4). The editor has no look picker yet (the Styles panel is spec 14), so the style id comes from the project (`setStyle` command or fixtures).
  - Move `isRenderable`, `compileSlot` and `previewCompileInput` to `packages/motion/src/compiler/project.ts` as `projectCompileInput(project, { mode, format, background, voiceSrc })`, with format-aware `isRenderable` (image slots are not renderable for now).
  - `apps/web` re-exports from the old paths, so imports stay the same and the existing tests pass unchanged.
  - Smoke check that nothing moved in the output: `pnpm motion:check stat-punch` and `pnpm --filter @motionpop/render parity` give the same results as before the move.
  - — R3.2
- [ ] 5. **[kiro]** P9 property test (preview vs render input for random valid projects and every format, and the style id on the compile input equals the project's whenever `looks` or `stylePacks` knows it). Extend `scripts/parity.ts` with cases built from an `EditorProject` fixture through `projectCompileInput`, in 16:9, 9:16 and 1:1, including one `field-notes` case. — R3.2, NFR2

## B. The render job

- [ ] 6. **Job core** in `services/render/src/`:
  - `ports.ts` and `run-render.ts` (steps 1–9 of design §8);
  - input defence (review F8): re-validate `inputPath` and `voicePath` against `renderPaths` and `voicePathFor`, `ffprobe` the voice (one audio stream, bounded duration), re-encode it to WAV before it enters the composition;
  - `progress.ts` (status mapping and throttle);
  - `preflight.ts` (seeks with `window.__motionpop.seek(ms)`, review F9), `thumbnail.ts`, `compile-assets.ts`;
  - frame counts use `msToFrame` (review F13);
  - `store/memory.ts` and `fs-blobs.ts`.
  - Unit tests run with a fake preflight, producer and ffmpeg.
  - — R3.2–R3.9, R4.1, R4.2, R6.1, R6.4, R9.3
- [ ] 6a. **[approval]** **Cloud walking skeleton** (review F2). Writing the files needs no approval; steps 3–6 wait for the founder.
  1. `services/render/Dockerfile` (Node 24 slim, ffmpeg, Chrome libraries, non-root, `build:runtime` at build time) and `cloudbuild.yaml` (build, push, `gcloud run jobs deploy` with the design §17 sizing). The first container command runs the existing `scripts/skeleton.ts` flow, so it works before `job.ts` exists.
  2. Read the HyperFrames Cloud Run Dockerfile for the Chrome libraries; record any reuse in `docs/third-party.md` (IDE).
  3. After approval: create the Artifact Registry repository (cleanup policy: keep 2), the `render-job@` service account with its conditional Storage grant, and the launcher role on the App Hosting service account (check whether `roles/run.invoker` already covers run-with-overrides).
  4. Build, deploy the job, and run one execution by hand (`gcloud run jobs execute`). Confirm Chrome starts and the output lands in Storage.
  5. Call `jobs:run` with the `RENDER_ID` override from the web service account, and confirm the Admin credential's token works for `run.googleapis.com` (otherwise use the metadata server). Confirm the override reaches the container.
  6. Record the cold-start time, the first measured cost, `gcloud run jobs describe` (no scheduler, no always-on instance, `maxRetries 0`: R9.1) and any surprise in the task note.
  - Nothing here runs until the founder approves; until then, the task stays unchecked.
  - — R3.1, R8.3, R9.1, R9.2, NFR1
- [ ] 7. **[kiro]** Property and fault-injection tests for the job:
  - P8 (throttle over random callback streams and clocks);
  - for a failure injected at every step (inputs, voice probe, compile, preflight, producer, probe, thumbnail, upload), the render ends `error` with the step's code, exactly one refund, no files left in `workDir` and the input deleted;
  - a doc whose `voicePath` or `inputPath` points at another owner's object fails as `input-missing` without a read (review F8);
  - a voice that isn't decodable audio fails as `input-missing`;
  - a render swept mid-run aborts and cleans up;
  - a duplicate execution exits `skipped`.
  - — R3.7, R3.8, R3.9, R4.2, R6.1
- [ ] 8. **Firestore store and entry points:**
  - `store/logic.ts` and `store/firestore.ts` (`startExport`, `failRender`, `sweepIfStalled`, `FirestoreRenderStore`);
  - `store/ids.ts` (`renderIdFor`, `newShareId`) with unit tests: the share id is 22 base64url characters from `randomBytes(16)`, unique over many draws; the render id is stable for the same inputs (review F15);
  - `gcs-blobs.ts`;
  - the `@motionpop/render/store` subpath export, with a test that it never imports the producer;
  - **IDE:** the `renders (ownerId, status)` index in `firestore.indexes.json` (repo root, outside the builder's write paths);
  - `job.ts` (container entry);
  - `scripts/render-project.ts` (`render:project`, no Firebase).
  - Add `firebase-admin` and move `puppeteer` to dependencies (`pnpm add` moves `pnpm-lock.yaml`; expected).
  - — R2.5–R2.9, R3.1, R4.6, R7.5, R8.5
- [ ] 9. **Integration tests with the real producer** (they need ffmpeg and Chrome; skipped locally when missing, always run in CI):
  - a 2 s, 2-slot fixture in 16:9, 9:16 and 1:1 at 1080p, plus 16:9 at 720p: frame count (`msToFrame(durationMs) ± 1`), size, duration;
  - a voice beep lands within 1 frame (P10);
  - the preflight catches a slot whose build throws.
  - — R3.4, R3.6
- [ ] 10. **[kiro]** Emulator tests for the store (`apps/web/rules/export-tx.emulator.test.ts`):
  - P1, P2, P3 and P5 with fast-check over random concurrent sequences of start, fail, sweep and done for 1–3 users (small `numRuns`, so CI stays fast);
  - an idempotent replay;
  - the daily limit;
  - the active-render conflict;
  - the stalled sweep with a fake clock;
  - an export as the first action of the UTC day, followed by a plan-allowance call and a second export on the same day doc (review F1).
  - The Firebase MCP may be used to inspect emulator state while debugging; it never deploys.
  - — R2.5–R2.9, R4.6, R6.1

## C. Server

- [ ] 11. **`renderMode()` and the launchers:**
  - `cloudRunLauncher` (Admin API `jobs:run` with the `RENDER_ID` override; the token source was verified in task 6a, so this task codes what that check found; 15 s timeout);
  - `childProcessLauncher` (emulator);
  - `inProcessLauncher` (offline).
  - Tests: the request shape and errors with fetch mocked; P11 (production always gives `cloud`).
  - — R3.1, R7.1, R7.2, R7.4
- [ ] 12. **API routes:**
  - `POST /api/renders`, `POST /api/renders/[id]/check`, `GET /api/renders/[id]/download`, `POST /api/shares`;
  - the offline-only `local-renders` routes (create, status, file).
  - All bodies are parsed with zod, sizes and voice paths are checked, `captions` or `music` true is `invalid`, an id that fails the id regex is `invalid` (400, not 500), and every error code in design §10 is covered by handler tests with fakes.
  - — R2.1–R2.8, R4.6, R5.2, R5.3, R6.3, R7.3, R7.4, R8.2, R8.4
- [ ] 13. **[kiro]** Rules tests for every path this spec uses:
  - `renders/{id}` (owner read only, every client write denied, including field-level updates);
  - `shares/{id}` denied;
  - the ledger `export-*` and `refund-*` entries and `limits/{day}` not client-writable;
  - Storage: `…/renders/{rid}/input/project.json`, `video.mp4` and `thumb.jpg` (owner read, no client write, other users denied), and `users/{uid}/audio/{pid}/voice-*` (owner write within type and size, others denied).
  - The tests are the builder's. If a test shows a rule gap, report it in the task note: **IDE** fixes `firestore.rules` and `storage.rules` (review F3; the agent file lists them as writable, but `handoff.md` §7 does not).
  - — R8.1

## D. Client and UI

- [ ] 14. **Client plumbing:**
  - `render-client.ts` (cloud and offline);
  - `voice-upload.ts` (`resolveVoiceBlob`, hashed upload, skip when the object exists);
  - `useRenderJob` (with the 45 s check), `useActiveRender`, `useCreditBalance`;
  - the top-bar credits chip on the live balance (placeholder kept in offline mode).
  - — R1.4, R2.1, R4.4, R4.5, NFR3
- [ ] 15. **Export modal** (`components/export/`), exactly as design §13.1:
  - option groups as radio groups;
  - the cost row and its messages (ember cost line, R1.4);
  - "Soon" pills and disabled states for 4K, transparent, captions and music;
  - the left-out note (image slots included) and the offline state;
  - the thumbnail player;
  - focus trap, Esc and reduced motion.
  - Component tests for every availability state, and the accessibility assertion set of design §18: focus trap, Esc closes and returns focus, radio groups with arrow keys, switches with names, disabled controls explain themselves, reduced motion (review F18).
  - — R1.1–R1.9, R1.11–R1.13
- [ ] 16. **Progress and error states** (design §13.2):
  - the Pip states, the rolling percentage, the bar and stage lines;
  - closing keeps the render, and the top-bar Export button switches to its violet render state ("Rendering N%") and reopens the modal;
  - the "Your video is ready" toast when the modal is closed, and the error toast with "Retry";
  - error copy for every code, and "Try again" with a new request id.
  - — R4.3–R4.5, R6.2
- [ ] 17. **Ready modal, download, share** (design §13.3–13.4):
  - the file card with `thumb.jpg`;
  - "Download video" through the download route;
  - "Copy share link" with the clipboard and the "Link copied" toast;
  - the minimal `/share/[id]` page (server component, Admin reads, signed URLs, `noindex`, not-found state);
  - unit tests for the share page: the not-found state for a missing or revoked share and a missing render, the `robots: { index: false }` metadata, and that the signed URL comes from the server read (review F6).
  - — R5.1–R5.4
- [ ] 18. **Design check** at 1440×900 with Chrome DevTools MCP:
  - screenshot the export modal (16:9, 1080p, toggles as in the PNG), the progress, the ready and the error states;
  - compare them with `design/screens/export.png` and `export-ready.png` side by side, and fix differences (spacing, type sizes, colours);
  - log what was compared and what still differs in KIRO_LOG.
  - — R1.1, R5.1
- [ ] 19. **[kiro]** **E2E of the export path**, two specs (chromium project):
  - `apps/web/e2e/export.spec.ts`, offline mode: `/editor/demo` → Export → the modal shows the project card, "Local render · free" and 1080p preselected → pick 9:16 → Export video → the progress state appears and advances → the ready modal → Download → ffprobe on the downloaded file gives MP4, 1080×1920 and the project's duration ± 1 frame; a second test: an error path shows the error state and "Try again". The failure is injected through `MP_RENDER_FAKE_FAIL=producer`, which only `offlineDeps` reads (offline mode never runs in production, P11). A unit test checks that the cloud and emulator deps ignore it.
  - `apps/web/e2e/export-emulator.spec.ts`, emulator mode (review F6): sign in against the Auth emulator → Export → the balance drops by the cost shown → progress → ready → Download → Copy share link → open `/share/{id}` in a fresh context and see the video; a forced failure shows the error state and the balance comes back. It runs in the CI `rules` job (task 21), with the real job entry point as a child process.
  - — R1.1, R2.1, R2.5, R4.3, R5.1–R5.4, R6.2, R7.2, R7.3

## E. Ship it

- [ ] 20. **Container hardening and docs** (the Dockerfile and `cloudbuild.yaml` were written in task 6a):
  - switch the container command from the skeleton flow to `job.ts` and confirm the image builds with it (build only; deploying waits for task 22);
  - decide tsx at run time vs a bundled build, from the cold-start number measured in task 6a;
  - `services/render/README.md` (modes, commands, IAM);
  - **IDE:** `docs/third-party.md` entry if anything from the HyperFrames Dockerfile was reused.
  - No deploy in this task.
  - — R8.3, R9.1, R9.2
- [ ] 21. **CI and hooks (IDE; the builder agent can't write `.github/` or `.kiro/hooks/`).** Add a `render` job to `ci.yml`:
  - install ffmpeg (`apt-get`) and the Playwright browser (`pnpm --filter @motionpop/web exec playwright install --with-deps chromium`);
  - `pnpm --filter @motionpop/motion build:runtime`;
  - `pnpm --filter @motionpop/render test` (integration and preflight included);
  - `pnpm --filter @motionpop/render parity`;
  - `pnpm --filter @motionpop/web exec playwright test e2e/export.spec.ts --project=chromium`;
  - upload the parity stills and e2e traces on failure.
  - The `rules` job already runs the new emulator and rules tests; give it the Playwright browser too and run `e2e/export-emulator.spec.ts` there (review F6). Check the CI run after pushing (`handoff.md` §5).
  - Add an IDE hook in `.kiro/hooks/`: saving a file under `services/render/src/**` runs `pnpm --filter @motionpop/render test` (unit tests only; the integration tests stay in CI).
  - — testing, R3.6, NFR2
- [ ] 22. **[approval]** **Cloud smoke test and App Hosting packaging.** Task 6a already deployed the job and set up IAM; this task finishes the path.
  - Packaging of `packages/motion/dist` for App Hosting: `outputFileTracingIncludes` in `apps/web/next.config.ts` and `apphosting.yaml` env (builder); **IDE:** the turbo `dependsOn` in the root `turbo.json`;
  - redeploy the job with `job.ts` as its command (**IDE**/approved `gcloud`);
  - one 1080p export per format and one 720p export of 18 s through the real app: timings, sizes, perf summary;
  - read the Cloud Run pricing page and correct design §16;
  - record the measured NFR1 numbers in D-034 (IDE).
  - — R8.3, R9.1–R9.4, NFR1
- [ ] 23. **Steering and decisions (IDE, after approval):** enter D-034 in `docs/decisions.md` and apply design §23 to `data-model.md`, `ai-tasks.md`, `architecture.md`, `tech.md`, `structure.md` and `screens.md`. D-034 records the ember cost line (review F10). — workflow
- [ ] 24. **[kiro]** **Reviews:**
  - `motion-qa` reviews contact sheets of frames pulled from the task 22 exports (key moment and hold-end, 3 formats × the looks that `lookFor` resolves: `field-notes` and `paper-collage` through a project with that `styleId`) against the preview stills;
  - `spec-reviewer` checks the built feature against `requirements.md` and reports gaps back as tasks.
  - — NFR2, all

## Later (not for Nov 30)

- **4K export** (MP4 only, up to 60 s, producer presets `{landscape,portrait,square}-4k`; was task 25). It needs `'4k'` in `ResolutionSchema`, the price in `exportCredits`, the `flag_export_4k` key, an 18 s timing and memory check, and the server rule "4K over 60 s is `invalid`" (review F11). Turn on only if an 18 s 4K export runs under 5 minutes within the memory limit.
- **Transparent WebM** (VP9 alpha, was task 26): a container field on the options and the doc, `containerFor`, `flag_transparent_export`, a `background: 'transparent'` compile, an integration test that decodes alpha with `libvpx-vp9` (a background pixel transparent, a text pixel opaque) and one manual import into a video editor. The plan's §2.4 lists it as Kiroween polish.
- **Image slots in renders:** `assetPaths` on `RenderRequestSchema`, an upload step under `users/{uid}/media/` (the Storage rule already allows it) and a job step that fetches and validates them; then "Finishing N images…" (R1.10). Waits for spec 07 tasks 25 and 26.
- Cancel a running render (the producer supports an `AbortSignal`; needs a `cancelled` status and a refund rule).
- Partial re-export (only changed slots re-render).
- `@hyperframes/gcp-cloud-run` distributed rendering for long videos; videos over 3 minutes.
- MOV / ProRes 4444 and PNG sequences for editors.
- Share revocation, expiry, view counts, Open Graph and Twitter cards, and a share page polished to the landing style (spec 16).
- The dashboard's "Rendering 64%" and "Exported" chips and the project's `lastRenderId` (spec 11, once projects live in Firestore).
- Burned-in captions, music and SFX in renders (spec 12; the options already travel to the job).
- Tier-2 custom slots in renders, in an isolated container (spec 15).
- The out-of-credits modal (spec 13) in place of the inline message.
- A Storage lifecycle rule that deletes old renders (after Jan 29, 2027, when judge access ends).
- Email or browser notification when a long render finishes.

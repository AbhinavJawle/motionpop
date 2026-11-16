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
- [x] 4. **One compile input for preview and render.**
  - Move `componentFor`, `sceneFor`, `isScene` and `schemaFor` to `packages/motion/src/registry.ts`.
  - Add `lookFor(styleId)` there: `looks[styleId] ?? stylePacks[styleId] ?? editorialExplainer`. The preview and the render both resolve the project's look through it (review F4). The editor has no look picker yet (the Styles panel is spec 14), so the style id comes from the project (`setStyle` command or fixtures).
  - Move `isRenderable`, `compileSlot` and `previewCompileInput` to `packages/motion/src/compiler/project.ts` as `projectCompileInput(project, { mode, format, background, voiceSrc })`, with format-aware `isRenderable` (image slots are not renderable for now).
  - `apps/web` re-exports from the old paths, so imports stay the same and the existing tests pass unchanged.
  - Smoke check that nothing moved in the output: `pnpm motion:check stat-punch` and `pnpm --filter @motionpop/render parity` give the same results as before the move.
  - — R3.2
  - _Done 2026-11-16 (headless run, claude-sonnet-5.5). New: `packages/motion/src/registry.ts` (`componentFor`, `sceneFor`, `isScene`, `schemaFor`, `lookFor`; exported from the package root and as `@motionpop/motion/registry`), `packages/motion/src/compiler/project.ts` (`isRenderable`, `styleFor`, `compileSlot`, `projectCompileInput`; exported from `@motionpop/motion/compiler`), `src/testing/project-fixture.ts` (a small valid `EditorProject` for tests) and `compiler/project.test.ts` (8 tests). `apps/web/lib/motion/registry.ts` and `apps/web/lib/composition/project-to-compile.ts` are now re-exports (plus `previewCompileInput`, which calls `projectCompileInput(project, { mode: 'preview' })`), so no import changed and the existing web tests pass unchanged._
    - _`projectCompileInput(project, { mode, format?, background?, voiceSrc? })`: `format` defaults to the project's (an export may re-layout to another format), `background` and `voiceSrc` are added only when given, so the preview input is byte-identical to the old one._
    - _`isRenderable(slot, format?)`: ready, known component, params parse, **not an image slot** (reuses `isImageSlot` from `render.ts`, review F5), and with a format, the component must list it in `formats`. The format argument is optional so the old one-argument calls keep working. Image slots do not exist in the app yet (spec 07 tasks 25–26), so the preview loses nothing today._
    - _**Behaviour change on purpose (review F4):** `styleFor(project)` used to look in `stylePacks` only, so a project with `styleId: 'field-notes'` previewed in the editorial explainer. It now returns `lookFor(styleId)`: `looks`, then `stylePacks`, then `editorialExplainer`. The inspector, preview pane, scene gate and pipeline all call `styleFor`, so they follow. The return type is `StylePack | Look`; typecheck of every package passes._
    - _Checks: prettier, `turbo run typecheck lint test` (15 tasks, 0 warnings), `pnpm --filter @motionpop/web build`, `pnpm motion:check stat-punch --samples 20` (204 cases × 3 formats, 0 failures) and `pnpm --filter @motionpop/render parity` (big-number, field-notes, paper-collage: all stills within tolerance, about 1 % global). No rendering code changed, so no full `motion:check`._
- [x] 5. **[kiro]** P9 property test (preview vs render input for random valid projects and every format, and the style id on the compile input equals the project's whenever `looks` or `stylePacks` knows it). Extend `scripts/parity.ts` with cases built from an `EditorProject` fixture through `projectCompileInput`, in 16:9, 9:16 and 1:1, including one `field-notes` case. — R3.2, NFR2
  - _Done 2026-11-16 (headless run, claude-sonnet-5.5). `packages/motion/src/compiler/project.property.test.ts`: 6 tests, 200 runs each. The generator makes valid projects (random format, a style id from the known looks and packs, hostile names like `__proto__` and random strings, 0–5 slots on whole words of a 24-word transcript; slots are big-number, stat-punch or hook-statement with generated params, plus image slots, invalid params, unknown components and unready statuses). Properties: preview and render inputs are equal after removing `mode`, `voiceSrc` and `background`; the compiled slots are exactly the renderable ones in project order, with the source slot's times, component and params, and none is an image or unready slot; the input's style is `lookFor(styleId)`, whose id is the project's for every known id and is the editorial explainer otherwise; format defaults to the project's. A non-vacuity test samples 300 projects and checks that every case above occurs._
  - _`scripts/parity.ts`: `Case` now carries its own `format` and a ready `CompileInput`; three new cases built through `projectCompileInput` from `fixtureProject` (a `stat-punch` and a `hook-statement` slot): `project-16x9` (editorial explainer), `project-9x16-field-notes` and `project-1x1`. All 8 cases pass at about 1 % global and under 3.6 % worst tile. I also opened the 9:16 `field-notes` still: the torn paper card and the red marker are there, so the comparison is not two blank frames. The last word of the hook ("up") has not landed at 11.5 s in that case because the fixture's placeholder words (`word0`…) are 700 ms apart; this is the voice timing of the fixture, the same in preview and render._
  - _Shared test data: `@motionpop/motion/testing/project-fixture` is now a package export (`fixtureProject`, `bigNumberSlot`, `statPunchSlot`, `hookStatementSlot`), used by the property test, the task 4 tests and the parity script. Checks: prettier, `turbo run typecheck lint test` (15 tasks, 0 warnings) and the parity script. No rendering code changed: no full `motion:check`._

## B. The render job

- [x] 6. **Job core** in `services/render/src/`:
  - `ports.ts` and `run-render.ts` (steps 1–9 of design §8);
  - input defence (review F8): re-validate `inputPath` and `voicePath` against `renderPaths` and `voicePathFor`, `ffprobe` the voice (one audio stream, bounded duration), re-encode it to WAV before it enters the composition;
  - `progress.ts` (status mapping and throttle);
  - `preflight.ts` (seeks with `window.__motionpop.seek(ms)`, review F9), `thumbnail.ts`, `compile-assets.ts`;
  - frame counts use `msToFrame` (review F13);
  - `store/memory.ts` and `fs-blobs.ts`.
  - Unit tests run with a fake preflight, producer and ffmpeg.
  - — R3.2–R3.9, R4.1, R4.2, R6.1, R6.4, R9.3
  - _Done 2026-11-16 (headless run, claude-sonnet-5.5). All in `services/render/src/`; 66 tests in the package (was 0), prettier, typecheck, lint with 0 warnings and `turbo run typecheck lint test` (15 tasks) green. No motion rendering code changed, so no `motion:check`._
    - _`ports.ts`: `RenderStore`, `BlobStore`, `Preflight`, `Producer`, `Ffmpeg`, `Clock`, `Logger`, `RenderDeps`, plus `BlobNotFoundError`, `RenderTimeoutError` and `RenderAbortedError`. `run-render.ts`: `runRender(renderId, deps)` returns `done | error | skipped`, steps 1–9 of design §8 with the error codes `input-missing`, `compile-failed`, `slot-failed`, `render-failed`, `timeout`, `upload-failed`, `internal`. Any plain error inside a step takes that step's code; the doc's `errorMessage` is a fixed safe sentence, the real error goes to the log only. If `store.fail` itself throws, the job cleans up and then rethrows (so `job.ts` can exit 1, task 8)._
    - _Input defence (F8/R3.9): `inputPath` must equal `renderPaths(...).input` and `voicePath` must match `voicePathFor(owner, project)` before any read; the snapshot must parse and carry the doc's project id. The voice is probed (exactly one audio stream), re-encoded to `assets/voice.wav` and only the WAV enters the composition. **Two additions beyond the design, both from thinking about hostile uploads:** (1) ffmpeg and ffprobe get `-protocol_whitelist file` and a forced demuxer chosen from the voice's extension (`demuxerFor`: wav, mp3, mov for m4a, matroska for webm, ogg), so a concat or HLS playlist renamed to `.wav` is read as a broken WAV and not followed to other files; a test with a real ffmpeg checks it. (2) `toWav` cuts at `maxMs + 1 s` and the length check is made on the re-encoded WAV, because a browser recording often has no duration in its header (a small upload could otherwise expand into a huge WAV, or slip past a "0 ms" check)._
    - _`progress.ts`: `stageOf`, `mapProgress` (rendering 1–85, encoding 85–99; 100 is only `done`) and `ProgressThrottle` (a stage change writes at once; otherwise at least 1000 ms and 2 points; progress never lowers, a stage never goes back). Writes are chained so they stay in order; a write that finds the render inactive aborts the producer through the `AbortSignal`, and so does a heartbeat that finds it inactive. `headers.ts` builds the RFC 6266/5987 `Content-Disposition`. `output.ts` checks size and frames (± 1) of the file against the options (720p sizes: 1280×720, 720×1280, 720×720). `preflight.ts` (puppeteer, seeks with `window.__motionpop.seek`, reads `__motionpop.errors`, one issue per slot) and `preflight-samples.ts` (pure: start + 1 frame, key moment, end − 1 frame; split so `runRender` doesn't load puppeteer). `key-moment.ts` and `thumbnail.ts` (first slot's key moment, else 1 s, never past the last frame). `compile-assets.ts` (loads `packages/motion/dist`, clear error when it isn't built). `ffmpeg.ts` (process adapter; probe JSON parsed with zod) and `producer.ts` (HyperFrames adapter: `quality: 'high'`, `workers: 2`, `maxRenderMs` 15 min, `outputResolution` from `outputResolutionFor`; `RenderCancelledError` reason `timeout` becomes `RenderTimeoutError`, otherwise `RenderAbortedError`)._
    - _`store/logic.ts` has only `decideFail` so far (task 8 adds `decideExport`, `isStalled`, and the Firestore store). `store/memory.ts` applies the same transition table, never lowers progress, caps it at 99 until `done`, and refunds once through a ledger entry `refund-{renderId}` (`refundsOf`, `balances`, `ledger` for tests and offline mode). `fs-blobs.ts` keeps every object path under one root and refuses `..`, absolute and NUL paths; `deletePrefix` matches by string prefix like an object store. `src/index.ts` exports the light modules only. `testing/harness.ts` is the shared fake set (clock, ports, a real temp-folder blob store) that task 7 reuses._
    - _Tests: `run-render.test.ts` (27: happy path with monotone progress, upload headers, structured log line with no transcript or URL, compile in render mode for 9:16 720p, the step order, duplicate and bad starts, every input check, one failure per step with the code, one refund and no leftovers, sweep and heartbeat aborts, 3 heartbeats in 35 s, `store.fail` failing), `progress.test.ts`, `headers.test.ts`, `output.test.ts`, `preflight.test.ts`, `ffmpeg.test.ts` (parse tests, and real ffmpeg tests that skip when it is missing: five voice formats, the cut, the playlist refusal, frame count and thumbnail size), `store/memory.test.ts`, `fs-blobs.test.ts`. The tests found one bug of mine: `FsBlobStore.deletePrefix` only checked the folder part of a prefix, so a prefix with a NUL byte slipped through; fixed with a check of the whole prefix._
    - _**Real run, not part of the suite:** I ran `runRender` once with the real Chrome preflight, producer and ffmpeg against the memory store and a temp folder (a 6 s `field-notes` project, 9:16, 720p, a sine voice): outcome `done` in 15.3 s, `renderMs` 12.7 s, 720×1280 H.264 with AAC, 180 frames, a 270×480 JPEG thumbnail, download header with the non-ASCII title encoded, input and work folder gone. The script was a throwaway and is not committed; task 9 turns this into integration tests with a slot whose build throws._
    - _Not done here by design: `puppeteer` stays a devDependency until task 8 (the container installs production dependencies; task 8 moves it). I added `zod` as a dependency of `@motionpop/render` (for the probe JSON) and edited `pnpm-lock.yaml` by hand to add only that entry, because an offline `pnpm install` rewrote unrelated peer-dependency suffixes; `pnpm install --frozen-lockfile` accepts it._
- [ ] 6a. **[approval]** **Cloud walking skeleton** (review F2). Writing the files needs no approval; steps 3–6 wait for the founder.
  1. `services/render/Dockerfile` (Node 24 slim, ffmpeg, Chrome libraries, non-root, `build:runtime` at build time) and `cloudbuild.yaml` (build, push, `gcloud run jobs deploy` with the design §17 sizing). The first container command runs the existing `scripts/skeleton.ts` flow, so it works before `job.ts` exists.
  2. Read the HyperFrames Cloud Run Dockerfile for the Chrome libraries; record any reuse in `docs/third-party.md` (IDE).
  3. After approval: create the Artifact Registry repository (cleanup policy: keep 2), the `render-job@` service account with its conditional Storage grant, and the launcher role on the App Hosting service account (check whether `roles/run.invoker` already covers run-with-overrides).
  4. Build, deploy the job, and run one execution by hand (`gcloud run jobs execute`). Confirm Chrome starts and the output lands in Storage.
  5. Call `jobs:run` with the `RENDER_ID` override from the web service account, and confirm the Admin credential's token works for `run.googleapis.com` (otherwise use the metadata server). Confirm the override reaches the container.
  6. Record the cold-start time, the first measured cost, `gcloud run jobs describe` (no scheduler, no always-on instance, `maxRetries 0`: R9.1) and any surprise in the task note.
  - Nothing here runs until the founder approves; until then, the task stays unchecked.
  - — R3.1, R8.3, R9.1, R9.2, NFR1
- [x] 7. **[kiro]** Property and fault-injection tests for the job:
  - P8 (throttle over random callback streams and clocks);
  - for a failure injected at every step (inputs, voice probe, compile, preflight, producer, probe, thumbnail, upload), the render ends `error` with the step's code, exactly one refund, no files left in `workDir` and the input deleted;
  - a doc whose `voicePath` or `inputPath` points at another owner's object fails as `input-missing` without a read (review F8);
  - a voice that isn't decodable audio fails as `input-missing`;
  - a render swept mid-run aborts and cleans up;
  - a duplicate execution exits `skipped`.
  - — R3.7, R3.8, R3.9, R4.2, R6.1
  - _Done 2026-11-16 (headless run, claude-sonnet-5.5). Two new test files and a harness extension; the render package has 97 tests (66 before). Prettier, typecheck, lint with 0 warnings and `turbo run typecheck lint test` (15 tasks) green. Tests only; no motion rendering code changed._
    - _`progress.property.test.ts` (P8, 300 runs each unless noted): over random streams of `(stage, candidate, clock step)` with NaN, infinities, out-of-range values and a clock that goes back, the written progress is an integer in 0–100 that never decreases and the stage never goes back; two writes of the same stage are at least 1000 ms and 2 points apart; on a forward clock there are at most `floor(span / 1000) + 2` writes; a big enough move after a big enough gap always writes (no starvation); with the writes applied to `MemoryRenderStore` the doc passes `renderDocIssues` at every step and progress stays below 100 (60 runs); `mapProgress` stays in its band and never decreases with the producer percent._
    - _`run-render.faults.test.ts`: a table of 15 injected failures (snapshot read, voice download, voice probe, voice re-encode, compile, preflight crash, preflight slot error, producer, producer timeout, output probe, output mismatch, thumbnail, upload of the video, upload of the thumbnail, `markDone`). Each ends `error` with the step's code, a safe message (no injected text, paths or URLs), a valid doc, exactly one refund and the balance back, no work folder, no heartbeat timer, no snapshot and no half-uploaded output, and one log line with the same code. The same contract holds as a property over a random fault, format, resolution, title and cost (0, 3, 5, 10; 60 runs). Hostile paths: 80 generated voice paths (another owner, another project, `media` for `audio`, a `..` segment, a bad extension, a bad hash, a trailing segment, random strings) and 60 generated input paths all fail as `input-missing` with zero blob reads and zero port calls. A voice with 0–3 audio streams and 0–700 s of audio succeeds exactly when it has one stream and a length above 0 and at most `min(project + 5 s, 10 min)`. A render swept at every port-call index of a clean run (the harness runs a hook after each call) never ends `done`, keeps the sweeper's `stalled` error and message, refunds once and cleans up. Two executions at once: one `done`, one `skipped`, one producer call; a run on an already failed render does nothing and refunds nothing more._
    - _I checked that the tests can fail: removing the snapshot cleanup failed 12 tests, removing the output cleanup on failure failed 1 test, removing the interval from the throttle failed 3, and dropping the `markDone` abort failed 1; each change was reverted (the working tree has none of them)._
    - _No bug found in the code by these properties. Two of my first test expectations were wrong, not the code: a render with a free (0 credit) cost has no refund entry, and `expectFailedCleanly` expects the voice object to remain (the job never deletes the owner's voice)._
- [x] 8. **Firestore store and entry points:**
  - `store/logic.ts` and `store/firestore.ts` (`startExport`, `failRender`, `sweepIfStalled`, `FirestoreRenderStore`);
  - `store/ids.ts` (`renderIdFor`, `newShareId`) with unit tests: the share id is 22 base64url characters from `randomBytes(16)`, unique over many draws; the render id is stable for the same inputs (review F15);
  - `gcs-blobs.ts`;
  - the `@motionpop/render/store` subpath export, with a test that it never imports the producer;
  - **IDE:** the `renders (ownerId, status)` index in `firestore.indexes.json` (repo root, outside the builder's write paths);
  - `job.ts` (container entry);
  - `scripts/render-project.ts` (`render:project`, no Firebase).
  - Add `firebase-admin` and move `puppeteer` to dependencies (`pnpm add` moves `pnpm-lock.yaml`; expected).
  - — R2.5–R2.9, R3.1, R4.6, R7.5, R8.5
  - _Done 2026-11-16 (headless run, claude-sonnet-5.5), except the index (IDE, below). Built on spec 13's shared ledger helper: no inline money transaction anywhere in this task. `services/render/src/`: `store/logic.ts` (adds `decideExport`, `isStalled`, `decideProgress`, `canStart`, `canHeartbeat`, `canFinish`; `decideFail` unchanged), `store/firestore.ts` (`startExport`, `failRender`, `sweepIfStalled`, `recordExecution`, `FirestoreRenderStore`), `store/ids.ts` (`renderIdFor`, `newShareId`), `gcs-blobs.ts` (`GcsBlobStore`), `clock.ts`, `job.ts` (`runJob` and the entry), `job-deps.ts` (real deps), `scripts/render-project.ts`; `store/index.ts` now exports all of the store side (ledger, logic, ids, firestore, memory) and `store/index.test.ts` still proves it never imports the producer, Chrome, ffmpeg or the motion package (it now ignores `import type`, which is erased). Tests: render package 164 tests (130 before), web `test:rules` 6 files, 93 tests (72 before), prettier, typecheck, lint (0 warnings), `turbo run typecheck lint test`, `next build` green._
    - _**Money.** `startExport` runs `readLedger` for the user, the `export-{id}` and `refund-{id}` entries, the day doc and `judge-refill-{day}`, next to the render doc and the active-render query, all before any write; then `decideExport` (pure: existing → disabled → active → daily count → balance with the shared judge top-up); then `writeSpend` (balance, ledger entry with `create`, judge entry), the day's `renders` count with `merge`, and `create` of the `queued` render doc. `failRender` reads the render and the ledger docs, and refunds through `decideRefundFrom(..., server: true)` and `writeRefund`; the fixed id `refund-{renderId}` makes a second refund impossible, so the job, the sweep and the route can all call it. A cost of 0 writes no ledger entry. A user who no longer exists still has the render failed (no refund to give)._
    - _**Shared with the memory store.** `MemoryRenderStore` now calls the same `canStart`, `decideProgress`, `canHeartbeat` and `canFinish` as the Firestore store, so the two can't drift. An emulator property (15 runs of random start, progress, heartbeat, done and fail events) applies the same events to both stores and compares each answer, the status, progress and error, the refund count and the balance._
    - _**Sweep.** `sweepIfStalled` passes `isStalled` into `failRender` as a guard evaluated on the doc read inside the transaction, so a render whose heartbeat arrived a moment ago is left alone (test: a started render is not swept at +60 s, is after a heartbeat plus 100 s)._
    - _**Dependencies.** `@motionpop/render` gains `puppeteer` (moved from dev, as planned) and `tsx` (moved too: the container command is `node --import tsx src/job.ts`, so a production install needs it; task 6a may bundle instead) and the `render:project` script. Lockfile edited by hand for the two moves (same reason as before), `pnpm install --frozen-lockfile --offline` accepts it._
    - _**Real runs, not part of the suite.** (1) `pnpm render:project project.json voice.wav out.mp4 --resolution 720p --format 9:16` (fixture project, 4 s sine voice): `done` in 12.3 s wall, 720×1280 H.264 with AAC, 120 frames, thumbnail written next to it; a text file renamed `.wav` ends `input-missing` with exit 1. (2) `job.ts` itself against the Firestore **and Storage** emulators (a throwaway script, deleted): `startExport` (cost 3, balance 20 → 17), snapshot and voice uploaded with the Admin SDK, `node --import tsx src/job.ts` with `RENDER_ID`, exit code 0, render doc `done`, progress 100, `video.mp4` (`video/mp4`, 633,040 bytes, `Content-Disposition: attachment; filename="E2E film.mp4"; filename*=UTF-8''E2E%20film.mp4`, `Cache-Control: private, max-age=0`) and `thumb.jpg` in the bucket, the `input/` folder deleted (only the two outputs remain), balance 17. A second user whose snapshot was never uploaded: exit code 0, render `error` / `input-missing`, balance back to 20. That exercises `GcsBlobStore`, `FirestoreRenderStore`, `buildCloudDeps` and the real Chrome, producer and ffmpeg end to end._
    - _I checked the emulator tests can fail: removing the stall guard failed 2, dropping the `renders` count failed 4, ignoring the `disabled` flag failed 1. Two mutations were **not** caught and I left them: passing `refunded: false` to `decideFail` (equivalent: the final-status check and the fixed refund id already stop a second refund, defence in depth) and a progress cap of 100 (caught by the pure test in `export-logic.test.ts` and `memory.test.ts`, which the emulator run does not include). All mutations were reverted (files compared with backups)._
    - _**For Claude Code (IDE), the index.** `firestore.indexes.json` is outside my write paths. Exact change (the `startExport` active-render query, `ownerId ==` and `status in [...]`; the emulator does not need it, production does):_
      ```diff
       {
      -  "indexes": [],
      +  "indexes": [
      +    {
      +      "collectionGroup": "renders",
      +      "queryScope": "COLLECTION",
      +      "fields": [
      +        { "fieldPath": "ownerId", "order": "ASCENDING" },
      +        { "fieldPath": "status", "order": "ASCENDING" }
      +      ]
      +    }
      +  ],
         "fieldOverrides": []
       }
      ```
      _No rules change is needed by this task (the existing `renders/{rid}` and ledger rules fit; task 13 tests them)._
    - _Not verified here: `cloudRunLauncher` and anything on Cloud Run (tasks 6a and 11); the App Check path of the routes (08 task 12 owns the routes that call `startExport`); the Dockerfile. Decisions for the IDE (`docs/decisions.md`): the forced demuxer and WAV cut (task 6), `styleFor` (task 4), `tsx` as a runtime dependency (this task)._
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

# 08 · Render and export — tasks

_Written by Kiro CLI (headless, `motionpop-builder`, claude-opus-5.5) on 2026-11-16. Draft: implementation starts after the founder approves `requirements.md` and `design.md`._

One task at a time. Each task ends with the definition of done (`handoff.md` §5): prettier, typecheck, lint with 0 warnings, and tests green, using `pnpm -s turbo run test --force` when another package's tests read the changed files. UI tasks also need the web build and Playwright. Commit with `feat(08-render-and-export): task N …`.

- **[kiro]** marks tasks for headless Kiro CLI runs (`motionpop-builder`), logged in `KIRO_LOG.md`.
- **[approval]** marks tasks that spend money or touch production; they wait for the founder.
- `.github/**`, `docs/**` and steering are outside the builder agent's write paths, so those tasks run from the IDE.

**Demo path first:** tasks 1–19 give a working export in offline and emulator modes. Tasks 20–22 put it in the cloud. **Cut order if time runs short:** task 17's share page down to a disabled "Copy share link" ("Soon"), then 720p (1080p only), then the progress button in the top bar (the modal alone shows progress).

Two standing rules:
- A bug found by a property test gets a regression test and a note in the log (`testing.md`).
- Never run `npx hyperframes events`, `firebase deploy` or `gcloud … deploy` from a task that isn't marked **[approval]**.

## 0. Before implementation

- [ ] 0. **[kiro]** `spec-reviewer` reads this spec against `.kiro/steering/` (read-only) and lists gaps. Fixes go into the three files before task 1, and the review is logged in KIRO_LOG (`handoff.md` §9). Claude Code reviews the spec too when the founder is back in it. — all

## A. Foundations

- [ ] 1. **Spike (local, $0): the producer against our compositions.**
  - Using `scripts/skeleton.ts` and parity fixtures, check on 0.9.46:
    - `outputResolution` 720p from a 1080p composition in 16:9, 9:16 and 1:1 (works, or needs the ffmpeg scale fallback);
    - 4K 16:9 for an 18 s project (time and peak memory);
    - `format: 'webm'` with `background: 'transparent'` (alpha confirmed with the `libvpx-vp9` decoder);
    - `quality` high vs standard, and `workers: 2` vs automatic.
  - Record the numbers in the spec's design §1.1 and §8, and draft D-034 for the IDE to enter.
  - — R3.3, NFR1
- [ ] 2. **Schemas** in `packages/schemas/src/render.ts`, with unit tests:
  - `RenderOptions`, `RenderRequest`, `RenderDoc` (with invariants), `RenderErrorCode`, `ShareDoc`, the API response and error schemas;
  - `exportCost`, `renderIdFor`, `renderPaths`, `sanitizeFilename`, `canTransition`, `nextProgress`, `outputResolutionFor`, `exportAvailability`;
  - the six config keys with typed defaults, and the optional `renders` counter on `DailyLimitsSchema`.
  - — R1.8, R1.11, R2.4, R2.6, R3.5, R4.1, R5.3, R8.5
- [ ] 3. **[kiro]** Property tests for task 2:
  - P4 (pure transition and progress rules over random event sequences);
  - P6 (cost function);
  - P7 (paths and filenames, including hostile titles and ids).
  - — R2.4, R4.1, R8.5
- [ ] 4. **One compile input for preview and render.**
  - Move `componentFor`, `sceneFor`, `isScene` and `schemaFor` to `packages/motion/src/registry.ts`.
  - Move `isRenderable`, `compileSlot` and `previewCompileInput` to `packages/motion/src/compiler/project.ts` as `projectCompileInput(project, { mode, format, background, voiceSrc })`, with format-aware `isRenderable`.
  - `apps/web` re-exports from the old paths, so imports stay the same and the existing tests pass unchanged.
  - Smoke check that nothing moved in the output: `pnpm motion:check stat-punch` and `pnpm --filter @motionpop/render parity` give the same results as before the move.
  - — R3.2
- [ ] 5. **[kiro]** P9 property test (preview vs render input for random valid projects and every format). Extend `scripts/parity.ts` with cases built from an `EditorProject` fixture through `projectCompileInput`, in 16:9, 9:16 and 1:1. — R3.2, NFR2

## B. The render job

- [ ] 6. **Job core** in `services/render/src/`:
  - `ports.ts` and `run-render.ts` (steps 1–9 of design §8);
  - `progress.ts` (status mapping and throttle);
  - `preflight.ts`, `thumbnail.ts`, `compile-assets.ts`;
  - `store/memory.ts` and `fs-blobs.ts`.
  - Unit tests run with a fake preflight, producer and ffmpeg.
  - — R3.2–R3.8, R4.1, R4.2, R6.1, R6.4, R9.3
- [ ] 7. **[kiro]** Property and fault-injection tests for the job:
  - P8 (throttle over random callback streams and clocks);
  - for a failure injected at every step (inputs, compile, preflight, producer, probe, thumbnail, upload), the render ends `error` with the step's code, exactly one refund, no files left in `workDir` and the input deleted;
  - a render swept mid-run aborts and cleans up;
  - a duplicate execution exits `skipped`.
  - — R3.7, R3.8, R4.2, R6.1
- [ ] 8. **Firestore store and entry points:**
  - `store/logic.ts` and `store/firestore.ts` (`startExport`, `failRender`, `sweepIfStalled`, `FirestoreRenderStore`);
  - `gcs-blobs.ts`;
  - the `@motionpop/render/store` subpath export, with a test that it never imports the producer;
  - the `renders (ownerId, status)` index in `firestore.indexes.json`;
  - `job.ts` (container entry);
  - `scripts/render-project.ts` (`render:project`, no Firebase).
  - Add `firebase-admin` and move `puppeteer` to dependencies.
  - — R2.5–R2.9, R3.1, R4.6, R7.5
- [ ] 9. **Integration tests with the real producer** (they need ffmpeg and Chrome; skipped locally when missing, always run in CI):
  - a 2 s, 2-slot fixture in 16:9, 9:16 and 1:1 at 1080p, plus 16:9 at 720p: frame count, size, duration;
  - a voice beep lands within 1 frame (P10);
  - the preflight catches a slot whose build throws.
  - — R3.4, R3.6
- [ ] 10. **[kiro]** Emulator tests for the store (`apps/web/rules/export-tx.emulator.test.ts`):
  - P1, P2, P3 and P5 with fast-check over random concurrent sequences of start, fail, sweep and done for 1–3 users (small `numRuns`, so CI stays fast);
  - an idempotent replay;
  - the daily limit;
  - the active-render conflict;
  - the stalled sweep with a fake clock.
  - The Firebase MCP may be used to inspect emulator state while debugging; it never deploys.
  - — R2.5–R2.9, R4.6, R6.1

## C. Server

- [ ] 11. **`renderMode()` and the launchers:**
  - `cloudRunLauncher` (Admin API `jobs:run` with the `RENDER_ID` override; confirm the Admin credential's token works for `run.googleapis.com`, else use the metadata server; 15 s timeout);
  - `childProcessLauncher` (emulator);
  - `inProcessLauncher` (offline).
  - Tests: the request shape and errors with fetch mocked; P11 (production always gives `cloud`).
  - — R3.1, R7.1, R7.2, R7.4
- [ ] 12. **API routes:**
  - `POST /api/renders`, `POST /api/renders/[id]/check`, `GET /api/renders/[id]/download`, `POST /api/shares`;
  - the offline-only `local-renders` routes (create, status, file).
  - All bodies are parsed with zod, sizes and voice paths are checked, and every error code in design §10 is covered by handler tests with fakes.
  - — R2.1–R2.8, R4.6, R5.2, R5.3, R6.3, R7.3, R7.4, R8.2, R8.4
- [ ] 13. **[kiro]** Rules tests for every path this spec uses:
  - `renders/{id}` (owner read only, every client write denied, including field-level updates);
  - `shares/{id}` denied;
  - the ledger `export-*` and `refund-*` entries and `limits/{day}` not client-writable;
  - Storage: `…/renders/{rid}/input/project.json`, `video.*` and `thumb.jpg` (owner read, no client write, other users denied), and `users/{uid}/audio/{pid}/voice-*` (owner write within type and size, others denied).
  - If a rule has a gap, fix it here and note it.
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
  - the cost row and its messages;
  - "Soon" pills and disabled states driven by the flags and availability;
  - the left-out note, the pending-images wait and the offline state;
  - the thumbnail player;
  - focus trap, Esc and reduced motion.
  - Component tests for every availability state.
  - — R1.1–R1.13
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
  - the minimal `/share/[id]` page (server component, Admin reads, signed URLs, `noindex`, not-found state).
  - — R5.1–R5.4
- [ ] 18. **Design check** at 1440×900 with Chrome DevTools MCP:
  - screenshot the export modal (16:9, 1080p, toggles as in the PNG), the progress, the ready and the error states;
  - compare them with `design/screens/export.png` and `export-ready.png` side by side, and fix differences (spacing, type sizes, colours);
  - log what was compared and what still differs in KIRO_LOG.
  - — R1.1, R5.1
- [ ] 19. **[kiro]** **E2E of the export path** (`apps/web/e2e/export.spec.ts`, offline mode, chromium project):
  - `/editor/demo` → Export → the modal shows the project card, "Local render · free" and 1080p preselected → pick 9:16 → Export video → the progress state appears and advances → the ready modal → Download → ffprobe on the downloaded file gives MP4, 1080×1920 and the project's duration ± 1 frame;
  - a second test: an error path shows the error state and "Try again". The failure is injected through `MP_RENDER_FAKE_FAIL=producer`, which only `offlineDeps` reads (offline mode never runs in production, P11). A unit test checks that the cloud and emulator deps ignore it.
  - — R1.1, R2.1, R4.3, R5.1, R5.2, R6.2, R7.3

## E. Ship it

- [ ] 20. **Container:**
  - `services/render/Dockerfile` (Node 24 slim, ffmpeg, Chrome libraries, non-root, `build:runtime` at build time);
  - `cloudbuild.yaml` (build, push, `gcloud run jobs deploy` with the design §16 sizing);
  - `services/render/README.md` (modes, commands, IAM);
  - read the HyperFrames Cloud Run Dockerfile for the Chrome libraries and record any reuse in `docs/third-party.md` (IDE).
  - No build or deploy in this task.
  - — R8.3, R9.1, R9.2
- [ ] 21. **CI and hooks (IDE; the builder agent can't write `.github/` or `.kiro/hooks/`).** Add a `render` job to `ci.yml`:
  - install ffmpeg (`apt-get`) and the Playwright browser (`pnpm --filter @motionpop/web exec playwright install --with-deps chromium`);
  - `pnpm --filter @motionpop/motion build:runtime`;
  - `pnpm --filter @motionpop/render test` (integration and preflight included);
  - `pnpm --filter @motionpop/render parity`;
  - `pnpm --filter @motionpop/web exec playwright test e2e/export.spec.ts --project=chromium`;
  - upload the parity stills and e2e traces on failure.
  - The `rules` job already runs the new emulator and rules tests. Check the CI run after pushing (`handoff.md` §5).
  - Add an IDE hook in `.kiro/hooks/`: saving a file under `services/render/src/**` runs `pnpm --filter @motionpop/render test` (unit tests only; the integration tests stay in CI).
  - — testing, R3.6, NFR2
- [ ] 22. **[approval]** **Cloud setup and smoke test:**
  - App Hosting packaging of `packages/motion/dist` (`outputFileTracingIncludes`, turbo `dependsOn`) and `apphosting.yaml` env;
  - the Artifact Registry repository (cleanup policy: keep 2), the `render-job@` service account and its conditional Storage grant, and the launcher role on the App Hosting service account (check whether `roles/run.invoker` covers run-with-overrides);
  - the first Cloud Build and job deploy;
  - one 1080p export per format, one 720p export and one 4K 16:9 export of 18 s: timings, sizes, perf summary;
  - read the Cloud Run pricing page and correct design §16;
  - record the measured NFR1 numbers and the flag decision for 4K in D-034.
  - — R8.3, R9.1–R9.4, NFR1
- [ ] 23. **Steering and decisions (IDE, after approval):** enter D-034 in `docs/decisions.md` and apply design §23 to `data-model.md`, `ai-tasks.md`, `architecture.md`, `tech.md` and `screens.md`. — workflow
- [ ] 24. **[kiro]** **Reviews:**
  - `motion-qa` reviews contact sheets of frames pulled from the task 22 exports (key moment and hold-end, 3 formats × the polished looks) against the preview stills;
  - `spec-reviewer` checks the built feature against `requirements.md` and reports gaps back as tasks.
  - — NFR2, all

## F. Flagged follow-ups (after the demo path works in the cloud)

- [ ] 25. Turn on `flag_export_4k` if task 22 showed an 18 s 4K export under 5 minutes and under the memory limit; otherwise leave it off and say why in D-034. — R1.6
- [ ] 26. Transparent WebM:
  - an integration test that decodes alpha with `libvpx-vp9` and checks a background pixel is transparent and a text pixel opaque;
  - one manual import into a video editor;
  - then turn on `flag_transparent_export`.
  - — R1.5, R3.3

## Later (not for Nov 30)

- Cancel a running render (the producer supports an `AbortSignal`; needs a `cancelled` status and a refund rule).
- Partial re-export (only changed slots re-render).
- `@hyperframes/gcp-cloud-run` distributed rendering for long videos; videos over 3 minutes; 4K over 60 s.
- MOV / ProRes 4444 and PNG sequences for editors.
- Share revocation, expiry, view counts, Open Graph and Twitter cards, and a share page polished to the landing style (spec 16).
- The dashboard's "Rendering 64%" and "Exported" chips and the project's `lastRenderId` (spec 11, once projects live in Firestore).
- Burned-in captions, music and SFX in renders (spec 12; the options already travel to the job).
- Tier-2 custom slots in renders, in an isolated container (spec 15).
- The out-of-credits modal (spec 13) in place of the inline message.
- A Storage lifecycle rule that deletes old renders (after Jan 29, 2027, when judge access ends).
- Email or browser notification when a long render finishes.

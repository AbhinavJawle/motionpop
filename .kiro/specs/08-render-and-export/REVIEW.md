# 08 · Render and export: spec review

_Reviewer: `spec-reviewer` (read-only), model claude-sonnet-5.5. Read: `requirements.md`, `design.md`, `tasks.md`, all of `.kiro/steering/` that applies, `docs/decisions.md` (last id is D-033, so D-034 is free), `firestore.rules`, `storage.rules`, `.github/workflows/ci.yml`, and the code the spec reuses. I had no shell in this run, so I could not read `node_modules` and could not check the producer's `outputResolution` option. The spec already leaves that to task 1._

## Verdict: ready after fixes

The spec is thorough and mostly matches steering and the code. Requirements are numbered, EARS-style and traced to tasks. All 11 correctness properties have an owning task. The credit logic is in one place, with fixed ledger ids. Two findings would break the build or the schedule if left as written (F1, F2). Fix F1 to F5 before task 1; the rest can be fixed on the way.

## Resolution (2026-11-16, headless run, claude-sonnet-5.5)

Each finding is resolved in `requirements.md`, `design.md` and `tasks.md`, using Claude Code's decisions on the open choices (F2 yes, F5 option a, F7 yes, the rest as written). `design.md` §25 maps every finding to the sections that changed.

| Finding | Resolved in |
|---|---|
| F1 | design §5 and §7.1; tasks 2, 3 and 10 |
| F2 | new task 6a (**[approval]**); design §17; cut order in `tasks.md` |
| F3 | tasks 8, 13 and 22 (IDE steps marked) |
| F4 | design §4 and §21 (decision 3), P9; tasks 4 and 5 |
| F5 | option (a): R1.8, R1.10 removed; design §8 step 3; "Later" |
| F6 | design §18; tasks 17, 19 and 21 |
| F7 | R1.5, R1.6, R3.3; design §5, §14, §21; 4K and WebM in "Later" (old tasks 25 and 26) |
| F8 | R3.9, R8.3; design §8 step 2; tasks 6 and 7 |
| F9 | design §8 step 4; task 6 |
| F10 | R1.4; design §21 (decision 15); task 23 |
| F11 | moot with F7; kept in "Later" |
| F12 | design §5; task 2 |
| F13 | design §5, §8 step 5, P10; tasks 6 and 9 |
| F14 | R2.8; design §21 (decision 19) |
| F15 | R8.5, R9.1; design §18; tasks 6a, 8 and 22 |
| F16 | design §20 |
| F17 | design §3 and §7.2; task 12 |
| F18 | R1.13; design §18; task 15 |

Two additions beyond the findings: `renderIdFor` and `newShareId` move to `services/render/src/store/ids.ts` (they need Node `crypto`, and `packages/schemas` is bundled for the browser), and the founder defaults of design §22 are recorded in `requirements.md`.

## Findings, by severity

### High

**F1. `startExport` writes a day doc that the existing schema rejects.**
- Evidence: `packages/schemas/src/limits.ts` defines `DailyLimitsSchema` with `planCloud` required. Design §7.1 reads the day doc with `DailyLimitsSchema.parse(...)`, but writes `{ schemaVersion, renders, updatedAt }` with `merge`, with no `planCloud`. §5 only adds `renders` as optional.
- Effect: if a user's first action of the UTC day is an export, the doc has no `planCloud`. The next `parse` in the export transaction throws, and `/api/ai/plan-allowance` reads the same doc.
- Fix: in task 2, change `planCloud` to `z.number().int().nonnegative().default(0)` (keep the existing test passing, and add a case for a doc with only `renders`). Add a P-level unit test that a doc written by either path parses.

**F2. The cloud path is the last thing built, and it carries most of the risk.**
- Evidence: `tasks.md` puts the container, the first deploy and the first cloud render in tasks 20 to 22, after the whole UI. Handoff §3 says export must work by Nov 30, and the requirements say it lands by Nov 25. Offline mode is development-only (R7.4), so judges see nothing until task 22.
- Unverified items that task 22 would meet for the first time: Chrome in the Cloud Run job image, the Admin credential's token for `run.googleapis.com` (design §9 says "verify in task 11" but task 11 has fetch mocked), signed URLs through IAM `signBlob`, the conditional Storage grant, and packaging `packages/motion/dist` for App Hosting.
- Fix: split a cloud walking skeleton out of tasks 20 and 22 and put it right after task 6. It deploys the job with the existing `scripts/skeleton.ts` flow, runs one execution by hand, and tries `jobs:run` with the `RENDER_ID` override from the web service account. Keep it **[approval]**. The full smoke test stays last. Add "cloud skeleton passes" to the cut-order sentence as the thing that cannot be cut.

**F3. Tasks outside the builder agent's write paths are marked `[kiro]` or listed without a note.**
- Evidence: handoff §7 says the headless agent writes only `apps/`, `packages/`, `services/`, `skills/` and `.kiro/specs/`. Task 8 adds an index to `firestore.indexes.json` (repo root). Task 13 ("If a rule has a gap, fix it here") edits `firestore.rules` and `storage.rules` (repo root). Task 22 changes turbo `dependsOn` (root `turbo.json`) and the lockfile moves with the new dependencies in task 8. The spec already notes this for `.github/`, `docs/` and steering, but not for these.
- Fix: in tasks 8, 13 and 22, mark the root-file edits "IDE" in the same way as tasks 21 and 23. Task 13 stays `[kiro]` for the tests; a found rule gap is reported and fixed from the IDE.

### Medium

**F4. How a project's look reaches the render is not specified.**
- Evidence: `apps/web/lib/composition/project-to-compile.ts` resolves style with `stylePacks[project.styleId] ?? editorialExplainer`, and `packages/motion/src/styles/index.ts` puts only `editorialExplainer` in `stylePacks`. The looks (`looks`, used by `scripts/parity.ts`) are a separate map. Design task 4 moves this function to `packages/motion` unchanged, R1.2 shows "the look's display name", and task 24 reviews "the polished looks".
- Effect: an export can silently come out in the default look while the preview shows another, or the reverse once the Styles panel lands. P9 only checks that preview and render share one function, so it would not catch this.
- Fix: in task 4, state how `styleId` resolves (one `lookFor(styleId)` in `packages/motion` covering `stylePacks` and `looks`), use it in both inputs, and add to P9 that the style id on the compile input equals the project's when the id is known. If the editor cannot select a look yet, say so in the design and drop "polished looks" from task 24 until it can.

**F5. Image assets have no route into the render.**
- Evidence: R1.10 waits for pending images, and design §8 step 3 says assets are "copied into `composition/assets/` by the same step when that work lands". Nothing says where they come from. The request body is capped at 2 MB, the snapshot holds only asset references, and assets live in the browser (spec 07 tasks 25 and 26 are not done).
- Fix: choose one. Either (a) say image slots count as "left out" (R1.8) until spec 07 defines asset storage, and remove R1.10 for now, or (b) add `assetPaths` to `RenderRequestSchema` with an upload step under `users/{uid}/media/` (the Storage rule already allows it) and a job step that fetches and validates them. Option (a) is cheaper for Nov 30.

**F6. The main e2e runs in offline mode, which skips everything that matters for the hackathons.**
- Evidence: task 19 runs in `offline` mode, which charges no credits, has no Firestore render doc, no signed download and no share (design §2). R1.9, R2.x, R4.6, R5.2 to R5.4 and R6.x therefore have no end-to-end test. Task 17 lists no test for the `/share/[id]` page at all (not-found state, `noindex`, signed URL).
- Fix: add a second e2e (or a route-level integration test) in `emulator` mode, run in the CI `rules` job that already has the emulators: sign in, export, see the balance drop, download, copy the share link, open `/share/{id}`. Add a unit test for the share page's not-found and `noindex` metadata to task 17. Keep emulator mode; it is the only way to test the credit path with the real job entry point.

**F7. Scope is wider than the demo needs.**
- Evidence: the design's own §22 admits the plan lists transparent export as Kiroween polish. 4K and transparent WebM add config keys, an `outputResolutionFor` mapping, a container branch, `RenderOptions` refinements, a probe path and tasks 25 and 26, all switched off for Nov 30.
- Fix: keep the disabled "Soon" cards in the UI (R1.5, R1.6), but move the 4K and WebM implementation (R3.3 clauses, `flag_export_4k`, `flag_transparent_export`, `containerFor`, 4K in `exportCost`) to "Later". Tasks 25 and 26 move there too. The `outputResolution` check for 720p in task 1 stays.

**F8. The render job holds read and write on all of `users/`, and it decodes user-uploaded audio.**
- Evidence: design §17 grants `storage.objectUser` on the `users/` prefix. The voice file is any `audio/*` object up to 50 MB that the owner uploaded, and it goes to ffmpeg and Chrome. R8.3 says the job "can only read and write the Storage bucket's `users/` paths", which is every user's data.
- Fix: (a) the job re-validates `voicePath` and `inputPath` against `voicePathFor(ownerId, projectId)` and `renderPaths(...)` before reading (the doc is server-written, so this is cheap defence in depth); (b) the job runs `ffprobe` on the voice first and re-encodes it to WAV before it enters the composition; (c) add both to task 6 and to the fault-injection list in task 7; (d) note in R8.3 that the grant is broad and why it cannot be narrower per render.

**F9. The preflight depends on the HyperFrames player object.**
- Evidence: design §8 step 4 seeks through `window.__player.seek`. The runtime already exposes `window.__motionpop.seek(tMs)` and `errors` (`packages/motion/src/runtime/runtime.ts`); `__player` comes from the HyperFrames runtime that `parity.ts` happens to load.
- Fix: seek with `window.__motionpop.seek(ms)` (integer ms, no float seconds) in the preflight. This keeps it independent of HyperFrames internals and matches "integer milliseconds" in `architecture.md`.

### Low

- **F10. Export hint colour vs `hybrid-ai.md`.** That file says credited cloud actions show a violet `☁ N` chip. The design PNG shows ember "Cost: 5 credits", and the PNG wins (D-014). Add one sentence to R1.4 or D-034 saying so, so the next review does not flag it.
- **F11. Missing server rule for 4K over 60 s.** R1.6 and design §20 say the route rejects it as `invalid`, but R2.2 and R8.4 do not list it. Moot if F7 is taken.
- **F12. `IntMsSchema` is not exported.** It is a local `const` in `packages/schemas/src/project.ts`, and `render.ts` uses it. Export it, or define it once in `time.ts`.
- **F13. Frame-count formula.** Use `msToFrame(durationMs)` from `packages/schemas/src/time.ts` instead of writing `round(durationMs × 30 / 1000)` in P10, task 6 and the probe.
- **F14. Global daily budget.** `AppConfig` has `dailyBudgetCredits` (security-and-cost: "global daily budget kill switch"). R2.8 uses only `killSwitch` and `exportsEnabled`. Say whether export credits count toward the global budget; the simple answer is no, since they are not AI spend.
- **F15. Untestable requirements.** R8.5 ("unguessable") and R9.1 ("nothing idles") have no named check. Add a unit test that share ids are 22 base64url characters from `crypto.randomBytes(16)`, and say R9.1 is verified in task 22 from the Cloud Run job config.
- **F16. A replayed request never relaunches a job.** If the web process dies after the transaction but before the launch, the replay returns `existing` and stops. The render is swept as `stalled` after 5 minutes and refunded, which is acceptable. State it in §20 so it is a decision, not an accident.
- **F17. Pseudo-code slip.** Design §7.2 uses `user.credits`, where `user` is a snapshot; it should read `user.data().credits`. A bad id from the snapshot (`project.id` failing the id regex in `renderPaths`) should map to `invalid`, not a 500.
- **F18. Accessibility has no test.** R1.13 (focus trap, Esc, radio groups, switches) has no check beyond "component tests for every availability state". Add an assertion set to task 15.

## Checks that passed

- **EARS and numbering:** every criterion in R1 to R9 is numbered; the ubiquitous ones ("THE SYSTEM SHALL") are testable except F15.
- **Traceability:** every requirement maps to a task and every task cites ids. Tasks 0 ("all") and 23 ("workflow") cite a name instead, which is acceptable for review and steering tasks.
- **Reality:**
  - `firestore.rules` already denies client writes to `renders`, `shares`, the ledger and `limits`, and allows owner read; `storage.rules` already covers the render path and the voice path.
  - `bootstrapUser` writes a `signup` ledger entry, so P3 (balance equals the sum of deltas) holds from the start.
  - `serverConfig()`, `verifyRequest` and `errorResponse` exist; `previewCompileInput`, `isRenderable`, `sceneTiming`, `canRender` and the registry exist in the places the design says.
  - `services/render` has `@hyperframes/producer`, with `puppeteer` as a dev dependency, as the design states.
  - D-034 is the next free decision id.
- **Steering:** zod at every boundary, integer milliseconds, no GSAP, no secrets in the client, App Check, server-written credits and refunds with fixed ids, and a cost near $0 (jobs bill only while running) are all covered.
- **Testing:** P1 to P11 each have a task; rules tests, an e2e, a design check and a CI job are present. CI has no Playwright job today, and task 21 adds one.
- **Kiro share:** 7 of 27 tasks are marked `[kiro]` (about 26 %), at the handoff's 25 % target.

## Top findings

1. **F1** The export transaction writes a day doc that fails `DailyLimitsSchema` (`planCloud` required). Give `planCloud` a default of 0 in task 2.
2. **F2** The cloud path is built last. Add an early cloud skeleton (deploy, `jobs:run` with the override, one render) after task 6.
3. **F3** Tasks 8, 13 and 22 edit root files (`firestore.indexes.json`, rules, `turbo.json`) that the builder agent cannot write. Mark those steps IDE.
4. **F4** Nothing says how `styleId` becomes a look in the render; `stylePacks` only holds one pack. Add one shared `lookFor` and extend P9.
5. **F5** Image assets have no path to the job. Treat image slots as "left out" until spec 07 defines asset storage.
6. **F6** The only e2e runs offline, so credits, download and share are never tested end to end. Add an emulator-mode e2e and a share page test.

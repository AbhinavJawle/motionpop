# Tasks: 09 inspector, quick edits and frame notes

_Written headlessly by Kiro CLI (`motionpop-builder`, Opus 5.5), 2026-11-16. Revised the same day (headless run, claude-sonnet-5.5) to apply every finding of `REVIEW.md`. Requirements and design not yet approved by the founder._

One task at a time. Each ends with the definition of done for the packages it touches (prettier, typecheck, lint with 0 warnings, tests read, not just run). Motion tasks also pass `pnpm motion:check <id>`, and UI tasks are compared with the PNG at 1440×900. A bug found by a property test gets a regression test and a log note (testing.md). **[kiro]** marks tasks for headless Kiro CLI runs (`motionpop-builder`), logged in `KIRO_LOG.md`. The builder agent has Context7 only; a step that needs another MCP server (Chrome DevTools, Firebase) is marked **IDE** and runs from the IDE or Claude Code, as do steps outside its write paths (`.github/**`, `docs/**`, steering).

**Dependency on spec 13 (exactly which tasks, and before which task here).** Spec 13's tasks are numbered in its own `tasks.md`; this table is the same list from this side. Generate (task 18) on the hosted path must not start before every row is checked.

| Spec 13 task | Provides | Must be checked before (here) |
|---|---|---|
| 1 Schemas | `ClientCreditAction`, spend and refund bodies, `key-used` | task 3 and task 11 (this spec imports the type, it does not write its own) |
| 2 `costOf` | the one cost table | task 3 (`chooseRoute` takes `cloudCost` from it) |
| 3 Ledger logic (pure) | `decideSpend`, `decideRefund` | task 18 (P5 against `ServerCredits`; task 11's contract test needs only `LocalCredits`) |
| 4 Ledger helper and routes | `/api/credits/spend` and `/refund` | task 18 on the hosted path |
| 5 Emulator tests | proof the ledger is exact | task 18 |
| 8 `useCredits`, `ServerCredits`, live chip | the server credits client | task 18 |
| 9 Out-of-credits modal | the real modal (task 11b ships a stub) | task 18 |

Everything else in this spec works in local mode with `LocalCredits`. Until spec 13 task 8 is checked, a hosted build keeps every cloud action disabled ("Cloud AI is coming soon"), so no real cloud call can run against fake credits.

**Order, with checkpoints** (review F10). 1. The demo path: tasks 1, 2, 3, 4, 5, 7, 10, 11, 11b, 12, 16, 18 (inspector, quick edit, Generate). Checkpoint: a content quick edit ("change 40 to 45") and Generate work end to end in local mode. 2. Timing: tasks 8, 9, 14. 3. Notes: tasks 6, 19, 20. 4. The rest: 13, 15, 17, then 21–25. If timing (task 8) is cut, "change 40 to 45" is the demo quick edit and "slower" is dropped from the script.

**If time runs short, cut in this order:** the frame capture image (task 19: notes ship with region text only), the ease picker (keep Fade and duration), version glyph paging (show the last 3 only), prompt pre-fill on the device (keep the template). Never cut: on-device quick edit, frame notes with `note.fix`, Generate with its cost chip, the offline banner, the toasts.

## A. Data and AI contracts

- [x] 1. **[kiro]** Schemas in `packages/schemas/src/project.ts`: `SlotTimingSchema` and `Slot.timing?`; `Version.timing?`; `FrameNote.fixedVersionId?`; `VERSIONS_PER_SLOT = 20`. The note shape gets a doc comment only, no refine: the lengths and the 0..1 range are checked by the note commands in task 7, because the schema's policy is that a saved project never fails to load because of a limit (review F11). `FrameNote.tMs` becomes slot-relative: change the demo fixture's `note-1` in `apps/web/lib/projects/fixture.ts` from `tMs: 5600` to `1400`, and add a test that the note is found on slot 2 at playhead 5600 (relative time 1400) (review F4). Tests: the demo fixture and every saved shape still parse; random valid timings round-trip. — R4.2–R4.4, R5.4, R8.3 _Done (Kiro CLI, headless): SlotTimingSchema, Slot.timing, Version.timing, FrameNote.fixedVersionId and VERSIONS_PER_SLOT in project.ts (note shape documented, no refine). Demo note-1 tMs 5600 -> 1400, test finds it on slot 2 at playhead 5600. Schema tests incl. a fast-check timing round-trip._
- [ ] 2. **[kiro]** Router: `run(task, input, { mode, allowCloud })` (`allowCloud: false` disables the cloud fallback for that call); `UsageEvent.cloudCost` on every event. Tests in `router.test.ts`: no cloud attempt with `allowCloud: false` after a bad device answer; existing behaviour unchanged without the option; `cloudCost` present on success and failure. — R7.4, R9.5
- [ ] 3. **[kiro]** Needs spec 13 tasks 1 and 2. `apps/web/lib/ai/route.ts`: `chooseRoute` and `chipFor` per design, with `cloudCost` taken from `costOf('edit' | 'generate')` (not hard-coded) and `cloudAvailable` / `cloudBlockedReason` for the no-Firebase and no-`ServerCredits` cases. A table test of every rule, including the "Cloud AI is coming soon" case, and the fast-check property P4 (no surprise spend: device/local routes never carry credits or `allowCloud`; offline never cloud; generate never device; `checking` never device; `cloudAvailable: false` never yields `cloud`). — R6.3, R7.1, R9.3
- [ ] 4. **[kiro]** `packages/ai/src/edit/edit-doc.ts`: `editDoc`, `splitEditDoc`, `editablePaths`, `fieldGuide`. Tests on `big-number`, `stat-punch`, `hook-statement` and `versus`; property P2 (round-trip; no `/beats` or `/images` path; at most 40 paths); a test that no component or scene schema has a top-level `timing` key. — R7.2, R7.7
- [ ] 5. **[kiro]** `edit.patch` v2: input with `fieldGuide` and `paths`, per-call structured output with `op` and `path` enums, the check (paths, apply, split, timing schema, component schema, optional `gate`), `prompts/edit-patch.v2.ts` with no schema text. Remove the `edit.patch` entry from `KNOWN_VIOLATIONS` in `schema-rules.test.ts`; update `/dev/skeleton` to v2. Tests with a scripted provider, and property P1 (any accepted patch leaves params and timing schema-valid; rejected answers change nothing). — R7.2, R7.3, R7.7
- [ ] 6. **[kiro]** `note.fix` task (`tasks/note-fix.ts`, `prompts/note-fix.v1.ts`): input per design (region, `regionText`, optional JPEG), media only with an image, the shared check. **Before coding, confirm with Context7 that AI Logic's on-device route accepts `inlineData` JPEG parts in `generateContent`** (hybrid-ai.md says JPEG/PNG are supported) and note the result here. Covered by `schema-rules.test.ts` (prompt size within the on-device limit, no schema text). Tests with and without an image. Put the Context7 finding in this task's note. — R8.4, R8.5
- [ ] 7. **[kiro]** Commands in `apps/web/lib/commands/`: `applyVersion` (with pruning to 20), `restoreVersion`, `setSlotTiming`, `setSlotPrompt`, `markFailed`, `addNote`, `updateNote`, `deleteNote`, `setNoteStatus`. `addNote` and `updateNote` check the shape (circle: 3 or 4 values; path: an even count, 4..128 values; every value in 0..1) and reject an invalid one without changing the project (review F11). Property P3 (`undo(do(s)) == s` for each; random sequences mixed with the spec 04 commands keep the invariants; `currentVersionId` always names an existing version; never more than 20 versions per slot; an invalid note shape is rejected and changes nothing). — R2.2, R4.2, R4.3, R5.1, R5.3, R5.4, R6.1 (`setSlotPrompt`), R6.5, R6.6, R8.2, R8.3, R8.5–R8.7

## B. Motion engine: timing

- [ ] 8. `CompileSlot.timing` from `slot.timing` (`project-to-compile.ts`), `withTiming(style, timing)` in `packages/motion/src/runtime/timing.ts`, per-clip styles in the runtime, and the stage option `exit: 'none'` for scenes with `fade: false`. Samples `show-slow`, `show-fast`, `show-cut` for `stat-punch` and `hook-statement`; `motion:check` for both in 3 formats with 0 failures; one contact-sheet pass of the new samples in plain and `field-notes`. Parity unchanged (`services/render/scripts/parity.ts`). — R4.2–R4.5
- [ ] 9. **[kiro]** Properties for task 8 (P8): for random scores, words and speeds in [0.5, 2], anchored cues land within ± 80 ms of their word when the slot allows; `fade: false` keeps every landed actor visible to the last frame; `assertSeekPure` with random timings; `withTiming` is pure and leaves unset fields at the look's values. — R4.4, R4.5

## C. App plumbing

- [ ] 10. Availability and connection: `lib/ai/availability.ts` and the `useAIStatus` store (Prompt API status, `initializeDeviceModel` only from the setup click with a progress toast, online/offline events); the once-per-session toasts with the exact strings; `OfflineBanner` over the preview. **Before coding, check the Prompt API `availability()` options and the AI Logic `initializeDeviceModel` signature with Context7** and note the result in this task. — R9.1, R9.2, R9.4
- [ ] 11. **[kiro]** Needs spec 13 task 1. `CreditsClient` interface (with `ClientCreditAction` imported from `@motionpop/schemas`, not written here; spec 13 task 8 has nothing to replace) and `LocalCredits` (120, in memory, never negative; ids `s-{key}` and `r-{key}`; idempotent by key; a refunded key answers `key-used`, as the server does) in `apps/web/lib/credits/`. The shared `describe.each` contract test (`LocalCredits` now, `ServerCredits` added by spec 13 task 8). `fake-router.ts` behind `NEXT_PUBLIC_FAKE_AI=1` (rules from the design; runs the task's input parse and check) with the failure switches `?fakeFail=generate|edit|note|all` and the seeded `?fakeFailRate=` / `?fakeSeed=` (review F7), unit-tested. `NEXT_PUBLIC_FAKE_AI=1` goes in the env of **both** Playwright web servers (the `chromium` one and the one the `auth` project uses). Unit tests: the production guard (P9) and a test that reads `apphosting.yaml`, committed `.env*` files and the CI build steps and fails if any sets `NEXT_PUBLIC_FAKE_AI`, since the value is inlined at build. — R6.2, R6.6, testing
- [ ] 11b. Credits wiring (UI), before the spec 13 block is checked:
  - `useCreditsClient()` as in the design table: `LocalCredits` only without Firebase or with the fake-AI flag, none otherwise, so `cloudAvailable` is false with "Cloud AI is coming soon" while Firebase is on and `ServerCredits` is missing (review F2). Unit-test the table.
  - The top bar chip (`components/editor/top-bar.tsx`) reads `useCreditsClient().balance()` with the rolling number, and `CREDITS_PLACEHOLDER` is deleted (review F3). Spec 13 task 8 changes only the source to `useCredits`.
  - A stub `OutOfCreditsModal` (same props as spec 13's) so R6.3 and task 21 have something to open; spec 13 task 9 replaces it.
  - — R6.3, R9.3, NFR (no surprise spend)

## D. Inspector UI

- [ ] 12. Inspector rebuild: split sections into `components/inspector/` (header with the ⋯ menu, You said, prompt box, quick-edit row with the computed chip, CONTENT, STYLE, TIMING, VERSIONS), matching the CSS measurements in the design. — R1.1, R1.2, R1.4
- [ ] 13. Content form: **[kiro]** `lib/inspector/content-form.ts` (`contentForm`, `setField`) with property P6 and tests on the four registered ids; then the UI (title field, compact fields, data table with dots, enum dropdowns, toggles, error state, gate warning, collapse). — R2.1–R2.5
- [ ] 14. STYLE row (swatch, look dropdown, SetStyle, tooltip) and TIMING row (ease picker with drawn curves, Fade toggle with the component case, duration slider kept). — R3.1, R3.2, R4.1–R4.3
- [ ] 15. VERSIONS strip: glyph tiles, ‹ › paging by three, current outlined, "vN", tooltip, restore on click, greyed tiles from another component; the top bar history button scrolls to VERSIONS or shows the toast. — R5.2, R5.3, R5.5
- [ ] 16. Quick edit UI: submit, shimmer, "Ready in X.Xs" badge, recompile, escalate message with "Generate ☁ 3", "Couldn't do that on your device." with "Try in the cloud ☁ 1", the slot-changed toast, Pip bubble states. Unit test of the flow with the fake router. — R7.1–R7.6
- [ ] 17. **[kiro]** `prompt.prefill` task and the template fallback (`templatePrompt`), wired into the prompt box for empty prompts (device or template, never cloud). Tests. — R6.1

## E. Generate

- [ ] 18. Needs the whole spec 13 block (tasks 1, 2, 3, 4, 5, 8, 9; table above) on the hosted path. `lib/slots/generate.ts` (`generateSlot`) per the design, the generating panel (replaces the inspector; StepCards, Pip with sparkles, YOUR NEXT MOMENT), slot card phases, the preview progress line and badges, failed state with Retry and "Use a template", ⌘G, one Generate per project ("Pip is on it"). Every attempt draws a new spend key (D-047); a Retry never reuses one. Add a `purpose` parameter to `sceneFillInput` (it hard-codes `'autofill'` today) and extract the inline component input from `use-auto-fill.ts` into `component-fill-input.ts`, so Generate and auto-fill share one builder per kind (review F9). Property P5 against **both** `LocalCredits` and a `ServerCredits` backed in memory by spec 13's pure `decideSpend` / `decideRefund` (a fake fetch) with a randomly failing fake router (balance = start − 3 × successes, never negative, every failure refunded once, spend-refund-spend with one key never `ok: true`). P10, the lint-style test that only `generate.ts` and the edit/note flow call `credits.spend`, and only on a `cloud` route. Compare the panel with `editor-generating.png`. — R1.3, R6.2–R6.9

## F. Frame notes

- [ ] 19. **Spike:** frame capture (`lib/notes/capture.ts`) per the design: time, tainting, fidelity on 3 stills in 16:9 and 9:16. Record the result here and in KIRO_LOG/DEV_LOG; if it fails, `captureRegion` returns `undefined` and notes ship with region text only. — R8.4
- [ ] 20. Frame notes: **[kiro]** `lib/notes/geometry.ts` (`fitStroke`, `regionOf`, `cropRect`, `bubbleAnchor`) with property P7; `region-text.ts` (data-text hit test in the iframe); then the UI (pen toggle and its disabled state, draw layer, ellipse/path, numbered bubble, leader line, save and run `note.fix`, fixed / "Still there?", delete, hide while playing). Compare the note with `editor.png`. — R8.1–R8.7

## G. Verification

- [ ] 21. **[kiro]** Playwright `apps/web/e2e/inspector-hybrid.spec.ts` (local mode, fake AI, `/editor/demo`): select slot 2; edit the title field and see version v4; ⌘Z returns to v3; quick edit "change 40 to 45" with the mint chip, the preview param changes, "Ready in" shows; restore v3 from its tile; draw a note on the frame, type "make it slower", the note shows Fixed and `timing.speed` is 0.8 after reload; `?device=off` shows ☁ 1 on the quick-edit row; Generate on slot 4 moves the credits chip from 120 to 117 and adds a version labelled "Generated"; slot 1 (a planned component) shows Generate disabled with "Coming soon"; `context.setOffline(true)` shows the banner, disables Generate with "Needs connection", and a device quick edit still lands; no page errors. Runs in the `chromium` project with `NEXT_PUBLIC_FAKE_AI=1` (task 11) and is a CI gate once task 24 lands. — R1–R9
- [ ] 22. Design check, one per screen state, at 1440×900. **IDE** (the builder agent has no Chrome DevTools MCP; review F6) for the screenshots, **[kiro]** for the Playwright region:
  - **IDE**, Chrome DevTools MCP: open `/editor/demo?t=5600&select=slot-2` (inspector + frame note) and the same page with a Generate running (generating panel), resize to 1440×900, screenshot, and compare side by side with `design/screens/editor.png` and `editor-generating.png` (inspector column x ≥ 1080, the frame note, the preview badge). Write the differences found and fixed into this task's note.
  - **[kiro]** Add an `inspector` region (`[2160, 112, 720, 1088]` in 2× px) and a `frame-note` region to `e2e/editor-design.spec.ts`, with thresholds from measured runs (1.5× headroom, as the existing regions). — R1.1, R6.4, R8.2
- [ ] 23. **Founder, headed Chrome with the Nano flag (needs a human):** run quick edit and a frame note on the device with wifi on and off; record median latency of 5 runs each, whether AI Logic's on-device path works offline, and whether the image reached Nano; write it to DEV_LOG or KIRO_LOG. If on-device does not work offline, update R9.4 and the banner copy. — NFR, R9.4

## H. CI, steering and decisions (IDE)

- [ ] 24. **IDE (done by Claude Code):** a CI Playwright job (review F8). `.github/workflows/ci.yml` has `check`, `motion`, `secrets` and `rules` and no `playwright test`, and `.github/**` is denied to the builder, so tasks 21 and 22 would not be gates. Claude Code adds one Playwright job (the `chromium` project with the fake AI, plus the `auth` project with Java and the emulators); it is the same job spec 13 task 19 and spec 08 task 21 need, so there is one job, not three. Note "done by Claude Code" here with the commit when it lands. Also add any new sample ids task 8 introduces to the `motion` job's matrix (today it lists `stat-punch` and `hook-statement`; task 8 adds samples to those ids, not new ids). This must land before task 21 is declared done. — testing, workflow rule 4
- [ ] 25. **IDE (after the founder approves the spec):** steering and decisions, the exact edits:
  1. `docs/decisions.md`: add D-035 to D-049 from the design's "Decisions" section. **D-035 (D-09-1) is recorded as a new decision that supersedes D-027's `edit.patch` escalation** ("Supersedes D-027 (edit.patch escalation only)"), with the `security-and-cost.md` and `hybrid-ai.md` rules as the reason. D-034 is spec 08's; spec 13 takes D-050 to D-064.
  2. `.kiro/steering/ai-tasks.md`: §2 `prompt.prefill` is ONLY_ON_DEVICE with a template fallback; §4 input `{ componentId, fieldGuide, paths, current, instruction }` and "Invalid → repair once → offer the cloud (☁ 1, a click)"; §4b add `regionText`, image optional.
  3. `.kiro/steering/hybrid-ai.md` routing table: the `prompt.prefill` row's mode becomes ONLY_ON_DEVICE (template fallback), `edit.patch` / `note.fix` rows say "ONLY_ON_DEVICE or ONLY_IN_CLOUD chosen by `chooseRoute`; escalation is a click".
  4. `.kiro/steering/architecture.md` flow 4 and the failure table: "Invalid → one repair → offer the cloud (☁ 1, a click)".
  5. `.kiro/steering/component-library.md`: the shared `timing` block is slot-level, `fade` means exit vs cut.
  6. `.kiro/steering/data-model.md`: `Slot.timing`, `Version.timing`, `FrameNote.fixedVersionId`, circle points `[cx, cy, rx, ry]`, and `FrameNote.tMs` is relative to the slot start.
  7. `.kiro/steering/structure.md`: `apps/web/lib/{credits,notes,inspector}` and `packages/ai/src/edit/`.
  8. `.kiro/steering/screens.md`: the strings in the design's list, including "Cloud AI is coming soon".
  — workflow rule 1

## Later (after Nov 30)

- Per-slot looks (`Slot.styleId`) with per-clip background in the compiler (D-09-2).
- Rendered version stills instead of glyphs (D-09-7).
- Variant ("Layout") picker in CONTENT.
- Queue Generate requests made offline and run them on reconnect (the banner's "when you're back").
- Project-wide version history from the top bar.
- Frame notes on several slots at once and note threads.
- Brand-kit colour quick edits ("use my brand orange") once spec 16's brand kit exists.

# Tasks: 09 inspector, quick edits and frame notes

_Written headlessly by Kiro CLI (`motionpop-builder`, Opus 5.5), 2026-11-16. Requirements and design not yet approved by the founder._

One task at a time. Each ends with the definition of done for the packages it touches (prettier, typecheck, lint with 0 warnings, tests read, not just run). Motion tasks also pass `pnpm motion:check <id>`, and UI tasks are compared with the PNG at 1440×900. A bug found by a property test gets a regression test and a log note (testing.md). **[kiro]** marks tasks for headless Kiro CLI runs (`motionpop-builder`), logged in `KIRO_LOG.md`.

**Dependency:** task 18 (Generate) on the hosted path needs spec 13 tasks 1–5 (ledger core and the spend route). Run those right after task 11 here; everything else in this spec works in local mode with `LocalCredits`.

**If time runs short, cut in this order:** the frame capture image (task 19: notes ship with region text only), the ease picker (keep Fade and duration), version glyph paging (show the last 3 only), prompt pre-fill on the device (keep the template). Never cut: on-device quick edit, frame notes with `note.fix`, Generate with its cost chip, the offline banner, the toasts.

## A. Data and AI contracts

- [ ] 1. **[kiro]** Schemas in `packages/schemas/src/project.ts`: `SlotTimingSchema` and `Slot.timing?`; `Version.timing?`; `FrameNote.fixedVersionId?` and the shape refine (circle 3 or 4 values, path even and 4..128 values, all in 0..1); `VERSIONS_PER_SLOT = 20`. Tests: the demo fixture and every saved shape still parse; bad shapes are rejected; random valid timings round-trip. — R4.2–R4.4, R5.4, R8.2
- [ ] 2. **[kiro]** Router: `run(task, input, { mode, allowCloud })` (`allowCloud: false` disables the cloud fallback for that call); `UsageEvent.cloudCost` on every event. Tests in `router.test.ts`: no cloud attempt with `allowCloud: false` after a bad device answer; existing behaviour unchanged without the option; `cloudCost` present on success and failure. — R7.4, R9.5
- [ ] 3. **[kiro]** `apps/web/lib/ai/route.ts`: `chooseRoute` and `chipFor` per design, with a table test of every rule and the fast-check property P4 (no surprise spend: device/local routes never carry credits or `allowCloud`; offline never cloud; generate never device; `checking` never device). — R6.3, R7.1, R9.3
- [ ] 4. **[kiro]** `packages/ai/src/edit/edit-doc.ts`: `editDoc`, `splitEditDoc`, `editablePaths`, `fieldGuide`. Tests on `big-number`, `stat-punch`, `hook-statement` and `versus`; property P2 (round-trip; no `/beats` or `/images` path; at most 40 paths); a test that no component or scene schema has a top-level `timing` key. — R7.2, R7.7
- [ ] 5. **[kiro]** `edit.patch` v2: input with `fieldGuide` and `paths`, per-call structured output with `op` and `path` enums, the check (paths, apply, split, timing schema, component schema, optional `gate`), `prompts/edit-patch.v2.ts` with no schema text. Remove the `edit.patch` entry from `KNOWN_VIOLATIONS` in `schema-rules.test.ts`; update `/dev/skeleton` to v2. Tests with a scripted provider, and property P1 (any accepted patch leaves params and timing schema-valid; rejected answers change nothing). — R7.2, R7.3, R7.7
- [ ] 6. **[kiro]** `note.fix` task (`tasks/note-fix.ts`, `prompts/note-fix.v1.ts`): input per design (region, `regionText`, optional JPEG), media only with an image, the shared check. **Before coding, confirm with Context7 that AI Logic's on-device route accepts `inlineData` JPEG parts in `generateContent`** (hybrid-ai.md says JPEG/PNG are supported) and note the result here. Covered by `schema-rules.test.ts` (prompt size within the on-device limit, no schema text). Tests with and without an image. — R8.4, R8.5
- [ ] 7. **[kiro]** Commands in `apps/web/lib/commands/`: `applyVersion` (with pruning to 20), `restoreVersion`, `setSlotTiming`, `setSlotPrompt`, `markFailed`, `addNote`, `updateNote`, `deleteNote`, `setNoteStatus`. Property P3 (`undo(do(s)) == s` for each; random sequences mixed with the spec 04 commands keep the invariants; `currentVersionId` always names an existing version; never more than 20 versions per slot). — R2.2, R4.2, R4.3, R5.1, R5.3, R5.4, R6.5, R6.6, R8.3, R8.5–R8.7

## B. Motion engine: timing

- [ ] 8. `CompileSlot.timing` from `slot.timing` (`project-to-compile.ts`), `withTiming(style, timing)` in `packages/motion/src/runtime/timing.ts`, per-clip styles in the runtime, and the stage option `exit: 'none'` for scenes with `fade: false`. Samples `show-slow`, `show-fast`, `show-cut` for `stat-punch` and `hook-statement`; `motion:check` for both in 3 formats with 0 failures; one contact-sheet pass of the new samples in plain and `field-notes`. Parity unchanged (`services/render/scripts/parity.ts`). — R4.2–R4.5
- [ ] 9. **[kiro]** Properties for task 8 (P8): for random scores, words and speeds in [0.5, 2], anchored cues land within ± 80 ms of their word when the slot allows; `fade: false` keeps every landed actor visible to the last frame; `assertSeekPure` with random timings; `withTiming` is pure and leaves unset fields at the look's values. — R4.4, R4.5

## C. App plumbing

- [ ] 10. Availability and connection: `lib/ai/availability.ts` and the `useAIStatus` store (Prompt API status, `initializeDeviceModel` only from the setup click with a progress toast, online/offline events); the once-per-session toasts with the exact strings; `OfflineBanner` over the preview. **Before coding, check the Prompt API `availability()` options and the AI Logic `initializeDeviceModel` signature with Context7** and note the result in this task. — R9.1, R9.2, R9.4
- [ ] 11. **[kiro]** `CreditsClient` interface and `LocalCredits` (120, in memory, idempotent by key, never negative) in `apps/web/lib/credits/`; `fake-router.ts` behind `NEXT_PUBLIC_FAKE_AI=1` (rules from the design; runs the task's input parse and check), added to the Playwright local env; unit tests including the production guard (P9). — R6.2, R6.6, testing

## D. Inspector UI

- [ ] 12. Inspector rebuild: split sections into `components/inspector/` (header with the ⋯ menu, You said, prompt box, quick-edit row with the computed chip, CONTENT, STYLE, TIMING, VERSIONS), matching the CSS measurements in the design. — R1.1, R1.2, R1.4
- [ ] 13. Content form: **[kiro]** `lib/inspector/content-form.ts` (`contentForm`, `setField`) with property P6 and tests on the four registered ids; then the UI (title field, compact fields, data table with dots, enum dropdowns, toggles, error state, gate warning, collapse). — R2.1–R2.5
- [ ] 14. STYLE row (swatch, look dropdown, SetStyle, tooltip) and TIMING row (ease picker with drawn curves, Fade toggle with the component case, duration slider kept). — R3.1, R3.2, R4.1–R4.3
- [ ] 15. VERSIONS strip: glyph tiles, ‹ › paging by three, current outlined, "vN", tooltip, restore on click, greyed tiles from another component; the top bar history button scrolls to VERSIONS or shows the toast. — R5.2, R5.3, R5.5
- [ ] 16. Quick edit UI: submit, shimmer, "Ready in X.Xs" badge, recompile, escalate message with "Generate ☁ 3", "Couldn't do that on your device." with "Try in the cloud ☁ 1", the slot-changed toast, Pip bubble states. Unit test of the flow with the fake router. — R7.1–R7.6
- [ ] 17. **[kiro]** `prompt.prefill` task and the template fallback (`templatePrompt`), wired into the prompt box for empty prompts (device or template, never cloud). Tests. — R6.1

## E. Generate

- [ ] 18. `lib/slots/generate.ts` (`generateSlot`) per the design, the generating panel (replaces the inspector; StepCards, Pip with sparkles, YOUR NEXT MOMENT), slot card phases, the preview progress line and badges, failed state with Retry and "Use a template", ⌘G, one Generate per project ("Pip is on it"). Property P5 with `LocalCredits` and a randomly failing fake router (balance = start − 3 × successes, never negative, every failure refunded once). Hosted path: swap in spec 13's `ServerCredits`. Compare the panel with `editor-generating.png`. — R6.2–R6.9

## F. Frame notes

- [ ] 19. **Spike:** frame capture (`lib/notes/capture.ts`) per the design: time, tainting, fidelity on 3 stills in 16:9 and 9:16. Record the result here and in KIRO_LOG/DEV_LOG; if it fails, `captureRegion` returns `undefined` and notes ship with region text only. — R8.4
- [ ] 20. Frame notes: **[kiro]** `lib/notes/geometry.ts` (`fitStroke`, `regionOf`, `cropRect`, `bubbleAnchor`) with property P7; `region-text.ts` (data-text hit test in the iframe); then the UI (pen toggle and its disabled state, draw layer, ellipse/path, numbered bubble, leader line, save and run `note.fix`, fixed / "Still there?", delete, hide while playing). Compare the note with `editor.png`. — R8.1–R8.7

## G. Verification

- [ ] 21. **[kiro]** Playwright `apps/web/e2e/inspector-hybrid.spec.ts` (local mode, fake AI, `/editor/demo`): select slot 2; edit the title field and see version v4; ⌘Z returns to v3; quick edit "change 40 to 45" with the mint chip, the preview param changes, "Ready in" shows; restore v3 from its tile; draw a note on the frame, type "make it slower", the note shows Fixed and `timing.speed` is 0.8 after reload; `?device=off` shows ☁ 1 on the quick-edit row; Generate on slot 4 moves the credits chip from 120 to 117 and adds a version labelled "Generated"; slot 1 (a planned component) shows Generate disabled with "Coming soon"; `context.setOffline(true)` shows the banner, disables Generate with "Needs connection", and a device quick edit still lands; no page errors. — R1–R9
- [ ] 22. **[kiro]** Design check, one per screen state, at 1440×900:
  - Chrome DevTools MCP: open `/editor/demo?t=5600&select=slot-2` (inspector + frame note) and the same page with a Generate running (generating panel), resize to 1440×900, screenshot, and compare side by side with `design/screens/editor.png` and `editor-generating.png` (inspector column x ≥ 1080, the frame note, the preview badge). Write the differences found and fixed into this task's note.
  - Add an `inspector` region (`[2160, 112, 720, 1088]` in 2× px) and a `frame-note` region to `e2e/editor-design.spec.ts`, with thresholds from measured runs (1.5× headroom, as the existing regions). — R1.1, R6.4, R8.2
- [ ] 23. **Founder, headed Chrome with the Nano flag (needs a human):** run quick edit and a frame note on the device with wifi on and off; record median latency of 5 runs each, whether AI Logic's on-device path works offline, and whether the image reached Nano; write it to DEV_LOG or KIRO_LOG. If on-device does not work offline, update R9.4 and the banner copy. — NFR, R9.4

## Later (after Nov 30)

- Per-slot looks (`Slot.styleId`) with per-clip background in the compiler (D-09-2).
- Rendered version stills instead of glyphs (D-09-7).
- Variant ("Layout") picker in CONTENT.
- Queue Generate requests made offline and run them on reconnect (the banner's "when you're back").
- Project-wide version history from the top bar.
- Frame notes on several slots at once and note threads.
- Brand-kit colour quick edits ("use my brand orange") once spec 16's brand kit exists.

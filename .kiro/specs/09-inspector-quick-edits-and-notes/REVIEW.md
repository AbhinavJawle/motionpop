# 09 · Inspector, quick edits and frame notes: spec review

_Reviewer: `spec-reviewer` (read-only), model claude-sonnet-5.5. Read: `requirements.md`, `design.md`, `tasks.md`, spec 13 (all three files, for the seam), spec 08's requirements and review, all of `.kiro/steering/` that applies, `docs/decisions.md` (last id D-033, D-034 is taken by spec 08's draft), `firestore.rules`, `.github/workflows/ci.yml`, `apps/web/playwright.config.ts`, `.kiro/agents/motionpop-builder.json`, `.kiro/settings/mcp.json`, and the code the spec reuses. I had no way to run tests or read `node_modules`, so the `@firebase/ai` 3.1.0 and `@hyperframes/player` 0.9.46 claims are unverified; the spec already sends task 6 and task 10 to Context7._

## Verdict: ready after fixes

The spec is thorough, matches steering on routing and chips, and its pure-function approach (`chooseRoute`, `editDoc`, commands) is easy to test. Requirements are numbered, EARS-style and almost all traced to tasks. Nine of nine properties have an owning task. Two findings (F1, F2) can charge nobody or everybody wrongly once spec 13 lands, and a third (F3) leaves tasks 18 and 21 without their inputs. Fix F1 to F6 before task 1; the rest can be fixed on the way.

## The 09 ↔ 13 seam

Spec 13's ledger must land before Generate (task 18). `tasks.md` says "spec 13 tasks 1–5". That is not enough, and two of the contracts disagree.

| What task 18 needs | Where it is built | In the "1–5" block? |
|---|---|---|
| `POST /api/credits/spend` and `/refund`, ledger transaction | 13 tasks 3–5 | yes |
| `ServerCredits` (the `CreditsClient` the app calls) | 13 task 8 | **no** |
| Out-of-credits modal (R6.3 opens it) | 13 task 9 | **no** |
| Top-bar chip reading the live balance | 13 task 8 | **no** |
| `CreditAction`, cost values | 13 tasks 1–2 | tasks 1–2 yes, but 09 task 3 and task 11 are written before them |

Details are in F1, F2, F3 and F9.

## Findings, by severity

### High

**F1. A retry with the same spend key is a free cloud call (seam with 13).**
- Evidence: design "Generate" step 2 says the key is "a 32-character random key per click; a retry of the same click reuses it". Spec 13 `decideSpend` runs "replay → paused → rate limit → insufficient → charge" and its `existing` input carries only `{ delta, balanceAfter }`. A replay returns the first `ok: true` answer, and nothing records that `r-{key}` already refunded it.
- Effect: Generate fails, the app refunds `s-{key}`, the user hits Retry with the same key, the server answers `ok: true, replay`, the cloud call runs, and nothing is charged. P5 would not catch it, because `LocalCredits` is the model and it is "idempotent by key" in whatever way the implementer picks.
- Fix (09): task 18 uses a new key for every attempt. The only reuse allowed is a network resend of the same attempt when no response arrived. Say so in the design and in R6.2.
- Fix (13, listed there as F1): a replay of a refunded spend answers `refuse: key-used`, and the client then takes a new key.
- Fix (test): run P5 against a `ServerCredits` backed by the pure `decideSpend` / `decideRefund` of spec 13 in memory (a fake fetch), not only against `LocalCredits`. Add the case "spend, refund, spend with the same key never returns `ok: true`".

**F2. Before `ServerCredits` exists, the hosted build can run real cloud calls against fake credits.**
- Evidence: the design's "Credits seam" says `useCreditsClient()` picks `LocalCredits` until spec 13, and `RouteInput.cloudAvailable` is "false in local mode (no Firebase) or signed out". A hosted build has Firebase and a signed-in user, so `cloudAvailable` is true, `LocalCredits` starts at 120, and `getRouter()` calls real AI Logic. Task 18 says only "Hosted path: swap in spec 13's `ServerCredits`".
- Effect: if tasks 18 and the hosted deploy land before 13 task 8, every Generate in production is free and unmetered (the cost of a mistake here is real money on the Blaze account).
- Fix: in `useCreditsClient()` return `LocalCredits` only when `firebaseEnabled()` is false or `NEXT_PUBLIC_FAKE_AI=1`. With Firebase on and no `ServerCredits` yet, `cloudAvailable` must be false (copy: "Cloud AI is coming soon", not "Sign in to use cloud AI"). Add a unit test of that table. Better, also fix F3 so the situation cannot arise.

**F3. The seam tasks are not scheduled together, and nothing wires the chip to the client.**
- Evidence: see the table above. `tasks.md` says the top bar chip "reads `LocalCredits`" until spec 13 wires it (design "Credits seam"), but no 09 task touches `components/editor/top-bar.tsx`. Task 21 expects "the credits chip from 120 to 117" in local mode, and today the chip is `CREDITS_PLACEHOLDER = 120` with `onClick={() => toast(...)}` (top-bar.tsx lines 24–91).
- Fix:
  1. Change the dependency line to "spec 13 tasks 1, 2, 8 (without the chip) and 9, then 3–5" and tell spec 13 to move them (its REVIEW F3 asks the same).
  2. Add to task 11 (or a new task 11b): `useCreditsClient()`, the top-bar chip reading `balance()`, and the out-of-credits modal stub that spec 13 task 9 replaces. R6.3 and task 21's "credits chip" step need it.
  3. Do 13 task 1 (schemas) and 2 (`costOf`) before 09 tasks 3 and 11, so `chooseRoute` takes `cloudCost` from `costOf('edit' | 'generate')` and `CreditAction` is imported, not written twice (13 task 8 says it will replace the 09 type, which is rework). `GENERATE_COST = 3` and `cloudCost: () => 1` are hard-coded today in `packages/ai/src/tasks`.

### Medium

**F4. `FrameNote.tMs` becomes slot-relative, but the fixture stores a project-absolute value.**
- Evidence: R8.3 and "Edge cases" say `tMs` is relative to the slot start. `apps/web/lib/projects/fixture.ts` has `note-1` on slot 2 (4200–7800 ms) with `tMs: 5600`, the project time shown in `editor.png`. Nothing else reads `tMs` today (grep), and every other time in the project is absolute (`architecture.md`: "integer milliseconds from the start of the cleaned voiceover"). Relative, 5600 ms is past the end of a 3600 ms slot.
- Effect: the design check URL `/editor/demo?t=5600&select=slot-2` would show no note (it is clamped or hidden), and the demo note disappears from the editor.
- Fix: keep it relative if you want notes to move with the slot (a good reason), but task 1 must change the fixture to `tMs: 1400`, add one sentence to `data-model.md` in the steering updates, and add a test that the demo note shows at playhead 5600.

**F5. No task writes the steering and decisions this spec changes.**
- Evidence: "Steering updates to make on merge" lists seven files, and the decisions D-09-1 to D-09-11 are "to log on merge". `workflow.md` rule 1 says to update steering and log decisions when a decision changes; D-09-1 overturns D-027 and `ai-tasks.md` §4 ("Invalid → repair once → cloud"), which `architecture.md` flow 4 repeats. The builder agent cannot write steering (`.kiro/agents/motionpop-builder.json` denies `.kiro/steering/**`; `docs/**` is not in its allowed paths).
- Fix: add a final task "Steering and decisions (IDE, after approval)", as spec 08 task 23 does. Use ids from D-035 up (D-034 is reserved by spec 08); the repo uses `D-0NN`, not `D-09-N`. Add two items to the update list that are missing: `prompt.prefill` becomes ONLY_ON_DEVICE (`ai-tasks.md` §2 and the `hybrid-ai.md` table say PREFER), and `tMs` is slot-relative (F4).

**F6. Several `[kiro]` tasks need tools the headless agent does not have.**
- Evidence: `motionpop-builder.json` allows MCP only for `context7/*`, and headless "every ask is a deny" (handoff §5). Task 22 is `[kiro]` and uses the Chrome DevTools MCP; the agent also cannot run `curl*`. Tasks 6 and 10 use Context7, which is allowed.
- Fix: mark task 22's screenshot half "IDE" (or add `chrome-devtools/*` to the agent's V2 `allowedTools` from the IDE, then `kiro-cli agent upgrade`), and keep only the Playwright region addition `[kiro]`. Same fix in spec 13 task 18.

**F7. The fake router has no way to fail, and spec 13's e2e needs one.**
- Evidence: the design's fake-router rules cover "slower", "faster", "change A to B", colours and `escalate`. Spec 13 task 17 runs "a fake failing Generate → back to 17 with a Refund +3 row". Task 18's P5 uses "a randomly failing fake router" but only in unit tests.
- Fix: add `?fakeFail=generate|edit|note|all` (and a seeded `?fakeFailRate=`) to `fake-router.ts`, listed in task 11, with a unit test. Put `NEXT_PUBLIC_FAKE_AI=1` in the env of both Playwright web servers (the `chromium` and the `auth` one), and add a check that `apphosting.yaml` and the production build never set it (the production guard in P9 is runtime only, and `NEXT_PUBLIC_*` is inlined at build).

**F8. Playwright is not in CI, so tasks 21 and 22 are not gates.**
- Evidence: `.github/workflows/ci.yml` has `check`, `motion`, `secrets` and `rules` jobs, and no job runs `playwright test`. `workflow.md` item 4 and handoff §9 want every gate in CI. `.github/**` is denied to the builder.
- Fix: add an IDE task "CI: Playwright job (chromium project, fake AI)", before task 21 is declared done. Add `versus` and any new sample ids to the motion matrix if task 8 adds them (the matrix already lists `stat-punch` and `hook-statement`).

**F9. The scene-fill helper is "auto-fill only" and hard-codes `purpose: 'autofill'`.**
- Evidence: `apps/web/lib/slots/scene-fill.ts` line 72 onward: `sceneFillInput` returns `purpose: 'autofill'` and its doc says "Auto-fill only: on the device, free". The design's Generate step 4 says "scenes via the existing `sceneFillInput`" with `purpose: 'generate'`. For components the design says "the spec 06 input", but that input is built inline in `use-auto-fill.ts`, not in a reusable function.
- Fix: task 18 adds a `purpose` parameter to `sceneFillInput` and extracts the component input into the same file, so Generate and auto-fill share one builder. Note it in the task.

**F10. The demo quick edit "slower" depends on the motion-timing tasks, which the cut order does not protect.**
- Evidence: the fake router and `ai-tasks.md` §4 use "slower → `/timing/speed 0.8`". That only changes the picture after tasks 4, 5 and 8 (edit doc, v2 task, `withTiming`). The cut order protects "on-device quick edit" but lists no fallback if task 8 slips; there are 23 tasks for Nov 23.
- Fix: add an order with a checkpoint to `tasks.md`: demo path first (1, 2, 3, 4, 5, 7, 10, 11, 12, 16, 18), then timing (8, 9, 14), then notes (19, 20), then the rest. State that a content-only quick edit ("change 40 to 45") is the fallback demo edit if task 8 is cut.

### Low

- **F11. The frame-note shape refine breaks the schema policy.** `packages/schemas/src/project.ts` documents that limits are "enforced by commands, not here, so loading a saved project never fails because of a limit". Task 1 puts a refine on `FrameNote.shape` (lengths, 0..1 range), so one bad saved note makes the whole `EditorProjectSchema` fail. Check the shape in `addNote` / `updateNote` instead, and leave the schema as a doc comment.
- **F12. Traceability gaps.** R1.3 (generating replaces the inspector) is cited by no task (task 18 cites R6.2–R6.9). R6.1's second sentence (`setSlotPrompt`) is built in task 7 but task 7 does not cite R6.1. Add both.
- **F13. "No code path charges credits" is stronger than what is tested.** The non-functional line says it is property-tested in task 3, but P4 covers only `chooseRoute`. Reword to "the route and the chip come from one function (P4), and every spend call site is `generateSlot` or an edit flow that checks `route.kind === 'cloud'` first", and add a lint-style test that no file calls `credits.spend` outside `lib/slots/generate.ts` and the edit/note flow.
- **F14. `LocalCredits` ids should look like the server's.** Give `LocalCredits.spend` the id `s-{key}`, so one contract test (a `describe.each` over `LocalCredits` and `ServerCredits` with a fake fetch) proves they behave the same, including F1.
- **F15. Region text needs the same-origin iframe.** D-021 makes tier-2 previews opaque, so `regionText` will be empty there. Not a problem for Nov 30 (tier 2 is spec 15); add one line to "Edge cases" so spec 15 remembers.
- **F16. Task 6 and 10 "before coding" checks are good.** Keep them, and put their findings in the task note, as the text says.

## Checks that passed

- **EARS and numbering:** R1 to R9 are numbered and written as WHEN/IF/WHILE/WHERE or ubiquitous THE SYSTEM SHALL. The non-functional lines name how they are measured (task 23), not assumed.
- **Traceability:** every task cites requirement ids, except tasks 21 and 23 (acceptable, they cite ranges or NFR).
- **Hybrid routing (`hybrid-ai.md`):** one `chooseRoute` drives both the chip and the router call, `checking` never shows a mint chip, offline disables cloud with "Needs connection", and `initializeDeviceModel` only runs from a click. The deviation from the routing table (explicit ONLY_* modes, escalation by click) is argued in D-09-1 against `security-and-cost.md` ("show the cost before every credited action"), which is the right call.
- **Router reality:** `createRouter.run(task, input, { mode })` exists and `cloudFallback: true` is set on `edit.patch` today, so `allowCloud` is a real, small change. `UsageEvent` has no `cloudCost` yet (new, as the spec says). The kill-switch behaviour in the router matches the design.
- **Code reuse:** `applyParamsPatch`, `updateParams`, `resizeSlot`, `duplicateSlot`, `setStyle`, `composite`, `sceneGate`, `sceneFallback`, `safeScoreFromWords`, `validateParams`, `schemaFor`/`sceneFor` (the web registry already knows scenes), `parseSpokenNumber` (handles digits, `k`, `%`), `StepCard`, `Shimmer`, `NumberRoll`, `Dropdown`, `Toggle`, `Modal`, `CreditsChip`, Pip `empty-pockets`, `e2e/editor-design.spec.ts` all exist. `KNOWN_VIOLATIONS['edit.patch']` exists exactly as the spec says. The fixture has slot 1 (`title-card`) and slot 3 (`map-zoom`) unregistered, and `components` holds only `big-number`, so the "Coming soon" edge case is real.
- **Security and cost:** no new Firestore or Storage paths; crops stay on the device unless a cloud action is clicked; the server (spec 13) computes cost; no secrets; no GSAP; no brand names.
- **Testing:** P1 to P9 each have a task; unit, property, motion, e2e and design checks are all present; rules tests are correctly "none new". `testing.md` properties for quick-edit patches and command undo are both covered.
- **Scope:** the "Later" list is sensible, and the cut order protects the demo path. The Kiro share is about 13 of 23 tasks.

## Top findings

1. **F1** A retried Generate with the same key is free after a refund. New key per attempt, and `key-used` on the server.
2. **F2** Until `ServerCredits` exists, a hosted build runs real cloud AI against fake credits. Disable the cloud route unless `ServerCredits` is present.
3. **F3** The "13 tasks 1–5" prerequisite omits `ServerCredits`, the modal and the chip wiring, and no 09 task wires the chip. Reschedule 13 tasks 1, 2, 8, 9 early and add the wiring to task 11.
4. **F4** `tMs` becomes slot-relative but the demo note stores 5600 (absolute). Change the fixture to 1400.
5. **F5** No task writes the steering and decisions, and D-09-1 overturns D-027. Add an IDE task.
6. **F6, F8** Task 22 needs MCP the builder does not have, and Playwright is not in CI.

# 10 · Pip panel: spec review

_Reviewer: `spec-reviewer` (read-only), model claude-sonnet-5.5, 2026-11-16. Read: `requirements.md`, `design.md`, `tasks.md`, the steering files that apply, `docs/decisions.md`, `firestore.rules`, `storage.rules`, `packages/schemas/src/user.ts`, the editor store, commands and rail code, and specs 08, 11 and 12. I had no shell, so I could not run git or the tests. Specs 09 and 13 have no folder yet, so those seams are checked against `docs/plan.md`, the steering files and what the specs assume._

## Verdict: ready after fixes

The design is careful: code plans the route and the cost, the model's output is flat and enforced, and "one undo" has a concrete mechanism with a property for it. Five findings would break a test, a promise to the user or the schedule if left as written (F1 to F5). Fix them before tasks 2, 4 and 11.

## Findings

### High

**F1. The chat rule cannot validate anything: the existing wildcard rule ORs with it.**
- Evidence: `firestore.rules` has `match /projects/{pid} { … match /{sub}/{doc=**} { allow read, write: if signedIn() && projectOwner(pid) == request.auth.uid; } }`. Firestore grants access if **any** matching rule allows it. Adding `match /chat/{msgId}` with "role in [user, pip], text ≤ 2,000, schemaVersion == 1" (R7.4, task 4) changes nothing, because the wildcard already allows the owner's write. `data-model.md` warns about exactly this ("Firestore ORs matches"). The task 4 tests "an unknown role denied" and "a 2,001-character text denied" would fail, or worse, be written to pass against the wrong rule.
- Fix: in task 4 replace the wildcard with explicit sub-collections (`transcript`, `slots`, `versions` as plain owner rules, `chat` with validation), keep the default deny, update the sketch in `data-model.md`, and add a test that an unknown sub-collection name is denied. Spec 11's delete (it lists sub-collections) and any future sub-collection need the same list. Mark the rule edit "IDE" (F5).

**F2. The credit contract does not exist before this spec needs it, and the refund path is open to abuse.**
- Evidence: R8.2 and tasks 7 and 11 call `credits.spend(reason, n, refId)` and `refund` from "spec 13" (Nov 27); this spec lands Nov 24. The interim in task 11 disables cloud sends when Firebase is on ("Credits are on their way"), so the Pip panel's main cloud path, and every generation step, cannot run in the hosted demo until Nov 27, three days before the Firebase deadline. A browser-side AI Logic call cannot be verified by the server, so a client-claimed `refund` after a successful plan or generation is free money (design §7: "credits refunded if not committed" is a client claim).
- Other problems: a retry of a refunded step needs a new `refId`, since ledger ids are fixed (`spend-{refId}`, `refund-{refId}`, the pattern spec 08 §7 uses). `${msgId}:${step.id}` contains `:`, which spec 08's `isSafeId` regex rejects. There is no stated reason for `edit` in `CreditReasonSchema`, and spec 09 (earlier) will also need it.
- Fix: same as spec 11 F1. Pull the spend/refund route, ledger id scheme, `useCredits` and the reason list into a first task that lands before spec 09 and spec 10. In this spec: `refId = {msgId}-{stepNo}-{attempt}`, state the refund limits (window, daily cap) and that undoing a landed step never refunds (R6.4 already says so; say the same for a step discarded by Undo while its cloud call was in flight). Add `'edit'` in the contract task, not here.

**F3. The plan's cost estimate contradicts the apply logic, so "no surprise spend" fails.**
- Evidence: design §4 `planCost`: `updateSlot` = 0 when Nano is available, else 1. Design §7 step 2: when the device edit fails and the user is online, it spends 1 credit and runs the cloud. Nano can be available and still fail (invalid patch after the repair, `escalate: true`). The 1 credit was not in the estimate shown before Apply all. R5.5 says the fallback cost "is included in the estimate". Property 7 says spend never exceeds the estimate; with these rules it can.
- Fix: choose one. (a) The estimate counts the **worst case**: each `updateSlot` is "up to 1", and the hint reads "☁ ~N credits (up to M)". (b) A failed device edit never auto-escalates: the step is "Skipped · Needs the cloud" with a per-step "Ask in the cloud ☁ 1" button, matching how the whole plan route already works (design §0 #2). (b) fits the "hint equals the route used" principle and keeps property 7 true. Update R5.5, design §4 and §7, and property 7.

**F4. `setCaptions` depends on spec 12's task 1, which is bigger than this spec's use of it.**
- Evidence: design §7.2 says "if spec 10 lands first, implement spec 12 tasks 1–2 here and tick them there". Spec 12 task 1 also adds `audio` fields, two Remote Config keys, removes `editorStore.captions` and rebinds the toolbar toggle, and is marked `[kiro]`. Spec 10 lands first (Nov 24 against Nov 26), so this spec absorbs a task that belongs to another spec's schedule, with cross-ticking of boxes.
- Fix: carve out the part this spec needs. Add one task in spec 10 (after task 2): "`captions` field on `EditorProjectSchema` with the default, and `setCaptions` command with `undo(do(s)) == s`". Spec 12 task 1 then lists that part as done. Presets stay `'pop' | 'clean' | 'boxed'`; until spec 12 renders them, the `setCaptions` step is dropped by `enforcePipPlan` with the reason "Captions styles are on their way", so the plan card never promises what the preview cannot show.

**F5. `[kiro]` task 4 edits `firestore.rules`, a root file the headless agent may not write.**
- Evidence: handoff §7 allows only `apps/`, `packages/`, `services/`, `skills/` and `.kiro/specs/`. Spec 08's review F3 raised the same point.
- Fix: the rules test stays `[kiro]` (under `apps/web/rules/`); the rule edit is an IDE step done first, with the test run after.

### Medium

**F6. The default-open panel changes the editor that other checks compare with `editor.png`.**
- Evidence: R1.4 and task 1 open the AI panel by default and shrink the preview. `editor.png` shows no panel. Spec 12 task 19 compares `/editor/demo?t=5600&select=slot-2` with `editor.png`; the existing editor e2e and spec 04's design check also measure the preview box. The store today holds `rail: 'ai'` only as a highlight (no panel exists).
- Fix: honour `?rail=none|ai|…` in the editor. Every design check and existing e2e passes `rail=none` unless it is about the panel. Say in R1.4 that the default applies to first visits only (no stored value). Decide with the founder which one the judge sees first; the Pip PNGs favour open, `editor.png` favours closed.

**F7. The coming-soon list misses the Projects rail item.**
- Evidence: task 1 lists Voice, Styles, Media, Audio, Fonts and Brand. The rail also has Projects (handoff §10), and spec 11 task 20 only builds the real panel on Nov 25. R1.3 says every unbuilt panel shows the state. Fix: add Projects ("Jump to another video without going home.") to the list.

**F8. Steering changes are incomplete.**
- Evidence: §12 lists `ai-tasks.md`, `data-model.md` and `editor-timeline.md`. `hybrid-ai.md`'s routing table still says `pip.plan` is `PREFER_IN_CLOUD`, and its rules say "Pip conversations … go to the cloud". The new device route for slot-scoped messages contradicts both. `data-model.md` also types `RanOn = 'device' | 'cloud'`, while `ChatMessage.ranOn` adds `'code'`.
- Fix: add the `hybrid-ai.md` row and the `RanOn` note to §12, and say in R4.2 that a device plan is still single-turn (history is text inside one prompt).

**F9. The honest "brand colours" reply breaks the founder's own demo journey.**
- Evidence: `product.md` user journey 2 is "asks Pip 'use brand colours everywhere' → Apply all → export". The spec answers "You haven't set brand colours yet" with no steps (design §0 #6), and brand kits are spec 16, first on the cut list. This is already open question 1.
- Fix: do not leave it as a question. Either add a small task now ("three brand colours in a project field, applied by a `setBrandColours` step"), or edit the journey in `product.md` and the demo script in the same change. Journey 2 is the demo of this panel.

**F10. Missing tests for two stated requirements.**
- Evidence: R9.3 (panel open under 100 ms, a code plan under 50 ms) has no timing test; task 14 cites it but is a live cloud check. R8.5 (no user text logged beyond the conversation) has no test.
- Fix: a unit test with a fake clock around `intentPlan` and `enforcePipPlan` (under 50 ms on the demo project); a Playwright assertion for the panel; a test that usage events and `console` output contain no message text.

### Low

- **F11.** `?ai=fake` and `?fixture=` (tasks 12 and 13) must be ignored in production builds. Add one test, as spec 08 does with `renderMode()`.
- **F12.** `PlanStateSchema` has `dismissed` but no requirement or UI sets it. Remove it or add the "dismiss" control.
- **F13.** The plan's `source: 'code'` would show a "free · on-device" chip. The copy says "Planned on your device", which is honest, but the usage chart in spec 13 counts only device and cloud. Decide whether code plans are logged.
- **F14.** `step.credits` for `addSlot` is 0 even when the device fill falls to `safeScoreFromWords`; fine, but state it in §4 so the table is complete.

## Checks that passed

- **EARS and numbering:** 9 groups, numbered, testable. R3.4's hint rules are a decision table in design §4 and are tested by property 6.
- **Traceability:** R1 → task 1; R2 and R3 → 3, 9; R4 → 3, 5, 11; R5 and R6 → 6, 7, 10; R7 → 4, 8, 10; R8 → 5, 7, 11; R9 → 10, 13, 14 (R9.3, R8.5 see F10). Every task cites requirements.
- **Steering:** zod at every boundary (`PipModelOutputSchema`, `ChatMessageSchema`); structured output obeys the schema rules (flat step, enums, sentinels, no `anyOf`); costs computed by code; kill switch and offline handled; ember and violet colour discipline respected; times are integer epoch ms; no brand names; screens without a design follow existing language.
- **Reality:** these exist as the design says: `composite`, `addSlot`, `deleteSlot`, `updateParams`, `setFormat`, `setStyle`, `applyAutoFill`, the `edit-patch`, `component-fill` and `direct-plan` tasks, `PipDock`, `tool-rail` with `setRail`, and `rail` in the editor store. `CreditReasonSchema` already has `generate` and `pip-plan`; `edit` is correctly declared new. New and declared: `setSlotStyle`, `applyGenerated`, `amendTop`, `pip.plan`, the chat repository.
- **Testing:** seven named properties with owners, router tests with a fake provider, rules tests (see F1), an e2e, a design check against both PNGs, and an honest live-cost task (14) with a "say before running" note.

## Seams

- **Spec 08 (export):** none directly. The shared ledger style is the one to copy (F2).
- **Spec 09 (inspector, quick edits):** `updateSlot` steps reuse `edit.patch`; the credit reason `edit` is needed by both (F2). Version history shows `source: 'plan'` versions; the schema already has it.
- **Spec 11:** the left-panel container is built here first (task 1); spec 11 task 20 relies on it. The chat repository follows spec 11 task 6; delete must remove `chat` (spec 11 F2). The rules list in F1 must also cover spec 11's sub-collections.
- **Spec 12:** F4.
- **Spec 13:** F2. Also the 30 cloud generations per hour limit applies to a plan of six generations; a refused spend skips the step with the reason (design §7.2 says so).

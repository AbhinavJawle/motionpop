# Tasks: 10 Pip panel

_Written headlessly in Kiro CLI (claude-opus-5.5), 2026-11-16. Not yet approved by the founder; open questions are at the end._

One task at a time. Definition of done for each: prettier, typecheck, lint (0 warnings) and the touched packages' tests green; UI tasks also pass their design check. **[kiro]** marks tasks suited to the headless `motionpop-builder` agent; they are logged in `KIRO_LOG.md`.

Demo path: tasks 1–13. **Cut in this order if time runs short:** "Edit plan" (task 10; the button then hides), chat persistence to Firestore (task 8 keeps IndexedDB only), the device route for typed slot-scoped messages (task 11 sends every typed message to the cloud; chips stay code-built and free).

## A. Foundations

- [ ] 1. Left panel container (`components/editor/left-panel.tsx`): 340 px between rail and preview, slide + fade 240 ms (reduced motion: instant), collapse chevron at panel x 328 / y 260, Escape and second click on the rail item close it, focus returns to the rail item. Store: `rail: RailItem | null`, persisted in localStorage `mp:rail`, default `ai`. `panels/coming-soon.tsx` for every rail item without a panel (copy per item: Voice "Re-record, replace and clean up your voiceover.", Styles "Pick the look for the video or one slot.", Media "Your images, ready to drop on a slot.", Audio "Music, sound effects and levels.", Fonts / Brand "Your fonts and brand colours, everywhere."); the rail's "on its way" toast goes away. Unit tests for the store; Playwright smoke that the timeline and inspector keep their boxes with the panel open. — R1
- [ ] 2. **[kiro]** `packages/schemas/src/pip.ts` (design §2) exported from `index.ts`; add `'edit'` to `CreditReasonSchema` (the edit.patch cloud fallback, 1 credit, has no reason yet); tests: valid messages and plans parse; a 2,001-character text, an unknown role, a plan with 9 steps, a negative credit and a step label of 61 characters are rejected. — R4.4, R7.1
- [ ] 3. **[kiro]** `apps/web/lib/pip/summary.ts`, `route.ts`, `intent.ts`, `enforce.ts` (+ `planCost`), pure, per design §4–§6, with unit tests per rule and fast-check properties 1 (soundness), 2 (filter) and 6 (route honesty). — R2.2, R3.4, R3.5, R4.2–R4.4, R4.6
- [ ] 4. **[kiro]** `firestore.rules`: validation for `projects/{pid}/chat/{msgId}` (role enum, text ≤ 2,000, `schemaVersion == 1`) on top of the owner rule. Rules tests: owner writes and reads a message; another user can't; an unknown role and a 2,001-character text are denied; the `threadId` query works for the owner. — R7.4

## B. The task and the commands

- [ ] 5. `packages/ai/src/tasks/pip-plan.ts` + `prompts/pip-plan.v1.ts` (design §2–§3): input schema, per-call `jsonSchema` with project enums, `mode` from `input.route`, cloud cost 2, `cloudFallback: false`, `maxRepairs: 1`, thinking `LOW`, on-device system text through `initialPrompts`; export it. Add it to `schema-rules.test.ts`. Router tests with a fake provider: device route never reaches the cloud; one repair then a `RouterError`; usage event recorded. Re-check `onDeviceParams` and `responseConstraint` with Context7 before coding. — R4.1, R4.2, R4.5, R8.1
- [ ] 6. **[kiro]** Commands: `setSlotStyle(id, styleId | null)`, `applyGenerated(...)` (applyAutoFill semantics, version source `plan`), `amendTop` in `history.ts` and `store.amend(expectedTop, next)`. Unit tests plus property 5 (`amendTop` undo equivalence) and `undo(do(s)) == s` for the two new commands in the existing command property suite. — R5.4, R5.5
- [ ] 7. **[kiro]** `lib/pip/step-commands.ts` and `lib/pip/apply.ts` (`runPlan` with injected deps: store, credits, fill, editPatch, clock) per design §7, with unit tests and properties 3 (one undo entry, exact restore), 4 (invariants with interleaved user commands) and 7 (no surprise spend) using fake deps with random failures. — R5.3–R5.6, R6.2, R6.4, R8.2
- [ ] 8. `lib/pip/chat-repo.ts`: Memory, IndexedDB and Firestore implementations, chosen like the project repository (spec 11 task 6: signed in → Firestore, else IDB; if spec 11 task 6 is not done yet, ship Memory + IDB now and add the Firestore one with spec 11 task 6); latest thread, put, clear thread; emulator test for the Firestore one. — R7.1–R7.3

## C. The panel

- [ ] 9. Panel UI, empty state: header ("Pip ▾" menu with New conversation / Clear this conversation with confirm, Style pill with `style-menu.tsx` → `setStyle`, "+"), orb, title, body, suggestion chips from `intentPlan` availability, scope chips, composer (auto-grow, Enter / Shift+Enter, attach and mic tooltips, Style chip inserting "in the {Style} style", send), route hint from `pipRoute`. — R2, R3
- [ ] 10. Thread UI: user message card, "Pip  {reply}", plan card (numbered steps, ✓, "…in progress" pill, "Skipped · {reason}", dropped steps, Edit plan with include toggles and live cost, Apply all), action card (thumbnails, "Updated {n} slots" and the other titles, Undo / Redo with the disabled hints, View on timeline with select + scroll + one pulse), `role="log"` live region, `PipDock` bubble "Pip is thinking…", `beforeunload` warning while applying, reduced motion. — R4.7, R5, R6, R9.2
- [ ] 11. `lib/pip/use-pip.ts` glue: send (route → for cloud `credits.spend('pip-plan', 2, msgId)` → `router.run(pipPlan)` → enforce → persist; refund on failure; code plan fallback; device-failure "Ask in the cloud ☁ 2"), chips (code plan, no model), apply (`runPlan`, balance check, out-of-credits modal, persistence of states), offline and kill-switch states, reload → stopped. Uses the spec 13 credits contract (spec 11 design §8); until it lands, cloud sends are disabled with "Credits are on their way" when Firebase is on, and free in local mode. — R4, R5.3, R7.3, R8

## D. Verification

- [ ] 12. **[kiro]** Playwright `apps/web/e2e/pip-panel.spec.ts` on `/editor/demo` (local mode, fake AI provider behind `?ai=fake` in development only): empty state shows the five designed chips; "Add an opening title at 0:00" → plan card → Apply all → ✓ → action card "Updated 1 slot" and a new slot card at 0:00 → Undo removes it in one step → Redo; a typed message with the fake cloud answer (restyle 3 slots + add title + captions) → Apply all → the three steps land → one ⌘Z restores the project exactly (compare the saved JSON); the panel closes with the chevron and Escape; no page errors. — R2–R6
- [ ] 13. Design check with the Chrome DevTools MCP: `resize_page` 1440×900 at device scale 2; `navigate_page` to `/editor/demo?t=5600&select=slot-2&rail=ai&fixture=pip-empty` and `…&fixture=pip-conversation` (a seeded thread frozen at the designed moment: steps 1–2 done, step 3 running, action card "Updated 3 slots", hint "☁ ~3 credits"); `take_screenshot`; compare with `pip-empty.png` and `pip-conversation.png` region by region (panel, rail, preview toolbar with the zoom label masked, inspector, timeline). Refine the conversation measurements in design §9 from the CSS frame (line 93113) while doing it. Fix, re-check once, log the findings and keep the stills in `.check/design/`. — R9.1
- [ ] 14. _(spends a few cents of Gemini calls on the founder's Blaze project: say so before running)_ Live check: on the demo project, the typed message from the design ("Make every chart use my brand colours and add a title at the start") in the cloud, and "Make this slower" with slot scope on the device; record route, latency, attempts and the plan in KIRO_LOG or DEV_LOG. — R4.1, R4.2, R9.3

## Later (not in the Nov 24 scope)

- Brand colours as a plan step once brand kits exist (spec 16): `setBrand` action, the chip then plans in code.
- Caption translation (`captions.translate`, cloud) and the German chip doing real work.
- Attachments (images from Media, spec 07 tasks 25–26) and voice input through the on-device Whisper worker.
- Earlier conversations ("Pip ▾" → history) and streaming replies.
- Plans that reference slots added by an earlier step of the same plan.

## Open questions for the founder

1. "Use brand colours everywhere" is in the design and in user journey 2, but brand kits are spec 16 (first on the cut list). Should a minimal "three brand colours" override come forward so the chip works in the demo, or is the honest "not yet" reply fine?
2. Suggestion chips are planned in code (free, instant). Is that the hybrid story you want, or should chips also go to Gemini Nano when it's available, so judges see more on-device AI?
3. Undo on the action card also stops a plan that is still applying, and spent credits are not refunded. OK?

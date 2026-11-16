# Tasks: 13 credits, judge plan and settings

_Written headlessly by Kiro CLI (`motionpop-builder`, Opus 5.5), 2026-11-16. Revised the same day (headless run, claude-sonnet-5.5) to apply every finding of `REVIEW.md`. Requirements and design not yet approved by the founder._

One task at a time. Each ends with the definition of done for the packages it touches (prettier, typecheck, lint with 0 warnings, tests read). Server tasks also run `pnpm --filter @motionpop/web test:rules` on the emulator; UI tasks are checked at 1440×900. A bug found by a property test gets a regression test and a log note (testing.md).

- **[kiro]** marks tasks for headless Kiro CLI runs (`motionpop-builder`), logged in `KIRO_LOG.md`. The builder agent has Context7 only; any step that needs another MCP server is marked **IDE**.
- **IDE** marks steps outside the builder agent's tools or write paths (`.github/**`, `docs/**`, steering, the Firebase and Chrome DevTools MCP servers). They run from the IDE or Claude Code.
- Nothing here deploys or touches production; tasks that need production say "founder".

## Order and the seams

**Landing order for the whole spec:** 1, 2, 3, 4, 5, 8, 9 first (the seam block, below); then 5b, 6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20. Task numbers keep their meaning; only the order changes.

**Prerequisites from spec 08** (reviewed, being built first): 08 task 2 (`render.ts` with `exportCost` and `DEFAULT_EXPORT_CREDITS`; the `planCloud.default(0)` and `renders` changes to `DailyLimitsSchema`) before task 1 and task 2 here. 08 task 8 (`startExport`, `failRender`, the `./store` subpath) before task 4's refactor and before task 5b; if it is not there yet, task 4 creates the `store/` folder as the design says and 08 task 8 uses the helper.

**The seam with spec 09: exactly which tasks unblock which spec 09 task.** Spec 09's Generate (its task 18) must not run before every row marked "before 09 task 18" is checked.

| 13 task | Provides | Must land before |
|---|---|---|
| 1 Schemas | `CreditAction`, `ClientCreditAction`, bodies, `key-used` | 09 task 3 and 09 task 11 |
| 2 `costOf` | the one cost table | 09 task 3 |
| 3 Ledger logic (pure) | `decideSpend`, `decideRefund` | 09 task 18 (P5 against `ServerCredits`) |
| 4 Ledger helper and routes | `/api/credits/spend` and `/refund` | 09 task 18 on the hosted path |
| 5 Emulator tests | proof the ledger is exact | 09 task 18 |
| 8 `useCredits`, `ServerCredits`, live chip | the credits client and balance | 09 task 18 |
| 9 Out-of-credits modal | the real modal (09 task 11b ships a stub) | 09 task 18 |

Until task 8 is checked, the hosted cloud route stays disabled ("Cloud AI is coming soon", R5.5), so a hosted deploy before then can never run unmetered AI.

**If time runs short, cut in this order:** the editor Settings panel (keep `/settings` and link the chip there), the usage chart's figures (keep the bars), judge upgrade of existing accounts (keep the daily refill), the ledger list in Credits. Never cut: the server ledger with refunds, the out-of-credits modal, the live balance chip, usage persistence, the prefer-on-device toggle, the cross-writer property C9.

## A. Ledger core

- [ ] 1. **[kiro]** Schemas. Prerequisite: 08 task 2.
  - `packages/schemas/src/credits.ts`: `CreditActionSchema` (with `export`), `ClientCreditActionSchema`, `UNIT_ACTIONS`, spend and refund bodies and responses (reasons include `key-used`), `REASON_FOR`. The `SpendRequestSchema` rejects `units > 1` for fixed-price actions (review F9).
  - `CreditReasonSchema` adds `edit` and `image`.
  - `DailyLimitsSchema` gains only `aiByHour`, `refunds`, `usageEvents` and `usage` (the day counters). It does **not** touch `planCloud` or `renders`; 08 task 2 owns them (review F2).
  - `packages/schemas/src/usage.ts` with the event, batch, doc, `LATENCY_BOUNDS_MS` and day-counter schemas.
  - The `AppConfig` keys `rateLimitCloudPerHour`, `refundsPerDay` (default 30), `usageEventsPerDay`, `creditCosts`, with Remote Config decoding.
  - Tests: old limits docs and user docs still parse; a day doc written by 08's path, by the plan-allowance path and by this spec's path all parse together; bad keys and units are rejected; `generate` with `units: 2` is rejected and `tts` with `units: 2` passes; each new config key falls back alone.
  - — R1.2, R1.3, R2.1, R3.1, R7.1, R7.5
- [ ] 2. **[kiro]** `packages/schemas/src/cost.ts`: `DEFAULT_COSTS` (AI actions) and `costOf` (units, `creditCosts` overrides, `imageCredits`; `export` delegates to 08's `exportCost`). `packages/ai` imports it. The consistency test (property C8): `GENERATE_COST`, `edit.patch`, `note.fix` and `slots.detect` cloud costs equal the table, an 18 s 1080p export costs 5 through `costOf('export', …)`, and no other file defines an export price. Prerequisite: 08 task 2. — R2.1, R2.2
- [ ] 3. **[kiro]** `services/render/src/store/ledger-logic.ts` (pure `decideSpend`, `decideRefund` per the design, including `refunded` → `key-used`, the kill switch for both kinds, and the judge refill on a refused spend) with table tests and a model-based fast-check property for C1, C3 (including "spend, refund, spend with the same key never returns `ok: true`"), C4, C5 and C6 (random sequences of spends, replays, refunds and day changes against an in-memory ledger built only from the decisions). — R1.2–R1.5, R3.1, R3.2, R4.3
- [ ] 4. The shared ledger helper and the routes. Manual check with curl on the emulator, so it is not [kiro].
  - `services/render/src/store/ledger.ts` (`readLedger`, `writeSpend`, `writeRefund`, `spendCredits`, `refundCredits`), exported through the `./store` index, with the test that the index never imports the producer (create it if 08 task 8 has not).
  - `apps/web/lib/credits/ledger.server.ts` (wiring) and the routes `POST /api/credits/spend` and `POST /api/credits/refund` (verify, zod, server config, 200 with `ok: false` for refusals, 400/401/409 otherwise).
  - If 08 task 8 has landed: refactor `startExport` and `failRender` onto `readLedger` / `writeSpend` / `writeRefund`, keeping their ids and their idempotent replay, with 08's property tests P1–P3 as the guard and no behaviour change.
  - Record the p50 of 20 spends in the task note.
  - — R1.1–R1.6, R3.1, R3.2
- [ ] 5. **[kiro]** Emulator tests (`apps/web/rules/ledger.emulator.test.ts`, the pattern of `plan-allowance.emulator.test.ts`):
  - C2 with N in 2..12 concurrent spends;
  - C1 with random concurrent spend/refund mixes (fast-check, 25 runs);
  - C3 idempotency under concurrency, and "spend, refund, spend with the same key answers `key-used`" on the real emulator;
  - C4 refund once; an `export-*` id sent to the client refund route is refused;
  - the 31st AI spend in an hour refused, an export spend not counted;
  - the kill switch refuses AI spends with `paused` and an export start with its `disabled` reason;
  - a judge with 0 credits whose spend is refused as `insufficient` is topped up once and the spend goes through, a second empty spend the same UTC day is refused (review F5);
  - a missing user doc answers 409.
  - — R1, R3, R4.3
- [ ] 5b. **[kiro]** The cross-spec property C9 on the emulator (`apps/web/rules/ledger-cross.emulator.test.ts`): random interleavings, over 1–3 users, of AI spends, client refunds and spec 08's `startExport`, `failRender` and `sweepIfStalled` (imported from `@motionpop/render/store`): balances ≥ 0 at every point, balance equals grant plus the sum of deltas, at most one refund entry per spend entry with a matching amount. Also run it as a pure model next to task 3's. Needs 08 task 8; schedule it right after both are checked. — R1.5, R1.7

## B. Plans

- [ ] 6. **[kiro]** Judge upgrade and daily refill at sign-in: pure `planReturning` with tests and property C6 (random sign-in sequences over random days); `bootstrapUser` applies it inside its transaction and shares the `judge-refill-{day}` id with the spend-time refill from task 3; emulator tests for an existing free account that becomes judge, a judge refilled once per day, and a refill at sign-in followed by an empty spend the same day (no second refill). One test signs in with a verified Google-provider profile on the allow-list and gets the same upgrade as the email/password profile (review F15). — R4.1–R4.4
- [ ] 7. **[kiro]** Rules in `firestore.rules` (the agent's allowed paths include it; if the run is denied, apply the diff from the task note in the IDE):
  - `validSettings`, the `displayName` check, `photoURL` must be a string when present, and `lastSeenAt` removed from the client-writable keys (only the bootstrap route writes it; review F8).
  - Rules tests: valid settings updates pass; extra keys, missing keys, wrong types and bad formats fail; `photoURL: 5` fails; a client write of `lastSeenAt` fails; `credits` and `plan` stay untouchable alongside a valid settings change; ledger, usage and limits (including the new counters) stay client-unwritable. Update the existing `lastSeenAt` cases in `firestore.rules.test.ts` to the new rule with a "Changed by spec 13" comment.
  - Read-path tests (review F16): as the owner, run the queries the Settings page runs (`limits` with a document-id range and `limit(14)`, `credits` with `orderBy('at', 'desc')` and `limit(20)`), allowed; as another user, denied.
  - **IDE:** validate the rules file with the Firebase MCP (`firebase_validate_security_rules`) before the emulator run; the builder agent can't use that server and the emulator load already fails on syntax errors, so the agent's run relies on that. Never deploy the rules.
  - — R6.3, R6.6, NFR

## C. Balance in the app

- [ ] 8. `useCredits` (snapshot + parse; shared with spec 08's `useCreditBalance`, which is `useCredits().balance`), `ServerCredits` implementing spec 09's `CreditsClient` (unit tests with fake fetch: every refusal reason including `key-used` with its one retry on a fresh key, network errors, optimistic balance, a refused refund raising the toast), the `useCreditsClient` switch (`ServerCredits` with Firebase and a user; `LocalCredits` only without Firebase or with `NEXT_PUBLIC_FAKE_AI=1`; otherwise cloud actions disabled "Cloud AI is coming soon"), spec 09's hand-written `CreditAction` replaced by `ClientCreditAction` from task 1 if 09 task 11 has already written its own, the editor top bar chip on the live balance with the loading shimmer, and the deletion of `CREDITS_PLACEHOLDER`. Add the `ServerCredits` case to spec 09's `describe.each` contract test (the fake fetch is backed by task 3's pure logic). Expose `useCredits` for spec 08's export modal and spec 11's dashboard chip. — R2.2 (the chip reads `costOf`), R5.1, R5.4, R5.5, R1.8
- [ ] 9. Out-of-credits modal (`components/credits/out-of-credits-modal.tsx`, `credits-ui.ts`): Pip `empty-pockets` in the ember bloom, the exact copy, "Keep editing", the balance and cost line; opened by a pre-check (balance < cost) and by an `insufficient` answer; rate-limit, paused and refund-failed toasts. Replaces the stub from spec 09 task 11b. — R5.3, R3.1, R3.2, R1.8

## D. Usage

- [ ] 10. `POST /api/usage` and `writeUsage` (verify, parse, dedupe existing ids, daily cap, server `at`, the day counters and histogram updated in the same transaction, failed events stored but not counted); emulator test (cap at `usageEventsPerDay`, duplicate ids written once and counted once, invalid batches 400, counters equal the written ok events). — R7.1, R7.5
- [ ] 11. **[kiro]** `UsageReporter` (buffer, 15 s / 20 events / hidden flush with keepalive using the last known ID and App Check tokens, retry, 200 cap) with fake timers and fake fetch, including "hidden flush sends the cached token and does not call `getIdToken`" and "no cached token yet: events stay buffered"; local-mode `usage-store`; started once in the app layout when a user is signed in. — R7.2, R7.4
- [ ] 12. **[kiro]** `aggregateUsage` (pure, from day docs) with property C7 and table tests (UTC day boundaries, missing days, histogram median within one bucket, empty input). — R7.3, R7.5

## E. Settings

- [ ] 13. Settings sections in `components/settings/`: Account (sign out), AI & models (prefer toggle saved to `users/{uid}.settings` with revert on failure; local mode in localStorage; on-device status from spec 09's `useAIStatus` with the setup action; `UsageChart` reading 14 `limits` docs; the "reported by your browser" footnote), Credits (balance, plan line, cost list from `costOf`, last 20 ledger rows). — R6.2–R6.4, R7.3, R7.4, R7.6
- [ ] 14. `/settings` page (top bar, eyebrow, headline, section nav, anchors), `AccountMenu` in the editor top bar, `/settings` and the dashboard, and the editor Settings left panel (reuse spec 10's panel host if it exists, else add `LeftPanelHost`); credits chips open Credits. — R5.2, R6.1
- [ ] 15. Wire `settings.preferOnDevice` into spec 09's `chooseRoute` input (live from `useCredits().settings`), with a unit test that turning it off moves quick edits to ☁ 1 and leaves auto-fill on the device. — R6.5
- [ ] 16. **Founder:** judge account. `apps/web/scripts/judge-account.ts` (written by the agent; reads `JUDGE_EMAIL` / `JUDGE_PASSWORD` from the environment, sets `emailVerified: true`, prints the uid only). The founder runs it against production, adds the email to the `JUDGE_EMAILS` secret, sets `judge_credits` in Remote Config if not 500, signs in once with the email/password account **and once with a verified Google account on the list**, and confirms the Judge chip and 500 credits in Settings for both (the same bootstrap path, R4.2; review F15). — R4.1, R4.2, hackathon judge checklist

## F. Verification

- [ ] 17. **[kiro]** Playwright `apps/web/e2e/credits.spec.ts` in the `auth` project (emulators, fake AI). First the config edits it needs (review F6): in `apps/web/playwright.config.ts` change the `auth` project's `testMatch` to `/(auth|credits)\.spec\.ts/` and the `chromium` project's `testIgnore` to the same pattern; set `NEXT_PUBLIC_FAKE_AI=1` in the environment of the web server the `auth` project uses; use spec 09's `?fakeFail=generate` to make Generate fail. Then the test: sign up → the chip shows 20 and Settings shows "Free" and the "Welcome credits" row; Generate on a ready slot → 17 and a "Generated a graphic −3" row; Generate with `?fakeFail=generate` → back to 17 with a "Refund +3" row; set the balance to 2 with the Admin SDK in the test → Generate opens "Pip needs a recharge", "Keep editing" closes it, a device quick edit still lands; turn off "Prefer on-device AI", reload, the quick-edit chip shows ☁ 1; the usage chart shows at least one mint and one violet segment after a flush; no page errors. — R1–R7
- [ ] 18. Design check at 1440×900 (no PNG exists for these screens). **IDE:** with the Chrome DevTools MCP, screenshot `/settings` (each section), the editor with the Settings panel open, and the out-of-credits modal over the editor; compare against `design/screens/editor.png` (panel width 340, tokens, chips, toggles, type scale) and `export.png` (modal backdrop, radius, title size, button), and against the token table in `design-system.md`; record each mismatch and its fix in this task's note. **[kiro]** half: add a Playwright screenshot of the modal and the panel to `e2e/editor-design.spec.ts` output for later regression (no pixel threshold, since there is no reference). — R5.3, R6.1–R6.4
- [ ] 19. **IDE (done by Claude Code):** a CI Playwright job. `.github/workflows/ci.yml` has no `playwright test` step and `.github/**` is denied to the builder (review F6). Claude Code adds one job that installs Java and the Playwright browser, starts the Auth and Firestore emulators as the `rules` job does, builds `packages/motion/dist`, and runs the `chromium` and `auth` projects (this spec's `credits.spec.ts` included). It is shared with spec 08 task 21 and spec 09's CI task, so there is one Playwright job, not three. Note "done by Claude Code" here with the commit when it lands. — testing

## G. Steering and decisions

- [ ] 20. **IDE (after the founder approves the spec):** the exact edits.
  1. `docs/decisions.md`: add D-050 to D-064 from the design's "Decisions" section (D-13-1 to D-13-15). D-058 states that the kill switch blocks every cloud spend including exports. D-034 is spec 08's, D-035 to D-049 are spec 09's.
  2. `.kiro/steering/data-model.md`: ledger id scheme (`s-`, `r-`, `export-`, `refund-`, `judge-upgrade`, `judge-refill-{day}`); `CreditReason` adds `edit` and `image`; `limits/{day}` adds `aiByHour`, `refunds`, `usageEvents`, `usage` (spec 08 adds `renders`); `UsageEvent` adds `cloudCost`, `attempts`, `problems`, `clientAt`, `schemaVersion`; the rules sketch adds `validSettings`, `photoURL is string` and `lastSeenAt` server-only; a note under `UserDoc.settings` that its keys are exactly `preferOnDevice`, `captionsDefault`, `defaultFormat`.
  3. `.kiro/steering/security-and-cost.md`: add the trust-model paragraph (D-051) and "the kill switch blocks every cloud spend, exports included, and stays manual (D-058)".
  4. `.kiro/steering/ai-tasks.md` cost table: "single source: `packages/schemas/src/cost.ts`".
  5. `.kiro/steering/screens.md` Settings and Out of credits: the strings "Make it yours.", "AI & models", "0 available · Generate costs 3", "Pip needs a short break. Try again in a few minutes.", "Cloud AI is paused", "Cloud AI is coming soon", "Couldn't return your credits. Tell us and we'll fix it."
  6. `.kiro/steering/hackathon-compliance.md` judge checklist: "judge plan with generous credits, topped up on sign-in and on a refused spend".
  7. `.kiro/steering/handoff.md` §10: Settings opens from the account menu as a left panel (D-055).
  — workflow rule 1

## Later (after Nov 30)

- Automatic global daily budget counter that flips the kill switch (D-058).
- Buying credits and paid plans (non-goal for the hackathon).
- BYOK (AI calls free, render charged).
- Rolling-window rate limit.
- Usage export (CSV) and per-task breakdown in Settings.
- Rename `@motionpop/render/store` to a name that says "server ledger" (the package name is historical).
- Fonts and Brand settings sections (with specs 16 and the Fonts panel).

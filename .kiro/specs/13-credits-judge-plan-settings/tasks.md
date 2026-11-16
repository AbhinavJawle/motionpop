# Tasks: 13 credits, judge plan and settings

_Written headlessly by Kiro CLI (`motionpop-builder`, Opus 5.5), 2026-11-16. Requirements and design not yet approved by the founder._

One task at a time. Each ends with the definition of done for the packages it touches (prettier, typecheck, lint with 0 warnings, tests read). Server tasks also run `pnpm --filter @motionpop/web test:rules` on the emulator; UI tasks are checked at 1440×900. A bug found by a property test gets a regression test and a log note (testing.md). **[kiro]** marks tasks for headless Kiro CLI runs (`motionpop-builder`), logged in `KIRO_LOG.md`. Nothing here deploys or touches production; tasks that need production say "founder".

**Order:** tasks 1–5 (ledger core) run right after spec 09 task 11, before spec 09 task 18 (Generate). The rest follows spec 09.

**If time runs short, cut in this order:** the editor Settings panel (keep `/settings` and link the chip there), the usage chart's figures (keep the bars), judge upgrade of existing accounts (keep the daily refill), the ledger list in Credits. Never cut: the server ledger with refunds, the out-of-credits modal, the live balance chip, usage persistence, the prefer-on-device toggle.

## A. Ledger core

- [ ] 1. **[kiro]** Schemas: `packages/schemas/src/credits.ts` (actions, spend and refund bodies and responses, `REASON_FOR`), `CreditReasonSchema` adds `edit` and `image`, `DailyLimitsSchema` gains `aiByHour`, `refunds`, `usageEvents` and `planCloud` defaults to 0, `packages/schemas/src/usage.ts`, and the four `AppConfig` keys with Remote Config decoding. Tests: old limits docs and user docs still parse; bad keys and units are rejected; each new config key falls back alone. — R1.2, R1.3, R2.1, R3.1, R7.1
- [ ] 2. **[kiro]** `packages/ai/src/cost.ts` (`DEFAULT_COSTS`, `costOf` with overrides and units) and the consistency test (property C8: `GENERATE_COST`, `edit.patch`, `note.fix` and `slots.detect` cloud costs equal the table). — R2.1, R2.2
- [ ] 3. **[kiro]** `apps/web/lib/credits/ledger-logic.ts` (`decideSpend`, `decideRefund`) with table tests and a model-based fast-check property for C1, C3, C4 and C5 (random sequences of spends, replays and refunds against an in-memory ledger built only from the decisions). — R1.2–R1.5, R3.1, R3.2
- [ ] 4. `ledger.server.ts` (`spendCredits`, `refundCredits` transactions, `ServerSpend` for export) and the routes `POST /api/credits/spend` and `POST /api/credits/refund` (verify, zod, server config, 200 with `ok: false` for refusals, 400/401/409 otherwise). Manual check on the emulator with curl and a debug ID token; record the p50 of 20 spends in the task note. — R1.1–R1.6, R3.1, R3.2
- [ ] 5. **[kiro]** Emulator tests (`apps/web/rules/ledger.emulator.test.ts`, the pattern of `plan-allowance.emulator.test.ts`): C2 with N in 2..12 concurrent spends; C1 with random concurrent spend/refund mixes (fast-check, 25 runs); C3 idempotency under concurrency; C4 refund once; the 31st AI spend in an hour refused, an export spend not counted; kill switch refuses AI and allows export; a missing user doc answers 409. — R1, R3

## B. Plans

- [ ] 6. **[kiro]** Judge upgrade and daily refill: pure `planReturning` with tests and property C6 (random sign-in sequences over random days); `bootstrapUser` applies it inside its transaction; emulator test for an existing free account that becomes judge and a judge refilled once per day. — R4.1–R4.4
- [ ] 7. **[kiro]** Rules: `validSettings` and the `displayName` check in `firestore.rules`; rules tests: valid settings updates pass; extra keys, missing keys, wrong types and bad formats fail; `credits` and `plan` stay untouchable alongside a valid settings change; ledger, usage and limits (including the new counters) stay client-unwritable. Validate the rules file with the Firebase MCP (`firebase_validate_security_rules`) before running the emulator tests; never deploy them. — R6.3, NFR

## C. Balance in the app

- [ ] 8. `useCredits` (snapshot + parse), `ServerCredits` implementing spec 09's `CreditsClient` (unit tests with fake fetch: every refusal reason, network errors, optimistic balance), `useCreditsClient` switch (spec 09's hand-written `CreditAction` type is replaced by `ClientCreditAction` from task 1), the editor top bar chip on the live balance with the loading shimmer, and the deletion of `CREDITS_PLACEHOLDER`. Expose `useCredits` for spec 08's export modal and spec 11's dashboard chip. — R5.1, R5.4
- [ ] 9. Out-of-credits modal (`components/credits/out-of-credits-modal.tsx`, `credits-ui.ts`): Pip `empty-pockets` in the ember bloom, the exact copy, "Keep editing", the balance and cost line; opened by a pre-check (balance < cost) and by an `insufficient` answer; rate-limit and paused toasts. — R5.3, R3.1, R3.2

## D. Usage

- [ ] 10. `POST /api/usage` and `writeUsage` (verify, parse, dedupe existing ids, daily cap, server `at`); emulator test (cap at `usageEventsPerDay`, duplicate ids written once, invalid batches 400). — R7.1
- [ ] 11. **[kiro]** `UsageReporter` (buffer, 15 s / 20 events / hidden flush with keepalive, retry, 200 cap) with fake timers and fake fetch; local-mode `usage-store`; started once in the app layout when a user is signed in. — R7.2, R7.4
- [ ] 12. **[kiro]** `aggregateUsage` (pure) with property C7 and table tests (time zones, day boundaries, empty input). — R7.3

## E. Settings

- [ ] 13. Settings sections in `components/settings/`: Account (sign out), AI & models (prefer toggle saved to `users/{uid}.settings` with revert on failure; local mode in localStorage; on-device status from spec 09's `useAIStatus` with the setup action; `UsageChart`), Credits (balance, plan line, cost list from `costOf`, last 20 ledger rows). — R6.2–R6.4, R7.3, R7.4
- [ ] 14. `/settings` page (top bar, eyebrow, headline, section nav, anchors), `AccountMenu` in the editor top bar, `/settings` and the dashboard, and the editor Settings left panel (reuse spec 10's panel host if it exists, else add `LeftPanelHost`); credits chips open Credits. — R5.2, R6.1
- [ ] 15. Wire `settings.preferOnDevice` into spec 09's `chooseRoute` input (live from `useCredits().settings`), with a unit test that turning it off moves quick edits to ☁ 1 and leaves auto-fill on the device. — R6.5
- [ ] 16. **Founder:** judge account. `apps/web/scripts/judge-account.ts` (written by the agent; reads `JUDGE_EMAIL` / `JUDGE_PASSWORD` from the environment, sets `emailVerified: true`, prints the uid only). The founder runs it against production, adds the email to the `JUDGE_EMAILS` secret, sets `judge_credits` in Remote Config if not 500, signs in once and confirms the Judge chip and 500 credits in Settings. — R4.1, hackathon judge checklist

## F. Verification

- [ ] 17. **[kiro]** Playwright `apps/web/e2e/credits.spec.ts` in the `auth` project (emulators, fake AI): sign up → the chip shows 20 and Settings shows "Free" and the "Welcome credits" row; Generate on a ready slot → 17 and a "Generated a graphic −3" row; a fake failing Generate → back to 17 with a "Refund +3" row; set the balance to 2 with the Admin SDK in the test → Generate opens "Pip needs a recharge", "Keep editing" closes it, a device quick edit still lands; turn off "Prefer on-device AI", reload, the quick-edit chip shows ☁ 1; the usage chart shows at least one mint and one violet segment after a flush; no page errors. — R1–R7
- [ ] 18. **[kiro]** Design check with the Chrome DevTools MCP at 1440×900 (no PNG exists for these screens): screenshot `/settings` (each section), the editor with the Settings panel open, and the out-of-credits modal over the editor. Compare against `design/screens/editor.png` (panel width 340, tokens, chips, toggles, type scale) and `export.png` (modal backdrop, radius, title size, button), and against the token table in `design-system.md`. Record each mismatch and its fix in this task's note; add a Playwright screenshot of the modal and the panel to `e2e/editor-design.spec.ts` output for later regression (no pixel threshold, since there is no reference). — R5.3, R6.1–R6.4

## Later (after Nov 30)

- Automatic global daily budget counter that flips the kill switch (D-13-9).
- Buying credits and paid plans (non-goal for the hackathon).
- BYOK (AI calls free, render charged).
- Rolling-window rate limit.
- Usage export (CSV) and per-task breakdown in Settings.
- Fonts and Brand settings sections (with specs 16 and the Fonts panel).

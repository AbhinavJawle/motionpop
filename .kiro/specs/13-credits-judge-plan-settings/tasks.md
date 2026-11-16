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

- [x] 1. **[kiro]** Schemas. Prerequisite: 08 task 2.
  - `packages/schemas/src/credits.ts`: `CreditActionSchema` (with `export`), `ClientCreditActionSchema`, `UNIT_ACTIONS`, spend and refund bodies and responses (reasons include `key-used`), `REASON_FOR`. The `SpendRequestSchema` rejects `units > 1` for fixed-price actions (review F9).
  - `CreditReasonSchema` adds `edit` and `image`.
  - `DailyLimitsSchema` gains only `aiByHour`, `refunds`, `usageEvents` and `usage` (the day counters). It does **not** touch `planCloud` or `renders`; 08 task 2 owns them (review F2).
  - `packages/schemas/src/usage.ts` with the event, batch, doc, `LATENCY_BOUNDS_MS` and day-counter schemas.
  - The `AppConfig` keys `rateLimitCloudPerHour`, `refundsPerDay` (default 30), `usageEventsPerDay`, `creditCosts`, with Remote Config decoding.
  - Tests: old limits docs and user docs still parse; a day doc written by 08's path, by the plan-allowance path and by this spec's path all parse together; bad keys and units are rejected; `generate` with `units: 2` is rejected and `tts` with `units: 2` passes; each new config key falls back alone.
  - — R1.2, R1.3, R2.1, R3.1, R7.1, R7.5
  - _Done 2026-11-16 (headless run, claude-sonnet-5.5). New: `credits.ts` (actions, `UNIT_ACTIONS`, spend and refund bodies, `REASON_FOR`, `spendTxId` / `refundTxId`, `CreditCostsSchema`), `usage.ts` (event, batch, stored doc, `LATENCY_BOUNDS_MS`, `latencyBucket`, day counters, `emptyUsageDay`) and tests for both. Edited: `user.ts` (reasons `edit`, `image`), `limits.ts` (`aiByHour`, `refunds`, `usageEvents`, `usage`; `planCloud` and `renders` untouched), `config.ts` (four keys with Remote Config decoding), `index.ts`. Schemas package: 237 tests, typecheck and lint (0 warnings) green._
    - _`SpendRequestSchema` rejects `units > 1` unless the action is `slots-detect`, `tts` or `transcribe`; `export` is not a client action. `RefundRequestSchema` takes only `s-…` ids._
    - _Remote Config `credit_costs` is decoded one entry at a time: only the seven AI actions are read, an entry that is not a positive integer is dropped and the others stay (`{"generate":2,"edit":0,"export":9}` gives `{generate:2}`). Overrides are positive on purpose: the spend response carries a positive `cost`._
    - _`DailyLimitsSchema` defaults give each parsed doc its own `aiByHour` object and histogram arrays (a test mutates one parse and checks the next). Tests parse a doc written by the plan path only, the export path only, spec 13 only and all three together._
    - _Changed by spec 13: the `toEqual` in `limits.test.ts` ("accepts a server-written doc") now lists the new defaults; the full-config `toEqual` in `config.test.ts` lists the four new keys._
    - _Also in this commit: `services/render/vitest.config.ts` raises the test timeout to 30 s. Under `turbo run test --force` (every package at once) two ffmpeg and fault-injection tests of the render package timed out at the 5 s default; alone they pass in 1.5 s. `apps/web` `detect-perf.test.ts` (< 150 ms, already best of 3) failed once under the same load and passed alone and on the next run; I did not touch it._
- [x] 2. **[kiro]** `packages/schemas/src/cost.ts`: `DEFAULT_COSTS` (AI actions) and `costOf` (units, `creditCosts` overrides, `imageCredits`; `export` delegates to 08's `exportCost`). `packages/ai` imports it. The consistency test (property C8): `GENERATE_COST`, `edit.patch`, `note.fix` and `slots.detect` cloud costs equal the table, an 18 s 1080p export costs 5 through `costOf('export', …)`, and no other file defines an export price. Prerequisite: 08 task 2. — R2.1, R2.2
  - _Done 2026-11-16 (headless run, claude-sonnet-5.5). `packages/schemas/src/cost.ts` (`DEFAULT_COSTS`, `costOf`, `CostConfig`) with `cost.test.ts` (table values, units, overrides one by one, export delegation, bad input, two properties over random overrides, a source scan for a second export price). `packages/ai` now takes its costs from `costOf`: `GENERATE_COST`, `edit.patch`, `slotsDetectCost`, `transcribeCloudCost` (`cost-consistency.test.ts` is property C8). Schemas 252 tests, ai 326; every package typechecks, lints (0 warnings) and tests green._
    - _Decisions: `units` is ignored for fixed-price actions (the request schema already rejects `units > 1`), so a caller can't get a price different from the chip. An image costs at least 1 even when `imageCredits` is 0, because the spend response carries a positive `cost`. The AI tasks price with `APP_CONFIG_DEFAULTS`, so a Remote Config override reaches the server's charge and the response's `cost`, but not the pre-click chip until the client passes its own config (D-13-4, accepted)._
    - _`note.fix` has no task in `packages/ai` yet, so C8 covers `generate`, `edit.patch`, `slots.detect`, `transcribe` and the 18 s 1080p export (5). `direct.plan` keeps `cloudCost: () => 0` (free allowance, spec 07); `pip-plan` pricing belongs to spec 10._
- [x] 3. **[kiro]** `services/render/src/store/ledger-logic.ts` (pure `decideSpend`, `decideRefund` per the design, including `refunded` → `key-used`, the kill switch for both kinds, and the judge refill on a refused spend) with table tests and a model-based fast-check property for C1, C3 (including "spend, refund, spend with the same key never returns `ok: true`"), C4, C5 and C6 (random sequences of spends, replays, refunds and day changes against an in-memory ledger built only from the decisions). — R1.2–R1.5, R3.1, R3.2, R4.3
  - _Done 2026-11-16 (headless run, claude-sonnet-5.5). `services/render/src/store/ledger-logic.ts` (`decideSpend`, `decideRefund`, `refundIdOf`, `txMs`, `MAX_REFUND_AGE_MS`), `testing/ledger-model.ts` (an in-memory ledger built only from the decisions, reused by task 5b), `ledger-logic.test.ts` (31 table tests) and `ledger-logic.property.test.ts`. Render package: 128 tests (97 before), typecheck and lint (0 warnings) green. Pure code, no Firebase import._
    - _Properties (400 runs for the main one): any sequence of AI and export spends, replays, client and server refunds, kill-switch flips and clock moves (minutes and days, across UTC midnight) over a 6-key pool keeps balance ≥ 0, `balanceAfter` equal to grant plus the running deltas, one entry per id, at most one refund per spend with the spend's amount (C1, C4); a key with a spend entry never charges again and a refunded key always answers `key-used`, with the kill switch on or off (C3); AI spends per hour never pass the cap and a burst commits exactly `min(n, limit, floor(grant / cost))` (C5); a judge is refilled at most once per UTC day, only to `judgeCredits`, and is refused `insufficient` for a cost within `judgeCredits` only on a day that already had its refill (C6). A non-vacuity test checks that all 13 outcomes (charge, replay, refill and the four spend and four refund refusals) occur._
    - _I checked the tests can fail by mutating the code six ways (ignoring `refunded`, `>` for `>=` on the hour cap, dropping the `judgeCredits >= cost` guard, applying the kill switch to AI only, ignoring an existing refund, adding 1 to the refund balance); each mutation failed 2–5 tests and every mutation was reverted (file compared with a backup)._
    - _Decisions: `decideRefund` also takes the spend's id and refuses a client refund of anything not starting `s-` (so `export-*` is refused even if a route forgot to check), and a replay (refund already paid) is answered before the age and daily-cap checks, so a retry never counts against the cap. A client refund exactly 15 minutes old is allowed; 15 minutes and 1 ms is `too-old`. The sign-in judge refill is not modelled yet (task 6 adds `planReturning` and extends the model)._
- [x] 4. The shared ledger helper and the routes. Manual check with curl on the emulator, so it is not [kiro].
  - `services/render/src/store/ledger.ts` (`readLedger`, `writeSpend`, `writeRefund`, `spendCredits`, `refundCredits`), exported through the `./store` index, with the test that the index never imports the producer (create it if 08 task 8 has not).
  - `apps/web/lib/credits/ledger.server.ts` (wiring) and the routes `POST /api/credits/spend` and `POST /api/credits/refund` (verify, zod, server config, 200 with `ok: false` for refusals, 400/401/409 otherwise).
  - If 08 task 8 has landed: refactor `startExport` and `failRender` onto `readLedger` / `writeSpend` / `writeRefund`, keeping their ids and their idempotent replay, with 08's property tests P1–P3 as the guard and no behaviour change.
  - Record the p50 of 20 spends in the task note.
  - — R1.1–R1.6, R3.1, R3.2
  - _Done 2026-11-16 (headless run, claude-sonnet-5.5). New: `services/render/src/store/ledger.ts` (`readLedger`, `decideSpendFrom`, `writeSpend`, `decideRefundFrom`, `writeRefund`, `spendCredits`, `refundCredits`, `aiSpec`, `exportSpec`, `LedgerError`), `store/index.ts` (the `@motionpop/render/store` subpath: ledger logic, ledger helper, `decideFail`) and `store/index.test.ts` (walks the import graph from the index and fails on puppeteer, `@hyperframes/*`, `@motionpop/motion`, `child_process`, or the producer, preflight, ffmpeg and `run-render` files). Web: `lib/credits/ledger.server.ts` (wiring: `costOf` from the server config, then the helper), `parse-body.server.ts`, and the routes `app/api/credits/spend/route.ts` and `refund/route.ts`. `apps/web` gains `@motionpop/render` (`workspace:*`, also in `transpilePackages`); `@motionpop/render` gains `firebase-admin` 14.5.1 and the `./store` export. Prettier, typecheck, lint (0 warnings), `turbo run typecheck lint test` (15 tasks; render 130 tests, web 364) and `next build` (both routes listed) are green._
    - _**Lockfile:** an offline `pnpm install` again rewrote unrelated peer suffixes (`@hyperframes/player`, `firebase`), so I reverted it and added only the two importer entries by hand; `pnpm install --frozen-lockfile --offline` accepts it._
    - _Design as built: one `getAll` of five docs (user, spend, refund, `limits/{day}`, `judge-refill-{day}`) before any write; the spend and refund entries and the judge entry are `create`d, so a fixed id can never be written twice. An AI spend merges `aiByHour.{hh}` into the day doc; an export leaves the day doc to `startExport` (its `renders` counter). A client refund merges `refunds + 1`; a server refund (`failRender`, the sweep) does not. `readLedger` takes a `LedgerSpec` (`uid`, `kind`, `spendId`, `refundId`) so 08's `startExport` and `failRender` can call `exportSpec(uid, renderId)` and the same pieces. 08 task 8 has not landed, so the refactor step of this task had nothing to refactor; 08 task 8 must use `readLedger` / `writeSpend` / `writeRefund`._
    - _**Manual check against the Firestore and Auth emulators** (project `demo-motionpop`, `next dev` on port 3199 with the emulator env, curl with an emulator ID token; the founder's server on 3123 was not touched). Real output:_
      ```
      bootstrap                              {"created":true,"plan":"free","credits":20} [200]
      spend generate                         {"ok":true,"txId":"s-curlkey00000001","balance":17,"cost":3} [200]
      same key again                         {"ok":true,"txId":"s-curlkey00000001","balance":17,"cost":3} [200]   (replay, charged once)
      refund it                              {"ok":true,"balance":20,"alreadyRefunded":false} [200]
      refund again                           {"ok":true,"balance":20,"alreadyRefunded":true} [200]
      spend the refunded key                 {"ok":false,"reason":"key-used","balance":20} [200]
      refund an export-* id                  {"error":"Invalid request"} [400]
      refund an unknown s- id                {"ok":false,"reason":"not-found"} [200]
      generate with units 2                  {"error":"Invalid request"} [400]
      action export                          {"error":"Invalid request"} [400]
      edit with "cost":0,"amount":-5 extras  {"ok":true,"txId":"s-curlkey00000004","balance":19,"cost":1} [200]   (the server price, 1)
      tts with units 2                       {"ok":true,"txId":"s-curlkey00000005","balance":15,"cost":4} [200]
      body "nope"                            {"error":"Body must be JSON"} [400]
      no token                               {"error":"Missing ID token"} [401]
      signed in, no user doc                 {"error":"Not bootstrapped"} [409]
      ```
    - _The ledger afterwards had `signup +20 → 20`, `s-… −3 → 17`, `r-… +3 → 20`, then the debits, each `balanceAfter` equal to the running balance, and `limits/{day}` held `refunds: 1` and `aiByHour.{hh}` with the day's AI spends. My first run found a bug of mine: the 409 case answered 500 because the `LedgerError` import was missing at the use site (typecheck had run before that edit); fixed and the case re-run (the output above is the second run)._
    - _**p50 of 20 spends: 11 ms** (p90 16 ms, min 10, max 19), sequential `edit` spends on a fresh 20-credit user, all 20 succeeded (the last answer was `ok` with balance 0). That is the route plus the transaction against the local emulators with a dev server; the NFR (400 ms p50) is for the deployed backend and is not measured here. The App Check verification is skipped on emulators, so it is not part of this number._
    - _Not verified: the kill switch, the rate limit and the judge refill through the routes (the emulator Auth REST can't mark an email verified, and the kill switch needs Remote Config). Task 5 covers them by calling `spendCredits` against the emulator with a config object._
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

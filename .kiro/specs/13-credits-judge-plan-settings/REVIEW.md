# 13 · Credits, judge plan and settings: spec review

_Reviewer: `spec-reviewer` (read-only), model claude-sonnet-5.5. Read: `requirements.md`, `design.md`, `tasks.md`, spec 09 (all three files, for the seam), spec 08's requirements, design and review (it also writes to the ledger), all of `.kiro/steering/` that applies, `docs/decisions.md`, `firestore.rules`, `.github/workflows/ci.yml`, `apps/web/playwright.config.ts`, `apps/web/vitest*.config.ts`, `.kiro/agents/motionpop-builder.json`, and the code the spec reuses (`bootstrap.server.ts`, `bootstrap-plan.ts`, `plan-allowance*.ts`, `verify.server.ts`, `limits.ts`, `user.ts`, `config.ts`, `router.ts`, `router-client.ts`, `top-bar.tsx`). I had no way to run tests, so nothing here was executed._

## Verdict: ready after fixes

The ledger design is sound: one pure decision function, one transaction, deterministic ledger ids, append-only entries, an honest trust model, and a model-based property test next to the emulator tests. It reuses what exists (bootstrap, `verifyRequest`, the limits doc, `judge-grant`, `empty-pockets`). Two findings need a decision before task 1 (F1 and F2), because they change the ledger contract that specs 08 and 09 also depend on. F3 to F6 are fixes to the plan. The rest can be done on the way.

## The 13 ↔ 09 seam

Spec 09 task 18 (Generate) needs this spec's server ledger. `tasks.md` says "tasks 1–5 run right after spec 09 task 11". The ledger transaction and routes are in 1–5, but the client half is not.

| What 09's Generate calls | Built here in | In "1–5"? |
|---|---|---|
| `POST /api/credits/spend`, `/refund`, `ledger.server.ts` | tasks 3–5 | yes |
| `ServerCredits` (implements 09's `CreditsClient`), `useCredits` | task 8 | **no** |
| Out-of-credits modal (09 R6.3) | task 9 | **no** |
| Costs (`costOf`) used by the chip, `chooseRoute` | task 2 | yes, but 09 tasks 3 and 11 are written first |
| `CreditAction` type | task 1 (`ClientCreditActionSchema`), while 09 task 11 writes its own five-value `CreditAction` | order clash |
| `settings.preferOnDevice` into `chooseRoute` | task 15 (after 09) | fine: 09 defaults it to true |
| Usage events (`cloudCost`, `onAIUsage`) | 09 task 2 adds `cloudCost`; 13 tasks 10–11 persist | fine: `onAIUsage` already exists in `router-client.ts` |

Two contract gaps sit in this table, and F3 covers the schedule. The first, which is F1, is that a retried spend key after a refund is a free call.

## Findings, by severity

### High

**F1. A replayed spend key after a refund returns `ok: true` and charges nothing (seam with 09).**
- Evidence: design "Ledger": "Order inside `decideSpend`: replay → paused → rate limit → insufficient → charge. A replay never re-checks limits." `decideSpend`'s `existing` input is `{ delta, balanceAfter } | null`, so it cannot know that `r-{key}` exists. C3 says "repeating a request with the same key ... charges once and every answer carries the same `txId`". Spec 09's Generate design reuses a key on "a retry of the same click".
- Effect: Generate fails, the client refunds `s-{key}`, the user retries with the same key, the server replays the first answer, the cloud call runs, and the balance does not move. Spec 09 F1 describes the client side.
- Fix: pass `refunded: boolean` into `decideSpend` (the transaction already reads `r-{key}` for refunds; add it to the read set). A replay of a refunded spend returns `refuse` with a new reason `key-used`; add it to `SpendResponseSchema` and to the client's mapping (the client then takes a fresh key). Add to C3: "after a refund, the same key never yields `ok: true`", in the pure model and on the emulator (task 3 and task 5).

**F2. This spec and spec 08 write the same ledger with different ids, one cost formula each, and opposite kill-switch rules.**
- Evidence:
  - Ids: 13 R1.6 and the design say export uses `ServerSpend` and ids `s-export-{renderId}` / `r-export-{renderId}`. Spec 08 R2.5 and design §14 write `users/{uid}/credits/export-{renderId}` and `refund-{renderId}` in its own transaction (`@motionpop/render/store`, design §2 and §14), and its tasks never call `spendCredits`.
  - Kill switch: 13 R3.2 says AI spends are refused while it is on "(exports still run)", and `ServerSpend` is "not paused by the kill switch". 08 R2.8 rejects new renders with `disabled` when `exportsEnabled` is false "or the global `killSwitch` on".
  - Costs: 13's `DEFAULT_COSTS` has flat `export720p: 3 … export4k: 10` in `packages/ai/src/cost.ts`. 08 R2.4 prices "base cost × started minutes" with `exportCost` in `packages/schemas/src/render.ts` and its own six config keys. `packages/schemas` cannot import from `packages/ai`.
  - Limits doc: both add fields to `DailyLimitsSchema` (`aiByHour`, `refunds`, `usageEvents` here; `renders` there) and both make `planCloud` default to 0. Two specs editing `packages/schemas/src/limits.ts` will conflict.
  - Landing order: 08 lands Nov 25, this spec Nov 27, so 08 ships its own transaction first.
- Effect: two ledger code paths with different id formats, and the invariant "balance equals the sum of deltas" is only as good as the weaker one. The kill switch means one thing to a judge on Nov 30 depending on which button they press.
- Fix (recommended, smallest): 08 keeps its transaction and ids. In this spec, remove R1.6, `ServerSpend`, the `export` action from `CreditActionSchema` and `opts.server` from `refundCredits`. State in the design that `export-*` and `refund-*` entries belong to spec 08. Keep them in the invariants: C1 and the emulator property tests mix in 08's `startExport` / `failRender` calls (import them) so "balance equals the sum of all deltas" is proven across both writers. Decide the kill switch once, in D-13-9 and 08 R2.8 (suggested: the kill switch pauses AI and exports, since both cost money; reword R3.2). Put `exportCost` in `packages/schemas` and have `cost.ts` re-export it, so there is one table. Make `limits.ts` one task, done by whichever spec lands first, and say so in the other's task 1/2.

### Medium

**F3. The client half of the ledger is scheduled too late for spec 09's Generate.**
- Evidence: see the seam table. 09 task 18 says "Hosted path: swap in spec 13's `ServerCredits`", and `ServerCredits` is task 8 here.
- Fix: move to the early block: tasks 1 and 2 before 09 task 3, then 3, 4, 5, then 8 (the client, `useCredits`, `useCreditsClient`; the chip and `CREDITS_PLACEHOLDER` removal can stay in 8 or move to 09 task 11) and 9 (the modal) before 09 task 18. Update both `tasks.md` order lines so they say the same thing. Then 09's `CreditAction` is the one from task 1, and `chooseRoute` uses `costOf`.

**F4. A refused or failed refund silently costs the user credits, and a closed tab does too.**
- Evidence: failure table: "Refund refused (`too-old`, `limit`): logged; no user-facing change beyond the original error." R1.4 caps client refunds at 10 per UTC day. The Credits section promises "Failed cloud work is refunded."
- Effect: an AI outage (every call fails) refunds 10 and then keeps charging. A user who closes the tab between `spend` and the AI result loses 3 credits with no record that anything went wrong. D-13-1 accepts reserve-then-refund but names neither case.
- Fix: set `refundsPerDay` to at least the hourly cap (30, so the rate limit binds first), and show a toast "Couldn't return your credits. Tell us and we'll fix it." when a refund is refused. Add one sentence to D-13-1: a tab closed mid-call keeps the charge (the ledger row shows the spend and no refund). That is an honest limit for the write-up.

**F5. A judge can run dry in the middle of a review.**
- Evidence: R4.3 refills only "when a judge account signs in with fewer than 20 %", at most once per UTC day. Judges get 500 credits (about 160 Generates, fewer with exports at 5); a long session can reach 0, and the modal then says "Pip needs a recharge" with no way back until the next sign-in. `hackathon-compliance.md` requires "judge plan with generous credits" and funded access.
- Fix: also run the refill rule inside `spendCredits` when the plan is `judge` and the spend would be refused as `insufficient` (once per UTC day, same `judge-refill-{day}` ledger id), and extend C6 to cover it. This keeps the guarantee without a scheduler.

**F6. The e2e tasks need config that no task adds.**
- Evidence: `apps/web/playwright.config.ts` runs the `auth` project with `testMatch: /auth\.spec\.ts/`, and the `chromium` project ignores only `auth.spec.ts`. Task 17 adds `credits.spec.ts` "in the `auth` project". As written it would run in `chromium` without emulators and not in `auth`. Task 17 also needs `NEXT_PUBLIC_FAKE_AI=1` on the `auth` web server (spec 09 task 11 adds it only to "the Playwright local env") and a failing-Generate trigger, which spec 09's fake router does not have. CI has no Playwright job (`ci.yml` has `check`, `motion`, `secrets`, `rules`), and `.github/**` is denied to the builder agent.
- Fix: task 17 edits both `testMatch` and `testIgnore`, sets the fake-AI env on the auth server, and uses `?fakeFail=generate` (spec 09 F7 adds it). Add an IDE task for the CI Playwright job, with the Auth and Firestore emulators and Java, as the `rules` job already installs.

**F7. Usage reads and writes are expensive for a project that must stay near $0.**
- Evidence: Settings reads `users/{uid}/usage` with `limit(2000)` every time it opens, and each router call is one document write, up to 1,000 a day per user (R7.1). The Firestore free tier is 50 k reads and 20 k writes a day. Ten visits to Settings by one judge is 20 k reads. `security-and-cost.md` says "keep spend as close to $0 as possible".
- Fix: keep the per-event docs (data-model.md lists them), but let `POST /api/usage` also increment a per-day aggregate in the `limits/{day}` doc it already reads and writes: `usage: { device: n, cloud: n, deviceMs: [..], cloudMs: [..], saved: n }` as counters (no per-event reads). Settings then reads 14 small docs instead of 2,000, and `aggregateUsage` works on those. Medians need a bounded sample list or a histogram; use a fixed histogram of 12 latency buckets per route. If you keep the per-event read, cut `limit` to 300.

**F8. Rules validate `settings` and `displayName`, but `photoURL` and `lastSeenAt` are still client-writable with any type.**
- Evidence: `firestore.rules` allows updates whose `affectedKeys()` are within `displayName, photoURL, settings, lastSeenAt`. `UserDocSchema` requires `photoURL` to be a string if present and `lastSeenAt` a timestamp. D-13-10 says a malformed value "would make `UserDocSchema.parse` throw in bootstrap and in `useCredits`". The same is true of these two keys: `updateDoc(users/me, { photoURL: 5 })` locks the account out of bootstrap, the balance and the spend route.
- Fix: add `(!('photoURL' in request.resource.data) || request.resource.data.photoURL is string)` and `request.resource.data.lastSeenAt is timestamp` to task 7's rule, with failing-case tests for each. Prefer removing `lastSeenAt` from the client-writable keys, since only bootstrap writes it.

**F9. `units` is accepted for fixed-price actions.**
- Evidence: `SpendRequestSchema.units` is 1..20 for every action, and `costOf` is "per-unit cost × units". A client that sends `generate` with `units: 2` is charged 6 while the chip said 3. R1.2 says the cost comes from "the action and its units".
- Fix: a `superRefine` that allows `units > 1` only for `slots-detect`, `tts` and `transcribe`, and have the server ignore it for the rest. Add a case to task 1's tests and to C8.

### Low

- **F10. Builder-agent tooling.** Task 7 asks for the Firebase MCP (`firebase_validate_security_rules`) and task 18 for the Chrome DevTools MCP, both marked `[kiro]`. `motionpop-builder.json` allows MCP only for `context7/*`, and headless asks are denied. Add the MCP allow rules from the IDE (V2 fields, then `kiro-cli agent upgrade`), or run those steps in the IDE. Note that `firestore.rules` **is** in the agent's write paths, so task 7's rule edit itself is fine (spec 08's review F3 is out of date on this).
- **F11. Usage is self-reported.** A modified client can label a cloud call `device`, so the "credits saved" figure and the device/cloud chart are not proof. Say so in the write-up and in the usage section, as the trust model does for credits.
- **F12. `keepalive` flush and the ID token.** `visibilitychange: hidden` cannot await `getIdToken()`. Keep the last token (and its App Check token) in the reporter and send that; otherwise the flush on page hide fails in the common case.
- **F13. Ids.** Use `D-035` and up on merge; D-034 is reserved by spec 08, and the repo's convention is `D-0NN`, not `D-13-N`.
- **F14. Traceability.** R2.2 (chip and charge from one table) is cited only by task 2; task 8 should cite it too (the chip reads the cost). R1.6 goes away with F2.
- **F15. Judge Google sign-in.** `hackathon-compliance.md` asks for an email/password judge account and Google sign-in. Task 16 covers the first. State in the task that a verified Google account on the `JUDGE_EMAILS` list gets the plan through the same bootstrap path (R4.2) and test it once.
- **F16. Rules tests for the read paths.** Add owner-only read tests for `users/{uid}/usage` and `credits` queries as the Settings page runs them (`where`, `orderBy`, `limit`), so a rules change cannot silently break the page.
- **F17. Steering updates.** The list is good. Add `data-model.md`'s `UserDoc.settings` rule note and `hackathon-compliance.md`'s judge line ("topped up on sign-in and on a refused spend").

## Checks that passed

- **EARS and numbering:** R1 to R7 are numbered; criteria are testable and use WHEN/IF/WHILE/WHERE or ubiquitous form. The non-functional lines name how they are measured (task 4's p50 check).
- **Traceability:** every requirement maps to a task, every task cites ids, except R1.6 (see F2).
- **Reality:**
  - Exists as described: `bootstrapUser` with the `signup` entry and `SIGNUP_TX_ID`, `planBootstrap`, `parseJudgeEmails`, `serverConfig()`, `verifyRequest` (with App Check skipped only on emulators), `plan-allowance.server.ts` and its emulator test, `DailyLimitsSchema`, `CreditReasonSchema` (has `judge-grant`, `refund`, `export`), `CreditTxSchema`, `UserDocSchema`/`UserSettingsSchema`, `AppConfig` keys `freeCredits`, `judgeCredits`, `killSwitch`, `dailyBudgetCredits`, `imageCredits`, `onAIUsage`, `CREDITS_PLACEHOLDER` in `top-bar.tsx`, Pip `empty-pockets` ("Pip needs a recharge"), `CreditsChip`, `Modal`, `NumberRoll`, `Toggle`, `apiHeaders`.
  - New and said to be: `credits.ts`, `usage.ts`, `cost.ts`, `ledger*.ts`, the routes, `UsageReporter`, the settings UI.
  - `planCloud` already has to become optional (spec 08's review F1); this spec does it with `.default(0)`, which is right.
- **Rules and tests:** the existing rules already deny client writes to `credits`, `usage`, `limits`. Emulator tests live in `apps/web/rules/` and run in CI's `rules` job (`vitest.rules.config.ts` includes `rules/**/*.test.ts`). Properties C1 to C8 each have a task, and C1 and C2 run on the real emulator as well as a pure model, which meets `testing.md` ("balance never negative under random concurrent operations").
- **Steering:** zod at the boundaries, integer money, Admin-only writes inside transactions, App Check on every route, no client-sent amounts, no secrets in the repo (the judge password stays in the environment and the submission form), rate limit of 30 an hour as `security-and-cost.md` says, cost near $0 except F7.
- **Scope:** payments, BYOK, buying credits and an automatic budget counter are in Later. Settings is built for real, in the existing visual language (handoff §12), and opens from the account menu as handoff §10 says.
- **Design:** no PNG exists (`screens.md` "Not designed"); task 18 compares against the nearest designed screens and records mismatches.

## Top findings

1. **F1** A replayed spend key after a refund returns `ok: true` and charges nothing. Pass `refunded` into `decideSpend` and answer `key-used`.
2. **F2** Spec 08 writes `export-{rid}` / `refund-{rid}` in its own transaction, while this spec plans `s-export-…` through `ServerSpend`, a different kill-switch rule and a second cost table. Pick 08's, drop `ServerSpend`, and test the ledger invariant across both writers.
3. **F3** `ServerCredits`, the modal and the cost table are not in the block that spec 09's Generate waits for. Move tasks 1, 2, 8 and 9 forward.
4. **F4, F5** A refused refund or a closed tab costs the user credits silently, and a judge can run dry mid-review. Raise the refund cap, show a toast, and refill on a refused judge spend.
5. **F6, F7** The Playwright config and CI do not run `credits.spec.ts`, and a 2,000-document usage read per Settings visit costs real quota.
6. **F8** `photoURL` and `lastSeenAt` can still be written with the wrong type, which locks the account out the way D-13-10 describes for `settings`.

## Resolved

_Applied on 2026-11-16 in a headless run (claude-sonnet-5.5), using Claude Code's decisions on the open choices: spec 08 owns the transaction pattern and the fixed ledger ids and this spec generalises it as the one server spend helper; one `costOf` in `packages/schemas`; `DailyLimitsSchema` changed in one place; the kill switch blocks every cloud spend including exports; the seam block of tasks is listed exactly; steering and decision edits are an IDE task; tasks that need MCP servers the builder lacks are marked IDE; the CI Playwright job is added by Claude Code. Spec 08 was not edited: its R2.8 already says exports are refused while the kill switch is on._

| Finding | Where it is fixed |
|---|---|
| **F1** replayed key after a refund | `requirements.md` R1.3 (`key-used`); `design.md` Schemas (`SpendResponseSchema` reason `key-used`), Ledger (`decideSpend` takes `refunded`; step 1 of the order), Client (`ServerCredits` retries once on a fresh key), Failure handling, C3, D-13-12; `tasks.md` tasks 3, 5 and 8 |
| **F2** two ledger paths, opposite kill-switch rules, two cost tables, limits-doc conflict | `requirements.md` R1.6, R1.7, R2.1, R3.2 and the "Owned by spec 08" paragraph; `design.md` "The seams with specs 08 and 09" (pattern, ids, costs, kill switch, limits doc, balance hook, landing order), Ledger (`SpendSpec` with both id schemes; no `ServerSpend`), Costs (`packages/schemas/src/cost.ts`, export through 08's `exportCost`), D-13-4, D-13-9, D-13-11; `tasks.md` tasks 1 (touches no `planCloud` or `renders`), 2, 4 (helper, refactor of `startExport`/`failRender`), 5b and the cross-writer property C9 (R1.7) |
| **F3** client half scheduled too late | `design.md` "With spec 09 (Generate): exactly which tasks must land first" table; `tasks.md` "Order and the seams" table (1, 2, 3, 4, 5, 8, 9 before spec 09's Generate; 1 and 2 before 09 task 3) and the cloud route disabled until `ServerCredits` exists (R5.5, D-13-15) |
| **F4** refused refund and closed tab cost credits silently | `requirements.md` R1.4 (`refundsPerDay` 30) and R1.8 (toast); `design.md` Config keys, Client, Failure handling (closed-tab row), D-13-1; `tasks.md` tasks 8 and 9 |
| **F5** judge can run dry mid-review | `requirements.md` R4.3; `design.md` `decideSpend` step 4 (refill on a refused spend), Judge plan, C6, D-13-7; `tasks.md` tasks 3, 5 and 6 |
| **F6** e2e config and CI | `tasks.md` task 17 (`testMatch`/`testIgnore`, `NEXT_PUBLIC_FAKE_AI` on the auth server, `?fakeFail=generate`) and task 19 (CI Playwright job, IDE, done by Claude Code) |
| **F7** usage reads and writes too expensive | `requirements.md` R7.5 and the Settings read budget; `design.md` Usage (day counters and histogram in `limits/{day}`, Settings reads 14 docs), schemas (`UsageDayCountersSchema`, `LATENCY_BOUNDS_MS`), C7, D-13-13; `tasks.md` tasks 10 and 12 |
| **F8** `photoURL` and `lastSeenAt` client-writable | `requirements.md` R6.6; `design.md` Rules (type check, `lastSeenAt` server-only), D-13-10; `tasks.md` task 7 |
| **F9** `units` on fixed-price actions | `requirements.md` R1.2; `design.md` Schemas (`UNIT_ACTIONS`, `superRefine`), C8, D-13-14; `tasks.md` tasks 1 and 2 |
| **F10** builder tooling (MCP) | `tasks.md` header note, task 7 (Firebase MCP validation marked IDE; the rules edit stays `[kiro]` because `firestore.rules` is on the agent's allowed paths, with the diff-in-the-note fallback) and task 18 (Chrome DevTools MCP half marked IDE, Playwright half `[kiro]`) |
| **F11** usage is self-reported | `requirements.md` R7.6; `design.md` Trust model, UsageChart footnote, D-051; `tasks.md` task 13 |
| **F12** keepalive flush and the ID token | `requirements.md` R7.2; `design.md` Usage (`UsageReporter` token cache); `tasks.md` task 11 |
| **F13** decision ids | `design.md` "Decisions" (D-13-N labelled with D-050 to D-064; D-034 is spec 08's, D-035 to D-049 are spec 09's); `tasks.md` task 20 |
| **F14** traceability | `tasks.md` task 8 cites R2.2 and R5.5; R1.6 is now implemented by tasks 1 to 5b and cited there |
| **F15** judge Google sign-in | `requirements.md` R4.2; `design.md` Judge plan; `tasks.md` tasks 6 (test) and 16 (founder checks both sign-in methods) |
| **F16** read-path rules tests | `design.md` Rules and Testing approach; `tasks.md` task 7 |
| **F17** steering updates | `design.md` "Steering updates to make on merge"; `tasks.md` task 20 lists each exact edit, including the `UserDoc.settings` note in `data-model.md` and the judge line in `hackathon-compliance.md` |

Open for the founder: nothing new. The first-draft decision that exports run while the kill switch is on is reversed (D-058), so a judge pressing Export during a kill-switch event sees "Exports are paused for a moment. Try again soon."

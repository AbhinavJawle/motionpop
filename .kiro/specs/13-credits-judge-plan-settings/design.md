# Design: 13 credits, judge plan and settings

Written headlessly by Kiro CLI (`motionpop-builder`, Opus 5.5), 2026-11-16. Decisions made without the founder are listed at the end with their reasons.

## Overview

```
Browser                                         Server (App Hosting, Admin SDK)                Firestore
───────                                         ───────────────────────────────                ─────────
chooseRoute (spec 09) → chip "☁ 3"
click → ServerCredits.spend({action,key}) ──►  POST /api/credits/spend
                                                 verifyRequest (ID token + App Check)
                                                 SpendRequestSchema.parse
                                                 serverConfig() (costs, limits, kill switch)
                                                 spendCredits(tx):  read user, s-{key}, limits/{day}
                                                   decideSpend(...)  (pure)                 ──►  users/{uid}.credits
                                                   write user, ledger s-{key}, limits       ──►  users/{uid}/credits/s-{key}
◄── { ok, txId, balance, cost } ───────────────                                              ──►  users/{uid}/limits/{day}
router.run(..., ONLY_IN_CLOUD) (AI Logic)
  failure → ServerCredits.refund(txId) ──────► POST /api/credits/refund → refundCredits(tx) ──►  users/{uid}/credits/r-{key}

onSnapshot(users/{uid}) ◄──────────────────────────────────────────────────────────────────────  credits, plan, settings
router onUsage → UsageReporter (buffer) ────► POST /api/usage → writeUsage(tx + batch)    ──►  users/{uid}/usage/{id}
Settings → getDocs(usage, 14 days), getDocs(credits, last 20) ◄────────────────────────────────  (owner read)
sign-in → POST /api/users/bootstrap (spec 01) + judge upgrade/refill ──────────────────────►  users/{uid}, ledger
```

The ledger is append-only: entries are created, never updated or deleted. A refund is its own entry that points at the spend.

## What changes where

| Area | File | New / changed |
|---|---|---|
| Schemas | `packages/schemas/src/credits.ts` (new), `user.ts`, `limits.ts`, `config.ts`, `usage.ts` (new) | actions, spend/refund bodies, reasons `edit` and `image`, limit counters, config keys, usage event |
| Costs | `packages/ai/src/cost.ts` (new) | cost table and `costOf` |
| Ledger | `apps/web/lib/credits/ledger-logic.ts` (pure), `ledger.server.ts` | decisions and transactions |
| Routes | `apps/web/app/api/credits/spend/route.ts`, `refund/route.ts`, `apps/web/app/api/usage/route.ts` | new |
| Bootstrap | `apps/web/lib/users/bootstrap-plan.ts`, `bootstrap.server.ts` | judge upgrade and daily refill for existing users |
| Client | `apps/web/lib/credits/server-credits.ts`, `use-credits.ts`, `credits-ui.ts` | `ServerCredits`, live balance, modal state |
| Usage | `apps/web/lib/usage/reporter.ts`, `aggregate.ts`, `usage-store.ts` | buffer and flush; chart data |
| UI | `apps/web/components/credits/out-of-credits-modal.tsx`, `apps/web/components/settings/*`, `apps/web/app/(app)/settings/page.tsx`, `components/editor/account-menu.tsx` | new |
| Rules | `firestore.rules`, `apps/web/rules/firestore.rules.test.ts` | settings shape validation |
| Script | `apps/web/scripts/judge-account.ts` | founder-run judge account setup |

## Schemas (zod)

```ts
// packages/schemas/src/credits.ts
export const CreditActionSchema = z.enum([
  'generate', 'edit', 'pip-plan', 'custom', 'slots-detect', 'tts', 'transcribe', 'image', 'export',
]);
export type CreditAction = z.infer<typeof CreditActionSchema>;
/** Actions a browser may ask to spend on. Export is charged by spec 08's server route only. */
export const ClientCreditActionSchema = CreditActionSchema.exclude(['export']);

const Key = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
export const SpendRequestSchema = z.object({
  action: ClientCreditActionSchema,
  units: z.number().int().min(1).max(20).default(1),   // words/200, minutes; 1 otherwise
  key: Key,                                             // idempotency key, random per user action
  refId: z.string().max(80).optional(),                 // slot id, project id
});
export const SpendResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), txId: z.string(), balance: z.number().int().nonnegative(), cost: z.number().int().positive() }),
  z.object({ ok: z.literal(false), reason: z.enum(['insufficient', 'rate-limit', 'paused']),
             balance: z.number().int().nonnegative() }),
]);
export const RefundRequestSchema = z.object({ txId: z.string().regex(/^s-[A-Za-z0-9_-]{8,64}$/) });
export const RefundResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), balance: z.number().int().nonnegative(), alreadyRefunded: z.boolean() }),
  z.object({ ok: z.literal(false), reason: z.enum(['not-found', 'not-refundable', 'too-old', 'limit']) }),
]);
export const REASON_FOR: Record<CreditAction, CreditReason> = { generate: 'generate', edit: 'edit', … };
```

- `CreditReasonSchema` (user.ts) gains `'edit'` and `'image'` (additive).
- Ledger ids: `signup` (existing), `s-{key}` (spend), `r-{key}` (refund of `s-{key}`), `judge-upgrade`, `judge-refill-{yyyy-mm-dd}`. Export (spec 08) uses `s-export-{renderId}` and `r-export-{renderId}`.
- `CreditTxSchema` is unchanged: a spend has `delta: -cost`, `reason`, `refId`; a refund has `delta: +cost`, `reason: 'refund'`, `refId: 's-{key}'`.

```ts
// packages/schemas/src/limits.ts: DailyLimitsSchema grows (all additive)
planCloud: Count.default(0),                               // was required; default keeps old docs valid
aiByHour: z.record(z.string().regex(/^([01]\d|2[0-3])$/), Count).default({}),   // UTC hour → AI spends
refunds: Count.default(0),
usageEvents: Count.default(0),
```

```ts
// packages/schemas/src/config.ts: AppConfig grows (Remote Config key in brackets)
rateLimitCloudPerHour: 30          // [rate_limit_cloud_per_hour]
refundsPerDay: 10                  // [refunds_per_day]
usageEventsPerDay: 1000            // [usage_events_per_day]
creditCosts: {}                    // [credit_costs] JSON, partial overrides, e.g. {"generate":2}
```

```ts
// packages/schemas/src/usage.ts: users/{uid}/usage/{id} (data-model.md UsageEvent + three optional fields)
export const UsageEventInSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
  task: z.string().min(1).max(40),
  ranOn: RanOnSchema,
  model: z.string().max(60),
  credits: z.number().int().min(0).max(50),
  cloudCost: z.number().int().min(0).max(50),
  latencyMs: z.number().int().min(0).max(600_000),
  ok: z.boolean(),
  attempts: z.number().int().min(1).max(5).optional(),
  problems: z.array(z.string().max(200)).max(3).optional(),
  clientAt: z.number().int().nonnegative(),
});
export const UsageBatchSchema = z.object({ events: z.array(UsageEventInSchema).min(1).max(50) });
export const UsageEventDocSchema = UsageEventInSchema.omit({ id: true })
  .extend({ schemaVersion: z.literal(1), at: TimestampLikeSchema });
```

`credits` on a usage event is what the client says; the Credits section reads money from the ledger only.

## Costs (`packages/ai/src/cost.ts`)

```ts
export const DEFAULT_COSTS = {
  generate: 3, edit: 1, 'pip-plan': 2, custom: 3, 'slots-detect': 1, tts: 2, transcribe: 1,
  export720p: 3, export1080p: 5, export4k: 10,
} as const;   // image comes from AppConfig.imageCredits

export function costOf(action: CreditAction, units: number,
                       cfg: Pick<AppConfig, 'creditCosts' | 'imageCredits'>,
                       opts?: { resolution?: '720p' | '1080p' | '4k' }): number;
```

- Per-unit cost × units. `creditCosts` overrides single entries; an override that fails zod (`Count` per key) is ignored per key, like every other Remote Config key.
- A consistency test pins `GENERATE_COST` (component-fill), `editPatchTask().cloudCost`, `noteFixTask().cloudCost` and the `slots.detect` per-200-words rule to the table, so the chip and the charge can't drift.
- `slots-detect`, `tts` and `transcribe` units come from the client (word count, minutes) and are bounded to 1..20. The server can't verify them; see "Trust model".

## Ledger (pure logic + transactions)

```ts
// apps/web/lib/credits/ledger-logic.ts (pure, no Firebase)
export type SpendDecision =
  | { kind: 'replay'; balance: number; cost: number }                  // s-{key} exists
  | { kind: 'refuse'; reason: 'insufficient' | 'rate-limit' | 'paused'; balance: number }
  | { kind: 'charge'; cost: number; balanceAfter: number; hourCount: number };
export function decideSpend(i: { balance: number; cost: number; existing: { delta: number; balanceAfter: number } | null;
  ai: boolean; killSwitch: boolean; hourCount: number; hourLimit: number }): SpendDecision;

export type RefundDecision =
  | { kind: 'replay'; balance: number }
  | { kind: 'refuse'; reason: 'not-found' | 'not-refundable' | 'too-old' | 'limit' }
  | { kind: 'refund'; amount: number; balanceAfter: number };
export function decideRefund(i: { spend: CreditTx | null; refundExists: boolean; balance: number;
  nowMs: number; refundsToday: number; limit: number; maxAgeMs: number }): RefundDecision;
```

Order inside `decideSpend`: replay → paused (AI only) → rate limit (AI only) → insufficient → charge. A replay never re-checks limits, so a retried request after a timeout gets its first answer.

`ledger.server.ts`:
```ts
export async function spendCredits(db, uid, req: SpendRequest | ServerSpend, cfg: AppConfig, nowMs): Promise<SpendResponse>;
export async function refundCredits(db, uid, txId: string, cfg: AppConfig, nowMs, opts?: { server?: boolean }): Promise<RefundResponse>;
```
- One `runTransaction`: reads first (user doc, `s-{key}` or `r-{key}`, `limits/{utc day}`), then `decide*`, then writes (`t.update(user, { credits })`, `t.create(ledgerEntry)`, `t.set(limits, …, { merge: true })`). Firestore retries the transaction on contention, so concurrent spends serialise on the user doc.
- `ServerSpend` (spec 08) allows `action: 'export'` with a resolution; it is not rate limited and not paused by the kill switch.
- `opts.server` refunds (render failures, spec 08) skip the 15-minute age and the daily refund limit.
- Errors: a missing user doc → `HttpError(409, 'Not bootstrapped')`; the client retries bootstrap then the spend once.

Routes (`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, same shape as `plan-allowance`): `verifyRequest`, parse the body with zod (400 on failure), `serverConfig()`, call the transaction, answer 200 with the response schema. Refusals are 200 with `ok: false` (they are answers, not errors), so the client can tell them from a network failure.

## Judge plan (bootstrap for existing users)

`planBootstrap` stays for new users. A new pure `planReturning`:
```ts
export function planReturning(i: { user: UserDoc; profile: BootstrapProfile; judgeEmails: ReadonlySet<string>;
  judgeCredits: number; nowMs: number; upgradeDone: boolean; refilledToday: boolean }):
  { plan: Plan; grant: number; txId: string; refId: string } | null;
```
- Free, verified, on the list, `judge-upgrade` not present → plan `judge`, grant `max(0, judgeCredits − credits)`, tx `judge-upgrade`.
- Judge, `credits < 0.2 × judgeCredits`, no `judge-refill-{day}` → grant `judgeCredits − credits`, tx `judge-refill-{day}`.
- Otherwise null (only `lastSeenAt` is written, as today). A zero grant writes the plan change but no ledger entry.
- `bootstrapUser` reads the two ledger docs inside its existing transaction.

**Judge test account** (hackathon-compliance.md: email/password + Google): `apps/web/scripts/judge-account.ts` creates or updates the Auth user from `JUDGE_EMAIL` and `JUDGE_PASSWORD` in the environment with `emailVerified: true` and prints only the uid. The founder runs it against production and adds the email to the `JUDGE_EMAILS` secret. Nothing secret is committed; the password goes in the submission form only.

## Client

- `useCredits()` (`lib/credits/use-credits.ts`): `onSnapshot(users/{uid})`, parsed with `UserDocSchema`; returns `{ balance: number | null, plan: Plan | null, settings }`. A parse failure logs a warning and returns nulls (cloud actions then wait, R5.4).
- `ServerCredits implements CreditsClient` (spec 09 interface): `balance()` from the snapshot, `spend` posts with `apiHeaders`, maps `ok: false` reasons, maps a network error to `offline` (navigator offline) or `unavailable`, and takes the response's balance as the optimistic value until the snapshot catches up. Keys: `crypto.randomUUID()` without dashes (32 chars).
- `useCreditsClient()` (spec 09) returns `ServerCredits` when Firebase is configured and a user is signed in, else `LocalCredits`.
- `credits-ui.ts`: a tiny store with `openOutOfCredits()`, `rateLimited()` (toast), `paused()` (toast).
- Chips: the editor top bar's `CreditsChip` reads `useCredits().balance`; `null` shows a shimmer without a number. Clicking opens Settings › Credits (panel in the editor, page elsewhere). The `CREDITS_PLACEHOLDER` constant is deleted.

## Usage

- `UsageReporter` (`lib/usage/reporter.ts`): subscribes to `onAIUsage`, adds `id` (random, 24 chars) and `clientAt`, buffers, flushes on 15 s / 20 events / `visibilitychange: hidden` (`fetch(..., { keepalive: true })`). A failed flush keeps the events; above 200 buffered, the oldest are dropped and a counter notes how many (logged once). Local mode: events go to an in-memory `usage-store` only.
- `POST /api/usage`: verify, parse `UsageBatchSchema`, then one transaction: read `limits/{day}` and `getAll` of the event refs, drop ids that exist, cap at `usageEventsPerDay`, `create` the rest with `schemaVersion: 1` and a server `at`, increment `usageEvents`. Answers `{ written, dropped }`.
- `aggregateUsage(events, nowMs, days = 14, tzOffsetMin)` (`lib/usage/aggregate.ts`, pure): per local day `{ device, cloud }` counts of ok calls; figures `{ deviceCalls, medianDeviceMs, medianCloudMs, creditsSaved }` where `creditsSaved = Σ cloudCost of ok device events`.
- Settings reads `users/{uid}/usage` with `where('at', '>=', fourteenDaysAgo)`, `orderBy('at', 'desc')`, `limit(2000)` (single-field index, automatic), and `users/{uid}/credits` `orderBy('at', 'desc')`, `limit(20)`.

## UI

No PNG exists for Settings or the out-of-credits modal (screens.md "Not designed"). They are built in the same language from existing components, sized from the nearest designed frames.

### Out-of-credits modal (`components/credits/out-of-credits-modal.tsx`)
- `Modal` (the export dialog's backdrop, radius and glass, scale from 0.96), 440 wide.
- Ember bloom (design-system.md ambient bloom) behind `<Pip state="empty-pockets" size={120} glow />`.
- "Pip needs a recharge" (26 px semibold, tight tracking), "You can still make small edits on your device for free." (13 px `text-2`), one primary button "Keep editing" that closes it and focuses the quick-edit input when a slot is selected.
- Below, in 11 px mono `text-3`: the balance and the cost of what was attempted ("0 available · Generate costs 3"), so the reason is visible. Reduced motion: static pose.

### Settings content (`components/settings/`)
Three sections, each a card (`card`, r12, glass shadow), shared by the page and the panel:
- `AccountSection`: avatar 40 (photo or `PipAvatar`), name 15 px, email 12 px `text-2`, plan chip (`Chip` neutral "Free" / ember-tinted "Judge", since ember is the credits colour), "Sign out" secondary button.
- `AISection`: row "Prefer on-device AI" + description "Small edits run free on your device when they can." + `Toggle` (violet on); status row with a `StatusDot` (mint Ready, violet Setting up %, warn Can be set up + "Set up on-device AI" button, `text-3` Not available + "How to turn it on" link to the README section); `UsageChart`.
- `UsageChart`: SVG, 14 bars (8 px wide, 4 px gap in the panel; 24 px in the page), stacked mint (device) under violet (cloud), day ticks mono 9 px `text-4`, legend "⚡ On-device · free" mint and "☁ Cloud" violet using the `CostChip` styles; three figures in mono with labels ("12 edits on your device", "0.6 s on device · 2.1 s in the cloud", "~12 credits saved"). Empty: "No AI calls yet. Try a quick edit." Bars grow from 0 on mount (spring), static under reduced motion.
- `CreditsSection`: balance in mono 32 px with `NumberRoll`, plan line, the cost list from `costOf` ("Generate a graphic ☁ 3", "Cloud quick edit ☁ 1", "Pip plan ☁ 2 + graphics", "Export 1080p 5"), the last 20 ledger rows (reason in words: "Generated a graphic", "Refund", "Welcome credits", "Judge top-up"; delta mono, ember for debits, mint for credits; relative time `text-3`), and "Credits never go below zero. Failed cloud work is refunded."

### `/settings` page
- Top bar 56 (`bg-raised`): Pip logo + "motionpop", "‹ Home", credits chip, account menu.
- Eyebrow "SETTINGS" (ember, 11 px, letter-spacing 1.2), headline "Make it yours." (32 px semibold), at 1440 a 180 px sticky section nav (Account · AI & models · Credits, active violet pill as the rail) and a 720 px column. `#account`, `#ai`, `#credits` anchors; the credits chip links to `#credits`.

### Editor Settings panel and account menu
- `AccountMenu` (avatar button in the editor top bar, the dashboard and `/settings`): a `Dropdown`-style menu with "Settings" and "Sign out" (local mode: "Settings" only).
- In the editor, "Settings" opens the 340 px left panel (slide + fade 240 ms, collapse chevron on its right edge, the preview shrinks, the inspector and timeline stay). If spec 10's left-panel host exists when this is built, reuse it; else this spec adds `LeftPanelHost` and spec 10 reuses it. The rail keeps its eight items; none shows active while Settings is open (D-13-6).
- The panel stacks the three sections with compact spacing; the credits chip opens it scrolled to Credits.

## Rules (`firestore.rules`)

`users/{uid}` update today allows any value under `settings`. A malformed `settings` would make `UserDocSchema.parse` throw in bootstrap and in `useCredits` for that user. The update rule gains:
```
function validSettings(s) {
  return s is map
    && s.keys().hasOnly(['preferOnDevice', 'captionsDefault', 'defaultFormat'])
    && s.keys().hasAll(['preferOnDevice', 'captionsDefault', 'defaultFormat'])
    && s.preferOnDevice is bool && s.captionsDefault is bool
    && s.defaultFormat in ['16:9', '9:16', '1:1'];
}
allow update: if isOwner(uid)
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['displayName', 'photoURL', 'settings', 'lastSeenAt'])
  && validSettings(request.resource.data.settings)
  && request.resource.data.displayName is string && request.resource.data.displayName.size() <= 80;
```
`credits`, `usage` and `limits` stay `write: if false`. No new paths are client-writable.

## Trust model

The browser calls AI Logic directly (hybrid inference has to run there), so the server can't see a cloud call happen. Credits protect honest users from surprise and keep the demo economics clear; they do not stop a modified client. The real caps are App Check on AI Logic (D-025), the per-user hourly rate limit on spends, Firebase AI Logic's own per-user limits, GCP budget alerts and the Remote Config kill switch. Export (spec 08) is different: the server starts the render, so its charge is enforced. The write-up states this plainly.

## Failure handling

| Failure | Behaviour |
|---|---|
| Spend refused `insufficient` | out-of-credits modal; nothing charged |
| Spend refused `rate-limit` | toast "Pip needs a short break. Try again in a few minutes." |
| Spend refused `paused` | toast "Cloud AI is paused"; chips switch to disabled until Remote Config changes |
| Spend network error | toast "Couldn't reach Motionpop. Check your connection." ; no AI call |
| AI call fails after a spend | refund; on refund failure, retry once after 2 s, then log to the console with the tx id (the user keeps the toast "Couldn't generate") |
| Refund refused (`too-old`, `limit`) | logged; no user-facing change beyond the original error |
| User doc missing (409) | re-run bootstrap, then the spend once |
| Snapshot parse failure | balance `null`; chip shimmer; cloud actions wait |
| Usage flush fails | keep buffering (max 200) |
| Settings toggle write fails | toggle reverts, toast "Couldn't save that setting." |

## Edge cases

- Two tabs spend at once: the transaction serialises them; at most `floor(balance / cost)` succeed.
- A Remote Config cost change mid-session: the chip may show the old cost for up to an hour (client fetch interval); the server charges the new one and the response's `cost` is shown in the success state. Accepted for the hackathon (D-13-4).
- A day boundary during a session: limits are per UTC day/hour, keyed by the server's clock.
- A judge whose `judgeCredits` is lowered below their balance: no change (grants never take credits away).
- Deleting a project never refunds credits.

## Testing approach

- **Unit:** `costOf`, `decideSpend`, `decideRefund`, `planReturning`, `aggregateUsage`, reporter batching (fake timers, fake fetch), schemas, `ServerCredits` mapping (fake fetch).
- **Property (fast-check):** the credits property required by testing.md, both pure (model) and on the emulator; usage aggregation; judge top-up.
- **Emulator:** concurrent spends, idempotency, refund once, rate limit, usage cap (pattern of `bootstrap.emulator.test.ts` and `plan-allowance.emulator.test.ts`).
- **Rules:** settings validation and the server-only paths (`apps/web/rules/firestore.rules.test.ts`).
- **E2E (Playwright `auth` project on the emulators):** `apps/web/e2e/credits.spec.ts` (task 17).
- **Design check:** Settings page, the editor panel, the modal (task 18).

## Correctness properties

- **C1 Never negative.** For any interleaving of spends and refunds (random actions, units, keys, concurrency 1–8) on one user, every committed `balanceAfter ≥ 0` and the final balance equals the starting grant plus the sum of committed deltas. Pure model with `decide*`, and on the emulator with real transactions.
- **C2 Exactly-enough succeed.** N concurrent spends of cost c from balance b: exactly `min(N, floor(b / c))` succeed (emulator).
- **C3 Idempotent spend.** Repeating a request with the same key any number of times, concurrently or not, charges once and every answer carries the same `txId` and `balanceAfter`.
- **C4 Refund once.** Any number of refund requests for one spend add its cost back at most once; refunds of grants, refunds or other users' entries are refused.
- **C5 Rate limit.** In any sequence, at most `rateLimitCloudPerHour` AI spends commit per user per UTC hour; export spends are not counted.
- **C6 Judge top-up.** For any sequence of sign-ins over random days, a judge's balance after a sign-in is ≥ its balance before; refills happen at most once per UTC day and never raise the balance above `judgeCredits`; a free account is never granted judge credits unless verified and listed.
- **C7 Usage aggregation.** For random events: device + cloud per day sums to the ok events in the window; `creditsSaved` equals the sum of `cloudCost` over ok device events; events outside the 14 days are ignored; the result doesn't depend on input order.
- **C8 Cost consistency.** The task definitions' cloud costs equal `costOf` for the same action and units.

## Decisions (made headlessly, 2026-11-16; to log in `docs/decisions.md` on merge)

- **D-13-1 Reserve, then refund.** Cloud AI runs in the browser, so the server charges before the call (`spend`) and gives the credits back on failure (`refund`). Charging after a success would let a closed tab skip payment and makes the "cost before the action" rule hard to show.
- **D-13-2 Credits are a guard, not a security boundary, for browser AI calls** (Trust model). App Check, rate limits, budgets and the kill switch are the caps.
- **D-13-3 The ledger is append-only,** with deterministic ids (`s-`, `r-`, `judge-…`) for idempotency instead of status fields.
- **D-13-4 Costs live in one table in `packages/ai/src/cost.ts`** with a Remote Config JSON override; the server's table is the truth, and the client's copy may lag by one fetch interval.
- **D-13-5 Hourly limit in fixed UTC hours** (`aiByHour`), not a rolling window: one doc per day, no extra reads. It can allow up to 2× across an hour boundary; acceptable.
- **D-13-6 Settings opens from the account menu, not a ninth rail icon.** `handoff.md` §10 lists "Settings from the account menu" and the design has eight rail items. The editor shows it as a left panel; the rest of the app has `/settings`.
- **D-13-7 Judge top-up on sign-in** (below 20 %, once per UTC day) keeps judge access funded through Jan 29, 2027 without the founder topping up by hand.
- **D-13-8 Usage events go through a server route with a daily cap** (D-027's open item); the client buffers. Usage `credits` is informational; money is read from the ledger.
- **D-13-9 No automatic global budget counter for Nov 30.** The kill switch stays manual in Remote Config with GCP budget alerts (security-and-cost.md lists both); an automatic counter is Later.
- **D-13-10 Rules validate the `settings` map** so a client can't store a value that breaks the server's parse.

## Steering updates to make on merge

- `data-model.md`: ledger id scheme; `CreditReason` adds `edit`, `image`; `limits/{day}` fields `aiByHour`, `refunds`, `usageEvents`; `UsageEvent` adds `cloudCost`, `attempts`, `problems`, `clientAt`, `schemaVersion`; rules sketch adds `validSettings`.
- `security-and-cost.md`: the trust model paragraph (D-13-2); the kill switch stays manual (D-13-9).
- `ai-tasks.md` cost table: points to `packages/ai/src/cost.ts` as the single source.
- `screens.md` Settings and Out of credits: the copy chosen here ("Make it yours.", the section names, "0 available · Generate costs 3", the rate-limit toast).
- `handoff.md` §10: Settings opens from the account menu as a left panel (D-13-6).

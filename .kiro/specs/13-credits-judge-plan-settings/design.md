# Design: 13 credits, judge plan and settings

Written headlessly by Kiro CLI (`motionpop-builder`, Opus 5.5), 2026-11-16. Revised the same day (headless run, claude-sonnet-5.5) to apply every finding of `REVIEW.md`; the mapping is in its "Resolved" section. Decisions made without the founder are listed at the end with their reasons.

## Overview

```
Browser                                         Server (App Hosting, Admin SDK)                Firestore
───────                                         ───────────────────────────────                ─────────
chooseRoute (spec 09) → chip "☁ 3"  (costOf)
click → ServerCredits.spend({action,key}) ──►  POST /api/credits/spend
                                                 verifyRequest (ID token + App Check)
                                                 SpendRequestSchema.parse
                                                 serverConfig() (costs, limits, kill switch)
                                                 spendCredits(db, spec): the ONE helper (store/ledger.ts)
                                                   reads: user, s-{key}, r-{key}, limits/{day}, judge-refill-{day}
                                                   decideSpend(...)  (pure)                 ──►  users/{uid}.credits
                                                   writes: user, [refill], ledger s-{key}, limits ─► users/{uid}/credits/s-{key}
◄── { ok, txId, balance, cost } ───────────────                                              ──►  users/{uid}/limits/{day}
router.run(..., ONLY_IN_CLOUD) (AI Logic)
  failure → ServerCredits.refund(txId) ──────► POST /api/credits/refund → refund path of the same helper ──► users/{uid}/credits/r-{key}

Export (spec 08):  POST /api/renders → startExport(tx) ── same helper's read/decide/write pieces ──► export-{renderId}
                   job failure / sweep → failRender(tx) ── same helper's refund pieces ──────────────► refund-{renderId}

onSnapshot(users/{uid}) ◄──────────────────────────────────────────────────────────────────────  credits, plan, settings
router onUsage → UsageReporter (buffer) ────► POST /api/usage → writeUsage(tx + batch)    ──►  usage/{id} + limits/{day}.usage
Settings → getDocs(limits, 14 days), getDocs(credits, last 20) ◄───────────────────────────────  (owner read)
sign-in → POST /api/users/bootstrap (spec 01) + judge upgrade/refill ──────────────────────►  users/{uid}, ledger
```

The ledger is append-only: entries are created, never updated or deleted. A refund is its own entry that points at the spend.

## The seams with specs 08 and 09

### With spec 08 (export): one transaction pattern, one set of ids

Spec 08 is reviewed and being built first, so it owns the pattern. This spec generalises it and adds nothing parallel.

| Concern | Decision |
|---|---|
| Transaction pattern | Spec 08's `startExport` / `failRender` (design §7): all reads first, a pure decision, then writes with `t.create` on a fixed ledger id. This spec extracts the money part into the shared helper `services/render/src/store/ledger.ts` (`readLedger`, `writeSpend`, `writeRefund`, and `spendCredits` / `refundCredits` for single-purpose transactions). `startExport` calls the first two inside its own transaction, next to the render-doc and active-render reads. |
| Ledger ids | Export keeps `export-{renderId}` and `refund-{renderId}` (08, fixed). AI spends use `s-{key}` and `r-{key}`. The helper takes both ids as input, so there is one scheme with two prefixes and no `s-export-…`. |
| Costs | One `costOf` in `packages/schemas/src/cost.ts`. For exports it calls 08's `exportCost`. No export table in this spec. |
| Kill switch | Blocks every cloud spend, exports included. `decideSpend` checks it for both kinds. Export keeps its public error `disabled` (503) and the AI route answers `paused`. |
| Limits doc | `DailyLimitsSchema`: 08 task 2 owns `planCloud.default(0)` and `renders`. This spec's task 1 adds only `aiByHour`, `refunds`, `usageEvents` and `usage`. Neither spec edits the other's keys. |
| Balance hook | `useCredits` (task 8) is the one hook. 08's `useCreditBalance` (08 task 14) is `useCredits().balance`; whichever task lands first creates `lib/credits/use-credits.ts`. |
| Judge refill | Runs inside the helper for every kind of spend, so a judge's export is also topped up (R4.3). |
| Landing order | 08's tasks 2 (schemas) and 8 (store) are scheduled before this spec's task 1 and task 4 respectively. If 08 task 8 has not landed when task 4 runs, task 4 creates the `store/` folder with `ledger-logic.ts`, `ledger.ts`, the `./store` subpath export and its "never imports the producer" test; 08 task 8 then calls the helper from `startExport` and `failRender` instead of writing its own. If 08 task 8 has landed, task 4 refactors `startExport` / `failRender` onto the helper with 08's emulator properties P1–P3 as the guard. |

The package is named `@motionpop/render` for historical reasons; the `./store` subpath is "server store code that touches the ledger". A rename is Later.

### With spec 09 (Generate): exactly which tasks must land first

Spec 09's tasks 3 and 11 read costs and the credits client; task 18 (Generate) runs real cloud calls. The block below must land in this order.

| 13 task | What it provides | Needed by (spec 09) | Why |
|---|---|---|---|
| 1 Schemas | `CreditAction`, `ClientCreditAction`, spend and refund bodies, `key-used` | before task 3 and task 11 | 09 imports the types instead of writing its own |
| 2 `costOf` | the one cost table | before task 3 (`chooseRoute` takes `cloudCost` from it) | chip and charge from one table |
| 3 Ledger logic (pure) | `decideSpend`, `decideRefund` | before task 18's P5 (task 11's contract test needs only `LocalCredits`) | one contract for local and server |
| 4 Ledger helper and routes | `/api/credits/spend`, `/refund` | before task 18 on the hosted path | the charge itself |
| 5 Emulator tests | proof the ledger is exact | before task 18 | no unmetered or double-charged Generate |
| 8 `useCredits`, `ServerCredits`, chip | `ServerCredits` as spec 09's `CreditsClient`; live chip | before task 18 | the cloud route stays disabled until it exists |
| 9 Out-of-credits modal | the real modal | before task 18 | R6.3 of spec 09 opens it (09 task 11b ships a stub) |

Until task 8 has landed, the hosted app keeps every cloud action disabled ("Cloud AI is coming soon"). `useCreditsClient()` returns `LocalCredits` only when Firebase is not configured or `NEXT_PUBLIC_FAKE_AI=1`; with Firebase configured and no `ServerCredits`, `cloudAvailable` is false (spec 09 design, "Credits seam").

## What changes where

| Area | File | New / changed |
|---|---|---|
| Schemas | `packages/schemas/src/credits.ts` (new), `user.ts`, `limits.ts`, `config.ts`, `usage.ts` (new) | actions, spend/refund bodies, reasons `edit` and `image`, this spec's limit counters, config keys, usage event and day counters |
| Costs | `packages/schemas/src/cost.ts` (new) | `DEFAULT_COSTS` for AI actions, `costOf` (export delegates to 08's `exportCost`) |
| Ledger logic | `services/render/src/store/ledger-logic.ts` (new, pure) | `decideSpend`, `decideRefund` |
| Ledger helper | `services/render/src/store/ledger.ts` (new), `store/index.ts` | shared transaction pieces; `spendCredits`, `refundCredits` |
| Web wiring | `apps/web/lib/credits/ledger.server.ts` | `adminDb()` and `serverConfig()` wired to the helper (the pattern of 08's `export-tx.server.ts`) |
| Routes | `apps/web/app/api/credits/spend/route.ts`, `refund/route.ts`, `apps/web/app/api/usage/route.ts` | new |
| Bootstrap | `apps/web/lib/users/bootstrap-plan.ts`, `bootstrap.server.ts` | judge upgrade and daily refill for existing users |
| Client | `apps/web/lib/credits/server-credits.ts`, `use-credits.ts`, `credits-ui.ts` | `ServerCredits`, live balance, modal state |
| Usage | `apps/web/lib/usage/reporter.ts`, `aggregate.ts`, `usage-store.ts` | buffer and flush; chart data from day counters |
| UI | `apps/web/components/credits/out-of-credits-modal.tsx`, `apps/web/components/settings/*`, `apps/web/app/(app)/settings/page.tsx`, `components/editor/account-menu.tsx` | new |
| Rules | `firestore.rules`, `apps/web/rules/firestore.rules.test.ts` | `validSettings`, `photoURL` type, `lastSeenAt` server-only; read-path tests |
| Script | `apps/web/scripts/judge-account.ts` | founder-run judge account setup |

## Schemas (zod)

```ts
// packages/schemas/src/credits.ts
export const CreditActionSchema = z.enum([
  'generate', 'edit', 'pip-plan', 'custom', 'slots-detect', 'tts', 'transcribe', 'image', 'export',
]);
export type CreditAction = z.infer<typeof CreditActionSchema>;
/** Actions a browser may ask to spend on through /api/credits/spend. Export is charged inside spec 08's
 *  startExport, through the same helper, never by a client-sent spend. */
export const ClientCreditActionSchema = CreditActionSchema.exclude(['export']);
export type ClientCreditAction = z.infer<typeof ClientCreditActionSchema>;
/** Only these actions are priced per unit (words / 200, minutes). Everything else is units: 1. */
export const UNIT_ACTIONS = ['slots-detect', 'tts', 'transcribe'] as const;

const Key = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
export const SpendRequestSchema = z.object({
  action: ClientCreditActionSchema,
  units: z.number().int().min(1).max(20).default(1),
  key: Key,                                             // idempotency key: a NEW random key per attempt
  refId: z.string().max(80).optional(),                 // slot id, project id
}).superRefine((r, ctx) => {                            // review F9: the chip said one price
  if (r.units > 1 && !(UNIT_ACTIONS as readonly string[]).includes(r.action))
    ctx.addIssue({ code: 'custom', path: ['units'], message: 'units applies to slots-detect, tts and transcribe only' });
});
export const SpendResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), txId: z.string(), balance: z.number().int().nonnegative(), cost: z.number().int().positive() }),
  z.object({ ok: z.literal(false), reason: z.enum(['insufficient', 'rate-limit', 'paused', 'key-used']),
             balance: z.number().int().nonnegative() }),
]);
export const RefundRequestSchema = z.object({ txId: z.string().regex(/^s-[A-Za-z0-9_-]{8,64}$/) }); // never export-*
export const RefundResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), balance: z.number().int().nonnegative(), alreadyRefunded: z.boolean() }),
  z.object({ ok: z.literal(false), reason: z.enum(['not-found', 'not-refundable', 'too-old', 'limit']) }),
]);
export const REASON_FOR: Record<CreditAction, CreditReason> = { generate: 'generate', edit: 'edit', … 'export': 'export' };
```

- `CreditReasonSchema` (user.ts) gains `'edit'` and `'image'` (additive; `export`, `refund` and `judge-grant` exist).
- Ledger ids: `signup` (existing), `s-{key}` / `r-{key}` (AI spend and its refund), `export-{renderId}` / `refund-{renderId}` (spec 08), `judge-upgrade`, `judge-refill-{yyyy-mm-dd}`.
- `CreditTxSchema` is unchanged: a spend has `delta: -cost`, `reason`, `refId`; a refund has `delta: +cost`, `reason: 'refund'`, `refId`: `s-{key}` for an AI refund, the render id for an export refund (08). The pairing used by the invariants is by id (`s-` ↔ `r-`, `export-` ↔ `refund-`), not by `refId`.

```ts
// packages/schemas/src/limits.ts: this spec adds ONLY the keys below (all additive, all defaulted).
// `planCloud: .default(0)` and `renders` belong to spec 08 task 2 and are not touched here.
aiByHour: z.record(z.string().regex(/^([01]\d|2[0-3])$/), Count).default({}),   // UTC hour → AI spends
refunds: Count.default(0),
usageEvents: Count.default(0),
usage: UsageDayCountersSchema.default(emptyUsageDay),   // see "Usage"
```

```ts
// packages/schemas/src/config.ts: AppConfig grows (Remote Config key in brackets)
rateLimitCloudPerHour: 30          // [rate_limit_cloud_per_hour]
refundsPerDay: 30                  // [refunds_per_day]  at least the hourly cap, so the rate limit binds first
usageEventsPerDay: 1000            // [usage_events_per_day]
creditCosts: {}                    // [credit_costs] JSON, partial overrides of AI costs, e.g. {"generate":2}
// Spec 08 adds exportsEnabled, exportMaxMs, rendersPerUserPerDay, exportCredits; they are not repeated here.
```

```ts
// packages/schemas/src/usage.ts
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

/** Latency histogram bounds (ms, upper edges); a 12th bucket holds everything slower. */
export const LATENCY_BOUNDS_MS = [100, 250, 500, 1000, 2000, 4000, 8000, 15000, 30000, 60000, 120000] as const;
export const UsageDayCountersSchema = z.object({
  device: Count, cloud: Count,                 // ok calls per route
  saved: Count,                                // Σ cloudCost of ok device calls
  deviceMs: z.array(Count).length(12),         // histogram, ok device calls
  cloudMs: z.array(Count).length(12),
});
```

`credits` on a usage event is what the client says; the Credits section reads money from the ledger only.

## Costs (`packages/schemas/src/cost.ts`)

One table, one function. It sits in `packages/schemas` because the browser chip, `packages/ai`, the web server and the render store all need it, and `packages/schemas` is what they already share.

```ts
export const DEFAULT_COSTS = {
  generate: 3, edit: 1, 'pip-plan': 2, custom: 3, 'slots-detect': 1, tts: 2, transcribe: 1,
} as const;   // image comes from AppConfig.imageCredits; export from spec 08's exportCost

export function costOf(action: CreditAction, units: number,
                       cfg: Pick<AppConfig, 'creditCosts' | 'imageCredits' | 'exportCredits'>,
                       opts?: { resolution: Resolution; durationMs: number }): number;
```

- AI actions: per-unit cost × `units` (units is 1 except for `UNIT_ACTIONS`). `creditCosts` overrides single entries; an override that fails zod (`Count` per key) is ignored per key, like every other Remote Config key.
- `export`: `exportCost(opts.resolution, opts.durationMs, cfg.exportCredits)` from `render.ts`; `units` is ignored. There is no other export price.
- A consistency test pins `GENERATE_COST` (component-fill), `editPatchTask().cloudCost`, `noteFixTask().cloudCost`, the `slots.detect` per-200-words rule and spec 08's modal cost line to `costOf`, so the chip and the charge can't drift (C8).
- `slots-detect`, `tts` and `transcribe` units come from the client (word count, minutes) and are bounded to 1..20. The server can't verify them; see "Trust model".

## Ledger (pure logic + one shared helper)

```ts
// services/render/src/store/ledger-logic.ts (pure, no Firebase)
export type SpendDecision =
  | { kind: 'replay'; balance: number; cost: number }                    // s-{key} exists and is not refunded
  | { kind: 'refuse'; reason: 'insufficient' | 'rate-limit' | 'paused' | 'key-used'; balance: number }
  | { kind: 'charge'; cost: number; balanceAfter: number; hourCount: number;
      refill?: { grant: number; balanceAfterGrant: number } };            // judge top-up first, then the charge
export function decideSpend(i: {
  kind: 'ai' | 'export';
  balance: number; cost: number;
  existing: { delta: number; balanceAfter: number } | null;   // the spend entry, if present
  refunded: boolean;                                          // the refund entry exists (r-{key} / refund-{rid})
  killSwitch: boolean;
  hourCount: number; hourLimit: number;                       // AI only
  judge: { eligible: boolean; judgeCredits: number } | null;  // plan judge and no judge-refill-{day} yet
}): SpendDecision;

export type RefundDecision =
  | { kind: 'replay'; balance: number }
  | { kind: 'refuse'; reason: 'not-found' | 'not-refundable' | 'too-old' | 'limit' }
  | { kind: 'refund'; amount: number; balanceAfter: number };
export function decideRefund(i: { spend: CreditTx | null; refundExists: boolean; balance: number;
  nowMs: number; refundsToday: number; limit: number; maxAgeMs: number; server: boolean }): RefundDecision;
```

Order inside `decideSpend`:

1. **Replay.** If the spend entry exists: `refunded` → refuse `key-used` (review F1: a refunded key can never answer `ok: true`); otherwise answer the first result. A replay never re-checks limits, so a retry after a timeout gets its first answer.
2. **Paused.** `killSwitch` refuses every kind (R3.2).
3. **Rate limit.** AI only.
4. **Insufficient, with the judge refill.** If `balance < cost` and `judge.eligible`, the decision is `charge` with `refill: { grant: judgeCredits − balance }` provided `balance + grant ≥ cost`; otherwise refuse `insufficient` and write nothing. (review F5, R4.3.)
5. **Charge.**

`decideRefund` takes `server: true` for render failures (spec 08), which skips the 15-minute age and the daily limit, exactly as 08's `failRender` already does.

`services/render/src/store/ledger.ts` is the one helper:

```ts
export interface SpendSpec {
  uid: string; kind: 'ai' | 'export';
  spendId: string;     // 's-{key}' | 'export-{renderId}'
  refundId: string;    // 'r-{key}' | 'refund-{renderId}'
  reason: CreditReason; refId: string; cost: number;
}
/** Reads for one spend, to be called inside a transaction BEFORE any write (Firestore rule). */
export function readLedger(t: Transaction, db: Firestore, s: SpendSpec, nowMs: number): Promise<LedgerReads>;
/** Applies a decision: user update, optional judge-refill entry, spend entry, limits merge. No reads. */
export function writeSpend(t: Transaction, db: Firestore, s: SpendSpec, d: SpendDecision, reads: LedgerReads, nowMs: number): void;
export function writeRefund(t: Transaction, db: Firestore, s: SpendSpec, d: RefundDecision, reads: LedgerReads, nowMs: number): void;
/** Convenience for single-purpose transactions (the AI spend and refund routes). */
export function spendCredits(db, s: SpendSpec, cfg: AppConfig, nowMs): Promise<SpendResponse>;
export function refundCredits(db, uid, txId: string, cfg: AppConfig, nowMs): Promise<RefundResponse>;
```

- One `runTransaction`: reads first (user doc, spend entry, refund entry, `limits/{utc day}`, `judge-refill-{day}`), then `decide*`, then writes (`t.update(user, { credits })`, `t.create(ledgerEntry)`, `t.set(limits, …, { merge: true })`). Firestore retries on contention, so concurrent spends serialise on the user doc.
- `startExport` (08) and `failRender` (08) call `readLedger` / `writeSpend` / `writeRefund` inside their own transactions together with the render-doc reads and writes. They keep their fixed ids and their idempotent replay (an existing render for the same request id returns before any money moves). A "Try again" after a failed export is a new request id, which is a new `export-{renderId}`.
- `spendCredits` is used by `POST /api/credits/spend`. `refundCredits` by `POST /api/credits/refund` (client refunds, `server: false`, only `s-` ids).
- Errors: a missing user doc → `HttpError(409, 'Not bootstrapped')`; the client retries bootstrap then the spend once.
- A test imports the `./store` index and asserts it never imports the producer (08 task 8's test; created here if 08 has not yet).

Routes (`runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, same shape as `plan-allowance`): `verifyRequest`, parse the body with zod (400 on failure), `serverConfig()`, call the helper, answer 200 with the response schema. Refusals are 200 with `ok: false` (they are answers, not errors), so the client can tell them from a network failure.

## Judge plan (bootstrap for existing users)

`planBootstrap` stays for new users. A new pure `planReturning`:
```ts
export function planReturning(i: { user: UserDoc; profile: BootstrapProfile; judgeEmails: ReadonlySet<string>;
  judgeCredits: number; nowMs: number; upgradeDone: boolean; refilledToday: boolean }):
  { plan: Plan; grant: number; txId: string; refId: string } | null;
```
- Free, verified, on the list, `judge-upgrade` not present → plan `judge`, grant `max(0, judgeCredits − credits)`, tx `judge-upgrade`. The sign-in method does not matter: a verified Google account on `JUDGE_EMAILS` takes the same path as email/password (review F15).
- Judge, `credits < 0.2 × judgeCredits`, no `judge-refill-{day}` → grant `judgeCredits − credits`, tx `judge-refill-{day}`.
- Otherwise null (only `lastSeenAt` is written, as today). A zero grant writes the plan change but no ledger entry.
- `bootstrapUser` reads the two ledger docs inside its existing transaction.
- The refill inside a refused spend (see `decideSpend` step 4) uses the same ledger id and the same once-per-day rule, so sign-in and spend can't both pay on one day. This keeps a judge funded in the middle of a long review without a scheduler.

**Judge test account** (hackathon-compliance.md: email/password + Google): `apps/web/scripts/judge-account.ts` creates or updates the Auth user from `JUDGE_EMAIL` and `JUDGE_PASSWORD` in the environment with `emailVerified: true` and prints only the uid. The founder runs it against production and adds the email to the `JUDGE_EMAILS` secret. Nothing secret is committed; the password goes in the submission form only. The Google path needs no script: the founder signs in once with a verified Google account that is on the list and sees the Judge chip.

## Client

- `useCredits()` (`lib/credits/use-credits.ts`): `onSnapshot(users/{uid})`, parsed with `UserDocSchema`; returns `{ balance: number | null, plan: Plan | null, settings }`. A parse failure logs a warning and returns nulls (cloud actions then wait, R5.4). Spec 08's `useCreditBalance` is `useCredits().balance`.
- `ServerCredits implements CreditsClient` (spec 09 interface): `balance()` from the snapshot, `spend` posts with `apiHeaders`, maps `ok: false` reasons, maps a network error to `offline` (navigator offline) or `unavailable`, and takes the response's balance as the optimistic value until the snapshot catches up. Keys: `crypto.randomUUID()` without dashes (32 chars), a new one per attempt. On `key-used` it takes a fresh key and tries once more (the spend happens before any AI call, so this can't double-charge); a second `key-used` is `unavailable`. `refund` retries once after 2 s; a refused or failed refund raises the toast in R1.8.
- `useCreditsClient()` (spec 09, first written there with `LocalCredits`): `ServerCredits` when Firebase is configured and a user is signed in; `LocalCredits` only when Firebase is not configured or `NEXT_PUBLIC_FAKE_AI=1`; otherwise none, and cloud actions are disabled with "Cloud AI is coming soon" (R5.5).
- `credits-ui.ts`: a tiny store with `openOutOfCredits()`, `rateLimited()` (toast), `paused()` (toast), `refundFailed()` (toast).
- Chips: the editor top bar's `CreditsChip` reads `useCredits().balance`; `null` shows a shimmer without a number. Clicking opens Settings › Credits (panel in the editor, page elsewhere). The `CREDITS_PLACEHOLDER` constant is deleted. Spec 09 task 11b first wires the chip to `useCreditsClient().balance()`; task 8 here swaps in `useCredits`.

## Usage

- `UsageReporter` (`lib/usage/reporter.ts`): subscribes to `onAIUsage`, adds `id` (random, 24 chars) and `clientAt`, buffers, flushes on 15 s / 20 events / `visibilitychange: hidden` (`fetch(..., { keepalive: true })`). It keeps the last ID token and App Check token from the most recent normal flush and sends those on the hidden-page flush (a hidden page can't await `getIdToken()`); if none exists yet it skips the keepalive flush and keeps the events. A failed flush keeps the events; above 200 buffered, the oldest are dropped and a counter notes how many (logged once). Local mode: events go to an in-memory `usage-store` only.
- `POST /api/usage`: verify, parse `UsageBatchSchema`, then one transaction: read `limits/{day}` and `getAll` of the event refs, drop ids that exist, cap at `usageEventsPerDay`, `create` the rest with `schemaVersion: 1` and a server `at`, and in the same transaction add the written ok events to `limits/{day}.usage` (counts per route, `saved`, one latency histogram bucket each) and increment `usageEvents`. Answers `{ written, dropped }`. Failed events (`ok: false`) are stored but not counted in the chart.
- **Why counters (review F7).** Settings used to read up to 2,000 event documents each time it opened. The Firestore free tier is 50 k reads a day, so ten visits by one judge would use 40 % of it. Now Settings reads at most 14 `limits` docs and 20 ledger rows. The event documents stay (data-model.md lists them, and the write-up uses them) but the app never reads them.
- `aggregateUsage(days: { day: string; usage: UsageDayCounters }[], todayUtc: string)` (`lib/usage/aggregate.ts`, pure): fills the last 14 UTC days (zeros for missing docs), returns per-day `{ device, cloud }` and the figures `{ deviceCalls, medianDeviceMs, medianCloudMs, creditsSaved }`. A median is the upper edge of the first histogram bucket whose running total reaches half of the calls (the last bucket reports 120 000); it is exact to the bucket, which the label shows ("about 0.6 s").
- Settings reads `limits` with `where(documentId(), '>=', fourteenDaysAgoKey)`, `orderBy(documentId())`, `limit(14)` (owner-only, covered by the existing `limits` read rule), and `users/{uid}/credits` `orderBy('at', 'desc')`, `limit(20)`.

## UI

No PNG exists for Settings or the out-of-credits modal (screens.md "Not designed"). They are built in the same language from existing components, sized from the nearest designed frames.

### Out-of-credits modal (`components/credits/out-of-credits-modal.tsx`)
- `Modal` (the export dialog's backdrop, radius and glass, scale from 0.96), 440 wide.
- Ember bloom (design-system.md ambient bloom) behind `<Pip state="empty-pockets" size={120} glow />`.
- "Pip needs a recharge" (26 px semibold, tight tracking), "You can still make small edits on your device for free." (13 px `text-2`), one primary button "Keep editing" that closes it and focuses the quick-edit input when a slot is selected.
- Below, in 11 px mono `text-3`: the balance and the cost of what was attempted ("0 available · Generate costs 3"), so the reason is visible. Reduced motion: static pose.
- Spec 09 task 11b ships a stub with the same props; task 9 replaces it.

### Settings content (`components/settings/`)
Three sections, each a card (`card`, r12, glass shadow), shared by the page and the panel:
- `AccountSection`: avatar 40 (photo or `PipAvatar`), name 15 px, email 12 px `text-2`, plan chip (`Chip` neutral "Free" / ember-tinted "Judge", since ember is the credits colour), "Sign out" secondary button.
- `AISection`: row "Prefer on-device AI" + description "Small edits run free on your device when they can." + `Toggle` (violet on); status row with a `StatusDot` (mint Ready, violet Setting up %, warn Can be set up + "Set up on-device AI" button, `text-3` Not available + "How to turn it on" link to the README section); `UsageChart`.
- `UsageChart`: SVG, 14 bars (8 px wide, 4 px gap in the panel; 24 px in the page), stacked mint (device) under violet (cloud), day ticks mono 9 px `text-4` (UTC days), legend "⚡ On-device · free" mint and "☁ Cloud" violet using the `CostChip` styles; three figures in mono with labels ("12 edits on your device", "about 0.6 s on device · about 2 s in the cloud", "~12 credits saved"). Footnote in 10 px `text-3`: "Usage is reported by your browser." Empty: "No AI calls yet. Try a quick edit." Bars grow from 0 on mount (spring), static under reduced motion.
- `CreditsSection`: balance in mono 32 px with `NumberRoll`, plan line, the cost list from `costOf` ("Generate a graphic ☁ 3", "Cloud quick edit ☁ 1", "Pip plan ☁ 2 + graphics", "Export 1080p 5"), the last 20 ledger rows (reason in words: "Generated a graphic", "Refund", "Welcome credits", "Judge top-up"; delta mono, ember for debits, mint for credits; relative time `text-3`), and "Credits never go below zero. Failed cloud work is refunded."

### `/settings` page
- Top bar 56 (`bg-raised`): Pip logo + "motionpop", "‹ Home", credits chip, account menu.
- Eyebrow "SETTINGS" (ember, 11 px, letter-spacing 1.2), headline "Make it yours." (32 px semibold), at 1440 a 180 px sticky section nav (Account · AI & models · Credits, active violet pill as the rail) and a 720 px column. `#account`, `#ai`, `#credits` anchors; the credits chip links to `#credits`.

### Editor Settings panel and account menu
- `AccountMenu` (avatar button in the editor top bar, the dashboard and `/settings`): a `Dropdown`-style menu with "Settings" and "Sign out" (local mode: "Settings" only).
- In the editor, "Settings" opens the 340 px left panel (slide + fade 240 ms, collapse chevron on its right edge, the preview shrinks, the inspector and timeline stay). If spec 10's left-panel host exists when this is built, reuse it; else this spec adds `LeftPanelHost` and spec 10 reuses it. The rail keeps its eight items; none shows active while Settings is open (D-13-6).
- The panel stacks the three sections with compact spacing; the credits chip opens it scrolled to Credits.

## Rules (`firestore.rules`)

`users/{uid}` update today allows any value under `settings`, `photoURL` and `lastSeenAt`. A malformed value of any of them would make `UserDocSchema.parse` throw in bootstrap and in `useCredits` for that user, locking the account out of the balance and the spend route. The update rule becomes:
```
function validSettings(s) {
  return s is map
    && s.keys().hasOnly(['preferOnDevice', 'captionsDefault', 'defaultFormat'])
    && s.keys().hasAll(['preferOnDevice', 'captionsDefault', 'defaultFormat'])
    && s.preferOnDevice is bool && s.captionsDefault is bool
    && s.defaultFormat in ['16:9', '9:16', '1:1'];
}
allow update: if isOwner(uid)
  // lastSeenAt is written by the bootstrap route only (Admin SDK), so it is no longer client-writable.
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['displayName', 'photoURL', 'settings'])
  && request.resource.data.displayName is string && request.resource.data.displayName.size() <= 80
  && (!('photoURL' in request.resource.data) || request.resource.data.photoURL is string)
  && validSettings(request.resource.data.settings);
```
`credits`, `usage` and `limits` stay `write: if false`. No new paths are client-writable. Reads stay owner-only; rules tests run the exact queries the Settings page issues (`limits` with a document-id range and `limit(14)`, `credits` with `orderBy('at', 'desc').limit(20)`) as the owner (allowed) and as another user (denied).

## Trust model

The browser calls AI Logic directly (hybrid inference has to run there), so the server can't see a cloud call happen. Credits protect honest users from surprise and keep the demo economics clear; they do not stop a modified client. The real caps are App Check on AI Logic (D-025), the per-user hourly rate limit on spends, Firebase AI Logic's own per-user limits, GCP budget alerts and the Remote Config kill switch. Export (spec 08) is different: the server starts the render, so its charge is enforced. Usage events are also reported by the browser: a modified client can label a cloud call `device`, so "credits saved" and the device/cloud chart show what the design does for an honest client, not proof. The write-up states both plainly.

## Failure handling

| Failure | Behaviour |
|---|---|
| Spend refused `insufficient` | out-of-credits modal; nothing charged (a judge is topped up first, once per UTC day) |
| Spend refused `rate-limit` | toast "Pip needs a short break. Try again in a few minutes." |
| Spend refused `paused` | toast "Cloud AI is paused"; chips switch to disabled until Remote Config changes |
| Spend refused `key-used` | the client takes a fresh key and tries once more; a second `key-used` is `unavailable` |
| Spend network error | toast "Couldn't reach Motionpop. Check your connection." ; no AI call |
| AI call fails after a spend | refund; on refund failure, retry once after 2 s, then toast "Couldn't return your credits. Tell us and we'll fix it." and log the tx id (the user also keeps the toast "Couldn't generate") |
| Refund refused (`too-old`, `limit`) | the same "Couldn't return your credits" toast and a log line; with `refundsPerDay` at 30 the limit only binds for abuse |
| Tab closed between `spend` and the AI result | the charge stays; the ledger shows the spend and no refund. An honest limit of reserve-then-refund (D-13-1), stated in the write-up |
| User doc missing (409) | re-run bootstrap, then the spend once |
| Snapshot parse failure | balance `null`; chip shimmer; cloud actions wait |
| `ServerCredits` not available (hosted, before task 8) | cloud actions disabled "Cloud AI is coming soon"; no cloud call |
| Usage flush fails | keep buffering (max 200) |
| Settings toggle write fails | toggle reverts, toast "Couldn't save that setting." |

## Edge cases

- Two tabs spend at once: the transaction serialises them; at most `floor(balance / cost)` succeed.
- A Remote Config cost change mid-session: the chip may show the old cost for up to an hour (client fetch interval); the server charges the new one and the response's `cost` is shown in the success state. Accepted for the hackathon (D-13-4).
- A day boundary during a session: limits, refunds and usage counters are per UTC day/hour, keyed by the server's clock.
- A judge whose `judgeCredits` is lowered below their balance: no change (grants never take credits away).
- Deleting a project never refunds credits.
- A judge refill that is triggered by a refused export spend happens inside `startExport`'s transaction, so the render and its refill entry commit together.
- The kill switch turns on while an export is running: the running render finishes (it was already paid); only new spends are refused.

## Testing approach

- **Unit:** `costOf`, `decideSpend`, `decideRefund`, `planReturning`, `aggregateUsage`, reporter batching (fake timers, fake fetch, token reuse on hidden flush), schemas (including the `units` rule), `ServerCredits` mapping (fake fetch).
- **Property (fast-check):** the credits property required by testing.md, both pure (model) and on the emulator, including the cross-writer property C9; usage aggregation; judge top-up.
- **Emulator:** concurrent spends, idempotency, key-used after refund, refund once, rate limit, judge refill on refusal, usage cap and counters (pattern of `bootstrap.emulator.test.ts` and `plan-allowance.emulator.test.ts`). The cross-writer test imports spec 08's `startExport` and `failRender` from `@motionpop/render/store`.
- **Rules:** settings validation, `photoURL` and `lastSeenAt`, the server-only paths and the Settings read queries (`apps/web/rules/firestore.rules.test.ts`).
- **E2E (Playwright `auth` project on the emulators):** `apps/web/e2e/credits.spec.ts` (task 17), with the config edits that task lists.
- **Design check:** Settings page, the editor panel, the modal (task 18).

## Correctness properties

- **C1 Never negative.** For any interleaving of spends and refunds (random actions, units, keys, concurrency 1–8) on one user, every committed `balanceAfter ≥ 0` and the final balance equals the starting grant plus the sum of committed deltas. Pure model with `decide*`, and on the emulator with real transactions.
- **C2 Exactly-enough succeed.** N concurrent spends of cost c from balance b: exactly `min(N, floor(b / c))` succeed (emulator).
- **C3 Idempotent spend.** Repeating a request with the same key any number of times, concurrently or not, charges once and every answer carries the same `txId` and `balanceAfter`. **After a refund, the same key never yields `ok: true`** (it answers `key-used`), in the pure model and on the emulator.
- **C4 Refund once.** Any number of refund requests for one spend add its cost back at most once; refunds of grants, refunds, `export-*` entries or other users' entries are refused on the client route.
- **C5 Rate limit.** In any sequence, at most `rateLimitCloudPerHour` AI spends commit per user per UTC hour; export spends are not counted.
- **C6 Judge top-up.** For any sequence of sign-ins and spends over random days, a judge's balance after either is ≥ its balance before the grant; refills (from sign-in or from a refused spend) happen at most once per UTC day and never raise the balance above `judgeCredits`; a free account is never granted judge credits unless verified and listed; a judge's spend of cost ≤ `judgeCredits` is never refused as `insufficient` on a day without a refill.
- **C7 Usage aggregation.** For random day docs: device + cloud per day equals the counters; `creditsSaved` equals the sum of `saved`; days outside the 14 are ignored; missing days read as zero; the median is within one histogram bucket of the median of the raw latencies; the result doesn't depend on input order.
- **C8 Cost consistency.** The task definitions' cloud costs and spec 08's export cost line equal `costOf` for the same action and units; a spend request with `units > 1` on a fixed-price action is rejected.
- **C9 One ledger across all writers (cross-spec).** For any random interleaving, over several users, of AI spends, client refunds, `startExport`, `failRender` and `sweepIfStalled` (spec 08's functions, imported), every user's balance is ≥ 0 at every observed point, the balance equals the grant total plus the sum of ledger deltas, and every spend entry has at most one refund entry (paired by `s-`/`r-` and `export-`/`refund-` ids) whose amount equals the spend's cost. Run as a pure model (the decisions only) and on the emulator.

## Decisions (made headlessly, 2026-11-16; to log in `docs/decisions.md` on merge as D-050 to D-064, task 20)

- **D-13-1 / D-050 Reserve, then refund.** Cloud AI runs in the browser, so the server charges before the call (`spend`) and gives the credits back on failure (`refund`). Charging after a success would let a closed tab skip payment and makes the "cost before the action" rule hard to show. The limit: a tab closed between the spend and the result keeps the charge, and the ledger shows no refund. The refund cap is 30 a day (the hourly cap), and a refused or failed refund shows a toast.
- **D-13-2 / D-051 Credits are a guard, not a security boundary, for browser AI calls** (Trust model). App Check, rate limits, budgets and the kill switch are the caps. Usage events are self-reported too.
- **D-13-3 / D-052 The ledger is append-only,** with deterministic ids (`s-`, `r-`, `export-`, `refund-`, `judge-…`) for idempotency instead of status fields.
- **D-13-4 / D-053 Costs live in one function and one defaults table in `packages/schemas/src/cost.ts`,** with a Remote Config JSON override for AI entries; export prices come from spec 08's `exportCost`. The server's table is the truth; the client's copy may lag by one fetch interval.
- **D-13-5 / D-054 Hourly limit in fixed UTC hours** (`aiByHour`), not a rolling window: one doc per day, no extra reads. It can allow up to 2× across an hour boundary; acceptable.
- **D-13-6 / D-055 Settings opens from the account menu, not a ninth rail icon.** `handoff.md` §10 lists "Settings from the account menu" and the design has eight rail items. The editor shows it as a left panel; the rest of the app has `/settings`.
- **D-13-7 / D-056 Judge top-up on sign-in and on a refused spend** (below 20 % at sign-in, or when a spend would be refused; once per UTC day, one shared ledger id) keeps judge access funded through Jan 29, 2027 without the founder topping up by hand and without a scheduler.
- **D-13-8 / D-057 Usage events go through a server route with a daily cap** (D-027's open item); the client buffers. Usage `credits` is informational; money is read from the ledger.
- **D-13-9 / D-058 No automatic global budget counter for Nov 30.** The kill switch stays manual in Remote Config with GCP budget alerts. **The kill switch blocks every cloud spend, exports included** (cost safety first; Claude Code's decision). The earlier draft let exports run while it was on; that is reversed.
- **D-13-10 / D-059 Rules validate the `settings` map, `displayName` and `photoURL`, and `lastSeenAt` is server-only,** so a client can't store a value that breaks the server's parse.
- **D-13-11 / D-060 One server spend helper for every credited action** (`store/ledger.ts`). Spec 08 owns the pattern and the export ids; this spec generalises it. There is no `ServerSpend`, no `s-export-…` id and no second cost table. (Replaces the first draft's design.)
- **D-13-12 / D-061 A refunded spend key answers `key-used`,** never `ok: true`. The client takes a new key per attempt anyway (spec 09).
- **D-13-13 / D-062 Usage counters per UTC day live in `limits/{day}`;** Settings reads those 14 docs, not the event documents. Medians are histogram-exact to the bucket.
- **D-13-14 / D-063 `units` is accepted only for `slots-detect`, `tts` and `transcribe`;** other actions are fixed-price and reject `units > 1`.
- **D-13-15 / D-064 The cloud route stays disabled until `ServerCredits` exists** (R5.5), and a cross-writer property (C9) guards the ledger for all writers.

## Steering updates to make on merge (IDE task 20 lists the exact edits)

- `data-model.md`: ledger id scheme; `CreditReason` adds `edit`, `image`; `limits/{day}` fields `aiByHour`, `refunds`, `usageEvents`, `usage`; `UsageEvent` adds `cloudCost`, `attempts`, `problems`, `clientAt`, `schemaVersion`; the rules sketch adds `validSettings`, the `photoURL` type and `lastSeenAt` server-only; a note on `UserDoc.settings` (exact keys).
- `security-and-cost.md`: the trust model paragraph (D-051); the kill switch stays manual and blocks every cloud spend including exports (D-058).
- `ai-tasks.md` cost table: points to `packages/schemas/src/cost.ts` as the single source.
- `screens.md` Settings and Out of credits: the copy chosen here ("Make it yours.", the section names, "0 available · Generate costs 3", the rate-limit toast, "Cloud AI is coming soon", the refund toast).
- `hackathon-compliance.md` judge line: "judge plan with generous credits, topped up on sign-in and on a refused spend".
- `handoff.md` §10: Settings opens from the account menu as a left panel (D-055).

# Spec 44 — Credit Buying System & Dodo Payments Integration (Design)

## Architecture Overview

```
Browser (/pricing, OutOfCreditsModal, Settings › Credits)
   │
   ├─ GET /api/billing/packs (public catalog + configured flag + mode)
   ├─ POST /api/billing/checkout (Firebase ID token + App Check)
   │     └─► verifyRequest ─► allowlist(packId → DODO_PRODUCT_*_ID)
   │     └─► bootstrapUser if needed ─► DodoPayments.checkoutSessions.create(...)
   │     └─► returns { checkoutUrl, sessionId, environment }
   │
   ├─ Redirect → Dodo Payments Hosted Checkout → return_url (/pricing?checkout=return&payment_id=...)
   │     └─► Browser watches Firestore live credits + polls read-only GET /api/billing/status
   │
   └─ Dodo Payments Server ──(signed Standard Webhooks POST)──► POST /api/webhooks/dodopayments
         ├─► await req.text() (exact raw bytes)
         ├─► client.webhooks.unwrap(raw, { headers })  [401 on bad signature]
         └─► Single Firestore Transaction (@motionpop/render/store):
               1. Read billing_webhooks/{webhookId}, users/{uid}, users/{uid}/credits/{txId}
               2. Pure decision (billing-logic.ts)
               3. Claim billing_webhooks/{webhookId} + create ledger doc + update users/{uid}
```

## Pack Catalog (`packages/schemas/src/billing.ts`)

| `id` | Name | Credits | Price (USD) | Plan Upgrade | Server Env Var |
|---|---|---|---|---|---|
| `starter` | Starter Pack | `60` | `$5` (`500` cents) | `creator` (if `free`) | `DODO_PRODUCT_STARTER_ID` |
| `creator` | Creator Pack *(Most popular)* | `200` | `$15` (`1500` cents) | `creator` (if `free`) | `DODO_PRODUCT_CREATOR_ID` |
| `studio` | Studio Pack | `600` | `$39` (`3900` cents) | `pro` (if `free` or `creator`) | `DODO_PRODUCT_STUDIO_ID` |

## Security & Financial Invariants

1. **No client-supplied product IDs or prices:** `CheckoutRequestSchema` accepts only `{ packId: 'starter' | 'creator' | 'studio', quantity: 1..10 }`.
2. **No credits from `return_url`:** `GET /api/billing/status` is strictly read-only; only verified webhooks mutate the ledger.
3. **Raw-body Standard Webhooks verification:** `client.webhooks.unwrap(rawBody, { headers })` verifies HMAC-SHA256 + timestamp via the official `dodopayments` SDK (`2.63.1`). Never hand-rolled HMAC, never `unsafeUnwrap()`.
4. **Server-authoritative credit computation on webhook:** On `payment.succeeded`, credits are summed from `payment.product_cart` matched against the server's `DODO_PRODUCT_*_ID` allowlist (`pack.credits * item.quantity`). Client/metadata credit numbers are never trusted. If `product_cart` is omitted on the event, the server fetches `client.payments.retrieve(payment_id)`.
5. **Double idempotency:** Both `billing_webhooks/{webhookId}` AND deterministic credit ledger doc IDs (`purchase-{paymentId}`, `reversal-refund-{refundId}`, `reversal-dispute-{disputeId}`, `restore-dispute-{disputeId}`) prevent double-crediting or double-revoking even across distinct webhook deliveries for the same payment.
6. **Non-negative balance invariant:** Revocations clamp `nextBalance = Math.max(0, currentBalance - creditsToRevoke)` and record `delta = -(currentBalance - nextBalance)` so `balanceAfter >= 0` always holds.
7. **Safe test-mode default:** `environment` is `'live_mode'` ONLY when `process.env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode'`; anything else selects `'test_mode'`.
8. **Plan monotonicity:** Purchasing upgrades `free → creator` (or `pro` for Studio) and never downgrades `pro` or `judge`.

## Data Model Changes

- `packages/schemas/src/config.ts`: `APP_CONFIG_DEFAULTS.freeCredits = 15`.
- `packages/schemas/src/user.ts`:
  - `UserDocSchema`: add optional `dodoCustomerId: z.string().max(128).optional()`.
  - `CreditReasonSchema`: add `'purchase'`, `'purchase-reversal'`, `'purchase-restore'`.
- `packages/schemas/src/billing.ts`: pack catalog, checkout & status schemas, ledger ID helpers (`purchaseTxId`, `refundReversalTxId`, `disputeReversalTxId`, `disputeRestoreTxId`).
- `firestore.rules`: explicit deny rule on `billing_webhooks/{id}` (matching catch-all); `users/{uid}` update rule already restricts client edits strictly to `['displayName', 'photoURL', 'settings']`.
- `services/render/src/store/billing-logic.ts`: pure `decidePurchaseGrant`, `decidePurchaseReversal`, `decideDisputeRestore`, `upgradePlanForPurchase`.
- `services/render/src/store/billing.ts`: atomic Firestore transactions `grantPurchasedCredits`, `revokePurchasedCredits`, `restoreDisputedCredits`, plus `findPurchaseByPaymentId` helper via `billing_payments/{paymentId}` lookup index (server-only, maps `paymentId → { uid, credits, packIds }`) so `refund.succeeded` and `dispute.*` webhooks (which don't carry `app_user_id` metadata) reliably locate the exact user and granted credit count!

> **Critical Insight on Refund & Dispute Lookup (`billing_payments/{paymentId}`):**
> Dodo's `dispute.opened` / `dispute.won` webhook payloads contain `payment_id` and `dispute_id` but NO `customer` or payment `metadata`. Writing a server-only index doc `billing_payments/{paymentId}` (`{ uid, credits, items, packIds, dodoCustomerId, createdAt }`) inside the same `payment.succeeded` transaction lets `refund.succeeded`, `dispute.opened`, `dispute.won`, and `dispute.cancelled` resolve `{ uid, credits, items }` atomically with zero extra Dodo lookups required (except `retrieveLineItems` for partial refunds)!

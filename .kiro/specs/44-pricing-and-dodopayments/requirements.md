# Spec 44 — Credit Buying System & Dodo Payments Integration (Requirements)

## Context

Motionpop uses a server-authoritative Firestore credit ledger (`users/{uid}` + `users/{uid}/credits/{txId}`) for cloud AI operations while keeping on-device Chrome Gemini Nano edits and 1080p/alpha-WebM exports free. Default accounts now start with **15 welcome credits** (instead of 20), judge accounts continue to receive generous credits with daily auto-refills via `JUDGE_EMAILS`, and creators can purchase one-time credit packs safely through **Dodo Payments** (Merchant of Record).

## Requirements (EARS)

### R1 — Default Welcome Credits (15)
- **R1.1:** When a non-judge user signs in for the first time and `free_credits` is not overridden in Remote Config, the server SHALL grant `15` credits (`APP_CONFIG_DEFAULTS.freeCredits = 15`) and write a `signup` ledger entry.
- **R1.2:** When a verified email matches `JUDGE_EMAILS`, the server SHALL continue granting `judgeCredits` (`500` default, tunable via Remote Config) and daily top-ups below 20%.
- **R1.3:** Where marketing copy, Settings, or Pricing displays welcome credits, the UI SHALL derive the number from `AppConfig.freeCredits` / `APP_CONFIG_DEFAULTS.freeCredits` so copy never drifts.

### R2 — Credit Pack Catalog & Public `/pricing` Page
- **R2.1:** The shared schema package (`@motionpop/schemas`) SHALL define the authoritative credit pack catalog (`starter`: 60 credits / $5, `creator`: 200 credits / $15, `studio`: 600 credits / $39), Zod request/response schemas, and deterministic ledger ID helpers (`purchase-{paymentId}`, `reversal-{id}`, `restore-{id}`).
- **R2.2:** The web app SHALL serve a public `/pricing` page styled in the Paper design system showing:
  - The Free tier (15 welcome credits, unlimited on-device Chrome Gemini Nano edits, free 1080p MP4 & transparent WebM exports, optional BYOK Gemini key).
  - The three one-time credit packs with clear credit counts, USD prices, approximate video output, and a **Buy credits** button.
  - The live cloud action credit-cost table derived from `costOf(...)`.
  - When signed in, the user's live credit balance and current plan.
- **R2.3:** When a signed-out visitor clicks **Buy credits**, the UI SHALL redirect them to `/sign-in?next=/pricing`.
- **R2.4:** When a user returns to `/pricing?checkout=return&payment_id=...`, the UI SHALL display a confirmation banner and poll read-only `GET /api/billing/status?payment_id=...` alongside live Firestore balance updates—and SHALL NEVER grant credits based on URL query parameters.
- **R2.5:** While Dodo Payments is in `test_mode`, the `/pricing` page SHALL show an honest test-mode indicator; if Dodo product IDs or keys are not yet configured on the server, the UI SHALL disable checkout gracefully with a clear status note rather than throwing.

### R3 — Authenticated Checkout Session Route (`POST /api/billing/checkout`)
- **R3.1:** Every request to `POST /api/billing/checkout` SHALL verify the caller's Firebase ID token and App Check token via `verifyRequest(req)`.
- **R3.2:** The route SHALL validate `{ packId, quantity }` with `CheckoutRequestSchema` (`quantity` integer 1..10) and SHALL NEVER accept a raw `product_id` or price from the browser.
- **R3.3:** The server SHALL map `packId` to an allowlisted Dodo product ID from server environment variables (`DODO_PRODUCT_STARTER_ID`, `DODO_PRODUCT_CREATOR_ID`, `DODO_PRODUCT_STUDIO_ID`). If Dodo API credentials or the pack's product ID are missing, the route SHALL respond `503`.
- **R3.4:** The Dodo client SHALL default `environment` to `'test_mode'` unless `DODO_PAYMENTS_ENVIRONMENT === 'live_mode'`.
- **R3.5:** Before creating the session, the route SHALL ensure the caller's `users/{uid}` document exists (bootstrapping if needed), attach `dodoCustomerId` when already stored (otherwise `{ email, name }`), and set `metadata: { app_user_id: caller.uid, pack_id: packId }`.
- **R3.6:** The route SHALL return only `{ checkoutUrl, sessionId, environment }` and SHALL NEVER expose Dodo API keys or internal errors to the client.

### R4 — Verified, Atomic, Idempotent Webhook Handler (`POST /api/webhooks/dodopayments`)
- **R4.1:** The webhook route SHALL read the exact raw request bytes via `await req.text()` and verify the Standard Webhooks signature and timestamp (`webhook-id`, `webhook-signature`, `webhook-timestamp`) using `client.webhooks.unwrap(...)` with `DODO_PAYMENTS_WEBHOOK_KEY`. Invalid or missing signatures SHALL return `401`.
- **R4.2:** Every state mutation triggered by a webhook SHALL claim `billing_webhooks/{webhookId}` and write ledger + user updates inside the **same Firestore transaction**, ensuring retries, duplicates, and out-of-order deliveries never double-credit or lose work.
- **R4.3:** On `payment.succeeded`, the server SHALL resolve credits strictly from the payment's verified `product_cart` items matched against the server product-ID allowlist (fetching `client.payments.retrieve(payment_id)` if `product_cart` is absent), verify `metadata.app_user_id`, write `users/{uid}/credits/purchase-{paymentId}` (`reason: 'purchase'`), increment `users/{uid}.credits`, persist `dodoCustomerId`, and upgrade `plan` (`free` → `creator`, or `pro` for `studio`) without ever downgrading `pro` or `judge`.
- **R4.4:** On `refund.succeeded`, the server SHALL revoke the refunded credits inside an atomic transaction (`reversal-refund-{refundId}`, `reason: 'purchase-reversal'`), clamping `users/{uid}.credits` at `0` so balances never go negative. For partial refunds, only items with `refundable_amount === 0` via `payments.retrieveLineItems` are revoked.
- **R4.5:** On `dispute.opened`, the server SHALL revoke the disputed payment's unspent credits (`reversal-dispute-{disputeId}`, clamped at `0`); on `dispute.won` or `dispute.cancelled`, the server SHALL restore the previously revoked amount (`restore-dispute-{disputeId}`, `reason: 'purchase-restore'`).
- **R4.6:** The route SHALL return `200` only after Firestore commit and `500` on transient DB failures so Dodo retries safely.

### R5 — Ledger Invariants, Security Rules & Property Tests
- **R5.1:** `firestore.rules` SHALL explicitly deny all client reads/writes to `billing_webhooks/{id}` and continue blocking client writes to `users/{uid}.credits`, `users/{uid}.plan`, `users/{uid}.dodoCustomerId`, and `users/{uid}/credits/{tx}`.
- **R5.2:** Client AI refund (`POST /api/credits/refund`) SHALL refuse `purchase`, `purchase-reversal`, and `purchase-restore` ledger entries.
- **R5.3:** Unit and `fast-check` property-based tests SHALL prove idempotency (replays never double-grant or double-revoke), non-negative balance across arbitrary interleaved operations, and preservation of `judge` / `pro` plans.

### R6 — In-App Navigation & Purchase Entry Points
- **R6.1:** `AppBar`, `Landing` (`#pricing`), `Settings → Credits`, and `OutOfCreditsModal` SHALL link cleanly to `/pricing`.
- **R6.2:** `REASON_TEXT` and `planLine` SHALL render human-readable labels for `purchase`, `purchase-reversal`, `purchase-restore`, `creator`, and `pro`.

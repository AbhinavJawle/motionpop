# Spec 44 — Credit Buying System & Dodo Payments Integration (Tasks)

- [x] Task 1: Update `APP_CONFIG_DEFAULTS.freeCredits` to `15`, extend `UserDocSchema` (`dodoCustomerId`) and `CreditReasonSchema` (`purchase`, `purchase-reversal`, `purchase-restore`), and add `packages/schemas/src/billing.ts` with tests.
- [x] Task 2: Add pure billing ledger decisions (`billing-logic.ts`), atomic Firestore transactions (`billing.ts`), and `NOT_SPENDS` guard in `@motionpop/render/store`, plus unit & `fast-check` property tests.
- [x] Task 3: Document server-only `billing_webhooks` and `billing_payments` rules in `firestore.rules`.
- [x] Task 4: Implement server Dodo Payments helper (`apps/web/lib/billing/dodo.server.ts`) and API routes (`GET /api/billing/packs`, `POST /api/billing/checkout`, `GET /api/billing/status`, `POST /api/webhooks/dodopayments`) with comprehensive route & webhook tests.
- [x] Task 5: Build `/pricing` page (`apps/web/app/pricing/page.tsx` + `apps/web/components/pricing/pricing-page.tsx`) with live checkout flow, return-URL confirmation polling, credit-cost table, and component tests.
- [x] Task 6: Wire purchase CTAs & ledger labels across `AppBar`, `Settings → Credits`, `OutOfCreditsModal`, `ledger-text.ts`, and `Landing` (`#pricing`).
- [x] Task 7: Update `.env.example`, `apps/web/apphosting.yaml` comments/deploy documentation, `README.md`, and `DEV_LOG.md`; verify full `pnpm typecheck && pnpm lint && pnpm test`.

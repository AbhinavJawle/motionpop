import 'server-only';
import DodoPayments from 'dodopayments';
import type { UnwrapWebhookEvent } from 'dodopayments/resources/webhooks';
import {
  CREDIT_PACKS,
  DodoResourceIdSchema,
  getCreditPack,
  sha256Hex,
  type BillingEnvironment,
  type CreditPackId,
} from '@motionpop/schemas';
import {
  grantPurchasedCredits,
  readAlreadyRevokedCredits,
  readBillingPayment,
  restoreDisputedCredits,
  revokePurchasedCredits,
  type PurchasedLineItem,
} from '@motionpop/render/store';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * Server-only Dodo Payments client, allowlist mapping, and verified webhook router (spec 44).
 *
 * Safety invariants:
 * - `environment` defaults to `'test_mode'` unless `DODO_PAYMENTS_ENVIRONMENT === 'live_mode'`.
 * - API keys and webhook secrets never leave server code.
 * - Product IDs and credit counts are always mapped server-side from `CREDIT_PACKS` + env vars.
 * - Credits are granted ONLY inside verified webhook handlers, never from `return_url` query params.
 */

export interface BillingConfig {
  environment: BillingEnvironment;
  apiKey: string | null;
  webhookKey: string | null;
  returnUrl: string | null;
  productIds: Record<CreditPackId, string | null>;
}

function cleanEnv(raw: string | undefined): string | null {
  const v = raw?.trim();
  return v && v.length > 0 ? v : null;
}

export function readBillingConfig(
  env: Record<string, string | undefined> = process.env,
): BillingConfig {
  const environment: BillingEnvironment =
    env.DODO_PAYMENTS_ENVIRONMENT === 'live_mode' ? 'live_mode' : 'test_mode';
  return {
    environment,
    apiKey: cleanEnv(env.DODO_PAYMENTS_API_KEY),
    webhookKey: cleanEnv(env.DODO_PAYMENTS_WEBHOOK_KEY),
    returnUrl: cleanEnv(env.DODO_PAYMENTS_RETURN_URL),
    productIds: {
      starter: cleanEnv(env.DODO_PRODUCT_STARTER_ID),
      creator: cleanEnv(env.DODO_PRODUCT_CREATOR_ID),
      studio: cleanEnv(env.DODO_PRODUCT_STUDIO_ID),
    },
  };
}

/** Rejects obvious key/mode mismatches (`dodo_test_` in live mode or `dodo_live_` in test mode). */
export function isKeyCompatibleWithEnvironment(
  apiKey: string | null,
  environment: BillingEnvironment,
): boolean {
  if (!apiKey) return false;
  if (environment === 'live_mode' && apiKey.startsWith('dodo_test_')) return false;
  if (environment === 'test_mode' && apiKey.startsWith('dodo_live_')) return false;
  return true;
}

export function isPackConfigured(cfg: BillingConfig, packId: CreditPackId): boolean {
  return (
    isKeyCompatibleWithEnvironment(cfg.apiKey, cfg.environment) && cfg.productIds[packId] !== null
  );
}

export function createDodoClient(cfg: BillingConfig): DodoPayments {
  if (!cfg.apiKey) throw new Error('DODO_PAYMENTS_API_KEY is not configured');
  if (!isKeyCompatibleWithEnvironment(cfg.apiKey, cfg.environment)) {
    throw new Error(`DODO_PAYMENTS_API_KEY does not match ${cfg.environment}`);
  }
  return new DodoPayments({
    bearerToken: cfg.apiKey,
    ...(cfg.webhookKey ? { webhookKey: cfg.webhookKey } : {}),
    environment: cfg.environment,
  });
}

/** Strict hostname pattern (host or host:port) to block header-injection in x-forwarded-host. */
const SAFE_HOST_RE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i;

/**
 * Safe return URL for Dodo checkout: uses configured `DODO_PAYMENTS_RETURN_URL`, else
 * `NEXT_PUBLIC_APP_URL`, else validated reverse-proxy `x-forwarded-host` (Firebase App Hosting /
 * Cloud Run), else the request origin. Never appends pre-existing query params so Dodo can append
 * `?payment_id=...&status=...` cleanly, and never trusts client-supplied return URLs.
 */
export function resolveReturnUrl(
  cfg: BillingConfig,
  req: Request,
  env: Record<string, string | undefined> = process.env,
): string {
  if (cfg.returnUrl) return cfg.returnUrl;
  const appUrl = cleanEnv(env.NEXT_PUBLIC_APP_URL);
  if (appUrl) {
    return `${appUrl.replace(/\/+$/, '')}/pricing`;
  }
  const fwdHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? '';
  const fwdProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase() ?? '';
  if (fwdHost && SAFE_HOST_RE.test(fwdHost)) {
    const proto = fwdProto === 'http' || fwdProto === 'https' ? fwdProto : 'https';
    return `${proto}://${fwdHost}/pricing`;
  }
  const url = new URL(req.url);
  return `${url.origin}/pricing`;
}

/** Deterministic safe Firestore doc ID for any Standard Webhooks `webhook-id` header. */
export function safeWebhookDocId(webhookId: string): string {
  if (DodoResourceIdSchema.safeParse(webhookId).success) return webhookId;
  return `wh_${sha256Hex(webhookId).slice(0, 40)}`;
}

export interface ResolvedCartCredits {
  totalCredits: number;
  targetPlan: 'creator' | 'pro';
  items: PurchasedLineItem[];
}

/**
 * Resolves purchased Dodo `product_cart` entries strictly against the server allowlist.
 * Returns null if no allowlisted Motionpop credit pack matches.
 */
export function resolvePurchasedCart(
  cart: ReadonlyArray<{ product_id: string; quantity: number }> | null | undefined,
  cfg: BillingConfig,
): ResolvedCartCredits | null {
  if (!cart || cart.length === 0) return null;
  const productToPack = new Map<string, CreditPackId>();
  for (const pack of CREDIT_PACKS) {
    const pid = cfg.productIds[pack.id];
    if (pid) productToPack.set(pid, pack.id);
  }
  const items: PurchasedLineItem[] = [];
  let totalCredits = 0;
  let targetPlan: 'creator' | 'pro' = 'creator';

  for (const entry of cart) {
    const packId = productToPack.get(entry.product_id);
    if (!packId) continue;
    const qty = entry.quantity;
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) continue;
    const pack = getCreditPack(packId);
    const credits = pack.credits * qty;
    totalCredits += credits;
    if (pack.planGrant === 'pro') targetPlan = 'pro';
    items.push({
      productId: entry.product_id,
      packId,
      quantity: qty,
      credits,
    });
  }
  if (items.length === 0 || totalCredits <= 0) return null;
  return { totalCredits, targetPlan, items };
}

export interface WebhookDeps {
  db: Firestore;
  cfg: BillingConfig;
  retrievePayment: (paymentId: string) => Promise<{
    payment_id: string;
    status?: string | null;
    refund_status?: string | null;
    metadata?: Record<string, unknown> | null;
    product_cart?: Array<{ product_id: string; quantity: number }> | null;
    customer?: { customer_id?: string | null } | null;
  }>;
  retrieveLineItems: (paymentId: string) => Promise<{
    items: Array<{ items_id: string; amount: number; refundable_amount: number }>;
  }>;
  grant?: typeof grantPurchasedCredits;
  revoke?: typeof revokePurchasedCredits;
  restore?: typeof restoreDisputedCredits;
  readPayment?: typeof readBillingPayment;
  readAlreadyRevoked?: typeof readAlreadyRevokedCredits;
}

export interface WebhookOutcome {
  handled: boolean;
  action: 'granted' | 'replayed' | 'revoked' | 'restored' | 'ignored';
  detail?: string;
}

/**
 * Thrown when a refund or dispute webhook arrives BEFORE `payment.succeeded` (out-of-order
 * delivery) for a genuine Motionpop credit pack payment so the route returns 500 and Dodo retries.
 */
export class OutOfOrderWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OutOfOrderWebhookError';
  }
}

/**
 * Processes a cryptographically verified Dodo Payments webhook event atomically.
 * Throws on transient Firestore errors or out-of-order credit-pack reversals so the route
 * returns 500 and Dodo retries cleanly.
 */
export async function handleDodoWebhookEvent(
  deps: WebhookDeps,
  event: UnwrapWebhookEvent,
  webhookId: string,
): Promise<WebhookOutcome> {
  const safeWebhookId = safeWebhookDocId(webhookId);
  const grantFn = deps.grant ?? grantPurchasedCredits;
  const revokeFn = deps.revoke ?? revokePurchasedCredits;
  const restoreFn = deps.restore ?? restoreDisputedCredits;
  const readPayFn = deps.readPayment ?? readBillingPayment;
  const readRevokedFn = deps.readAlreadyRevoked ?? readAlreadyRevokedCredits;

  switch (event.type) {
    case 'payment.succeeded': {
      const payment = event.data;
      const paymentId = payment.payment_id;
      if (payment.status && payment.status !== 'succeeded') {
        return { handled: true, action: 'ignored', detail: `status-${payment.status}` };
      }
      if (payment.refund_status === 'full') {
        return { handled: true, action: 'ignored', detail: 'already-fully-refunded' };
      }

      let metadata: Record<string, unknown> | null | undefined = payment.metadata;
      let cart = payment.product_cart;
      let dodoCustomerId = payment.customer?.customer_id || undefined;

      // Fall back to a live server-side payment read if product_cart or metadata is missing.
      const metaUid = (m: Record<string, unknown> | null | undefined): string =>
        typeof m?.app_user_id === 'string' ? m.app_user_id.trim() : '';

      if (!cart?.length || !metaUid(metadata)) {
        const full = await deps.retrievePayment(paymentId);
        if (full.status && full.status !== 'succeeded') {
          return { handled: true, action: 'ignored', detail: `status-${full.status}` };
        }
        if (full.refund_status === 'full') {
          return { handled: true, action: 'ignored', detail: 'already-fully-refunded' };
        }
        cart = full.product_cart ?? cart;
        metadata = full.metadata ?? metadata;
        dodoCustomerId = full.customer?.customer_id || dodoCustomerId;
      }

      const uid = metaUid(metadata);
      if (!uid) {
        console.warn('[billing] payment.succeeded missing metadata.app_user_id', { paymentId });
        return { handled: false, action: 'ignored', detail: 'missing-app-user-id' };
      }

      const resolved = resolvePurchasedCart(cart, deps.cfg);
      if (!resolved) {
        console.warn('[billing] payment.succeeded has no allowlisted credit pack', { paymentId });
        return { handled: false, action: 'ignored', detail: 'no-matching-pack' };
      }

      const res = await grantFn(deps.db, {
        webhookId: safeWebhookId,
        eventType: event.type,
        uid,
        paymentId,
        credits: resolved.totalCredits,
        targetPlan: resolved.targetPlan,
        items: resolved.items,
        ...(dodoCustomerId ? { dodoCustomerId } : {}),
        environment: deps.cfg.environment,
      });

      return {
        handled: true,
        action: res.applied ? 'granted' : 'replayed',
        detail: `${resolved.totalCredits} credits`,
      };
    }

    case 'refund.succeeded': {
      const refund = event.data;
      let creditsToRevoke: number | undefined;
      if (refund.is_partial) {
        const stored = await readPayFn(deps.db, refund.payment_id);
        if (!stored) {
          const full = await deps.retrievePayment(refund.payment_id);
          if (resolvePurchasedCart(full.product_cart, deps.cfg)) {
            throw new OutOfOrderWebhookError(
              `Partial refund arrived before payment.succeeded for ${refund.payment_id}`,
            );
          }
          return { handled: false, action: 'ignored', detail: 'unknown-payment' };
        }
        const { items } = await deps.retrieveLineItems(refund.payment_id);
        const lineById = new Map(items.map((it) => [it.items_id, it]));
        let targetTotalRevoked = 0;
        for (const purchased of stored.items) {
          const line = lineById.get(purchased.productId);
          if (!line || line.amount <= 0) continue;
          const refundedAmount = Math.max(0, line.amount - line.refundable_amount);
          const ratio = Math.min(1, refundedAmount / line.amount);
          targetTotalRevoked += Math.round(purchased.credits * ratio);
        }
        const alreadyRevoked = await readRevokedFn(deps.db, stored.uid, refund.payment_id);
        const deltaToRevoke = Math.max(0, targetTotalRevoked - alreadyRevoked);
        if (deltaToRevoke <= 0) {
          return { handled: true, action: 'ignored', detail: 'partial-refund-already-covered' };
        }
        creditsToRevoke = deltaToRevoke;
      }

      const res = await revokeFn(deps.db, {
        webhookId: safeWebhookId,
        eventType: event.type,
        paymentId: refund.payment_id,
        kind: 'refund',
        sourceId: refund.refund_id,
        ...(creditsToRevoke !== undefined ? { creditsToRevoke } : {}),
      });
      if (!res.applied && res.reason === 'no-purchase') {
        const full = await deps.retrievePayment(refund.payment_id);
        if (resolvePurchasedCart(full.product_cart, deps.cfg)) {
          throw new OutOfOrderWebhookError(
            `Refund arrived before payment.succeeded for ${refund.payment_id}`,
          );
        }
      }
      return {
        handled: true,
        action: res.applied ? 'revoked' : res.reason === 'replay' ? 'replayed' : 'ignored',
        detail: `${res.revoked} credits`,
      };
    }

    case 'dispute.opened': {
      const dispute = event.data;
      const res = await revokeFn(deps.db, {
        webhookId: safeWebhookId,
        eventType: event.type,
        paymentId: dispute.payment_id,
        kind: 'dispute',
        sourceId: dispute.dispute_id,
      });
      if (!res.applied && res.reason === 'no-purchase') {
        const full = await deps.retrievePayment(dispute.payment_id);
        if (resolvePurchasedCart(full.product_cart, deps.cfg)) {
          throw new OutOfOrderWebhookError(
            `Dispute arrived before payment.succeeded for ${dispute.payment_id}`,
          );
        }
      }
      return {
        handled: true,
        action: res.applied ? 'revoked' : res.reason === 'replay' ? 'replayed' : 'ignored',
        detail: `${res.revoked} credits`,
      };
    }

    case 'dispute.won':
    case 'dispute.cancelled': {
      const dispute = event.data;
      const res = await restoreFn(deps.db, {
        webhookId: safeWebhookId,
        eventType: event.type,
        paymentId: dispute.payment_id,
        disputeId: dispute.dispute_id,
      });
      return {
        handled: true,
        action: res.applied ? 'restored' : 'ignored',
        detail: `${res.restored} credits`,
      };
    }

    case 'payment.failed':
    case 'payment.cancelled':
    case 'payment.processing':
    case 'refund.failed':
    case 'dispute.challenged':
    case 'dispute.accepted':
    case 'dispute.lost':
    case 'dispute.expired': {
      // Acknowledged without mutating credits (revocations stay revoked on lost/accepted/expired).
      return { handled: true, action: 'ignored', detail: event.type };
    }

    default:
      return { handled: false, action: 'ignored', detail: event.type };
  }
}

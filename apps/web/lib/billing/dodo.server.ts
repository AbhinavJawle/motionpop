import 'server-only';
import DodoPayments from 'dodopayments';
import type { UnwrapWebhookEvent } from 'dodopayments/resources/webhooks';
import {
  CREDIT_PACKS,
  DodoResourceIdSchema,
  getCreditPack,
  type BillingEnvironment,
  type CreditPackId,
} from '@motionpop/schemas';
import {
  grantPurchasedCredits,
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

/**
 * Safe return URL for Dodo checkout: uses configured `DODO_PAYMENTS_RETURN_URL`, else
 * `NEXT_PUBLIC_APP_URL`, else the current request origin. Never trusts client-supplied URLs.
 */
export function resolveReturnUrl(
  cfg: BillingConfig,
  req: Request,
  env: Record<string, string | undefined> = process.env,
): string {
  if (cfg.returnUrl) return cfg.returnUrl;
  const appUrl = cleanEnv(env.NEXT_PUBLIC_APP_URL);
  if (appUrl) {
    return `${appUrl.replace(/\/+$/, '')}/pricing?checkout=return`;
  }
  const url = new URL(req.url);
  return `${url.origin}/pricing?checkout=return`;
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
    metadata?: Record<string, unknown> | null;
    product_cart?: Array<{ product_id: string; quantity: number }> | null;
    customer?: { customer_id?: string | null } | null;
  }>;
  retrieveLineItems: (paymentId: string) => Promise<{
    items: Array<{ items_id: string; refundable_amount: number }>;
  }>;
  grant?: typeof grantPurchasedCredits;
  revoke?: typeof revokePurchasedCredits;
  restore?: typeof restoreDisputedCredits;
  readPayment?: typeof readBillingPayment;
}

export interface WebhookOutcome {
  handled: boolean;
  action:
    | 'granted'
    | 'replayed'
    | 'revoked'
    | 'restored'
    | 'ignored';
  detail?: string;
}

/**
 * Processes a cryptographically verified Dodo Payments webhook event atomically.
 * Throws on transient Firestore errors so the route returns 500 and Dodo retries cleanly.
 */
export async function handleDodoWebhookEvent(
  deps: WebhookDeps,
  event: UnwrapWebhookEvent,
  webhookId: string,
): Promise<WebhookOutcome> {
  const safeWebhookId = DodoResourceIdSchema.safeParse(webhookId).success
    ? webhookId
    : `wh_${Date.now()}`;
  const grantFn = deps.grant ?? grantPurchasedCredits;
  const revokeFn = deps.revoke ?? revokePurchasedCredits;
  const restoreFn = deps.restore ?? restoreDisputedCredits;
  const readPayFn = deps.readPayment ?? readBillingPayment;

  switch (event.type) {
    case 'payment.succeeded': {
      const payment = event.data;
      const paymentId = payment.payment_id;
      let metadata: Record<string, unknown> | null | undefined = payment.metadata;
      let cart = payment.product_cart;
      let dodoCustomerId = payment.customer?.customer_id || undefined;

      // Fall back to a live server-side payment read if product_cart or metadata is missing.
      const metaUid = (m: Record<string, unknown> | null | undefined): string =>
        typeof m?.app_user_id === 'string' ? m.app_user_id.trim() : '';

      if (!cart?.length || !metaUid(metadata)) {
        const full = await deps.retrievePayment(paymentId);
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
          return { handled: false, action: 'ignored', detail: 'unknown-payment' };
        }
        const { items } = await deps.retrieveLineItems(refund.payment_id);
        const fullyRefundedIds = new Set(
          items.filter((it) => it.refundable_amount === 0).map((it) => it.items_id),
        );
        const matchedCredits = stored.items
          .filter((it) => fullyRefundedIds.has(it.productId))
          .reduce((sum, it) => sum + it.credits, 0);
        if (matchedCredits <= 0) {
          return { handled: true, action: 'ignored', detail: 'partial-refund-no-full-item' };
        }
        creditsToRevoke = matchedCredits;
      }

      const res = await revokeFn(deps.db, {
        webhookId: safeWebhookId,
        eventType: event.type,
        paymentId: refund.payment_id,
        kind: 'refund',
        sourceId: refund.refund_id,
        ...(creditsToRevoke !== undefined ? { creditsToRevoke } : {}),
      });
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

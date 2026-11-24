import { z } from 'zod';

/**
 * Credit packs and Dodo Payments billing schemas (spec 44).
 *
 * Security invariant: the browser only sends a `packId` slug and integer `quantity`. Product IDs,
 * prices, and credit grant amounts are always resolved server-side from this catalog + env vars.
 */

export const CreditPackIdSchema = z.enum(['starter', 'creator', 'studio']);
export type CreditPackId = z.infer<typeof CreditPackIdSchema>;

export const BillingEnvironmentSchema = z.enum(['test_mode', 'live_mode']);
export type BillingEnvironment = z.infer<typeof BillingEnvironmentSchema>;

export interface CreditPack {
  readonly id: CreditPackId;
  readonly name: string;
  readonly credits: number;
  /** Display price in USD cents (smallest currency unit, matching Dodo Payments). */
  readonly priceCents: number;
  readonly currency: 'USD';
  /** Plan tier granted when purchasing this pack (never downgrades `pro` or `judge`). */
  readonly planGrant: 'creator' | 'pro';
  readonly popular?: boolean;
  readonly tagline: string;
  readonly estimate: string;
  /** Server-only environment variable holding the Dodo Payments `pdt_...` product ID. */
  readonly productIdEnvVar:
    | 'DODO_PRODUCT_STARTER_ID'
    | 'DODO_PRODUCT_CREATOR_ID'
    | 'DODO_PRODUCT_STUDIO_ID';
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  {
    id: 'starter',
    name: 'Starter Pack',
    credits: 60,
    priceCents: 500,
    currency: 'USD',
    planGrant: 'creator',
    tagline: 'Top up for a weekend batch of reels',
    estimate: '~12 directed reels or 3 AI motion films',
    productIdEnvVar: 'DODO_PRODUCT_STARTER_ID',
  },
  {
    id: 'creator',
    name: 'Creator Pack',
    credits: 200,
    priceCents: 1500,
    currency: 'USD',
    planGrant: 'creator',
    popular: true,
    tagline: 'Built for weekly short-form creators',
    estimate: '~40 directed reels or 10 AI motion films',
    productIdEnvVar: 'DODO_PRODUCT_CREATOR_ID',
  },
  {
    id: 'studio',
    name: 'Studio Pack',
    credits: 600,
    priceCents: 3900,
    currency: 'USD',
    planGrant: 'pro',
    tagline: 'High-volume channels and creative teams',
    estimate: '~120 directed reels or 30 AI motion films',
    productIdEnvVar: 'DODO_PRODUCT_STUDIO_ID',
  },
] as const;

export function getCreditPack(id: CreditPackId): CreditPack {
  const pack = CREDIT_PACKS.find((p) => p.id === id);
  if (!pack) throw new RangeError(`Unknown credit pack: ${id}`);
  return pack;
}

export function formatPackPriceUsd(priceCents: number): string {
  const dollars = priceCents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export const CheckoutRequestSchema = z.object({
  packId: CreditPackIdSchema,
  quantity: z.number().int().min(1).max(10).default(1),
});
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export const CheckoutResponseSchema = z.object({
  checkoutUrl: z.string().url(),
  sessionId: z.string().min(1),
  environment: BillingEnvironmentSchema,
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

export const BillingPacksResponseSchema = z.object({
  configured: z.boolean(),
  environment: BillingEnvironmentSchema,
  packs: z.array(
    z.object({
      id: CreditPackIdSchema,
      available: z.boolean(),
    }),
  ),
});
export type BillingPacksResponse = z.infer<typeof BillingPacksResponseSchema>;

/** Safe Firestore document ID component for Dodo resource IDs (`pay_...`, `ref_...`, `dis_...`). */
export const DodoResourceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{3,128}$/);

export const BillingStatusResponseSchema = z.object({
  paymentId: DodoResourceIdSchema,
  status: z.enum(['settled', 'pending', 'reversed']),
  credits: z.number().int().nonnegative().optional(),
  balance: z.number().int().nonnegative().nullable(),
});
export type BillingStatusResponse = z.infer<typeof BillingStatusResponseSchema>;

/** Deterministic ledger entry IDs for Dodo Payments billing transactions. */
export const purchaseTxId = (paymentId: string): string =>
  `purchase-${DodoResourceIdSchema.parse(paymentId)}`;

export const refundReversalTxId = (refundId: string): string =>
  `reversal-refund-${DodoResourceIdSchema.parse(refundId)}`;

export const disputeReversalTxId = (disputeId: string): string =>
  `reversal-dispute-${DodoResourceIdSchema.parse(disputeId)}`;

export const disputeRestoreTxId = (disputeId: string): string =>
  `restore-dispute-${DodoResourceIdSchema.parse(disputeId)}`;

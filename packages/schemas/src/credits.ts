import { z } from 'zod';
import type { CreditReason } from './user';

/**
 * Credited actions and the bodies of the credit routes (spec 13 design, "Schemas"). The server
 * computes every price from these (`costOf`); the client never sends an amount.
 */

export const CreditActionSchema = z.enum([
  'generate',
  'edit',
  'pip-plan',
  'custom',
  /** Film mode (spec 07b): the whole video, priced per started 30 s. */
  'film',
  'slots-detect',
  'tts',
  'transcribe',
  'image',
  'export',
]);
export type CreditAction = z.infer<typeof CreditActionSchema>;

/**
 * Actions a browser may spend on through `/api/credits/spend`. Export is charged inside spec 08's
 * `startExport`, through the same ledger helper, never by a client-sent spend.
 */
export const ClientCreditActionSchema = CreditActionSchema.exclude(['export']);
export type ClientCreditAction = z.infer<typeof ClientCreditActionSchema>;

/**
 * Only these actions are priced per unit (words / 200, minutes, a film's started half minutes).
 * Everything else is one unit.
 */
export const UNIT_ACTIONS = ['slots-detect', 'tts', 'transcribe', 'film'] as const;
export type UnitAction = (typeof UNIT_ACTIONS)[number];
export const isUnitAction = (a: CreditAction): a is UnitAction =>
  (UNIT_ACTIONS as readonly string[]).includes(a);

/** Actions whose per-unit price lives in the defaults table and can be overridden by Remote Config. */
export const PricedActionSchema = CreditActionSchema.exclude(['image', 'export']);
export type PricedAction = z.infer<typeof PricedActionSchema>;

/** Partial overrides of the AI price table (Remote Config `credit_costs`). */
export const CreditCostsSchema = z.partialRecord(PricedActionSchema, z.number().int().positive());
export type CreditCosts = z.infer<typeof CreditCostsSchema>;

/** The idempotency key of one spend attempt: a new random key per attempt. */
export const SpendKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const SpendRequestSchema = z
  .object({
    action: ClientCreditActionSchema,
    units: z.number().int().min(1).max(20).default(1),
    key: SpendKeySchema,
    refId: z.string().max(80).optional(),
  })
  .superRefine((r, ctx) => {
    // Review F9: a fixed-price action has one price, so the charge always equals the chip shown.
    if (r.units > 1 && !isUnitAction(r.action)) {
      ctx.addIssue({
        code: 'custom',
        path: ['units'],
        message: 'units applies to slots-detect, tts, transcribe and film only',
      });
    }
  });
export type SpendRequest = z.infer<typeof SpendRequestSchema>;

export const SpendRefusalReasonSchema = z.enum([
  'insufficient',
  'rate-limit',
  'paused',
  'key-used',
]);
export type SpendRefusalReason = z.infer<typeof SpendRefusalReasonSchema>;

export const SpendResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    txId: z.string(),
    balance: z.number().int().nonnegative(),
    cost: z.number().int().positive(),
  }),
  z.object({
    ok: z.literal(false),
    reason: SpendRefusalReasonSchema,
    balance: z.number().int().nonnegative(),
  }),
]);
export type SpendResponse = z.infer<typeof SpendResponseSchema>;

/** A client may refund only its own AI spends (`s-{key}`), never an `export-*` entry. */
export const RefundRequestSchema = z.object({
  txId: z.string().regex(/^s-[A-Za-z0-9_-]{8,64}$/),
});
export type RefundRequest = z.infer<typeof RefundRequestSchema>;

export const RefundRefusalReasonSchema = z.enum([
  'not-found',
  'not-refundable',
  'too-old',
  'limit',
]);
export type RefundRefusalReason = z.infer<typeof RefundRefusalReasonSchema>;

export const RefundResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    balance: z.number().int().nonnegative(),
    alreadyRefunded: z.boolean(),
  }),
  z.object({ ok: z.literal(false), reason: RefundRefusalReasonSchema }),
]);
export type RefundResponse = z.infer<typeof RefundResponseSchema>;

/** The ledger reason each action is recorded under. */
export const REASON_FOR: Record<CreditAction, CreditReason> = {
  generate: 'generate',
  edit: 'edit',
  'pip-plan': 'pip-plan',
  custom: 'custom',
  film: 'film',
  'slots-detect': 'slots-detect',
  tts: 'tts',
  transcribe: 'transcribe',
  image: 'image',
  export: 'export',
};

/** Ledger ids of AI spends and refunds (spec 08 owns `export-{renderId}` / `refund-{renderId}`). */
export const spendTxId = (key: string): string => `s-${key}`;
export const refundTxId = (key: string): string => `r-${key}`;

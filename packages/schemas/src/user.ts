import { z } from 'zod';
import { FormatSchema } from './format';

/**
 * `users/{uid}` and its credit ledger (data-model.md). `credits` and `plan` are written only by
 * server code inside transactions; clients read them.
 */

export const PlanSchema = z.enum(['free', 'creator', 'pro', 'judge']);
export type Plan = z.infer<typeof PlanSchema>;

/**
 * Firestore timestamps arrive as SDK `Timestamp` objects (client or Admin). Accept anything with
 * `toMillis()` so the same schema parses both, plus `Date` for tests.
 */
export const TimestampLikeSchema = z.union([
  z.date(),
  z.custom<{ toMillis: () => number }>(
    (v) =>
      typeof v === 'object' &&
      v !== null &&
      typeof (v as { toMillis?: unknown }).toMillis === 'function',
    'expected a Firestore Timestamp',
  ),
]);

export const UserSettingsSchema = z.object({
  preferOnDevice: z.boolean(),
  captionsDefault: z.boolean(),
  defaultFormat: FormatSchema,
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  preferOnDevice: true,
  captionsDefault: true,
  defaultFormat: '16:9',
};

export const UserDocSchema = z.object({
  displayName: z.string(),
  email: z.string(),
  photoURL: z.string().optional(),
  credits: z.number().int().nonnegative(),
  plan: PlanSchema,
  settings: UserSettingsSchema,
  schemaVersion: z.literal(1),
  createdAt: TimestampLikeSchema,
  lastSeenAt: TimestampLikeSchema,
});
export type UserDoc = z.infer<typeof UserDocSchema>;

export const CreditReasonSchema = z.enum([
  'signup',
  'judge-grant',
  'generate',
  'pip-plan',
  'slots-detect',
  'tts',
  'transcribe',
  'export',
  'refund',
  'custom',
  'edit',
  'image',
]);
export type CreditReason = z.infer<typeof CreditReasonSchema>;

/** `users/{uid}/credits/{txId}`: one entry per balance change. */
export const CreditTxSchema = z.object({
  delta: z.number().int(),
  reason: CreditReasonSchema,
  refId: z.string().optional(),
  balanceAfter: z.number().int().nonnegative(),
  at: TimestampLikeSchema,
});
export type CreditTx = z.infer<typeof CreditTxSchema>;

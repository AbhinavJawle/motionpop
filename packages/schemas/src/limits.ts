import { z } from 'zod';
import { TimestampLikeSchema } from './user';
import { UsageDayCountersSchema, emptyUsageDay } from './usage';

/**
 * A UTC calendar day, `yyyy-mm-dd`: the doc id of `users/{uid}/limits/{day}`. Rejects
 * well-formed but impossible dates such as `2026-02-30`.
 */
export const DayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected yyyy-mm-dd')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'expected a real calendar day');
export type DayKey = z.infer<typeof DayKeySchema>;

const Count = z.number().int().nonnegative();

/**
 * `users/{uid}/limits/{yyyy-mm-dd}` (spec 07 design, AI flow 2): per-user, per-UTC-day counters
 * for free cloud usage. Server-written only (rules deny every client write); the owner may read.
 * `planCloud` counts the day's free cloud `direct.plan` calls, capped by `planFreeCloudPerDay`;
 * `renders` counts the day's started exports, capped by `rendersPerUserPerDay` (spec 08).
 * Each writer uses `merge` and writes only its own counter, so the other may be missing:
 * both default to 0 (spec 08 review F1).
 *
 * Spec 13 adds `aiByHour` (AI spends per UTC hour), `refunds` (client refunds today),
 * `usageEvents` (reported usage events today) and `usage` (the day's usage counters). Same rule:
 * every key is optional on disk and defaults, whichever writer ran first.
 */
export const DailyLimitsSchema = z.object({
  schemaVersion: z.literal(1),
  planCloud: z.number().int().nonnegative().default(0),
  renders: z.number().int().nonnegative().default(0),
  aiByHour: z.record(z.string().regex(/^([01]\d|2[0-3])$/), Count).default(() => ({})),
  refunds: Count.default(0),
  usageEvents: Count.default(0),
  usage: UsageDayCountersSchema.default(emptyUsageDay),
  updatedAt: TimestampLikeSchema,
});
export type DailyLimits = z.infer<typeof DailyLimitsSchema>;

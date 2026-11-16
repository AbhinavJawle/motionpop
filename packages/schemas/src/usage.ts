import { z } from 'zod';
import { RanOnSchema } from './transcript';
import { TimestampLikeSchema } from './user';

/**
 * Usage events and their per-UTC-day counters (spec 13 design, "Usage"). The browser reports
 * events through `POST /api/usage`; the server stores them under `users/{uid}/usage/{id}` and
 * keeps the day counters in `limits/{day}.usage`, so Settings never reads the event documents.
 */

const Count = z.number().int().nonnegative();

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
export type UsageEventIn = z.infer<typeof UsageEventInSchema>;

export const UsageBatchSchema = z.object({
  events: z.array(UsageEventInSchema).min(1).max(50),
});
export type UsageBatch = z.infer<typeof UsageBatchSchema>;

/** A stored event: the input minus its id (the doc id), plus the server's fields. */
export const UsageEventDocSchema = UsageEventInSchema.omit({ id: true }).extend({
  schemaVersion: z.literal(1),
  at: TimestampLikeSchema,
});
export type UsageEventDoc = z.infer<typeof UsageEventDocSchema>;

/** Upper edges (ms) of the latency histogram; a 12th bucket holds everything slower. */
export const LATENCY_BOUNDS_MS = [
  100, 250, 500, 1000, 2000, 4000, 8000, 15000, 30000, 60000, 120000,
] as const;
export const LATENCY_BUCKETS = LATENCY_BOUNDS_MS.length + 1;

/** The bucket of a latency: the first whose upper edge is at or above it, else the last. */
export function latencyBucket(latencyMs: number): number {
  const i = LATENCY_BOUNDS_MS.findIndex((edge) => latencyMs <= edge);
  return i === -1 ? LATENCY_BOUNDS_MS.length : i;
}

/** Counters of one UTC day, counting successful calls only. */
export const UsageDayCountersSchema = z.object({
  device: Count,
  cloud: Count,
  /** Sum of `cloudCost` over the day's successful on-device calls. */
  saved: Count,
  deviceMs: z.array(Count).length(LATENCY_BUCKETS),
  cloudMs: z.array(Count).length(LATENCY_BUCKETS),
});
export type UsageDayCounters = z.infer<typeof UsageDayCountersSchema>;

export const emptyUsageDay = (): UsageDayCounters => ({
  device: 0,
  cloud: 0,
  saved: 0,
  deviceMs: Array.from({ length: LATENCY_BUCKETS }, () => 0),
  cloudMs: Array.from({ length: LATENCY_BUCKETS }, () => 0),
});

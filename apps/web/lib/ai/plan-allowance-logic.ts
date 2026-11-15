import { z } from 'zod';
import { DayKeySchema, type DayKey } from '@motionpop/schemas';

/**
 * Pure decision logic for the director's daily limit on free cloud plans (spec 07 design, AI
 * flow 2). Shared by `POST /api/ai/plan-allowance` (server) and its client helper; no Firebase
 * imports here.
 */

/** The UTC calendar day of `nowMs` as `yyyy-mm-dd`, the id of `users/{uid}/limits/{day}`. */
export function utcDayKey(nowMs: number): DayKey {
  return DayKeySchema.parse(new Date(nowMs).toISOString().slice(0, 10));
}

export type AllowanceDecision =
  | { allowed: true; used: number; limit: number }
  | { allowed: false; reason: 'limit'; used: number; limit: number };

/**
 * Whether one more free cloud plan fits today. `used` is the stored count before this call.
 * When allowed, the answer's `used` is the count to store (one more, never above `limit`).
 * When not, nothing is written and `used` is the stored count as it is (it can sit above a
 * limit that Remote Config lowered during the day).
 */
export function decideAllowance(used: number, limit: number): AllowanceDecision {
  if (!Number.isInteger(used) || used < 0) throw new RangeError(`bad used count: ${used}`);
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError(`bad limit: ${limit}`);
  return used < limit
    ? { allowed: true, used: used + 1, limit }
    : { allowed: false, reason: 'limit', used, limit };
}

const Count = z.number().int().nonnegative();

/** Body of a 200 from `POST /api/ai/plan-allowance`. */
export const PlanAllowanceResponseSchema = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(true), used: Count, limit: Count }),
  z.object({ allowed: z.literal(false), reason: z.literal('limit'), used: Count, limit: Count }),
]);
export type PlanAllowanceResponse = z.infer<typeof PlanAllowanceResponseSchema>;

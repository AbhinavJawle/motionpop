// Pure decisions of the one credit ledger (spec 13 design, "Ledger"). Every writer of the ledger
// (the AI spend and refund routes, spec 08's `startExport`, `failRender` and the stalled-render
// sweep) applies these inside its own Firestore transaction, so the rules exist exactly once and
// are property-tested without the emulator. No Firebase imports here.
import type { CreditReason, CreditTx } from '@motionpop/schemas';

export type SpendKind = 'ai' | 'export';

export type SpendRefusal = 'insufficient' | 'rate-limit' | 'paused' | 'key-used';

export type SpendDecision =
  /** The spend entry exists and was not refunded: answer what the first request got. */
  | { kind: 'replay'; balance: number; cost: number }
  | { kind: 'refuse'; reason: SpendRefusal; balance: number }
  | {
      kind: 'charge';
      cost: number;
      balanceAfter: number;
      /** The hour's AI spend count to store (unchanged for exports). */
      hourCount: number;
      /** A judge top-up written first, then the charge. */
      refill?: { grant: number; balanceAfterGrant: number };
    };

export interface SpendInput {
  kind: SpendKind;
  balance: number;
  cost: number;
  /** The spend entry (`s-{key}` / `export-{renderId}`) if it exists. */
  existing: { delta: number; balanceAfter: number } | null;
  /** The matching refund entry (`r-{key}` / `refund-{renderId}`) exists. */
  refunded: boolean;
  killSwitch: boolean;
  /** AI spends already counted in this UTC hour, and the hourly cap (AI only). */
  hourCount: number;
  hourLimit: number;
  /** Set when the plan is judge and today's `judge-refill-{day}` entry does not exist yet. */
  judge: { eligible: boolean; judgeCredits: number } | null;
}

function assertInt(name: string, v: number, min: number): void {
  if (!Number.isInteger(v) || v < min)
    throw new RangeError(`${name} must be an integer >= ${min}, got ${v}`);
}

/**
 * Order: replay, kill switch, rate limit (AI only), balance (with the judge top-up), charge.
 * A replay never re-checks limits, so a retry after a timeout gets its first answer; but a
 * refunded key answers `key-used` and never `ok: true` (review F1).
 */
export function decideSpend(i: SpendInput): SpendDecision {
  assertInt('balance', i.balance, 0);
  assertInt('cost', i.cost, 1);
  assertInt('hourCount', i.hourCount, 0);
  assertInt('hourLimit', i.hourLimit, 0);

  if (i.existing) {
    if (i.refunded) return { kind: 'refuse', reason: 'key-used', balance: i.balance };
    return { kind: 'replay', balance: i.existing.balanceAfter, cost: -i.existing.delta };
  }
  if (i.killSwitch) return { kind: 'refuse', reason: 'paused', balance: i.balance };
  if (i.kind === 'ai' && i.hourCount >= i.hourLimit) {
    return { kind: 'refuse', reason: 'rate-limit', balance: i.balance };
  }
  const hourCount = i.kind === 'ai' ? i.hourCount + 1 : i.hourCount;

  if (i.balance >= i.cost) {
    return { kind: 'charge', cost: i.cost, balanceAfter: i.balance - i.cost, hourCount };
  }
  // A judge whose spend would be refused is topped up to `judgeCredits` (once per UTC day: the
  // caller sets `eligible` false when `judge-refill-{day}` exists) and the spend goes through.
  const j = i.judge;
  if (j?.eligible && j.judgeCredits >= i.cost && j.judgeCredits > i.balance) {
    return {
      kind: 'charge',
      cost: i.cost,
      balanceAfter: j.judgeCredits - i.cost,
      hourCount,
      refill: { grant: j.judgeCredits - i.balance, balanceAfterGrant: j.judgeCredits },
    };
  }
  return { kind: 'refuse', reason: 'insufficient', balance: i.balance };
}

export type RefundRefusal = 'not-found' | 'not-refundable' | 'too-old' | 'limit';

export type RefundDecision =
  | { kind: 'replay'; balance: number }
  | { kind: 'refuse'; reason: RefundRefusal }
  | { kind: 'refund'; amount: number; balanceAfter: number };

export interface RefundInput {
  /** Id of the spend entry being refunded. */
  spendId: string;
  spend: Pick<CreditTx, 'delta' | 'reason' | 'at'> | null;
  refundExists: boolean;
  balance: number;
  nowMs: number;
  /** Client refunds already counted today, and the daily cap. */
  refundsToday: number;
  limit: number;
  maxAgeMs: number;
  /** True for the render service (`failRender`, the sweep): no age limit, no daily cap, any spend. */
  server: boolean;
}

const NOT_SPENDS: ReadonlySet<CreditReason> = new Set([
  'refund',
  'judge-grant',
  'signup',
  'purchase',
  'purchase-reversal',
  'purchase-restore',
]);

/** The time of a ledger entry in ms (a Firestore Timestamp or a Date). */
export function txMs(at: CreditTx['at']): number {
  return at instanceof Date ? at.getTime() : at.toMillis();
}

/**
 * A spend is refunded at most once (the refund entry has a fixed id). A client may refund only its
 * own AI spends (`s-…` ids, never `export-…`) that are at most `maxAgeMs` old, and at most `limit`
 * per UTC day. An existing refund answers as a replay and does not count against the cap.
 */
export function decideRefund(i: RefundInput): RefundDecision {
  assertInt('balance', i.balance, 0);
  assertInt('refundsToday', i.refundsToday, 0);
  if (!i.spend) return { kind: 'refuse', reason: 'not-found' };
  const amount = -i.spend.delta;
  if (amount < 1 || NOT_SPENDS.has(i.spend.reason))
    return { kind: 'refuse', reason: 'not-refundable' };
  if (!i.server && !i.spendId.startsWith('s-')) return { kind: 'refuse', reason: 'not-refundable' };
  if (i.refundExists) return { kind: 'replay', balance: i.balance };
  if (!i.server) {
    if (i.nowMs - txMs(i.spend.at) > i.maxAgeMs) return { kind: 'refuse', reason: 'too-old' };
    if (i.refundsToday >= i.limit) return { kind: 'refuse', reason: 'limit' };
  }
  return { kind: 'refund', amount, balanceAfter: i.balance + amount };
}

/** A client may refund a spend for 15 minutes (spec 13 R1.4). */
export const MAX_REFUND_AGE_MS = 15 * 60_000;

/** The refund entry of a spend entry: `s-{key}` ↔ `r-{key}`, `export-{id}` ↔ `refund-{id}`. */
export function refundIdOf(spendId: string): string {
  if (spendId.startsWith('s-')) return `r-${spendId.slice(2)}`;
  if (spendId.startsWith('export-')) return `refund-${spendId.slice('export-'.length)}`;
  throw new RangeError(`not a spend id: ${spendId}`);
}

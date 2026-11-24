import type { CreditTx, Plan } from '@motionpop/schemas';

/**
 * Pure billing ledger decisions for Dodo Payments purchases, refunds and disputes (spec 44).
 * Executed inside single Firestore transactions in `billing.ts` and property-tested without
 * requiring an emulator.
 */

function assertNonNegInt(name: string, v: number): void {
  if (!Number.isInteger(v) || v < 0) {
    throw new RangeError(`${name} must be an integer >= 0, got ${v}`);
  }
}

function assertPosInt(name: string, v: number): void {
  if (!Number.isInteger(v) || v < 1) {
    throw new RangeError(`${name} must be an integer >= 1, got ${v}`);
  }
}

/**
 * Plan upgrade rule: purchasing upgrades `free → creator` (or `pro` for Studio) and `creator → pro`,
 * and NEVER downgrades `pro` or `judge`.
 */
export function upgradePlanForPurchase(current: Plan, target: 'creator' | 'pro'): Plan {
  if (current === 'judge' || current === 'pro') return current;
  if (current === 'creator') return target === 'pro' ? 'pro' : 'creator';
  return target;
}

export type PurchaseGrantDecision =
  | { kind: 'replay'; balance: number; plan: Plan }
  | { kind: 'grant'; credits: number; balanceAfter: number; nextPlan: Plan };

export interface PurchaseGrantInput {
  balance: number;
  creditsToGrant: number;
  existingPurchase: Pick<CreditTx, 'delta' | 'balanceAfter'> | null;
  webhookProcessed: boolean;
  currentPlan: Plan;
  targetPlan: 'creator' | 'pro';
}

/**
 * Idempotent credit grant for `payment.succeeded`.
 * Replaying the same `webhookId` OR the same `paymentId` NEVER double-credits.
 */
export function decidePurchaseGrant(i: PurchaseGrantInput): PurchaseGrantDecision {
  assertNonNegInt('balance', i.balance);
  assertPosInt('creditsToGrant', i.creditsToGrant);
  if (i.webhookProcessed || i.existingPurchase) {
    return { kind: 'replay', balance: i.balance, plan: i.currentPlan };
  }
  return {
    kind: 'grant',
    credits: i.creditsToGrant,
    balanceAfter: i.balance + i.creditsToGrant,
    nextPlan: upgradePlanForPurchase(i.currentPlan, i.targetPlan),
  };
}

export type PurchaseReversalDecision =
  | { kind: 'replay'; balance: number }
  | { kind: 'skip'; reason: 'no-purchase'; balance: number }
  | { kind: 'revoke'; requested: number; revoked: number; balanceAfter: number };

export interface PurchaseReversalInput {
  balance: number;
  creditsToRevoke: number;
  existingPurchase: Pick<CreditTx, 'delta'> | null;
  existingReversal: Pick<CreditTx, 'delta'> | null;
  webhookProcessed: boolean;
}

/**
 * Idempotent credit revocation for `refund.succeeded` and `dispute.opened`.
 * Clamps revocation to the user's current balance so `balanceAfter` is NEVER negative.
 */
export function decidePurchaseReversal(i: PurchaseReversalInput): PurchaseReversalDecision {
  assertNonNegInt('balance', i.balance);
  assertPosInt('creditsToRevoke', i.creditsToRevoke);
  if (i.webhookProcessed || i.existingReversal) {
    return { kind: 'replay', balance: i.balance };
  }
  if (!i.existingPurchase || i.existingPurchase.delta <= 0) {
    return { kind: 'skip', reason: 'no-purchase', balance: i.balance };
  }
  const cappedToPurchase = Math.min(i.creditsToRevoke, i.existingPurchase.delta);
  const revoked = Math.min(i.balance, cappedToPurchase);
  return {
    kind: 'revoke',
    requested: cappedToPurchase,
    revoked,
    balanceAfter: i.balance - revoked,
  };
}

export type DisputeRestoreDecision =
  | { kind: 'replay'; balance: number }
  | { kind: 'skip'; reason: 'no-reversal'; balance: number }
  | { kind: 'restore'; restored: number; balanceAfter: number };

export interface DisputeRestoreInput {
  balance: number;
  existingReversal: Pick<CreditTx, 'delta'> | null;
  existingRestore: Pick<CreditTx, 'delta'> | null;
  webhookProcessed: boolean;
}

/**
 * Idempotent credit restoration for `dispute.won` and `dispute.cancelled`.
 * Restores only the exact amount that was previously revoked for that dispute.
 */
export function decideDisputeRestore(i: DisputeRestoreInput): DisputeRestoreDecision {
  assertNonNegInt('balance', i.balance);
  if (i.webhookProcessed || i.existingRestore) {
    return { kind: 'replay', balance: i.balance };
  }
  if (!i.existingReversal || i.existingReversal.delta >= 0) {
    return { kind: 'skip', reason: 'no-reversal', balance: i.balance };
  }
  const restored = -i.existingReversal.delta;
  return {
    kind: 'restore',
    restored,
    balanceAfter: i.balance + restored,
  };
}

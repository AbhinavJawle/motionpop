import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Plan } from '@motionpop/schemas';
import {
  decideDisputeRestore,
  decidePurchaseGrant,
  decidePurchaseReversal,
  upgradePlanForPurchase,
} from './billing-logic';
import { decideRefund, decideSpend } from './ledger-logic';

describe('billing-logic (spec 44)', () => {
  it('upgrades free -> creator/pro and never downgrades pro or judge', () => {
    expect(upgradePlanForPurchase('free', 'creator')).toBe('creator');
    expect(upgradePlanForPurchase('free', 'pro')).toBe('pro');
    expect(upgradePlanForPurchase('creator', 'creator')).toBe('creator');
    expect(upgradePlanForPurchase('creator', 'pro')).toBe('pro');
    expect(upgradePlanForPurchase('pro', 'creator')).toBe('pro');
    expect(upgradePlanForPurchase('judge', 'creator')).toBe('judge');
    expect(upgradePlanForPurchase('judge', 'pro')).toBe('judge');
  });

  it('grants once and replays cleanly on duplicate paymentId or webhookId', () => {
    const first = decidePurchaseGrant({
      balance: 15,
      creditsToGrant: 200,
      existingPurchase: null,
      webhookProcessed: false,
      currentPlan: 'free',
      targetPlan: 'creator',
    });
    expect(first).toEqual({ kind: 'grant', credits: 200, balanceAfter: 215, nextPlan: 'creator' });

    expect(
      decidePurchaseGrant({
        balance: 215,
        creditsToGrant: 200,
        existingPurchase: { delta: 200, balanceAfter: 215 },
        webhookProcessed: false,
        currentPlan: 'creator',
        targetPlan: 'creator',
      }),
    ).toEqual({ kind: 'replay', balance: 215, plan: 'creator' });

    expect(
      decidePurchaseGrant({
        balance: 215,
        creditsToGrant: 200,
        existingPurchase: null,
        webhookProcessed: true,
        currentPlan: 'creator',
        targetPlan: 'creator',
      }),
    ).toEqual({ kind: 'replay', balance: 215, plan: 'creator' });
  });

  it('clamps reversals to current balance and restores only what was revoked', () => {
    const rev = decidePurchaseReversal({
      balance: 40,
      creditsToRevoke: 200,
      existingPurchase: { delta: 200 },
      existingReversal: null,
      webhookProcessed: false,
    });
    expect(rev).toEqual({ kind: 'revoke', requested: 200, revoked: 40, balanceAfter: 0 });

    const restored = decideDisputeRestore({
      balance: 10,
      existingReversal: { delta: -40 },
      existingRestore: null,
      webhookProcessed: false,
    });
    expect(restored).toEqual({ kind: 'restore', restored: 40, balanceAfter: 50 });
  });

  it('blocks AI refund attempts on purchase, purchase-reversal, and purchase-restore entries', () => {
    for (const reason of ['purchase', 'purchase-reversal', 'purchase-restore'] as const) {
      expect(
        decideRefund({
          spendId: 's-fake1234',
          spend: { delta: -60, reason, at: new Date(1000) },
          refundExists: false,
          balance: 100,
          nowMs: 2000,
          refundsToday: 0,
          limit: 30,
          maxAgeMs: 900_000,
          server: false,
        }),
      ).toEqual({ kind: 'refuse', reason: 'not-refundable' });
    }
  });

  it('property: arbitrary interleaved purchases, replays, spends, refunds and disputes keep balance >= 0 and idempotent', () => {
    type Op =
      | { t: 'buy'; pay: number; wh: number; credits: number; target: 'creator' | 'pro' }
      | { t: 'spend'; key: number; cost: number }
      | { t: 'refund'; pay: number; ref: number; wh: number; credits: number }
      | { t: 'dispute-open'; pay: number; dis: number; wh: number }
      | { t: 'dispute-win'; dis: number; wh: number };

    const opArb: fc.Arbitrary<Op> = fc.oneof(
      fc.record({
        t: fc.constant('buy' as const),
        pay: fc.nat(3),
        wh: fc.nat(6),
        credits: fc.constantFrom(60, 200, 600),
        target: fc.constantFrom('creator' as const, 'pro' as const),
      }),
      fc.record({
        t: fc.constant('spend' as const),
        key: fc.nat(15),
        cost: fc.integer({ min: 1, max: 25 }),
      }),
      fc.record({
        t: fc.constant('refund' as const),
        pay: fc.nat(3),
        ref: fc.nat(3),
        wh: fc.nat(6),
        credits: fc.constantFrom(60, 200, 600),
      }),
      fc.record({
        t: fc.constant('dispute-open' as const),
        pay: fc.nat(3),
        dis: fc.nat(3),
        wh: fc.nat(6),
      }),
      fc.record({
        t: fc.constant('dispute-win' as const),
        dis: fc.nat(3),
        wh: fc.nat(6),
      }),
    );

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.constantFrom<Plan>('free', 'creator', 'pro', 'judge'),
        fc.array(opArb, { minLength: 1, maxLength: 60 }),
        (startBalance, startPlan, ops) => {
          let balance = startBalance;
          let plan: Plan = startPlan;
          let ledgerSum = startBalance;
          const webhooks = new Set<string>();
          const purchases = new Map<string, { delta: number; balanceAfter: number }>();
          const reversals = new Map<string, { delta: number }>();
          const restores = new Map<string, { delta: number }>();
          const spends = new Map<string, { delta: number; balanceAfter: number }>();

          for (const op of ops) {
            if (op.t === 'buy') {
              const payId = `pay_${op.pay}`;
              const whId = `wh_${op.wh}`;
              const existing = purchases.get(payId) ?? null;
              const d = decidePurchaseGrant({
                balance,
                creditsToGrant: op.credits,
                existingPurchase: existing,
                webhookProcessed: webhooks.has(whId),
                currentPlan: plan,
                targetPlan: op.target,
              });
              if (existing || webhooks.has(whId)) {
                expect(d.kind).toBe('replay');
              }
              if (d.kind === 'grant') {
                webhooks.add(whId);
                purchases.set(payId, { delta: d.credits, balanceAfter: d.balanceAfter });
                balance = d.balanceAfter;
                plan = d.nextPlan;
                ledgerSum += d.credits;
              }
            } else if (op.t === 'spend') {
              const sId = `s-k${op.key}`;
              const d = decideSpend({
                kind: 'ai',
                balance,
                cost: op.cost,
                existing: spends.get(sId) ?? null,
                refunded: false,
                killSwitch: false,
                hourCount: 0,
                hourLimit: 100,
                judge: null,
              });
              if (d.kind === 'charge') {
                spends.set(sId, { delta: -d.cost, balanceAfter: d.balanceAfter });
                balance = d.balanceAfter;
                ledgerSum -= d.cost;
              }
            } else if (op.t === 'refund') {
              const payId = `pay_${op.pay}`;
              const revId = `reversal-refund-ref_${op.ref}`;
              const whId = `wh_${op.wh}`;
              const d = decidePurchaseReversal({
                balance,
                creditsToRevoke: op.credits,
                existingPurchase: purchases.get(payId) ?? null,
                existingReversal: reversals.get(revId) ?? null,
                webhookProcessed: webhooks.has(whId),
              });
              if (d.kind === 'revoke') {
                webhooks.add(whId);
                reversals.set(revId, { delta: -d.revoked });
                balance = d.balanceAfter;
                ledgerSum -= d.revoked;
              }
            } else if (op.t === 'dispute-open') {
              const payId = `pay_${op.pay}`;
              const revId = `reversal-dispute-dis_${op.dis}`;
              const whId = `wh_${op.wh}`;
              const purchase = purchases.get(payId) ?? null;
              const d = decidePurchaseReversal({
                balance,
                creditsToRevoke: purchase?.delta ?? 60,
                existingPurchase: purchase,
                existingReversal: reversals.get(revId) ?? null,
                webhookProcessed: webhooks.has(whId),
              });
              if (d.kind === 'revoke') {
                webhooks.add(whId);
                reversals.set(revId, { delta: -d.revoked });
                balance = d.balanceAfter;
                ledgerSum -= d.revoked;
              }
            } else {
              const revId = `reversal-dispute-dis_${op.dis}`;
              const resId = `restore-dispute-dis_${op.dis}`;
              const whId = `wh_${op.wh}`;
              const d = decideDisputeRestore({
                balance,
                existingReversal: reversals.get(revId) ?? null,
                existingRestore: restores.get(resId) ?? null,
                webhookProcessed: webhooks.has(whId),
              });
              if (d.kind === 'restore') {
                webhooks.add(whId);
                restores.set(resId, { delta: d.restored });
                balance = d.balanceAfter;
                ledgerSum += d.restored;
              }
            }
            expect(balance).toBeGreaterThanOrEqual(0);
            expect(balance).toBe(ledgerSum);
            if (startPlan === 'judge') expect(plan).toBe('judge');
            if (startPlan === 'pro') expect(plan).toBe('pro');
          }
        },
      ),
      { numRuns: 400 },
    );
  });
});

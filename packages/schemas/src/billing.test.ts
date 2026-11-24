import { describe, expect, it } from 'vitest';
import {
  BillingPacksResponseSchema,
  BillingStatusResponseSchema,
  CheckoutRequestSchema,
  CheckoutResponseSchema,
  CREDIT_PACKS,
  disputeRestoreTxId,
  disputeReversalTxId,
  formatPackPriceUsd,
  getCreditPack,
  purchaseTxId,
  refundReversalTxId,
} from './billing';

describe('billing schemas (spec 44)', () => {
  it('defines three monotonically priced credit packs with lower per-credit cost at higher tiers', () => {
    expect(CREDIT_PACKS.map((p) => p.id)).toEqual(['starter', 'creator', 'studio']);
    const perCredit = CREDIT_PACKS.map((p) => p.priceCents / p.credits);
    expect(perCredit[1]!).toBeLessThan(perCredit[0]!);
    expect(perCredit[2]!).toBeLessThan(perCredit[1]!);
    expect(formatPackPriceUsd(getCreditPack('starter').priceCents)).toBe('$5');
    expect(formatPackPriceUsd(getCreditPack('creator').priceCents)).toBe('$15');
    expect(formatPackPriceUsd(getCreditPack('studio').priceCents)).toBe('$39');
  });

  it('rejects unknown pack ids, arbitrary product ids, and non-positive or excessive quantities', () => {
    expect(CheckoutRequestSchema.parse({ packId: 'creator' })).toEqual({
      packId: 'creator',
      quantity: 1,
    });
    expect(CheckoutRequestSchema.safeParse({ packId: 'pdt_123' }).success).toBe(false);
    expect(CheckoutRequestSchema.safeParse({ packId: 'starter', quantity: 0 }).success).toBe(false);
    expect(CheckoutRequestSchema.safeParse({ packId: 'starter', quantity: -1 }).success).toBe(
      false,
    );
    expect(CheckoutRequestSchema.safeParse({ packId: 'starter', quantity: 11 }).success).toBe(
      false,
    );
  });

  it('validates checkout, pack-availability, and status responses', () => {
    expect(
      CheckoutResponseSchema.safeParse({
        checkoutUrl: 'https://test.checkout.dodopayments.com/session/cks_123',
        sessionId: 'cks_123',
        environment: 'test_mode',
      }).success,
    ).toBe(true);
    expect(
      BillingPacksResponseSchema.safeParse({
        configured: true,
        environment: 'test_mode',
        packs: [
          { id: 'starter', available: true },
          { id: 'creator', available: true },
          { id: 'studio', available: false },
        ],
      }).success,
    ).toBe(true);
    expect(
      BillingStatusResponseSchema.safeParse({
        paymentId: 'pay_abc123',
        status: 'settled',
        credits: 200,
        balance: 215,
      }).success,
    ).toBe(true);
  });

  it('produces safe deterministic ledger IDs and rejects path-traversal characters', () => {
    expect(purchaseTxId('pay_abc123')).toBe('purchase-pay_abc123');
    expect(refundReversalTxId('ref_xyz')).toBe('reversal-refund-ref_xyz');
    expect(disputeReversalTxId('dis_123')).toBe('reversal-dispute-dis_123');
    expect(disputeRestoreTxId('dis_123')).toBe('restore-dispute-dis_123');
    expect(() => purchaseTxId('../evil')).toThrow();
    expect(() => purchaseTxId('pay/slash')).toThrow();
  });
});

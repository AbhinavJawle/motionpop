import { createHmac } from 'node:crypto';
import type { UnwrapWebhookEvent } from 'dodopayments/resources/webhooks';
import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import {
  OutOfOrderWebhookError,
  createDodoClient,
  handleDodoWebhookEvent,
  isKeyCompatibleWithEnvironment,
  isPackConfigured,
  readBillingConfig,
  resolvePurchasedCart,
  resolveReturnUrl,
  safeWebhookDocId,
  type BillingConfig,
} from './dodo.server';

const TEST_CFG: BillingConfig = {
  environment: 'test_mode',
  apiKey: 'dodo_test_1234567890',
  // Standard Webhooks secret: "whsec_" + base64("test-secret-key-32-bytes-long!!!")
  webhookKey: `whsec_${Buffer.from('test-secret-key-32-bytes-long!!!').toString('base64')}`,
  returnUrl: null,
  productIds: {
    starter: 'pdt_starter_01',
    creator: 'pdt_creator_01',
    studio: 'pdt_studio_01',
  },
};

function signStandardWebhook(
  secret: string,
  webhookId: string,
  timestampSec: number,
  rawBody: string,
): Record<string, string> {
  const keyBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = createHmac('sha256', keyBytes)
    .update(`${webhookId}.${timestampSec}.${rawBody}`)
    .digest('base64');
  return {
    'webhook-id': webhookId,
    'webhook-timestamp': String(timestampSec),
    'webhook-signature': `v1,${sig}`,
  };
}

describe('dodo.server config and safety guards (spec 44)', () => {
  it('defaults environment to test_mode when env var is missing or anything other than live_mode', () => {
    expect(readBillingConfig({}).environment).toBe('test_mode');
    expect(readBillingConfig({ DODO_PAYMENTS_ENVIRONMENT: 'staging' }).environment).toBe(
      'test_mode',
    );
    expect(readBillingConfig({ DODO_PAYMENTS_ENVIRONMENT: 'live_mode' }).environment).toBe(
      'live_mode',
    );
  });

  it('rejects mismatched key prefix and environment', () => {
    expect(isKeyCompatibleWithEnvironment('dodo_test_abc', 'live_mode')).toBe(false);
    expect(isKeyCompatibleWithEnvironment('dodo_live_abc', 'test_mode')).toBe(false);
    expect(isKeyCompatibleWithEnvironment('dodo_test_abc', 'test_mode')).toBe(true);
    expect(isKeyCompatibleWithEnvironment('dodo_live_abc', 'live_mode')).toBe(true);
    expect(isPackConfigured(TEST_CFG, 'creator')).toBe(true);
    expect(
      isPackConfigured({ ...TEST_CFG, environment: 'live_mode' }, 'creator'),
    ).toBe(false);
  });

  it('resolves cart credits strictly from the server allowlist', () => {
    expect(
      resolvePurchasedCart(
        [
          { product_id: 'pdt_starter_01', quantity: 2 },
          { product_id: 'pdt_unknown_evil', quantity: 99 },
        ],
        TEST_CFG,
      ),
    ).toEqual({
      totalCredits: 120,
      targetPlan: 'creator',
      items: [{ productId: 'pdt_starter_01', packId: 'starter', quantity: 2, credits: 120 }],
    });

    expect(
      resolvePurchasedCart([{ product_id: 'pdt_studio_01', quantity: 1 }], TEST_CFG),
    ).toEqual({
      totalCredits: 600,
      targetPlan: 'pro',
      items: [{ productId: 'pdt_studio_01', packId: 'studio', quantity: 1, credits: 600 }],
    });

    expect(
      resolvePurchasedCart([{ product_id: 'pdt_not_ours', quantity: 1 }], TEST_CFG),
    ).toBeNull();
  });

  it('derives safe return URL from env, validated x-forwarded-host, or request origin (no double query string)', () => {
    const req = new Request('https://motionpop.app/api/billing/checkout', { method: 'POST' });
    expect(resolveReturnUrl(TEST_CFG, req, {})).toBe('https://motionpop.app/pricing');
    expect(
      resolveReturnUrl({ ...TEST_CFG, returnUrl: 'https://custom.example/done' }, req, {}),
    ).toBe('https://custom.example/done');

    // Behind Cloud Run / App Hosting reverse proxy
    const proxied = new Request('http://0.0.0.0:8080/api/billing/checkout', {
      method: 'POST',
      headers: {
        'x-forwarded-host': 'motionpop.app',
        'x-forwarded-proto': 'https',
      },
    });
    expect(resolveReturnUrl(TEST_CFG, proxied, {})).toBe('https://motionpop.app/pricing');

    // Rejects header-injection in x-forwarded-host
    const evilHost = new Request('https://motionpop.app/api/billing/checkout', {
      method: 'POST',
      headers: { 'x-forwarded-host': 'evil.com/phish?x=' },
    });
    expect(resolveReturnUrl(TEST_CFG, evilHost, {})).toBe('https://motionpop.app/pricing');
  });

  it('produces deterministic safe Firestore IDs for unusual webhook-id formats', () => {
    expect(safeWebhookDocId('msg_abc_123')).toBe('msg_abc_123');
    const a = safeWebhookDocId('wh:2026.11.24/weird');
    const b = safeWebhookDocId('wh:2026.11.24/weird');
    expect(a).toBe(b);
    expect(a).toMatch(/^wh_[0-9a-f]{40}$/);
  });

  it('verifies Standard Webhooks signatures on raw body via official SDK unwrap() and rejects tampering', () => {
    const client = createDodoClient(TEST_CFG);
    const rawBody = JSON.stringify({
      business_id: 'bus_123',
      type: 'payment.succeeded',
      timestamp: '2026-11-24T12:00:00Z',
      data: {
        payment_id: 'pay_abc123',
        total_amount: 1500,
        currency: 'USD',
        customer: { customer_id: 'cus_1', email: 'a@b.com', name: 'Ada' },
        metadata: { app_user_id: 'uid_1' },
        product_cart: [{ product_id: 'pdt_creator_01', quantity: 1 }],
      },
    });
    const nowSec = Math.floor(Date.now() / 1000);
    const validHeaders = signStandardWebhook(TEST_CFG.webhookKey!, 'msg_001', nowSec, rawBody);

    const unwrapped = client.webhooks.unwrap(rawBody, { headers: validHeaders });
    expect(unwrapped.type).toBe('payment.succeeded');

    // Tampered body fails cryptographic verification
    expect(() =>
      client.webhooks.unwrap(rawBody.replace('pdt_creator_01', 'pdt_studio_01'), {
        headers: validHeaders,
      }),
    ).toThrow();

    // Bad signature fails
    expect(() =>
      client.webhooks.unwrap(rawBody, {
        headers: { ...validHeaders, 'webhook-signature': 'v1,invalidBase64Sig==' },
      }),
    ).toThrow();
  });
});

describe('handleDodoWebhookEvent (spec 44)', () => {
  const fakeDb = {} as Firestore;

  it('grants credits on payment.succeeded and passes server-resolved items + customer ID', async () => {
    const grant = vi.fn(async () => ({ applied: true, balance: 215, plan: 'creator' as const }));
    const event = {
      business_id: 'bus_1',
      type: 'payment.succeeded',
      timestamp: '2026-11-24T12:00:00Z',
      data: {
        payment_id: 'pay_001',
        metadata: { app_user_id: 'user_42' },
        product_cart: [{ product_id: 'pdt_creator_01', quantity: 1 }],
        customer: { customer_id: 'cus_99', email: 'creator@example.com', name: 'Creator' },
      },
    } as unknown as UnwrapWebhookEvent;

    const out = await handleDodoWebhookEvent(
      {
        db: fakeDb,
        cfg: TEST_CFG,
        retrievePayment: vi.fn(),
        retrieveLineItems: vi.fn(),
        grant,
      },
      event,
      'msg_pay_001',
    );
    expect(out).toEqual({ handled: true, action: 'granted', detail: '200 credits' });
    expect(grant).toHaveBeenCalledWith(fakeDb, {
      webhookId: 'msg_pay_001',
      eventType: 'payment.succeeded',
      uid: 'user_42',
      paymentId: 'pay_001',
      credits: 200,
      targetPlan: 'creator',
      items: [{ productId: 'pdt_creator_01', packId: 'creator', quantity: 1, credits: 200 }],
      dodoCustomerId: 'cus_99',
      environment: 'test_mode',
    });
  });

  it('fetches payment details from Dodo when product_cart is omitted from webhook payload', async () => {
    const grant = vi.fn(async () => ({ applied: true, balance: 615, plan: 'pro' as const }));
    const retrievePayment = vi.fn(async () => ({
      payment_id: 'pay_002',
      metadata: { app_user_id: 'user_42' },
      product_cart: [{ product_id: 'pdt_studio_01', quantity: 1 }],
      customer: { customer_id: 'cus_99' },
    }));
    const event = {
      business_id: 'bus_1',
      type: 'payment.succeeded',
      timestamp: '2026-11-24T12:00:00Z',
      data: {
        payment_id: 'pay_002',
        metadata: {},
        product_cart: null,
        customer: { customer_id: 'cus_99', email: 'creator@example.com', name: 'Creator' },
      },
    } as unknown as UnwrapWebhookEvent;

    const out = await handleDodoWebhookEvent(
      {
        db: fakeDb,
        cfg: TEST_CFG,
        retrievePayment,
        retrieveLineItems: vi.fn(),
        grant,
      },
      event,
      'msg_pay_002',
    );
    expect(retrievePayment).toHaveBeenCalledWith('pay_002');
    expect(out.action).toBe('granted');
    expect(grant).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ credits: 600, targetPlan: 'pro' }),
    );
  });

  it('revokes on full refund and selectively revokes fully-refunded items on partial refund', async () => {
    const revoke = vi.fn(async () => ({ applied: true, revoked: 60, balance: 15 }));
    const fullRefundEvent = {
      business_id: 'bus_1',
      type: 'refund.succeeded',
      timestamp: '2026-11-24T12:00:00Z',
      data: {
        refund_id: 'ref_1',
        payment_id: 'pay_001',
        is_partial: false,
        status: 'succeeded',
      },
    } as unknown as UnwrapWebhookEvent;

    const resFull = await handleDodoWebhookEvent(
      {
        db: fakeDb,
        cfg: TEST_CFG,
        retrievePayment: vi.fn(),
        retrieveLineItems: vi.fn(),
        revoke,
      },
      fullRefundEvent,
      'msg_ref_1',
    );
    expect(resFull.action).toBe('revoked');
    expect(revoke).toHaveBeenCalledWith(fakeDb, {
      webhookId: 'msg_ref_1',
      eventType: 'refund.succeeded',
      paymentId: 'pay_001',
      kind: 'refund',
      sourceId: 'ref_1',
    });

    // Partial refund: 100% of starter (500/500) refunded + 50% of creator (750/1500) refunded
    // = 60 + 100 = 160 total; if 60 was already revoked, incremental delta is 100!
    revoke.mockClear();
    const partialEvent = {
      ...fullRefundEvent,
      data: { refund_id: 'ref_2', payment_id: 'pay_003', is_partial: true, status: 'succeeded' },
    } as unknown as UnwrapWebhookEvent;

    await handleDodoWebhookEvent(
      {
        db: fakeDb,
        cfg: TEST_CFG,
        retrievePayment: vi.fn(),
        retrieveLineItems: vi.fn(async () => ({
          items: [
            { items_id: 'pdt_starter_01', amount: 500, refundable_amount: 0 },
            { items_id: 'pdt_creator_01', amount: 1500, refundable_amount: 750 },
          ],
        })),
        readPayment: vi.fn(async () => ({
          uid: 'user_42',
          paymentId: 'pay_003',
          credits: 260,
          items: [
            { productId: 'pdt_starter_01', packId: 'starter' as const, quantity: 1, credits: 60 },
            { productId: 'pdt_creator_01', packId: 'creator' as const, quantity: 1, credits: 200 },
          ],
          environment: 'test_mode' as const,
        })),
        readAlreadyRevoked: vi.fn(async () => 60),
        revoke,
      },
      partialEvent,
      'msg_ref_2',
    );
    expect(revoke).toHaveBeenCalledWith(fakeDb, {
      webhookId: 'msg_ref_2',
      eventType: 'refund.succeeded',
      paymentId: 'pay_003',
      kind: 'refund',
      sourceId: 'ref_2',
      creditsToRevoke: 100,
    });
  });

  it('throws OutOfOrderWebhookError when refund/dispute arrives before payment.succeeded for a real credit pack, and skips already-refunded payment.succeeded', async () => {
    // Already-refunded payment.succeeded must NOT grant credits
    const grant = vi.fn();
    const refundedPay = {
      business_id: 'bus_1',
      type: 'payment.succeeded',
      timestamp: '2026-11-24T12:00:00Z',
      data: {
        payment_id: 'pay_already_refunded',
        status: 'succeeded',
        refund_status: 'full',
        metadata: { app_user_id: 'user_42' },
        product_cart: [{ product_id: 'pdt_creator_01', quantity: 1 }],
        customer: { customer_id: 'cus_99', email: 'creator@example.com', name: 'Creator' },
      },
    } as unknown as UnwrapWebhookEvent;
    const skipped = await handleDodoWebhookEvent(
      {
        db: fakeDb,
        cfg: TEST_CFG,
        retrievePayment: vi.fn(),
        retrieveLineItems: vi.fn(),
        grant,
      },
      refundedPay,
      'msg_refunded_pay',
    );
    expect(skipped.action).toBe('ignored');
    expect(grant).not.toHaveBeenCalled();

    // Out-of-order refund for a real Motionpop credit pack triggers retry (OutOfOrderWebhookError)
    const earlyRefund = {
      business_id: 'bus_1',
      type: 'refund.succeeded',
      timestamp: '2026-11-24T12:00:00Z',
      data: { refund_id: 'ref_early', payment_id: 'pay_future', is_partial: false, status: 'succeeded' },
    } as unknown as UnwrapWebhookEvent;
    await expect(
      handleDodoWebhookEvent(
        {
          db: fakeDb,
          cfg: TEST_CFG,
          retrievePayment: vi.fn(async () => ({
            payment_id: 'pay_future',
            product_cart: [{ product_id: 'pdt_creator_01', quantity: 1 }],
          })),
          retrieveLineItems: vi.fn(),
          revoke: vi.fn(async () => ({ applied: false, revoked: 0, reason: 'no-purchase' as const })),
        },
        earlyRefund,
        'msg_ref_early',
      ),
    ).rejects.toBeInstanceOf(OutOfOrderWebhookError);

    // Unrelated product refund does NOT throw (no infinite retry loop)
    const unrelated = await handleDodoWebhookEvent(
      {
        db: fakeDb,
        cfg: TEST_CFG,
        retrievePayment: vi.fn(async () => ({
          payment_id: 'pay_other_app',
          product_cart: [{ product_id: 'pdt_some_other_app', quantity: 1 }],
        })),
        retrieveLineItems: vi.fn(),
        revoke: vi.fn(async () => ({ applied: false, revoked: 0, reason: 'no-purchase' as const })),
      },
      earlyRefund,
      'msg_ref_other',
    );
    expect(unrelated.action).toBe('ignored');
  });

  it('revokes on dispute.opened and restores on dispute.won / dispute.cancelled', async () => {
    const revoke = vi.fn(async () => ({ applied: true, revoked: 200, balance: 0 }));
    const restore = vi.fn(async () => ({ applied: true, restored: 200, balance: 200 }));

    const opened = {
      business_id: 'bus_1',
      type: 'dispute.opened',
      timestamp: '2026-11-24T12:00:00Z',
      data: { dispute_id: 'dis_1', payment_id: 'pay_001' },
    } as unknown as UnwrapWebhookEvent;

    const r1 = await handleDodoWebhookEvent(
      {
        db: fakeDb,
        cfg: TEST_CFG,
        retrievePayment: vi.fn(),
        retrieveLineItems: vi.fn(),
        revoke,
        restore,
      },
      opened,
      'msg_dis_open',
    );
    expect(r1.action).toBe('revoked');

    const won = {
      ...opened,
      type: 'dispute.won',
    } as unknown as UnwrapWebhookEvent;
    const r2 = await handleDodoWebhookEvent(
      {
        db: fakeDb,
        cfg: TEST_CFG,
        retrievePayment: vi.fn(),
        retrieveLineItems: vi.fn(),
        revoke,
        restore,
      },
      won,
      'msg_dis_won',
    );
    expect(r2.action).toBe('restored');
    expect(restore).toHaveBeenCalledWith(fakeDb, {
      webhookId: 'msg_dis_won',
      eventType: 'dispute.won',
      paymentId: 'pay_001',
      disputeId: 'dis_1',
    });
  });
});

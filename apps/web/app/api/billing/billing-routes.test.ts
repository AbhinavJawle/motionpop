import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  bootstrapUser: vi.fn(),
  serverConfig: vi.fn(),
  adminDb: vi.fn(),
  createCheckout: vi.fn(),
  grantPurchasedCredits: vi.fn(),
  readPurchaseStatus: vi.fn(),
}));

vi.mock('@/lib/firebase/verify.server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/firebase/verify.server')>(
    '@/lib/firebase/verify.server',
  );
  return { ...actual, verifyRequest: h.verifyRequest };
});
vi.mock('@/lib/users/bootstrap.server', () => ({ bootstrapUser: h.bootstrapUser }));
vi.mock('@/lib/firebase/server-config.server', () => ({ serverConfig: h.serverConfig }));
vi.mock('@/lib/firebase/admin.server', () => ({ adminDb: h.adminDb }));
vi.mock('@motionpop/render/store', async () => {
  const actual = await vi.importActual<typeof import('@motionpop/render/store')>(
    '@motionpop/render/store',
  );
  return {
    ...actual,
    grantPurchasedCredits: h.grantPurchasedCredits,
    readPurchaseStatus: h.readPurchaseStatus,
  };
});

import { GET as getPacks } from './packs/route';
import { POST as postCheckout } from './checkout/route';
import { GET as getStatus } from './status/route';
import { POST as postWebhook } from '../webhooks/dodopayments/route';

const TEST_WEBHOOK_SECRET = `whsec_${Buffer.from('route-test-secret-32-bytes-long!').toString('base64')}`;
const ORIGINAL_ENV = { ...process.env };

function sign(secret: string, id: string, ts: number, raw: string): HeadersInit {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64');
  return {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(ts),
    'webhook-signature': `v1,${sig}`,
  };
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  h.verifyRequest.mockReset();
  h.bootstrapUser.mockReset();
  h.serverConfig.mockReset();
  h.adminDb.mockReset();
  h.grantPurchasedCredits.mockReset();
  h.readPurchaseStatus.mockReset();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('Billing HTTP routes (spec 44)', () => {
  it('GET /api/billing/packs reports unconfigured cleanly without leaking secrets or product IDs', async () => {
    delete process.env.DODO_PAYMENTS_API_KEY;
    delete process.env.DODO_PRODUCT_CREATOR_ID;
    const res = await getPacks();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      configured: boolean;
      environment: string;
      packs: Array<{ id: string; available: boolean }>;
    };
    expect(body.configured).toBe(false);
    expect(body.environment).toBe('test_mode');
    expect(body.packs.every((p) => !p.available)).toBe(true);
  });

  it('POST /api/billing/checkout rejects raw product IDs (400) and unconfigured env (503)', async () => {
    h.verifyRequest.mockResolvedValue({
      uid: 'u1',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada',
      picture: null,
    });
    const badPackRes = await postCheckout(
      new Request('https://motionpop.app/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: 'pdt_evil_inject' }),
      }),
    );
    expect(badPackRes.status).toBe(400);

    delete process.env.DODO_PAYMENTS_API_KEY;
    const unconfRes = await postCheckout(
      new Request('https://motionpop.app/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: 'creator' }),
      }),
    );
    expect(unconfRes.status).toBe(503);
  });

  it('GET /api/billing/status validates payment_id and returns read-only status', async () => {
    h.verifyRequest.mockResolvedValue({
      uid: 'u1',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada',
      picture: null,
    });
    const bad = await getStatus(
      new Request('https://motionpop.app/api/billing/status?payment_id=../evil'),
    );
    expect(bad.status).toBe(400);

    h.readPurchaseStatus.mockResolvedValue({
      paymentId: 'pay_ok_1',
      status: 'settled',
      credits: 200,
      balance: 215,
    });
    const ok = await getStatus(
      new Request('https://motionpop.app/api/billing/status?payment_id=pay_ok_1'),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      paymentId: 'pay_ok_1',
      status: 'settled',
      credits: 200,
      balance: 215,
    });
  });

  it('POST /api/webhooks/dodopayments rejects unsigned/tampered webhooks (401) and grants on valid signature (200)', async () => {
    process.env.DODO_PAYMENTS_ENVIRONMENT = 'test_mode';
    process.env.DODO_PAYMENTS_API_KEY = 'dodo_test_route_key';
    process.env.DODO_PAYMENTS_WEBHOOK_KEY = TEST_WEBHOOK_SECRET;
    process.env.DODO_PRODUCT_CREATOR_ID = 'pdt_creator_test';
    h.adminDb.mockReturnValue({});
    h.grantPurchasedCredits.mockResolvedValue({
      applied: true,
      balance: 215,
      plan: 'creator',
    });

    const raw = JSON.stringify({
      business_id: 'bus_1',
      type: 'payment.succeeded',
      timestamp: '2026-11-24T12:00:00Z',
      data: {
        payment_id: 'pay_signed_1',
        total_amount: 1500,
        currency: 'USD',
        customer: { customer_id: 'cus_1', email: 'ada@example.com', name: 'Ada' },
        metadata: { app_user_id: 'u1' },
        product_cart: [{ product_id: 'pdt_creator_test', quantity: 1 }],
      },
    });
    const nowSec = Math.floor(Date.now() / 1000);

    // 1) Missing headers → 401
    const missing = await postWebhook(
      new Request('https://motionpop.app/api/webhooks/dodopayments', {
        method: 'POST',
        body: raw,
      }),
    );
    expect(missing.status).toBe(401);

    // 2) Bad signature → 401
    const forged = await postWebhook(
      new Request('https://motionpop.app/api/webhooks/dodopayments', {
        method: 'POST',
        headers: {
          'webhook-id': 'msg_forged',
          'webhook-timestamp': String(nowSec),
          'webhook-signature': 'v1,Zm9yZ2Vk',
        },
        body: raw,
      }),
    );
    expect(forged.status).toBe(401);
    expect(h.grantPurchasedCredits).not.toHaveBeenCalled();

    // 3) Valid Standard Webhooks signature → 200 and grants 200 credits
    const valid = await postWebhook(
      new Request('https://motionpop.app/api/webhooks/dodopayments', {
        method: 'POST',
        headers: sign(TEST_WEBHOOK_SECRET, 'msg_valid_1', nowSec, raw),
        body: raw,
      }),
    );
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ received: true, action: 'granted' });
    expect(h.grantPurchasedCredits).toHaveBeenCalledTimes(1);
    expect(h.grantPurchasedCredits).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        webhookId: 'msg_valid_1',
        uid: 'u1',
        paymentId: 'pay_signed_1',
        credits: 200,
        targetPlan: 'creator',
      }),
    );
  });
});

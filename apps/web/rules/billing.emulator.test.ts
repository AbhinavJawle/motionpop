// Real Firestore Emulator tests for Dodo Payments billing transactions & security rules (spec 44).
import { randomUUID } from 'node:crypto';
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  aiSpec,
  grantPurchasedCredits,
  readAlreadyRevokedCredits,
  readPurchaseStatus,
  refundCredits,
  restoreDisputedCredits,
  revokePurchasedCredits,
  spendCredits,
  type LedgerConfig,
} from '@motionpop/render/store';
import {
  APP_CONFIG_DEFAULTS,
  UserDocSchema,
  purchaseTxId,
  type Plan,
} from '@motionpop/schemas';
import { bootstrapUser } from '@/lib/users/bootstrap.server';
import { PROJECT_ID, createEnv } from './helpers';

const APP_NAME = 'billing-emulator-test';
const LEDGER_CFG: LedgerConfig = {
  killSwitch: false,
  rateLimitCloudPerHour: 30,
  refundsPerDay: 30,
  judgeCredits: 500,
};

let adminApp: App;
let adminDb: Firestore;
let rulesEnv: RulesTestEnvironment;

beforeAll(async () => {
  if (!process.env['FIRESTORE_EMULATOR_HOST']) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set; run via `pnpm test:rules`.');
  }
  adminApp =
    getApps().find((a) => a.name === APP_NAME) ??
    initializeApp({ projectId: PROJECT_ID }, APP_NAME);
  adminDb = getFirestore(adminApp);
  rulesEnv = await createEnv({ firestore: true });
});

afterAll(async () => {
  await rulesEnv?.cleanup();
  await adminDb?.terminate();
});

const uid = () => `bill-${randomUUID()}`;
const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;

async function seedUser(userId: string, credits = 15, plan: Plan = 'free'): Promise<void> {
  const now = Timestamp.now();
  await adminDb.collection('users').doc(userId).set({
    displayName: 'Creator',
    email: `${userId}@example.com`,
    credits,
    plan,
    settings: { preferOnDevice: true, captionsDefault: true, defaultFormat: '16:9' },
    schemaVersion: 1,
    createdAt: now,
    lastSeenAt: now,
  });
}

describe('Firestore security rules: billing collections & user billing fields (spec 44)', () => {
  it('blocks all client reads and writes on billing_webhooks and billing_payments', async () => {
    await rulesEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'billing_webhooks/msg_1'), { eventType: 'payment.succeeded' });
      await setDoc(doc(db, 'billing_payments/pay_1'), { uid: 'alice', credits: 200 });
      await setDoc(doc(db, 'users/alice'), {
        displayName: 'Alice',
        email: 'alice@example.com',
        credits: 15,
        plan: 'free',
        settings: { preferOnDevice: true, captionsDefault: true, defaultFormat: '16:9' },
        schemaVersion: 1,
        createdAt: 1,
        lastSeenAt: 1,
      });
    });

    const alice = rulesEnv.authenticatedContext('alice').firestore();
    const bob = rulesEnv.authenticatedContext('bob').firestore();
    const anon = rulesEnv.unauthenticatedContext().firestore();

    for (const ctx of [alice, bob, anon]) {
      await assertFails(getDoc(doc(ctx, 'billing_webhooks/msg_1')));
      await assertFails(setDoc(doc(ctx, 'billing_webhooks/msg_2'), { forged: true }));
      await assertFails(getDoc(doc(ctx, 'billing_payments/pay_1')));
      await assertFails(setDoc(doc(ctx, 'billing_payments/pay_2'), { uid: 'alice', credits: 9999 }));
    }

    // Owner cannot self-modify dodoCustomerId, dodoCustomerEnv, credits, or plan
    await assertFails(updateDoc(doc(alice, 'users/alice'), { dodoCustomerId: 'cus_forged' }));
    await assertFails(updateDoc(doc(alice, 'users/alice'), { dodoCustomerEnv: 'live_mode' }));
    await assertFails(updateDoc(doc(alice, 'users/alice'), { credits: 9999 }));
    await assertFails(updateDoc(doc(alice, 'users/alice'), { plan: 'pro' }));
    // Legitimate displayName update still succeeds
    await assertSucceeds(updateDoc(doc(alice, 'users/alice'), { displayName: 'Alice Updated' }));
  });
});

describe('Firestore emulator: atomic Dodo Payments billing transactions (spec 44)', () => {
  it('bootstraps a default account with 15 credits', async () => {
    const u = uid();
    const boot = await bootstrapUser(
      adminDb,
      u,
      { email: `${u}@example.com`, emailVerified: true, displayName: 'New User', photoURL: null },
      new Set(),
      APP_CONFIG_DEFAULTS,
    );
    expect(boot).toEqual({ created: true, plan: 'free', credits: 15 });
  });

  it('grants once under concurrent duplicate webhooks and blocks cross-account paymentId replay', async () => {
    const u1 = uid();
    const u2 = uid();
    await Promise.all([seedUser(u1, 15, 'free'), seedUser(u2, 15, 'free')]);

    const paymentId = id('pay');
    const items = [
      { productId: 'pdt_creator', packId: 'creator' as const, quantity: 1, credits: 200 },
    ];

    // Fire 5 concurrent webhook deliveries for the SAME paymentId (different webhookIds)
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        grantPurchasedCredits(adminDb, {
          webhookId: `${id('msg')}_${i}`,
          eventType: 'payment.succeeded',
          uid: u1,
          paymentId,
          credits: 200,
          targetPlan: 'creator',
          items,
          dodoCustomerId: 'cus_test_1',
          environment: 'test_mode',
        }),
      ),
    );

    const appliedCount = results.filter((r) => r.applied).length;
    expect(appliedCount).toBe(1);

    const userSnap = await adminDb.collection('users').doc(u1).get();
    const user = UserDocSchema.parse(userSnap.data());
    expect(user.credits).toBe(215);
    expect(user.plan).toBe('creator');
    expect(user.dodoCustomerId).toBe('cus_test_1');
    expect(user.dodoCustomerEnv).toBe('test_mode');

    // Cross-account replay attempt with the SAME paymentId must NOT grant credits to u2!
    const cross = await grantPurchasedCredits(adminDb, {
      webhookId: id('msg'),
      eventType: 'payment.succeeded',
      uid: u2,
      paymentId,
      credits: 200,
      targetPlan: 'creator',
      items,
      environment: 'test_mode',
    });
    expect(cross.applied).toBe(false);
    const u2Snap = await adminDb.collection('users').doc(u2).get();
    expect(UserDocSchema.parse(u2Snap.data()).credits).toBe(15);

    // Client AI refund endpoint must refuse purchase-* entries
    const badRefund = await refundCredits(
      adminDb,
      u1,
      purchaseTxId(paymentId),
      LEDGER_CFG,
      Date.now(),
    );
    expect(badRefund).toEqual({ ok: false, reason: 'not-refundable' });
  });

  it('handles full lifecycle: pending -> settled -> spend -> clamped dispute revoke -> dispute won restore', async () => {
    const u = uid();
    await seedUser(u, 15, 'free');
    const paymentId = id('pay');
    const disputeId = id('dis');

    // 1. Before webhook lands: status is pending
    expect(await readPurchaseStatus(adminDb, u, paymentId)).toEqual({
      paymentId,
      status: 'pending',
      balance: 15,
    });

    // 2. payment.succeeded lands (+200 → 215)
    await grantPurchasedCredits(adminDb, {
      webhookId: id('msg'),
      eventType: 'payment.succeeded',
      uid: u,
      paymentId,
      credits: 200,
      targetPlan: 'creator',
      items: [{ productId: 'pdt_creator', packId: 'creator', quantity: 1, credits: 200 }],
      dodoCustomerId: 'cus_life',
      environment: 'test_mode',
    });
    expect(await readPurchaseStatus(adminDb, u, paymentId)).toEqual({
      paymentId,
      status: 'settled',
      credits: 200,
      balance: 215,
    });

    // 3. User spends 180 credits (215 -> 35)
    const spent = await spendCredits(
      adminDb,
      { ...aiSpec(u, id('sp')), reason: 'film', cost: 180 },
      LEDGER_CFG,
      Date.now(),
    );
    expect(spent.ok).toBe(true);
    if (spent.ok) expect(spent.balance).toBe(35);

    // 4. dispute.opened revokes unspent credits, clamped at 0 (revoked = 35, never negative)
    const rev = await revokePurchasedCredits(adminDb, {
      webhookId: id('msg'),
      eventType: 'dispute.opened',
      paymentId,
      kind: 'dispute',
      sourceId: disputeId,
    });
    expect(rev).toEqual({ applied: true, revoked: 35, balance: 0 });
    expect(await readAlreadyRevokedCredits(adminDb, u, paymentId)).toBe(35);
    expect(await readPurchaseStatus(adminDb, u, paymentId)).toEqual({
      paymentId,
      status: 'reversed',
      credits: 200,
      balance: 0,
    });

    // 5. dispute.won restores the exact 35 credits and flips status back to settled!
    const restored = await restoreDisputedCredits(adminDb, {
      webhookId: id('msg'),
      eventType: 'dispute.won',
      paymentId,
      disputeId,
    });
    expect(restored).toEqual({ applied: true, restored: 35, balance: 35 });
    expect(await readPurchaseStatus(adminDb, u, paymentId)).toEqual({
      paymentId,
      status: 'settled',
      credits: 200,
      balance: 35,
    });

    // Replaying dispute.won does NOT double-restore
    const replayRestore = await restoreDisputedCredits(adminDb, {
      webhookId: id('msg'),
      eventType: 'dispute.won',
      paymentId,
      disputeId,
    });
    expect(replayRestore.applied).toBe(false);
    expect(UserDocSchema.parse((await adminDb.collection('users').doc(u).get()).data()).credits).toBe(
      35,
    );
  });

  it('preserves judge plan when a judge account purchases credits', async () => {
    const u = uid();
    await seedUser(u, 500, 'judge');
    const res = await grantPurchasedCredits(adminDb, {
      webhookId: id('msg'),
      eventType: 'payment.succeeded',
      uid: u,
      paymentId: id('pay'),
      credits: 600,
      targetPlan: 'pro',
      items: [{ productId: 'pdt_studio', packId: 'studio', quantity: 1, credits: 600 }],
      environment: 'test_mode',
    });
    expect(res).toEqual({ applied: true, balance: 1100, plan: 'judge' });
  });
});

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  BillingEnvironmentSchema,
  CreditPackIdSchema,
  CreditTxSchema,
  DodoResourceIdSchema,
  UserDocSchema,
  disputeRestoreTxId,
  disputeReversalTxId,
  purchaseTxId,
  refundReversalTxId,
  type BillingEnvironment,
  type BillingStatusResponse,
  type Plan,
} from '@motionpop/schemas';
import { z } from 'zod';
import {
  decideDisputeRestore,
  decidePurchaseGrant,
  decidePurchaseReversal,
} from './billing-logic';
import { LedgerError } from './ledger';

/**
 * Server-only Firestore billing ledger transactions for Dodo Payments (spec 44).
 * Every webhook mutation claims `billing_webhooks/{webhookId}` and updates the user's ledger
 * inside the SAME Firestore transaction so retries and duplicates never double-grant or lose work.
 */

export const PurchasedLineItemSchema = z.object({
  productId: z.string().min(1).max(128),
  packId: CreditPackIdSchema,
  quantity: z.number().int().positive(),
  credits: z.number().int().positive(),
});
export type PurchasedLineItem = z.infer<typeof PurchasedLineItemSchema>;

export const BillingPaymentRecordSchema = z.object({
  uid: z.string().min(1).max(128),
  paymentId: DodoResourceIdSchema,
  credits: z.number().int().positive(),
  items: z.array(PurchasedLineItemSchema).min(1),
  dodoCustomerId: z.string().min(1).max(128).optional(),
  environment: BillingEnvironmentSchema,
});
export type BillingPaymentRecord = z.infer<typeof BillingPaymentRecordSchema>;

export interface GrantPurchaseInput {
  webhookId: string;
  eventType: string;
  uid: string;
  paymentId: string;
  credits: number;
  targetPlan: 'creator' | 'pro';
  items: PurchasedLineItem[];
  dodoCustomerId?: string;
  environment: BillingEnvironment;
}

export interface GrantPurchaseResult {
  applied: boolean;
  balance: number;
  plan: Plan;
}

/**
 * Atomically claims `billing_webhooks/{webhookId}`, records `billing_payments/{paymentId}` and
 * `users/{uid}/credits/purchase-{paymentId}`, increments `users/{uid}.credits`, and upgrades plan.
 */
export function grantPurchasedCredits(
  db: Firestore,
  input: GrantPurchaseInput,
): Promise<GrantPurchaseResult> {
  const safeWebhookId = DodoResourceIdSchema.parse(input.webhookId);
  const safePaymentId = DodoResourceIdSchema.parse(input.paymentId);
  const txId = purchaseTxId(safePaymentId);

  const webhookRef = db.collection('billing_webhooks').doc(safeWebhookId);
  const paymentRef = db.collection('billing_payments').doc(safePaymentId);
  const userRef = db.collection('users').doc(input.uid);
  const txRef = userRef.collection('credits').doc(txId);

  return db.runTransaction(async (t) => {
    // Read paymentRef too so a single paymentId can NEVER credit two different accounts.
    const [whSnap, paySnap, userSnap, txSnap] = await t.getAll(
      webhookRef,
      paymentRef,
      userRef,
      txRef,
    );
    if (!userSnap?.exists) {
      throw new LedgerError('not-bootstrapped', `User doc missing for ${input.uid}`);
    }
    const user = UserDocSchema.parse(userSnap.data());
    const existingPurchase = txSnap?.exists ? CreditTxSchema.parse(txSnap.data()) : null;
    const webhookProcessed = whSnap?.exists ?? false;
    const paymentAlreadyRecorded = paySnap?.exists ?? false;

    const decision = decidePurchaseGrant({
      balance: user.credits,
      creditsToGrant: input.credits,
      existingPurchase:
        existingPurchase ??
        (paymentAlreadyRecorded ? { delta: input.credits, balanceAfter: user.credits } : null),
      webhookProcessed,
      currentPlan: user.plan,
      targetPlan: input.targetPlan,
    });

    const at = FieldValue.serverTimestamp();
    if (decision.kind === 'replay') {
      if (!webhookProcessed) {
        t.create(webhookRef, {
          webhookId: safeWebhookId,
          eventType: input.eventType,
          paymentId: safePaymentId,
          uid: input.uid,
          outcome: 'replay',
          processedAt: at,
        });
      }
      return { applied: false, balance: decision.balance, plan: decision.plan };
    }

    t.create(webhookRef, {
      webhookId: safeWebhookId,
      eventType: input.eventType,
      paymentId: safePaymentId,
      uid: input.uid,
      credits: decision.credits,
      outcome: 'granted',
      processedAt: at,
    });
    t.create(paymentRef, {
      uid: input.uid,
      paymentId: safePaymentId,
      credits: decision.credits,
      items: input.items,
      ...(input.dodoCustomerId ? { dodoCustomerId: input.dodoCustomerId } : {}),
      environment: input.environment,
      createdAt: at,
    });
    t.create(txRef, {
      delta: decision.credits,
      reason: 'purchase',
      refId: safePaymentId,
      balanceAfter: decision.balanceAfter,
      at,
    });
    t.update(userRef, {
      credits: decision.balanceAfter,
      plan: decision.nextPlan,
      ...(input.dodoCustomerId
        ? { dodoCustomerId: input.dodoCustomerId, dodoCustomerEnv: input.environment }
        : {}),
      lastSeenAt: at,
    });

    return { applied: true, balance: decision.balanceAfter, plan: decision.nextPlan };
  });
}

export interface RevokePurchaseInput {
  webhookId: string;
  eventType: string;
  paymentId: string;
  /** Distinguishes refunds (`refund`) from chargeback disputes (`dispute`). */
  kind: 'refund' | 'dispute';
  /** The Dodo `refund_id` or `dispute_id`. */
  sourceId: string;
  /** Optional partial credit override (e.g. for partial line-item refunds). Defaults to full purchase. */
  creditsToRevoke?: number;
}

export interface RevokePurchaseResult {
  applied: boolean;
  revoked: number;
  balance?: number;
  reason?: 'replay' | 'no-purchase';
}

/**
 * Atomically revokes unspent credits for a verified `refund.succeeded` or `dispute.opened` webhook.
 * Looks up the original owner via `billing_payments/{paymentId}` and clamps balance at `0`.
 */
export function revokePurchasedCredits(
  db: Firestore,
  input: RevokePurchaseInput,
): Promise<RevokePurchaseResult> {
  const safeWebhookId = DodoResourceIdSchema.parse(input.webhookId);
  const safePaymentId = DodoResourceIdSchema.parse(input.paymentId);
  const safeSourceId = DodoResourceIdSchema.parse(input.sourceId);
  const revTxId =
    input.kind === 'refund'
      ? refundReversalTxId(safeSourceId)
      : disputeReversalTxId(safeSourceId);
  const buyTxId = purchaseTxId(safePaymentId);

  const webhookRef = db.collection('billing_webhooks').doc(safeWebhookId);
  const paymentRef = db.collection('billing_payments').doc(safePaymentId);

  return db.runTransaction(async (t) => {
    const [whSnap, paySnap] = await t.getAll(webhookRef, paymentRef);
    const webhookProcessed = whSnap?.exists ?? false;
    if (webhookProcessed) {
      return { applied: false, revoked: 0, reason: 'replay' };
    }
    if (!paySnap?.exists) {
      return { applied: false, revoked: 0, reason: 'no-purchase' };
    }
    const payment = BillingPaymentRecordSchema.parse(paySnap.data());
    const userRef = db.collection('users').doc(payment.uid);
    const buyTxRef = userRef.collection('credits').doc(buyTxId);
    const revTxRef = userRef.collection('credits').doc(revTxId);

    // Remaining reads before any write (Firestore transaction rule).
    const [userSnap, buyTxSnap, revTxSnap] = await t.getAll(userRef, buyTxRef, revTxRef);
    if (!userSnap?.exists) {
      return { applied: false, revoked: 0, reason: 'no-purchase' };
    }
    const user = UserDocSchema.parse(userSnap.data());
    const existingPurchase = buyTxSnap?.exists ? CreditTxSchema.parse(buyTxSnap.data()) : null;
    const existingReversal = revTxSnap?.exists ? CreditTxSchema.parse(revTxSnap.data()) : null;

    const creditsToRevoke = input.creditsToRevoke ?? payment.credits;
    const decision = decidePurchaseReversal({
      balance: user.credits,
      creditsToRevoke,
      existingPurchase,
      existingReversal,
      webhookProcessed,
    });

    const at = FieldValue.serverTimestamp();
    if (decision.kind === 'replay') {
      t.create(webhookRef, {
        webhookId: safeWebhookId,
        eventType: input.eventType,
        paymentId: safePaymentId,
        uid: payment.uid,
        outcome: 'replay',
        processedAt: at,
      });
      return { applied: false, revoked: 0, balance: decision.balance, reason: 'replay' };
    }
    if (decision.kind === 'skip') {
      return { applied: false, revoked: 0, balance: decision.balance, reason: 'no-purchase' };
    }

    t.create(webhookRef, {
      webhookId: safeWebhookId,
      eventType: input.eventType,
      paymentId: safePaymentId,
      uid: payment.uid,
      revoked: decision.revoked,
      outcome: 'revoked',
      processedAt: at,
    });
    t.create(revTxRef, {
      delta: -decision.revoked,
      reason: 'purchase-reversal',
      refId: safePaymentId,
      balanceAfter: decision.balanceAfter,
      at,
    });
    t.update(userRef, {
      credits: decision.balanceAfter,
      lastSeenAt: at,
    });

    return { applied: true, revoked: decision.revoked, balance: decision.balanceAfter };
  });
}

export interface RestoreDisputeInput {
  webhookId: string;
  eventType: string;
  paymentId: string;
  disputeId: string;
}

export interface RestoreDisputeResult {
  applied: boolean;
  restored: number;
  balance?: number;
}

/**
 * Atomically restores credits previously revoked for a dispute when `dispute.won` or
 * `dispute.cancelled` arrives.
 */
export function restoreDisputedCredits(
  db: Firestore,
  input: RestoreDisputeInput,
): Promise<RestoreDisputeResult> {
  const safeWebhookId = DodoResourceIdSchema.parse(input.webhookId);
  const safePaymentId = DodoResourceIdSchema.parse(input.paymentId);
  const safeDisputeId = DodoResourceIdSchema.parse(input.disputeId);
  const revTxId = disputeReversalTxId(safeDisputeId);
  const resTxId = disputeRestoreTxId(safeDisputeId);

  const webhookRef = db.collection('billing_webhooks').doc(safeWebhookId);
  const paymentRef = db.collection('billing_payments').doc(safePaymentId);

  return db.runTransaction(async (t) => {
    const [whSnap, paySnap] = await t.getAll(webhookRef, paymentRef);
    const webhookProcessed = whSnap?.exists ?? false;
    if (webhookProcessed || !paySnap?.exists) {
      return { applied: false, restored: 0 };
    }
    const payment = BillingPaymentRecordSchema.parse(paySnap.data());
    const userRef = db.collection('users').doc(payment.uid);
    const revTxRef = userRef.collection('credits').doc(revTxId);
    const resTxRef = userRef.collection('credits').doc(resTxId);

    const [userSnap, revTxSnap, resTxSnap] = await t.getAll(userRef, revTxRef, resTxRef);
    if (!userSnap?.exists) return { applied: false, restored: 0 };
    const user = UserDocSchema.parse(userSnap.data());
    const existingReversal = revTxSnap?.exists ? CreditTxSchema.parse(revTxSnap.data()) : null;
    const existingRestore = resTxSnap?.exists ? CreditTxSchema.parse(resTxSnap.data()) : null;

    const decision = decideDisputeRestore({
      balance: user.credits,
      existingReversal,
      existingRestore,
      webhookProcessed,
    });

    const at = FieldValue.serverTimestamp();
    if (decision.kind !== 'restore') {
      if (decision.kind === 'replay') {
        t.create(webhookRef, {
          webhookId: safeWebhookId,
          eventType: input.eventType,
          paymentId: safePaymentId,
          uid: payment.uid,
          outcome: 'replay',
          processedAt: at,
        });
      }
      return { applied: false, restored: 0, balance: decision.balance };
    }

    t.create(webhookRef, {
      webhookId: safeWebhookId,
      eventType: input.eventType,
      paymentId: safePaymentId,
      uid: payment.uid,
      restored: decision.restored,
      outcome: 'restored',
      processedAt: at,
    });
    t.create(resTxRef, {
      delta: decision.restored,
      reason: 'purchase-restore',
      refId: safePaymentId,
      balanceAfter: decision.balanceAfter,
      at,
    });
    t.update(userRef, {
      credits: decision.balanceAfter,
      lastSeenAt: at,
    });

    return { applied: true, restored: decision.restored, balance: decision.balanceAfter };
  });
}

/**
 * Read-only lookup of a signed-in user's purchase fulfillment status (used after `return_url`
 * redirect). Never mutates credits.
 */
export async function readPurchaseStatus(
  db: Firestore,
  uid: string,
  paymentId: string,
): Promise<BillingStatusResponse> {
  const safePaymentId = DodoResourceIdSchema.parse(paymentId);
  const userRef = db.collection('users').doc(uid);
  const txRef = userRef.collection('credits').doc(purchaseTxId(safePaymentId));
  const [userSnap, txSnap] = await db.getAll(userRef, txRef);

  const balance = userSnap?.exists ? UserDocSchema.parse(userSnap.data()).credits : null;
  if (!txSnap?.exists) {
    return { paymentId: safePaymentId, status: 'pending', balance };
  }
  const tx = CreditTxSchema.parse(txSnap.data());
  // Single-field query on `refId` (no composite index needed) computing net reversals vs restores.
  const relatedSnap = await userRef
    .collection('credits')
    .where('refId', '==', safePaymentId)
    .limit(20)
    .get();
  let netAdjustment = 0;
  for (const d of relatedSnap.docs) {
    const parsed = CreditTxSchema.safeParse(d.data());
    if (!parsed.success) continue;
    if (
      parsed.data.reason === 'purchase-reversal' ||
      parsed.data.reason === 'purchase-restore'
    ) {
      netAdjustment += parsed.data.delta;
    }
  }
  if (netAdjustment < 0) {
    return { paymentId: safePaymentId, status: 'reversed', credits: tx.delta, balance };
  }
  return { paymentId: safePaymentId, status: 'settled', credits: tx.delta, balance };
}

/** Reads total credits already revoked for `paymentId` (to avoid over-revoking across partial refunds). */
export async function readAlreadyRevokedCredits(
  db: Firestore,
  uid: string,
  paymentId: string,
): Promise<number> {
  const safePaymentId = DodoResourceIdSchema.parse(paymentId);
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('credits')
    .where('refId', '==', safePaymentId)
    .limit(20)
    .get();
  let revoked = 0;
  for (const d of snap.docs) {
    const parsed = CreditTxSchema.safeParse(d.data());
    if (parsed.success && parsed.data.reason === 'purchase-reversal' && parsed.data.delta < 0) {
      revoked += -parsed.data.delta;
    }
  }
  return revoked;
}

/** Reads the persisted billing payment record (server-only) for partial-refund credit math. */
export async function readBillingPayment(
  db: Firestore,
  paymentId: string,
): Promise<BillingPaymentRecord | null> {
  const safePaymentId = DodoResourceIdSchema.parse(paymentId);
  const snap = await db.collection('billing_payments').doc(safePaymentId).get();
  if (!snap.exists) return null;
  return BillingPaymentRecordSchema.parse(snap.data());
}

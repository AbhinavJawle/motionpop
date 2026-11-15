import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { DailyLimitsSchema } from '@motionpop/schemas';
import { decideAllowance, utcDayKey, type AllowanceDecision } from './plan-allowance-logic';

/**
 * Take one free cloud plan from the caller's daily allowance (spec 07 design, AI flow 2). In
 * one transaction: read `users/{uid}/limits/{utc day}`, and if `planCloud` is below `limit`,
 * store the incremented count. Over the limit nothing is written. Concurrent calls retry in the
 * transaction, so the stored count never passes the limit.
 */
export async function takePlanAllowance(
  db: Firestore,
  uid: string,
  limit: number,
  nowMs: number,
): Promise<AllowanceDecision> {
  const ref = db.collection('users').doc(uid).collection('limits').doc(utcDayKey(nowMs));
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const used = snap.exists ? DailyLimitsSchema.parse(snap.data()).planCloud : 0;
    const decision = decideAllowance(used, limit);
    if (decision.allowed) {
      // Merge keeps any other counters a later spec adds to the same day doc.
      t.set(
        ref,
        { schemaVersion: 1, planCloud: decision.used, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    return decision;
  });
}

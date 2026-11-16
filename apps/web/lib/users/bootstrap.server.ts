import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { UserDocSchema, type Plan } from '@motionpop/schemas';
import {
  JUDGE_UPGRADE_TX_ID,
  judgeRefillTxId,
  planBootstrap,
  planReturning,
  type BootstrapProfile,
} from './bootstrap-plan';
import type { AppConfig } from '@motionpop/schemas';

export interface BootstrapResult {
  created: boolean;
  plan: Plan;
  credits: number;
}

/** Ledger id for the first grant. Fixed, so concurrent bootstraps can't grant twice. */
export const SIGNUP_TX_ID = 'signup';

/**
 * Create `users/{uid}` and its first ledger entry exactly once (spec 01 R4.3–R4.4). Runs in a
 * transaction. For an existing doc only `lastSeenAt` is written, unless `planReturning` grants a
 * judge upgrade or a daily refill (spec 13 R4.2–R4.4).
 */
export async function bootstrapUser(
  db: Firestore,
  uid: string,
  profile: BootstrapProfile,
  judgeEmails: ReadonlySet<string>,
  config: Pick<AppConfig, 'freeCredits' | 'judgeCredits'>,
  nowMs: number = Date.now(),
): Promise<BootstrapResult> {
  const userRef = db.collection('users').doc(uid);
  const txRef = userRef.collection('credits').doc(SIGNUP_TX_ID);

  return db.runTransaction(async (t) => {
    const day = new Date(nowMs).toISOString().slice(0, 10);
    const upgradeRef = userRef.collection('credits').doc(JUDGE_UPGRADE_TX_ID);
    const refillRef = userRef.collection('credits').doc(judgeRefillTxId(day));
    // All reads before any write (a Firestore rule).
    const [snap, upgrade, refill] = await t.getAll(userRef, upgradeRef, refillRef);
    if (snap?.exists) {
      const existing = UserDocSchema.parse(snap.data());
      const next = planReturning({
        user: existing,
        profile,
        judgeEmails,
        judgeCredits: config.judgeCredits,
        nowMs,
        upgradeDone: upgrade?.exists ?? false,
        refilledToday: refill?.exists ?? false,
      });
      if (!next) {
        t.update(userRef, { lastSeenAt: FieldValue.serverTimestamp() });
        return { created: false, plan: existing.plan, credits: existing.credits };
      }
      const credits = existing.credits + next.grant;
      t.update(userRef, {
        plan: next.plan,
        credits,
        lastSeenAt: FieldValue.serverTimestamp(),
      });
      if (next.grant > 0) {
        t.create(userRef.collection('credits').doc(next.txId), {
          delta: next.grant,
          reason: 'judge-grant',
          refId: next.refId,
          balanceAfter: credits,
          at: FieldValue.serverTimestamp(),
        });
      }
      return { created: false, plan: next.plan, credits };
    }
    const { user, tx } = planBootstrap(profile, judgeEmails, config);
    const now = FieldValue.serverTimestamp();
    t.create(userRef, { ...user, createdAt: now, lastSeenAt: now });
    t.create(txRef, { ...tx, at: now });
    return { created: true, plan: user.plan, credits: user.credits };
  });
}

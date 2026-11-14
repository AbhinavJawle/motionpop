import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { UserDocSchema, type Plan } from '@motionpop/schemas';
import { planBootstrap, type BootstrapProfile } from './bootstrap-plan';
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
 * transaction: if the doc already exists, nothing is written except `lastSeenAt`.
 */
export async function bootstrapUser(
  db: Firestore,
  uid: string,
  profile: BootstrapProfile,
  judgeEmails: ReadonlySet<string>,
  config: Pick<AppConfig, 'freeCredits' | 'judgeCredits'>,
): Promise<BootstrapResult> {
  const userRef = db.collection('users').doc(uid);
  const txRef = userRef.collection('credits').doc(SIGNUP_TX_ID);

  return db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (snap.exists) {
      const existing = UserDocSchema.parse(snap.data());
      t.update(userRef, { lastSeenAt: FieldValue.serverTimestamp() });
      return { created: false, plan: existing.plan, credits: existing.credits };
    }
    const { user, tx } = planBootstrap(profile, judgeEmails, config);
    const now = FieldValue.serverTimestamp();
    t.create(userRef, { ...user, createdAt: now, lastSeenAt: now });
    t.create(txRef, { ...tx, at: now });
    return { created: true, plan: user.plan, credits: user.credits };
  });
}

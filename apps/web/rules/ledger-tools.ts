// Shared helpers of the ledger emulator tests (spec 13 tasks 5, 5b and spec 08 tasks 8, 10):
// seeding a bootstrapped user, reading the ledger and checking that it is exact.
import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { expect } from 'vitest';
import {
  CreditTxSchema,
  DailyLimitsSchema,
  RenderDocSchema,
  UserDocSchema,
  type Plan,
} from '@motionpop/schemas';

export const newKey = (): string => randomUUID().replaceAll('-', '');
export const salt = (): string => newKey().slice(0, 8);

export function ledgerTools(db: Firestore) {
  /** A bootstrapped user: the user doc and the `signup` ledger entry, as `bootstrapUser` writes them. */
  async function seed(credits: number, plan: Plan = 'free'): Promise<string> {
    const uid = `led-${randomUUID()}`;
    const now = Timestamp.now();
    await db.doc(`users/${uid}`).set({
      displayName: 'Ledger Test',
      email: `${uid}@example.com`,
      credits,
      plan,
      settings: { preferOnDevice: true, captionsDefault: true, defaultFormat: '16:9' },
      schemaVersion: 1,
      createdAt: now,
      lastSeenAt: now,
    });
    await db
      .doc(`users/${uid}/credits/signup`)
      .set({ delta: credits, reason: 'signup', balanceAfter: credits, at: now });
    return uid;
  }

  const balanceOf = async (uid: string): Promise<number> =>
    UserDocSchema.parse((await db.doc(`users/${uid}`).get()).data()).credits;

  async function ledgerOf(uid: string) {
    const snap = await db.collection(`users/${uid}/credits`).get();
    return snap.docs.map((d) => ({ id: d.id, ...CreditTxSchema.parse(d.data()) }));
  }

  async function dayDoc(uid: string, day: string) {
    const snap = await db.doc(`users/${uid}/limits/${day}`).get();
    return snap.exists ? DailyLimitsSchema.parse(snap.data()) : null;
  }

  async function renderDoc(renderId: string) {
    const snap = await db.doc(`renders/${renderId}`).get();
    return snap.exists ? RenderDocSchema.parse(snap.data()) : null;
  }

  /**
   * R1.5, R1.7 and spec 08 R2.9 on stored data: the balance is the sum of the ledger, nothing is
   * negative, and each spend has at most one matching refund of the same amount (`s-`/`r-` and
   * `export-`/`refund-` ids).
   */
  async function expectExact(uid: string): Promise<void> {
    const balance = await balanceOf(uid);
    const entries = await ledgerOf(uid);
    expect(balance).toBeGreaterThanOrEqual(0);
    expect(entries.reduce((s, e) => s + e.delta, 0)).toBe(balance);
    for (const e of entries) expect(e.balanceAfter).toBeGreaterThanOrEqual(0);
    const byId = new Map(entries.map((e) => [e.id, e]));
    for (const e of entries) {
      if (e.reason !== 'refund') continue;
      const spendId = e.id.startsWith('r-')
        ? `s-${e.id.slice(2)}`
        : `export-${e.id.slice('refund-'.length)}`;
      const spend = byId.get(spendId);
      expect(spend, `${e.id} has a spend`).toBeDefined();
      expect(e.delta).toBe(-(spend?.delta ?? 0));
    }
  }

  return { seed, balanceOf, ledgerOf, dayDoc, renderDoc, expectExact };
}

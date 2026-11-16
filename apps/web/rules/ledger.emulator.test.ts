// The credit ledger on the Firestore emulator (spec 13 task 5; properties C1–C6). The functions
// under test are the shared helper of `@motionpop/render/store`, called with the Admin SDK exactly
// as the routes and spec 08's export transaction call them.
import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LedgerError,
  MAX_REFUND_AGE_MS,
  aiSpec,
  decideSpendFrom,
  exportSpec,
  readLedger,
  refundCredits,
  spendCredits,
  writeSpend,
  type LedgerConfig,
  type SpendSpec,
} from '@motionpop/render/store';
import {
  CreditTxSchema,
  DailyLimitsSchema,
  UserDocSchema,
  type Plan,
  type RefundResponse,
  type SpendResponse,
} from '@motionpop/schemas';
import { PROJECT_ID } from './helpers';

const APP_NAME = 'ledger-emulator-test';
const TIMEOUT = 180_000;
const CFG: LedgerConfig = {
  killSwitch: false,
  rateLimitCloudPerHour: 30,
  refundsPerDay: 30,
  judgeCredits: 500,
};

let app: App;
let db: Firestore;

beforeAll(() => {
  if (!process.env['FIRESTORE_EMULATOR_HOST']) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set; run via `pnpm test:rules`.');
  }
  app =
    getApps().find((a) => a.name === APP_NAME) ??
    initializeApp({ projectId: PROJECT_ID }, APP_NAME);
  db = getFirestore(app);
});

afterAll(async () => {
  await db.terminate();
});

const newUid = () => `led-${randomUUID()}`;
const newKey = () => randomUUID().replaceAll('-', '');

/** A bootstrapped user: the user doc and the `signup` ledger entry, as `bootstrapUser` writes them. */
async function seed(credits: number, plan: Plan = 'free'): Promise<string> {
  const uid = newUid();
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

const balanceOf = async (uid: string) =>
  UserDocSchema.parse((await db.doc(`users/${uid}`).get()).data()).credits;

async function ledgerOf(uid: string) {
  const snap = await db.collection(`users/${uid}/credits`).get();
  return snap.docs.map((d) => ({ id: d.id, ...CreditTxSchema.parse(d.data()) }));
}

async function dayDoc(uid: string, day: string) {
  const snap = await db.doc(`users/${uid}/limits/${day}`).get();
  return snap.exists ? DailyLimitsSchema.parse(snap.data()) : null;
}

/** R1.5 and R1.7 on stored data: the balance is the sum of the ledger, nothing is negative, and each spend has at most one matching refund. */
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

const spec = (uid: string, key: string, cost = 3, extra: Partial<SpendSpec> = {}): SpendSpec => ({
  ...aiSpec(uid, key),
  reason: 'generate',
  refId: 'slot-1',
  cost,
  ...extra,
});

const spend = (uid: string, key: string, cost = 3, cfg = CFG, nowMs = Date.now()) =>
  spendCredits(db, spec(uid, key, cost), cfg, nowMs);

const refund = (uid: string, key: string, cfg = CFG, nowMs = Date.now()) =>
  refundCredits(db, uid, `s-${key}`, cfg, nowMs);

/** What spec 08's `startExport` does for the money: the helper's pieces in its own transaction. */
function exportSpend(uid: string, renderId: string, cost: number, cfg = CFG, nowMs = Date.now()) {
  const s: SpendSpec = { ...exportSpec(uid, renderId), reason: 'export', refId: renderId, cost };
  return db.runTransaction(async (t) => {
    const reads = await readLedger(t, db, s, nowMs);
    const d = decideSpendFrom(s, reads, cfg);
    writeSpend(t, s, d, reads);
    return d;
  });
}

const ok = (r: SpendResponse | RefundResponse): boolean => r.ok;

describe('C2: exactly enough concurrent spends succeed', () => {
  it(
    'N concurrent spends of cost c from balance b: min(N, floor(b / c)) succeed',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 12 }),
          fc.integer({ min: 0, max: 30 }),
          fc.integer({ min: 1, max: 5 }),
          async (n, b, c) => {
            const uid = await seed(b);
            const answers = await Promise.all(
              Array.from({ length: n }, () => spend(uid, newKey(), c)),
            );
            const succeeded = answers.filter(ok).length;
            expect(succeeded).toBe(Math.min(n, Math.floor(b / c)));
            for (const a of answers.filter((x) => !x.ok)) {
              expect(a).toMatchObject({ ok: false, reason: 'insufficient' });
            }
            expect(await balanceOf(uid)).toBe(b - succeeded * c);
            await expectExact(uid);
          },
        ),
        { numRuns: 8 },
      );
    },
    TIMEOUT,
  );

  it('two tabs spending the last credits: one wins', async () => {
    const uid = await seed(3);
    const [a, b] = await Promise.all([spend(uid, newKey()), spend(uid, newKey())]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(await balanceOf(uid)).toBe(0);
  });
});

describe('C1: never negative, balance equals the ledger, under random concurrent mixes', () => {
  type Op =
    | { t: 'spend'; key: number; cost: number }
    | { t: 'refund'; key: number }
    | { t: 'export'; id: number; cost: number };

  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.record({
      t: fc.constant('spend' as const),
      key: fc.nat(5),
      cost: fc.integer({ min: 1, max: 6 }),
    }),
    fc.record({ t: fc.constant('refund' as const), key: fc.nat(5) }),
    fc.record({
      t: fc.constant('export' as const),
      id: fc.nat(2),
      cost: fc.integer({ min: 3, max: 6 }),
    }),
  );

  it(
    'any concurrent mix of spends, replays, refunds and exports leaves an exact ledger',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 25 }),
          fc.array(opArb, { minLength: 4, maxLength: 14 }),
          async (grant, ops) => {
            const uid = await seed(grant);
            const run = salt();
            const results = await Promise.all(
              ops.map((op) => {
                if (op.t === 'spend') return spend(uid, `k${op.key}${run}`, op.cost);
                if (op.t === 'refund') return refund(uid, `k${op.key}${run}`);
                return exportSpend(uid, `r${op.id}${run}`, op.cost);
              }),
            );
            expect(results).toHaveLength(ops.length);
            await expectExact(uid);
            // A key charged once is charged at most once, however many replays raced it.
            const entries = await ledgerOf(uid);
            const spends = entries.filter((e) => e.id.startsWith('s-'));
            expect(new Set(spends.map((e) => e.id)).size).toBe(spends.length);
          },
        ),
        { numRuns: 25 },
      );
    },
    TIMEOUT,
  );
});

const salt = () => newKey().slice(0, 8);

describe('C3: a spend is idempotent by key', () => {
  it('the same key sent N times at once charges once and every answer is the same', async () => {
    const uid = await seed(20);
    const key = newKey();
    const answers = await Promise.all(Array.from({ length: 8 }, () => spend(uid, key)));
    expect(answers.every(ok)).toBe(true);
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(answers[0]).toMatchObject({ ok: true, txId: `s-${key}`, balance: 17, cost: 3 });
    expect(await balanceOf(uid)).toBe(17);
    expect((await ledgerOf(uid)).filter((e) => e.id === `s-${key}`)).toHaveLength(1);
  });

  it('a replay is answered even when the balance is now too low', async () => {
    const uid = await seed(3);
    const key = newKey();
    expect(await spend(uid, key)).toMatchObject({ ok: true, balance: 0 });
    expect(await spend(uid, key)).toMatchObject({ ok: true, balance: 0, cost: 3 });
    expect(await balanceOf(uid)).toBe(0);
  });

  it('spend, refund, spend with the same key answers key-used and charges nothing', async () => {
    const uid = await seed(10);
    const key = newKey();
    expect(await spend(uid, key)).toMatchObject({ ok: true, balance: 7 });
    expect(await refund(uid, key)).toEqual({ ok: true, balance: 10, alreadyRefunded: false });
    for (let k = 0; k < 3; k++) {
      expect(await spend(uid, key)).toEqual({ ok: false, reason: 'key-used', balance: 10 });
    }
    expect(await balanceOf(uid)).toBe(10);
    await expectExact(uid);
  });

  it('key-used also holds when the spend and the refund race', async () => {
    const uid = await seed(30);
    const key = newKey();
    await spend(uid, key);
    const answers = await Promise.all([
      refund(uid, key),
      spend(uid, key),
      refund(uid, key),
      spend(uid, key),
    ]);
    const spendAnswers = [answers[1], answers[3]] as SpendResponse[];
    const balance = await balanceOf(uid);
    // The refund committed once; spends before it were replays, after it key-used. Never a new charge.
    for (const a of spendAnswers) {
      expect(a.ok ? a.cost : 0).toBeLessThanOrEqual(3);
    }
    expect(balance).toBe(30);
    expect((await ledgerOf(uid)).filter((e) => e.id === `s-${key}`)).toHaveLength(1);
    await expectExact(uid);
  });
});

describe('C4: a spend is refunded at most once', () => {
  it('N concurrent refund requests return the credits once', async () => {
    const uid = await seed(10);
    const key = newKey();
    await spend(uid, key, 4);
    const answers = (await Promise.all(
      Array.from({ length: 6 }, () => refund(uid, key)),
    )) as Extract<RefundResponse, { ok: true }>[];
    expect(answers.every((a) => a.ok)).toBe(true);
    expect(answers.filter((a) => !a.alreadyRefunded)).toHaveLength(1);
    expect(await balanceOf(uid)).toBe(10);
    expect((await ledgerOf(uid)).filter((e) => e.id === `r-${key}`)).toHaveLength(1);
    await expectExact(uid);
  });

  it('the refund entry points at the spend', async () => {
    const uid = await seed(10);
    const key = newKey();
    await spend(uid, key);
    await refund(uid, key);
    const r = (await ledgerOf(uid)).find((e) => e.id === `r-${key}`);
    expect(r).toMatchObject({ delta: 3, reason: 'refund', refId: `s-${key}`, balanceAfter: 10 });
  });

  it('refuses an unknown spend, a grant, a refund and an export entry', async () => {
    const uid = await seed(10);
    expect(await refundCredits(db, uid, 's-doesnotexist1', CFG, Date.now())).toEqual({
      ok: false,
      reason: 'not-found',
    });
    // An export entry can't be reached with an s- id, and the client route can't send any other id.
    const renderId = `r${salt()}`;
    await exportSpend(uid, renderId, 5);
    expect(await refundCredits(db, uid, `export-${renderId}`, CFG, Date.now())).toEqual({
      ok: false,
      reason: 'not-refundable',
    });
    expect(await refundCredits(db, uid, 'signup', CFG, Date.now())).toEqual({
      ok: false,
      reason: 'not-refundable',
    });
    expect(await balanceOf(uid)).toBe(5);
  });

  it("another user's spend is not found", async () => {
    const owner = await seed(10);
    const other = await seed(10);
    const key = newKey();
    await spend(owner, key);
    expect(await refund(other, key)).toEqual({ ok: false, reason: 'not-found' });
    expect(await balanceOf(owner)).toBe(7);
    expect(await balanceOf(other)).toBe(10);
  });

  it('refuses after 15 minutes and past the daily cap, and counts only paid client refunds', async () => {
    const uid = await seed(30);
    const keys = [newKey(), newKey(), newKey(), newKey()];
    for (const k of keys) await spend(uid, k, 1);
    const now = Date.now();
    expect(await refund(uid, keys[0]!, CFG, now + MAX_REFUND_AGE_MS + 60_000)).toEqual({
      ok: false,
      reason: 'too-old',
    });
    const cfg = { ...CFG, refundsPerDay: 2 };
    expect(ok(await refund(uid, keys[1]!, cfg, now))).toBe(true);
    expect(ok(await refund(uid, keys[2]!, cfg, now))).toBe(true);
    expect(await refund(uid, keys[3]!, cfg, now)).toEqual({ ok: false, reason: 'limit' });
    // A repeat of an already paid refund is a replay and doesn't hit the cap.
    expect(await refund(uid, keys[1]!, cfg, now)).toMatchObject({
      ok: true,
      alreadyRefunded: true,
    });
    expect((await dayDoc(uid, new Date(now).toISOString().slice(0, 10)))?.refunds).toBe(2);
    await expectExact(uid);
  });
});

describe('C5: the hourly rate limit and exports', () => {
  const HOUR = Date.UTC(2026, 10, 16, 10, 5);

  it('the 31st AI spend in an hour is refused, the next hour starts again', async () => {
    const uid = await seed(100);
    for (let k = 0; k < 30; k++) {
      expect(ok(await spend(uid, newKey(), 1, CFG, HOUR + k))).toBe(true);
    }
    expect(await spend(uid, newKey(), 1, CFG, HOUR + 31)).toEqual({
      ok: false,
      reason: 'rate-limit',
      balance: 70,
    });
    expect(await balanceOf(uid)).toBe(70);
    expect(ok(await spend(uid, newKey(), 1, CFG, HOUR + 3600_000))).toBe(true);
    const day = await dayDoc(uid, '2026-11-16');
    expect(day?.aiByHour['10']).toBe(30);
    expect(day?.aiByHour['11']).toBe(1);
  });

  it(
    'concurrent spends never pass the cap',
    async () => {
      const uid = await seed(100);
      const cfg = { ...CFG, rateLimitCloudPerHour: 5 };
      const answers = await Promise.all(
        Array.from({ length: 10 }, () => spend(uid, newKey(), 1, cfg, HOUR)),
      );
      expect(answers.filter(ok)).toHaveLength(5);
      expect(answers.filter((a) => !a.ok && a.reason === 'rate-limit')).toHaveLength(5);
      expect((await dayDoc(uid, '2026-11-16'))?.aiByHour['10']).toBe(5);
    },
    TIMEOUT,
  );

  it('an export spend is not counted in the hour and is not refused by the AI cap', async () => {
    const uid = await seed(100);
    const cfg = { ...CFG, rateLimitCloudPerHour: 1 };
    expect(ok(await spend(uid, newKey(), 1, cfg, HOUR))).toBe(true);
    expect(await spend(uid, newKey(), 1, cfg, HOUR)).toMatchObject({ reason: 'rate-limit' });
    const d = await exportSpend(uid, `r${salt()}`, 5, cfg, HOUR);
    expect(d.kind).toBe('charge');
    expect((await dayDoc(uid, '2026-11-16'))?.aiByHour['10']).toBe(1);
    expect(await balanceOf(uid)).toBe(94);
  });
});

describe('R3.2: the kill switch', () => {
  const paused = { ...CFG, killSwitch: true };

  it('refuses AI spends as paused and writes nothing', async () => {
    const uid = await seed(10);
    expect(await spend(uid, newKey(), 3, paused)).toEqual({
      ok: false,
      reason: 'paused',
      balance: 10,
    });
    expect(await ledgerOf(uid)).toHaveLength(1);
    expect(await dayDoc(uid, new Date().toISOString().slice(0, 10))).toBeNull();
  });

  it('refuses an export start, which spec 08 reports as disabled', async () => {
    const uid = await seed(10);
    const d = await exportSpend(uid, `r${salt()}`, 5, paused);
    expect(d).toEqual({ kind: 'refuse', reason: 'paused', balance: 10 });
    expect(await balanceOf(uid)).toBe(10);
  });

  it('still answers a replay and a refund of work that was already paid for', async () => {
    const uid = await seed(10);
    const key = newKey();
    await spend(uid, key);
    expect(await spend(uid, key, 3, paused)).toMatchObject({ ok: true, balance: 7 });
    expect(await refund(uid, key, paused)).toMatchObject({ ok: true, balance: 10 });
  });
});

describe('C6: the judge top-up on a refused spend', () => {
  const JUDGE = { ...CFG, judgeCredits: 10 };
  const DAY1 = Date.UTC(2026, 10, 16, 9);
  const DAY2 = Date.UTC(2026, 10, 17, 9);

  it('tops an empty judge up once, goes through, and refuses a second empty spend the same UTC day', async () => {
    const uid = await seed(0, 'judge');
    expect(await spend(uid, newKey(), 3, JUDGE, DAY1)).toMatchObject({ ok: true, balance: 7 });
    expect(await spend(uid, newKey(), 3, JUDGE, DAY1 + 1000)).toMatchObject({
      ok: true,
      balance: 4,
    });
    expect(await spend(uid, newKey(), 3, JUDGE, DAY1 + 2000)).toMatchObject({
      ok: true,
      balance: 1,
    });
    expect(await spend(uid, newKey(), 3, JUDGE, DAY1 + 3000)).toEqual({
      ok: false,
      reason: 'insufficient',
      balance: 1,
    });
    const refills = (await ledgerOf(uid)).filter((e) => e.reason === 'judge-grant');
    expect(refills).toHaveLength(1);
    expect(refills[0]).toMatchObject({
      id: 'judge-refill-2026-11-16',
      delta: 10,
      refId: 'refill-2026-11-16',
      balanceAfter: 10,
    });
    // The next UTC day pays one more.
    expect(await spend(uid, newKey(), 3, JUDGE, DAY2)).toMatchObject({ ok: true, balance: 7 });
    expect((await ledgerOf(uid)).filter((e) => e.reason === 'judge-grant')).toHaveLength(2);
    await expectExact(uid);
  });

  it('concurrent empty spends by a judge pay the refill once', async () => {
    const uid = await seed(0, 'judge');
    const answers = await Promise.all(
      Array.from({ length: 6 }, () => spend(uid, newKey(), 3, JUDGE, DAY1)),
    );
    expect(answers.filter(ok)).toHaveLength(3);
    expect((await ledgerOf(uid)).filter((e) => e.reason === 'judge-grant')).toHaveLength(1);
    expect(await balanceOf(uid)).toBe(1);
    await expectExact(uid);
  });

  it('a free account is never topped up', async () => {
    const uid = await seed(0, 'free');
    expect(await spend(uid, newKey(), 3, JUDGE, DAY1)).toMatchObject({
      ok: false,
      reason: 'insufficient',
    });
    expect((await ledgerOf(uid)).filter((e) => e.reason === 'judge-grant')).toHaveLength(0);
  });

  it('tops a judge up inside an export start too', async () => {
    const uid = await seed(0, 'judge');
    const d = await exportSpend(uid, `r${salt()}`, 5, JUDGE, DAY1);
    expect(d).toMatchObject({ kind: 'charge', balanceAfter: 5, refill: { grant: 10 } });
    expect(await balanceOf(uid)).toBe(5);
    await expectExact(uid);
  });
});

describe('a user without a doc', () => {
  it('throws LedgerError so the route can answer 409', async () => {
    await expect(spend(newUid(), newKey())).rejects.toBeInstanceOf(LedgerError);
    await expect(refund(newUid(), newKey())).rejects.toBeInstanceOf(LedgerError);
  });
});

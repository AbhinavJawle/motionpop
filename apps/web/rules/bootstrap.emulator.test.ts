import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aiSpec, spendCredits } from '@motionpop/render/store';
import { APP_CONFIG_DEFAULTS } from '@motionpop/schemas';
import { bootstrapUser, type BootstrapResult } from '../lib/users/bootstrap.server';
import type { BootstrapProfile } from '../lib/users/bootstrap-plan';
import { PROJECT_ID } from './helpers';

const APP_NAME = 'bootstrap-emulator-test';
const JUDGE = 'judge@example.com';
const JUDGES: ReadonlySet<string> = new Set([JUDGE]);
const CONFIG = { freeCredits: 20, judgeCredits: 500 };
const RUNS = { numRuns: 15 };
const TIMEOUT = 180_000;

let app: App;
let db: Firestore;

beforeAll(() => {
  if (!process.env['FIRESTORE_EMULATOR_HOST']) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set; run via `pnpm test:rules`.');
  }
  // No credentials: the Admin SDK talks to the emulator without them.
  app =
    getApps().find((a) => a.name === APP_NAME) ??
    initializeApp({ projectId: PROJECT_ID }, APP_NAME);
  db = getFirestore(app);
});
afterAll(async () => {
  await db.terminate();
});

const profileArb: fc.Arbitrary<BootstrapProfile> = fc.record({
  email: fc.constantFrom<string | null>(null, 'free@example.com', JUDGE, 'JUDGE@Example.com'),
  emailVerified: fc.boolean(),
  displayName: fc.constantFrom<string | null>(null, 'Ada', '  '),
  photoURL: fc.constantFrom<string | null>(null, 'https://example.com/a.png'),
});

const FREE_PROFILE: BootstrapProfile = {
  email: 'free@example.com',
  emailVerified: true,
  displayName: 'Free',
  photoURL: null,
};
const JUDGE_PROFILE: BootstrapProfile = { ...FREE_PROFILE, email: JUDGE, displayName: 'Judge' };

const newUid = () => `bs-${randomUUID()}`;

async function readState(uid: string) {
  const userRef = db.collection('users').doc(uid);
  const [user, ledger] = await Promise.all([userRef.get(), userRef.collection('credits').get()]);
  return { user: user.data(), ledger: ledger.docs.map((d) => d.data()) };
}

describe('bootstrapUser (emulator)', () => {
  it('grants 20 credits by default and 500 to a verified allow-listed email', async () => {
    const free = await bootstrapUser(db, newUid(), FREE_PROFILE, JUDGES, APP_CONFIG_DEFAULTS);
    expect(free).toEqual({ created: true, plan: 'free', credits: 20 });
    const judge = await bootstrapUser(db, newUid(), JUDGE_PROFILE, JUDGES, APP_CONFIG_DEFAULTS);
    expect(judge).toEqual({ created: true, plan: 'judge', credits: 500 });
    const unverified = await bootstrapUser(
      db,
      newUid(),
      { ...JUDGE_PROFILE, emailVerified: false },
      JUDGES,
      APP_CONFIG_DEFAULTS,
    );
    expect(unverified.plan).toBe('free');
  });

  it(
    'concurrent calls create the user once with a single ledger entry',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 8 }), profileArb, async (n, profile) => {
          const uid = newUid();
          const results: BootstrapResult[] = await Promise.all(
            Array.from({ length: n }, () => bootstrapUser(db, uid, profile, JUDGES, CONFIG)),
          );
          expect(results.filter((r) => r.created)).toHaveLength(1);
          const first = results[0]!;
          for (const r of results) {
            expect(r.plan).toBe(first.plan);
            expect(r.credits).toBe(first.credits);
          }
          const { user, ledger } = await readState(uid);
          expect(user?.['credits']).toBe(first.credits);
          expect(user?.['plan']).toBe(first.plan);
          expect(ledger).toHaveLength(1);
          expect(ledger[0]?.['balanceAfter']).toBe(user?.['credits']);
        }),
        RUNS,
      );
    },
    TIMEOUT,
  );

  it(
    'sequential repeat calls change only lastSeenAt',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 5 }), profileArb, async (repeats, profile) => {
          const uid = newUid();
          const first = await bootstrapUser(db, uid, profile, JUDGES, CONFIG);
          expect(first.created).toBe(true);
          const before = await readState(uid);
          for (let i = 0; i < repeats; i++) {
            const again = await bootstrapUser(db, uid, profile, JUDGES, CONFIG);
            expect(again).toEqual({ created: false, plan: first.plan, credits: first.credits });
          }
          const after = await readState(uid);
          // Everything but lastSeenAt is unchanged.
          const withoutSeen = (u: Record<string, unknown> | undefined) =>
            Object.fromEntries(Object.entries(u ?? {}).filter(([k]) => k !== 'lastSeenAt'));
          expect(withoutSeen(after.user)).toEqual(withoutSeen(before.user));
          expect(after.ledger).toEqual(before.ledger);
        }),
        RUNS,
      );
    },
    TIMEOUT,
  );

  it(
    'an existing free account is upgraded once when it is later listed and verified (spec 13 R4.2)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(profileArb, { minLength: 1, maxLength: 4 }),
          async (laterProfiles) => {
            const uid = newUid();
            const first = await bootstrapUser(db, uid, FREE_PROFILE, JUDGES, CONFIG);
            expect(first).toEqual({ created: true, plan: 'free', credits: 20 });
            // Changed by spec 13: profiles that are not a verified listed email still change
            // nothing, and the first verified one upgrades the account exactly once.
            const unlisted = laterProfiles.filter(
              (p) => !(p.emailVerified && p.email?.toLowerCase() === JUDGE),
            );
            for (const p of unlisted) {
              const r = await bootstrapUser(db, uid, p, JUDGES, CONFIG);
              expect(r).toEqual({ created: false, plan: 'free', credits: 20 });
            }
            const up = await bootstrapUser(db, uid, JUDGE_PROFILE, JUDGES, CONFIG);
            expect(up).toEqual({ created: false, plan: 'judge', credits: 500 });
            const again = await bootstrapUser(db, uid, JUDGE_PROFILE, JUDGES, CONFIG);
            expect(again).toEqual({ created: false, plan: 'judge', credits: 500 });
            const { user, ledger } = await readState(uid);
            expect(user?.['plan']).toBe('judge');
            expect(user?.['credits']).toBe(500);
            expect(ledger.map((l) => l['reason']).sort()).toEqual(['judge-grant', 'signup']);
            const grant = ledger.find((l) => l['reason'] === 'judge-grant');
            expect(grant).toMatchObject({ delta: 480, refId: 'upgrade', balanceAfter: 500 });
          },
        ),
        RUNS,
      );
    },
    TIMEOUT,
  );

  it(
    'a verified Google-provider profile on the list gets the same upgrade (review F15)',
    async () => {
      const uid = newUid();
      await bootstrapUser(db, uid, FREE_PROFILE, JUDGES, CONFIG);
      // Google arrives verified, with a name and a photo; the server does not see the provider.
      const google: BootstrapProfile = {
        email: 'Judge@Example.com',
        emailVerified: true,
        displayName: 'Judge via Google',
        photoURL: 'https://example.com/g.png',
      };
      expect(await bootstrapUser(db, uid, google, JUDGES, CONFIG)).toEqual({
        created: false,
        plan: 'judge',
        credits: 500,
      });
    },
    TIMEOUT,
  );

  it(
    'a judge below 20 % is refilled once per UTC day; a later empty spend the same day gets no second refill',
    async () => {
      const uid = newUid();
      const day1 = Date.UTC(2026, 10, 20, 9, 0, 0);
      await bootstrapUser(db, uid, JUDGE_PROFILE, JUDGES, CONFIG, day1);
      await db.doc(`users/${uid}`).update({ credits: 40 });
      const refill = await bootstrapUser(db, uid, JUDGE_PROFILE, JUDGES, CONFIG, day1 + 1000);
      expect(refill).toEqual({ created: false, plan: 'judge', credits: 500 });
      // Same day, low again: no second refill from sign-in.
      await db.doc(`users/${uid}`).update({ credits: 3 });
      const same = await bootstrapUser(db, uid, JUDGE_PROFILE, JUDGES, CONFIG, day1 + 2000);
      expect(same).toEqual({ created: false, plan: 'judge', credits: 3 });
      // Next UTC day: refilled again, with its own ledger id.
      const next = await bootstrapUser(db, uid, JUDGE_PROFILE, JUDGES, CONFIG, day1 + 86_400_000);
      expect(next).toEqual({ created: false, plan: 'judge', credits: 500 });
      const ids = (await db.collection(`users/${uid}/credits`).get()).docs.map((d) => d.id).sort();
      expect(ids).toEqual(['judge-refill-2026-11-20', 'judge-refill-2026-11-21', 'signup']);
    },
    TIMEOUT,
  );

  it(
    'a refill at sign-in is shared with the spend-time refill: an empty spend the same day gets none',
    async () => {
      const uid = newUid();
      const now = Date.UTC(2026, 10, 20, 9, 0, 0);
      await bootstrapUser(db, uid, JUDGE_PROFILE, JUDGES, CONFIG, now);
      await db.doc(`users/${uid}`).update({ credits: 0 });
      await bootstrapUser(db, uid, JUDGE_PROFILE, JUDGES, CONFIG, now + 1000);
      expect((await db.doc(`users/${uid}`).get()).data()?.['credits']).toBe(500);
      // Drain to 0 and spend the same day: the refill entry exists, so the spend is refused.
      await db.doc(`users/${uid}`).update({ credits: 0 });
      const res = await spendCredits(
        db,
        { ...aiSpec(uid, 'bootstrapkey0001'), reason: 'generate', refId: 'x', cost: 3 },
        { killSwitch: false, rateLimitCloudPerHour: 30, refundsPerDay: 30, judgeCredits: 500 },
        now + 2000,
      );
      expect(res).toMatchObject({ ok: false, reason: 'insufficient' });
    },
    TIMEOUT,
  );

  it(
    'concurrent sign-ins upgrade a free account once',
    async () => {
      const uid = newUid();
      await bootstrapUser(db, uid, FREE_PROFILE, JUDGES, CONFIG);
      const results = await Promise.all(
        Array.from({ length: 6 }, () => bootstrapUser(db, uid, JUDGE_PROFILE, JUDGES, CONFIG)),
      );
      for (const r of results) expect(r).toEqual({ created: false, plan: 'judge', credits: 500 });
      const { user, ledger } = await readState(uid);
      expect(user?.['credits']).toBe(500);
      expect(ledger.filter((l) => l['reason'] === 'judge-grant')).toHaveLength(1);
    },
    TIMEOUT,
  );
});

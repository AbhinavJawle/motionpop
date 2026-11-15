import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    'a later judge claim never upgrades an existing free user',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(profileArb, { minLength: 1, maxLength: 4 }),
          async (laterProfiles) => {
            const uid = newUid();
            const first = await bootstrapUser(db, uid, FREE_PROFILE, JUDGES, CONFIG);
            expect(first).toEqual({ created: true, plan: 'free', credits: 20 });
            // The explicit verified judge claim is always included.
            for (const p of [...laterProfiles, JUDGE_PROFILE]) {
              const r = await bootstrapUser(db, uid, p, JUDGES, CONFIG);
              expect(r).toEqual({ created: false, plan: 'free', credits: 20 });
            }
            const { user, ledger } = await readState(uid);
            expect(user?.['plan']).toBe('free');
            expect(user?.['credits']).toBe(20);
            expect(ledger).toHaveLength(1);
            expect(ledger[0]?.['reason']).toBe('signup');
          },
        ),
        RUNS,
      );
    },
    TIMEOUT,
  );
});

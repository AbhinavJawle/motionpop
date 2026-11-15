import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DailyLimitsSchema } from '@motionpop/schemas';
import type { AllowanceDecision } from '../lib/ai/plan-allowance-logic';
import { takePlanAllowance } from '../lib/ai/plan-allowance.server';
import { PROJECT_ID } from './helpers';

const APP_NAME = 'plan-allowance-emulator-test';
const RUNS = { numRuns: 10 };
const TIMEOUT = 180_000;
const NOON = Date.UTC(2026, 10, 15, 12);

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

const newUid = () => `pa-${randomUUID()}`;

async function stored(uid: string, day: string): Promise<number | undefined> {
  const snap = await db.doc(`users/${uid}/limits/${day}`).get();
  return snap.exists ? DailyLimitsSchema.parse(snap.data()).planCloud : undefined;
}

describe('takePlanAllowance (emulator)', () => {
  it('counts up to the limit, then denies without writing', async () => {
    const uid = newUid();
    const answers: AllowanceDecision[] = [];
    for (let k = 0; k < 4; k++) answers.push(await takePlanAllowance(db, uid, 3, NOON));
    expect(answers).toEqual([
      { allowed: true, used: 1, limit: 3 },
      { allowed: true, used: 2, limit: 3 },
      { allowed: true, used: 3, limit: 3 },
      { allowed: false, reason: 'limit', used: 3, limit: 3 },
    ]);
    const snap = await db.doc(`users/${uid}/limits/2026-11-15`).get();
    const doc = DailyLimitsSchema.parse(snap.data());
    expect(doc.planCloud).toBe(3);
    expect(doc.schemaVersion).toBe(1);
  });

  it('a limit of 0 never creates the day doc', async () => {
    const uid = newUid();
    expect(await takePlanAllowance(db, uid, 0, NOON)).toEqual({
      allowed: false,
      reason: 'limit',
      used: 0,
      limit: 0,
    });
    expect(await stored(uid, '2026-11-15')).toBeUndefined();
  });

  it('a new UTC day starts a new count', async () => {
    const uid = newUid();
    const lastMs = Date.UTC(2026, 10, 15, 23, 59, 59, 999);
    expect((await takePlanAllowance(db, uid, 1, lastMs)).allowed).toBe(true);
    expect((await takePlanAllowance(db, uid, 1, lastMs)).allowed).toBe(false);
    expect((await takePlanAllowance(db, uid, 1, lastMs + 1)).allowed).toBe(true);
    expect(await stored(uid, '2026-11-15')).toBe(1);
    expect(await stored(uid, '2026-11-16')).toBe(1);
  });

  it(
    'property: concurrent calls allow exactly min(n, limit) and the count never passes the limit',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 0, max: 6 }),
          async (n, limit) => {
            const uid = newUid();
            const answers = await Promise.all(
              Array.from({ length: n }, () => takePlanAllowance(db, uid, limit, NOON)),
            );
            const allowed = answers.filter((a) => a.allowed);
            expect(allowed).toHaveLength(Math.min(n, limit));
            // Each allowed call took a distinct slot 1..k.
            expect(allowed.map((a) => a.used).sort((a, b) => a - b)).toEqual(
              Array.from({ length: allowed.length }, (_, k) => k + 1),
            );
            for (const a of answers) expect(a.used).toBeLessThanOrEqual(limit);
            expect(await stored(uid, '2026-11-15')).toBe(
              allowed.length > 0 ? allowed.length : undefined,
            );
          },
        ),
        RUNS,
      );
    },
    TIMEOUT,
  );
});

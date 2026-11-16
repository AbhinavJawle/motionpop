// `writeUsage` on the Firestore emulator (spec 13 task 10; R7.1, R7.5). The counters Settings
// reads must always equal the stored event documents.
import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DailyLimitsSchema,
  UsageBatchSchema,
  UsageEventDocSchema,
  type UsageEventIn,
} from '@motionpop/schemas';
import { parseJsonBody } from '../lib/credits/parse-body.server';
import { addToCounters } from '../lib/usage/usage-logic';
import { writeUsage } from '../lib/usage/usage.server';
import { PROJECT_ID } from './helpers';

const APP_NAME = 'usage-emulator-test';
const TIMEOUT = 180_000;
const CAP = { usageEventsPerDay: 1000 };
const T0 = Date.UTC(2026, 10, 20, 10, 0, 0);
const DAY = '2026-11-20';

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

const newUid = () => `use-${randomUUID()}`;
const newId = () => randomUUID().replaceAll('-', '').slice(0, 20);
const ev = (o: Partial<UsageEventIn> = {}): UsageEventIn => ({
  id: newId(),
  task: 'edit.patch',
  ranOn: 'device',
  model: 'nano',
  credits: 0,
  cloudCost: 1,
  latencyMs: 300,
  ok: true,
  clientAt: 1,
  ...o,
});
const batch = (events: UsageEventIn[]) => UsageBatchSchema.parse({ events });

async function stored(uid: string) {
  const snap = await db.collection(`users/${uid}/usage`).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}
async function day(uid: string, d = DAY) {
  const snap = await db.doc(`users/${uid}/limits/${d}`).get();
  return snap.exists ? DailyLimitsSchema.parse(snap.data()) : null;
}

describe('writeUsage (emulator)', () => {
  it(
    'stores events with a server time and schema version, and updates the day counters',
    async () => {
      const uid = newUid();
      const events = [
        ev({ latencyMs: 90, cloudCost: 1 }),
        ev({ latencyMs: 700, cloudCost: 3 }),
        ev({ ranOn: 'cloud', model: 'flash', latencyMs: 2500, cloudCost: 3, credits: 3 }),
        ev({ ok: false, attempts: 2, problems: ['bad json'] }),
      ];
      expect(await writeUsage(db, uid, batch(events), CAP, T0)).toEqual({ written: 4, dropped: 0 });
      const docs = await stored(uid);
      expect(docs).toHaveLength(4);
      for (const d of docs) {
        const parsed = UsageEventDocSchema.parse(d.data);
        expect(parsed.schemaVersion).toBe(1);
        expect(events.find((e) => e.id === d.id)).toBeDefined();
      }
      const limits = await day(uid);
      expect(limits?.usageEvents).toBe(4);
      // The failed event is stored but not counted.
      expect(limits?.usage).toEqual(addToCounters(null, events));
      expect(limits?.usage.device).toBe(2);
      expect(limits?.usage.cloud).toBe(1);
      expect(limits?.usage.saved).toBe(4);
    },
    TIMEOUT,
  );

  it(
    'writes a duplicate id once and counts it once, across batches and within one',
    async () => {
      const uid = newUid();
      const e = ev();
      expect(await writeUsage(db, uid, batch([e, e]), CAP, T0)).toEqual({ written: 1, dropped: 1 });
      expect(await writeUsage(db, uid, batch([e, ev()]), CAP, T0 + 1000)).toEqual({
        written: 1,
        dropped: 1,
      });
      expect(await stored(uid)).toHaveLength(2);
      expect((await day(uid))?.usageEvents).toBe(2);
      expect((await day(uid))?.usage.device).toBe(2);
    },
    TIMEOUT,
  );

  it(
    'the same batch sent twice at once is written and counted once',
    async () => {
      const uid = newUid();
      const b = batch(Array.from({ length: 10 }, () => ev()));
      const results = await Promise.all([1, 2, 3, 4].map(() => writeUsage(db, uid, b, CAP, T0)));
      expect(results.reduce((n, r) => n + r.written, 0)).toBe(10);
      expect(await stored(uid)).toHaveLength(10);
      expect((await day(uid))?.usageEvents).toBe(10);
      expect((await day(uid))?.usage.device).toBe(10);
    },
    TIMEOUT,
  );

  it(
    'stops at usageEventsPerDay for the UTC day and starts again the next day',
    async () => {
      const uid = newUid();
      const cap = { usageEventsPerDay: 5 };
      expect(
        await writeUsage(db, uid, batch(Array.from({ length: 8 }, () => ev())), cap, T0),
      ).toEqual({
        written: 5,
        dropped: 3,
      });
      expect(await writeUsage(db, uid, batch([ev()]), cap, T0 + 60_000)).toEqual({
        written: 0,
        dropped: 1,
      });
      expect(await stored(uid)).toHaveLength(5);
      expect((await day(uid))?.usageEvents).toBe(5);
      expect(await writeUsage(db, uid, batch([ev()]), cap, T0 + 86_400_000)).toEqual({
        written: 1,
        dropped: 0,
      });
      expect((await day(uid, '2026-11-21'))?.usageEvents).toBe(1);
    },
    TIMEOUT,
  );

  it(
    'a user with no limits doc and an empty write leaves nothing behind',
    async () => {
      const uid = newUid();
      const cap = { usageEventsPerDay: 0 };
      expect(await writeUsage(db, uid, batch([ev()]), cap, T0)).toEqual({ written: 0, dropped: 1 });
      expect(await stored(uid)).toHaveLength(0);
      expect(await day(uid)).toBeNull();
    },
    TIMEOUT,
  );

  it(
    'leaves the other counters of the day doc alone (plan allowance, AI hours, refunds)',
    async () => {
      const uid = newUid();
      await db.doc(`users/${uid}/limits/${DAY}`).set({
        schemaVersion: 1,
        planCloud: 2,
        aiByHour: { '10': 4 },
        refunds: 1,
        updatedAt: new Date(),
      });
      await writeUsage(db, uid, batch([ev()]), CAP, T0);
      const limits = await day(uid);
      expect(limits).toMatchObject({
        planCloud: 2,
        aiByHour: { '10': 4 },
        refunds: 1,
        usageEvents: 1,
      });
      expect(limits?.usage.device).toBe(1);
    },
    TIMEOUT,
  );

  it(
    'property: after any sequence of batches (with repeats and a small cap) the counters equal the stored events',
    async () => {
      const arb = fc.record({
        ranOn: fc.constantFrom<'device' | 'cloud'>('device', 'cloud'),
        ok: fc.boolean(),
        latencyMs: fc.integer({ min: 0, max: 130_000 }),
        cloudCost: fc.integer({ min: 0, max: 4 }),
        /** Index into a small pool of ids, so batches collide. */
        pool: fc.integer({ min: 0, max: 14 }),
      });
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.array(arb, { minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 5 }),
          fc.integer({ min: 3, max: 30 }),
          async (batches, capN) => {
            const uid = newUid();
            const ids = Array.from({ length: 15 }, newId);
            for (const [i, b] of batches.entries()) {
              const events = b.map((x) =>
                ev({
                  id: ids[x.pool] ?? newId(),
                  ranOn: x.ranOn,
                  ok: x.ok,
                  latencyMs: x.latencyMs,
                  cloudCost: x.cloudCost,
                }),
              );
              await writeUsage(db, uid, batch(events), { usageEventsPerDay: capN }, T0 + i);
            }
            const docs = await stored(uid);
            const limits = await day(uid);
            expect(docs.length).toBeLessThanOrEqual(capN);
            expect(limits?.usageEvents ?? 0).toBe(docs.length);
            const asEvents = docs.map((d) =>
              ev({ id: d.id, ...(UsageEventDocSchema.parse(d.data) as Partial<UsageEventIn>) }),
            );
            expect(limits?.usage ?? addToCounters(null, [])).toEqual(addToCounters(null, asEvents));
          },
        ),
        { numRuns: 12 },
      );
    },
    TIMEOUT,
  );
});

describe('POST /api/usage body validation (400s)', () => {
  const req = (body: unknown) =>
    new Request('http://x/api/usage', { method: 'POST', body: JSON.stringify(body) });
  const status = async (body: unknown) => {
    try {
      await parseJsonBody(req(body), UsageBatchSchema);
      return 200;
    } catch (e) {
      return (e as { status?: number }).status ?? 500;
    }
  };

  it('accepts a good batch and rejects the bad ones with 400', async () => {
    expect(await status({ events: [ev()] })).toBe(200);
    expect(await status({ events: [] })).toBe(400);
    expect(await status({ events: Array.from({ length: 51 }, () => ev()) })).toBe(400);
    expect(await status({ events: [{ ...ev(), id: 'short' }] })).toBe(400);
    expect(await status({ events: [{ ...ev(), ranOn: 'moon' }] })).toBe(400);
    expect(await status({ events: [{ ...ev(), latencyMs: -1 }] })).toBe(400);
    expect(await status({ events: [{ ...ev(), credits: 51 }] })).toBe(400);
    expect(await status({ nope: true })).toBe(400);
    const bad = new Request('http://x/api/usage', { method: 'POST', body: 'not json' });
    await expect(parseJsonBody(bad, UsageBatchSchema)).rejects.toMatchObject({ status: 400 });
  });
});

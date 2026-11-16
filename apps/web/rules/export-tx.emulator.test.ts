// The export transaction under concurrency on the Firestore emulator (spec 08 task 10): the
// correctness properties P1, P2, P3 and P5 of design §19 over random concurrent sequences of start,
// fail, sweep and done for 1–3 users, plus the plan-allowance ordering of review F1.
// `render-store.emulator.test.ts` covers the single-call behaviour (replay, daily limit, active
// render, sweep clock); this file is about interleavings.
import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FirestoreRenderStore,
  QUEUED_STALL_MS,
  failRender,
  renderIdFor,
  startExport,
  sweepIfStalled,
  type ExportConfig,
  type NewRender,
} from '@motionpop/render/store';
import { DailyLimitsSchema, renderPaths } from '@motionpop/schemas';
import { takePlanAllowance } from '../lib/ai/plan-allowance.server';
import { PROJECT_ID } from './helpers';
import { ledgerTools } from './ledger-tools';

const APP_NAME = 'export-tx-emulator-test';
const TIMEOUT = 300_000;
const CFG: ExportConfig = {
  exportsEnabled: true,
  killSwitch: false,
  rendersPerUserPerDay: 100,
  judgeCredits: 500,
};
/** A fixed instant, so every call of one test lands on the same UTC day doc. */
const NOON = Date.UTC(2026, 10, 16, 12);
const DAY = '2026-11-16';

let app: App;
let db: Firestore;
let tools: ReturnType<typeof ledgerTools>;

beforeAll(() => {
  if (!process.env['FIRESTORE_EMULATOR_HOST']) {
    throw new Error('FIRESTORE_EMULATOR_HOST is not set; run via `pnpm test:rules`.');
  }
  app =
    getApps().find((a) => a.name === APP_NAME) ??
    initializeApp({ projectId: PROJECT_ID }, APP_NAME);
  db = getFirestore(app);
  tools = ledgerTools(db);
});

afterAll(async () => {
  await db.terminate();
});

function request(uid: string, requestId: string): { renderId: string; render: NewRender } {
  const renderId = renderIdFor(uid, requestId);
  return {
    renderId,
    render: {
      ownerId: uid,
      projectId: 'proj-1',
      requestId,
      title: 'Export tx',
      format: '16:9',
      resolution: '1080p',
      captions: false,
      music: false,
      durationMs: 18_000,
      slotCount: 2,
      mode: 'emulator',
      inputPath: renderPaths(uid, 'proj-1', renderId).input,
      voicePath: `users/${uid}/audio/proj-1/voice-0123456789abcdef.wav`,
    },
  };
}

const requestId = (run: string, n: number) =>
  `00000000-0000-4000-8000-${run}${String(n).padStart(4, '0')}`;
const runSalt = () => randomUUID().replaceAll('-', '').slice(0, 8);

/** After a sequence: the ledger is exact (P3) and each render is refunded iff it failed (P2). */
async function expectLedgerAndRenders(uid: string, renderIds: string[], cost: number) {
  const t = tools;
  await t.expectExact(uid);
  const ledger = await t.ledgerOf(uid);
  for (const renderId of renderIds) {
    const doc = await t.renderDoc(renderId);
    const spends = ledger.filter((e) => e.id === `export-${renderId}`);
    const refunds = ledger.filter((e) => e.id === `refund-${renderId}`);
    if (!doc) {
      expect(spends).toHaveLength(0);
      expect(refunds).toHaveLength(0);
      continue;
    }
    // A free export (cost 0) writes no ledger entry.
    expect(spends, `${renderId} spend`).toHaveLength(cost > 0 ? 1 : 0);
    expect(refunds.length, `${renderId} refund (${doc.status})`).toBe(
      doc.status === 'error' && cost > 0 ? 1 : 0,
    );
    // Final render docs are consistent with their status.
    if (doc.status === 'done') expect(doc.progress).toBe(100);
    if (doc.status === 'queued') expect(doc.progress).toBe(0);
  }
}

describe('P1 and P3: random concurrent starts, failures, sweeps and completions', () => {
  type Op =
    | { t: 'start'; user: number; n: number }
    | { t: 'fail'; user: number; n: number }
    | { t: 'sweep'; user: number; n: number }
    | { t: 'run'; user: number; n: number }
    | { t: 'done'; user: number; n: number };

  const opArb = (users: number): fc.Arbitrary<Op> => {
    const c = { user: fc.nat(users - 1), n: fc.nat(2) };
    const op = (t: Op['t'], weight: number) => ({
      weight,
      arbitrary: fc.record({ t: fc.constant(t), ...c }) as fc.Arbitrary<Op>,
    });
    return fc.oneof(op('start', 4), op('fail', 2), op('sweep', 2), op('run', 2), op('done', 2));
  };

  it(
    'balances stay ≥ 0 and exact at every observed point; a failed render is refunded once',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }).chain((users) =>
            fc.record({
              users: fc.constant(users),
              // Small grants, so the balance check really bites (cost 5).
              grants: fc.array(fc.integer({ min: 0, max: 16 }), {
                minLength: users,
                maxLength: users,
              }),
              cost: fc.constantFrom(0, 3, 5),
              batches: fc.array(fc.array(opArb(users), { minLength: 1, maxLength: 6 }), {
                minLength: 1,
                maxLength: 4,
              }),
            }),
          ),
          async ({ users, grants, cost, batches }) => {
            const t = tools;
            const uids = await Promise.all(grants.map((g) => t.seed(g)));
            const salt = runSalt();
            const reqs = uids.map((uid, u) =>
              [0, 1, 2].map((n) => request(uid, requestId(salt, u * 10 + n))),
            );
            const store = new FirestoreRenderStore(db);
            for (const batch of batches) {
              await Promise.all(
                batch.map(async (op) => {
                  const r = reqs[op.user]![op.n]!;
                  switch (op.t) {
                    case 'start':
                      return startExport(db, r.renderId, r.render, cost, CFG, NOON);
                    case 'fail':
                      return failRender(db, r.renderId, 'render-failed', 'x');
                    case 'sweep':
                      return sweepIfStalled(db, r.renderId, Date.now() + 10 * QUEUED_STALL_MS);
                    case 'run':
                      return store.markStarted(r.renderId);
                    case 'done':
                      return store.markDone(r.renderId, {
                        outputPath: 'o.mp4',
                        thumbPath: 't.jpg',
                        sizeBytes: 1,
                      });
                  }
                }),
              );
              for (let u = 0; u < users; u++) {
                await expectLedgerAndRenders(
                  uids[u]!,
                  reqs[u]!.map((r) => r.renderId),
                  cost,
                );
              }
            }
          },
        ),
        { numRuns: 10 },
      );
    },
    TIMEOUT,
  );
});

describe('P2: charged once, refunded at most once', () => {
  it(
    'N concurrent identical requests make one render and one export entry',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 8 }), async (n) => {
          const t = tools;
          const uid = await t.seed(30);
          const { renderId, render } = request(uid, randomUUID());
          const results = await Promise.all(
            Array.from({ length: n }, () => startExport(db, renderId, render, 5, CFG, NOON)),
          );
          expect(results.filter((r) => r.kind === 'created')).toHaveLength(1);
          expect(results.filter((r) => r.kind === 'existing')).toHaveLength(n - 1);
          expect((await t.ledgerOf(uid)).filter((e) => e.reason === 'export')).toHaveLength(1);
          expect(await t.balanceOf(uid)).toBe(25);
          expect((await t.dayDoc(uid, DAY))?.renders).toBe(1);
        }),
        { numRuns: 6 },
      );
    },
    TIMEOUT,
  );

  it(
    'any interleaving of the failure paths refunds once, exactly when the render ended in error',
    async () => {
      type Path = 'job' | 'sweep' | 'route' | 'done';
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.constantFrom<Path>('job', 'sweep', 'route', 'done'), {
            minLength: 1,
            maxLength: 6,
          }),
          fc.boolean(),
          async (paths, concurrent) => {
            const t = tools;
            const uid = await t.seed(20);
            const { renderId, render } = request(uid, randomUUID());
            expect((await startExport(db, renderId, render, 5, CFG, NOON)).kind).toBe('created');
            const store = new FirestoreRenderStore(db);
            const run = (p: Path) => {
              switch (p) {
                case 'job':
                  return failRender(db, renderId, 'render-failed', 'x');
                case 'route':
                  return failRender(db, renderId, 'start-failed', 'x');
                case 'sweep':
                  return sweepIfStalled(db, renderId, Date.now() + 10 * QUEUED_STALL_MS);
                case 'done':
                  return store.markDone(renderId, {
                    outputPath: 'o.mp4',
                    thumbPath: 't.jpg',
                    sizeBytes: 1,
                  });
              }
            };
            if (concurrent) await Promise.all(paths.map(run));
            else for (const p of paths) await run(p);
            await expectLedgerAndRenders(uid, [renderId], 5);
            const doc = await t.renderDoc(renderId);
            // Whatever came first won, and nothing changes a final render.
            expect(['done', 'error']).toContain(doc?.status);
            expect(await t.balanceOf(uid)).toBe(doc?.status === 'error' ? 20 : 15);
          },
        ),
        { numRuns: 12 },
      );
    },
    TIMEOUT,
  );
});

describe('P5: never more than shown', () => {
  it(
    'the credits taken equal the cost passed in, for random balances and costs; a refusal charges nothing',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 30 }),
          fc.integer({ min: 0, max: 12 }),
          async (grant, cost) => {
            const t = tools;
            const uid = await t.seed(grant);
            const { renderId, render } = request(uid, randomUUID());
            const r = await startExport(db, renderId, render, cost, CFG, NOON);
            if (cost <= grant) {
              expect(r).toMatchObject({
                kind: 'created',
                costCredits: cost,
                balanceAfter: grant - cost,
              });
              expect(await t.balanceOf(uid)).toBe(grant - cost);
              expect((await t.renderDoc(renderId))?.costCredits).toBe(cost);
            } else {
              expect(r).toEqual({ kind: 'reject', reason: 'insufficient-credits', balance: grant });
              expect(await t.balanceOf(uid)).toBe(grant);
              expect(await t.renderDoc(renderId)).toBeNull();
            }
            await t.expectExact(uid);
          },
        ),
        { numRuns: 15 },
      );
    },
    TIMEOUT,
  );
  // The `cost-changed` answer (the client's `expectedCost` against the server's price) is the
  // route's: task 12's handler tests cover it, because `startExport` only receives the price.
});

describe('the sweep with a fake clock', () => {
  it(
    'a queued render survives until the stall limit and is failed and refunded after it',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: QUEUED_STALL_MS - 30_000 }),
          fc.integer({ min: 30_000, max: 3_600_000 }),
          async (early, late) => {
            const t = tools;
            const uid = await t.seed(20);
            const { renderId, render } = request(uid, randomUUID());
            await startExport(db, renderId, render, 5, CFG, NOON);
            expect((await sweepIfStalled(db, renderId, Date.now() + early))?.status).toBe('queued');
            expect(await t.balanceOf(uid)).toBe(15);
            const swept = await sweepIfStalled(db, renderId, Date.now() + QUEUED_STALL_MS + late);
            expect(swept).toMatchObject({ status: 'error', error: 'stalled' });
            expect(await t.balanceOf(uid)).toBe(20);
            await expectLedgerAndRenders(uid, [renderId], 5);
          },
        ),
        { numRuns: 6 },
      );
    },
    TIMEOUT,
  );
});

describe('the day doc across writers (review F1)', () => {
  it('an export first, then a plan allowance, then a second export on the same day doc', async () => {
    const t = tools;
    const uid = await t.seed(30);
    const first = request(uid, randomUUID());
    expect((await startExport(db, first.renderId, first.render, 5, CFG, NOON)).kind).toBe(
      'created',
    );
    // The export created the day doc with only `renders`: it must already parse.
    expect(await t.dayDoc(uid, DAY)).toMatchObject({ renders: 1, planCloud: 0 });

    expect(await takePlanAllowance(db, uid, 3, NOON)).toEqual({ allowed: true, used: 1, limit: 3 });
    expect(await t.dayDoc(uid, DAY)).toMatchObject({ renders: 1, planCloud: 1 });

    await failRender(db, first.renderId, 'render-failed', 'x');
    const second = request(uid, randomUUID());
    expect((await startExport(db, second.renderId, second.render, 5, CFG, NOON)).kind).toBe(
      'created',
    );
    const day = DailyLimitsSchema.parse((await db.doc(`users/${uid}/limits/${DAY}`).get()).data());
    // Neither writer reset the other's counter.
    expect([day.renders, day.planCloud]).toEqual([2, 1]);
    await t.expectExact(uid);
  });

  it('a plan allowance first, then an export, then more allowances', async () => {
    const t = tools;
    const uid = await t.seed(30);
    expect((await takePlanAllowance(db, uid, 5, NOON)).allowed).toBe(true);
    const r = request(uid, randomUUID());
    expect((await startExport(db, r.renderId, r.render, 5, CFG, NOON)).kind).toBe('created');
    expect(await takePlanAllowance(db, uid, 5, NOON)).toEqual({ allowed: true, used: 2, limit: 5 });
    expect(await t.dayDoc(uid, DAY)).toMatchObject({ renders: 1, planCloud: 2 });
  });

  it(
    'concurrent exports and allowances keep both counters exact',
    async () => {
      const t = tools;
      const uid = await t.seed(60);
      const { renderId, render } = request(uid, randomUUID());
      const [start, ...allowances] = await Promise.all([
        startExport(db, renderId, render, 5, CFG, NOON),
        ...Array.from({ length: 4 }, () => takePlanAllowance(db, uid, 10, NOON)),
      ]);
      expect((start as { kind: string }).kind).toBe('created');
      expect(allowances.every((a) => (a as { allowed: boolean }).allowed)).toBe(true);
      expect(await t.dayDoc(uid, DAY)).toMatchObject({ renders: 1, planCloud: 4 });
    },
    TIMEOUT,
  );
});

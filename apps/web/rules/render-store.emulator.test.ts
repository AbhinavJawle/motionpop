// The render store on the Firestore emulator (spec 08 task 8): the export transaction, failing and
// refunding a render, the stalled sweep and the store the job writes through. Money moves through
// the shared ledger helper of spec 13, so these tests also check that the two specs agree.
import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FirestoreRenderStore,
  MemoryRenderStore,
  QUEUED_STALL_MS,
  failRender,
  recordExecution,
  renderIdFor,
  startExport,
  sweepIfStalled,
  type ExportConfig,
  type NewRender,
} from '@motionpop/render/store';
import {
  DailyLimitsSchema,
  RenderDocSchema,
  renderDocIssues,
  renderPaths,
} from '@motionpop/schemas';
import { PROJECT_ID } from './helpers';
import { ledgerTools, salt } from './ledger-tools';

const APP_NAME = 'render-store-emulator-test';
const TIMEOUT = 180_000;
const CFG: ExportConfig = {
  exportsEnabled: true,
  killSwitch: false,
  rendersPerUserPerDay: 10,
  judgeCredits: 500,
};
const today = () => new Date().toISOString().slice(0, 10);

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

/** A request as the route builds it: the render id comes from the caller and the request id. */
function request(uid: string, requestId: string = randomUUID()) {
  const renderId = renderIdFor(uid, requestId);
  const render: NewRender = {
    ownerId: uid,
    projectId: 'proj-1',
    requestId,
    title: 'Launch film',
    format: '16:9',
    resolution: '1080p',
    captions: false,
    music: false,
    durationMs: 18_000,
    slotCount: 2,
    mode: 'emulator',
    inputPath: renderPaths(uid, 'proj-1', renderId).input,
    voicePath: `users/${uid}/audio/proj-1/voice-0123456789abcdef.wav`,
  };
  return { renderId, render };
}

async function start(uid: string, cost = 5, cfg = CFG, nowMs = Date.now(), requestId?: string) {
  const { renderId, render } = request(uid, requestId);
  return { renderId, result: await startExport(db, renderId, render, cost, cfg, nowMs) };
}

describe('startExport', () => {
  it('charges once, writes the ledger entry, counts the day and queues the render', async () => {
    const t = tools;
    const uid = await t.seed(20);
    const { renderId, result } = await start(uid);
    expect(result).toEqual({ kind: 'created', renderId, costCredits: 5, balanceAfter: 15 });
    expect(await t.balanceOf(uid)).toBe(15);
    const entry = (await t.ledgerOf(uid)).find((e) => e.id === `export-${renderId}`);
    expect(entry).toMatchObject({ delta: -5, reason: 'export', refId: renderId, balanceAfter: 15 });
    expect((await t.dayDoc(uid, today()))?.renders).toBe(1);
    const doc = await t.renderDoc(renderId);
    expect(doc).toMatchObject({
      status: 'queued',
      progress: 0,
      costCredits: 5,
      ownerId: uid,
      mode: 'emulator',
    });
    expect(renderDocIssues(doc!)).toEqual([]);
    await t.expectExact(uid);
  });

  it('a repeated request id returns the existing render and charges nothing more', async () => {
    const t = tools;
    const uid = await t.seed(20);
    const requestId = randomUUID();
    const first = await start(uid, 5, CFG, Date.now(), requestId);
    const again = await start(uid, 5, CFG, Date.now(), requestId);
    expect(again.renderId).toBe(first.renderId);
    expect(again.result).toMatchObject({ kind: 'existing', renderId: first.renderId });
    expect(await t.balanceOf(uid)).toBe(15);
    expect((await t.dayDoc(uid, today()))?.renders).toBe(1);
    expect((await t.ledgerOf(uid)).filter((e) => e.reason === 'export')).toHaveLength(1);
  });

  it(
    'N concurrent copies of one request create one render and charge once',
    async () => {
      const t = tools;
      const uid = await t.seed(20);
      const requestId = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => start(uid, 5, CFG, Date.now(), requestId)),
      );
      expect(results.filter((r) => r.result.kind === 'created')).toHaveLength(1);
      expect(results.filter((r) => r.result.kind === 'existing')).toHaveLength(5);
      expect(await t.balanceOf(uid)).toBe(15);
      await t.expectExact(uid);
    },
    TIMEOUT,
  );

  it('two different requests at once: one wins, the other sees the active render', async () => {
    const t = tools;
    const uid = await t.seed(50);
    const [a, b] = await Promise.all([start(uid), start(uid)]);
    const kinds = [a.result.kind, b.result.kind].sort();
    expect(kinds).toEqual(['created', 'reject']);
    const loser = a.result.kind === 'reject' ? a : b;
    const winner = a.result.kind === 'created' ? a : b;
    expect(loser.result).toMatchObject({ reason: 'render-active', renderId: winner.renderId });
    expect(await t.balanceOf(uid)).toBe(45);
    await t.expectExact(uid);
  });

  it('rejects without writing anything: insufficient credits, with the balance', async () => {
    const t = tools;
    const uid = await t.seed(4);
    const { renderId, result } = await start(uid);
    expect(result).toEqual({ kind: 'reject', reason: 'insufficient-credits', balance: 4 });
    expect(await t.balanceOf(uid)).toBe(4);
    expect(await t.renderDoc(renderId)).toBeNull();
    expect(await t.dayDoc(uid, today())).toBeNull();
    expect(await t.ledgerOf(uid)).toHaveLength(1);
  });

  it('rejects when exports are switched off or the kill switch is on', async () => {
    const t = tools;
    const uid = await t.seed(20);
    for (const cfg of [
      { ...CFG, exportsEnabled: false },
      { ...CFG, killSwitch: true },
    ]) {
      expect((await start(uid, 5, cfg)).result).toMatchObject({
        kind: 'reject',
        reason: 'disabled',
      });
    }
    expect(await t.balanceOf(uid)).toBe(20);
  });

  it('daily limit: the third render of a UTC day with a limit of 2, even after the first two failed', async () => {
    const t = tools;
    const uid = await t.seed(50);
    const cfg = { ...CFG, rendersPerUserPerDay: 2 };
    for (let k = 0; k < 2; k++) {
      const { renderId, result } = await start(uid, 5, cfg);
      expect(result.kind).toBe('created');
      await failRender(db, renderId, 'render-failed', 'boom');
    }
    const third = await start(uid, 5, cfg);
    expect(third.result).toMatchObject({ kind: 'reject', reason: 'daily-limit' });
    expect((await t.dayDoc(uid, today()))?.renders).toBe(2);
    // The refunds came back, the count did not (design §7.2).
    expect(await t.balanceOf(uid)).toBe(50);
  });

  it('a day doc written by the plan allowance and the AI ledger still parses after an export (review F1)', async () => {
    const t = tools;
    const uid = await t.seed(50);
    await db
      .doc(`users/${uid}/limits/${today()}`)
      .set({ schemaVersion: 1, planCloud: 3, aiByHour: { '07': 2 }, updatedAt: new Date() });
    await start(uid);
    const day = DailyLimitsSchema.parse(
      (await db.doc(`users/${uid}/limits/${today()}`).get()).data(),
    );
    expect([day.planCloud, day.renders, day.aiByHour['07']]).toEqual([3, 1, 2]);
  });

  it('tops a judge up inside the start, once, and commits it with the render', async () => {
    const t = tools;
    const uid = await t.seed(1, 'judge');
    const cfg = { ...CFG, judgeCredits: 20 };
    const { renderId, result } = await start(uid, 5, cfg);
    expect(result).toMatchObject({ kind: 'created', balanceAfter: 15 });
    const ledger = await t.ledgerOf(uid);
    expect(ledger.find((e) => e.reason === 'judge-grant')).toMatchObject({
      delta: 19,
      balanceAfter: 20,
    });
    expect(ledger.some((e) => e.id === `export-${renderId}`)).toBe(true);
    await t.expectExact(uid);
  });

  it('a free export (cost 0) queues a render and writes no ledger entry', async () => {
    const t = tools;
    const uid = await t.seed(0);
    const { renderId, result } = await start(uid, 0);
    expect(result).toMatchObject({ kind: 'created', costCredits: 0, balanceAfter: 0 });
    expect(await t.ledgerOf(uid)).toHaveLength(1);
    await failRender(db, renderId, 'render-failed', 'x');
    expect(await t.ledgerOf(uid)).toHaveLength(1);
    expect((await t.renderDoc(renderId))?.status).toBe('error');
  });

  it('throws LedgerError for a user without a doc', async () => {
    await expect(start(`nobody-${randomUUID()}`)).rejects.toMatchObject({ name: 'LedgerError' });
  });
});

describe('failRender', () => {
  it('moves an active render to error and refunds the cost once', async () => {
    const t = tools;
    const uid = await t.seed(20);
    const { renderId } = await start(uid);
    const r = await failRender(db, renderId, 'render-failed', 'The render failed.');
    expect(r).toEqual({ kind: 'failed', refunded: 5 });
    expect(await t.renderDoc(renderId)).toMatchObject({
      status: 'error',
      error: 'render-failed',
      errorMessage: 'The render failed.',
    });
    expect(await t.balanceOf(uid)).toBe(20);
    const refund = (await t.ledgerOf(uid)).find((e) => e.id === `refund-${renderId}`);
    expect(refund).toMatchObject({ delta: 5, reason: 'refund', refId: renderId, balanceAfter: 20 });
    expect(await failRender(db, renderId, 'internal', 'again')).toEqual({
      kind: 'noop',
      reason: 'final',
    });
    await t.expectExact(uid);
  });

  it(
    'concurrent failures (the job, the sweep and the route) refund once',
    async () => {
      const t = tools;
      const uid = await t.seed(20);
      const { renderId } = await start(uid);
      const rs = await Promise.all(
        (['render-failed', 'stalled', 'start-failed', 'timeout', 'internal'] as const).map((c) =>
          failRender(db, renderId, c, 'x'),
        ),
      );
      expect(rs.filter((r) => r.kind === 'failed')).toHaveLength(1);
      expect(await t.balanceOf(uid)).toBe(20);
      expect((await t.ledgerOf(uid)).filter((e) => e.id === `refund-${renderId}`)).toHaveLength(1);
      await t.expectExact(uid);
    },
    TIMEOUT,
  );

  it('leaves a finished render and a missing render alone', async () => {
    const t = tools;
    const uid = await t.seed(20);
    const { renderId } = await start(uid);
    const store = new FirestoreRenderStore(db);
    await store.markStarted(renderId);
    await store.progress(renderId, 'encoding', 90);
    await store.markDone(renderId, { outputPath: 'o', thumbPath: 't', sizeBytes: 1 });
    expect(await failRender(db, renderId, 'stalled', 'x')).toEqual({
      kind: 'noop',
      reason: 'final',
    });
    expect(await failRender(db, 'does-not-exist', 'stalled', 'x')).toEqual({
      kind: 'noop',
      reason: 'missing',
    });
    expect(await t.balanceOf(uid)).toBe(15);
  });

  it('keeps the message short and still fails when the account no longer exists', async () => {
    const t = tools;
    const uid = await t.seed(20);
    const { renderId } = await start(uid);
    await db.doc(`users/${uid}`).delete();
    const r = await failRender(db, renderId, 'internal', 'x'.repeat(500));
    expect(r).toEqual({ kind: 'failed', refunded: 0 });
    expect((await t.renderDoc(renderId))?.errorMessage).toHaveLength(200);
  });
});

describe('sweepIfStalled', () => {
  it('fails a queued render after 5 minutes (server clock) and refunds it', async () => {
    const t = tools;
    const uid = await t.seed(20);
    const { renderId } = await start(uid);
    const soon = await sweepIfStalled(db, renderId, Date.now() + 60_000);
    expect(soon?.status).toBe('queued');
    const late = await sweepIfStalled(db, renderId, Date.now() + QUEUED_STALL_MS + 5_000);
    expect(late).toMatchObject({ status: 'error', error: 'stalled' });
    expect(await t.balanceOf(uid)).toBe(20);
    await t.expectExact(uid);
    // A second sweep changes nothing.
    expect((await sweepIfStalled(db, renderId, Date.now() + 10 * QUEUED_STALL_MS))?.status).toBe(
      'error',
    );
    expect((await t.ledgerOf(uid)).filter((e) => e.reason === 'refund')).toHaveLength(1);
  });

  it('fails a started render 90 s after its last heartbeat, not before', async () => {
    const t = tools;
    const uid = await t.seed(20);
    const { renderId } = await start(uid);
    const store = new FirestoreRenderStore(db);
    await store.markStarted(renderId);
    expect((await sweepIfStalled(db, renderId, Date.now() + 60_000))?.status).toBe('rendering');
    expect(await store.heartbeat(renderId)).toBe('ok');
    expect(await sweepIfStalled(db, renderId, Date.now() + 100_000)).toMatchObject({
      status: 'error',
      error: 'stalled',
    });
    expect(await store.heartbeat(renderId)).toBe('inactive');
    expect(await store.progress(renderId, 'rendering', 50)).toBe('inactive');
  });

  it('returns null for a missing render', async () => {
    expect(await sweepIfStalled(db, 'nope', Date.now())).toBeNull();
  });
});

describe('FirestoreRenderStore', () => {
  it('walks queued → rendering → encoding → done and keeps the doc valid at each step', async () => {
    const t = tools;
    const uid = await t.seed(20);
    const { renderId } = await start(uid);
    const store = new FirestoreRenderStore(db);
    const valid = async () => expect(renderDocIssues((await store.get(renderId))!)).toEqual([]);
    expect(await store.markStarted(renderId)).toBe(true);
    expect(await store.markStarted(renderId)).toBe(false);
    expect(await store.progress(renderId, 'rendering', 40)).toBe('ok');
    expect(await store.progress(renderId, 'encoding', 90)).toBe('ok');
    expect(await store.progress(renderId, 'rendering', 95)).toBe('ok');
    expect(await store.get(renderId)).toMatchObject({ status: 'encoding', progress: 95 });
    await valid();
    expect(
      await store.markDone(renderId, { outputPath: 'o.mp4', thumbPath: 't.jpg', sizeBytes: 9 }),
    ).toBe('ok');
    expect(await store.get(renderId)).toMatchObject({
      status: 'done',
      progress: 100,
      outputPath: 'o.mp4',
      sizeBytes: 9,
    });
    await valid();
    expect(await store.markDone(renderId, { outputPath: 'x', thumbPath: 'y', sizeBytes: 1 })).toBe(
      'inactive',
    );
    expect(await store.get('does-not-exist')).toBeNull();
    await recordExecution(db, renderId, 'executions/abc');
    expect((await store.get(renderId))?.executionName).toBe('executions/abc');
  });

  it(
    'property: the same events give the same render as the memory store (and the same refund)',
    async () => {
      type Ev =
        | { e: 'start' }
        | { e: 'progress'; stage: 'rendering' | 'encoding'; p: number }
        | { e: 'beat' }
        | { e: 'done' }
        | { e: 'fail'; code: 'render-failed' | 'timeout' };
      const evArb: fc.Arbitrary<Ev> = fc.oneof(
        fc.constant<Ev>({ e: 'start' }),
        fc.record({
          e: fc.constant('progress' as const),
          stage: fc.constantFrom('rendering' as const, 'encoding' as const),
          p: fc.integer({ min: 0, max: 100 }),
        }),
        fc.constant<Ev>({ e: 'beat' }),
        fc.constant<Ev>({ e: 'done' }),
        fc.record({
          e: fc.constant('fail' as const),
          code: fc.constantFrom('render-failed' as const, 'timeout' as const),
        }),
      );
      await fc.assert(
        fc.asyncProperty(fc.array(evArb, { minLength: 1, maxLength: 10 }), async (events) => {
          const t = tools;
          const uid = await t.seed(20);
          const { renderId } = await start(uid, 5);
          const real = new FirestoreRenderStore(db);
          const mem = new MemoryRenderStore();
          mem.create(renderId, (await real.get(renderId))!);
          mem.balances.set(uid, 15);
          const apply = async (s: FirestoreRenderStore | MemoryRenderStore, ev: Ev) => {
            switch (ev.e) {
              case 'start':
                return s.markStarted(renderId);
              case 'progress':
                return s.progress(renderId, ev.stage, ev.p);
              case 'beat':
                return s.heartbeat(renderId);
              case 'done':
                return s.markDone(renderId, { outputPath: 'o', thumbPath: 't', sizeBytes: 1 });
              case 'fail':
                return s.fail(renderId, ev.code, 'x');
            }
          };
          for (const ev of events) {
            const [a, b] = [await apply(real, ev), await apply(mem, ev)];
            expect(a).toEqual(b);
            const [da, dbm] = [await real.get(renderId), await mem.get(renderId)];
            expect([da?.status, da?.progress, da?.error]).toEqual([
              dbm?.status,
              dbm?.progress,
              dbm?.error,
            ]);
            expect(renderDocIssues(da!)).toEqual([]);
          }
          // One refund exactly when the render failed, in both stores.
          const refunds = (await t.ledgerOf(uid)).filter((e) => e.reason === 'refund').length;
          expect(refunds).toBe(mem.refundsOf(renderId).length);
          expect(await t.balanceOf(uid)).toBe(mem.balances.get(uid));
          await t.expectExact(uid);
        }),
        { numRuns: 15 },
      );
    },
    TIMEOUT,
  );
});

describe('the ledger across start, fail and sweep (an early look at property C9)', () => {
  it(
    'random concurrent starts, failures and sweeps leave an exact ledger',
    async () => {
      type Op = { t: 'start'; n: number } | { t: 'fail'; n: number } | { t: 'sweep'; n: number };
      const opArb: fc.Arbitrary<Op> = fc.oneof(
        fc.record({ t: fc.constant('start' as const), n: fc.nat(3) }),
        fc.record({ t: fc.constant('fail' as const), n: fc.nat(3) }),
        fc.record({ t: fc.constant('sweep' as const), n: fc.nat(3) }),
      );
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 18 }),
          fc.array(opArb, { minLength: 3, maxLength: 10 }),
          async (grant, ops) => {
            const t = tools;
            const uid = await t.seed(grant);
            const run = salt();
            const requests = Array.from({ length: 4 }, (_, n) =>
              request(uid, `00000000-0000-4000-8000-${run}${String(n).padStart(4, '0')}`),
            );
            await Promise.all(
              ops.map((op) => {
                const r = requests[op.n]!;
                if (op.t === 'start')
                  return startExport(db, r.renderId, r.render, 5, CFG, Date.now());
                if (op.t === 'fail') return failRender(db, r.renderId, 'render-failed', 'x');
                return sweepIfStalled(db, r.renderId, Date.now() + 10 * QUEUED_STALL_MS);
              }),
            );
            await t.expectExact(uid);
            for (const r of requests) {
              const doc = await t.renderDoc(r.renderId);
              if (doc) RenderDocSchema.parse(doc);
            }
          },
        ),
        { numRuns: 10 },
      );
    },
    TIMEOUT,
  );
});

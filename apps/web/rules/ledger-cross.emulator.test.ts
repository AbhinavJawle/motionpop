// Property C9 on the Firestore emulator (spec 13 task 5b): one ledger across every writer. Random
// interleavings, over 1–3 users, of AI spends, client refunds and spec 08's `startExport`,
// `failRender` and `sweepIfStalled` (all imported from `@motionpop/render/store`). After every
// batch of concurrent operations each user's balance is ≥ 0, equals the sum of the ledger, and
// every spend has at most one refund of the same amount. A render is refunded exactly when it
// failed with a cost.
import { randomUUID } from 'node:crypto';
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  QUEUED_STALL_MS,
  aiSpec,
  failRender,
  refundCredits,
  renderIdFor,
  spendCredits,
  startExport,
  sweepIfStalled,
  type ExportConfig,
  type LedgerConfig,
  type NewRender,
} from '@motionpop/render/store';
import { renderPaths } from '@motionpop/schemas';
import { PROJECT_ID } from './helpers';
import { ledgerTools } from './ledger-tools';

const APP_NAME = 'ledger-cross-emulator-test';
const TIMEOUT = 300_000;
const LEDGER_CFG: LedgerConfig = {
  killSwitch: false,
  rateLimitCloudPerHour: 30,
  refundsPerDay: 30,
  judgeCredits: 500,
};
const EXPORT_CFG: ExportConfig = {
  exportsEnabled: true,
  killSwitch: false,
  rendersPerUserPerDay: 50,
  judgeCredits: 500,
};
const EXPORT_COST = 5;
const POOL = 3; // AI keys and render requests per user: small, so the operations collide

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

type Op =
  | { t: 'spend'; user: number; n: number; cost: number }
  | { t: 'refund'; user: number; n: number }
  | { t: 'start'; user: number; n: number }
  | { t: 'fail'; user: number; n: number }
  | { t: 'sweep'; user: number; n: number };

const opArb = (users: number): fc.Arbitrary<Op> => {
  const common = { user: fc.nat(users - 1), n: fc.nat(POOL - 1) };
  return fc.oneof(
    {
      weight: 3,
      arbitrary: fc.record({
        t: fc.constant('spend' as const),
        ...common,
        cost: fc.integer({ min: 1, max: 4 }),
      }),
    },
    { weight: 2, arbitrary: fc.record({ t: fc.constant('refund' as const), ...common }) },
    { weight: 3, arbitrary: fc.record({ t: fc.constant('start' as const), ...common }) },
    { weight: 2, arbitrary: fc.record({ t: fc.constant('fail' as const), ...common }) },
    { weight: 2, arbitrary: fc.record({ t: fc.constant('sweep' as const), ...common }) },
  );
};

const scenarioArb = fc.integer({ min: 1, max: 3 }).chain((users) =>
  fc.record({
    users: fc.constant(users),
    grants: fc.array(fc.integer({ min: 0, max: 25 }), { minLength: users, maxLength: users }),
    // Batches run one after the other; the operations inside a batch run at once.
    batches: fc.array(fc.array(opArb(users), { minLength: 1, maxLength: 6 }), {
      minLength: 1,
      maxLength: 4,
    }),
  }),
);

function renderRequest(uid: string, requestId: string): { renderId: string; render: NewRender } {
  const renderId = renderIdFor(uid, requestId);
  return {
    renderId,
    render: {
      ownerId: uid,
      projectId: 'proj-1',
      requestId,
      title: 'Cross film',
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

/** The ledger of one user and its renders agree (C9 plus spec 08 R2.9). */
async function expectConsistent(uid: string, renderIds: string[]): Promise<void> {
  const t = tools;
  await t.expectExact(uid);
  const ledger = await t.ledgerOf(uid);
  for (const renderId of renderIds) {
    const doc = await t.renderDoc(renderId);
    const spend = ledger.find((e) => e.id === `export-${renderId}`);
    const refund = ledger.find((e) => e.id === `refund-${renderId}`);
    if (!doc) {
      // A start that was refused wrote nothing at all.
      expect(spend, `${renderId} has no doc but a spend`).toBeUndefined();
      expect(refund).toBeUndefined();
      continue;
    }
    expect(spend, `${renderId} has a doc but no spend`).toBeDefined();
    // A refund exists exactly when the render failed.
    expect(refund !== undefined, `${renderId} (${doc.status}) refund`).toBe(doc.status === 'error');
    if (refund) expect(refund.delta).toBe(EXPORT_COST);
  }
}

describe('C9: one ledger across AI spends, client refunds, startExport, failRender and sweepIfStalled', () => {
  it(
    'random concurrent interleavings over 1–3 users keep every ledger exact',
    async () => {
      await fc.assert(
        fc.asyncProperty(scenarioArb, async ({ users, grants, batches }) => {
          const t = tools;
          const uids = await Promise.all(grants.map((g) => t.seed(g)));
          const run = randomUUID().replaceAll('-', '').slice(0, 8);
          const keys = (u: number) => Array.from({ length: POOL }, (_, n) => `${run}u${u}k${n}ab`);
          const requests = uids.map((uid, u) =>
            Array.from({ length: POOL }, (_, n) =>
              renderRequest(uid, `00000000-0000-4000-8000-${run}${u}${String(n).padStart(3, '0')}`),
            ),
          );
          const renderIds = (u: number) => requests[u]!.map((r) => r.renderId);

          for (const batch of batches) {
            await Promise.all(
              batch.map((op) => {
                const uid = uids[op.user]!;
                const r = requests[op.user]![op.n]!;
                switch (op.t) {
                  case 'spend':
                    return spendCredits(
                      db,
                      {
                        ...aiSpec(uid, keys(op.user)[op.n]!),
                        reason: 'generate',
                        cost: op.cost,
                      },
                      LEDGER_CFG,
                      Date.now(),
                    );
                  case 'refund':
                    return refundCredits(
                      db,
                      uid,
                      `s-${keys(op.user)[op.n]!}`,
                      LEDGER_CFG,
                      Date.now(),
                    );
                  case 'start':
                    return startExport(
                      db,
                      r.renderId,
                      r.render,
                      EXPORT_COST,
                      EXPORT_CFG,
                      Date.now(),
                    );
                  case 'fail':
                    return failRender(db, r.renderId, 'render-failed', 'x');
                  case 'sweep':
                    return sweepIfStalled(db, r.renderId, Date.now() + 10 * QUEUED_STALL_MS);
                }
              }),
            );
            // An observed point: every user is exact after every batch.
            for (let u = 0; u < users; u++) await expectConsistent(uids[u]!, renderIds(u));
          }

          // Users never touch each other's money: each balance is its grant plus its own deltas
          // (checked by `expectExact`, which sums that user's ledger only).
          for (let u = 0; u < users; u++) {
            const ledger = await t.ledgerOf(uids[u]!);
            expect(ledger.reduce((s, e) => s + e.delta, 0)).toBe(await t.balanceOf(uids[u]!));
            expect(await t.balanceOf(uids[u]!)).toBeLessThanOrEqual(
              grants[u]! + 0, // nothing here ever adds credits beyond refunds of its own spends
            );
          }
        }),
        { numRuns: 12 },
      );
    },
    TIMEOUT,
  );

  it('a spend, an export and their refunds in one fixed order end where they started', async () => {
    const t = tools;
    const uid = await t.seed(20);
    const { renderId, render } = renderRequest(uid, randomUUID());
    const key = randomUUID().replaceAll('-', '');
    const ai = { ...aiSpec(uid, key), reason: 'generate' as const, cost: 3 };
    expect((await spendCredits(db, ai, LEDGER_CFG, Date.now())).ok).toBe(true);
    expect(
      await startExport(db, renderId, render, EXPORT_COST, EXPORT_CFG, Date.now()),
    ).toMatchObject({ kind: 'created', balanceAfter: 12 });
    expect(await refundCredits(db, uid, `s-${key}`, LEDGER_CFG, Date.now())).toMatchObject({
      ok: true,
      alreadyRefunded: false,
    });
    expect(await failRender(db, renderId, 'render-failed', 'x')).toEqual({
      kind: 'failed',
      refunded: EXPORT_COST,
    });
    expect(await t.balanceOf(uid)).toBe(20);
    // A client refund of the export id is refused, and the sweep finds nothing left to do.
    expect(
      await refundCredits(db, uid, `export-${renderId}`, LEDGER_CFG, Date.now()),
    ).toMatchObject({ ok: false, reason: 'not-refundable' });
    expect((await sweepIfStalled(db, renderId, Date.now() + 10 * QUEUED_STALL_MS))?.status).toBe(
      'error',
    );
    expect(await t.balanceOf(uid)).toBe(20);
    await expectConsistent(uid, [renderId]);
  });
});

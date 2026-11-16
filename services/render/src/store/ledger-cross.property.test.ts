// Property C9 as a pure model (spec 13 task 5b), next to the single-ledger model of task 3. Several
// users each have their own ledger, built only from the decisions. The writers are the ones of the
// real system: AI spends, client refunds, an export start, and the server refund that `failRender`
// and the sweep both make. A render fails at most once, so it refunds at most once.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LedgerModel, type ModelConfig } from '../testing/ledger-model';
import { refundIdOf } from './ledger-logic';

const NOW = Date.UTC(2026, 10, 16, 12, 0);
const POOL = 3;

type Op =
  | { t: 'spend'; user: number; n: number; cost: number }
  | { t: 'refund'; user: number; n: number }
  | { t: 'start'; user: number; n: number }
  | { t: 'fail'; user: number; n: number }
  | { t: 'sweep'; user: number; n: number };

const opArb = (users: number): fc.Arbitrary<Op> => {
  const c = { user: fc.nat(users - 1), n: fc.nat(POOL - 1) };
  return fc.oneof(
    {
      weight: 3,
      arbitrary: fc.record({
        t: fc.constant('spend' as const),
        ...c,
        cost: fc.integer({ min: 1, max: 4 }),
      }),
    },
    { weight: 2, arbitrary: fc.record({ t: fc.constant('refund' as const), ...c }) },
    { weight: 3, arbitrary: fc.record({ t: fc.constant('start' as const), ...c }) },
    { weight: 2, arbitrary: fc.record({ t: fc.constant('fail' as const), ...c }) },
    { weight: 2, arbitrary: fc.record({ t: fc.constant('sweep' as const), ...c }) },
  );
};

const scenarioArb = fc.integer({ min: 1, max: 3 }).chain((users) =>
  fc.record({
    users: fc.constant(users),
    grants: fc.array(fc.integer({ min: 0, max: 30 }), { minLength: users, maxLength: users }),
    ops: fc.array(opArb(users), { minLength: 1, maxLength: 60 }),
  }),
);

describe('C9 as a model: one ledger per user across every writer', () => {
  it('keeps every ledger exact and every spend refunded at most once', () => {
    fc.assert(
      fc.property(scenarioArb, ({ users, grants, ops }) => {
        const cfg = (): ModelConfig => ({
          hourLimit: 30,
          refundsPerDay: 30,
          killSwitch: false,
          judgeCredits: null,
        });
        const models = grants.map((g) => new LedgerModel(g, cfg()));
        // Per user and render: whether the render has been started (so it can fail).
        const started = new Set<string>();
        const failed = new Set<string>();
        for (const op of ops) {
          const m = models[op.user]!;
          const aiId = `s-u${op.user}k${op.n}abcdef`;
          const exportId = `export-u${op.user}r${op.n}`;
          const before = m.balance;
          if (op.t === 'spend') {
            m.spend(aiId, 'ai', op.cost, NOW);
          } else if (op.t === 'refund') {
            m.refund(aiId, NOW, false);
          } else if (op.t === 'start') {
            // A render that exists is never started twice (the render id is the request id).
            if (!started.has(exportId) && m.spend(exportId, 'export', 5, NOW).kind === 'charge') {
              started.add(exportId);
            }
          } else {
            // `failRender` and the sweep both end in the same server refund of a started render.
            if (started.has(exportId) && !failed.has(exportId)) {
              failed.add(exportId);
              const d = m.refund(exportId, NOW, true);
              expect(d.kind).toBe('refund');
            }
          }
          expect(m.issues(), JSON.stringify(op)).toEqual([]);
          // An operation of one user never moves another user's balance.
          models.forEach((other, i) => {
            if (i !== op.user) expect(other.issues()).toEqual([]);
          });
          expect(m.balance).toBeGreaterThanOrEqual(0);
          if (op.t === 'fail' || op.t === 'sweep' || op.t === 'refund') {
            expect(m.balance).toBeGreaterThanOrEqual(before);
          }
        }
        for (let u = 0; u < users; u++) {
          const m = models[u]!;
          for (const e of m.entries.filter((x) => x.reason === 'refund')) {
            const spendId = m.entries.find((s) => s.id !== e.id && safe(s.id) === e.id)?.id;
            expect(spendId, `${e.id} has a spend`).toBeDefined();
          }
          // Failed renders are exactly the refunded exports.
          const refundedExports = m.entries.filter((e) => e.id.startsWith('refund-')).length;
          expect(refundedExports).toBe(
            [...failed].filter((id) => id.startsWith(`export-u${u}`)).length,
          );
        }
      }),
      { numRuns: 300 },
    );
  });

  it('a spend, a start, a refund and a failure return the balance to the grant', () => {
    const m = new LedgerModel(20, {
      hourLimit: 30,
      refundsPerDay: 30,
      killSwitch: false,
      judgeCredits: null,
    });
    m.spend('s-abcdefgh', 'ai', 3, NOW);
    m.spend('export-r1', 'export', 5, NOW);
    expect(m.balance).toBe(12);
    m.refund('s-abcdefgh', NOW, false);
    m.refund('export-r1', NOW, true);
    expect(m.balance).toBe(20);
    expect(m.refund('export-r1', NOW, true).kind).toBe('replay');
    expect(m.issues()).toEqual([]);
  });
});

function safe(id: string): string | null {
  try {
    return refundIdOf(id);
  } catch {
    return null;
  }
}

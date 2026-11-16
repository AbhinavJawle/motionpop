// Model-based properties of the ledger decisions (spec 13 C1, C3, C4, C5, C6). Random sequences of
// spends, replays, refunds, kill-switch flips and clock moves run against an in-memory ledger that
// is built only from the decisions.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LedgerModel, utcDay, type ModelConfig } from '../testing/ledger-model';
import { MAX_REFUND_AGE_MS, refundIdOf } from './ledger-logic';

const START = Date.UTC(2026, 10, 16, 23, 30);
const KEYS = 6; // a small pool, so replays and refund-then-spend collide often

type Op =
  | { t: 'spend'; key: number; kind: 'ai' | 'export'; cost: number }
  | { t: 'refund'; key: number; kind: 'ai' | 'export'; server: boolean }
  | { t: 'kill'; on: boolean }
  | { t: 'advance'; ms: number };

const idOf = (kind: 'ai' | 'export', key: number) =>
  kind === 'ai' ? `s-key${key}abcdef` : `export-render${key}`;

const opArb: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      t: fc.constant('spend' as const),
      key: fc.nat(KEYS - 1),
      kind: fc.constantFrom('ai' as const, 'export' as const),
      cost: fc.integer({ min: 1, max: 12 }),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      t: fc.constant('refund' as const),
      key: fc.nat(KEYS - 1),
      kind: fc.constantFrom('ai' as const, 'export' as const),
      server: fc.boolean(),
    }),
  },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('kill' as const), on: fc.boolean() }) },
  {
    weight: 3,
    arbitrary: fc.record({
      t: fc.constant('advance' as const),
      ms: fc.oneof(
        fc.integer({ min: 0, max: 30 * 60_000 }),
        fc.integer({ min: 0, max: 40 * 3600_000 }),
      ),
    }),
  },
);

const setupArb = fc.record({
  grant: fc.integer({ min: 0, max: 40 }),
  hourLimit: fc.integer({ min: 0, max: 8 }),
  refundsPerDay: fc.integer({ min: 0, max: 8 }),
  judgeCredits: fc.option(fc.integer({ min: 5, max: 60 }), { nil: null }),
});

function run(
  setup: { grant: number; hourLimit: number; refundsPerDay: number; judgeCredits: number | null },
  ops: Op[],
) {
  const cfg: ModelConfig = {
    hourLimit: setup.hourLimit,
    refundsPerDay: setup.refundsPerDay,
    killSwitch: false,
    judgeCredits: setup.judgeCredits,
  };
  const m = new LedgerModel(setup.grant, cfg);
  let now = START;
  const log: string[] = [];
  const check = (what: string) => {
    const issues = m.issues();
    if (issues.length) throw new Error(`${what}: ${issues.join('; ')}\n${log.join('\n')}`);
  };
  for (const op of ops) {
    log.push(JSON.stringify(op));
    if (op.t === 'advance') {
      now += op.ms;
    } else if (op.t === 'kill') {
      cfg.killSwitch = op.on;
    } else if (op.t === 'spend') {
      const id = idOf(op.kind, op.key);
      const before = m.entry(id);
      const refundedBefore = m.entry(refundIdOf(id)) !== undefined;
      const hadRefillToday = m.entry(`judge-refill-${utcDay(now)}`) !== undefined;
      const balanceBefore = m.balance;
      const d = m.spend(id, op.kind, op.cost, now);
      // C3: a key that already has a spend entry never charges again.
      if (before) {
        expect(d.kind).not.toBe('charge');
        if (refundedBefore) expect(d).toMatchObject({ kind: 'refuse', reason: 'key-used' });
        else
          expect(d).toEqual({ kind: 'replay', balance: before.balanceAfter, cost: -before.delta });
        expect(m.balance).toBe(balanceBefore);
      }
      // C6: a judge's spend within judgeCredits is refused as insufficient only on a day that
      // already had its refill.
      if (
        d.kind === 'refuse' &&
        d.reason === 'insufficient' &&
        setup.judgeCredits !== null &&
        op.cost <= setup.judgeCredits
      ) {
        expect(hadRefillToday).toBe(true);
      }
      if (d.kind === 'charge' && d.refill) {
        expect(setup.judgeCredits).not.toBeNull();
        expect(hadRefillToday).toBe(false);
        expect(d.refill.balanceAfterGrant).toBe(setup.judgeCredits);
        expect(balanceBefore).toBeLessThan(op.cost);
      }
      // A refused spend writes nothing.
      if (d.kind === 'refuse') expect(m.balance).toBe(balanceBefore);
      // Kill switch: no new charge at all.
      if (cfg.killSwitch && !before) expect(d.kind).toBe('refuse');
    } else {
      const id = idOf(op.kind, op.key);
      const had = m.entry(refundIdOf(id));
      const balanceBefore = m.balance;
      const d = m.refund(id, now, op.server);
      // C4: at most one refund per spend; a client never reaches export-*.
      if (had) expect(d.kind).not.toBe('refund');
      if (!op.server && op.kind === 'export') expect(d.kind).not.toBe('refund');
      if (d.kind !== 'refund') expect(m.balance).toBe(balanceBefore);
      if (d.kind === 'refund' && !op.server) {
        const s = m.entry(id)!;
        expect(now - s.atMs).toBeLessThanOrEqual(MAX_REFUND_AGE_MS);
      }
    }
    // C5: never more AI spends in an hour than the cap (a lowered cap only blocks new ones).
    expect(m.aiSpendsInHour(now)).toBeLessThanOrEqual(Math.max(setup.hourLimit, 0));
    check(JSON.stringify(op));
  }
  return m;
}

describe('ledger decisions: model-based properties', () => {
  it('C1/C3/C4/C5/C6: any sequence keeps the ledger exact', () => {
    fc.assert(
      fc.property(setupArb, fc.array(opArb, { minLength: 1, maxLength: 60 }), (setup, ops) => {
        run(setup, ops);
      }),
      { numRuns: 400 },
    );
  });

  it('C3: spend, refund, spend with the same key never returns ok (any state)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 1, max: 10 }),
        fc.boolean(),
        fc.boolean(),
        (grant, cost, kill, judge) => {
          const m = new LedgerModel(grant, {
            hourLimit: 30,
            refundsPerDay: 30,
            killSwitch: false,
            judgeCredits: judge ? 100 : null,
          });
          const first = m.spend('s-samekey12', 'ai', cost, START);
          if (first.kind !== 'charge') return;
          expect(m.refund('s-samekey12', START + 1000, false).kind).toBe('refund');
          m.cfg.killSwitch = kill;
          const again = m.spend('s-samekey12', 'ai', cost, START + 2000);
          expect(again).toMatchObject({ kind: 'refuse', reason: 'key-used' });
          expect(m.issues()).toEqual([]);
        },
      ),
    );
  });

  it('C5: a burst of distinct spends in one hour commits exactly min(n, limit, affordable)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 12 }),
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 0, max: 60 }),
        (limit, grant, cost, n) => {
          const m = new LedgerModel(grant, {
            hourLimit: limit,
            refundsPerDay: 30,
            killSwitch: false,
            judgeCredits: null,
          });
          let ok = 0;
          for (let k = 0; k < n; k++) {
            if (m.spend(`s-burst${k}abcd`, 'ai', cost, START).kind === 'charge') ok++;
          }
          expect(ok).toBe(Math.min(n, limit, Math.floor(grant / cost)));
          expect(m.issues()).toEqual([]);
        },
      ),
    );
  });

  it('C6: a judge is refilled at most once per UTC day and never above judgeCredits', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 80 }),
        fc.array(fc.record({ day: fc.nat(3), cost: fc.integer({ min: 1, max: 9 }) }), {
          minLength: 1,
          maxLength: 80,
        }),
        (judgeCredits, spends) => {
          const m = new LedgerModel(judgeCredits, {
            hourLimit: 1000,
            refundsPerDay: 30,
            killSwitch: false,
            judgeCredits,
          });
          const sorted = [...spends].sort((a, b) => a.day - b.day);
          sorted.forEach((s, k) => {
            const now = START + s.day * 24 * 3600_000 + k * 1000;
            m.spend(`s-judge${k}abcd`, 'ai', s.cost, now);
          });
          const refills = m.entries.filter((e) => e.reason === 'judge-grant');
          expect(new Set(refills.map((e) => e.id)).size).toBe(refills.length);
          for (const r of refills) expect(r.balanceAfter).toBe(judgeCredits);
          expect(m.issues()).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('the generator is not vacuous: it reaches every decision kind', () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(setupArb, fc.array(opArb, { minLength: 20, maxLength: 60 }), (setup, ops) => {
        const cfg: ModelConfig = {
          hourLimit: setup.hourLimit,
          refundsPerDay: setup.refundsPerDay,
          killSwitch: false,
          judgeCredits: setup.judgeCredits,
        };
        const m = new LedgerModel(setup.grant, cfg);
        let now = START;
        for (const op of ops) {
          if (op.t === 'advance') now += op.ms;
          else if (op.t === 'kill') cfg.killSwitch = op.on;
          else if (op.t === 'spend') {
            const d = m.spend(idOf(op.kind, op.key), op.kind, op.cost, now);
            seen.add(
              d.kind === 'refuse'
                ? `spend:${d.reason}`
                : d.kind === 'charge' && d.refill
                  ? 'spend:refill'
                  : `spend:${d.kind}`,
            );
          } else {
            const d = m.refund(idOf(op.kind, op.key), now, op.server);
            seen.add(d.kind === 'refuse' ? `refund:${d.reason}` : `refund:${d.kind}`);
          }
        }
      }),
      { numRuns: 300 },
    );
    for (const k of [
      'spend:charge',
      'spend:replay',
      'spend:insufficient',
      'spend:rate-limit',
      'spend:paused',
      'spend:key-used',
      'spend:refill',
      'refund:refund',
      'refund:replay',
      'refund:not-found',
      'refund:not-refundable',
      'refund:too-old',
      'refund:limit',
    ]) {
      expect(seen, k).toContain(k);
    }
  });
});

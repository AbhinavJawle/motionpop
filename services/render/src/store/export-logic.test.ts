import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_STALL_MS,
  HEARTBEAT_STALL_MS,
  QUEUED_STALL_MS,
  canFinish,
  canHeartbeat,
  canStart,
  decideExport,
  decideProgress,
  isStalled,
  type ExportInput,
} from './logic';
import { makeHarness } from '../testing/harness';

const base: ExportInput = {
  existing: false,
  disabled: false,
  active: null,
  rendersToday: 0,
  dailyLimit: 10,
  cost: 5,
  balance: 20,
  judge: null,
};
const decide = (o: Partial<ExportInput> = {}) => decideExport({ ...base, ...o });

describe('decideExport', () => {
  it('creates, charges and counts the render', () => {
    expect(decide()).toEqual({ kind: 'created', cost: 5, balanceAfter: 15, rendersToday: 1 });
  });

  it('answers an existing render without any other check (idempotent replay)', () => {
    expect(
      decide({ existing: true, disabled: true, active: { id: 'x' }, rendersToday: 99, balance: 0 }),
    ).toEqual({ kind: 'existing' });
  });

  it('rejects in the order disabled, active, daily limit, balance', () => {
    const all = { disabled: true, active: { id: 'r1' }, rendersToday: 10, balance: 0 };
    expect(decide(all)).toMatchObject({ reason: 'disabled' });
    expect(decide({ ...all, disabled: false })).toEqual({
      kind: 'reject',
      reason: 'render-active',
      balance: 0,
      renderId: 'r1',
    });
    expect(decide({ ...all, disabled: false, active: null })).toMatchObject({
      reason: 'daily-limit',
    });
    expect(decide({ ...all, disabled: false, active: null, rendersToday: 0 })).toEqual({
      kind: 'reject',
      reason: 'insufficient-credits',
      balance: 0,
    });
  });

  it('spends the last credits to zero, and the daily limit allows exactly `limit` renders', () => {
    expect(decide({ balance: 5 })).toMatchObject({ kind: 'created', balanceAfter: 0 });
    expect(decide({ rendersToday: 9 })).toMatchObject({ kind: 'created', rendersToday: 10 });
    expect(decide({ rendersToday: 10 })).toMatchObject({ reason: 'daily-limit' });
    expect(decide({ dailyLimit: 0 })).toMatchObject({ reason: 'daily-limit' });
  });

  it('tops a judge up before the charge, once, and not above the allowance', () => {
    const judge = { eligible: true, judgeCredits: 100 };
    expect(decide({ balance: 2, judge })).toEqual({
      kind: 'created',
      cost: 5,
      balanceAfter: 95,
      rendersToday: 1,
      refill: { grant: 98, balanceAfterGrant: 100 },
    });
    expect(decide({ balance: 2, judge: { ...judge, eligible: false } })).toMatchObject({
      reason: 'insufficient-credits',
    });
    expect(decide({ balance: 20, judge })).not.toHaveProperty('refill');
  });

  it('a free (0 credit) export moves no money and still counts', () => {
    expect(decide({ cost: 0, balance: 0 })).toEqual({
      kind: 'created',
      cost: 0,
      balanceAfter: 0,
      rendersToday: 1,
    });
  });

  it('property: a created decision never leaves a negative balance and charges exactly the cost', () => {
    fc.assert(
      fc.property(
        fc.record({
          existing: fc.boolean(),
          disabled: fc.boolean(),
          active: fc.option(fc.record({ id: fc.constant('r') }), { nil: null }),
          rendersToday: fc.nat(12),
          dailyLimit: fc.nat(12),
          cost: fc.integer({ min: 0, max: 12 }),
          balance: fc.nat(30),
          judge: fc.option(
            fc.record({ eligible: fc.boolean(), judgeCredits: fc.integer({ min: 1, max: 60 }) }),
            { nil: null },
          ),
        }),
        (i) => {
          const d = decideExport(i);
          if (d.kind !== 'created') return;
          expect(d.balanceAfter).toBeGreaterThanOrEqual(0);
          expect(d.cost).toBe(i.cost);
          const start = d.refill ? d.refill.balanceAfterGrant : i.balance;
          expect(start - d.cost).toBe(d.balanceAfter);
          expect(d.rendersToday).toBe(i.rendersToday + 1);
          expect(i.rendersToday).toBeLessThan(i.dailyLimit);
          expect(i.existing || i.disabled || i.active !== null).toBe(false);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('isStalled', () => {
  const t0 = 1_700_000_000_000;
  const at = (ms: number) => new Date(ms);
  const doc = (o: Record<string, unknown>) =>
    ({ status: 'queued', createdAt: at(t0), ...o }) as Parameters<typeof isStalled>[0];

  it('a queued render stalls after 5 minutes', () => {
    expect(isStalled(doc({}), t0 + QUEUED_STALL_MS)).toBe(false);
    expect(isStalled(doc({}), t0 + QUEUED_STALL_MS + 1)).toBe(true);
  });

  it('an active render stalls 90 s after its last heartbeat', () => {
    for (const status of ['rendering', 'encoding'] as const) {
      const d = doc({ status, startedAt: at(t0), heartbeatAt: at(t0 + 60_000) });
      expect(isStalled(d, t0 + 60_000 + HEARTBEAT_STALL_MS)).toBe(false);
      expect(isStalled(d, t0 + 60_000 + HEARTBEAT_STALL_MS + 1)).toBe(true);
    }
  });

  it('a started render without a heartbeat is measured from its start', () => {
    const d = doc({ status: 'rendering', startedAt: at(t0 + 1000) });
    expect(isStalled(d, t0 + 1000 + HEARTBEAT_STALL_MS)).toBe(false);
    expect(isStalled(d, t0 + 1000 + HEARTBEAT_STALL_MS + 1)).toBe(true);
  });

  it('an active render with fresh heartbeats stalls after the task timeout plus 2 minutes', () => {
    const fresh = (now: number) =>
      doc({ status: 'rendering', startedAt: at(t0), heartbeatAt: at(now - 1000) });
    expect(isStalled(fresh(t0 + ACTIVE_STALL_MS), t0 + ACTIVE_STALL_MS)).toBe(false);
    expect(isStalled(fresh(t0 + ACTIVE_STALL_MS + 1), t0 + ACTIVE_STALL_MS + 1)).toBe(true);
  });

  it('a final render is never stalled', () => {
    for (const status of ['done', 'error'] as const) {
      expect(isStalled(doc({ status }), t0 + 10 * ACTIVE_STALL_MS)).toBe(false);
    }
  });

  it('reads Firestore-like timestamps', () => {
    const d = doc({ createdAt: { toMillis: () => t0 } });
    expect(isStalled(d, t0 + QUEUED_STALL_MS + 1)).toBe(true);
  });
});

describe('the job-write decisions', () => {
  it('canStart only from queued, canFinish only from encoding, canHeartbeat for active renders', () => {
    const states = ['queued', 'rendering', 'encoding', 'done', 'error'] as const;
    expect(states.filter((status) => canStart({ status }))).toEqual(['queued']);
    expect(states.filter((status) => canFinish({ status }))).toEqual(['encoding']);
    expect(states.filter((status) => canHeartbeat({ status }))).toEqual([
      'queued',
      'rendering',
      'encoding',
    ]);
  });

  it('progress: inactive unless rendering or encoding, never lowers, capped at 99, stage never goes back', () => {
    expect(decideProgress({ status: 'queued', progress: 0 }, 'rendering', 10)).toEqual({
      kind: 'inactive',
    });
    expect(decideProgress({ status: 'done', progress: 100 }, 'encoding', 10)).toEqual({
      kind: 'inactive',
    });
    expect(decideProgress({ status: 'rendering', progress: 40 }, 'rendering', 20)).toEqual({
      kind: 'write',
      status: 'rendering',
      progress: 40,
    });
    expect(decideProgress({ status: 'rendering', progress: 40 }, 'encoding', 100)).toEqual({
      kind: 'write',
      status: 'encoding',
      progress: 99,
    });
    expect(decideProgress({ status: 'encoding', progress: 90 }, 'rendering', 95)).toEqual({
      kind: 'write',
      status: 'encoding',
      progress: 95,
    });
  });

  it('a harness doc is queued and starts', async () => {
    const h = await makeHarness();
    expect(canStart(h.doc)).toBe(true);
  });
});

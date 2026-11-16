import { describe, expect, it } from 'vitest';
import {
  MAX_REFUND_AGE_MS,
  decideRefund,
  decideSpend,
  refundIdOf,
  txMs,
  type RefundInput,
  type SpendInput,
} from './ledger-logic';

const base: SpendInput = {
  kind: 'ai',
  balance: 10,
  cost: 3,
  existing: null,
  refunded: false,
  killSwitch: false,
  hourCount: 0,
  hourLimit: 30,
  judge: null,
};
const spend = (o: Partial<SpendInput> = {}) => decideSpend({ ...base, ...o });

describe('decideSpend', () => {
  it('charges and counts the hour for an AI spend', () => {
    expect(spend()).toEqual({ kind: 'charge', cost: 3, balanceAfter: 7, hourCount: 1 });
  });

  it('does not count an export in the hour', () => {
    expect(spend({ kind: 'export', hourCount: 29 })).toEqual({
      kind: 'charge',
      cost: 3,
      balanceAfter: 7,
      hourCount: 29,
    });
  });

  it('spends the last credits down to exactly zero', () => {
    expect(spend({ balance: 3 })).toMatchObject({ kind: 'charge', balanceAfter: 0 });
  });

  it('refuses below the cost and writes nothing', () => {
    expect(spend({ balance: 2 })).toEqual({ kind: 'refuse', reason: 'insufficient', balance: 2 });
  });

  it('replays the first answer, whatever the balance, limits or kill switch say now', () => {
    const existing = { delta: -3, balanceAfter: 7 };
    for (const o of [
      {},
      { balance: 0 },
      { killSwitch: true },
      { hourCount: 30 },
      { kind: 'export' as const },
    ]) {
      expect(spend({ existing, ...o })).toEqual({ kind: 'replay', balance: 7, cost: 3 });
    }
  });

  it('answers key-used for a refunded spend, even with the kill switch on (review F1)', () => {
    const existing = { delta: -3, balanceAfter: 7 };
    for (const o of [{}, { killSwitch: true }, { balance: 0 }, { kind: 'export' as const }]) {
      expect(spend({ existing, refunded: true, ...o })).toEqual({
        kind: 'refuse',
        reason: 'key-used',
        balance: o.balance ?? 10,
      });
    }
  });

  it('the kill switch refuses both kinds', () => {
    expect(spend({ killSwitch: true })).toMatchObject({ kind: 'refuse', reason: 'paused' });
    expect(spend({ killSwitch: true, kind: 'export' })).toMatchObject({
      kind: 'refuse',
      reason: 'paused',
    });
  });

  it('the kill switch is checked before the rate limit and the balance', () => {
    expect(spend({ killSwitch: true, hourCount: 30, balance: 0 })).toMatchObject({
      reason: 'paused',
    });
  });

  it('rate limits AI spends at the hourly cap, not exports', () => {
    expect(spend({ hourCount: 29 })).toMatchObject({ kind: 'charge', hourCount: 30 });
    expect(spend({ hourCount: 30 })).toMatchObject({ kind: 'refuse', reason: 'rate-limit' });
    expect(spend({ hourCount: 30, kind: 'export' })).toMatchObject({ kind: 'charge' });
  });

  it('a cap of 0 refuses every AI spend', () => {
    expect(spend({ hourLimit: 0 })).toMatchObject({ reason: 'rate-limit' });
  });

  describe('judge refill', () => {
    const judge = { eligible: true, judgeCredits: 500 };

    it('tops up to judgeCredits when the spend would be refused, then charges', () => {
      expect(spend({ balance: 1, judge })).toEqual({
        kind: 'charge',
        cost: 3,
        balanceAfter: 497,
        hourCount: 1,
        refill: { grant: 499, balanceAfterGrant: 500 },
      });
    });

    it('works for an export too', () => {
      expect(spend({ balance: 0, kind: 'export', cost: 5, judge })).toMatchObject({
        kind: 'charge',
        balanceAfter: 495,
        refill: { grant: 500, balanceAfterGrant: 500 },
      });
    });

    it('does nothing when the balance covers the cost', () => {
      expect(spend({ balance: 3, judge })).not.toHaveProperty('refill');
    });

    it('is refused when today’s refill was already paid (once per UTC day)', () => {
      expect(spend({ balance: 0, judge: { eligible: false, judgeCredits: 500 } })).toMatchObject({
        reason: 'insufficient',
      });
    });

    it('never raises the balance above judgeCredits, and cannot pay for a cost above it', () => {
      expect(spend({ balance: 2, cost: 600, judge })).toMatchObject({ reason: 'insufficient' });
      expect(spend({ balance: 600, cost: 700, judge })).toMatchObject({ reason: 'insufficient' });
    });

    it('does not bypass the rate limit or the kill switch', () => {
      expect(spend({ balance: 0, hourCount: 30, judge })).toMatchObject({ reason: 'rate-limit' });
      expect(spend({ balance: 0, killSwitch: true, judge })).toMatchObject({ reason: 'paused' });
    });
  });

  it('rejects impossible inputs', () => {
    expect(() => spend({ cost: 0 })).toThrow(RangeError);
    expect(() => spend({ balance: -1 })).toThrow(RangeError);
    expect(() => spend({ cost: 1.5 })).toThrow(RangeError);
    expect(() => spend({ hourCount: -1 })).toThrow(RangeError);
  });
});

const NOW = Date.UTC(2026, 10, 16, 12);
const rbase: RefundInput = {
  spendId: 's-abcdefgh',
  spend: { delta: -3, reason: 'generate', at: new Date(NOW - 60_000) },
  refundExists: false,
  balance: 7,
  nowMs: NOW,
  refundsToday: 0,
  limit: 30,
  maxAgeMs: MAX_REFUND_AGE_MS,
  server: false,
};
const refund = (o: Partial<RefundInput> = {}) => decideRefund({ ...rbase, ...o });

describe('decideRefund', () => {
  it('gives back the cost', () => {
    expect(refund()).toEqual({ kind: 'refund', amount: 3, balanceAfter: 10 });
  });

  it('refuses a missing spend', () => {
    expect(refund({ spend: null })).toEqual({ kind: 'refuse', reason: 'not-found' });
  });

  it('refuses entries that are not spends', () => {
    for (const reason of ['refund', 'judge-grant', 'signup'] as const) {
      expect(refund({ spend: { delta: 5, reason, at: new Date(NOW) } })).toEqual({
        kind: 'refuse',
        reason: 'not-refundable',
      });
      expect(refund({ spend: { delta: -5, reason, at: new Date(NOW) }, server: true })).toEqual({
        kind: 'refuse',
        reason: 'not-refundable',
      });
    }
    expect(refund({ spend: { delta: 0, reason: 'generate', at: new Date(NOW) } })).toMatchObject({
      reason: 'not-refundable',
    });
  });

  it('a client never refunds an export entry; the server does', () => {
    expect(refund({ spendId: 'export-abcdefgh' })).toEqual({
      kind: 'refuse',
      reason: 'not-refundable',
    });
    expect(refund({ spendId: 'export-abcdefgh', server: true })).toMatchObject({ kind: 'refund' });
  });

  it('answers an existing refund as a replay, without counting against the cap or the age', () => {
    expect(
      refund({ refundExists: true, refundsToday: 30, spend: { ...rbase.spend!, at: new Date(0) } }),
    ).toEqual({
      kind: 'replay',
      balance: 7,
    });
  });

  it('refuses a client refund after 15 minutes, but not at exactly 15', () => {
    const at = (age: number) => ({
      delta: -3,
      reason: 'generate' as const,
      at: new Date(NOW - age),
    });
    expect(refund({ spend: at(MAX_REFUND_AGE_MS) })).toMatchObject({ kind: 'refund' });
    expect(refund({ spend: at(MAX_REFUND_AGE_MS + 1) })).toEqual({
      kind: 'refuse',
      reason: 'too-old',
    });
    expect(refund({ spend: at(MAX_REFUND_AGE_MS + 1), server: true })).toMatchObject({
      kind: 'refund',
    });
  });

  it('refuses at the daily cap for a client, never for the server', () => {
    expect(refund({ refundsToday: 29 })).toMatchObject({ kind: 'refund' });
    expect(refund({ refundsToday: 30 })).toEqual({ kind: 'refuse', reason: 'limit' });
    expect(refund({ refundsToday: 30, server: true })).toMatchObject({ kind: 'refund' });
  });

  it('reads a Firestore-like timestamp', () => {
    expect(txMs({ toMillis: () => 42 })).toBe(42);
    expect(txMs(new Date(42))).toBe(42);
    expect(
      refund({ spend: { delta: -3, reason: 'generate', at: { toMillis: () => NOW - 1000 } } }),
    ).toMatchObject({
      kind: 'refund',
    });
  });
});

describe('refundIdOf', () => {
  it('pairs the two id schemes', () => {
    expect(refundIdOf('s-abc12345')).toBe('r-abc12345');
    expect(refundIdOf('export-r1')).toBe('refund-r1');
    expect(() => refundIdOf('signup')).toThrow(RangeError);
    expect(() => refundIdOf('judge-upgrade')).toThrow(RangeError);
  });
});

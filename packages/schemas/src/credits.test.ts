import { describe, expect, it } from 'vitest';
import {
  ClientCreditActionSchema,
  CreditActionSchema,
  CreditCostsSchema,
  CreditReasonSchema,
  REASON_FOR,
  RefundRequestSchema,
  RefundResponseSchema,
  SpendRequestSchema,
  SpendResponseSchema,
  UNIT_ACTIONS,
} from './index';

const KEY = 'k'.repeat(16);

describe('actions', () => {
  it('a client may not spend on export', () => {
    expect(ClientCreditActionSchema.safeParse('export').success).toBe(false);
    for (const a of CreditActionSchema.options) {
      expect(ClientCreditActionSchema.safeParse(a).success).toBe(a !== 'export');
    }
  });

  it('every action has a ledger reason the user schema knows', () => {
    for (const a of CreditActionSchema.options) {
      expect(CreditReasonSchema.safeParse(REASON_FOR[a]).success).toBe(true);
    }
    expect(CreditReasonSchema.safeParse('edit').success).toBe(true);
    expect(CreditReasonSchema.safeParse('image').success).toBe(true);
  });
});

describe('SpendRequestSchema', () => {
  it('defaults units to 1 and accepts a good key', () => {
    expect(SpendRequestSchema.parse({ action: 'generate', key: KEY })).toEqual({
      action: 'generate',
      key: KEY,
      units: 1,
    });
  });

  it.each(UNIT_ACTIONS)('accepts units 2 for %s', (action) => {
    expect(SpendRequestSchema.safeParse({ action, key: KEY, units: 2 }).success).toBe(true);
  });

  it.each(['generate', 'edit', 'pip-plan', 'custom', 'image'])(
    'rejects units 2 for the fixed-price action %s, accepts units 1',
    (action) => {
      expect(SpendRequestSchema.safeParse({ action, key: KEY, units: 2 }).success).toBe(false);
      expect(SpendRequestSchema.safeParse({ action, key: KEY, units: 1 }).success).toBe(true);
    },
  );

  it.each([
    ['export', { action: 'export', key: KEY }],
    ['short key', { action: 'generate', key: 'short' }],
    ['key with a slash', { action: 'generate', key: 'a/b/c/d/e/f/g/h' }],
    ['key too long', { action: 'generate', key: 'k'.repeat(65) }],
    ['zero units', { action: 'tts', key: KEY, units: 0 }],
    ['21 units', { action: 'tts', key: KEY, units: 21 }],
    ['fractional units', { action: 'tts', key: KEY, units: 1.5 }],
    ['unknown action', { action: 'free-stuff', key: KEY }],
    ['long refId', { action: 'generate', key: KEY, refId: 'x'.repeat(81) }],
    ['units sent as a string', { action: 'edit', key: KEY, units: '1' }],
  ])('rejects %s', (_, body) => {
    expect(SpendRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('responses', () => {
  it('a spend refusal carries the balance and one of the four reasons, including key-used', () => {
    for (const reason of ['insufficient', 'rate-limit', 'paused', 'key-used']) {
      expect(SpendResponseSchema.safeParse({ ok: false, reason, balance: 0 }).success).toBe(true);
    }
    expect(SpendResponseSchema.safeParse({ ok: false, reason: 'nope', balance: 0 }).success).toBe(
      false,
    );
  });

  it('a successful spend needs a positive cost and a non-negative integer balance', () => {
    const ok = { ok: true, txId: `s-${KEY}`, balance: 5, cost: 3 };
    expect(SpendResponseSchema.safeParse(ok).success).toBe(true);
    expect(SpendResponseSchema.safeParse({ ...ok, cost: 0 }).success).toBe(false);
    expect(SpendResponseSchema.safeParse({ ...ok, balance: -1 }).success).toBe(false);
  });

  it('refund requests take only s- ids, never export-*, refund-*, r-* or grants', () => {
    expect(RefundRequestSchema.safeParse({ txId: `s-${KEY}` }).success).toBe(true);
    for (const txId of [
      'export-abcdefgh',
      'refund-abcdefgh',
      `r-${KEY}`,
      'signup',
      'judge-upgrade',
      's-short',
      `s-${KEY}/x`,
    ]) {
      expect(RefundRequestSchema.safeParse({ txId }).success).toBe(false);
    }
  });

  it('refund responses', () => {
    expect(
      RefundResponseSchema.safeParse({ ok: true, balance: 3, alreadyRefunded: false }).success,
    ).toBe(true);
    for (const reason of ['not-found', 'not-refundable', 'too-old', 'limit']) {
      expect(RefundResponseSchema.safeParse({ ok: false, reason }).success).toBe(true);
    }
  });
});

describe('CreditCostsSchema', () => {
  it('accepts partial overrides of AI actions only', () => {
    expect(CreditCostsSchema.safeParse({ generate: 2 }).success).toBe(true);
    expect(CreditCostsSchema.safeParse({}).success).toBe(true);
    expect(CreditCostsSchema.safeParse({ export: 2 }).success).toBe(false);
    expect(CreditCostsSchema.safeParse({ generate: 0 }).success).toBe(false);
  });
});

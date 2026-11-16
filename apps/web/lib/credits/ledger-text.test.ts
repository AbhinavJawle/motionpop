import { CreditReasonSchema } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REASON_TEXT, costRows, planLine, relativeTime, signedDelta } from './ledger-text';

describe('ledger text', () => {
  it('has words for every ledger reason', () => {
    for (const r of CreditReasonSchema.options) expect(REASON_TEXT[r]).toBeTruthy();
    expect(REASON_TEXT.signup).toBe('Welcome credits');
    expect(REASON_TEXT.refund).toBe('Refund');
    expect(REASON_TEXT['judge-grant']).toBe('Judge top-up');
  });

  it('writes signed deltas with a real minus sign', () => {
    expect(signedDelta(3)).toBe('+3');
    expect(signedDelta(-3)).toBe('\u22123');
    expect(signedDelta(0)).toBe('0');
  });

  it('relative time steps', () => {
    const now = 1_700_000_000_000;
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2 d ago');
    expect(relativeTime(now - 30 * 86_400_000, now)).toBe('2023-10-15');
    expect(relativeTime(now + 5000, now)).toBe('just now');
  });

  it('property: relative time never throws and is never empty', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2e12 }), fc.integer({ min: 0, max: 2e12 }), (a, b) => {
        expect(relativeTime(a, b).length).toBeGreaterThan(0);
      }),
    );
  });

  it('prices come from costOf and follow Remote Config overrides', () => {
    const rows = costRows();
    expect(rows.map((r) => [r.label, r.credits])).toEqual([
      ['Generate a graphic', 3],
      ['Cloud quick edit', 1],
      ['Pip plan', 2],
      ['Export 1080p', 5],
    ]);
    const cheaper = costRows({
      creditCosts: { generate: 2 },
      imageCredits: 3,
      exportCredits: undefined as never,
    });
    expect(cheaper[0]?.credits).toBe(2);
  });

  it('plan lines', () => {
    expect(planLine('free', 20)).toBe('Free plan · 20 credits on sign-up');
    expect(planLine('judge', 20)).toBe('Judge plan · topped up daily');
    expect(planLine(null, 20)).toBe('');
  });
});

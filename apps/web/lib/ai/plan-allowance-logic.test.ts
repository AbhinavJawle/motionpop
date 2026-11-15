import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DayKeySchema } from '@motionpop/schemas';
import { decideAllowance, PlanAllowanceResponseSchema, utcDayKey } from './plan-allowance-logic';

const DAY_MS = 86_400_000;
// 1970-01-01 to 9999-12-31: keys stay four-digit years.
const instant = fc.integer({ min: 0, max: Date.UTC(9999, 11, 31, 23, 59, 59, 999) });

describe('utcDayKey', () => {
  it('switches day exactly at UTC midnight', () => {
    expect(utcDayKey(Date.UTC(2026, 10, 15, 23, 59, 59, 999))).toBe('2026-11-15');
    expect(utcDayKey(Date.UTC(2026, 10, 16, 0, 0, 0, 0))).toBe('2026-11-16');
    expect(utcDayKey(Date.UTC(2026, 11, 31, 23, 59, 59, 999))).toBe('2026-12-31');
    expect(utcDayKey(Date.UTC(2027, 0, 1))).toBe('2027-01-01');
    expect(utcDayKey(Date.UTC(2028, 1, 29, 12))).toBe('2028-02-29');
  });

  it('property: one key per UTC day, valid as a doc id, new key one ms before the day starts', () => {
    fc.assert(
      fc.property(instant, (ms) => {
        const dayStart = ms - (ms % DAY_MS);
        const key = utcDayKey(ms);
        expect(DayKeySchema.safeParse(key).success).toBe(true);
        expect(utcDayKey(dayStart)).toBe(key);
        expect(utcDayKey(dayStart + DAY_MS - 1)).toBe(key);
        if (dayStart > 0) expect(utcDayKey(dayStart - 1)).not.toBe(key);
      }),
    );
  });
});

describe('decideAllowance', () => {
  it('allows below the limit and counts the call; denies at or over it', () => {
    expect(decideAllowance(0, 10)).toEqual({ allowed: true, used: 1, limit: 10 });
    expect(decideAllowance(9, 10)).toEqual({ allowed: true, used: 10, limit: 10 });
    expect(decideAllowance(10, 10)).toEqual({
      allowed: false,
      reason: 'limit',
      used: 10,
      limit: 10,
    });
    // A limit lowered during the day: deny, report the stored count as it is.
    expect(decideAllowance(7, 3)).toEqual({ allowed: false, reason: 'limit', used: 7, limit: 3 });
    expect(decideAllowance(0, 0)).toEqual({ allowed: false, reason: 'limit', used: 0, limit: 0 });
  });

  it('rejects counts and limits that are not non-negative integers', () => {
    for (const [used, limit] of [
      [-1, 10],
      [1.5, 10],
      [0, -1],
      [0, Number.NaN],
    ] as const) {
      expect(() => decideAllowance(used, limit)).toThrow(RangeError);
    }
  });

  it('property: allowed iff used < limit; the next count is used + 1 and never above the limit', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1000 }), fc.nat({ max: 1000 }), (used, limit) => {
        const d = decideAllowance(used, limit);
        expect(d.allowed).toBe(used < limit);
        expect(d.limit).toBe(limit);
        if (d.allowed) {
          expect(d.used).toBe(used + 1);
          expect(d.used).toBeLessThanOrEqual(limit);
        } else {
          expect(d.used).toBe(used);
        }
      }),
    );
  });

  it('property: n calls in a day allow exactly min(n, limit) and the count stops at the limit', () => {
    fc.assert(
      fc.property(fc.nat({ max: 60 }), fc.nat({ max: 30 }), (n, limit) => {
        let stored = 0;
        let allowed = 0;
        for (let k = 0; k < n; k++) {
          const d = decideAllowance(stored, limit);
          if (d.allowed) {
            stored = d.used;
            allowed++;
          }
          expect(stored).toBeLessThanOrEqual(limit);
        }
        expect(allowed).toBe(Math.min(n, limit));
        expect(stored).toBe(Math.min(n, limit));
      }),
    );
  });
});

describe('PlanAllowanceResponseSchema', () => {
  it('accepts both answers and nothing else', () => {
    const ok = (v: unknown) => PlanAllowanceResponseSchema.safeParse(v).success;
    expect(ok({ allowed: true, used: 1, limit: 10 })).toBe(true);
    expect(ok({ allowed: false, reason: 'limit', used: 10, limit: 10 })).toBe(true);
    expect(ok({ allowed: false, reason: 'unavailable', used: 0, limit: 10 })).toBe(false);
    expect(ok({ allowed: false, used: 10, limit: 10 })).toBe(false);
    expect(ok({ allowed: true, used: -1, limit: 10 })).toBe(false);
    expect(ok({ error: 'Invalid ID token' })).toBe(false);
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clampMove, clampResize, GLOBAL_LIMITS, limitsFor, type SlotRange } from './constraints';

const DURATION = 60_000;

/** Non-overlapping slots (touching allowed) inside [0, DURATION]. */
const slotsArb = fc
  .array(fc.tuple(fc.integer({ min: 0, max: 3000 }), fc.integer({ min: 1, max: 6000 })), {
    minLength: 1,
    maxLength: 6,
  })
  .map((parts) => {
    let t = 0;
    const out: SlotRange[] = [];
    parts.forEach(([gap, len], i) => {
      const startMs = t + gap;
      const endMs = startMs + len;
      out.push({ id: `s${i}`, startMs, endMs, componentId: 'x' });
      t = endMs;
    });
    return out;
  });

function noOverlap(slots: SlotRange[]) {
  const s = [...slots].sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < s.length; i++)
    expect(s[i]?.startMs).toBeGreaterThanOrEqual(s[i - 1]?.endMs ?? 0);
}

describe('limitsFor', () => {
  it('unknown id gives the global limits', () => {
    expect(limitsFor('nope')).toEqual(GLOBAL_LIMITS);
    expect(limitsFor('__proto__')).toEqual(GLOBAL_LIMITS);
  });
  it('big-number is within the global limits', () => {
    const l = limitsFor('big-number');
    expect(l.minMs).toBeGreaterThanOrEqual(GLOBAL_LIMITS.minMs);
    expect(l.maxMs).toBeLessThanOrEqual(GLOBAL_LIMITS.maxMs);
  });
});

describe('clampMove', () => {
  it('keeps duration, never overlaps, stays in bounds', () => {
    fc.assert(
      fc.property(
        slotsArb,
        fc.nat(5),
        fc.integer({ min: -5000, max: 80_000 }),
        (slots, k, want) => {
          const self = slots[k % slots.length];
          if (!self || self.endMs > DURATION) return;
          const start = clampMove(slots, self.id, want, DURATION);
          const len = self.endMs - self.startMs;
          expect(Number.isInteger(start)).toBe(true);
          expect(start).toBeGreaterThanOrEqual(0);
          expect(start + len).toBeLessThanOrEqual(DURATION);
          noOverlap(
            slots.map((s) => (s.id === self.id ? { ...s, startMs: start, endMs: start + len } : s)),
          );
        },
      ),
    );
  });
});

describe('clampResize', () => {
  it('never overlaps or leaves bounds, and respects limits when the gap allows', () => {
    fc.assert(
      fc.property(
        slotsArb,
        fc.nat(5),
        fc.constantFrom('start' as const, 'end' as const),
        fc.integer({ min: -5000, max: 80_000 }),
        (slots, k, edge, want) => {
          const self = slots[k % slots.length];
          if (!self || self.endMs > DURATION) return;
          const limits = GLOBAL_LIMITS;
          const v = clampResize(slots, self.id, edge, want, limits, DURATION);
          const next = edge === 'start' ? { ...self, startMs: v } : { ...self, endMs: v };
          expect(Number.isInteger(v)).toBe(true);
          expect(next.startMs).toBeGreaterThanOrEqual(0);
          expect(next.endMs).toBeLessThanOrEqual(DURATION);
          expect(next.endMs).toBeGreaterThan(next.startMs);
          noOverlap(slots.map((s) => (s.id === self.id ? next : s)));

          const others = slots.filter((s) => s.id !== self.id);
          const prevEnd = Math.max(
            0,
            ...others.filter((s) => s.endMs <= self.startMs).map((s) => s.endMs),
          );
          const nextStart = Math.min(
            DURATION,
            ...others.filter((s) => s.startMs >= self.endMs).map((s) => s.startMs),
          );
          const room = edge === 'start' ? self.endMs - prevEnd : nextStart - self.startMs;
          if (room >= limits.minMs) {
            const d = next.endMs - next.startMs;
            expect(d).toBeGreaterThanOrEqual(limits.minMs);
            expect(d).toBeLessThanOrEqual(limits.maxMs);
          }
        },
      ),
    );
  });
});

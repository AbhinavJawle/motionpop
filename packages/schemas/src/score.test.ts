import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { ENERGY_INTERVAL_MS, EnergySchema, ScoreSchema, readTimeMs } from './score';

const beat = fc.record({ cue: fc.string({ minLength: 1 }), word: fc.nat({ max: 500 }) });
const image = fc.record(
  {
    role: fc.string({ minLength: 1 }),
    subject: fc.string({ minLength: 1, maxLength: 120 }),
    assetId: fc.string({ minLength: 1 }),
  },
  { requiredKeys: ['role', 'subject'] },
);
const score = fc.record(
  {
    variant: fc.string({ minLength: 1 }),
    content: fc.dictionary(
      fc.string().filter((k) => k !== '__proto__'),
      fc.oneof(fc.string(), fc.integer(), fc.boolean()),
    ),
    beats: fc.array(beat, { maxLength: 8 }),
    images: fc.array(image, { maxLength: 3 }),
  },
  { requiredKeys: ['content'] },
);

describe('ScoreSchema', () => {
  it('round-trips random valid scores', () => {
    fc.assert(
      fc.property(score, (s) => {
        const first = ScoreSchema.parse(s);
        expect(ScoreSchema.parse(first)).toEqual(first);
        expect(first.beats).toEqual(s.beats ?? []);
        expect(first.images).toEqual(s.images ?? []);
      }),
    );
  });

  it('fills beats and images with empty arrays', () => {
    expect(ScoreSchema.parse({ content: {} })).toEqual({ content: {}, beats: [], images: [] });
  });

  it('rejects more than 8 beats or 3 images', () => {
    const b = { cue: 'a', word: 0 };
    const i = { role: 'hero', subject: 'a ship' };
    expect(ScoreSchema.safeParse({ content: {}, beats: Array(8).fill(b) }).success).toBe(true);
    expect(ScoreSchema.safeParse({ content: {}, beats: Array(9).fill(b) }).success).toBe(false);
    expect(ScoreSchema.safeParse({ content: {}, images: Array(3).fill(i) }).success).toBe(true);
    expect(ScoreSchema.safeParse({ content: {}, images: Array(4).fill(i) }).success).toBe(false);
  });

  it('rejects a subject over 120 characters, accepts exactly 120', () => {
    const img = (n: number) => ({ content: {}, images: [{ role: 'r', subject: 'x'.repeat(n) }] });
    expect(ScoreSchema.safeParse(img(120)).success).toBe(true);
    expect(ScoreSchema.safeParse(img(121)).success).toBe(false);
  });

  it('rejects negative or fractional beat words and empty cue ids', () => {
    expect(ScoreSchema.safeParse({ content: {}, beats: [{ cue: 'a', word: -1 }] }).success).toBe(
      false,
    );
    expect(ScoreSchema.safeParse({ content: {}, beats: [{ cue: 'a', word: 1.5 }] }).success).toBe(
      false,
    );
    expect(ScoreSchema.safeParse({ content: {}, beats: [{ cue: '', word: 0 }] }).success).toBe(
      false,
    );
  });

  it('requires content', () => {
    expect(ScoreSchema.safeParse({}).success).toBe(false);
  });
});

describe('readTimeMs', () => {
  it('is 800 for 0 to 3 words', () => {
    for (const n of [0, 1, 2, 3]) expect(readTimeMs(n)).toBe(800);
  });
  it('adds 200 per word beyond three', () => {
    expect(readTimeMs(4)).toBe(1000);
    expect(readTimeMs(10)).toBe(2200);
  });
  it('is monotonic and never below 800', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1000 }), fc.nat({ max: 1000 }), (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(readTimeMs(lo)).toBeLessThanOrEqual(readTimeMs(hi));
        expect(readTimeMs(lo)).toBeGreaterThanOrEqual(800);
      }),
    );
  });
});

describe('ENERGY_INTERVAL_MS', () => {
  it('has a positive entry for every energy, strictly decreasing calm to hype', () => {
    const order = ['calm', 'steady', 'lively', 'hype'] as const;
    expect([...EnergySchema.options]).toEqual([...order]);
    for (const e of order) expect(ENERGY_INTERVAL_MS[e]).toBeGreaterThan(0);
    for (let i = 1; i < order.length; i++) {
      expect(ENERGY_INTERVAL_MS[order[i]!]).toBeLessThan(ENERGY_INTERVAL_MS[order[i - 1]!]);
    }
  });
});

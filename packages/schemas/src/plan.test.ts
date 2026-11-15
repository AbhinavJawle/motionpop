import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { DirectorPlanSchema } from './plan';
import { EnergySchema } from './score';

const idx = fc.nat({ max: 59 });
const plan = fc.record(
  {
    arc: fc.array(fc.record({ slot: idx, energy: fc.constantFrom(...EnergySchema.options) }), {
      maxLength: 60,
    }),
    peak: idx,
    scenes: fc.array(
      fc.record(
        { slot: idx, sceneId: fc.string({ minLength: 1 }), variant: fc.string({ minLength: 1 }) },
        { requiredKeys: ['slot', 'sceneId'] },
      ),
      { maxLength: 60 },
    ),
    motifs: fc.array(
      fc.record({ motif: fc.string({ minLength: 1 }), slots: fc.array(idx, { maxLength: 60 }) }),
      { maxLength: 6 },
    ),
    images: fc.array(idx, { maxLength: 20 }),
    reasons: fc.array(fc.string({ maxLength: 160 }), { maxLength: 60 }),
  },
  { requiredKeys: ['arc', 'peak', 'scenes', 'motifs', 'images'] },
);

const base = () => ({
  arc: [{ slot: 0, energy: 'calm' }],
  peak: 0,
  scenes: [{ slot: 0, sceneId: 'big-number' }],
  motifs: [{ motif: 'red circle', slots: [0] }],
  images: [0],
});

describe('DirectorPlanSchema', () => {
  it('parses a valid plan', () => {
    expect(DirectorPlanSchema.safeParse(base()).success).toBe(true);
  });
  it('round-trips random valid plans', () => {
    fc.assert(
      fc.property(plan, (p) => {
        const first = DirectorPlanSchema.parse(p);
        expect(DirectorPlanSchema.parse(first)).toEqual(first);
      }),
    );
  });
  it('rejects negative or fractional slot indices anywhere', () => {
    for (const bad of [-1, 1.5]) {
      expect(DirectorPlanSchema.safeParse({ ...base(), peak: bad }).success).toBe(false);
      expect(
        DirectorPlanSchema.safeParse({ ...base(), arc: [{ slot: bad, energy: 'calm' }] }).success,
      ).toBe(false);
      expect(
        DirectorPlanSchema.safeParse({ ...base(), scenes: [{ slot: bad, sceneId: 'x' }] }).success,
      ).toBe(false);
      expect(
        DirectorPlanSchema.safeParse({ ...base(), motifs: [{ motif: 'm', slots: [bad] }] }).success,
      ).toBe(false);
      expect(DirectorPlanSchema.safeParse({ ...base(), images: [bad] }).success).toBe(false);
    }
  });
  it('rejects an unknown energy and an empty scene id', () => {
    expect(
      DirectorPlanSchema.safeParse({ ...base(), arc: [{ slot: 0, energy: 'wild' }] }).success,
    ).toBe(false);
    expect(
      DirectorPlanSchema.safeParse({ ...base(), scenes: [{ slot: 0, sceneId: '' }] }).success,
    ).toBe(false);
  });
  it('enforces the caps', () => {
    const arc = (n: number) => Array.from({ length: n }, (_, slot) => ({ slot, energy: 'calm' }));
    const scenes = (n: number) => Array.from({ length: n }, (_, slot) => ({ slot, sceneId: 's' }));
    const ok = (o: object) => DirectorPlanSchema.safeParse({ ...base(), ...o }).success;
    expect(ok({ arc: arc(60) })).toBe(true);
    expect(ok({ arc: arc(61) })).toBe(false);
    expect(ok({ scenes: scenes(60) })).toBe(true);
    expect(ok({ scenes: scenes(61) })).toBe(false);
    expect(ok({ images: Array(20).fill(0) })).toBe(true);
    expect(ok({ images: Array(21).fill(0) })).toBe(false);
    const motif = { motif: 'm', slots: [0] };
    expect(ok({ motifs: Array(6).fill(motif) })).toBe(true);
    expect(ok({ motifs: Array(7).fill(motif) })).toBe(false);
    expect(ok({ motifs: [{ motif: 'm', slots: Array(61).fill(0) }] })).toBe(false);
    expect(ok({ reasons: Array(61).fill('r') })).toBe(false);
    expect(ok({ reasons: ['x'.repeat(161)] })).toBe(false);
    expect(ok({ reasons: ['x'.repeat(160)] })).toBe(true);
  });
});

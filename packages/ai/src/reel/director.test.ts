import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  checkReelDirect,
  minReelScenes,
  REEL_SCENE_MAX_MS,
  reelDirectJsonSchema,
  reelTemplateDirectTask,
  type ReelDirectInput,
  type ReelDirectOutput,
} from './director';

type Json = Record<string, unknown>;
const prop = (node: unknown, key: string): Json =>
  ((node as Json).properties as Record<string, Json>)[key]!;

describe('reelDirectJsonSchema (spec 39 AI QA)', () => {
  // Regression: with minItems/maxItems on `scenes` or `brands` (on top of the string caps) Vertex
  // refused the schema with 400 INVALID_ARGUMENT on every Gemini model, and every reel silently
  // fell back to the free director. Scene count is enforced by `checkReelDirect` instead.
  // Any new bound here must first pass `scripts/schema-live-check.ts` against the real endpoint.
  it('puts no item bounds on the scenes and brands arrays', () => {
    const schema = reelDirectJsonSchema();
    for (const key of ['scenes', 'brands']) {
      const arr = prop(schema, key);
      expect(arr.type).toBe('array');
      expect(arr).not.toHaveProperty('minItems');
      expect(arr).not.toHaveProperty('maxItems');
    }
  });

  it('caps story.arc at 12 items', () => {
    const arc = prop(prop(reelDirectJsonSchema(), 'story'), 'arc');
    expect(arc.maxItems).toBe(12);
    expect(arc).not.toHaveProperty('minItems');
  });

  it('is wired as the reel.direct check', () => {
    expect(reelTemplateDirectTask().check).toBe(checkReelDirect);
  });
});

/** An evenly spaced transcript: word i starts at i × gap. */
function input(n: number, gap: number, durationMs: number): ReelDirectInput {
  return {
    look: 'mono',
    durationMs,
    words: Array.from({ length: n }, (_, i) => [i, i * gap, `w${i}`] as [number, number, string]),
    frames: [],
  };
}

function answer(starts: readonly number[], n: number): ReelDirectOutput {
  const sorted = [...starts].sort((a, b) => a - b);
  return {
    scenes: sorted.map((fromWord, k) => ({
      fromWord,
      toWord: (sorted[k + 1] ?? n) - 1,
      layout: 'split',
      graphic: { template: 'none' },
    })),
  };
}

const reel = fc
  .record({
    n: fc.integer({ min: 12, max: 250 }),
    gap: fc.integer({ min: 300, max: 700 }),
    tail: fc.integer({ min: 0, max: 1000 }),
  })
  .map(({ n, gap, tail }) => ({ n, gap, durationMs: n * gap + tail }))
  .filter((r) => r.durationMs >= 8000);

describe('checkReelDirect (spec 39 AI QA)', () => {
  it('rejects fewer distinct scene starts than minReelScenes', () => {
    fc.assert(
      fc.property(
        reel.chain((r) => {
          const min = minReelScenes(input(r.n, r.gap, r.durationMs))!;
          return fc.record({
            r: fc.constant(r),
            min: fc.constant(min),
            starts: fc.uniqueArray(fc.integer({ min: 0, max: r.n - 1 }), {
              minLength: 1,
              maxLength: min - 1,
            }),
            dupes: fc.boolean(),
          });
        }),
        ({ r, min, starts, dupes }) => {
          expect(min).toBeGreaterThanOrEqual(2);
          // Repeated starts do not count as extra scenes.
          const out = answer(dupes ? [...starts, ...starts] : starts, r.n);
          expect(checkReelDirect(out, input(r.n, r.gap, r.durationMs))).not.toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });

  it('accepts an answer that tiles the words in at least min scenes of at most 9 s', () => {
    fc.assert(
      fc.property(reel, ({ n, gap, durationMs }) => {
        const inp = input(n, gap, durationMs);
        const min = minReelScenes(inp)!;
        const m = Math.min(n, Math.max(min, Math.ceil(durationMs / 6000)));
        const starts = Array.from({ length: m }, (_, k) => Math.floor((k * n) / m));
        // The scenes really are ≤ 9 s (the last one runs to the end of the reel).
        starts.forEach((s, k) => {
          const to = k + 1 < m ? starts[k + 1]! * gap : durationMs;
          expect(to - s * gap).toBeLessThanOrEqual(REEL_SCENE_MAX_MS);
        });
        expect(checkReelDirect(answer(starts, n), inp)).toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  it('rejects one scene longer than 45 % of a 40 s reel', () => {
    const inp = input(100, 400, 40_000);
    expect(minReelScenes(inp)).toBe(6);
    // Word 0 runs to word 50 (20 s > 18 s); six more scenes cover the rest.
    const starts = [0, 50, 58, 66, 75, 83, 91];
    const msg = checkReelDirect(answer(starts, 100), inp);
    expect(msg).toContain('word 0');
    expect(msg).toContain('18 s');
    // The same reel split at word 25 passes.
    expect(checkReelDirect(answer([0, 25, ...starts.slice(1)], 100), inp)).toBeNull();
  });

  it('asks for nothing on a very short reel', () => {
    expect(minReelScenes(input(11, 1000, 11_000))).toBeUndefined();
    expect(minReelScenes(input(30, 200, 7_000))).toBeUndefined();
    expect(checkReelDirect(answer([0], 30), input(30, 200, 7_000))).toBeNull();
  });
});

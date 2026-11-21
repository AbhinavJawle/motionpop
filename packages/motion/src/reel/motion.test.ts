import type { ReelScene } from '@motionpop/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  cutsFromSegments,
  focusAt,
  framingChanges,
  sentenceStarts,
  punchChanges,
  punchLevelAt,
  transKind,
  transLength,
} from './motion';

const scene = (layout: ReelScene['layout']): ReelScene =>
  ({
    startMs: 0,
    endMs: 1000,
    layout,
    content: { template: layout === 'speaker' ? 'none' : 'headline', title: 'x' },
  }) as unknown as ReelScene;

describe('reel motion (spec 27)', () => {
  it('picks the hand-over from the two layouts', () => {
    expect(transKind(scene('split'), scene('split'), false)).toBe('push');
    expect(transKind(scene('split'), scene('speaker'), false)).toBe('morph');
    expect(transKind(scene('speaker'), scene('card'), false)).toBe('morph');
    expect(transKind(scene('split'), scene('full'), false)).toBe('reveal');
    expect(transKind(scene('full'), scene('speaker'), false)).toBe('reveal');
    expect(transKind(scene('full'), scene('full'), false)).toBe('push');
    expect(transKind(scene('speaker'), scene('speaker'), false)).toBe('overlay');
    expect(transKind(scene('split'), scene('split'), true)).toBe('none');
    expect(transLength('none')).toBe(0);
    expect(transLength('morph')).toBeGreaterThan(transLength('push'));
  });

  it('puts a cut at every join between kept segments', () => {
    expect(
      cutsFromSegments([
        { srcStartMs: 0, srcEndMs: 1200 },
        { srcStartMs: 1800, srcEndMs: 3000 },
        { srcStartMs: 3500, srcEndMs: 4000 },
      ]),
    ).toEqual([1200, 2400]);
    expect(cutsFromSegments([{ srcStartMs: 0, srcEndMs: 5000 }])).toEqual([]);
  });

  it('framing changes are sorted, spaced and alternate', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100, max: 60_000 }), { maxLength: 60 }),
        fc.integer({ min: 0, max: 60_000 }),
        (cuts, t) => {
          const ch = punchChanges(cuts, 700);
          for (let i = 0; i < ch.length; i++) {
            expect(ch[i]!).toBeGreaterThan(0);
            expect(ch[i]! - (i ? ch[i - 1]! : 0)).toBeGreaterThanOrEqual(700);
          }
          const n = ch.filter((c) => c <= t).length;
          expect(punchLevelAt(ch, t)).toBe(n % 2);
        },
      ),
    );
  });

  it('the face position stays in frame and hits every key', () => {
    const key = fc.record({
      atMs: fc.integer({ min: 0, max: 60_000 }),
      x: fc.double({ min: 0, max: 1, noNaN: true }),
      y: fc.double({ min: 0, max: 1, noNaN: true }),
    });
    fc.assert(
      fc.property(fc.array(key, { maxLength: 12 }), fc.integer({ min: -500, max: 70_000 }), (ks, t) => {
        const keys = [...ks].sort((a, b) => a.atMs - b.atMs);
        const f = focusAt(keys, t, { x: 0.5, y: 0.3 });
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.x).toBeLessThanOrEqual(1);
        expect(f.y).toBeGreaterThanOrEqual(0);
        expect(f.y).toBeLessThanOrEqual(1);
        if (keys.length === 0) expect(f).toEqual({ x: 0.5, y: 0.3 });
      }),
    );
    const keys = [
      { atMs: 0, x: 0.2, y: 0.3 },
      { atMs: 1000, x: 0.6, y: 0.5 },
    ];
    expect(focusAt(keys, 1000, { x: 0, y: 0 })).toEqual({ x: 0.6, y: 0.5 });
    expect(focusAt(keys, 500, { x: 0, y: 0 }).x).toBeCloseTo(0.4, 5);
  });

  it('adds sentence starts to the framing rhythm, never crowding a cut', () => {
    const words = [
      { text: 'One.', startMs: 0 },
      { text: 'Two', startMs: 3000 },
      { text: 'three!', startMs: 3400 },
      { text: 'Four', startMs: 6200 },
    ];
    expect(sentenceStarts(words)).toEqual([3000, 6200]);
    expect(framingChanges([], [3000, 6200])).toEqual([3000, 6200]);
    expect(framingChanges([], [3000, 4500])).toEqual([3000]);
    expect(framingChanges([5000], [3000, 9000])).toEqual([5000, 9000]);
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 60_000 }), { maxLength: 30 }),
        fc.array(fc.integer({ min: 1, max: 60_000 }), { maxLength: 30 }),
        (cuts, sents) => {
          const ch = framingChanges(cuts, sents);
          for (let i = 1; i < ch.length; i++) expect(ch[i]!).toBeGreaterThanOrEqual(ch[i - 1]!);
        },
      ),
    );
  });
});

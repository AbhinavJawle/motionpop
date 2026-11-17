import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Format } from '../contract';
import { contains, safeArea, type Box } from '../core/safe-area';
import { frameAround, splitFrame } from './image-layer';

// Spec 07c task 21 (Kiro run 20): the text sub-frame of a split frame keeps its text in the safe area.

const FORMATS: Format[] = ['16:9', '9:16', '1:1'];
const TOL = 1.5;

/** The safe area a box of `format` would have, placed at the box's origin. */
function placedSafe(box: Box, format: Format): Box {
  const sa = safeArea(format, box.width, box.height);
  return { x: box.x + sa.x, y: box.y + sa.y, width: sa.width, height: sa.height };
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const boxArb = fc.record({
  x: fc.integer({ min: 0, max: 1200 }),
  y: fc.integer({ min: 0, max: 700 }),
  width: fc.integer({ min: 120, max: 1400 }),
  height: fc.integer({ min: 120, max: 900 }),
});

describe('frameAround: the frame whose safe area is the target', () => {
  it('for every target box, the frame safe area lies inside the target', () => {
    fc.assert(
      fc.property(boxArb, fc.integer({ min: 0, max: 30 }), (target, slack) => {
        const { box, format } = frameAround(target, slack);
        expect(FORMATS).toContain(format);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
        expect(contains(target, placedSafe(box, format), TOL)).toBe(true);
      }),
    );
  });

  it('the frame is the target grown by the margins, not shrunk', () => {
    fc.assert(
      fc.property(boxArb, (target) => {
        const { box } = frameAround(target, 0);
        expect(box.width).toBeGreaterThanOrEqual(target.width - TOL);
        expect(box.height).toBeGreaterThanOrEqual(target.height - TOL);
      }),
    );
  });
});

describe('splitFrame: the text sub-frame sits in the frame and clear of the picture', () => {
  const sizeArb = fc.integer({ min: 640, max: 1920 });

  it('for every frame format, share and side, the text safe area is inside the frame safe area', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FORMATS),
        sizeArb,
        sizeArb,
        fc.double({ min: 0.3, max: 0.65, noNaN: true }),
        fc.integer({ min: 0, max: 7 }),
        (format, w, h, share, seed) => {
          const split = splitFrame(format, w, h, share, seed);
          const frame = safeArea(format, w, h);
          const text = placedSafe(split.text, split.textFormat);
          expect(contains(frame, text, TOL)).toBe(true);
        },
      ),
    );
  });

  it('the text safe area never overlaps the picture box', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FORMATS),
        sizeArb,
        sizeArb,
        fc.double({ min: 0.3, max: 0.65, noNaN: true }),
        fc.integer({ min: 0, max: 7 }),
        (format, w, h, share, seed) => {
          const split = splitFrame(format, w, h, share, seed);
          const text = placedSafe(split.text, split.textFormat);
          expect(overlaps(split.image, text)).toBe(false);
        },
      ),
    );
  });

  it('the picture stays inside the frame safe area', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FORMATS),
        sizeArb,
        sizeArb,
        fc.double({ min: 0.3, max: 0.65, noNaN: true }),
        fc.integer({ min: 0, max: 7 }),
        (format, w, h, share, seed) => {
          const split = splitFrame(format, w, h, share, seed);
          expect(contains(safeArea(format, w, h), split.image, TOL)).toBe(true);
        },
      ),
    );
  });
});

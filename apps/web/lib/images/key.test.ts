import { describe, expect, it } from 'vitest';
import { keyOut } from './key';

/** A green frame with a grey square in the middle (the subject). */
function frame(w: number, h: number, green: [number, number, number]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = x > w * 0.3 && x < w * 0.7 && y > h * 0.3 && y < h * 0.7;
      const c = inside ? [120, 110, 100] : green;
      px.set([c[0]!, c[1]!, c[2]!, 255], i);
    }
  return px;
}

describe('keyOut', () => {
  it('removes a dull green backdrop and keeps the subject', () => {
    const w = 64;
    const h = 64;
    const r = keyOut(frame(w, h, [30, 200, 40]), w, h);
    expect(r.keyed).toBe(true);
    expect(r.rgba[3]).toBe(0); // corner: backdrop gone
    const mid = ((h / 2) * w + w / 2) * 4;
    expect(r.rgba[mid + 3]).toBe(255); // subject kept
    expect(r.rgba[mid + 1]).toBeLessThanOrEqual(r.rgba[mid]! + 6); // no green spill
  });

  it('falls back to framed when the backdrop is not one key colour', () => {
    const w = 32;
    const h = 32;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++)
      px.set([(i * 37) % 255, (i * 91) % 255, (i * 13) % 255, 255], i * 4);
    expect(keyOut(px, w, h).keyed).toBe(false);
  });
});

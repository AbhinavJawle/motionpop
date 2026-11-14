import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { grainTile, paperTile, textureDataUrls } from './textures.ts';

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function decode(png: Uint8Array) {
  const buf = Buffer.from(png);
  const idat: Buffer[] = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return {
    sig: [...buf.subarray(0, 8)],
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    depth: buf[24],
    colourType: buf[25],
    raw,
  };
}

/** Pixel (x, y) from the inflated scanlines (filter byte 0 in front of each row). */
const px = (d: ReturnType<typeof decode>, x: number, y: number): number =>
  d.raw[y * (d.width + 1) + 1 + x] as number;

describe('texture tiles', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(grainTile(1).equals(grainTile(1))).toBe(true);
    expect(paperTile(1).equals(paperTile(1))).toBe(true);
    expect(grainTile(1).equals(grainTile(2))).toBe(false);
    expect(paperTile(1).equals(paperTile(2))).toBe(false);
  });

  it('writes valid PNG headers', () => {
    const g = decode(grainTile(1));
    expect(g.sig).toEqual(SIG);
    expect([g.width, g.height, g.depth, g.colourType]).toEqual([256, 256, 8, 0]);
    const p = decode(paperTile(1));
    expect(p.sig).toEqual(SIG);
    expect([p.width, p.height, p.depth, p.colourType]).toEqual([512, 512, 8, 0]);
  });

  it('inflates to the expected scanline length', () => {
    expect(decode(grainTile(3)).raw.length).toBe(257 * 256);
    expect(decode(paperTile(3)).raw.length).toBe(513 * 512);
  });

  it('keeps paper values within 200-255', () => {
    const p = decode(paperTile(7));
    // One assertion on the range, not one per pixel: 262k expect() calls timed out on CI.
    let min = 255;
    let max = 0;
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        const v = px(p, x, y);
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    expect(min).toBeGreaterThanOrEqual(200);
    expect(max).toBeLessThanOrEqual(255);
  });

  it('wraps paper seamlessly across the left/right seam', () => {
    const p = decode(paperTile(5));
    // The last cell interpolates linearly towards column 0, so neighbours across the seam
    // differ by at most one cell step (<= 55/8 per pixel), like any interior neighbours.
    const maxStep = Math.ceil(55 / 8) + 1;
    for (let y = 0; y < p.height; y += 8) {
      const row = y; // lattice rows: values at y multiple of 8 are pure lattice values
      expect(Math.abs(px(p, 511, row) - px(p, 0, row))).toBeLessThanOrEqual(maxStep);
    }
    // Same for top/bottom.
    for (let x = 0; x < p.width; x += 8) {
      expect(Math.abs(px(p, x, 511) - px(p, x, 0))).toBeLessThanOrEqual(maxStep);
    }
  });

  it('returns PNG data URLs', () => {
    const { grain, paper } = textureDataUrls();
    expect(grain.startsWith('data:image/png;base64,')).toBe(true);
    expect(paper.startsWith('data:image/png;base64,')).toBe(true);
    expect(textureDataUrls()).toEqual({ grain, paper });
  });
});

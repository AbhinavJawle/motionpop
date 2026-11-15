// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { fieldNotes } from '../styles';
import { buildSurface, mix, tornPolygon } from './materials';

const box = { x: 100, y: 200, width: 600, height: 120 };
const o = { kind: 'card' as const, colors: fieldNotes.colors, seed: 7, frameH: 1080 };

describe('materials', () => {
  it('tears a seeded outline that stays inside the box', () => {
    const a = tornPolygon(600, 120, 3, 8);
    expect(tornPolygon(600, 120, 3, 8)).toBe(a);
    expect(tornPolygon(600, 120, 4, 8)).not.toBe(a);
    const pcts = [...a.matchAll(/(-?[\d.]+)%/g)].map((m) => Number(m[1]));
    expect(pcts.every((p) => p >= 0 && p <= 100)).toBe(true);
  });

  it('leaves plain surfaces to the scene (null), and builds the same stack the same way', () => {
    expect(buildSurface(document, undefined, box, o)).toBeNull();
    expect(buildSurface(document, ['plain'], box, o)).toBeNull();
    const a = buildSurface(
      document,
      ['paper', 'torn-edge', 'shadow-soft', 'tape', 'tilt'],
      box,
      o,
    )!;
    const b = buildSurface(
      document,
      ['paper', 'torn-edge', 'shadow-soft', 'tape', 'tilt'],
      box,
      o,
    )!;
    expect(a.el.outerHTML).toBe(b.el.outerHTML);
    expect(a.tilt).toBe(b.tilt);
    expect(Math.abs(a.tilt)).toBeGreaterThanOrEqual(0.8);
    expect(a.el.querySelector('[data-material="tape"]')).not.toBeNull();
    expect(a.el.style.filter).toContain('drop-shadow');
  });

  it('uses paper for cards and the accent for a strip without paper', () => {
    const card = buildSurface(document, ['torn-edge'], box, o)!;
    const strip = buildSurface(document, ['torn-edge'], box, { ...o, kind: 'strip' })!;
    const bg = (s: { el: HTMLElement }) => (s.el.firstElementChild as HTMLElement).style.background;
    expect(bg(card)).not.toBe(bg(strip));
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});

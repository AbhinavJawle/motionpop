// @vitest-environment happy-dom
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Companion } from '../engine/companion';
import { editorialExplainer, fieldNotes, paperCollage } from '../styles';
import { buildCompanionLayer, type CompanionLayer } from './companion-layer';

// Spec 07c task 18 (Kiro run 20): seek purity, the count at the land time, and nothing before the start.

const W = 1920;
const H = 1080;
const START = 1000;
const LAND = 1600;
const DURATION = 5000;

const KINDS: Companion[] = [
  { kind: 'units', filled: 40, icon: 'percent' },
  { kind: 'dots', n: 30, icon: 'ship' },
  { kind: 'dots', n: 300 },
  { kind: 'icons', n: 6, icon: 'ship' },
  { kind: 'ruler' },
  { kind: 'ruler', icon: 'map' },
  { kind: 'stamp', icon: 'factory' },
];
const LOOKS = [undefined, paperCollage, fieldNotes, editorialExplainer] as const;

function mount(
  companion: Companion,
  look: (typeof LOOKS)[number],
): { host: HTMLElement; layer: CompanionLayer } {
  const host = document.createElement('div');
  document.body.append(host);
  const layer = buildCompanionLayer({
    doc: document,
    parent: host,
    box: { x: 0, y: 0, width: W, height: H },
    companion,
    style: editorialExplainer,
    look,
    seed: 7,
    durationMs: DURATION,
    startMs: START,
    landMs: LAND,
    exitStartMs: 4000,
    exit: 'none',
    frameH: H,
  });
  return { host, layer };
}

/** Inner icon groups (the ones the layer scales); the wrapper groups carry no inline transform. */
const innerGroups = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('g')).filter((g) => (g as SVGGElement).style.transform !== '');
const scaledOut = (s: string) => s === 'scale(0.000)' || s === '';

describe('companion layer seek purity (spec 07c R6.2)', () => {
  it('seek(t) is pure for every kind and look', () => {
    for (const companion of KINDS) {
      for (const look of LOOKS) {
        const a = mount(companion, look);
        const b = mount(companion, look);
        try {
          const timeArb = fc.integer({ min: 0, max: DURATION });
          fc.assert(
            fc.property(fc.array(timeArb, { minLength: 1, maxLength: 10 }), (times) => {
              for (const t of times) a.layer.seek(t);
              const last = times[times.length - 1] as number;
              b.layer.seek(last);
              expect(a.host.innerHTML).toBe(b.host.innerHTML);
              a.layer.seek(last);
              const first = a.host.innerHTML;
              a.layer.seek(last);
              expect(a.host.innerHTML).toBe(first);
            }),
            { numRuns: 15 },
          );
        } finally {
          a.host.remove();
          b.host.remove();
        }
      }
    }
  });
});

describe('companion layer counts (spec 07c R2.2)', () => {
  const accent = editorialExplainer.colors.accent;

  it('lights exactly the target count at the land time: grid cells, dots and icons', () => {
    const grid = mount({ kind: 'units', filled: 40 }, undefined);
    grid.layer.seek(LAND);
    const cells = Array.from(grid.host.querySelectorAll('rect'));
    expect(cells.length).toBe(100);
    expect(cells.filter((r) => r.getAttribute('fill') === accent).length).toBe(40);
    grid.host.remove();

    for (const n of [6, 30]) {
      const dots = mount({ kind: 'dots', n }, undefined);
      dots.layer.seek(LAND);
      const circles = Array.from(dots.host.querySelectorAll('circle'));
      expect(circles.length).toBe(n);
      expect(circles.filter((c) => !scaledOut((c as SVGElement).style.transform)).length).toBe(n);
      dots.host.remove();
    }

    const row = mount({ kind: 'icons', n: 6, icon: 'ship' }, undefined);
    row.layer.seek(LAND);
    expect(innerGroups(row.host).filter((g) => !scaledOut(g.style.transform)).length).toBe(6);
    row.host.remove();
  });

  it('draws the ruler to its full length at the land time', () => {
    const r = mount({ kind: 'ruler' }, undefined);
    r.layer.seek(LAND);
    const line = r.host.querySelector('line') as SVGLineElement;
    expect(Number(line.getAttribute('x2'))).toBeCloseTo(W * 0.04 + W * 0.92, 0);
    r.host.remove();
  });

  it('shows the stamp disc at the land time', () => {
    const s = mount({ kind: 'stamp', icon: 'factory' }, undefined);
    s.layer.seek(LAND);
    const disc = s.host.querySelector('div[style*="border-radius"]') as HTMLElement;
    expect(disc.style.opacity).toBe('1');
    s.host.remove();
  });
});

describe('companion layer starts with the number (spec 07c R2.2)', () => {
  it('shows nothing at t = 0, before the start', () => {
    const grid = mount({ kind: 'units', filled: 40 }, undefined);
    grid.layer.seek(0);
    expect(
      Array.from(grid.host.querySelectorAll('rect')).every((r) => r.style.opacity === '0'),
    ).toBe(true);
    grid.host.remove();

    const dots = mount({ kind: 'dots', n: 30 }, undefined);
    dots.layer.seek(0);
    expect(
      Array.from(dots.host.querySelectorAll('circle')).every((c) =>
        scaledOut((c as SVGElement).style.transform),
      ),
    ).toBe(true);
    dots.host.remove();

    const row = mount({ kind: 'icons', n: 6, icon: 'ship' }, undefined);
    row.layer.seek(0);
    expect(innerGroups(row.host).every((g) => scaledOut(g.style.transform))).toBe(true);
    row.host.remove();

    const ruler = mount({ kind: 'ruler' }, undefined);
    ruler.layer.seek(0);
    expect((ruler.host.querySelector('line') as SVGLineElement).style.opacity).toBe('0');
    ruler.host.remove();

    const stamp = mount({ kind: 'stamp', icon: 'factory' }, undefined);
    stamp.layer.seek(0);
    expect(
      (stamp.host.querySelector('div[style*="border-radius"]') as HTMLElement).style.opacity,
    ).toBe('0');
    stamp.host.remove();
  });
});

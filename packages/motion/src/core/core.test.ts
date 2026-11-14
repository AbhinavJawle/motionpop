// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { pushIn } from './camera';
import { fitText } from './fit-text';
import { pathDraw } from './path-draw';
import { contains, safeArea } from './safe-area';
import { splitText } from './split-text';

describe('safeArea', () => {
  it('uses 5 % margins for 16:9 and platform zones for 9:16', () => {
    expect(safeArea('16:9', 1920, 1080)).toEqual({ x: 96, y: 54, width: 1728, height: 972 });
    expect(safeArea('9:16', 1080, 1920)).toEqual({ x: 65, y: 230, width: 950, height: 1306 });
  });
  it('contains checks full inclusion', () => {
    const outer = { x: 0, y: 0, width: 100, height: 100 };
    expect(contains(outer, { x: 10, y: 10, width: 80, height: 80 })).toBe(true);
    expect(contains(outer, { x: 50, y: 50, width: 60, height: 10 })).toBe(false);
  });
});

describe('pushIn', () => {
  it('goes from 1 to amount and clamps', () => {
    expect(pushIn(0, 3000)).toBe(1);
    expect(pushIn(3000, 3000, 1.06)).toBeCloseTo(1.06, 10);
    expect(pushIn(9000, 3000, 1.06)).toBeCloseTo(1.06, 10);
    expect(pushIn(-5, 3000)).toBe(1);
  });
});

describe('splitText', () => {
  it('splits words and letters, keeping spaces between words', () => {
    const el = document.createElement('div');
    expect(splitText(el, 'Revenue  grew 40%', 'word').map((s) => s.textContent)).toEqual([
      'Revenue',
      'grew',
      '40%',
    ]);
    expect(el.textContent).toBe('Revenue grew 40%');
    expect(splitText(el, 'ab c', 'char').length).toBe(3);
  });
});

describe('pathDraw', () => {
  it('sets dash offset from progress using the cached length', () => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement;
    Object.defineProperty(path, 'getTotalLength', { value: () => 200 });
    pathDraw(path, 0.25);
    expect(path.style.strokeDasharray).toBe('200 200');
    expect(path.style.strokeDashoffset).toBe('150');
    pathDraw(path, 2);
    expect(path.style.strokeDashoffset).toBe('0');
  });
});

describe('fitText', () => {
  // Deterministic measure: each char is 0.6em wide on one line.
  const overflows = (el: HTMLElement, box: { width: number; height: number }) => {
    const size = parseFloat(el.style.fontSize);
    return (el.textContent ?? '').length * size * 0.6 > box.width || size * 1.1 > box.height;
  };
  it('finds the largest size that fits', () => {
    const el = document.createElement('div');
    el.textContent = 'Revenue grew'; // 12 chars
    const r = fitText(el, { width: 720, height: 200 }, { max: 160, min: 24 }, overflows);
    expect(r).toEqual({ size: 100, text: 'Revenue grew', truncated: false, overflow: false });
  });
  it('truncates with an ellipsis when the minimum does not fit', () => {
    const el = document.createElement('div');
    el.textContent = 'one two three four five six';
    const r = fitText(el, { width: 100, height: 200 }, { max: 40, min: 20 }, overflows);
    expect(r.truncated).toBe(true);
    expect(r.size).toBe(20);
    expect(el.textContent?.endsWith('…')).toBe(true);
    expect((el.textContent ?? '').length * 20 * 0.6).toBeLessThanOrEqual(100);
  });
});

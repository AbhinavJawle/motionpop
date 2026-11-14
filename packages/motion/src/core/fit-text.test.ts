// @vitest-environment happy-dom
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fitText, type Overflows } from './fit-text';

// Deterministic stub: one line, each char is 0.6em wide.
const overflows: Overflows = (el, box) =>
  (el.textContent ?? '').length * 0.6 * parseFloat(el.style.fontSize) > box.width;

const textArb = fc
  .array(fc.stringMatching(/^[a-z]{1,12}$/), { minLength: 1, maxLength: 8 })
  .map((w) => w.join(' '));
const caseArb = fc.record({
  text: textArb,
  min: fc.integer({ min: 8, max: 40 }),
  extra: fc.integer({ min: 0, max: 120 }),
  width: fc.integer({ min: 30, max: 1200 }),
  truncatable: fc.boolean(),
});

function run(c: { text: string; min: number; extra: number; width: number; truncatable: boolean }) {
  const el = document.createElement('div');
  el.textContent = c.text;
  const max = c.min + c.extra;
  const r = fitText(
    el,
    { width: c.width, height: 500 },
    { min: c.min, max, truncatable: c.truncatable },
    overflows,
  );
  return { r, el, max };
}

describe('fitText properties', () => {
  it('size stays within [min, max] and text matches the element', () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        const { r, el, max } = run(c);
        expect(r.size).toBeGreaterThanOrEqual(c.min);
        expect(r.size).toBeLessThanOrEqual(max);
        expect(r.text).toBe(el.textContent);
      }),
    );
  });

  it('reports no overflow at the returned size unless truncated or overflow', () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        const { r, el } = run(c);
        if (!r.truncated && !r.overflow) {
          el.style.fontSize = `${r.size}px`;
          expect(overflows(el, { width: c.width, height: 500 })).toBe(false);
        }
      }),
    );
  });

  it('truncatable false never changes the text', () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        const { r } = run({ ...c, truncatable: false });
        expect(r.text).toBe(c.text);
        expect(r.truncated).toBe(false);
      }),
    );
  });

  it('truncated implies a shorter text ending with an ellipsis and no overflow', () => {
    fc.assert(
      fc.property(caseArb, (c) => {
        const { r } = run({ ...c, truncatable: true });
        if (r.truncated) {
          expect(r.text.endsWith('…')).toBe(true);
          expect(r.text.length).toBeLessThan(c.text.length);
          expect(r.overflow).toBe(false);
        }
      }),
    );
  });

  it('flags overflow instead of truncating when not truncatable', () => {
    const el = document.createElement('div');
    el.textContent = 'one two three four five six';
    const r = fitText(
      el,
      { width: 100, height: 200 },
      { max: 40, min: 20, truncatable: false },
      overflows,
    );
    expect(r).toEqual({
      size: 20,
      text: 'one two three four five six',
      truncated: false,
      overflow: true,
    });
  });
});

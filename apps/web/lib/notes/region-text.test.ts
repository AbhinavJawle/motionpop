// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { focalRegion, regionText } from './region-text';

const FRAME = { width: 1000, height: 500 };

/** happy-dom has no layout: give elements the boxes the real composition would have. */
function docWith(
  items: {
    text: string;
    box: [number, number, number, number];
    hidden?: boolean;
    focal?: boolean;
  }[],
): Document {
  const doc = document.implementation.createHTMLDocument('c');
  for (const it of items) {
    const el = doc.createElement('div');
    el.setAttribute(it.focal ? 'data-focal' : 'data-text', '');
    if (it.focal) el.setAttribute('data-text', '');
    el.textContent = it.text;
    if (it.hidden) el.style.opacity = '0';
    const [l, t, r, b] = it.box;
    el.getBoundingClientRect = () =>
      ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }) as DOMRect;
    doc.body.append(el);
  }
  return doc;
}

describe('regionText', () => {
  const doc = docWith([
    { text: 'Revenue grew', box: [50, 40, 400, 90] },
    { text: '  $140k  ', box: [600, 300, 700, 340] },
    { text: '2022', box: [610, 450, 690, 480] },
    { text: 'gone', box: [620, 310, 690, 330], hidden: true },
    { text: '$140k', box: [650, 320, 700, 340] },
  ]);

  it('lists the texts inside the region, in document order, trimmed and de-duplicated', () => {
    expect(regionText(doc, { x: 0.55, y: 0.55, w: 0.2, h: 0.2 }, FRAME)).toEqual(['$140k']);
    expect(regionText(doc, { x: 0.55, y: 0.55, w: 0.2, h: 0.45 }, FRAME)).toEqual([
      '$140k',
      '2022',
    ]);
  });
  it('skips what is not visible and what is outside', () => {
    expect(regionText(doc, { x: 0, y: 0, w: 0.2, h: 0.2 }, FRAME)).toEqual(['Revenue grew']);
    expect(regionText(doc, { x: 0.9, y: 0, w: 0.1, h: 0.1 }, FRAME)).toEqual([]);
  });
  it('is empty without a document, and never throws', () => {
    expect(regionText(null, { x: 0, y: 0, w: 1, h: 1 }, FRAME)).toEqual([]);
  });
  it('keeps at most 8 texts of 80 characters', () => {
    const many = docWith(
      Array.from({ length: 12 }, (_, i) => ({
        text: `${i}`.padEnd(120, 'x'),
        box: [10, 10 + i, 100, 20 + i] as [number, number, number, number],
      })),
    );
    const out = regionText(many, { x: 0, y: 0, w: 1, h: 1 }, FRAME);
    expect(out).toHaveLength(8);
    expect(out.every((t) => t.length <= 80)).toBe(true);
  });
});

describe('focalRegion', () => {
  it('pads the focal element’s box and keeps it inside the frame', () => {
    const d = docWith([{ text: '40%', box: [100, 100, 300, 200], focal: true }]);
    const r = focalRegion(d, FRAME)!;
    expect(r.x).toBeLessThan(0.1);
    expect(r.x + r.w).toBeGreaterThan(0.3);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(1);
  });
  it('is null when nothing is focal', () => {
    expect(focalRegion(docWith([{ text: 'a', box: [0, 0, 10, 10] }]), FRAME)).toBeNull();
    expect(focalRegion(null, FRAME)).toBeNull();
  });
});

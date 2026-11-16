// @vitest-environment happy-dom
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CAPTURE_MAX_SIDE,
  captureRegion,
  cropGeometry,
  playerSource,
  serializeFrame,
} from './capture';

const FRAMES = [
  { width: 1920, height: 1080 },
  { width: 1080, height: 1920 },
  { width: 1080, height: 1080 },
];

describe('cropGeometry', () => {
  it('scales the whole frame to 512 on the longest side, keeping the aspect', () => {
    expect(cropGeometry({ x: 0, y: 0, w: 1, h: 1 }, FRAMES[0]!)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1920,
      sh: 1080,
      dw: 512,
      dh: 288,
    });
    expect(cropGeometry({ x: 0, y: 0, w: 1, h: 1 }, FRAMES[1]!)).toMatchObject({
      dw: 288,
      dh: 512,
    });
  });

  it('does not enlarge a small crop', () => {
    expect(cropGeometry({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, FRAMES[0]!)).toMatchObject({
      sw: 192,
      sh: 108,
      dw: 192,
      dh: 108,
    });
  });

  it('refuses an empty region', () => {
    expect(cropGeometry({ x: 0.5, y: 0.5, w: 0, h: 0.2 }, FRAMES[0]!)).toBeNull();
    expect(cropGeometry({ x: 1, y: 0, w: 0.5, h: 0.5 }, FRAMES[0]!)).toBeNull();
  });

  it('property: always inside the frame, at most 512 px, aspect kept within a pixel', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FRAMES),
        fc.double({ min: -0.5, max: 1.5, noNaN: true }),
        fc.double({ min: -0.5, max: 1.5, noNaN: true }),
        fc.double({ min: 0, max: 2, noNaN: true }),
        fc.double({ min: 0, max: 2, noNaN: true }),
        (frame, x, y, w, h) => {
          const g = cropGeometry({ x, y, w, h }, frame);
          if (!g) return;
          expect(g.sx).toBeGreaterThanOrEqual(0);
          expect(g.sy).toBeGreaterThanOrEqual(0);
          expect(g.sx + g.sw).toBeLessThanOrEqual(frame.width);
          expect(g.sy + g.sh).toBeLessThanOrEqual(frame.height);
          expect(Math.max(g.dw, g.dh)).toBeLessThanOrEqual(CAPTURE_MAX_SIDE);
          expect(g.dw).toBeGreaterThanOrEqual(1);
          expect(g.dh).toBeGreaterThanOrEqual(1);
          // Same aspect as the crop, to within the rounding of each side.
          expect(Math.abs(g.dw / g.dh - g.sw / g.sh)).toBeLessThan(
            Math.max(1 / g.dh, 1 / g.dw) * (g.sw / g.sh) + 0.02,
          );
        },
      ),
    );
  });
});

describe('serializeFrame', () => {
  it('keeps inline styles and the style element, and drops scripts and media', () => {
    const doc = document.implementation.createHTMLDocument('c');
    doc.head.innerHTML =
      '<style>@font-face{font-family:G;src:url(data:font/woff2;base64,AAAA)}</style><script>alert(1)</script>';
    doc.body.innerHTML =
      '<div style="opacity:0.5;transform:translateY(4px)">40%</div><audio src="x.mp3"></audio><video></video>';
    const xml = serializeFrame(doc);
    expect(xml).toContain('opacity:0.5');
    expect(xml).toContain('@font-face');
    expect(xml).toContain('40%');
    expect(xml).not.toContain('<script');
    expect(xml).not.toContain('<audio');
    expect(xml).not.toContain('<video');
    expect(xml).toContain('xmlns="http://www.w3.org/1999/xhtml"');
  });

  it('replaces a canvas with an image in the same place', () => {
    const doc = document.implementation.createHTMLDocument('c');
    doc.body.innerHTML = '<canvas width="4" height="2" style="left:3px"></canvas>';
    const xml = serializeFrame(doc);
    expect(xml).not.toContain('<canvas');
    expect(xml).toContain('<img');
    expect(xml).toContain('left:3px');
  });

  it('does not change the live document', () => {
    const doc = document.implementation.createHTMLDocument('c');
    doc.body.innerHTML = '<script>1</script><p>x</p>';
    serializeFrame(doc);
    expect(doc.querySelector('script')).not.toBeNull();
  });
});

describe('captureRegion never throws', () => {
  const region = { x: 0, y: 0, w: 1, h: 1 };
  it('answers undefined without a composition document (an opaque sandbox)', async () => {
    expect(
      await captureRegion({ document: null, width: 1920, height: 1080 }, region),
    ).toBeUndefined();
  });
  it('answers undefined for an empty region', async () => {
    const doc = document.implementation.createHTMLDocument('c');
    expect(
      await captureRegion({ document: doc, width: 1920, height: 1080 }, { ...region, w: 0 }),
    ).toBeUndefined();
  });
  it('playerSource gives a null document when access to the frame throws', () => {
    const player = {
      get iframeElement(): HTMLIFrameElement {
        throw new Error('SecurityError');
      },
    } as unknown as HTMLElement;
    expect(playerSource(player, { width: 1, height: 1 }).document).toBeNull();
    expect(playerSource(null, { width: 1, height: 1 }).document).toBeNull();
  });
});

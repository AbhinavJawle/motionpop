import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clampScroll, fitView } from './geometry';
import { wheelView, type WheelInput } from './wheel';

const DURATION = 18_000;
const VISIBLE = 1224; // 1440 - 152 label column - 64 right padding
const fit = { ...fitView(DURATION, VISIBLE), fit: true };
const input = (over: Partial<WheelInput>): WheelInput => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  zoom: false,
  shift: false,
  anchorX: 0,
  ...over,
});

describe('clampScroll', () => {
  it('keeps the scroll between the start and the last full screen', () => {
    expect(clampScroll(-50, 0.2, VISIBLE, DURATION)).toBe(0);
    expect(clampScroll(99_999, 0.2, VISIBLE, DURATION)).toBe(DURATION - VISIBLE / 0.2);
    expect(clampScroll(500, fit.pxPerMs, VISIBLE, DURATION)).toBe(0); // everything fits
  });
});

describe('wheelView', () => {
  it('ignores a plain vertical wheel', () => {
    expect(wheelView(fit, VISIBLE, DURATION, input({ deltaY: 40 }))).toBeNull();
  });

  it('zooms in at the pointer and keeps the time under it', () => {
    const anchorX = 600;
    const before = anchorX / fit.pxPerMs + fit.scrollMs;
    const v = wheelView(fit, VISIBLE, DURATION, input({ zoom: true, deltaY: -200, anchorX }))!;
    expect(v.fit).toBe(false);
    expect(v.pxPerMs).toBeGreaterThan(fit.pxPerMs);
    expect(Math.abs(anchorX / v.pxPerMs + v.scrollMs - before)).toBeLessThanOrEqual(1);
  });

  it('snaps back to fit when zooming out past it', () => {
    const zoomed = { pxPerMs: 0.2, scrollMs: 4000, fit: false };
    expect(wheelView(zoomed, VISIBLE, DURATION, input({ zoom: true, deltaY: 5000 }))).toEqual(fit);
  });

  it('scrolls with shift + wheel and with a horizontal swipe, only when zoomed', () => {
    const zoomed = { pxPerMs: 0.2, scrollMs: 4000, fit: false };
    expect(
      wheelView(zoomed, VISIBLE, DURATION, input({ shift: true, deltaY: 100 }))!.scrollMs,
    ).toBe(4500);
    expect(
      wheelView(zoomed, VISIBLE, DURATION, input({ deltaX: -100, deltaY: 10 }))!.scrollMs,
    ).toBe(3500);
    expect(wheelView(fit, VISIBLE, DURATION, input({ shift: true, deltaY: 100 }))).toBeNull();
  });

  it('property: the view stays within zoom limits and scroll bounds', () => {
    fc.assert(
      fc.property(
        fc.double({ min: fit.pxPerMs, max: 2, noNaN: true }),
        fc.integer({ min: 0, max: DURATION }),
        fc.integer({ min: -3000, max: 3000 }),
        fc.integer({ min: -3000, max: 3000 }),
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 0, max: VISIBLE }),
        (pxPerMs, scroll, deltaX, deltaY, zoom, shift, anchorX) => {
          const view = {
            pxPerMs,
            scrollMs: clampScroll(scroll, pxPerMs, VISIBLE, DURATION),
            fit: false,
          };
          const v = wheelView(
            view,
            VISIBLE,
            DURATION,
            input({ deltaX, deltaY, zoom, shift, anchorX }),
          );
          if (!v) return;
          expect(v.pxPerMs).toBeGreaterThanOrEqual(fit.pxPerMs - 1e-12);
          expect(v.pxPerMs).toBeLessThanOrEqual(2);
          expect(v.scrollMs).toBe(clampScroll(v.scrollMs, v.pxPerMs, VISIBLE, DURATION));
          expect(Number.isInteger(v.scrollMs)).toBe(true);
        },
      ),
    );
  });
});

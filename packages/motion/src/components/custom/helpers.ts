import { eases } from '../../core/ease';
import { lerp, progress } from '../../core/interp';
import { mulberry32 } from '../../core/rng';

/**
 * `mp`: the only helpers generated code gets (spec 15 design §1). Every one is pure, so a script
 * built from them stays a function of time. Frozen, so a script can't swap one for another.
 */
const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const outBack = (x: number) => {
  const c = 1.70158;
  const p = clamp(x) - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
};
const spring = (x: number) => {
  const p = clamp(x);
  return 1 - Math.cos(p * Math.PI * 2.5) * Math.exp(-p * 6);
};

export function customHelpers(root: HTMLElement) {
  const doc = root.ownerDocument;
  const el = (
    tag: string,
    attrs: Record<string, string | number> = {},
    text?: string,
    parent: Element = root,
  ): HTMLElement | SVGElement => {
    const svg =
      /^(svg|g|path|circle|rect|line|polyline|polygon|text|tspan|ellipse|defs|linearGradient|stop|clipPath)$/.test(
        tag,
      );
    const node = svg
      ? doc.createElementNS('http://www.w3.org/2000/svg', tag)
      : doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  };
  return Object.freeze({
    clamp,
    lerp,
    /** 0→1 as t goes from `start` to `start + dur`, clamped. */
    progress: (t: number, start: number, dur: number) => progress(t, start, dur),
    ease: Object.freeze({
      linear: eases.linear,
      out: eases.outCubic,
      outStrong: eases.outExpo,
      inOut: eases.inOutCubic,
      back: outBack,
      spring,
    }),
    /** Start time of item `i` when `n` items arrive `each` ms apart. */
    stagger: (i: number, each: number, start = 0) => start + i * each,
    /** A number counted up to `value` at progress `p`, with `decimals` places. */
    count: (value: number, p: number, decimals = 0) =>
      (value * clamp(p)).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    /** A seeded random generator: the same seed gives the same numbers every time. */
    rng: (seed: number) => mulberry32(seed >>> 0),
    el,
    /** Shrinks an element's font until it fits `maxWidth` px (call once, outside seek). */
    fit: (node: HTMLElement, maxWidth: number, minPx = 12) => {
      let size = parseFloat(node.style.fontSize || '48') || 48;
      for (let i = 0; i < 40 && node.scrollWidth > maxWidth && size > minPx; i++) {
        size *= 0.94;
        node.style.fontSize = `${size}px`;
      }
    },
  });
}
export type CustomHelpers = ReturnType<typeof customHelpers>;

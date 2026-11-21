// Reel engine (spec 25): pure animation helpers. Every function maps a time to a value; nothing
// reads a clock, so seeking to the same ms always draws the same frame.

export const clamp = (v: number, lo = 0, hi = 1): number => (v < lo ? lo : v > hi ? hi : v);

/** Progress 0..1 of a window that starts at `at` and lasts `dur` ms. */
export const prog = (t: number, at: number, dur: number): number =>
  dur <= 0 ? (t >= at ? 1 : 0) : clamp((t - at) / dur);

export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export const easeOutCubic = (p: number): number => 1 - (1 - p) ** 3;
export const easeOutQuart = (p: number): number => 1 - (1 - p) ** 4;
export const easeOutExpo = (p: number): number => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
export const easeInOutCubic = (p: number): number =>
  p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
/** Overshooting ease for pops (back-out). */
export const easeOutBack = (p: number): number => {
  const c1 = 1.55;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};

/** Damped spring settle 0→1 (no overshoot beyond ~6 %). */
export const spring = (p: number): number =>
  p >= 1 ? 1 : 1 - Math.exp(-6.5 * p) * Math.cos(p * Math.PI * 1.6);

export interface Reveal {
  opacity: number;
  y: number;
  blur: number;
  scale: number;
}

/**
 * The house entrance: blur + rise + fade, the look of both reference reels.
 * `p` is raw progress; the ease is applied here.
 */
export function blurRise(p: number, rise = 22, blur = 14): Reveal {
  const e = easeOutCubic(clamp(p));
  return { opacity: clamp(p * 1.6), y: (1 - e) * rise, blur: (1 - e) * blur, scale: 1 };
}

export function applyReveal(el: HTMLElement | SVGElement, r: Reveal, extra = ''): void {
  const s = el.style;
  s.opacity = r.opacity.toFixed(3);
  s.transform = `translate3d(0, ${r.y.toFixed(2)}px, 0)${r.scale !== 1 ? ` scale(${r.scale.toFixed(4)})` : ''}${extra}`;
  s.filter = r.blur > 0.05 ? `blur(${r.blur.toFixed(2)}px)` : 'none';
  s.visibility = r.opacity <= 0.001 ? 'hidden' : 'visible';
}

/** Show an element once `t` passes `at`, revealing with the house blur-rise. */
export function revealAt(
  el: HTMLElement | SVGElement,
  t: number,
  at: number,
  dur = 420,
  rise = 22,
  blur = 14,
): number {
  const p = prog(t, at, dur);
  applyReveal(el, blurRise(p, rise, blur));
  return p;
}

export function setVisible(el: HTMLElement | SVGElement, on: boolean): void {
  el.style.visibility = on ? 'visible' : 'hidden';
}

/** Number formatting with thousands separators. */
export function formatNumber(v: number, decimals: number): string {
  const fixed = Math.abs(v).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const withSep = (int ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${v < 0 ? '-' : ''}${withSep}${frac ? `.${frac}` : ''}`;
}

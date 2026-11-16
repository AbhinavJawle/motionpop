export interface FitOptions {
  /** Largest font size in px. */
  max: number;
  /** Smallest acceptable font size in px. */
  min: number;
  /** Optional cap on lines (checked as height ≤ maxLines × lineHeight × size). */
  maxLines?: number;
  /** Line height as a multiple of font size (default 1.1). */
  lineHeight?: number;
  /**
   * Allow word/char truncation with "…" when even `min` overflows (default true).
   * Numbers and units pass false: the text stays unchanged and `overflow` is reported instead.
   */
  truncatable?: boolean;
  /**
   * Break a word that is wider than the box (default true). False keeps words whole, so a long
   * word shrinks the text instead of wrapping mid-word ("Oceani / a" in a narrow chart column).
   */
  breakWords?: boolean;
}

export interface FitResult {
  size: number;
  /** Final textContent of the element (the string to split). */
  text: string;
  truncated: boolean;
  /** True when the text still overflows at `min` and was not (or could not be) truncated. */
  overflow: boolean;
}

/** Default measurement: does the element overflow its box at the current size? */
export type Overflows = (el: HTMLElement, box: { width: number; height: number }) => boolean;

/**
 * Width: `scrollWidth` (catches unbreakable or nowrap text). Height: the element's laid-out height
 * (lines × line-height), not `scrollHeight`, because a font's content area can extend past the
 * line box (Geist at line-height 1.2 does) without being real layout overflow. The element must not
 * have a fixed CSS height.
 */
const domOverflows: Overflows = (el, box) =>
  el.scrollWidth > Math.ceil(box.width) + 0.5 || el.offsetHeight > Math.ceil(box.height) + 0.5;

/**
 * Fit text into a box (build time only; it reads layout). Binary-searches the largest integer size
 * in [min, max] that does not overflow. If even `min` overflows, drops trailing words and appends "…"
 * until it fits and reports `truncated: true` (or, with `truncatable: false`, leaves the text and reports `overflow: true`).
 */
export function fitText(
  el: HTMLElement,
  box: { width: number; height: number },
  opts: FitOptions,
  overflows: Overflows = domOverflows,
): FitResult {
  const lh = opts.lineHeight ?? 1.1;
  const min = Math.max(1, Math.floor(Math.min(opts.min, opts.max)));
  const max = Math.max(min, Math.floor(opts.max));
  const height = (size: number) =>
    opts.maxLines ? Math.min(box.height, opts.maxLines * lh * size) : box.height;

  el.style.lineHeight = String(lh);
  el.style.width = `${box.width}px`;
  el.style.overflowWrap = opts.breakWords === false ? 'normal' : 'break-word';
  const tryAt = (size: number) => {
    el.style.fontSize = `${size}px`;
    return !overflows(el, { width: box.width, height: height(size) });
  };

  const done = (size: number, truncated: boolean, overflow: boolean): FitResult => ({
    size,
    text: el.textContent ?? '',
    truncated,
    overflow,
  });

  if (tryAt(max)) return done(max, false, false);
  let lo = min;
  let hi = max;
  if (tryAt(min)) {
    // Invariant: lo fits, hi does not.
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (tryAt(mid)) lo = mid;
      else hi = mid;
    }
    tryAt(lo);
    return done(lo, false, false);
  }

  // Even the minimum overflows.
  const original = el.textContent ?? '';
  if (opts.truncatable === false) return done(min, false, true);

  // Truncate words at min size. Every candidate must be shorter than the original.
  const words = original.split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    words.pop();
    el.textContent = `${words.join(' ')}…`;
    if (tryAt(min)) return done(min, true, false);
  }
  // A single word that is still too wide: cut characters.
  let word = words[0] ?? '';
  while (word.length > 1) {
    word = word.slice(0, -1);
    const candidate = `${word}…`;
    if (candidate.length >= original.length) continue;
    el.textContent = candidate;
    if (tryAt(min)) return done(min, true, false);
  }
  // Nothing shorter fits: keep the original text and report the overflow.
  el.textContent = original;
  tryAt(min);
  return done(min, false, true);
}

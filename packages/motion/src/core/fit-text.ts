export interface FitOptions {
  /** Largest font size in px. */
  max: number;
  /** Smallest acceptable font size in px. */
  min: number;
  /** Optional cap on lines (checked as height ≤ maxLines × lineHeight × size). */
  maxLines?: number;
  /** Line height as a multiple of font size (default 1.1). */
  lineHeight?: number;
}

export interface FitResult {
  size: number;
  truncated: boolean;
}

/** Default measurement: does the element overflow its box at the current size? */
export type Overflows = (el: HTMLElement, box: { width: number; height: number }) => boolean;

const domOverflows: Overflows = (el, box) =>
  el.scrollWidth > Math.ceil(box.width) + 0.5 || el.scrollHeight > Math.ceil(box.height) + 0.5;

/**
 * Fit text into a box (build time only; it reads layout). Binary-searches the largest integer size
 * in [min, max] that does not overflow. If even `min` overflows, drops trailing words and appends "…"
 * until it fits, and reports `truncated: true` so the caller can flag a warning.
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
  el.style.overflowWrap = 'break-word';
  const tryAt = (size: number) => {
    el.style.fontSize = `${size}px`;
    return !overflows(el, { width: box.width, height: height(size) });
  };

  if (tryAt(max)) return { size: max, truncated: false };
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
    return { size: lo, truncated: false };
  }

  // Even the minimum overflows: truncate words at min size.
  const words = (el.textContent ?? '').split(/\s+/).filter(Boolean);
  while (words.length > 1) {
    words.pop();
    el.textContent = `${words.join(' ')}…`;
    if (tryAt(min)) return { size: min, truncated: true };
  }
  // A single word that is still too wide: cut characters.
  let word = words[0] ?? '';
  while (word.length > 1) {
    word = word.slice(0, -1);
    el.textContent = `${word}…`;
    if (tryAt(min)) return { size: min, truncated: true };
  }
  tryAt(min);
  return { size: min, truncated: true };
}

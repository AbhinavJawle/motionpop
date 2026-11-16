import type { Region } from './geometry';

/** The most texts and the longest one `note.fix` accepts (`NoteFixInputSchema.regionText`). */
export const REGION_TEXT_MAX_ITEMS = 8;
export const REGION_TEXT_MAX_CHARS = 80;

/** An element is not on screen when it or an ancestor has opacity 0, or it is `visibility: hidden`. */
function hidden(el: HTMLElement, view: Window | null): boolean {
  for (let cur: HTMLElement | null = el; cur; cur = cur.parentElement) {
    const style = view ? view.getComputedStyle(cur) : cur.style;
    if (style.opacity !== '' && Number(style.opacity) === 0) return true;
    if (cur === el && style.visibility === 'hidden') return true;
  }
  return false;
}

/**
 * The texts of the graphic's elements inside a region (spec 09 R8.4, design step 4): every element
 * marked `data-text` (the hook `motion:check` reads, component-contract.md) whose box meets the
 * region, in document order, trimmed, collapsed, de-duplicated, at most 8 of 80 characters. The
 * model reads these to know what was circled ("$140k", "2022"). Elements that are not on screen
 * (opacity 0, hidden, no size) are skipped. `frame` is the composition's size in px; the document
 * is the same-origin player iframe's, whose boxes are in those px. Never throws.
 */
export function regionText(
  doc: Document | null,
  region: Region,
  frame: { width: number; height: number },
): string[] {
  if (!doc) return [];
  const out: string[] = [];
  try {
    const x0 = region.x * frame.width;
    const y0 = region.y * frame.height;
    const x1 = (region.x + region.w) * frame.width;
    const y1 = (region.y + region.h) * frame.height;
    const view = doc.defaultView;
    for (const el of doc.querySelectorAll<HTMLElement>('[data-text]')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.right < x0 || r.left > x1 || r.bottom < y0 || r.top > y1) continue;
      if (hidden(el, view)) continue;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text === '' || out.includes(text.slice(0, REGION_TEXT_MAX_CHARS))) continue;
      out.push(text.slice(0, REGION_TEXT_MAX_CHARS));
      if (out.length >= REGION_TEXT_MAX_ITEMS) break;
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * The centre of the graphic's focal element (`data-focal`) as a padded region, for the keyboard
 * path of draw mode (R8.2): Enter places the ellipse around it. Null when there is none.
 */
export function focalRegion(
  doc: Document | null,
  frame: { width: number; height: number },
  pad = 0.12,
): Region | null {
  if (!doc) return null;
  try {
    const el = doc.querySelector<HTMLElement>('[data-focal]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const w = r.width / frame.width;
    const h = r.height / frame.height;
    const px = w * pad;
    const py = h * pad;
    const x0 = Math.max(0, r.left / frame.width - px);
    const y0 = Math.max(0, r.top / frame.height - py);
    const x1 = Math.min(1, r.right / frame.width + px);
    const y1 = Math.min(1, r.bottom / frame.height + py);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  } catch {
    return null;
  }
}

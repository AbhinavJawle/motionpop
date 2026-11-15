import type { Box } from '../core/safe-area';
import type { TextSlot } from '../engine/stage';

/** One text row in a stacked column. Sizes are shares of the frame height. */
export interface Row {
  id: string;
  /** Largest font size, as a share of frame height. */
  size: number;
  /** Smallest font size as a share of `size` (fitText shrinks down to it). */
  min?: number;
  lines?: number;
  /** Gap after this row, as a share of its own font size. */
  gap?: number;
}

const LINE_HEIGHT = 1.2; // Geist's content area is taller than 1em

/** Snap a box inward to whole pixels, so rounding never pushes a child outside it. */
export function snapIn(b: Box): Box {
  const x = Math.ceil(b.x);
  const y = Math.ceil(b.y);
  return { x, y, width: Math.floor(b.x + b.width) - x, height: Math.floor(b.y + b.height) - y };
}

/**
 * Stack rows top to bottom inside `area`. Every box is sized for its largest font and line
 * count, so fitting only shrinks text inside its own box and boxes never overlap. `bias` puts
 * the free space above (0) or below (1) the block; 0.45 sits at the optical centre.
 */
export function stack(
  area: Box,
  frameH: number,
  rows: readonly Row[],
  opts: { align: 'left' | 'center'; bias?: number },
): Record<string, TextSlot> {
  const a = snapIn(area);
  const sized = rows.map((r) => {
    const max = Math.round(frameH * r.size);
    return {
      r,
      max,
      h: Math.ceil(max * LINE_HEIGHT * (r.lines ?? 1)),
      gap: Math.round(max * (r.gap ?? 0)),
    };
  });
  const total = sized.reduce((n, s, i) => n + s.h + (i < sized.length - 1 ? s.gap : 0), 0);
  // If the block is taller than the area, scale every row down together.
  const k = total > a.height ? a.height / total : 1;
  let y = a.y + Math.floor(Math.max(0, a.height - total * k) * (opts.bias ?? 0.45));
  const out: Record<string, TextSlot> = {};
  for (const s of sized) {
    const h = Math.floor(s.h * k);
    const max = Math.max(1, Math.floor(s.max * k));
    out[s.r.id] = {
      box: { x: a.x, y, width: a.width, height: h },
      max,
      min: Math.max(1, Math.round(max * (s.r.min ?? 0.6))),
      lineHeight: LINE_HEIGHT,
      maxLines: s.r.lines ?? 1,
      align: opts.align,
    };
    y += h + Math.floor(s.gap * k);
  }
  return out;
}

/** Split `area` into a left and right column with a gutter (shares of the width). */
export function columns(area: Box, left: number, gutter = 0.05): [Box, Box] {
  const a = snapIn(area);
  const lw = Math.floor(a.width * left);
  const g = Math.floor(a.width * gutter);
  return [
    { x: a.x, y: a.y, width: lw, height: a.height },
    { x: a.x + lw + g, y: a.y, width: a.width - lw - g, height: a.height },
  ];
}

/** A centred column that takes `share` of the width. */
export function column(area: Box, share: number): Box {
  const a = snapIn(area);
  const width = Math.floor(a.width * share);
  return { x: a.x + Math.floor((a.width - width) / 2), y: a.y, width, height: a.height };
}

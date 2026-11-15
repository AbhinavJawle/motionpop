import type { DecorId } from '@motionpop/schemas';
import { getStroke } from 'perfect-freehand';
import rough from 'roughjs';
import type { Box } from '../core/safe-area';

/**
 * Marks (spec 07 R3.1): the look's way of saying "this matters". Hand-drawn ones come from
 * roughjs with a fixed seed, so the same slot draws the same wobble in preview and render.
 * roughjs falls back to Math.random when the seed is 0 or missing: `seedOf` never returns 0.
 */
export interface DecorOptions {
  /** Stroke or fill colour. */
  color: string;
  /** Font size of the text being marked, in px: marks scale with it. */
  size: number;
  /** Base stroke width from the look. */
  stroke: number;
  seed: number;
  radius: number;
  /** The frame. A mark that would leave it falls back to an underline. */
  frame: Box;
  /** Boxes of the other actors: a mark never crosses them. */
  keepClear: readonly Box[];
  /** The marked words, one box each, for marks that treat words one by one (`cutout`). */
  words?: readonly Box[];
  /** Second fill for marks that alternate colours (`cutout`). */
  alt?: string;
}

export interface Decor {
  el: SVGSVGElement | HTMLElement;
  /** `draw`: revealed by stroking the path on. `grow`: revealed by growing from the left. */
  reveal: 'draw' | 'grow';
  /** Goes above the text (outlines) or behind it (fills). */
  layer: 'over' | 'under';
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const intersects = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const generator = rough.generator();

/** A non-zero integer seed for roughjs. */
export const seedOf = (seed: number, salt: number): number =>
  (Math.abs(Math.trunc(seed) * 31 + salt) % 2147483646) + 1;

function svg(doc: Document, reveal: Decor['reveal']): SVGSVGElement {
  const el = doc.createElementNS(SVG_NS, 'svg');
  el.setAttribute(
    'style',
    'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;',
  );
  el.dataset.reveal = reveal;
  return el;
}

function strokePaths(
  doc: Document,
  root: SVGSVGElement,
  drawable: ReturnType<typeof generator.line>,
  o: DecorOptions,
  width: number,
) {
  for (const p of generator.toPaths(drawable)) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', p.d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', o.color);
    path.setAttribute('stroke-width', String(width));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    // pathLength 1 lets the stage reveal the stroke without measuring it.
    path.setAttribute('pathLength', '1');
    path.setAttribute('stroke-dasharray', '1 1');
    root.append(path);
  }
}

/**
 * Build a mark around or under `text` (the rectangle of the text being marked, in frame px).
 * Unknown or not-yet-built ids fall back to a plain underline.
 */
export function buildDecor(
  doc: Document,
  id: DecorId | undefined,
  text: Box,
  o: DecorOptions,
): Decor {
  const w = Math.max(4, o.stroke, o.size * 0.045);
  switch (id) {
    case 'marker-circle': {
      // An ellipse has to be about 1.45x wider and 1.24x taller than the text to clear its
      // corners. If that would leave the frame or cross another actor, underline instead.
      const cx = text.x + text.width / 2;
      const cy = text.y + text.height / 2;
      const ew = text.width * 1.45 + o.size * 0.1;
      const eh = text.height * 1.24;
      const ring: Box = {
        x: cx - ew / 2 - w,
        y: cy - eh / 2 - w,
        width: ew + 2 * w,
        height: eh + 2 * w,
      };
      const inFrame =
        ring.x >= o.frame.x + w &&
        ring.y >= o.frame.y + w &&
        ring.x + ring.width <= o.frame.x + o.frame.width - w &&
        ring.y + ring.height <= o.frame.y + o.frame.height - w;
      if (!inFrame || o.keepClear.some((b) => intersects(ring, b)))
        return buildDecor(doc, 'marker-underline', text, o);
      const el = svg(doc, 'draw');
      el.dataset.mark = 'marker-circle';
      const shape = generator.ellipse(cx, cy, ew, eh, {
        seed: seedOf(o.seed, 1),
        roughness: 1.1,
        bowing: 1.4,
        strokeWidth: w,
        stroke: o.color,
        curveFitting: 0.92,
      });
      strokePaths(doc, el, shape, o, w);
      return { el, reveal: 'draw', layer: 'over' };
    }
    case 'marker-underline':
    case 'scribble': {
      const el = svg(doc, 'draw');
      el.dataset.mark = 'marker-underline';
      const y = text.y + text.height + o.size * 0.04;
      const shape = generator.line(
        text.x - o.size * 0.05,
        y,
        text.x + text.width + o.size * 0.05,
        y - o.size * 0.03,
        {
          seed: seedOf(o.seed, 2),
          roughness: 1.6,
          bowing: 2.2,
          strokeWidth: w,
          stroke: o.color,
        },
      );
      strokePaths(doc, el, shape, o, w);
      return { el, reveal: 'draw', layer: 'over' };
    }
    case 'cutout': {
      // Cut paper (paper-collage): one patch behind each word, or behind the whole text, with
      // straight scissor cuts at seeded corners, alternating the main and the second colour,
      // each turned a little. Behind the text, inside the frame by 2.5 % of its width.
      const el = svg(doc, 'grow');
      el.dataset.mark = 'cutout';
      const boxes = o.words?.length ? o.words : [text];
      const inset = o.frame.width * 0.025;
      const j = o.size * 0.06;
      boxes.forEach((b, i) => {
        const r = (k: number) => (seedOf(o.seed, 40 + i * 9 + k) % 1000) / 1000;
        const x0 = Math.max(o.frame.x + inset + j, b.x - o.size * 0.12);
        const x1 = Math.min(o.frame.x + o.frame.width - inset - j, b.x + b.width + o.size * 0.12);
        const y0 = b.y - o.size * 0.04;
        const y1 = b.y + b.height + o.size * 0.02;
        const pts = [
          [x0 - r(0) * j, y0 + r(1) * j],
          [x1 + r(2) * j, y0 - r(3) * j * 0.5],
          [x1 - r(4) * j * 0.5, y1 + r(5) * j * 0.5],
          [x0 + r(6) * j * 0.5, y1 - r(7) * j * 0.5],
        ];
        const poly = doc.createElementNS(SVG_NS, 'polygon');
        poly.setAttribute(
          'points',
          pts
            .map(([px, py]) => `${(px as number).toFixed(1)},${(py as number).toFixed(1)}`)
            .join(' '),
        );
        poly.setAttribute('fill', i % 2 === 0 ? o.color : (o.alt ?? o.color));
        const rot = (r(8) - 0.5) * 5;
        poly.setAttribute(
          'transform',
          `rotate(${rot.toFixed(2)} ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)})`,
        );
        el.append(poly);
      });
      const left = Math.min(...boxes.map((b) => b.x));
      el.style.transformOrigin = `${left}px ${text.y + text.height / 2}px`;
      return { el, reveal: 'grow', layer: 'under' };
    }
    case 'highlighter': {
      // A felt-tip pass behind the text: one freehand stroke through its middle.
      const el = svg(doc, 'grow');
      el.dataset.mark = 'highlighter';
      const y = text.y + text.height * 0.58;
      const n = 8;
      const stroke = text.height * 0.5;
      // The visible pass runs a little past the text on both sides and stays at least 2.5 % of
      // the frame width inside the frame. The round caps add half the stroke at each end, so the
      // path runs between the cap centres (found in the editor preview: a big number at the
      // safe-area edge put the cap on the frame edge).
      const inset = o.frame.width * 0.025;
      const left = Math.max(o.frame.x + inset, text.x - o.size * 0.08);
      const right = Math.min(
        o.frame.x + o.frame.width - inset,
        text.x + text.width + o.size * 0.08,
      );
      const mid = (left + right) / 2;
      const r = stroke / 2;
      // A pass shorter than its own stroke becomes one dab at the middle, kept inside too.
      const lo = o.frame.x + inset + r;
      const hi = o.frame.x + o.frame.width - inset - r;
      const x0 = Math.min(Math.max(lo, Math.min(mid, left + r)), hi);
      const x1 = Math.max(x0, Math.min(hi, Math.max(mid, right - r)));
      const pts = Array.from({ length: n + 1 }, (_, i) => {
        const wobble = ((seedOf(o.seed, 3 + i) % 100) / 100 - 0.5) * o.size * 0.05;
        return [x0 + ((x1 - x0) * i) / n, y + wobble, 0.5];
      });
      const outline = getStroke(pts, {
        size: stroke,
        thinning: 0.15,
        smoothing: 0.6,
        streamline: 0.4,
        simulatePressure: false,
        // A finished pass: the outline reaches the last point instead of trailing behind it.
        last: true,
      });
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute(
        'd',
        outline
          .map(
            ([px, py], i) =>
              `${i === 0 ? 'M' : 'L'}${(px as number).toFixed(1)} ${(py as number).toFixed(1)}`,
          )
          .join(' ') + ' Z',
      );
      path.setAttribute('fill', o.color);
      el.append(path);
      el.style.transformOrigin = `${left}px ${y}px`;
      return { el, reveal: 'grow', layer: 'under' };
    }
    default: {
      // Plain rule under the text (also the fallback for marks that arrive with later looks).
      const el = doc.createElement('div');
      el.dataset.mark = 'underline';
      el.dataset.reveal = 'grow';
      el.style.cssText = `position:absolute;left:${text.x}px;top:${Math.round(text.y + text.height)}px;width:${text.width}px;height:${Math.max(2, Math.round(w * 0.7))}px;background:${o.color};border-radius:${o.radius}px;transform-origin:left center;`;
      return { el, reveal: 'grow', layer: 'under' };
    }
  }
}

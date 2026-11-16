import type { FrameNote } from '@motionpop/schemas';
import type { CaptureRegion } from './capture';

/**
 * The geometry of frame notes (spec 09 R8.2, design "Flows → Frame note"). Pure, all in frame
 * units: x and y run 0..1 across the frame's width and height. The UI turns pointer positions
 * into this space, `fitStroke` turns a drawn stroke into a stored shape and the region the AI
 * is asked about, `bubbleAnchor` places the numbered bubble, `cropRect` is what frame capture
 * sends to the model.
 */
export interface Pt {
  x: number;
  y: number;
}
export type Region = CaptureRegion;
export type NoteShape = FrameNote['shape'];

/** A region smaller than this share of the frame grows to it (design: "grow to 4 %"). */
export const MIN_REGION_AREA = 0.04;
/** A stroke whose end is within this share of its diagonal from its start counts as closed. */
export const CLOSED_RATIO = 0.15;
/** A path keeps at most this many points. */
export const MAX_PATH_POINTS = 64;
/** The ellipse of a click or a tiny stroke. */
const CLICK_RADIUS = 0.05;
/** Extra room around a circled thing for the model's picture, as a share of the region. */
const CROP_PAD = 0.12;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function boundsOf(points: readonly Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

/**
 * Grows a region to `MIN_REGION_AREA`, keeping its centre and shape where the frame allows, and
 * keeps it inside the frame. It only ever grows (a region that already is big enough is returned
 * as it is, clamped), so what the user circled stays inside it.
 */
export function growRegion(r: Region): Region {
  let w = Math.min(1, Math.max(0, r.w));
  let h = Math.min(1, Math.max(0, r.h));
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (w * h < MIN_REGION_AREA) {
    const s = w > 0 && h > 0 ? Math.sqrt(MIN_REGION_AREA / (w * h)) : Infinity;
    // A region with no width or no height has no aspect to keep: a square, or the wider side.
    w = Number.isFinite(s) ? Math.min(1, w * s) : Math.max(w, Math.sqrt(MIN_REGION_AREA));
    h = Number.isFinite(s) ? Math.min(1, h * s) : Math.max(h, Math.sqrt(MIN_REGION_AREA));
    // A clamp at the frame's edge can leave the area short: widen the other side.
    if (w * h < MIN_REGION_AREA) w = Math.min(1, MIN_REGION_AREA / h);
    if (w * h < MIN_REGION_AREA) h = Math.min(1, MIN_REGION_AREA / w);
  }
  const x = Math.min(1 - w, Math.max(0, cx - w / 2));
  const y = Math.min(1 - h, Math.max(0, cy - h / 2));
  return { x, y, w, h };
}

/** Ramer–Douglas–Peucker, iterative so a long stroke can't overflow the stack. */
function simplify(points: readonly Pt[], epsilon: number): Pt[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop() as [number, number];
    const pa = points[a] as Pt;
    const pb = points[b] as Pt;
    let far = -1;
    let farD = epsilon;
    for (let i = a + 1; i < b; i++) {
      const p = points[i] as Pt;
      const len = dist(pa, pb);
      const d =
        len === 0
          ? dist(p, pa)
          : Math.abs((pb.y - pa.y) * p.x - (pb.x - pa.x) * p.y + pb.x * pa.y - pb.y * pa.x) / len;
      if (d > farD) {
        far = i;
        farD = d;
      }
    }
    if (far >= 0) {
      keep[far] = true;
      stack.push([a, far], [far, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** At most `MAX_PATH_POINTS` points that follow the stroke: the tolerance grows until it fits. */
export function simplifyPath(points: readonly Pt[]): Pt[] {
  // A pointer stream can have thousands of points; 400 evenly spaced ones lose nothing visible.
  let work = [...points];
  if (work.length > 400) {
    const step = work.length / 400;
    work = Array.from({ length: 400 }, (_, i) => work[Math.floor(i * step)] as Pt);
    work[work.length - 1] = points[points.length - 1] as Pt;
  }
  let eps = 0.002;
  let out = simplify(work, eps);
  while (out.length > MAX_PATH_POINTS && eps < 1) {
    eps *= 1.5;
    out = simplify(work, eps);
  }
  return out.slice(0, MAX_PATH_POINTS);
}

export interface FittedStroke {
  shape: NoteShape;
  /** What the note is about: the shape's bounds, grown to `MIN_REGION_AREA`, inside the frame. */
  region: Region;
}

/** The ellipse `[cx, cy, rx, ry]` around a region, as a stored shape. */
function ellipseOf(b: { x0: number; y0: number; x1: number; y1: number }): NoteShape {
  return {
    kind: 'circle',
    points: [
      clamp01((b.x0 + b.x1) / 2),
      clamp01((b.y0 + b.y1) / 2),
      clamp01((b.x1 - b.x0) / 2),
      clamp01((b.y1 - b.y0) / 2),
    ],
  };
}

/** The ellipse around a region (the keyboard path: Enter circles the focal element). */
export function ellipseAround(region: Region): FittedStroke {
  const shape = ellipseOf({
    x0: region.x,
    y0: region.y,
    x1: region.x + region.w,
    y1: region.y + region.h,
  });
  return { shape, region: regionOf(shape) };
}

/**
 * A drawn stroke to a shape (design step 2). A roughly closed stroke (its end within 15 % of its
 * diagonal from its start) becomes an ellipse around its bounding box; anything else stays a path
 * simplified to at most 64 points. A click, or a stroke with no extent, becomes a small ellipse.
 * Every value is clamped to 0..1 (the note commands refuse anything else).
 */
export function fitStroke(stroke: readonly Pt[]): FittedStroke {
  const pts = stroke.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));
  if (pts.length === 0) {
    return fitStroke([{ x: 0.5, y: 0.5 }]);
  }
  const b = boundsOf(pts);
  const diag = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
  if (pts.length < 2 || diag < 0.01) {
    const c = pts[0] as Pt;
    const box = {
      x0: Math.max(0, c.x - CLICK_RADIUS),
      y0: Math.max(0, c.y - CLICK_RADIUS),
      x1: Math.min(1, c.x + CLICK_RADIUS),
      y1: Math.min(1, c.y + CLICK_RADIUS),
    };
    const shape = ellipseOf(box);
    return { shape, region: regionOf(shape) };
  }
  const first = pts[0] as Pt;
  const last = pts[pts.length - 1] as Pt;
  if (dist(first, last) <= CLOSED_RATIO * diag) {
    const shape = ellipseOf(b);
    return { shape, region: regionOf(shape) };
  }
  const path = simplifyPath(pts);
  const shape: NoteShape = { kind: 'path', points: path.flatMap((p) => [p.x, p.y]) };
  return { shape, region: regionOf(shape) };
}

/**
 * The region a stored shape is about: its bounds, grown to `MIN_REGION_AREA`, inside the frame.
 * `aspect` is the frame's width over its height: a 3-value circle `[cx, cy, r]` is a true circle
 * whose radius is `r` of the frame's width, so it is `r × aspect` of the height.
 */
export function regionOf(shape: NoteShape, aspect = 1): Region {
  const v = shape.points.map(clamp01);
  if (shape.kind === 'circle') {
    const cx = v[0] ?? 0.5;
    const cy = v[1] ?? 0.5;
    const rx = v[2] ?? 0.05;
    const ry = v.length >= 4 ? (v[3] ?? rx) : Math.min(1, rx * aspect);
    const x0 = Math.max(0, cx - rx);
    const y0 = Math.max(0, cy - ry);
    const x1 = Math.min(1, cx + rx);
    const y1 = Math.min(1, cy + ry);
    return growRegion({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < v.length; i += 2) pts.push({ x: v[i] as number, y: v[i + 1] as number });
  if (pts.length === 0) return growRegion({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 });
  const b = boundsOf(pts);
  return growRegion({ x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 });
}

/** The crop frame capture takes for a region: the region plus a little context, inside the frame. */
export function cropRect(region: Region): Region {
  const padX = region.w * CROP_PAD;
  const padY = region.h * CROP_PAD;
  const x0 = clamp01(region.x - padX);
  const y0 = clamp01(region.y - padY);
  const x1 = clamp01(region.x + region.w + padX);
  const y1 = clamp01(region.y + region.h + padY);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export type BubbleSide = 'above' | 'right' | 'left' | 'below';
export interface BubblePlacement {
  side: BubbleSide;
  /** The bubble's box in frame units, always inside the frame. */
  box: Region;
  /** Where the leader line leaves the bubble. */
  from: Pt;
  /** Where it touches the shape's region. */
  to: Pt;
}

/**
 * Places the numbered bubble (design step 3) on the side of the region with room for it:
 * above first, then right, left, below; the first side where the whole bubble fits in the frame
 * (with a small gap) wins. If none fits (a huge region), the bubble sits inside the frame at the
 * side with the most room. `size` is the bubble's width and height in frame units.
 */
export function bubbleAnchor(
  region: Region,
  size: { w: number; h: number } = { w: 0.26, h: 0.08 },
): BubblePlacement {
  const gap = 0.03;
  const bw = Math.min(1, size.w);
  const bh = Math.min(1, size.h);
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  const fitX = (x: number) => Math.min(1 - bw, Math.max(0, x));
  const fitY = (y: number) => Math.min(1 - bh, Math.max(0, y));
  const spots: Record<BubbleSide, { x: number; y: number; room: number }> = {
    above: { x: fitX(cx - bw / 2), y: region.y - gap - bh, room: region.y - gap - bh },
    right: {
      x: region.x + region.w + gap,
      y: fitY(cy - bh / 2),
      room: 1 - (region.x + region.w + gap + bw),
    },
    left: { x: region.x - gap - bw, y: fitY(cy - bh / 2), room: region.x - gap - bw },
    below: {
      x: fitX(cx - bw / 2),
      y: region.y + region.h + gap,
      room: 1 - (region.y + region.h + gap + bh),
    },
  };
  const order: BubbleSide[] = ['above', 'right', 'left', 'below'];
  let side = order.find((s) => spots[s].room >= 0);
  if (!side) side = order.reduce((best, s) => (spots[s].room > spots[best].room ? s : best));
  const spot = spots[side];
  const box: Region = { x: fitX(spot.x), y: fitY(spot.y), w: bw, h: bh };
  const edge = (s: BubbleSide): { from: Pt; to: Pt } => {
    switch (s) {
      case 'above':
        return {
          from: { x: box.x + box.w / 2, y: box.y + box.h },
          to: { x: cx, y: region.y },
        };
      case 'below':
        return { from: { x: box.x + box.w / 2, y: box.y }, to: { x: cx, y: region.y + region.h } };
      case 'right':
        return { from: { x: box.x, y: box.y + box.h / 2 }, to: { x: region.x + region.w, y: cy } };
      case 'left':
        return { from: { x: box.x + box.w, y: box.y + box.h / 2 }, to: { x: region.x, y: cy } };
    }
  };
  return { side, box, ...edge(side) };
}

/**
 * The bubble's width and height in frame units for a frame of this aspect (width over height).
 * The frame is shown about 405 px tall, so a 16:9 frame has room for a narrow bubble, while a
 * square or portrait frame needs most of its width for the same text. `wide` is for the ones that
 * carry a status or an input.
 */
export function bubbleSize(aspect: number, wide = false): { w: number; h: number } {
  if (aspect >= 1.5) return wide ? { w: 0.4, h: 0.08 } : { w: 0.27, h: 0.08 };
  if (aspect >= 1) return wide ? { w: 0.64, h: 0.08 } : { w: 0.46, h: 0.08 };
  return wide ? { w: 0.94, h: 0.06 } : { w: 0.84, h: 0.06 };
}

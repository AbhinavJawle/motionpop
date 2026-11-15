import type { MaterialId, StylePack, SurfaceKind } from '@motionpop/schemas';
import type { Box } from '../core/safe-area';
import { rngFor } from '../core/rng';

/**
 * Materials (spec 07 R3.1, R3.3): deterministic builders for the surfaces a scene asks for.
 * Torn edges are seeded polygons, not live filters, so preview and render are identical.
 * Materials not built yet (halftone, grain, glow, grid) are skipped: the plain fallback.
 */
export interface SurfaceOptions {
  kind: SurfaceKind;
  colors: StylePack['colors'];
  seed: number;
  frameH: number;
}

export interface Surface {
  /** Positioned at the box; the scene inserts it behind the text it carries. */
  el: HTMLElement;
  /** Resting rotation in degrees (the `tilt` material), applied by the stage on every seek. */
  tilt: number;
  /** The surface's fill: paper, or the accent for a colour strip (text on it is recoloured). */
  fill: string;
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
/** Mix two #rrggbb colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [hex(a), hex(b)];
  return `#${x
    .map((v, i) => Math.round(v + ((y[i] as number) - v) * t))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** A torn outline as a CSS polygon in percentages: every side jagged, seeded. */
export function tornPolygon(w: number, h: number, seed: number, amp: number): string {
  const rnd = rngFor(seed, 'torn');
  const step = Math.max(6, amp * 2.2);
  const pts: string[] = [];
  const ax = (amp / Math.max(1, w)) * 100;
  const ay = (amp / Math.max(1, h)) * 100;
  const jitter = (a: number) => rnd() * a;
  const nx = Math.max(3, Math.round(w / step));
  const ny = Math.max(2, Math.round(h / step));
  for (let i = 0; i <= nx; i++)
    pts.push(`${((i / nx) * 100).toFixed(2)}% ${jitter(ay).toFixed(2)}%`);
  for (let i = 1; i <= ny; i++)
    pts.push(`${(100 - jitter(ax)).toFixed(2)}% ${((i / ny) * 100).toFixed(2)}%`);
  for (let i = nx - 1; i >= 0; i--)
    pts.push(`${((i / nx) * 100).toFixed(2)}% ${(100 - jitter(ay)).toFixed(2)}%`);
  for (let i = ny - 1; i >= 1; i--)
    pts.push(`${jitter(ax).toFixed(2)}% ${((i / ny) * 100).toFixed(2)}%`);
  return `polygon(${pts.join(',')})`;
}

/** Builds the material stack for one surface, or null when the look leaves it plain. */
export function buildSurface(
  doc: Document,
  stack: readonly MaterialId[] | undefined,
  box: Box,
  o: SurfaceOptions,
): Surface | null {
  const has = (m: MaterialId) => stack?.includes(m) ?? false;
  if (!stack || stack.every((m) => m === 'plain')) return null;
  const rnd = rngFor(o.seed, `surface-${o.kind}`);
  const paper = mix(o.colors.bg, '#FFFFFF', 0.55);
  // A strip without paper is a colour strip (cut paper in the accent); cards and photos are paper.
  const fill = has('paper') || o.kind !== 'strip' ? paper : o.colors.accent;

  const el = doc.createElement('div');
  el.dataset.surface = o.kind;
  el.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;transform-origin:center center;`;
  if (has('shadow-soft')) {
    // drop-shadow follows the torn outline (a box-shadow would be clipped away).
    const s = Math.round(o.frameH * 0.006);
    el.style.filter = `drop-shadow(0 ${s}px ${s * 2}px rgba(20,16,10,0.28))`;
  }
  const inner = doc.createElement('div');
  inner.style.cssText = `position:absolute;inset:0;background:${fill};`;
  if (has('white-border')) {
    inner.style.border = `${Math.max(6, Math.round(o.frameH * 0.012))}px solid #FFFFFF`;
    inner.style.boxSizing = 'border-box';
  }
  if (has('torn-edge')) {
    const amp = Math.min(box.height * 0.1, o.frameH * 0.007);
    inner.style.clipPath = tornPolygon(box.width, box.height, o.seed, amp);
  }
  el.append(inner);
  if (has('tape')) {
    const tw = Math.round(Math.min(box.width * 0.34, o.frameH * 0.13));
    const th = Math.round(o.frameH * 0.034);
    const tape = doc.createElement('div');
    tape.dataset.material = 'tape';
    const left = Math.round(box.width * (0.3 + rnd() * 0.4) - tw / 2);
    const rot = (rnd() * 2 - 1) * 5;
    tape.style.cssText = `position:absolute;left:${left}px;top:${-th / 2}px;width:${tw}px;height:${th}px;background:rgba(250,244,226,0.62);box-shadow:0 1px 2px rgba(0,0,0,0.12);transform:rotate(${rot.toFixed(2)}deg);clip-path:${tornPolygon(tw, th, o.seed + 7, th * 0.12)};`;
    el.append(tape);
  }
  const tilt = has('tilt') ? (rnd() < 0.5 ? -1 : 1) * (0.8 + rnd() * 1.6) : 0;
  return { el, tilt, fill };
}

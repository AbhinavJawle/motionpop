import type { Look } from '@motionpop/schemas';
import rough from 'roughjs';
import type { StylePack } from '../contract';
import { eases } from '../core/ease';
import { progress } from '../core/interp';
import type { Box } from '../core/safe-area';
import type { Companion } from '../engine/companion';
import { seedOf } from '../engine/decor';
import { mix, tornPolygon } from '../engine/materials';
import { KIT_ICONS } from '../film/icons.generated';

/**
 * The companion layer (spec 07c R2): a number made physical, or a line's subject as a hand-drawn
 * stamp, in the open side of a split frame when the scene has no picture. Built once; `seek` is a
 * pure function of time. Counting companions fill in step with the number's own count (same
 * start, same land, same ease), so the dots, cells or icons arrive as the digits climb.
 */
export interface CompanionLayer {
  el: HTMLElement;
  seek: (tMs: number) => void;
  /** When the companion has fully arrived (for the effects bed). */
  landMs: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Ease that overshoots by roughly `s` and lands exactly at 1. */
const back = (x: number, s: number): number => {
  const p = clamp01(x) - 1;
  return 1 + (s + 1) * p * p * p + s * p * p;
};
/** Deterministic small pseudo-random in [0, 1) from a seed and a salt. */
const hash01 = (seed: number, salt: number) => {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function buildCompanionLayer(args: {
  doc: Document;
  parent: HTMLElement;
  box: Box;
  companion: Companion;
  style: StylePack;
  look?: Look | undefined;
  seed: number;
  durationMs: number;
  /** The focal entrance: counting companions start here and land with the number. */
  startMs: number;
  landMs: number;
  exitStartMs: number;
  exit: 'fade' | 'none';
  frameH: number;
}): CompanionLayer {
  const { doc, box, companion: c, style, look, seed, frameH } = args;
  const colors = style.colors;
  const ease = eases[style.motion.enterEase];
  const stepMs = look?.personality?.stepFps ? 1000 / look.personality.stepFps : 0;
  const stepped = stepMs > 0;
  const torn =
    stepped ||
    Boolean(look?.surfaces?.card?.includes('torn-edge')) ||
    Boolean(look?.image?.treatment.includes('torn-edge'));
  const W = box.width;
  const H = box.height;
  const startMs = Math.max(0, Math.round(args.startMs));
  const landMs = Math.max(startMs + 1, Math.round(args.landMs));
  const exitMs = args.exit === 'none' ? 0 : Math.max(1, args.durationMs - args.exitStartMs);

  const outer = doc.createElement('div');
  outer.dataset.actor = 'companion';
  outer.dataset.companion = c.kind;
  outer.className = 'mp-companion';
  outer.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${W}px;height:${H}px;transform-origin:50% 55%;will-change:transform,opacity;pointer-events:none;`;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;';
  outer.append(svg);
  args.parent.append(outer);

  const el = <K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | number>,
    parent: Element = svg,
  ): SVGElementTagNameMap[K] => {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    parent.append(node);
    return node;
  };

  /** An icon in a group at (cx, cy) of `size` px; its strokes carry pathLength 1 for draw-ons. */
  const icon = (name: string, cx: number, cy: number, size: number, color: string, width = 1.6) => {
    const g = el('g', {
      transform: `translate(${(cx - size / 2).toFixed(1)} ${(cy - size / 2).toFixed(1)}) scale(${(size / 24).toFixed(4)})`,
      fill: 'none',
      stroke: color,
      'stroke-width': width,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    const inner = el('g', {}, g);
    const strokes: SVGElement[] = [];
    for (const [tag, attrs] of KIT_ICONS[name] ?? []) {
      const node = el(tag as keyof SVGElementTagNameMap, { ...attrs, pathLength: 1 }, inner);
      node.setAttribute('stroke-dasharray', '1 1');
      strokes.push(node as SVGElement);
    }
    return { g, inner, strokes, cx, cy };
  };
  const drawStrokes = (strokes: readonly SVGElement[], p: number) => {
    const off = (1 - clamp01(p)).toFixed(4);
    for (const s of strokes) s.setAttribute('stroke-dashoffset', off);
  };
  /** Rough (hand-drawn) paths for a roughjs drawable, each with pathLength 1. */
  const roughPaths = (
    shape: ReturnType<ReturnType<typeof rough.generator>['ellipse']>,
    color: string,
    width: number,
  ) => {
    const gen = rough.generator();
    return gen
      .toPaths(shape)
      .slice(0, 1)
      .map((p) => {
        const path = el('path', {
          d: p.d,
          fill: 'none',
          stroke: color,
          'stroke-width': width,
          'stroke-linecap': 'round',
          pathLength: 1,
          'stroke-dasharray': '1 1',
          'stroke-dashoffset': 1,
        });
        return path as SVGElement;
      });
  };

  const q = (t: number) => (stepped ? Math.floor(t / stepMs) * stepMs : t);
  /** The number's count progress at t (0 → 1, the scene's own enter ease). */
  const counted = (t: number) => ease(progress(t, startMs, landMs - startMs));
  const muted = mix(colors.bg, colors.ink, 0.14);
  let draw: (t: number) => void;
  let arrived = landMs;

  if (c.kind === 'units') {
    // A 10 × 10 grid: the cells set out just before the count, then fill in the accent with it.
    const side = Math.min(W, H) * 0.86;
    const x0 = (W - side) / 2;
    const y0 = (H - side) / 2;
    const cell = side / 10;
    const gap = cell * 0.18;
    const cells = Array.from({ length: 100 }, (_, k) => {
      const r = el('rect', {
        x: (x0 + (k % 10) * cell + gap / 2).toFixed(1),
        y: (y0 + Math.floor(k / 10) * cell + gap / 2).toFixed(1),
        width: (cell - gap).toFixed(1),
        height: (cell - gap).toFixed(1),
        rx: ((cell - gap) * 0.22).toFixed(1),
        fill: muted,
      });
      r.style.transformBox = 'fill-box';
      r.style.transformOrigin = 'center';
      return r;
    });
    const setOut = Math.max(0, startMs - 420);
    draw = (t) => {
      const fill = counted(t) * c.filled;
      cells.forEach((r, k) => {
        const row = Math.floor(k / 10);
        const col = k % 10;
        const appear = ease(progress(t, setOut + (row + col) * 14, 260));
        const lit = clamp01(fill - k);
        r.setAttribute('fill', lit > 0 ? colors.accent : muted);
        const s = appear * (lit > 0 ? 0.8 + 0.2 * back(lit, 2.2) : 1);
        r.style.transform = `scale(${s.toFixed(3)})`;
        r.style.opacity = appear > 0 ? '1' : '0';
      });
    };
  } else if (c.kind === 'dots') {
    // One dot per thing, filling with the count. An icon above names what the dots are.
    const head = c.icon ? H * 0.24 : 0;
    const fieldY = head;
    const fh = H - head;
    const cols = Math.max(1, Math.ceil(Math.sqrt((c.n * W) / fh)));
    const rows = Math.max(1, Math.ceil(c.n / cols));
    const step = Math.min(W / cols, fh / rows);
    const r = Math.max(1.5, step * 0.34);
    const gx = (W - cols * step) / 2;
    const gy = fieldY + (fh - rows * step) / 2;
    const dots = Array.from({ length: c.n }, (_, k) => {
      const jx = (hash01(seed, k) - 0.5) * step * 0.22;
      const jy = (hash01(seed, k + 999) - 0.5) * step * 0.22;
      const d = el('circle', {
        cx: (gx + (k % cols) * step + step / 2 + jx).toFixed(2),
        cy: (gy + Math.floor(k / cols) * step + step / 2 + jy).toFixed(2),
        r: r.toFixed(2),
        fill: colors.accent,
      });
      d.style.transformBox = 'fill-box';
      d.style.transformOrigin = 'center';
      return d;
    });
    const ic = c.icon ? icon(c.icon, W / 2, head * 0.48, head * 0.78, colors.ink, 1.7) : null;
    draw = (t) => {
      const fill = counted(t) * c.n;
      dots.forEach((d, k) => {
        const lit = clamp01((fill - k) * 1.5);
        d.style.transform = `scale(${(lit > 0 ? back(lit, 1.8) : 0).toFixed(3)})`;
      });
      if (ic) drawStrokes(ic.strokes, ease(progress(t, Math.max(0, startMs - 500), 600)));
    };
  } else if (c.kind === 'icons') {
    // A row (or two) of the thing itself, one icon per unit, popping in with the count.
    // As square a grid as the box allows, so each icon is as large as it can be.
    let cols = c.n;
    let best = 0;
    for (let k = 1; k <= c.n; k++) {
      const r = Math.ceil(c.n / k);
      const s = Math.min(W / k, H / r);
      if (s > best + 0.5) {
        best = s;
        cols = k;
      }
    }
    const rows = Math.ceil(c.n / cols);
    const cellW = W / cols;
    const cellH = Math.min(H / rows, cellW * 1.15);
    const size = Math.min(cellW, cellH) * 0.72;
    const oy = (H - rows * cellH) / 2;
    const items = Array.from({ length: c.n }, (_, k) => {
      const row = Math.floor(k / cols);
      const inRow = row === rows - 1 ? c.n - row * cols : cols;
      const ox = (W - inRow * cellW) / 2;
      const it = icon(
        c.icon,
        ox + (k % cols) * cellW + cellW / 2,
        oy + row * cellH + cellH / 2,
        size,
        k === c.n - 1 ? colors.accent : colors.ink,
        1.5,
      );
      it.inner.style.transformBox = 'fill-box';
      it.inner.style.transformOrigin = 'center';
      return it;
    });
    draw = (t) => {
      const fill = counted(t) * c.n;
      items.forEach((it, k) => {
        const lit = clamp01((fill - k) * 1.2);
        it.inner.style.transform = `scale(${(lit > 0 ? back(lit, 2) : 0).toFixed(3)})`;
        drawStrokes(it.strokes, lit > 0 ? 1 : 0);
      });
    };
  } else if (c.kind === 'ruler') {
    // A measuring line that draws across with the count; the thing rides its front.
    const len = W * 0.92;
    const x0 = (W - len) / 2;
    const y = H * (c.icon ? 0.66 : 0.55);
    const w = Math.max(4, frameH * 0.009);
    const line = el('line', {
      x1: x0,
      y1: y,
      x2: x0 + len,
      y2: y,
      stroke: colors.ink,
      'stroke-width': w,
      'stroke-linecap': 'round',
    });
    const ticks = Array.from({ length: 11 }, (_, k) => {
      const big = k % 5 === 0;
      const th = Math.min(H, W) * (big ? 0.16 : 0.08);
      return el('line', {
        x1: x0 + (len * k) / 10,
        y1: y - th / 2,
        x2: x0 + (len * k) / 10,
        y2: y + th / 2,
        stroke: big ? colors.ink : colors.muted,
        'stroke-width': w * (big ? 1 : 0.7),
        'stroke-linecap': 'round',
      });
    });
    const size = Math.min(H * 0.34, len * 0.28);
    const ic = c.icon ? icon(c.icon, x0, y - size * 0.62, size, colors.accent, 1.7) : null;
    draw = (t) => {
      const p = counted(t);
      const shown = t >= startMs ? 1 : 0;
      line.setAttribute('x2', (x0 + len * p).toFixed(1));
      line.style.opacity = String(shown);
      ticks.forEach((tk, k) => (tk.style.opacity = shown && p >= k / 10 - 0.001 ? '1' : '0'));
      if (ic) {
        ic.g.setAttribute(
          'transform',
          `translate(${(x0 + len * p - size / 2).toFixed(1)} ${(y - size * 1.12).toFixed(1)}) scale(${(size / 24).toFixed(4)})`,
        );
        drawStrokes(ic.strokes, ease(progress(t, Math.max(0, startMs - 450), 500)));
      }
    };
  } else {
    // A stamp: a disc (torn paper in collage looks) with the subject drawn on by hand, then
    // ringed with the accent marker.
    const d = Math.min(W, H) * 0.8;
    const cx = W / 2;
    const cy = H / 2;
    const disc = doc.createElement('div');
    disc.style.cssText = `position:absolute;left:${cx - d / 2}px;top:${cy - d / 2}px;width:${d}px;height:${d}px;background:${torn ? mix(colors.bg, '#FFFFFF', 0.55) : mix(colors.bg, colors.accent, 0.16)};${torn ? `clip-path:${tornPolygon(d, d, seed, d * 0.02)};` : 'border-radius:50%;'}transform-origin:50% 50%;`;
    if (torn)
      disc.style.filter = `drop-shadow(0 ${Math.round(frameH * 0.006)}px ${Math.round(frameH * 0.012)}px rgba(20,16,10,0.25))`;
    outer.insertBefore(disc, svg);
    const ic = icon(c.icon, cx, cy, d * 0.52, colors.ink, 1.4);
    const gen = rough.generator();
    const ring = roughPaths(
      gen.ellipse(cx, cy, d * 1.04, d * 1.0, {
        seed: seedOf(seed, 11),
        roughness: 1.3,
        bowing: 1.6,
        strokeWidth: Math.max(3, frameH * 0.005),
      }),
      colors.accent,
      Math.max(3, frameH * 0.005),
    );
    const t0 = startMs;
    arrived = t0 + 1150;
    draw = (t) => {
      const pop = progress(t, t0, 420);
      disc.style.opacity = pop > 0 ? '1' : '0';
      disc.style.transform = `scale(${(0.72 + 0.28 * back(pop, 1.6)).toFixed(4)}) rotate(${((1 - ease(pop)) * -8).toFixed(2)}deg)`;
      drawStrokes(ic.strokes, ease(progress(t, t0 + 160, 720)));
      drawStrokes(ring, ease(progress(t, t0 + 700, 450)));
    };
  }

  const seek = (raw: number) => {
    const t = q(raw);
    draw(t);
    let opacity = 1;
    if (exitMs > 0 && t > args.exitStartMs) opacity = 1 - progress(t, args.exitStartMs, exitMs);
    // Hold: a slow push while the text beside it is read (slow juice only).
    const hold = progress(t, landMs, Math.max(1, args.durationMs - landMs));
    outer.style.opacity = opacity.toFixed(3);
    outer.style.transform = `scale(${(1 + 0.03 * hold).toFixed(4)})`;
  };
  return { el: outer, seek, landMs: arrived };
}

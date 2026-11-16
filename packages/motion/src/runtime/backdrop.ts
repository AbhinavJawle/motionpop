import type { RuntimeProject } from '../compiler/types';

/**
 * The living backdrop: the frame is never dead between graphics. Soft colour fields from the
 * look's accents drift on slow Lissajous paths, a faint dot grid slides with a parallax lag,
 * and every graphic's entrance is announced by an accent band sweeping across behind it with a
 * small swell of the fields. Everything sits under the slots and is a pure function of time.
 */
export interface Backdrop {
  seek(tMs: number): void;
}

const SWEEP_MS = 520;
const SWELL_MS = 900;

/** Relative luminance of a #RRGGBB colour (no schemas import: the runtime bundle stays zod-free). */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** sRGB hex → `r g b` for `rgb(… / a)`. */
function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

const outCubic = (x: number) => 1 - (1 - Math.max(0, Math.min(1, x))) ** 3;
const inOut = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};

export function mountBackdrop(host: HTMLElement, project: RuntimeProject): Backdrop {
  const doc = host.ownerDocument;
  const { width: w, height: h, style } = project;
  const c = style.colors;
  // Light grounds take quieter fields than dark ones.
  const dark = luminance(c.bg) < 0.18;
  const alpha = dark ? 0.3 : 0.3;
  const step =
    'personality' in style && style.personality?.stepFps ? 1000 / style.personality.stepFps : 0;

  host.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
  // Stepped (collage) looks get torn paper scraps instead of soft light: blurred colour reads as
  // dirt on newsprint.
  if (step > 0) return mountScraps(host, project, step);
  const blobs = [
    { color: c.accent, r: 0.62, cx: 0.18, cy: 0.22, ax: 0.1, ay: 0.08, p: 23000, ph: 0.3 },
    { color: c.accent2, r: 0.7, cx: 0.86, cy: 0.78, ax: 0.09, ay: 0.1, p: 29000, ph: 2.1 },
    { color: c.highlight, r: 0.48, cx: 0.7, cy: 0.12, ax: 0.12, ay: 0.06, p: 19000, ph: 4.2 },
  ].map((b) => {
    const el = doc.createElement('div');
    const d = b.r * h;
    el.style.cssText = `position:absolute;left:0;top:0;width:${d}px;height:${d}px;border-radius:50%;background:radial-gradient(circle at 50% 50%, rgb(${rgb(b.color)} / ${alpha}) 0%, rgb(${rgb(b.color)} / ${alpha * 0.45}) 38%, rgb(${rgb(b.color)} / 0) 70%);will-change:transform;`;
    host.append(el);
    return { ...b, el, d };
  });

  const gap = Math.round(h * 0.045);
  const grid = doc.createElement('div');
  grid.style.cssText = `position:absolute;left:${-gap}px;top:${-gap}px;width:${w + gap * 2}px;height:${h + gap * 2}px;background-image:radial-gradient(rgb(${rgb(c.muted)} / ${dark ? 0.2 : 0.16}) ${Math.max(1, h * 0.0016)}px, transparent ${Math.max(1.5, h * 0.0022)}px);background-size:${gap}px ${gap}px;will-change:transform;`;
  host.append(grid);

  const band = doc.createElement('div');
  const bw = w * 0.34;
  band.style.cssText = `position:absolute;top:${-h * 0.2}px;left:0;width:${bw}px;height:${h * 1.4}px;background:linear-gradient(90deg, rgb(${rgb(c.accent)} / 0), rgb(${rgb(c.accent)} / ${dark ? 0.34 : 0.3}) 45%, rgb(${rgb(c.highlight)} / ${dark ? 0.26 : 0.24}) 60%, rgb(${rgb(c.accent)} / 0));transform-origin:50% 50%;opacity:0;will-change:transform,opacity;`;
  host.append(band);

  const starts = project.slots.map((s) => s.startMs).sort((a, b) => a - b);

  return {
    seek(raw: number) {
      const t = step > 0 ? Math.floor(raw / step) * step : raw;
      // The latest entrance at or before t (and how far into it we are).
      let last = -Infinity;
      for (const s of starts) {
        if (s <= t + 120) last = s;
        else break;
      }
      const since = t - (last - 120);
      const swell = since >= 0 && since < SWELL_MS ? Math.sin((since / SWELL_MS) * Math.PI) : 0;
      for (const b of blobs) {
        const a = (t / b.p) * Math.PI * 2 + b.ph;
        const x = (b.cx + b.ax * Math.sin(a)) * w - b.d / 2;
        const y = (b.cy + b.ay * Math.cos(a * 0.8)) * h - b.d / 2;
        const s = 1 + 0.06 * Math.sin(a * 1.3) + 0.08 * swell;
        b.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(4)})`;
      }
      const gx = -((t * 0.006) % gap);
      const gy = -((t * 0.0035) % gap);
      grid.style.transform = `translate(${gx.toFixed(1)}px,${gy.toFixed(1)}px)`;
      if (since >= 0 && since < SWEEP_MS) {
        const p = inOut(since / SWEEP_MS);
        const x = -bw + p * (w + bw * 2);
        band.style.opacity = (Math.sin(outCubic(since / SWEEP_MS) * Math.PI) * 1).toFixed(3);
        band.style.transform = `translate(${x.toFixed(1)}px,0) skewX(-14deg)`;
      } else band.style.opacity = '0';
    },
  };
}

/** A torn polygon around a rectangle, deterministic per seed (percent units). */
function torn(seed: number): string {
  const r = (i: number) => {
    const x = Math.sin(seed * 91.7 + i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  const pts: string[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) pts.push(`${(i * 10).toFixed(1)}% ${(r(i) * 4).toFixed(1)}%`);
  for (let i = 0; i <= n; i++)
    pts.push(`${(100 - r(i + 20) * 4).toFixed(1)}% ${(i * 10).toFixed(1)}%`);
  for (let i = 0; i <= n; i++)
    pts.push(`${(100 - i * 10).toFixed(1)}% ${(100 - r(i + 40) * 4).toFixed(1)}%`);
  for (let i = 0; i <= n; i++)
    pts.push(`${(r(i + 60) * 4).toFixed(1)}% ${(100 - i * 10).toFixed(1)}%`);
  return `polygon(${pts.join(',')})`;
}

/**
 * Collage backdrop: two big torn scraps of tinted paper parked off the corners, drifting with a
 * slow parallax in 12 fps steps, and nudged on every graphic's entrance.
 */
function mountScraps(host: HTMLElement, project: RuntimeProject, step: number): Backdrop {
  const doc = host.ownerDocument;
  const { width: w, height: h, style } = project;
  const c = style.colors;
  const tint = (hex: string, a: number) =>
    `color-mix(in srgb, ${hex} ${Math.round(a * 100)}%, ${c.bg})`;
  const scraps = [
    {
      color: tint(c.highlight, 0.45),
      x: -0.08,
      y: -0.12,
      sw: 0.42,
      sh: 0.5,
      rot: -6,
      seed: 2,
      px: 1,
    },
    { color: tint(c.accent2, 0.18), x: 0.7, y: 0.62, sw: 0.4, sh: 0.55, rot: 8, seed: 5, px: -1 },
  ].map((s) => {
    const el = doc.createElement('div');
    el.style.cssText = `position:absolute;left:${s.x * w}px;top:${s.y * h}px;width:${s.sw * w}px;height:${s.sh * h}px;background:${s.color};clip-path:${torn(s.seed)};box-shadow:0 2px 8px rgba(0,0,0,0.08);will-change:transform;`;
    host.append(el);
    return { ...s, el };
  });
  const starts = project.slots.map((s) => s.startMs).sort((a, b) => a - b);
  return {
    seek(raw: number) {
      const t = Math.floor(raw / step) * step;
      let last = -Infinity;
      for (const s of starts) {
        if (s <= t) last = s;
        else break;
      }
      const since = t - last;
      const nudge = since >= 0 && since < 400 ? Math.sin((since / 400) * Math.PI) : 0;
      for (const s of scraps) {
        const dx = s.px * (Math.sin(t / 5200 + s.seed) * w * 0.012 + nudge * w * 0.01);
        const dy = Math.cos(t / 6100 + s.seed) * h * 0.01;
        s.el.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${(s.rot + nudge * s.px).toFixed(2)}deg)`;
      }
    },
  };
}

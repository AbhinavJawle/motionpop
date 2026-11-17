import type { RuntimeProject } from '../compiler/types';
import type { VideoPlan } from '../engine/video-plan';
import { luminance, rgb, torn } from './backdrop';
import { ENTER_MS, EXIT_MS, type SlotSeams } from './seams';

/**
 * The world (spec 07c R4): one continuous place behind every graphic of a video, instead of a
 * backdrop that only breathes. Each slot is a station in it; at every seam the world camera
 * travels to the next station with the seam's own curve (accelerating into the cut, settling
 * after it), so the background carries the motion across the cut together with the graphics.
 *
 * What lives in the world:
 * - a dot grid on the ground plane (moves 1 : 1 with the camera);
 * - landmarks a little further back (soft colour fields, or torn paper scraps in collage looks)
 *   that slide past slower, for depth;
 * - the thread: one hand-drawn line that runs under every station and swoops between them,
 *   drawn on just ahead of the camera, with a knot at each station. It is the carrier element:
 *   the one thing that is on screen from the first frame to the last.
 *
 * The climax is entered with a pull (the world arrives from close up), and the slot before it
 * holds the camera still. Everything is a pure function of time.
 */
export interface World {
  seek(tMs: number): void;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const inQuart = (p: number) => p ** 4;
const outQuart = (p: number) => 1 - (1 - p) ** 4;
const inOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const outCubic = (p: number) => 1 - (1 - clamp01(p)) ** 3;
/** Deterministic pseudo-random in [0, 1). */
const hash01 = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Slow travel inside a held slot, in frame widths over the whole hold (the film's current). */
const DRIFT = 0.025;
/** Longest gap a seam crosses with its own curve; longer gaps travel smoothly. */
const SEAM_GAP_MS = 700;
const SWEEP_MS = 520;

interface Leg {
  /** Travel window. */
  a: number;
  b: number;
  /** The cut (the two halves meet here, at full speed). */
  c: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Mirrored power-4 halves (a seam) or one smooth move (a long gap, the opening). */
  curve: 'seam' | 'smooth';
  /** The next slot is the climax: the world also arrives from close up. */
  pull: boolean;
}

interface Hold {
  start: number;
  end: number;
  at: { x: number; y: number };
  still: boolean;
}

/**
 * The camera path: holds at stations joined by legs. Exposed for tests (spec 07c task 12).
 * Positions are in frame px.
 */
export function cameraPath(
  project: Pick<RuntimeProject, 'width' | 'height' | 'slots' | 'durationMs'>,
  plan: VideoPlan,
  seams: ReadonlyMap<string, SlotSeams>,
): { holds: Hold[]; legs: Leg[] } {
  const { width: w, height: h } = project;
  const byId = new Map(project.slots.map((s) => [s.id, s]));
  const order = plan.order.filter((id) => byId.has(id));
  const holds: Hold[] = [];
  const legs: Leg[] = [];
  const station = (id: string) => {
    const st = plan.slots.get(id)!.station;
    return { x: st.x * w, y: st.y * h };
  };
  order.forEach((id, i) => {
    const s = byId.get(id)!;
    const st = plan.slots.get(id)!;
    const sm = seams.get(id);
    const inMs = sm ? ENTER_MS[sm.enter.kind] : 0;
    const outMs = sm ? EXIT_MS[sm.exit.kind] : 0;
    const at = station(id);
    // The opening: the world is already moving towards the first station before it.
    if (i === 0) {
      const from = { x: at.x - w * 0.3, y: at.y + h * 0.04 };
      legs.push({
        a: 0,
        b: Math.max(1, s.startMs + Math.max(inMs, 300)),
        c: s.startMs,
        from,
        to: at,
        curve: 'smooth',
        pull: false,
      });
    }
    holds.push({
      start: s.startMs + Math.max(inMs, 300),
      end: s.endMs - Math.max(outMs, 250),
      at,
      still: st.calm,
    });
    const nextId = order[i + 1];
    if (!nextId) return;
    const next = byId.get(nextId)!;
    const nsm = seams.get(nextId);
    const nIn = nsm ? ENTER_MS[nsm.enter.kind] : 0;
    const gap = next.startMs - s.endMs;
    const drift = st.calm ? 0 : DRIFT * w;
    legs.push({
      a: s.endMs - Math.max(outMs, 250),
      b: next.startMs + Math.max(nIn, 300),
      c: Math.round((s.endMs + next.startMs) / 2),
      from: { x: at.x + drift, y: at.y },
      to: station(nextId),
      curve: gap <= SEAM_GAP_MS ? 'seam' : 'smooth',
      pull: plan.slots.get(nextId)!.climax,
    });
  });
  return { holds, legs };
}

/** Camera position and zoom at time t on a path. Pure. */
export function cameraAt(
  path: { holds: Hold[]; legs: Leg[] },
  t: number,
  w: number,
): { x: number; y: number; zoom: number } {
  for (const l of path.legs) {
    if (t < l.a || t > l.b) continue;
    let p: number;
    if (l.curve === 'seam' && l.c > l.a && l.c < l.b) {
      // Accelerate into the cut, decelerate out of it: two power-4 halves meeting at the cut.
      p =
        t <= l.c
          ? 0.5 * inQuart((t - l.a) / (l.c - l.a))
          : 0.5 + 0.5 * outQuart((t - l.c) / (l.b - l.c));
    } else p = inOutCubic(clamp01((t - l.a) / Math.max(1, l.b - l.a)));
    const zoom =
      l.pull && t >= l.c
        ? 1 + 0.14 * (1 - outQuart(clamp01((t - l.c) / Math.max(1, l.b - l.c))))
        : 1;
    return { x: l.from.x + (l.to.x - l.from.x) * p, y: l.from.y + (l.to.y - l.from.y) * p, zoom };
  }
  let last: Hold | null = null;
  for (const hd of path.holds) {
    if (t >= hd.start && t <= hd.end) {
      const k = hd.still ? 0 : clamp01((t - hd.start) / Math.max(1, hd.end - hd.start));
      return { x: hd.at.x + DRIFT * w * k, y: hd.at.y, zoom: 1 };
    }
    if (hd.end < t) last = hd;
  }
  // After the last slot (or between a hold and a leg): keep drifting on from the last station.
  if (last) {
    const k = (t - last.end) / 4000;
    return {
      x: last.at.x + DRIFT * w * (last.still ? 0 : 1) + w * 0.04 * k,
      y: last.at.y,
      zoom: 1,
    };
  }
  const first = path.legs[0];
  return first ? { x: first.from.x, y: first.from.y, zoom: 1 } : { x: 0, y: 0, zoom: 1 };
}

export function mountWorld(
  host: HTMLElement,
  project: RuntimeProject,
  plan: VideoPlan,
  seams: ReadonlyMap<string, SlotSeams>,
): World {
  const doc = host.ownerDocument;
  const { width: w, height: h, style } = project;
  const c = style.colors;
  const dark = luminance(c.bg) < 0.18;
  const step =
    'personality' in style && style.personality?.stepFps ? 1000 / style.personality.stepFps : 0;
  const path = cameraPath(project, plan, seams);
  host.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';

  // Ground: a dot grid, tiled, moved by the camera modulo its cell.
  const gap = Math.round(h * 0.045);
  const grid = doc.createElement('div');
  grid.style.cssText = `position:absolute;left:${-gap * 2}px;top:${-gap * 2}px;width:${w + gap * 4}px;height:${h + gap * 4}px;background-image:radial-gradient(rgb(${rgb(c.muted)} / ${dark ? 0.22 : 0.18}) ${Math.max(1, h * 0.0016)}px, transparent ${Math.max(1.5, h * 0.0022)}px);background-size:${gap}px ${gap}px;transform-origin:${gap * 2}px ${gap * 2}px;will-change:transform;`;
  host.append(grid);

  // Landmarks, a little further back: they slide past at 0.6 of the camera's speed.
  const far = doc.createElement('div');
  far.style.cssText =
    'position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;will-change:transform;';
  host.append(far);
  const PARALLAX = 0.6;
  const stations = plan.order.map((id) => plan.slots.get(id)!.station);
  const span = stations.length ? (stations[stations.length - 1] as { x: number }).x : 0;
  const colours = [c.accent, c.accent2, c.highlight];
  const marks = Math.ceil((span * w * PARALLAX + w * 2) / (w * 0.42)) + 2;
  for (let k = 0; k < marks; k++) {
    const el = doc.createElement('div');
    const top = k % 2 === 0;
    const x = (k - 1) * w * 0.42 + hash01(k, 1) * w * 0.12;
    const y = top ? -h * 0.18 + hash01(k, 2) * h * 0.1 : h * 0.72 + hash01(k, 3) * h * 0.12;
    const colour = colours[k % colours.length] as string;
    if (step > 0) {
      const sw = w * (0.26 + hash01(k, 4) * 0.12);
      const sh = h * (0.36 + hash01(k, 5) * 0.14);
      el.style.cssText = `position:absolute;left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${sw.toFixed(0)}px;height:${sh.toFixed(0)}px;background:color-mix(in srgb, ${colour} ${k % 3 === 0 ? 40 : 20}%, ${c.bg});clip-path:${torn(k + 3)};transform:rotate(${((hash01(k, 6) - 0.5) * 14).toFixed(1)}deg);box-shadow:0 2px 8px rgba(0,0,0,0.08);`;
    } else {
      const d = h * (0.5 + hash01(k, 4) * 0.25);
      const a = dark ? 0.3 : 0.26;
      el.style.cssText = `position:absolute;left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${d.toFixed(0)}px;height:${d.toFixed(0)}px;border-radius:50%;background:radial-gradient(circle at 50% 50%, rgb(${rgb(colour)} / ${a}) 0%, rgb(${rgb(colour)} / ${a * 0.45}) 38%, rgb(${rgb(colour)} / 0) 70%);`;
    }
    far.append(el);
  }

  // The thread: one hand-drawn line through every station, low under each graphic and swooping
  // between them, drawn on just ahead of the camera. Knots mark the stations.
  const svgNs = 'http://www.w3.org/2000/svg';
  const near = doc.createElement('div');
  near.style.cssText =
    'position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;will-change:transform;';
  host.append(near);
  const pts: [number, number][] = [];
  const anchor = (i: number) => {
    const st = stations[i] ?? { x: i * 0.4, y: 0 };
    return { x: st.x * w + w * 0.5, y: st.y * h + h * 0.915 };
  };
  const n = Math.max(1, stations.length);
  const first = anchor(0);
  pts.push([first.x - w * 1.2, first.y + h * 0.02]);
  for (let i = 0; i < n; i++) {
    const p = anchor(i);
    const q = i + 1 < n ? anchor(i + 1) : { x: p.x + w * 1.2, y: p.y };
    const seg = Math.max(8, Math.round((q.x - p.x) / (w * 0.01)));
    for (let k = 0; k < seg; k++) {
      const u = k / seg;
      // A low swell between stations, wobbling by hand. It stays in the bottom band, under the
      // graphics, so it never crosses text being read.
      const lift =
        Math.sin(u * Math.PI) * h * (0.025 + 0.025 * hash01(i, 9)) * (i % 2 === 0 ? 1 : -0.6);
      const wob = (hash01(i * 97 + k, 13) - 0.5) * h * 0.004;
      pts.push([p.x + (q.x - p.x) * u, p.y + (q.y - p.y) * u - lift + wob]);
    }
  }
  const last = anchor(n - 1);
  pts.push([last.x + w * 1.2, last.y]);
  const minX = Math.min(...pts.map((p) => p[0])) - 20;
  const maxX = Math.max(...pts.map((p) => p[0])) + 20;
  const minY = Math.min(...pts.map((p) => p[1])) - 40;
  const maxY = Math.max(...pts.map((p) => p[1])) + 40;
  const svg = doc.createElementNS(svgNs, 'svg');
  svg.setAttribute('width', String(Math.ceil(maxX - minX)));
  svg.setAttribute('height', String(Math.ceil(maxY - minY)));
  svg.setAttribute(
    'viewBox',
    `${minX.toFixed(0)} ${minY.toFixed(0)} ${Math.ceil(maxX - minX)} ${Math.ceil(maxY - minY)}`,
  );
  svg.style.cssText = `position:absolute;left:${minX.toFixed(0)}px;top:${minY.toFixed(0)}px;overflow:visible;`;
  const stroke = Math.max(2.5, h * 0.0035);
  const line = doc.createElementNS(svgNs, 'polyline');
  line.setAttribute('points', pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', c.accent);
  line.setAttribute('stroke-opacity', dark ? '0.7' : '0.55');
  line.setAttribute('stroke-width', stroke.toFixed(1));
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  svg.append(line);
  const knots = Array.from({ length: n }, (_, i) => {
    const p = anchor(i);
    const g = doc.createElementNS(svgNs, 'g');
    const ring = doc.createElementNS(svgNs, 'circle');
    ring.setAttribute('cx', p.x.toFixed(1));
    ring.setAttribute('cy', p.y.toFixed(1));
    ring.setAttribute('r', (h * 0.012).toFixed(1));
    ring.setAttribute('fill', c.bg);
    ring.setAttribute('stroke', c.accent);
    ring.setAttribute('stroke-width', stroke.toFixed(1));
    const dot = doc.createElementNS(svgNs, 'circle');
    dot.setAttribute('cx', p.x.toFixed(1));
    dot.setAttribute('cy', p.y.toFixed(1));
    dot.setAttribute('r', (h * 0.005).toFixed(1));
    dot.setAttribute('fill', c.accent);
    g.append(ring, dot);
    g.style.transformBox = 'fill-box';
    g.style.transformOrigin = 'center';
    svg.append(g);
    return { g, x: p.x };
  });
  near.append(svg);

  // The entrance sweep (D-070) stays: an accent band crosses the frame as each graphic arrives.
  const band = doc.createElement('div');
  const bw = w * 0.34;
  band.style.cssText = `position:absolute;top:${-h * 0.2}px;left:0;width:${bw}px;height:${h * 1.4}px;background:linear-gradient(90deg, rgb(${rgb(c.accent)} / 0), rgb(${rgb(c.accent)} / ${dark ? 0.3 : 0.24}) 45%, rgb(${rgb(c.highlight)} / ${dark ? 0.22 : 0.2}) 60%, rgb(${rgb(c.accent)} / 0));opacity:0;will-change:transform,opacity;`;
  if (step === 0) host.append(band);
  const starts = project.slots.map((s) => s.startMs).sort((a, b) => a - b);

  return {
    seek(raw: number) {
      const t = step > 0 ? Math.floor(raw / step) * step : raw;
      const cam = cameraAt(path, t, w);
      const z = cam.zoom;
      // Zoom about the frame centre: world point p shows at (p - cam) * z + centre * (1 - z).
      const ox = (w / 2) * (1 - z);
      const oy = (h / 2) * (1 - z);
      const gx = -(((cam.x % gap) + gap) % gap);
      const gy = -(((cam.y % gap) + gap) % gap);
      grid.style.transform = `translate(${(gx * z + ox).toFixed(1)}px,${(gy * z + oy).toFixed(1)}px) scale(${z.toFixed(4)})`;
      far.style.transform = `translate(${(-cam.x * PARALLAX * z + ox).toFixed(1)}px,${(-cam.y * PARALLAX * z + oy).toFixed(1)}px) scale(${z.toFixed(4)})`;
      near.style.transform = `translate(${(-cam.x * z + ox).toFixed(1)}px,${(-cam.y * z + oy).toFixed(1)}px) scale(${z.toFixed(4)})`;
      // The thread is drawn up to a little ahead of the frame's centre.
      const lead = cam.x + w * 0.85;
      const cut = Math.max(0, maxX - lead);
      svg.style.clipPath = `inset(0 ${cut.toFixed(0)}px 0 0)`;
      for (const k of knots) {
        const p = clamp01((lead - k.x) / (w * 0.08));
        k.g.style.transform = `scale(${p.toFixed(3)})`;
      }
      if (step === 0) {
        let lastStart = -Infinity;
        for (const s of starts) {
          if (s <= t + 120) lastStart = s;
          else break;
        }
        const since = t - (lastStart - 120);
        if (since >= 0 && since < SWEEP_MS) {
          const p = inOutCubic(since / SWEEP_MS);
          band.style.opacity = Math.sin(outCubic(since / SWEEP_MS) * Math.PI).toFixed(3);
          band.style.transform = `translate(${(-bw + p * (w + bw * 2)).toFixed(1)}px,0) skewX(-14deg)`;
        } else {
          // Outside the sweep the band rests at its start position, so the DOM depends on t alone.
          band.style.opacity = '0';
          band.style.transform = `translate(${(-bw).toFixed(1)}px,0) skewX(-14deg)`;
        }
      }
    },
  };
}

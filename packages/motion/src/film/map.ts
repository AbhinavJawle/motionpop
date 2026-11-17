import { geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import { mix } from '../engine/materials';
import {
  countries,
  countries50,
  targetBounds,
  targetCentre,
  type Country,
} from '../scenes/map-zoom/geo';
import { resolvePlace, type PlaceTarget } from '../scenes/map-zoom/places';
import { KIT_EASES, type EaseFn, type KitEase, type Timeline } from './timeline';

/**
 * The film kit's map (spec 07b): a flat Natural Earth world drawn as SVG, with a camera that is a
 * pure function of time. Two beats that ask for the same view draw the same pixels, which is what
 * lets a film cut between map beats on an identical frame, or carry one camera move across
 * several beats. Vectors only (Natural Earth, public domain): no imagery, no network.
 */
const SVG = 'http://www.w3.org/2000/svg';
export type Where = string | readonly [number, number];
export interface MapView {
  /** Centre in base map pixels. */
  cx: number;
  cy: number;
  /** Zoom: 1 shows the whole world across the map's width. */
  k: number;
}
export interface FlyOpts {
  at?: number | string;
  on?: number | string;
  dur?: number;
  zoom?: number;
  ease?: KitEase;
}
export interface KitMap {
  el: HTMLElement;
  /** [lon, lat] → [x, y] in base map pixels (use inside `layer`). */
  project(lonLat: readonly [number, number]): [number, number];
  /** The view that frames a place: "world", a country, city or region name, or [lon, lat]. */
  view(where: Where, zoom?: number): MapView;
  /** Sets the opening view. */
  set(where: Where, zoom?: number): KitMap;
  /** Moves the camera to a place. Register on a timeline; moves chain in time order. */
  fly(tl: Timeline, where: Where, opts?: FlyOpts): KitMap;
  /** A <g> that moves with the map: draw into it in base pixels (see `project`). */
  layer: SVGGElement;
  /** A line through places or [lon, lat] points, moving with the map. Draw it with `tl.draw`. */
  route(
    points: readonly Where[],
    opts?: { color?: string; width?: number; dash?: boolean; curve?: number },
  ): SVGPathElement;
  /** A dot (and optional label) at a place, at a constant size on screen. */
  pin(
    where: Where,
    opts?: {
      label?: string;
      color?: string;
      size?: number;
      side?: 'left' | 'right' | 'top' | 'bottom';
    },
  ): SVGGElement;
  /** A text label at a place, at a constant size on screen. */
  label(
    where: Where,
    text: string,
    opts?: { size?: number; color?: string; italic?: boolean; dx?: number; dy?: number },
  ): SVGGElement;
  /** Fills a country in a colour. */
  fill(country: string, color?: string): SVGPathElement | null;
  /** Wraps your own SVG node so it sits at a place at a constant size on screen. */
  marker(where: Where, node: SVGElement): SVGGElement;
  /** `n` dots scattered around a place (always the same for the same seed). */
  scatter(
    where: Where,
    n: number,
    opts?: {
      spread?: number;
      r?: number;
      color?: string;
      seed?: number;
      stretch?: readonly [number, number];
    },
  ): SVGCircleElement[];
  /** Applies the camera for time `t` (the timeline calls this once `fly` is used). */
  apply(t: number): void;
}

export interface MapColours {
  bg: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  highlight: string;
}
export interface MapHost {
  doc: Document;
  root: Element;
  width: number;
  height: number;
  colours: MapColours;
  fontBody: string;
  fontDisplay: string;
  seed: number;
  wordMs: (word: number | string) => number | null;
  durationMs: number;
  warn: (m: string) => void;
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function el<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = doc.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function createMap(
  host: MapHost,
  o: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    view?: Where;
    zoom?: number;
    parent?: Element;
  } = {},
): KitMap {
  const { doc } = host;
  const W = Math.max(40, o.w ?? host.width);
  const H = Math.max(40, o.h ?? host.height);
  const dark = luminance(host.colours.bg) < 0.4;
  const sea = dark
    ? mix(host.colours.bg, host.colours.accent2, 0.22)
    : mix(host.colours.bg, host.colours.accent2, 0.3);
  const land = dark
    ? mix(host.colours.bg, host.colours.ink, 0.2)
    : mix(mix(host.colours.bg, '#B9975B', 0.5), host.colours.bg, 0.15);
  const coast = dark
    ? mix(host.colours.bg, host.colours.ink, 0.5)
    : mix(land, host.colours.ink, 0.45);
  const dot = dark ? mix(land, host.colours.ink, 0.22) : mix(land, host.colours.ink, 0.2);

  const wrap = doc.createElement('div');
  wrap.dataset['mpMap'] = '';
  wrap.style.cssText = `position:absolute;left:${o.x ?? 0}px;top:${o.y ?? 0}px;width:${W}px;height:${H}px;overflow:hidden;background:${sea};`;
  const svg = el(doc, 'svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;';
  const cam = el(doc, 'g', {});
  svg.append(cam);
  wrap.append(svg);
  (o.parent ?? host.root).append(wrap);

  // The world across the map's width, centred. Zoom 1 is this view.
  const projection: GeoProjection = geoNaturalEarth1();
  projection.fitWidth(W, { type: 'Sphere' });
  const path = geoPath(projection);
  const [[sx0, sy0], [sx1, sy1]] = path.bounds({ type: 'Sphere' });
  const [tx, ty] = projection.translate();
  projection.translate([tx + (W - (sx0 + sx1)) / 2, ty + (H - (sy0 + sy1)) / 2]);
  const worldView: MapView = { cx: W / 2, cy: H / 2, k: Math.min(1, H / Math.max(1, sy1 - sy0)) };

  // Halftone on the land, held at one size on screen through every zoom.
  const defs = el(doc, 'defs', {});
  const pid = `mp-ht-${(host.seed >>> 0).toString(36)}-${Math.round(o.x ?? 0)}-${Math.round(o.y ?? 0)}`;
  const tile = Math.max(6, Math.round(Math.min(host.width, host.height) / 150));
  const pattern = el(doc, 'pattern', {
    id: pid,
    width: tile,
    height: tile,
    patternUnits: 'userSpaceOnUse',
  });
  pattern.append(el(doc, 'rect', { width: tile, height: tile, fill: land }));
  pattern.append(el(doc, 'circle', { cx: tile / 2, cy: tile / 2, r: tile * 0.14, fill: dot }));
  defs.append(pattern);
  svg.prepend(defs);

  const { list, names } = countries();
  const d110 = list.map((c) => path(c) ?? '').join('');
  const landPath = el(doc, 'path', {
    d: d110,
    fill: `url(#${pid})`,
    stroke: coast,
    'stroke-width': 1,
    'stroke-linejoin': 'round',
    'vector-effect': 'non-scaling-stroke',
  });
  cam.append(landPath);
  let detailed = false;
  const detail = () => {
    if (detailed) return;
    detailed = true;
    landPath.setAttribute(
      'd',
      countries50()
        .map((c) => path(c) ?? '')
        .join(''),
    );
  };
  const layer = el(doc, 'g', {});
  cam.append(layer);

  const fixed: { g: SVGGElement; x: number; y: number }[] = [];
  const stroked: { node: SVGElement; width: number }[] = [];

  const target = (where: Where): PlaceTarget | null =>
    typeof where === 'string' ? resolvePlace(where, names) : null;
  const point = (where: Where): [number, number] => {
    if (typeof where !== 'string') return project(where);
    const t = target(where);
    if (!t) {
      host.warn(`map: no place called "${where}"; give [lon, lat] instead`);
      return [W / 2, H / 2];
    }
    return project(targetCentre(t, list as Country[]));
  };
  const project = (lonLat: readonly [number, number]): [number, number] => {
    const p = projection([Number(lonLat[0]) || 0, Number(lonLat[1]) || 0]);
    return p ? [p[0], p[1]] : [W / 2, H / 2];
  };
  const view = (where: Where, zoom?: number): MapView => {
    if (where === 'world') return zoom ? { ...worldView, k: zoom } : worldView;
    const t = target(where);
    const [cx, cy] = point(where);
    let k = zoom;
    if (k === undefined) {
      const b = t ? targetBounds(t, projection, list as Country[]) : null;
      k = b
        ? Math.min(
            (W * 0.62) / Math.max(1, b[1][0] - b[0][0]),
            (H * 0.62) / Math.max(1, b[1][1] - b[0][1]),
          )
        : 8;
    }
    return { cx, cy, k: Math.max(0.2, Math.min(400, k)) };
  };

  // Camera keyframes. Zoom moves on a log scale and the target's screen offset closes linearly,
  // so a dive from the world to a canal reads as one lens move instead of a rush at the end.
  const keys: { at: number; dur: number; to: MapView; ease: EaseFn }[] = [];
  let first: MapView = o.view !== undefined ? view(o.view, o.zoom) : worldView;
  let sorted = true;
  let hooked: Timeline | null = null;
  const viewAt = (t: number): MapView => {
    if (!sorted) {
      keys.sort((a, b) => a.at - b.at);
      sorted = true;
    }
    let cur = first;
    for (const key of keys) {
      if (t < key.at) break;
      const p = key.dur <= 0 ? 1 : key.ease(Math.min(1, (t - key.at) / key.dur));
      if (p >= 1) {
        cur = key.to;
        continue;
      }
      const k = cur.k * Math.pow(key.to.k / cur.k, p);
      const ox = (key.to.cx - cur.cx) * cur.k * (1 - p);
      const oy = (key.to.cy - cur.cy) * cur.k * (1 - p);
      return { cx: key.to.cx - ox / k, cy: key.to.cy - oy / k, k };
    }
    return cur;
  };
  const apply = (t: number) => {
    const v = viewAt(t);
    const k = Math.round(v.k * 1e4) / 1e4;
    cam.setAttribute(
      'transform',
      `translate(${(W / 2 - v.cx * k).toFixed(2)} ${(H / 2 - v.cy * k).toFixed(2)}) scale(${k})`,
    );
    pattern.setAttribute('patternTransform', `scale(${(1 / k).toFixed(5)})`);
    for (const f of fixed)
      f.g.setAttribute(
        'transform',
        `translate(${f.x.toFixed(2)} ${f.y.toFixed(2)}) scale(${(1 / k).toFixed(5)})`,
      );
    for (const s of stroked) s.node.setAttribute('stroke-width', (s.width / k).toFixed(4));
  };

  const fixedAt = (where: Where): SVGGElement => {
    const [x, y] = point(where);
    const g = el(doc, 'g', {});
    layer.append(g);
    fixed.push({ g, x, y });
    return g;
  };
  const u = Math.min(host.width, host.height) / 100;

  const map: KitMap = {
    el: wrap,
    project,
    view,
    layer,
    set(where, zoom) {
      first = view(where, zoom);
      if (first.k > 3) detail();
      apply(0);
      return map;
    },
    fly(tl, where, opts = {}) {
      const dur = Number.isFinite(opts.dur) ? Number(opts.dur) : 1600;
      const word = opts.on ?? (typeof opts.at === 'string' ? opts.at : undefined);
      let at = typeof opts.at === 'number' ? opts.at : 0;
      if (word !== undefined) {
        const w = host.wordMs(word);
        // "on": the camera arrives as the word is spoken. "at" with a word: it starts there.
        at =
          w === null
            ? host.durationMs * 0.3
            : opts.on !== undefined
              ? Math.max(0, w - dur * 0.85)
              : w;
      }
      const to = view(where, opts.zoom);
      if (to.k > 3) detail();
      const e = opts.ease;
      keys.push({
        at: Math.max(0, at),
        dur,
        to,
        ease:
          typeof e === 'function'
            ? e
            : ((e ? KIT_EASES[e] : undefined) ?? (KIT_EASES['inOut'] as EaseFn)),
      });
      sorted = false;
      if (hooked !== tl) {
        hooked = tl;
        tl.each(apply);
      }
      return map;
    },
    route(points, ro = {}) {
      const pts = points.map(point);
      const curve = ro.curve ?? 0;
      let d = '';
      pts.forEach(([x, y], i) => {
        if (i === 0) d += `M${x.toFixed(2)} ${y.toFixed(2)}`;
        else if (curve && pts.length === 2) {
          // One bowed segment: the control point sits off the midpoint, at right angles.
          const [px, py] = pts[i - 1] as [number, number];
          const mx = (px + x) / 2 - (y - py) * curve;
          const my = (py + y) / 2 + (x - px) * curve;
          d += ` Q${mx.toFixed(2)} ${my.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
        } else d += ` L${x.toFixed(2)} ${y.toFixed(2)}`;
      });
      const width = ro.width ?? Math.max(3, u * 0.5);
      const node = el(doc, 'path', {
        d: pts.length > 2 && curve === 0 ? smooth(pts) : d,
        fill: 'none',
        stroke: ro.color ?? host.colours.accent,
        'stroke-width': width,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      if (ro.dash) node.dataset['dash'] = '1';
      layer.append(node);
      stroked.push({ node, width });
      apply(0);
      return node;
    },
    pin(where, po = {}) {
      const g = fixedAt(where);
      const size = po.size ?? u * 1.1;
      const color = po.color ?? host.colours.accent;
      g.append(el(doc, 'circle', { r: size * 1.9, fill: color, 'fill-opacity': 0.18 }));
      g.append(
        el(doc, 'circle', {
          r: size,
          fill: color,
          stroke: host.colours.bg,
          'stroke-width': size * 0.35,
        }),
      );
      if (po.label)
        g.append(labelNode(po.label, { size: u * 2.6, side: po.side ?? 'right', gap: size * 2.2 }));
      apply(0);
      return g;
    },
    label(where, text, lo = {}) {
      const g = fixedAt(where);
      const node = labelNode(text, {
        size: lo.size ?? u * 2.8,
        side: 'center',
        gap: 0,
        color: lo.color,
        italic: lo.italic,
      });
      node.setAttribute('transform', `translate(${lo.dx ?? 0} ${lo.dy ?? 0})`);
      g.append(node);
      apply(0);
      return g;
    },
    fill(country, color) {
      const t = target(country);
      const c =
        t?.kind === 'country'
          ? (list as Country[]).find((f) => f.properties.name === t.neName)
          : undefined;
      if (!c) {
        host.warn(`map: no country called "${country}"`);
        return null;
      }
      const big = countries50().find((f) => f.properties.name === c.properties.name) ?? c;
      const node = el(doc, 'path', {
        d: path(big) ?? '',
        fill: color ?? host.colours.accent,
        stroke: coast,
        'stroke-width': 1,
        'vector-effect': 'non-scaling-stroke',
      });
      layer.prepend(node);
      return node;
    },
    marker(where, node) {
      const g = fixedAt(where);
      g.append(node);
      apply(0);
      return g;
    },
    scatter(where, n, so = {}) {
      const [x, y] = point(where);
      const count = Math.max(0, Math.min(2000, Math.trunc(n)));
      const spread = so.spread ?? u * 6;
      const r = so.r ?? u * 0.42;
      const [stx, sty] = so.stretch ?? [1, 1];
      let s = (so.seed ?? host.seed) >>> 0 || 1;
      const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
      const out: SVGCircleElement[] = [];
      const g = fixedAt(where);
      void x;
      void y;
      for (let i = 0; i < count; i++) {
        // Denser near the middle: radius by sqrt keeps an even disc, the extra power pulls in.
        const a = rnd() * Math.PI * 2;
        const d = Math.pow(rnd(), 0.75) * spread;
        const c = el(doc, 'circle', {
          cx: (Math.cos(a) * d * stx).toFixed(2),
          cy: (Math.sin(a) * d * sty).toFixed(2),
          r,
          fill: so.color ?? host.colours.ink,
        });
        g.append(c);
        out.push(c);
      }
      apply(0);
      return out;
    },
    apply,
  };

  function labelNode(
    text: string,
    lo: {
      size: number;
      side: 'left' | 'right' | 'top' | 'bottom' | 'center';
      gap: number;
      color?: string | undefined;
      italic?: boolean | undefined;
    },
  ): SVGGElement {
    const g = el(doc, 'g', {});
    const anchor = lo.side === 'left' ? 'end' : lo.side === 'right' ? 'start' : 'middle';
    const dx = lo.side === 'left' ? -lo.gap : lo.side === 'right' ? lo.gap : 0;
    const dy =
      lo.side === 'top' ? -lo.gap : lo.side === 'bottom' ? lo.gap + lo.size * 0.8 : lo.size * 0.34;
    const common = {
      x: dx,
      y: dy,
      'text-anchor': anchor,
      'font-size': lo.size,
      'font-family': lo.italic ? host.fontDisplay : host.fontBody,
      'font-weight': lo.italic ? 500 : 600,
      ...(lo.italic ? { 'font-style': 'italic' } : {}),
    };
    // A halo in the ground colour keeps the label readable over coastlines and dots.
    const halo = el(doc, 'text', {
      ...common,
      fill: 'none',
      stroke: lo.italic ? sea : host.colours.bg,
      'stroke-width': lo.size * 0.28,
      'stroke-linejoin': 'round',
    });
    halo.textContent = text;
    const t = el(doc, 'text', {
      ...common,
      fill: lo.color ?? (lo.italic ? mix(sea, host.colours.ink, 0.62) : host.colours.ink),
    });
    t.textContent = text;
    g.append(halo, t);
    return g;
  }

  apply(0);
  return map;
}

/** A smooth open curve through points (Catmull-Rom as cubic Béziers). */
function smooth(pts: readonly [number, number][]): string {
  if (pts.length < 2) return '';
  const p = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))] as [number, number];
  let d = `M${p(0)[0].toFixed(2)} ${p(0)[1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${(c1[0] as number).toFixed(2)} ${(c1[1] as number).toFixed(2)} ${(c2[0] as number).toFixed(2)} ${(c2[1] as number).toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

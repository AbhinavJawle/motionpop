import { geoGraticule10, geoPath } from 'd3-geo';
import { z } from 'zod';
import type { Format } from '../../contract';
import { eases } from '../../core/ease';
import type { Box } from '../../core/safe-area';
import { enter, stage, type TextSlot } from '../../engine/stage';
import { defineScene } from '../define';
import { stack } from '../layout';
import {
  centreLon,
  countries,
  litCountries,
  projectionFor,
  targetBounds,
  type Bounds,
} from './geo';
import { placeKey, resolvePlace, type PlaceTarget } from './places';
import { MAP_STYLES, mapImageId, type MapStyle } from './globe';
import { mountGlobeMap, type GlobeMap } from './globe-scene';

/** The map style for a slot: its own choice, else the look's, else by how dark the ground is. */
export function mapStyleFor(
  own: MapStyle | undefined,
  look: { colors: { bg: string }; map?: { style: MapStyle } | undefined },
): MapStyle {
  if (own) return own;
  if (look.map?.style) return look.map.style;
  const n = Number.parseInt(look.colors.bg.slice(1), 16);
  const l = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return l < 0.35 ? 'satellite' : 'terrain';
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const mapZoomContent = z.object({
  place: z
    .string()
    .min(1)
    .max(60)
    .describe('The place exactly as spoken: a country, city, continent or region'),
  label: z
    .string()
    .max(40)
    .optional()
    .describe('Title over the map; defaults to the place name. e.g. "Japan" or "Tokyo, 1989"'),
  note: z
    .string()
    .max(48)
    .refine((s) => wordCount(s) <= 8, 'at most 8 words')
    .optional()
    .describe('Short line under the title, at most 8 words, e.g. "Peaked in 1989"'),
  context: z
    .string()
    .max(32)
    .optional()
    .describe('Tiny label above the title, e.g. "MEANWHILE" or "CASE STUDY"'),
  mapStyle: z
    .enum(MAP_STYLES)
    .optional()
    .describe('Map look: satellite, terrain, paper or night. Leave out to use the style default'),
});
export type MapZoomContent = z.infer<typeof mapZoomContent>;

export { placeKey, resolvePlace, type PlaceTarget };

/** The map target for a place name, against the bundled country shapes. */
export function placeTarget(name: string): PlaceTarget | null {
  return resolvePlace(name, countries().names);
}

/**
 * Safe default from the slot's words: the first run of one to three words that names a place we
 * can draw (longest first, so "New York" beats "York"). Null when none does.
 */
export function mapFromWords(words: readonly string[]): MapZoomContent | null {
  // Possessives count ("Japan's market" is about Japan).
  const clean = words.map((w) =>
    w
      .replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, '')
      .replace(/\.$/, '')
      .replace(/['’]s$/u, ''),
  );
  for (let i = 0; i < clean.length; i++) {
    for (let len = Math.min(3, clean.length - i); len >= 1; len--) {
      const run = clean.slice(i, i + len);
      // A place starts with a capital ("US", "Japan"); "us" the pronoun never counts.
      if (!/^\p{Lu}/u.test(run[0] ?? '')) continue;
      const t = placeTarget(run.join(' '));
      if (t) return { place: run.join(' '), label: t.name };
    }
  }
  return null;
}

type Slots = { context?: TextSlot; label: TextSlot; note?: TextSlot };

/** Title block and the box the camera frames the place in, per format. */
export function layoutMap(
  format: Format,
  frameH: number,
  safe: Box,
  has: { context: boolean; note: boolean },
): { slots: Slots; focus: Box } {
  const tall = format === '9:16';
  const wide = format === '16:9';
  // The stage lifts text by 2 % of the frame on its exit (and fonts set a little above their
  // box): start the title that far below the safe edge so it never leaves the safe area.
  const top = safe.y + Math.round(frameH * 0.035);
  const area: Box = tall
    ? { x: safe.x, y: top, width: safe.width, height: Math.round(safe.height * 0.24) }
    : {
        x: safe.x,
        y: top,
        width: Math.round(safe.width * (wide ? 0.46 : 0.8)),
        height: Math.round(safe.height * (wide ? 0.34 : 0.28)),
      };
  const rows = [
    ...(has.context ? [{ id: 'context', size: tall ? 0.018 : 0.03, min: 0.75, gap: 1 }] : []),
    { id: 'label', size: tall ? 0.05 : wide ? 0.085 : 0.075, min: 0.5, lines: 2, gap: 0.25 },
    ...(has.note ? [{ id: 'note', size: tall ? 0.024 : 0.04, lines: 2 }] : []),
  ];
  const s = stack(area, frameH, rows, { align: tall ? 'center' : 'left', bias: 0 });
  const slots: Slots = {
    ...(s['context'] ? { context: s['context'] } : {}),
    label: s['label'] as TextSlot,
    ...(s['note'] ? { note: s['note'] } : {}),
  };
  const focus: Box = tall
    ? {
        x: safe.x,
        y: safe.y + Math.round(safe.height * 0.3),
        width: safe.width,
        height: Math.round(safe.height * 0.62),
      }
    : wide
      ? {
          x: safe.x + Math.round(safe.width * 0.34),
          y: safe.y + Math.round(safe.height * 0.18),
          width: Math.round(safe.width * 0.64),
          height: Math.round(safe.height * 0.8),
        }
      : {
          x: safe.x,
          y: safe.y + Math.round(safe.height * 0.32),
          width: safe.width,
          height: Math.round(safe.height * 0.66),
        };
  return { slots, focus };
}

/** Camera that puts `b` at `fill` of `focus`, capped so 1:110m outlines never look blocky. */
export function frameOn(
  b: Bounds,
  focus: Box,
  fill: number,
  maxK = 9,
): { k: number; cx: number; cy: number; fx: number; fy: number } {
  const bw = Math.max(1, b[1][0] - b[0][0]);
  const bh = Math.max(1, b[1][1] - b[0][1]);
  const k = Math.max(1, Math.min(maxK, (focus.width * fill) / bw, (focus.height * fill) / bh));
  return {
    k,
    cx: (b[0][0] + b[1][0]) / 2,
    cy: (b[0][1] + b[1][1]) / 2,
    fx: focus.x + focus.width / 2,
    fy: focus.y + focus.height / 2,
  };
}

const SVG = 'http://www.w3.org/2000/svg';
const ZOOM_LEAD_MS = 1400;

/**
 * map-zoom: the world, then the place. The camera flies from the whole world to the place and
 * lands on the word that names it; the country (or the region's countries) fills with the
 * accent, a city gets a pin with a ring, and the title explains it.
 */
export const mapZoom = defineScene<MapZoomContent>({
  id: 'map-zoom',
  name: 'Map',
  category: 'map',
  useWhen: 'the narration names a country, city, continent or region',
  content: mapZoomContent,
  defaultContent: { place: 'Japan', label: 'Japan' },
  variants: [
    { id: 'zoom', about: 'flies from the whole world into the place; the safe default' },
    { id: 'pin', about: 'starts on the region and pushes in to the place; quicker, calmer' },
    {
      id: 'spotlight',
      about: 'the whole world stays in view and the place lights up; best for big regions',
    },
  ],
  peakVariant: 'zoom',
  cues: [
    { id: 'context', about: 'the small label above the title appears', optional: true, snap: true },
    {
      id: 'place',
      about: 'the camera lands on the place and the title appears, on the word that names it',
      leadMs: ZOOM_LEAD_MS,
    },
    { id: 'note', about: 'the short line under the title appears', optional: true, snap: true },
  ],
  focalCue: 'place',
  imageRoles: [],
  safe: mapFromWords,
  durationMs: { min: 3500, ideal: 5000, max: 10000 },
  // The camera needs its lead before the word that names the place.
  keyMomentMs: (d) => Math.min(Math.max(ZOOM_LEAD_MS + 200, d * 0.35), d - 1200),
  formats: ['16:9', '9:16', '1:1'],
  build(ctx, score, variant) {
    const c = score.content;
    const { width: w, height: h, format } = ctx;
    const colors = (ctx.look ?? ctx.style).colors;
    const st = stage(ctx, { cues: this.cues, anchors: score.beats });
    const { slots, focus } = layoutMap(format, h, st.safe, {
      context: Boolean(c.context),
      note: Boolean(c.note),
    });

    // The map: every country once, the target's countries again on top in the accent.
    const { list } = countries();
    const target = placeTarget(c.place);
    const proj = projectionFor(format, w, h, centreLon(target, list));
    const path = geoPath(proj).digits(1);
    const doc = ctx.root.ownerDocument;
    const mapActor = st.shape('map', { x: 0, y: 0, width: w, height: h }, { depth: 0 });
    mapActor.el.style.background = 'transparent';
    mapActor.el.style.borderRadius = '0';
    mapActor.el.style.transformOrigin = 'center center';
    const look = ctx.look ?? ctx.style;
    const mapStyle = mapStyleFor(c.mapStyle, look as Parameters<typeof mapStyleFor>[1]);
    const tex = ctx.images?.[mapImageId(mapStyle)]?.el;
    const globeMap: GlobeMap | null = tex
      ? mountGlobeMap({
          doc,
          host: mapActor.el,
          w,
          h,
          image: tex,
          style: mapStyle,
          colours: colors,
          target,
          list,
          focus,
          variant,
        })
      : null;
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;';
    const cam = doc.createElementNS(SVG, 'g');
    // The graticule: lines of latitude and longitude that draw in as the camera sets off.
    const grid = doc.createElementNS(SVG, 'path');
    grid.setAttribute('d', path(geoGraticule10()) ?? '');
    grid.setAttribute('fill', 'none');
    grid.setAttribute('stroke', colors.ink);
    grid.setAttribute('stroke-opacity', '0.09');
    grid.setAttribute('stroke-width', '1');
    grid.setAttribute('vector-effect', 'non-scaling-stroke');
    grid.setAttribute('pathLength', '1000');
    grid.setAttribute('stroke-dasharray', '1000');
    cam.append(grid);
    const land = doc.createElementNS(SVG, 'path');
    land.setAttribute('d', list.map((f) => path(f) ?? '').join(''));
    land.setAttribute('fill', colors.ink);
    land.setAttribute('fill-opacity', '0.1');
    land.setAttribute('stroke', colors.bg);
    land.setAttribute('stroke-width', '1');
    land.setAttribute('vector-effect', 'non-scaling-stroke');
    cam.append(land);
    const lit = target ? litCountries(target, list) : [];
    const litD = lit.map((f) => path(f) ?? '').join('');
    // The target lifts off the map: a shadow stays on the paper, the country rises above it.
    const lift = doc.createElementNS(SVG, 'path');
    lift.setAttribute('d', litD);
    lift.setAttribute('fill', colors.ink);
    lift.setAttribute('fill-opacity', '0');
    cam.append(lift);
    // Its outline traces before it fills.
    const trace = doc.createElementNS(SVG, 'path');
    trace.setAttribute('d', litD);
    trace.setAttribute('fill', 'none');
    trace.setAttribute('stroke', colors.accent);
    trace.setAttribute('stroke-width', '2.5');
    trace.setAttribute('stroke-linejoin', 'round');
    trace.setAttribute('vector-effect', 'non-scaling-stroke');
    trace.setAttribute('pathLength', '1000');
    trace.setAttribute('stroke-dasharray', '1000');
    trace.setAttribute('stroke-dashoffset', '1000');
    const fill = doc.createElementNS(SVG, 'path');
    fill.setAttribute('d', litD);
    fill.setAttribute('fill', colors.accent);
    fill.setAttribute('stroke', colors.ink);
    fill.setAttribute('stroke-width', '1.5');
    fill.setAttribute('stroke-opacity', '0.5');
    fill.setAttribute('vector-effect', 'non-scaling-stroke');
    cam.append(fill, trace);
    svg.append(cam);
    // A city or micro-state: a pin with a ring (in frame space, so it never scales).
    const point = target?.kind === 'point' ? proj([target.lon, target.lat]) : null;
    const ring = doc.createElementNS(SVG, 'circle');
    const pin = doc.createElementNS(SVG, 'circle');
    const pinR = Math.round(Math.min(w, h) * 0.02);
    for (const el of [ring, pin]) el.setAttribute('r', String(pinR));
    pin.setAttribute('fill', colors.accent);
    pin.setAttribute('stroke', colors.bg);
    pin.setAttribute('stroke-width', String(Math.max(2, pinR * 0.35)));
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', colors.accent);
    ring.setAttribute('stroke-width', String(Math.max(2, pinR * 0.25)));
    if (point) svg.append(ring, pin);
    // The flat vector map is the fallback when the globe can't be drawn.
    if (!globeMap) mapActor.el.append(svg);

    // Where the camera ends: the place framed in the focus box (the world stays for spotlight).
    const bounds = target ? targetBounds(target, proj, list) : null;
    const fillShare = target?.kind === 'region' ? 0.9 : 0.62;
    const end =
      bounds && variant !== 'spotlight'
        ? frameOn(bounds, focus, fillShare)
        : { k: 1.06, cx: w / 2, cy: h / 2, fx: w / 2, fy: h / 2 };
    // 'pin' starts part of the way in (log scale), 'zoom' from the whole world.
    const startShare = variant === 'pin' ? 0.45 : 0;
    const ease = eases.inOutCubic;

    const texts = [];
    if (slots.context && c.context) {
      const ctxText = st.text('context', c.context, slots.context, { role: 'eyebrow' });
      texts.push(ctxText);
      st.on('context', enter(ctxText));
    }
    const title = st.text('label', c.label ?? target?.name ?? c.place, slots.label, {
      role: 'display',
      focal: true,
      balance: true,
    });
    texts.push(title);
    st.on('place', enter(title));
    if (slots.note && c.note) {
      const note = st.text('note', c.note, slots.note, { role: 'label', balance: true });
      texts.push(note);
      st.on('note', enter(note));
    }
    // Over imagery the words need help: light with a shadow over space and city lights, a halo of
    // the paper colour over terrain and printed maps.
    if (globeMap) {
      const dark = mapStyle === 'satellite' || mapStyle === 'night';
      for (const t of texts) {
        if (dark) t.el.style.color = '#ffffff';
        t.el.style.textShadow = dark
          ? `0 ${Math.round(h * 0.003)}px ${Math.round(h * 0.014)}px rgba(0,0,0,0.65)`
          : `0 0 ${Math.round(h * 0.012)}px ${colors.bg}, 0 0 ${Math.round(h * 0.004)}px ${colors.bg}`;
      }
    }

    // The cue times are known after compile; the map reads them on every seek.
    let place = { startMs: 0, landMs: 0 };
    const camAt = (tMs: number) => {
      const lead = Math.max(1, place.landMs - place.startMs);
      const x = ease(Math.min(1, Math.max(0, (tMs - place.startMs) / lead)));
      const e = startShare + (1 - startShare) * x;
      // After landing the camera keeps a slow push (4 % over the next six seconds).
      const after = Math.min(1, Math.max(0, (tMs - place.landMs) / 6000));
      const k = Math.exp(Math.log(end.k) * e) * (1 + 0.04 * after * (2 - after));
      const cx = w / 2 + (end.cx - w / 2) * e;
      const cy = h / 2 + (end.cy - h / 2) * e;
      const fx = w / 2 + (end.fx - w / 2) * e;
      const fy = h / 2 + (end.fy - h / 2) * e;
      return { k, tx: fx - k * cx, ty: fy - k * cy };
    };
    mapActor.post = (tMs) => {
      if (globeMap) {
        globeMap.post(tMs, place);
        return;
      }
      const { k, tx, ty } = camAt(tMs);
      cam.setAttribute(
        'transform',
        `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})`,
      );
      // The grid draws in over the first half of the flight.
      const g = Math.min(
        1,
        Math.max(
          0,
          (tMs - place.startMs + 200) / Math.max(400, (place.landMs - place.startMs) * 0.6),
        ),
      );
      grid.setAttribute('stroke-dashoffset', (1000 * (1 - eases.outCubic(g))).toFixed(1));
      // The outline traces in the last stretch of the flight, then the place fills and lifts.
      const tr = Math.min(1, Math.max(0, (tMs - (place.landMs - 700)) / 650));
      trace.setAttribute('stroke-dashoffset', (1000 * (1 - eases.inOutCubic(tr))).toFixed(1));
      const lit = Math.min(1, Math.max(0, (tMs - (place.landMs - 250)) / 350));
      fill.setAttribute('fill-opacity', (0.95 * lit).toFixed(3));
      fill.setAttribute('stroke-opacity', (0.5 * lit).toFixed(3));
      // The lift: overshoots a touch and settles; offset in frame pixels, divided by the zoom.
      const up = Math.min(1, Math.max(0, (tMs - (place.landMs - 100)) / 450));
      const rise = up === 0 ? 0 : 1 + 1.6 * (up - 1) ** 3 + 0.6 * (up - 1) ** 2;
      const dy = (-Math.min(w, h) * 0.012 * rise) / k;
      fill.setAttribute('transform', `translate(0 ${dy.toFixed(3)})`);
      trace.setAttribute('transform', `translate(0 ${dy.toFixed(3)})`);
      lift.setAttribute('fill-opacity', (0.16 * Math.min(1, up * 1.5)).toFixed(3));
      land.setAttribute('fill-opacity', (0.1 + 0.04 * (1 - lit)).toFixed(3));
      if (point) {
        const px = point[0] * k + tx;
        const py = point[1] * k + ty;
        const drop = Math.min(1, Math.max(0, (tMs - (place.landMs - 150)) / 300));
        const b = drop === 0 ? 0 : 1 + 2.2 * (drop - 1) ** 3 + 1.2 * (drop - 1) ** 2;
        pin.setAttribute('cx', px.toFixed(1));
        pin.setAttribute('cy', (py - (1 - drop) * pinR * 3).toFixed(1));
        pin.setAttribute('r', (pinR * Math.max(0, b)).toFixed(2));
        // The ring pulses out twice from the landing.
        const since = tMs - place.landMs;
        const phase = since < 0 ? -1 : (since % 900) / 900;
        const pulses = since >= 0 && since < 1800;
        ring.setAttribute('cx', px.toFixed(1));
        ring.setAttribute('cy', py.toFixed(1));
        // After two pulses a soft halo stays, so a held frame still says "here".
        const r = pulses ? 1 + 2.5 * Math.max(0, phase) : 2;
        const o = pulses ? 0.8 * (1 - phase) : since >= 0 ? 0.3 : 0;
        ring.setAttribute('r', (pinR * r).toFixed(2));
        ring.setAttribute('stroke-opacity', o.toFixed(3));
      }
    };

    const comp = st.compile();
    const cue = comp.report.plan.cues.find((x) => x.id === 'place');
    if (cue) place = { startMs: cue.startMs, landMs: cue.landMs };
    else place = { startMs: 0, landMs: Math.min(ZOOM_LEAD_MS, comp.durationMs) };
    comp.seek(0);
    if (!globeMap) return comp;
    const dispose = comp.dispose;
    return {
      ...comp,
      dispose: () => {
        globeMap.dispose();
        dispose?.();
      },
    };
  },
});

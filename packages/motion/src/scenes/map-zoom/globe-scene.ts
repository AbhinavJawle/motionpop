import {
  geoCentroid,
  geoDistance,
  geoGraticule10,
  geoOrthographic,
  geoPath,
  type GeoProjection,
} from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { eases } from '../../core/ease';
import type { Box } from '../../core/safe-area';
import { countries50, litCountries, targetBounds, targetCentre, type Country } from './geo';
import { createGlobe, type GlobeCamera, type GlobeColours, type MapStyle } from './globe';
import type { PlaceTarget } from './places';

const SVG = 'http://www.w3.org/2000/svg';

export interface GlobeMap {
  /** Draw the frame at slot time `tMs`, given when the flight starts and lands. */
  post(tMs: number, place: { startMs: number; landMs: number }): void;
  dispose(): void;
}

/** Shortest signed difference between two longitudes, in degrees. */
const dLon = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;
const clamp = (x: number) => Math.max(0, Math.min(1, x));

function svgEl<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const el = doc.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/**
 * The globe version of map-zoom: the world spins in its style, the camera flies down to the place
 * as the narration reaches it (rotation leads, the zoom follows), the borders sharpen from 1:110m
 * to 1:50m on the way in, the place's outline traces and it fills and lifts as the camera lands,
 * and a city gets its pin. Returns null when the globe can't be drawn (no WebGL, no image).
 */
export function mountGlobeMap(args: {
  doc: Document;
  host: HTMLElement;
  w: number;
  h: number;
  image: HTMLImageElement;
  style: MapStyle;
  colours: GlobeColours;
  target: PlaceTarget | null;
  list: readonly Country[];
  focus: Box;
  variant: string;
}): GlobeMap | null {
  const { doc, host, w, h, style, colours, target, list, focus, variant } = args;
  const globe = createGlobe(doc, w, h, args.image, style, colours);
  if (!globe) return null;
  const dark = style === 'satellite' || style === 'night';

  // Space behind a satellite or night globe; it fades once the globe fills the frame.
  const space = doc.createElement('div');
  if (dark) {
    space.style.cssText = `position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%, #0d1a36 0%, #060a16 60%, #03050b 100%);`;
    const stars = svgEl(doc, 'svg', {
      width: String(w),
      height: String(h),
      style: 'position:absolute;left:0;top:0;',
    });
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 140; i++) {
      stars.append(
        svgEl(doc, 'circle', {
          cx: (rnd() * w).toFixed(1),
          cy: (rnd() * h).toFixed(1),
          r: (0.6 + rnd() * 1.4 * (h / 1080)).toFixed(2),
          fill: '#fff',
          'fill-opacity': (0.25 + rnd() * 0.6).toFixed(2),
        }),
      );
    }
    space.append(stars);
    host.append(space);
  }
  host.append(globe.canvas);

  const svg = svgEl(doc, 'svg', {
    width: String(w),
    height: String(h),
    viewBox: `0 0 ${w} ${h}`,
    'aria-hidden': 'true',
    style: 'position:absolute;left:0;top:0;overflow:visible;',
  });
  const line = dark ? '#ffffff' : colours.ink;
  const grid = svgEl(doc, 'path', {
    fill: 'none',
    stroke: line,
    'stroke-width': '1',
    'stroke-opacity': '0',
  });
  const borders = svgEl(doc, 'path', {
    fill: 'none',
    stroke: line,
    'stroke-width': String(Math.max(1, h / 1080)),
    'stroke-opacity': dark ? '0.28' : '0.32',
    'stroke-linejoin': 'round',
  });
  const shadow = svgEl(doc, 'path', { fill: '#000', 'fill-opacity': '0' });
  const fill = svgEl(doc, 'path', {
    fill: colours.accent,
    'fill-opacity': '0',
    'stroke-linejoin': 'round',
  });
  const trace = svgEl(doc, 'path', {
    fill: 'none',
    stroke: dark ? colours.highlight : colours.accent,
    'stroke-width': String(Math.max(2.5, (h / 1080) * 3)),
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
    pathLength: '1000',
    'stroke-dasharray': '1000',
    'stroke-dashoffset': '1000',
  });
  const pinR = Math.round(Math.min(w, h) * 0.02);
  const ring = svgEl(doc, 'circle', {
    r: String(pinR),
    fill: 'none',
    stroke: colours.accent,
    'stroke-width': String(Math.max(2, pinR * 0.25)),
    'stroke-opacity': '0',
  });
  const pin = svgEl(doc, 'circle', {
    r: '0',
    fill: colours.accent,
    stroke: dark ? '#fff' : colours.bg,
    'stroke-width': String(Math.max(2, pinR * 0.35)),
  });
  svg.append(grid, borders, shadow, fill, trace);
  if (target?.kind === 'point') svg.append(ring, pin);
  host.append(svg);

  // Where the camera ends.
  const [lonE, latE] = target ? targetCentre(target, list) : [10, 20];
  const unit = geoOrthographic().rotate([-lonE, -latE]).scale(1).translate([0, 0]);
  const b = target ? targetBounds(target, unit, list) : null;
  const fx = focus.x + focus.width / 2;
  const fy = focus.y + focus.height / 2;
  const rStart = Math.min(focus.width, focus.height) * 0.47;
  let rEnd = rStart * 1.12;
  let bcx = 0;
  let bcy = 0;
  if (b && variant !== 'spotlight') {
    const bw = Math.max(1e-4, b[1][0] - b[0][0]);
    const bh = Math.max(1e-4, b[1][1] - b[0][1]);
    const share = target?.kind === 'region' ? 0.9 : 0.62;
    rEnd = Math.max(rStart, Math.min((focus.width * share) / bw, (focus.height * share) / bh));
    rEnd = Math.min(rEnd, h * 60);
    bcx = (b[0][0] + b[1][0]) / 2;
    bcy = (b[0][1] + b[1][1]) / 2;
  }
  const lonS = lonE - 55;
  const latS = latE * 0.35;
  const r0 = variant === 'pin' ? Math.sqrt(rStart * rEnd) : rStart;

  // Close-up vectors: 1:50m countries near the place (whole-world 1:50m is too heavy per frame).
  const near = countries50().filter(
    (c) =>
      (target?.kind === 'country' && c.properties.name === target.neName) ||
      geoDistance(geoCentroid(c), [lonE, latE]) < 0.8,
  );
  const lit110 = target ? litCountries(target, list) : [];
  const lit50 = target
    ? target.kind === 'country'
      ? near.filter((c) => c.properties.name === target.neName)
      : litCountries(target, near)
    : [];
  const graticule = geoGraticule10();
  const point = target?.kind === 'point' ? ([target.lon, target.lat] as [number, number]) : null;

  const camAt = (tMs: number, place: { startMs: number; landMs: number }): GlobeCamera => {
    const lead = Math.max(1, place.landMs - place.startMs);
    const p = (tMs - place.startMs) / lead;
    // Before the flight the globe turns slowly (12° a second), so it is never frozen.
    const spin = p < 0 ? ((tMs - place.startMs) / 1000) * 12 : 0;
    const pr = eases.inOutCubic(clamp(p / 0.8));
    const pz = eases.inOutCubic(clamp((p - 0.18) / 0.82));
    // After landing a slow 4 % push over six seconds.
    const after = clamp((tMs - place.landMs) / 6000);
    const r =
      Math.exp(Math.log(r0) + (Math.log(rEnd) - Math.log(r0)) * pz) *
      (1 + 0.04 * after * (2 - after));
    const lon = lonS + spin + dLon(lonS, lonE) * pr;
    const lat = latS + (latE - latS) * pr;
    return { lon, lat, r, cx: fx - r * bcx * pz, cy: fy - r * bcy * pz };
  };

  let lastKey = '';
  return {
    post(tMs, place) {
      const cam = camAt(tMs, place);
      const key = `${cam.lon.toFixed(3)}|${cam.lat.toFixed(3)}|${cam.r.toFixed(2)}|${cam.cx.toFixed(1)}|${cam.cy.toFixed(1)}`;
      if (key !== lastKey) {
        globe.draw(cam);
        lastKey = key;
      }
      if (dark) space.style.opacity = clamp(1.8 - cam.r / (h * 0.75)).toFixed(3);
      const proj: GeoProjection = geoOrthographic()
        .rotate([-cam.lon, -cam.lat])
        .scale(cam.r)
        .translate([cam.cx, cam.cy])
        .clipAngle(90)
        .precision(0.6);
      const path = geoPath(proj).digits(1);
      const close = cam.r > h * 1.4;
      const set = close ? near : list;
      borders.setAttribute('d', set.map((c) => path(c) ?? '').join(''));
      grid.setAttribute('d', path(graticule) ?? '');
      grid.setAttribute('stroke-opacity', (0.12 * clamp(1.5 - cam.r / h)).toFixed(3));
      const lit = close && lit50.length ? lit50 : lit110;
      const litD = lit.map((f: Feature<Polygon | MultiPolygon>) => path(f) ?? '').join('');
      const tr = clamp((tMs - (place.landMs - 700)) / 650);
      const on = clamp((tMs - (place.landMs - 250)) / 350);
      const up = clamp((tMs - (place.landMs - 100)) / 450);
      const rise = up === 0 ? 0 : 1 + 1.6 * (up - 1) ** 3 + 0.6 * (up - 1) ** 2;
      const dy = -Math.min(w, h) * 0.01 * rise;
      for (const el of [fill, trace]) {
        el.setAttribute('d', litD);
        el.setAttribute('transform', `translate(0 ${dy.toFixed(2)})`);
      }
      shadow.setAttribute('d', litD);
      shadow.setAttribute('fill-opacity', (0.18 * clamp(up * 1.5)).toFixed(3));
      const fillTo = style === 'paper' ? 0.88 : style === 'terrain' ? 0.72 : 0.55;
      fill.setAttribute('fill-opacity', (fillTo * on).toFixed(3));
      trace.setAttribute('stroke-dashoffset', (1000 * (1 - eases.inOutCubic(tr))).toFixed(1));
      if (point) {
        const q = proj(point);
        const visible = q && geoDistance(point, [cam.lon, cam.lat]) < Math.PI / 2;
        if (q && visible) {
          const drop = clamp((tMs - (place.landMs - 150)) / 300);
          const bb = drop === 0 ? 0 : 1 + 2.2 * (drop - 1) ** 3 + 1.2 * (drop - 1) ** 2;
          pin.setAttribute('cx', q[0].toFixed(1));
          pin.setAttribute('cy', (q[1] - (1 - drop) * pinR * 3).toFixed(1));
          pin.setAttribute('r', (pinR * Math.max(0, bb)).toFixed(2));
          const since = tMs - place.landMs;
          const phase = since < 0 ? -1 : (since % 900) / 900;
          const pulses = since >= 0 && since < 1800;
          ring.setAttribute('cx', q[0].toFixed(1));
          ring.setAttribute('cy', q[1].toFixed(1));
          ring.setAttribute('r', (pinR * (pulses ? 1 + 2.5 * Math.max(0, phase) : 2)).toFixed(2));
          ring.setAttribute(
            'stroke-opacity',
            (pulses ? 0.8 * (1 - phase) : since >= 0 ? 0.3 : 0).toFixed(3),
          );
        } else pin.setAttribute('r', '0');
      }
    },
    dispose() {
      globe.dispose();
    },
  };
}

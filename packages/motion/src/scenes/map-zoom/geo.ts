import { geoNaturalEarth1, geoPath, geoCentroid, type GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json' with { type: 'json' };
import countries50mJson from 'world-atlas/countries-50m.json' with { type: 'json' };
import type { Format } from '../../contract';
import type { PlaceTarget } from './places';

export type Country = Feature<Polygon | MultiPolygon, { name: string }>;

let cache: { list: Country[]; names: Set<string> } | null = null;

/** Natural Earth 1:110m admin-0 countries (public domain), parsed once. */
export function countries(): { list: Country[]; names: ReadonlySet<string> } {
  if (!cache) {
    const topo = countries110m as unknown as Topology<{
      countries: GeometryCollection<{ name: string }>;
    }>;
    const fc = feature(topo, topo.objects.countries) as FeatureCollection<
      Polygon | MultiPolygon,
      { name: string }
    >;
    const list = fc.features.filter((f) => f.properties.name !== 'Antarctica');
    cache = { list, names: new Set(list.map((f) => f.properties.name)) };
  }
  return cache;
}

let cache50: Country[] | null = null;
/** Natural Earth 1:50m countries (public domain), parsed on first use: the close-up outlines. */
export function countries50(): Country[] {
  if (!cache50) {
    const topo = countries50mJson as unknown as Topology<{
      countries: GeometryCollection<{ name: string }>;
    }>;
    const fc = feature(topo, topo.objects.countries) as FeatureCollection<
      Polygon | MultiPolygon,
      { name: string }
    >;
    cache50 = fc.features.filter((f) => f.properties.name !== 'Antarctica');
  }
  return cache50;
}

/** The point the camera centres on: the mainland's centroid, the city, or the region's middle. */
export function targetCentre(target: PlaceTarget, list: readonly Country[]): [number, number] {
  if (target.kind === 'point') return [target.lon, target.lat];
  if (target.kind === 'region') {
    return [(target.box[0] + target.box[2]) / 2, (target.box[1] + target.box[3]) / 2];
  }
  const c = list.find((f) => f.properties.name === target.neName);
  return c ? mainland(c, geoPath(geoNaturalEarth1())) : [10, 20];
}

export type Bounds = [[number, number], [number, number]];

/** World width as a share of the frame width: narrow frames crop the world's sides. */
const WORLD_WIDTH: Record<Format, number> = { '16:9': 0.96, '9:16': 2.2, '1:1': 1.4 };

/** Natural Earth projection centred on `lon`, sized for the format and centred in the frame. */
export function projectionFor(format: Format, w: number, h: number, lon: number): GeoProjection {
  const p = geoNaturalEarth1().rotate([-lon, 0]);
  p.fitWidth(w * WORLD_WIDTH[format], { type: 'Sphere' });
  const [[x0, y0], [x1, y1]] = geoPath(p).bounds({ type: 'Sphere' });
  const [tx, ty] = p.translate();
  return p.translate([tx + (w - (x0 + x1)) / 2, ty + (h - (y0 + y1)) / 2]);
}

/** The longitude to centre the world on for a target (keeps Pacific places off the edge). */
export function centreLon(target: PlaceTarget | null, list: readonly Country[]): number {
  if (!target) return 10;
  if (target.kind === 'point') return target.lon;
  if (target.kind === 'region') return (target.box[0] + target.box[2]) / 2;
  const c = list.find((f) => f.properties.name === target.neName);
  return c ? mainland(c, geoPath(geoNaturalEarth1()))[0] : 10;
}

/**
 * Centroid longitude of the largest polygon (the mainland: the contiguous United States, not
 * Alaska; mainland France, not French Guiana).
 */
function mainland(c: Country, path: ReturnType<typeof geoPath>): [number, number] {
  const big = largestPolygon(c, path);
  return geoCentroid(big);
}

function largestPolygon(c: Country, path: ReturnType<typeof geoPath>): Feature<Polygon> {
  const g = c.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let best = polys[0] ?? [];
  let bestArea = -1;
  for (const coords of polys) {
    const f: Feature<Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: coords },
    };
    const a = path.area(f);
    if (a > bestArea) {
      bestArea = a;
      best = coords;
    }
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: best } };
}

/** The projected box the camera frames: the mainland, a box around a point, or a region. */
export function targetBounds(
  target: PlaceTarget,
  p: GeoProjection,
  list: readonly Country[],
): Bounds | null {
  const path = geoPath(p);
  if (target.kind === 'country') {
    const c = list.find((f) => f.properties.name === target.neName);
    return c ? path.bounds(largestPolygon(c, path)) : null;
  }
  const [w, s, e, n] =
    target.kind === 'point'
      ? [target.lon - 7, target.lat - 5, target.lon + 7, target.lat + 5]
      : target.box;
  const ring: [number, number][] = [];
  for (let i = 0; i <= 8; i++) ring.push([w + ((e - w) * i) / 8, s]);
  for (let i = 0; i <= 8; i++) ring.push([e, s + ((n - s) * i) / 8]);
  for (let i = 0; i <= 8; i++) ring.push([e - ((e - w) * i) / 8, n]);
  for (let i = 0; i <= 8; i++) ring.push([w, n - ((n - s) * i) / 8]);
  const pts = ring.map((c) => p(c)).filter((x): x is [number, number] => x !== null);
  if (pts.length === 0) return null;
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}

/**
 * What a target lights up: the country itself, or every polygon centred in the region (France
 * lights up for Europe, French Guiana does not).
 */
export function litCountries(
  target: PlaceTarget,
  list: readonly Country[],
): Feature<Polygon | MultiPolygon>[] {
  if (target.kind === 'country') return list.filter((f) => f.properties.name === target.neName);
  if (target.kind === 'point') return [];
  const [w, s, e, n] = target.box;
  const inside = (f: Feature<Polygon>) => {
    const [lon, lat] = geoCentroid(f);
    return lon >= w && lon <= e && lat >= s && lat <= n;
  };
  const out: Feature<Polygon>[] = [];
  for (const c of list) {
    const g = c.geometry;
    for (const coords of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
      const f: Feature<Polygon> = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: coords },
      };
      if (inside(f)) out.push(f);
    }
  }
  return out;
}

// Studio: the third-party libraries a film page may use. They're copied next to film.html and
// loaded by script tags the studio injects into <head>, so the model never fetches anything.
// All MIT / ISC; Natural Earth data is public domain.
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pkgDir = process.env['MOTION_PKG_DIR'] ?? process.cwd();
// Package exports hide the dist files from require.resolve, so read them from node_modules directly.
const mod = (p: string) => join(pkgDir, 'node_modules', p);

const FILES: [string, string][] = [
  ['d3/dist/d3.min.js', 'd3.min.js'],
  ['topojson-client/dist/topojson-client.min.js', 'topojson-client.min.js'],
  ['roughjs/bundled/rough.js', 'rough.js'],
  ['flubber/build/flubber.min.js', 'flubber.min.js'],
  ['katex/dist/katex.min.js', 'katex.min.js'],
  ['katex/dist/katex.min.css', 'katex.min.css'],
  ['three/build/three.min.js', 'three.min.js'],
];

/** Copies the libraries and the world maps (as scripts: file:// pages can't fetch JSON) into dir/lib. */
export function installLibs(dir: string): void {
  const lib = join(dir, 'lib');
  mkdirSync(lib, { recursive: true });
  for (const [from, to] of FILES) copyFileSync(mod(from), join(lib, to));
  cpSync(join(mod('katex/dist'), 'fonts'), join(lib, 'fonts'), {
    recursive: true,
  });
  for (const [file, name] of [
    ['countries-50m.json', 'WORLD_50M'],
    ['countries-110m.json', 'WORLD_110M'],
    ['land-50m.json', 'LAND_50M'],
  ] as const) {
    const json = readFileSync(mod(`world-atlas/${file}`), 'utf8');
    writeFileSync(join(lib, `${name.toLowerCase()}.js`), `window.${name}=${json};`);
  }
}

export const LIB_TAGS = [
  '<link rel="stylesheet" href="lib/katex.min.css">',
  ...['d3.min.js', 'topojson-client.min.js', 'rough.js', 'flubber.min.js', 'katex.min.js', 'three.min.js'].map(
    (f) => `<script src="lib/${f}"></script>`,
  ),
  ...['world_50m.js', 'world_110m.js', 'land_50m.js'].map((f) => `<script src="lib/${f}"></script>`),
].join('\n');

/** Puts the library tags first in <head> (or at the top) so the film's own scripts can use them. */
export function injectLibs(html: string): string {
  const cleaned = html.replace(/<script[^>]+src="lib\/[^"]+"[^>]*><\/script>\s*/g, '').replace(/<link[^>]+href="lib\/[^"]+"[^>]*>\s*/g, '');
  const m = cleaned.match(/<head[^>]*>/i);
  if (m?.index !== undefined) {
    const at = m.index + m[0].length;
    return cleaned.slice(0, at) + '\n' + LIB_TAGS + '\n' + cleaned.slice(at);
  }
  return LIB_TAGS + '\n' + cleaned;
}

export const LIB_DOC = `Libraries already loaded on the page before your code runs (globals; don't add script tags for them, and load nothing else):
- d3 (v7, window.d3): scales, shapes (d3.line, d3.area, d3.arc, d3.pie, curves), interpolators (d3.interpolate, d3.interpolateRgb), eases (d3.easeCubicOut, d3.easeBackOut…), and d3-geo projections (geoOrthographic for a globe, geoNaturalEarth1, geoMercator, geoEqualEarth, geoPath, geoInterpolate for great-circle routes, geoDistance).
- topojson (window.topojson): topojson.feature(WORLD_50M, WORLD_50M.objects.countries) gives every country as GeoJSON (properties.name is the English name, e.g. "Ethiopia", "Brazil", "Japan"). Also WORLD_110M (lighter) and LAND_50M (objects.land). Real geography: when the narration names places, draw them from this data, never as hand-made blobs.
- rough (rough.js, window.rough): hand-drawn sketchy shapes on SVG or canvas (rough.svg(svgEl).rectangle/circle/path/line/polygon…, options roughness, bowing, fill, fillStyle 'hachure'|'solid'|'zigzag'|'cross-hatch'|'dots'). ALWAYS pass a fixed seed option (e.g. { seed: 7 }) or it uses Math.random.
- flubber (window.flubber): smooth morphs between any two SVG paths/shapes: const f = flubber.interpolate(pathA, pathB); f(progress) → path string. Also flubber.toCircle, fromCircle, separate, combine (one shape splitting into many). This is how you do Manim-style Transform: a bean becomes a cup, a cup becomes a globe, a bar becomes a coin.
- katex (window.katex): katex.render(tex, el) for real math typesetting.
- THREE (three.js r159, window.THREE): real 3D with WebGLRenderer({ preserveDrawingBuffer: true, antialias: true }). Render once inside seek(ms) — never an animation loop.`;

import { geoEquirectangular, geoPath } from 'd3-geo';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import land50m from 'world-atlas/land-50m.json' with { type: 'json' };

/**
 * The globe under the map: a WebGL full-frame pass that draws an equirectangular world image on
 * an orthographic sphere (the inverse projection runs per pixel in the fragment shader), graded
 * to the look. A matching d3 orthographic projection draws the crisp vectors (borders, the lit
 * place, pins) on top, so the picture and the lines always agree. Rendering is synchronous and a
 * pure function of the camera, so every seek draws the same frame.
 *
 * Styles:
 * - `satellite`: true-colour imagery (NASA Blue Marble, public domain), atmosphere glow, space.
 * - `terrain`: shaded relief with hypsometric tints (Natural Earth, public domain).
 * - `paper`: grey hillshade tinted into the look's own colours over a land mask; a printed map.
 * - `night`: city lights (NASA, public domain) on a deep blue sphere.
 */
export const MAP_STYLES = ['satellite', 'terrain', 'paper', 'night'] as const;
export type MapStyle = (typeof MAP_STYLES)[number];

/** Bundled image per style (packages/motion/assets/maps → dist/maps). */
export const MAP_FILES: Record<MapStyle, string> = {
  satellite: 'satellite-8k.webp',
  terrain: 'relief-8k.webp',
  paper: 'gray-8k.webp',
  night: 'night-4k.webp',
};
export const mapImageId = (style: MapStyle) => `map:${style}`;

export interface GlobeCamera {
  /** Rotation centre in degrees. */
  lon: number;
  lat: number;
  /** Sphere radius in frame pixels. */
  r: number;
  /** Where the rotation centre sits on the frame. */
  cx: number;
  cy: number;
}

export interface GlobeColours {
  bg: string;
  ink: string;
  accent: string;
  accent2: string;
  highlight: string;
  muted: string;
}

export interface Globe {
  canvas: HTMLCanvasElement;
  draw(cam: GlobeCamera): void;
  dispose(): void;
}

const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uR;
uniform float uLon0;
uniform float uLat0;
uniform int uStyle;
uniform vec3 uLand;
uniform vec3 uLand2;
uniform vec3 uSea;
uniform vec3 uGlow;
uniform vec3 uBg;
const float PI = 3.14159265359;

vec3 grade(vec3 c, float amt, vec3 toward) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(c, toward * (0.35 + 0.9 * l), amt);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = (frag - uCenter) / uR;
  p.y = -p.y;
  float d = length(p);
  float px = 1.0 / uR;
  if (d > 1.0) {
    float k = (d - 1.0) / 0.09;
    if (uStyle == 2) {
      // A printed globe casts a soft shadow on the paper instead of glowing.
      vec2 q = (frag - uCenter - vec2(0.0, uR * 0.035)) / uR;
      float s = smoothstep(1.06, 0.96, length(q)) * 0.22;
      gl_FragColor = vec4(0.0, 0.0, 0.0, s);
      return;
    }
    float g = exp(-k * 2.2) * (uStyle == 3 ? 0.55 : 0.75);
    gl_FragColor = vec4(uGlow * g, g);
    return;
  }
  float z = sqrt(max(0.0, 1.0 - d * d));
  float sinLat = p.y * cos(uLat0) + z * sin(uLat0);
  float lat = asin(clamp(sinLat, -1.0, 1.0));
  float dlon = atan(p.x, z * cos(uLat0) - p.y * sin(uLat0));
  // Relative longitude keeps the texture lookup continuous across the date line (REPEAT wraps).
  vec2 uv = vec2((dlon + uLon0) / (2.0 * PI) + 0.5, 0.5 - lat / PI);
  vec3 c = texture2D(uTex, uv).rgb;
  float land = texture2D(uMask, uv).r;
  if (uStyle == 0) {
    c = pow(c, vec3(0.92)) * 1.08;
    // The source ocean is a flat navy: give it depth (teal near the coast, deep blue offshore).
    float coast = texture2D(uMask, uv, 4.0).r;
    vec3 sea = mix(vec3(0.02, 0.09, 0.2), vec3(0.05, 0.22, 0.34), smoothstep(0.0, 0.5, coast));
    c = mix(sea + c * 0.25, c, smoothstep(0.3, 0.7, land));
  } else if (uStyle == 1) {
    c = grade(c, 0.12, uLand2);
  } else if (uStyle == 2) {
    float hs = clamp((c.r - 0.30) * 1.9, 0.0, 1.4);
    vec3 l = mix(uLand * 0.82, uLand * 1.06, hs);
    // Waterlines: faint rings offshore, the old printed-map trick.
    float near = texture2D(uMask, uv, 3.0).r;
    float ring = (1.0 - land) * smoothstep(0.02, 0.25, near) * (0.5 + 0.5 * sin(near * 40.0));
    vec3 s = mix(uSea, uSea * 0.86, ring * 0.35);
    c = mix(s, l, smoothstep(0.35, 0.65, land));
  } else {
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 base = mix(vec3(0.02, 0.035, 0.09), vec3(0.05, 0.07, 0.15), land);
    c = base + vec3(1.0, 0.82, 0.55) * pow(lum, 1.4) * 1.6;
  }
  // Light from the upper left: a round globe from afar, flat once the camera is close.
  vec3 n = vec3(p, z);
  float lit = clamp(dot(n, normalize(vec3(-0.45, 0.5, 0.75))), 0.0, 1.0);
  float shade = mix(1.0, 0.5 + 0.55 * lit, clamp(1.35 - uR / (uRes.y * 0.75), 0.0, 1.0));
  c *= shade;
  // Limb darkening and the anti-aliased edge.
  c *= mix(1.0, 0.82, smoothstep(0.75, 1.0, d) * clamp(1.3 - uR / (uRes.y * 0.8), 0.0, 1.0));
  float a = smoothstep(1.0, 1.0 - 1.5 * px, d);
  gl_FragColor = vec4(c * a, a);
}`;

const STYLE_INDEX: Record<MapStyle, number> = { satellite: 0, terrain: 1, paper: 2, night: 3 };

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const mix3 = (a: [number, number, number], b: [number, number, number], t: number) =>
  a.map((v, i) => v + ((b[i] ?? 0) - v) * t) as [number, number, number];

let maskCache: HTMLCanvasElement | null = null;
/** Land mask, equirectangular 4096 × 2048, drawn once from Natural Earth 1:50m land. */
function landMask(doc: Document): HTMLCanvasElement {
  if (maskCache && maskCache.ownerDocument === doc) return maskCache;
  const c = doc.createElement('canvas');
  c.width = 4096;
  c.height = 2048;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    const topo = land50m as unknown as Topology<{ land: GeometryCollection }>;
    const fc = feature(topo, topo.objects.land) as FeatureCollection<Polygon | MultiPolygon>;
    const proj = geoEquirectangular()
      .scale(c.width / (2 * Math.PI))
      .translate([c.width / 2, c.height / 2]);
    g.fillStyle = '#fff';
    g.beginPath();
    geoPath(proj, g)(fc);
    g.fill();
  }
  maskCache = c;
  return c;
}

function shader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

function texture(
  gl: WebGLRenderingContext,
  unit: number,
  src: TexImageSource,
  mips: boolean,
): WebGLTexture | null {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mips) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return t;
}

/**
 * The globe canvas, or null when WebGL or the image is unavailable (the scene then draws its flat
 * vector map, so a map never fails for want of a GPU).
 */
export function createGlobe(
  doc: Document,
  w: number,
  h: number,
  image: HTMLImageElement,
  style: MapStyle,
  colours: GlobeColours,
): Globe | null {
  if (!image.complete || image.naturalWidth === 0) return null;
  const canvas = doc.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;`;
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', {
      premultipliedAlpha: true,
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  let src: TexImageSource = image;
  if (image.naturalWidth > max) {
    // Scale down for small GPUs (the software renderer allows 8192; some laptops 4096).
    const c = doc.createElement('canvas');
    c.width = max;
    c.height = max / 2;
    c.getContext('2d')?.drawImage(image, 0, 0, c.width, c.height);
    src = c;
  }
  const vs = shader(gl, gl.VERTEX_SHADER, VERT);
  const fs = shader(gl, gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const tex = texture(gl, 0, src, true);
  const mask = texture(gl, 1, landMask(doc), true);
  const ctx3d = gl;
  const u = (n: string) => ctx3d.getUniformLocation(prog, n);
  gl.uniform1i(u('uTex'), 0);
  gl.uniform1i(u('uMask'), 1);
  gl.uniform2f(u('uRes'), w, h);
  gl.uniform1i(u('uStyle'), STYLE_INDEX[style]);
  const bg = rgb(colours.bg);
  const ink = rgb(colours.ink);
  // Paper: land is a warm step off the paper, sea a cool wash of the second accent.
  // Paper: sand-toned land a step off the paper, a pale steel-blue sea (water reads as water in
  // every look; the look's own accents are kept for what the map is about).
  gl.uniform3fv(u('uLand'), mix3(bg, [0.84, 0.76, 0.6], 0.45));
  gl.uniform3fv(u('uLand2'), mix3(bg, ink, 0.15));
  gl.uniform3fv(u('uSea'), mix3(bg, [0.42, 0.56, 0.66], 0.38));
  gl.uniform3fv(u('uBg'), bg);
  gl.uniform3fv(u('uGlow'), style === 'night' ? [0.25, 0.45, 1] : [0.45, 0.72, 1]);
  const uCenter = u('uCenter');
  const uR = u('uR');
  const uLon0 = u('uLon0');
  const uLat0 = u('uLat0');
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  const rad = Math.PI / 180;

  return {
    canvas,
    draw(cam) {
      if (!gl) return;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uCenter, cam.cx, cam.cy);
      gl.uniform1f(uR, cam.r);
      gl.uniform1f(uLon0, cam.lon * rad);
      gl.uniform1f(uLat0, cam.lat * rad);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      if (!gl) return;
      gl.deleteTexture(tex);
      gl.deleteTexture(mask);
      gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      gl = null;
    },
  };
}

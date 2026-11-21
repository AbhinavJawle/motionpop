// Reel engine (spec 25): compiles a reel into one self-contained HyperFrames composition. The
// speaker video is a timed <video> clip per kept segment (its own audio); our runtime frames it
// and draws the scenes and captions from `hf-seek`.
import type { ReelPlan, ReelWord } from '@motionpop/schemas';
import { ReelPlanSchema } from '@motionpop/schemas';
import type { ReelData } from './mount';

export interface ReelCompileAssets {
  /** dist/reel-runtime.js */
  reelRuntimeJs: string;
  /** HyperFrames runtime IIFE (dist/hyperframe.runtime.iife.js). */
  hyperframesRuntimeJs: string;
  /** dist/reel-fonts.json: family → base64 woff2. */
  fonts: Readonly<Record<string, string>>;
}

export interface ReelSegment {
  /** Source video range (ms) kept in the reel. */
  srcStartMs: number;
  srcEndMs: number;
}

export interface ReelCompileInput {
  plan: ReelPlan;
  words: readonly ReelWord[];
  durationMs: number;
  /** Speaker video path relative to the composition folder. */
  videoSrc: string;
  video: { w: number; h: number };
  /** Kept source ranges in order; default: the whole video. */
  segments?: readonly ReelSegment[];
  /** Output size; the 720 × 1280 stage is scaled to it. Default 1080 × 1920. */
  out?: { w: number; h: number };
  /** Optional sound bed / SFX track (relative path), mixed under the voice. */
  sfxSrc?: string;
  /** Pictures by asset id, with composition-relative `src` (spec 26). */
  images?: ReelData['images'];
}

/** Font faces the reel needs, with the weights each file covers. */
export const REEL_FONT_FACES: readonly {
  family: string;
  weight: string;
  style: 'normal' | 'italic';
}[] = [
  { family: 'Inter', weight: '100 900', style: 'normal' },
  { family: 'Newsreader', weight: '200 800', style: 'normal' },
  { family: 'Playfair Display Italic', weight: '400 900', style: 'italic' },
  { family: 'Geist Mono', weight: '100 900', style: 'normal' },
];

const sec = (ms: number): string => (ms / 1000).toFixed(3).replace(/\.?0+$/, '') || '0';
const attr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const scriptJson = (v: unknown): string =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
const scriptText = (js: string): string => js.replace(/<\/script/gi, '<\\/script');

export function reelFontCss(fonts: Readonly<Record<string, string>>): string {
  return REEL_FONT_FACES.map((f) => {
    const b64 = fonts[f.family];
    if (typeof b64 !== 'string')
      throw new Error(`reel font missing: ${f.family} (run build:runtime)`);
    return `@font-face { font-family: '${f.family}'; src: url(data:font/woff2;base64,${b64}) format('woff2'); font-weight: ${f.weight}; font-style: ${f.style}; font-display: block; }`;
  }).join('\n');
}

export function compileReel(input: ReelCompileInput, assets: ReelCompileAssets): string {
  const plan = ReelPlanSchema.parse(input.plan);
  const { durationMs } = input;
  if (!Number.isInteger(durationMs) || durationMs <= 0)
    throw new Error('durationMs must be a positive integer');
  const out = input.out ?? { w: 1080, h: 1920 };
  const k = out.w / 720;
  const segments = input.segments?.length
    ? input.segments
    : [{ srcStartMs: 0, srcEndMs: durationMs }];
  let at = 0;
  const clips = segments.map((s, i) => {
    const dur = s.srcEndMs - s.srcStartMs;
    const el = `<video id="spk${i}" class="clip" data-start="${sec(at)}" data-duration="${sec(dur)}" data-media-start="${sec(s.srcStartMs)}" data-track-index="0" data-has-audio="true" playsinline src="${attr(input.videoSrc)}"></video>`;
    at += dur;
    return el;
  });
  const data: ReelData = {
    plan,
    words: [...input.words],
    durationMs,
    video: input.video,
    ...(input.images ? { images: input.images } : {}),
  };
  const sfx = input.sfxSrc
    ? `\n    <audio id="sfx" class="clip" data-start="0" data-duration="${sec(durationMs)}" data-track-index="2" data-volume="1" src="${attr(input.sfxSrc)}"></audio>`
    : '';
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
${reelFontCss(assets.fonts)}
  html, body { margin: 0; background: #000; }
  #reel-root { position: relative; width: ${out.w}px; height: ${out.h}px; overflow: hidden; background: #000; }
  #reel-stage { position: absolute; left: 0; top: 0; width: 720px; height: 1280px; transform: scale(${k}); transform-origin: 0 0; }
</style>
</head>
<body>
  <div id="reel-root" data-composition-id="reel" data-width="${out.w}" data-height="${out.h}" data-start="0" data-duration="${sec(durationMs)}" data-no-timeline>
    <div id="reel-stage"><div data-reel-vwrap>${clips.join('')}</div></div>${sfx}
  </div>
  <script>${scriptText(assets.hyperframesRuntimeJs)}</script>
  <script>window.__REEL__ = ${scriptJson(data)};</script>
  <script>${scriptText(assets.reelRuntimeJs)}</script>
</body>
</html>
`;
}

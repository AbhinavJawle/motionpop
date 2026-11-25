// Reel engine (spec 25): compiles a reel into one self-contained HyperFrames composition. The
// speaker video is a timed <video> clip per kept segment (its own audio); our runtime frames it
// and draws the scenes and captions from `hf-seek`.
import { cutsFromSegments } from './motion';
import { stageSizeForFormat } from './looks';
import type { Format, ReelPlan, ReelWord } from '@motionpop/schemas';
import { ReelPlanSchema } from '@motionpop/schemas';
import type { ReelData } from './mount';

export interface ReelCompileAssets {
  /** dist/reel-runtime.js */
  reelRuntimeJs: string;
  /** HyperFrames runtime IIFE (dist/hyperframe.runtime.iife.js). */
  hyperframesRuntimeJs: string;
  /** dist/reel-fonts.json: family → base64 woff2. */
  fonts: Readonly<Record<string, string>>;
  /** dist/reel-custom.js: the runtime of AI-written scenes (spec 30); needed when a plan has one. */
  reelCustomJs?: string;
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
  /** Speaker video path relative to the composition folder (absent for voiceover & graphics-only). */
  videoSrc?: string;
  /** Intrinsic dimensions of the speaker video (required when `videoSrc` is set). */
  video?: { w: number; h: number };
  /** Voiceover WAV path relative to the composition folder (used when `videoSrc` is absent). */
  voiceSrc?: string;
  /** Kept source ranges in order; default: the whole video. */
  segments?: readonly ReelSegment[];
  /** Stage aspect ratio (`9:16`, `16:9`, `1:1`). Defaults to `9:16`. */
  format?: Format;
  /** Output size; the logical stage is scaled to it. Defaults to 1080p for `format`. */
  out?: { w: number; h: number };
  /** True for transparent WebM (VP9 alpha) export — omits opaque canvas & scene backgrounds. */
  transparent?: boolean;
  /** Optional sound bed / SFX track (relative path), mixed under the voice. */
  sfxSrc?: string;
  /** The reel's levelled, ducked music (stereo WAV), relative to the composition (spec 27). */
  musicSrc?: string;
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
  const stage = stageSizeForFormat(input.format);
  const defaultOut =
    input.format === '16:9'
      ? { w: 1920, h: 1080 }
      : input.format === '1:1'
        ? { w: 1080, h: 1080 }
        : { w: 1080, h: 1920 };
  const out = input.out ?? defaultOut;
  const k = out.w / stage.w;
  const hasVideo = Boolean(input.videoSrc && input.video);
  const transparent = Boolean(input.transparent) && !hasVideo;
  const segments = input.segments?.length
    ? input.segments
    : [{ srcStartMs: 0, srcEndMs: durationMs }];
  let at = 0;
  const clips = hasVideo
    ? segments.map((s, i) => {
        const dur = s.srcEndMs - s.srcStartMs;
        const el = `<video id="spk${i}" class="clip" data-start="${sec(at)}" data-duration="${sec(dur)}" data-media-start="${sec(s.srcStartMs)}" data-track-index="0" data-has-audio="true" playsinline src="${attr(input.videoSrc!)}"></video>`;
        at += dur;
        return el;
      })
    : [];
  const data: ReelData = {
    plan,
    words: [...input.words],
    durationMs,
    ...(hasVideo && input.video ? { video: input.video } : {}),
    ...(input.format ? { format: input.format } : {}),
    ...(transparent ? { transparent: true } : {}),
    ...(input.images ? { images: input.images } : {}),
    cuts: hasVideo ? cutsFromSegments(segments) : [],
  };
  // AI-written scenes (spec 30) draw in their own frames, from the same documents as the editor.
  // The render container is the isolation here, so the frames are not sandboxed: the capture
  // then sees them in-process.
  if (plan.scenes.some((s) => s.content.template === 'custom')) {
    if (!assets.reelCustomJs) throw new Error('reel-custom.js missing (run build:runtime)');
    data.custom = { js: assets.reelCustomJs, fontCss: reelFontCss(assets.fonts) };
    data.customSandbox = false;
  }
  const voiceAudio =
    !hasVideo && input.voiceSrc
      ? `\n    <audio id="voice" class="clip" data-start="0" data-duration="${sec(durationMs)}" data-track-index="0" data-volume="1" src="${attr(input.voiceSrc)}"></audio>`
      : '';
  const sfx =
    voiceAudio +
    (input.sfxSrc
      ? `\n    <audio id="sfx" class="clip" data-start="0" data-duration="${sec(durationMs)}" data-track-index="2" data-volume="1" src="${attr(input.sfxSrc)}"></audio>`
      : '') +
    (input.musicSrc
      ? `\n    <audio id="music" class="clip" data-start="0" data-duration="${sec(durationMs)}" data-track-index="3" data-volume="1" src="${attr(input.musicSrc)}"></audio>`
      : '');
  const reelCsp =
    "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; " +
    "img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; " +
    "frame-src 'self'; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
  const rootBg = transparent ? 'transparent' : '#000';
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${attr(reelCsp)}">
<style>
${reelFontCss(assets.fonts)}
  html, body { margin: 0; background: ${rootBg}; }
  #reel-root { position: relative; width: ${out.w}px; height: ${out.h}px; overflow: hidden; background: ${rootBg}; }
  #reel-stage { position: absolute; left: 0; top: 0; width: ${stage.w}px; height: ${stage.h}px; transform: scale(${k}); transform-origin: 0 0; }
</style>
</head>
<body>
  <div id="reel-root" data-composition-id="reel" data-width="${out.w}" data-height="${out.h}" data-start="0" data-duration="${sec(durationMs)}" data-no-timeline>
    <div id="reel-stage"><div data-reel-vwrap${hasVideo ? '' : ' style="display:none"'}>${clips.join('')}</div></div>${sfx}
  </div>
  <script>${scriptText(assets.hyperframesRuntimeJs)}</script>
  <script>window.__REEL__ = ${scriptJson(data)};</script>
  <script>${scriptText(assets.reelRuntimeJs)}</script>
</body>
</html>
`;
}

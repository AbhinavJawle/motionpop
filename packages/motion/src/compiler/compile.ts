import { FORMATS } from '@motionpop/schemas';
import { fontFaceCss, primaryFamily } from '../fonts/font-faces';
import type { CompileInput, RuntimeProject } from './types';

export interface CompileAssets {
  /** Bundled Motionpop runtime (IIFE) – see scripts/build-runtime.ts. */
  runtimeJs: string;
  /** HyperFrames runtime IIFE from the pinned @hyperframes/core dist. */
  hyperframesRuntimeJs: string;
  /** Family → base64 woff2 (dist/fonts.json). Every family the pack names must be present. */
  fonts: Readonly<Record<string, string>>;
  /**
   * Static seeded texture tiles as data URLs (dist/textures.json). Required when the pack
   * uses grain or paper and the background mode is `style`.
   */
  textures?: Readonly<{ grain: string; paper: string }>;
}

/** Grain tile edge in frame pixels; the paper tile is twice that. */
export const GRAIN_TILE_PX = 256;

const sec = (ms: number): string => (ms / 1000).toFixed(3).replace(/\.?0+$/, '') || '0';

const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** JSON safe to embed inside a <script> element. */
const scriptJson = (v: unknown): string =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/** Inline script text can't contain a closing script tag. */
const scriptText = (js: string): string => js.replace(/<\/script/gi, '<\\/script');

/** Only data URLs are allowed in CSS `url()` here: compositions never touch the network. */
const cssDataUrl = (url: string, what: string): string => {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(url)) {
    throw new Error(`${what} must be a base64 PNG data URL`);
  }
  return `url(${url})`;
};

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

/**
 * Compiles a project into one self-contained HyperFrames composition (HTML string).
 * Layers, back to front: background colour, static texture (grain, paper, vignette),
 * voice, one `.clip` per slot, captions host. The HyperFrames runtime handles clip
 * visibility and the clock; our runtime renders each frame from `hf-seek`. Scripts are
 * inlined so the same HTML works as player `srcdoc` and as the producer's `index.html`.
 */
export function compileProject(input: CompileInput, assets: CompileAssets): string {
  const { durationMs, style } = input;
  const { width, height } = FORMATS[input.format];
  const background = input.background ?? 'style';
  if (!Number.isInteger(durationMs) || durationMs <= 0) {
    throw new Error('durationMs must be a positive integer');
  }
  for (const s of input.slots) {
    if (!Number.isInteger(s.startMs) || !Number.isInteger(s.endMs) || s.endMs <= s.startMs) {
      throw new Error(`slot ${s.id}: times must be integer ms with endMs > startMs`);
    }
  }
  const hand = 'hand' in style.fonts ? style.fonts.hand : undefined;
  const families = [
    style.fonts.display,
    style.fonts.body,
    style.fonts.mono,
    ...(hand ? [hand] : []),
  ];
  for (const family of new Set(families.map(primaryFamily))) {
    if (typeof assets.fonts[family] !== 'string') {
      throw new Error(`font data missing for "${family}" (run build:runtime and pass fonts.json)`);
    }
  }

  const project: RuntimeProject = {
    width,
    height,
    format: input.format,
    durationMs,
    style,
    mode: input.mode ?? 'preview',
    ...(input.seams === false ? { seams: false } : {}),
    ...(input.staging === false ? { staging: false } : {}),
    ...(input.film ? { film: true } : {}),
    ...(input.hasVideo ? { hasVideo: true } : {}),
    slots: input.slots,
    ...(input.energy ? { energy: input.energy } : {}),
    ...(input.captions && input.captions.groups.length ? { captions: input.captions } : {}),
    ...(input.images && Object.keys(input.images).length ? { images: input.images } : {}),
  };

  const hasVideo = Boolean(input.hasVideo);
  const opaque = background === 'style' && !hasVideo;
  const needsTiles = (opaque || hasVideo) && (style.texture.grain > 0 || style.texture.paper);
  if (needsTiles && !assets.textures) {
    throw new Error('texture tiles missing (run build:runtime and pass textures.json)');
  }
  const textureCss: string[] = [];
  let grainCss = false;
  if (needsTiles && assets.textures) {
    const grainOpacity = style.texture.grain;
    // Paper is a softer, larger tile at half the grain strength (spec 03 design, Texture).
    const paperOpacity = style.texture.paper ? Math.max(grainOpacity, 0.02) / 2 : 0;
    grainCss = grainOpacity > 0;
    if (grainOpacity > 0) {
      textureCss.push(
        `  .mp-grain { position: absolute; inset: 0; background-image: ${cssDataUrl(assets.textures.grain, 'grain tile')}; background-size: ${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px; opacity: ${fmt(grainOpacity)}; mix-blend-mode: multiply; }`,
      );
    }
    if (paperOpacity > 0) {
      textureCss.push(
        `  .mp-paper { position: absolute; inset: 0; background-image: ${cssDataUrl(assets.textures.paper, 'paper tile')}; background-size: ${GRAIN_TILE_PX * 2}px ${GRAIN_TILE_PX * 2}px; opacity: ${fmt(paperOpacity)}; mix-blend-mode: multiply; }`,
      );
    }
  }
  const vignette = opaque ? style.texture.vignette : 0;
  if (vignette > 0) {
    textureCss.push(
      `  .mp-vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgb(0 0 0 / 0) 55%, rgb(0 0 0 / ${fmt(vignette)}) 100%); }`,
    );
  }

  const layers: string[] = [];
  if (opaque) {
    layers.push('    <div class="mp-bg"></div>');
    layers.push('    <div id="mp-backdrop"></div>');
    const texture = [
      textureCss.some((c) => c.includes('.mp-paper')) ? '<div class="mp-paper"></div>' : '',
      textureCss.some((c) => c.includes('.mp-grain')) ? '<div class="mp-grain"></div>' : '',
      vignette > 0 ? '<div class="mp-vignette"></div>' : '',
    ].join('');
    if (texture) layers.push(`    <div class="mp-texture">${texture}</div>`);
  }
  if (input.voiceSrc) {
    layers.push(
      `    <audio id="voice" class="clip" data-start="0" data-duration="${sec(durationMs)}" data-track-index="0" data-volume="1" src="${escapeAttr(input.voiceSrc)}"></audio>`,
    );
  }
  if (input.bedSrc) {
    layers.push(
      `    <audio id="bed" class="clip" data-start="0" data-duration="${sec(durationMs)}" data-track-index="2" data-volume="1" src="${escapeAttr(input.bedSrc)}"></audio>`,
    );
  }
  // Film beats (spec 07b) may stay on screen past their slot to hand over to the next beat. The
  // clip is that much longer and gets a stacking order: in front of the next beat (`out`, it
  // leaves and reveals what is under it) or behind it (`in`, the next beat arrives over it).
  let z = 100;
  let anyTail = false;
  input.slots.forEach((s, i) => {
    const tail = Math.max(0, Math.min(s.tailMs ?? 0, durationMs - s.endMs));
    if (tail > 0) anyTail = true;
    const styleAttr = s.tailMs !== undefined || anyTail ? ` style="z-index:${z}"` : '';
    const isOverlay = hasVideo && s.placement === 'overlay';
    const isCutaway = hasVideo && !isOverlay;
    const anchor = s.overlayAnchor ?? 'top-right';
    const cls = isOverlay
      ? `clip mp-slot mp-slot-overlay mp-anchor-${escapeAttr(anchor)}`
      : isCutaway
        ? 'clip mp-slot mp-slot-cutaway'
        : 'clip mp-slot';
    const inner = isCutaway ? '<div class="mp-slot-bg"></div>' : '';
    layers.push(
      `    <div id="${escapeAttr(s.id)}" class="${cls}" data-start="${sec(s.startMs)}" data-duration="${sec(s.endMs - s.startMs + tail)}" data-track-index="${tail > 0 ? 10 + (i % 2) : 1}"${styleAttr}>${inner}</div>`,
    );
    z += tail > 0 && s.over !== 'in' ? -1 : 1;
  });
  if (opaque && input.film && grainCss)
    layers.push(
      '    <div class="mp-texture mp-texture-top"><div class="mp-grain" style="opacity:' +
        fmt(style.texture.grain * 0.6) +
        '"></div></div>',
    );
  if (opaque) layers.push('    <div id="mp-lens"></div>');
  layers.push('    <div id="mp-captions"></div>');

  const pageBg = opaque ? style.colors.bg : 'transparent';
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
${fontFaceCss(families, assets.fonts)}
  html, body { margin: 0; background: ${pageBg}; }
  #mp-root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: transparent; font-variant-numeric: lining-nums; }
  .mp-bg { position: absolute; inset: 0; background: ${style.colors.bg}; }
  .mp-texture { position: absolute; inset: 0; pointer-events: none; }
${textureCss.join('\n')}
  .mp-slot { position: absolute; inset: 0; }
  .mp-slot-bg { position: absolute; inset: 0; background: ${style.colors.bg}; z-index: 0; }
  .mp-slot-cutaway > .mp-cam { z-index: 1; }
  .mp-slot-overlay { pointer-events: none; }
  .mp-slot-overlay > .mp-cam { background: color-mix(in srgb, ${style.colors.bg} 86%, transparent); border: 2px solid color-mix(in srgb, ${style.colors.ink} 16%, transparent); border-radius: 28px; box-shadow: 0 24px 64px rgb(0 0 0 / 0.36); backdrop-filter: blur(14px); overflow: hidden; }
  .mp-anchor-top-right > .mp-cam { transform-origin: 96% 6%; scale: 0.44; }
  .mp-anchor-top-left > .mp-cam { transform-origin: 4% 6%; scale: 0.44; }
  .mp-anchor-side-right > .mp-cam { transform-origin: 96% 48%; scale: 0.48; }
  .mp-anchor-side-left > .mp-cam { transform-origin: 4% 48%; scale: 0.48; }
  .mp-anchor-lower-third > .mp-cam { transform-origin: 50% 92%; scale: 0.46; }
  .mp-anchor-center > .mp-cam { transform-origin: 50% 50%; scale: 0.62; }
  .mp-cam { position: absolute; inset: 0; transform-origin: 50% 50%; }
  .mp-slot-root { position: absolute; inset: 0; }
  .mp-texture-top { z-index: 9000; }
  #mp-lens { z-index: 9100; }
  #mp-captions { position: absolute; inset: 0; pointer-events: none; z-index: 9200; }
</style>
</head>
<body>
  <div id="mp-root" data-composition-id="motionpop" data-width="${width}" data-height="${height}" data-start="0" data-duration="${sec(durationMs)}">
${layers.join('\n')}
  </div>
  <script>${scriptText(assets.hyperframesRuntimeJs)}</script>
  <script>window.__MP_PROJECT__ = ${scriptJson(project)};</script>
  <script>${scriptText(assets.runtimeJs)}</script>
</body>
</html>
`;
}

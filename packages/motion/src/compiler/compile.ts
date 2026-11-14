import { fontFaceCss } from '../fonts/font-faces';
import type { CompileInput, RuntimeProject } from './types';

export interface CompileAssets {
  /** Bundled Motionpop runtime (IIFE) – see scripts/build-runtime.ts. */
  runtimeJs: string;
  /** HyperFrames runtime IIFE from the pinned @hyperframes/core dist. */
  hyperframesRuntimeJs: string;
  /** Family → base64 woff2 (dist/fonts.json). Missing → system fallback fonts. */
  fonts?: Readonly<Record<string, string>>;
}

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

/**
 * Compiles a project into one self-contained HyperFrames composition (HTML string).
 * One `.clip` per slot; the HyperFrames runtime handles clip visibility and the clock,
 * our runtime renders each frame from `hf-seek`. Scripts are inlined so the same HTML
 * works as player `srcdoc` and as the producer's `index.html`.
 */
export function compileProject(input: CompileInput, assets: CompileAssets): string {
  const { width, height, durationMs } = input;
  for (const s of input.slots) {
    if (!Number.isInteger(s.startMs) || !Number.isInteger(s.endMs) || s.endMs <= s.startMs) {
      throw new Error(`slot ${s.id}: times must be integer ms with endMs > startMs`);
    }
  }
  const project: RuntimeProject = {
    width,
    height,
    format: input.format,
    durationMs,
    style: input.style,
    mode: input.mode ?? 'preview',
    slots: input.slots,
  };

  const clips = input.slots
    .map(
      (s) =>
        `    <div id="${escapeAttr(s.id)}" class="clip mp-slot" data-start="${sec(s.startMs)}" data-duration="${sec(s.endMs - s.startMs)}" data-track-kind="graphics"></div>`,
    )
    .join('\n');
  const voice = input.voiceSrc
    ? `    <audio id="voice" class="clip" data-start="0" data-duration="${sec(durationMs)}" src="${escapeAttr(input.voiceSrc)}"></audio>\n`
    : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
${fontFaceCss([input.style.fonts.display, input.style.fonts.body, input.style.fonts.mono], assets.fonts ?? {})}
  html, body { margin: 0; background: ${input.style.colors.bg}; }
  #mp-root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: ${input.style.colors.bg}; }
  .mp-slot { position: absolute; inset: 0; }
</style>
</head>
<body>
  <div id="mp-root" data-composition-id="motionpop" data-width="${width}" data-height="${height}" data-start="0" data-duration="${sec(durationMs)}">
${voice}${clips}
  </div>
  <script>${scriptText(assets.hyperframesRuntimeJs)}</script>
  <script>window.__MP_PROJECT__ = ${scriptJson(project)};</script>
  <script>${scriptText(assets.runtimeJs)}</script>
</body>
</html>
`;
}

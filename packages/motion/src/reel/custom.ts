// AI-written reel scenes (spec 30). A `custom` scene is film-kit code the AI wrote for one scene.
// Generated code never runs in the page that mounts the reel: each custom scene is its own small
// document (this module builds it) inside an <iframe>, sandboxed (`allow-scripts`, an opaque
// origin) in the editor, and seeked from the reel clock by message. The export runs the very same
// document, so the preview is the export. Browser-safe; this module never runs generated code.
import type { Format, ReelLook, ReelScene, ReelTemplate, ReelTheme } from '@motionpop/schemas';
import { LOOKS, graphicArea, stageSizeForFormat, type LookTokens, type Palette } from './looks';
import { themedLook } from './theme';
import type { CriticSummary } from '../film/critic';
import type { ReelImage, Tpl } from './parts';

export type CustomContent = Extract<ReelTemplate, { template: 'custom' }>;

/** What the custom runtime (`dist/reel-custom.js`) and the font faces add to every frame. */
export interface ReelCustomAssets {
  /** dist/reel-custom.js */
  js: string;
  /** `@font-face` rules for the reel fonts (`reelFontCss`). */
  fontCss: string;
}

/** The scene as the custom runtime reads it (`window.__MP_SCENE__`). */
export interface ReelCustomScene {
  token: string;
  params: CustomContent;
  width: number;
  height: number;
  /** Full stage dimensions & aspect ratio for `--u` and responsive kit layouts. */
  frameWidth?: number;
  frameHeight?: number;
  format?: Format;
  /** True when rendering with transparent alpha background (hides `.mp-backdrop` layers). */
  transparent?: boolean;
  durationMs: number;
  seed: number;
  look: { id: string; sans: string; serif: string; mono: string; upper: boolean };
  palette: Palette;
  /** The scene's spoken words, times from the scene start. */
  words: { text: string; startMs: number; endMs: number }[];
  /** Pictures the code may show with `mp.image(id)` (data URLs in the editor). */
  images: Record<string, ReelImage>;
}

/** Message the reel sends a custom frame, and the frame's replies. */
export interface CustomSeekMessage {
  mpReel: string;
  seek: number;
  ms: number;
}
/** Asks the frame to review its graphic (the film critic, run inside the frame). */
export interface CustomInspectMessage {
  mpReel: string;
  inspect: number;
  /** Figures the graphic may show, as plain digits. */
  allowNumbers?: string[];
}
export interface CustomReplyMessage {
  mpReel: string;
  ready?: true;
  ack?: number;
  /** The graphic failed to build: the frame shows nothing. */
  error?: string;
  /** A seek threw (the frame keeps its last good drawing). */
  seekError?: string;
  /** The answer to an inspect message. */
  inspected?: number;
  report?: CustomReport;
}

/** What the frame's review found: the critic's summary and every script error it saw. */
export interface CustomReport {
  summary: CriticSummary | null;
  errors: string[];
}

const scriptJson = (v: unknown): string =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
const scriptText = (js: string): string => js.replace(/<\/script/gi, '<\\/script');

/**
 * The sandboxed document's policy (security-and-cost.md: strict CSP, no network): inline code
 * only (the kit runs the scene with `new Function`), fonts and pictures from data URLs, nothing
 * fetched. The lint and the blocked globals are not a boundary; this is.
 */
export const REEL_CUSTOM_CSP =
  "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; " +
  "font-src data:; img-src data: blob:; media-src 'none'; connect-src 'none'; " +
  "form-action 'none'; base-uri 'none'";

/**
 * Policy for export frames (rendered inside Cloud Run): allows `'self'` for composition-relative
 * images/fonts served from 127.0.0.1 while blocking all external network egress (`connect-src 'none'`).
 */
export const REEL_CUSTOM_EXPORT_CSP =
  "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; " +
  "font-src 'self' data:; img-src 'self' data: blob:; media-src 'none'; connect-src 'none'; " +
  "form-action 'none'; base-uri 'none'";

/**
 * The document of one custom scene. Always embeds a strict CSP: editor sandboxed frames use
 * `REEL_CUSTOM_CSP`; export frames use `REEL_CUSTOM_EXPORT_CSP` so composition-relative assets
 * load while outbound network requests remain blocked.
 */
export function reelCustomDoc(
  scene: ReelCustomScene,
  assets: ReelCustomAssets,
  opts: { csp?: boolean } = {},
): string {
  const cspValue = opts.csp ? REEL_CUSTOM_CSP : REEL_CUSTOM_EXPORT_CSP;
  const policy = `<meta http-equiv="Content-Security-Policy" content="${cspValue}">\n`;
  return `<!doctype html>
<html>
<head>
${policy}<meta charset="utf-8">
<style>
${assets.fontCss}
  html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
  #mp-scene { position: relative; width: ${scene.width}px; height: ${scene.height}px; overflow: hidden; }
  #mp-scene[data-transparent="true"] .mp-backdrop, #mp-scene[data-transparent="true"] [data-backdrop] { display: none !important; }
</style>
</head>
<body>
  <div id="mp-scene"${scene.transparent ? ' data-transparent="true"' : ''}></div>
  <script>window.__MP_ALLOW_CUSTOM__ = true; window.__MP_SCENE__ = ${scriptJson(scene)};</script>
  <script>${scriptText(assets.js)}</script>
</body>
</html>
`;
}

/** A small stable seed from the scene id (the kit's hand-drawn marks and noise). */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

let tokens = 0;

export interface CustomFrame extends Tpl {
  /** Resolves when the frame has built its graphic (or failed: it then shows nothing). */
  ready: Promise<void>;
  /** Resolves when the frame has drawn the last seek it was sent. */
  drawn(): Promise<void>;
  /** Why the graphic failed to build or answer, or the first error a seek threw; else null. */
  error(): string | null;
  /** Why the graphic is not showing (it failed to build, or has not answered yet); else null. */
  buildError(): string | null;
  /** Runs the film critic inside the frame (null when the frame failed or didn't answer). */
  inspect(opts?: { allowNumbers?: string[] }): Promise<CustomReport | null>;
  destroy(): void;
}

/**
 * The template for a custom scene: an <iframe> that shows the scene's document and follows the
 * reel clock. `sandbox` true (the editor) keeps the code in an opaque origin; the export renders
 * in its own isolated container and leaves it off so the capture sees the frame in-process.
 */
export function customFrame(opts: {
  doc: Document;
  scene: Omit<ReelCustomScene, 'token'>;
  assets: ReelCustomAssets;
  startMs: number;
  sandbox: boolean;
  /** Longest wait for the frame to answer before the reel moves on (ms). */
  timeoutMs?: number;
}): CustomFrame {
  const { doc, startMs } = opts;
  const token = `mpr-${seedOf(opts.scene.params.title)}-${++tokens}`;
  const el = doc.createElement('div');
  el.style.cssText = `position:absolute;left:0;top:0;width:${opts.scene.width}px;height:${opts.scene.height}px;pointer-events:none;`;
  const frame = doc.createElement('iframe');
  // Scripts only: no same-origin, so the generated code can't reach the app, its storage or its
  // cookies. Never add `allow-same-origin` here.
  if (opts.sandbox) frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.setAttribute('data-reel-custom', opts.scene.params.title);
  frame.style.cssText = `position:absolute;left:0;top:0;width:${opts.scene.width}px;height:${opts.scene.height}px;border:0;background:transparent;pointer-events:none;`;
  frame.srcdoc = reelCustomDoc({ ...opts.scene, token }, opts.assets, { csp: opts.sandbox });
  el.append(frame);

  const timeoutMs = opts.timeoutMs ?? 4000;
  const view = doc.defaultView;
  let seq = 0;
  let acked = 0;
  let failed = false;
  /** True while `failed` only means "no answer in time": a late `ready` still brings it back. */
  let timedOut = false;
  let failure: string | null = null;
  let seekError: string | null = null;
  let isReady = false;
  let pendingMs: number | null = null;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => {
    resolveReady = r;
  });
  const waiters: { id: number; done: () => void; timer?: number }[] = [];
  const reports = new Map<number, (r: CustomReport | null) => void>();
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number): number | undefined => {
    if (!view) return undefined;
    const t = view.setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };
  const cancel = (t: number | undefined) => {
    if (t === undefined) return;
    view?.clearTimeout(t);
    timers.delete(t);
  };
  let inspectSeq = 0;
  const flushReports = () => {
    const pending = [...reports.values()];
    reports.clear();
    for (const done of pending) done(null);
  };
  const settle = () => {
    if (failed) flushReports();
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i]!;
      if (failed || w.id <= acked) {
        waiters.splice(i, 1);
        cancel(w.timer);
        w.done();
      }
    }
  };
  const post = (ms: number) => {
    const win = frame.contentWindow;
    if (!win) return;
    const msg: CustomSeekMessage = { mpReel: token, seek: ++seq, ms };
    // The frame's origin is opaque: '*' is the only target that reaches it. The payload is a time.
    win.postMessage(msg, '*');
  };
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow) return;
    const d = e.data as Partial<CustomReplyMessage> | null;
    if (!d || d.mpReel !== token) return;
    if (typeof d.seekError === 'string' && seekError === null) seekError = d.seekError;
    if (typeof d.inspected === 'number') {
      const done = reports.get(d.inspected);
      reports.delete(d.inspected);
      done?.(d.report ?? null);
    }
    if (d.error) {
      failed = true;
      timedOut = false;
      failure = d.error;
      isReady = true;
      resolveReady();
      settle();
      return;
    }
    if (d.ready) {
      // A slow start (a cold render container, many frames at once) recovers: the reel gave up
      // waiting, not on the graphic.
      if (timedOut) {
        failed = false;
        timedOut = false;
        failure = null;
      }
      isReady = true;
      resolveReady();
      if (pendingMs !== null) post(pendingMs);
    }
    if (typeof d.ack === 'number') {
      acked = Math.max(acked, d.ack);
      settle();
    }
  };
  view?.addEventListener('message', onMessage);
  // A frame that never answers (a hang in generated code) must not hold the reel: give up on it.
  const giveUp = later(() => {
    if (!isReady) {
      failed = true;
      timedOut = true;
      failure = 'the graphic did not start in time';
      isReady = true;
      resolveReady();
      settle();
    }
  }, timeoutMs);

  return {
    el,
    ready,
    seek(t: number) {
      const ms = Math.max(0, Math.round(t - startMs));
      pendingMs = ms;
      if (isReady && !failed) post(ms);
    },
    drawn() {
      if (failed || !isReady) return isReady ? Promise.resolve() : ready;
      if (acked >= seq) return Promise.resolve();
      const id = seq;
      return new Promise<void>((done) => {
        const w: { id: number; done: () => void; timer?: number } = { id, done };
        waiters.push(w);
        w.timer = later(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) {
            waiters.splice(i, 1);
            done();
          }
        }, timeoutMs);
      });
    },
    error() {
      return failure ?? seekError;
    },
    buildError() {
      return failed ? failure : null;
    },
    async inspect(o = {}) {
      await ready;
      const win = frame.contentWindow;
      if (failed || !win) return null;
      const id = ++inspectSeq;
      return new Promise<CustomReport | null>((done) => {
        const t = later(() => {
          if (reports.delete(id)) done(null);
        }, timeoutMs * 2);
        // The answer clears its own timer.
        reports.set(id, (r) => {
          cancel(t);
          done(r);
        });
        const msg: CustomInspectMessage = {
          mpReel: token,
          inspect: id,
          ...(o.allowNumbers ? { allowNumbers: o.allowNumbers } : {}),
        };
        win.postMessage(msg, '*');
      });
    },
    destroy() {
      view?.removeEventListener('message', onMessage);
      cancel(giveUp);
      for (const t of [...timers]) cancel(t);
      for (const w of waiters.splice(0)) w.done();
      flushReports();
      frame.remove();
    },
  };
}

/** The scene's palette and look as the custom runtime needs them. */
export function customLook(look: LookTokens): ReelCustomScene['look'] {
  return { id: look.id, sans: look.sans, serif: look.serif, mono: look.mono, upper: look.upper };
}

/**
 * Everything an AI-written scene's document needs, from the reel: the graphic area of its layout,
 * its palette, its spoken words (times from the scene start) and its pictures by `m0`, `m1`… (its
 * `media` order; `pictures` maps stored asset ids to pictures). The preview, the export and the
 * check before a new graphic is applied all build the scene with this, so they agree.
 */
export function reelCustomScene(o: {
  look: ReelLook;
  /** The reel's colour theme (spec 37), so a new graphic wears it too. */
  theme?: ReelTheme | undefined;
  format?: Format | undefined;
  noVideo?: boolean | undefined;
  captions?: boolean | undefined;
  transparent?: boolean | undefined;
  scene: ReelScene;
  words: readonly { text: string; startMs: number; endMs: number }[];
  pictures: Readonly<Record<string, ReelImage>>;
}): Omit<ReelCustomScene, 'token'> | null {
  const s = o.scene;
  if (s.content.template !== 'custom') return null;
  const look = themedLook(LOOKS[o.look], o.theme);
  const stage = stageSizeForFormat(o.format);
  const area = graphicArea(look, s.layout, stage, {
    ...(o.noVideo !== undefined ? { noVideo: o.noVideo } : {}),
    ...(o.captions !== undefined ? { captions: o.captions } : {}),
  });
  const images: Record<string, ReelImage> = {};
  (s.content.media ?? []).forEach((m, i) => {
    const pic = m.asset ? o.pictures[m.asset] : undefined;
    if (pic) images[`m${i}`] = pic;
  });
  return {
    params: s.content,
    width: area.w,
    height: area.h,
    frameWidth: stage.w,
    frameHeight: stage.h,
    format: o.format ?? '9:16',
    ...(o.transparent ? { transparent: true } : {}),
    durationMs: s.endMs - s.startMs,
    seed: seedOf(s.id),
    look: customLook(look),
    palette: look.palettes[s.bg ?? look.defaultBg],
    words: o.words
      .filter((w) => w.startMs >= s.startMs && w.startMs < s.endMs)
      .map((w) => ({ text: w.text, startMs: w.startMs - s.startMs, endMs: w.endMs - s.startMs })),
    images,
  };
}

/**
 * Builds an AI-written scene off screen in a sandboxed frame and reviews it with the film critic
 * (spec 30): did it build, did any seek throw, does its text fit and read. The editor runs this
 * before a new graphic lands. Never returns generated code into the page; only the report.
 */
export async function inspectCustomScene(o: {
  doc: Document;
  scene: Omit<ReelCustomScene, 'token'>;
  assets: ReelCustomAssets;
  allowNumbers?: string[];
  timeoutMs?: number;
}): Promise<CustomReport> {
  const f = customFrame({
    doc: o.doc,
    scene: o.scene,
    assets: o.assets,
    startMs: 0,
    sandbox: true,
    timeoutMs: o.timeoutMs ?? 8000,
  });
  // Laid out at its real size (the critic measures it), off screen and out of the way.
  f.el.style.cssText += 'position:fixed;left:-100000px;top:0;visibility:hidden;';
  o.doc.body.append(f.el);
  try {
    await f.ready;
    const built = f.error();
    if (built) return { summary: null, errors: [built] };
    const report = await f.inspect(o.allowNumbers ? { allowNumbers: o.allowNumbers } : {});
    if (!report) return { summary: null, errors: [f.error() ?? 'the graphic did not answer'] };
    return report;
  } finally {
    f.destroy();
    f.el.remove();
  }
}

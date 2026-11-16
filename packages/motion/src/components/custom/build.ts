import { fontStack } from '../../fonts/font-faces';
import type { BuildContext, Composition } from '../../contract';
import { customHelpers } from './helpers';
import { lintCustom } from './lint';
import type { CustomParams } from './params';

/**
 * Globals a generated script sees as `undefined` (spec 15 design §1). A determinism guard, not a
 * security boundary: that is the opaque sandbox. `eval` can't be a parameter name in strict code;
 * the lint rejects it instead.
 */
export const BLOCKED_GLOBALS = [
  'window',
  'document',
  'globalThis',
  'self',
  'parent',
  'top',
  'frames',
  'opener',
  'Date',
  'performance',
  'crypto',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'queueMicrotask',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'Function',
  'Worker',
  'importScripts',
] as const;

/** `Math` without `random`. */
const SAFE_MATH: Readonly<Record<string, unknown>> = Object.freeze(
  Object.fromEntries(
    Object.getOwnPropertyNames(Math)
      .filter((k) => k !== 'random')
      .map((k) => [k, (Math as unknown as Record<string, unknown>)[k]]),
  ),
);

/**
 * The flag the composition runtime sets inside its sandbox. The app never sets it, so generated
 * code can't run in the app's own origin (an off-screen layout check, a thumbnail) by accident.
 */
export const CUSTOM_ALLOW_FLAG = '__MP_ALLOW_CUSTOM__';

/** Prefixes every selector with the graphic's scope class; `:root`, `html`, `body` become it. */
export function scopeCss(css: string, scope: string): string {
  return css.replace(/(^|})\s*([^{}]+)\{/g, (_m, close: string, selectors: string) => {
    const scoped = selectors
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) =>
        /^(:root|html|body)$/.test(s)
          ? `.${scope}`
          : `.${scope} ${s.replace(/^(:root|html|body)\s+/, '')}`,
      )
      .join(', ');
    return `${close}\n${scoped} {`;
  });
}

/**
 * Runs a generated script body with the blocked globals shadowed and `Math` without `random`.
 * No lint here: `buildCustom` lints first. Exported for the guard's own test.
 */
export function runScript(script: string, stage: HTMLElement, scriptCtx: unknown): unknown {
  // Generated code, linted, run inside the composition sandbox only: the point of tier 2 (spec 15).
  const factory = new Function(
    'root',
    'ctx',
    'mp',
    'Math',
    ...BLOCKED_GLOBALS,
    `"use strict";\n${script}`,
  ) as (...args: unknown[]) => unknown;
  return factory(
    stage,
    scriptCtx,
    customHelpers(stage),
    SAFE_MATH,
    ...BLOCKED_GLOBALS.map(() => undefined),
  );
}

export function buildCustom(ctx: BuildContext, p: CustomParams): Composition {
  const g = globalThis as unknown as Record<string, unknown>;
  if (g[CUSTOM_ALLOW_FLAG] !== true) {
    throw new Error('custom graphics only run inside the composition sandbox');
  }
  const problems = lintCustom(p);
  if (problems.length > 0) throw new Error(`custom graphic rejected: ${problems.join('; ')}`);

  const scope = `mpc-${(ctx.seed >>> 0).toString(36)}`;
  const doc = ctx.root.ownerDocument;
  const wrap = doc.createElement('div');
  wrap.className = scope;
  const { colors, fonts } = ctx.style;
  wrap.style.cssText = [
    'position:absolute',
    'inset:0',
    'overflow:hidden',
    // 1 % of the frame's short side: sizes in calc(var(--u) * N) read the same in every format.
    `--u:${Math.min(ctx.width, ctx.height) / 100}px`,
    `--bg:${colors.bg}`,
    `--ink:${colors.ink}`,
    `--muted:${colors.muted}`,
    `--accent:${colors.accent}`,
    `--accent2:${colors.accent2}`,
    `--highlight:${colors.highlight}`,
    `--display:${fontStack(fonts.display)}`,
    `--body:${fontStack(fonts.body)}`,
    `color:${colors.ink}`,
    `font-family:${fontStack(fonts.body)}`,
  ].join(';');
  const style = doc.createElement('style');
  style.textContent = scopeCss(p.css, scope);
  wrap.append(style);
  const stage = doc.createElement('div');
  stage.style.cssText = 'position:absolute;inset:0;';
  // Markup comes from the model: it passed the lint (no scripts, handlers or external URLs), and
  // it lands inside the sandboxed composition only.
  stage.innerHTML = p.html;
  wrap.append(stage);
  ctx.root.append(wrap);

  const words = (ctx as BuildContext & { words?: { startMs: number; endMs: number }[] }).words;
  const scriptCtx = Object.freeze({
    width: ctx.width,
    height: ctx.height,
    format: ctx.format,
    durationMs: ctx.durationMs,
    keyMomentMs: ctx.keyMomentMs,
    seed: ctx.seed,
    colors: Object.freeze({ ...colors, chart: Object.freeze([...colors.chart]) }),
    fonts: Object.freeze({ display: fontStack(fonts.display), body: fontStack(fonts.body) }),
    words: Object.freeze((words ?? []).map((w) => Object.freeze({ ...w }))),
  });
  const made = runScript(p.script, stage, scriptCtx);
  const seekFn =
    made && typeof made === 'object' && typeof (made as { seek?: unknown }).seek === 'function'
      ? ((made as { seek: (t: number) => void }).seek.bind(made) as (t: number) => void)
      : null;
  if (!seekFn) throw new Error('custom graphic must return { seek(tMs) }');

  // Every seek starts from the state the script left after setup. A style write the browser
  // rejects (NaN, a unit it can't parse) keeps the old value, which would make the frame depend on
  // the seeks before it; restoring `style` and `class` first keeps seek a pure function of time.
  const initial = [stage, ...Array.from(stage.querySelectorAll('*'))].map(
    (el) => [el, el.getAttribute('style'), el.getAttribute('class')] as const,
  );
  const reset = () => {
    for (const [el, style, cls] of initial) {
      if (el.getAttribute('style') !== style) {
        if (style === null) el.removeAttribute('style');
        else el.setAttribute('style', style);
      }
      if (el.getAttribute('class') !== cls) {
        if (cls === null) el.removeAttribute('class');
        else el.setAttribute('class', cls);
      }
    }
  };

  return {
    durationMs: ctx.durationMs,
    seek: (tMs: number) => {
      reset();
      seekFn(Math.min(Math.max(tMs, 0), ctx.durationMs));
    },
    dispose: () => wrap.remove(),
  };
}

import type { CustomParams } from './params';

/**
 * Static checks on generated code (spec 15 R2.2, security-and-cost.md). They keep the code a pure
 * function of time and away from the network. They are not the security boundary: string checks
 * can be dodged, so generated code only ever runs in an opaque-origin sandbox (R3.2) or the render
 * container, and the build refuses to run anywhere else (see `build.ts`).
 */
const SCRIPT_RULES: ReadonlyArray<[RegExp, string]> = [
  [/\bDate\b/, 'uses Date (the clock)'],
  [/\bperformance\b/, 'uses performance (the clock)'],
  [/Math\s*\.\s*random|\bcrypto\b/, 'uses randomness; use mp.rng(seed)'],
  [/\b(setTimeout|setInterval|setImmediate|queueMicrotask)\b/, 'uses timers'],
  [/\b(requestAnimationFrame|cancelAnimationFrame)\b/, 'uses animation frames; draw in seek(t)'],
  [/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/, 'uses the network'],
  [/\bimport\s*\(|\bimport\s+[\w{*]|\brequire\s*\(/, 'imports code'],
  [/\b(eval|Function)\b/, 'evaluates strings as code'],
  [/\b(localStorage|sessionStorage|indexedDB|caches|document\.cookie)\b/, 'uses storage'],
  [
    /\b(window|globalThis|self|parent|top|frames|opener|document|navigator|location)\b/,
    'reaches outside its root',
  ],
  [/\b(ownerDocument|defaultView|constructor|__proto__|prototype)\b/, 'reaches outside its root'],
  [/\b(gsap|TweenMax|TimelineMax)\b/i, 'uses GSAP (not allowed)'],
  [/\b(addEventListener|onclick|onload)\b/, 'listens to events; draw in seek(t)'],
  [/\.animate\s*\(/, 'uses the Web Animations API; draw in seek(t)'],
];

const MARKUP_RULES: ReadonlyArray<[RegExp, string]> = [
  [/<\s*(script|iframe|object|embed|link|meta|base|form|style)\b/i, 'has a forbidden tag'],
  [/\son\w+\s*=/i, 'has an inline event handler'],
  [
    /(src|href|xlink:href)\s*=\s*["']?\s*(https?:|\/\/|data:text|javascript:)/i,
    'loads an external URL',
  ],
];

const CSS_RULES: ReadonlyArray<[RegExp, string]> = [
  [/@/, 'has an @-rule (no @keyframes, @import, @font-face or @media)'],
  [
    /\b(animation|transition)(-[\w-]+)?\s*:/i,
    'uses CSS animation or transition; move it in seek(t)',
  ],
  [/url\s*\(/i, 'loads a URL'],
  [/expression\s*\(|behavior\s*:/i, 'uses scripted CSS'],
];

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const stripStrings = (s: string) => s.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');

export function lintCustom(p: Pick<CustomParams, 'html' | 'css' | 'script'>): string[] {
  const out: string[] = [];
  const script = stripComments(p.script);
  // Rules that name identifiers look at code, not text inside strings ("Date" in a label is fine),
  // except the ones that matter inside strings too (network and code evaluation).
  const code = stripStrings(script);
  for (const [re, msg] of SCRIPT_RULES) {
    if (re.test(code)) out.push(`script ${msg}`);
  }
  if (/(https?:)?\/\/[\w.-]+\.[a-z]{2,}/i.test(script)) out.push('script loads an external URL');
  if (!/\bseek\b/.test(code) || !/\breturn\b/.test(code))
    out.push('script must return { seek(tMs) }');
  for (const [re, msg] of MARKUP_RULES) if (re.test(p.html)) out.push(`html ${msg}`);
  const css = stripComments(p.css);
  for (const [re, msg] of CSS_RULES) if (re.test(css)) out.push(`css ${msg}`);
  return [...new Set(out)];
}

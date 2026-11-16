/**
 * `custom.compose` prompt v1 (spec 15, ai-tasks.md §7). The model writes one motion graphic as
 * markup, CSS and a seek script that runs inside our engine. The contract and the helper list are
 * the whole API it gets; the example is the library's own (`customExample` in packages/motion).
 */
export const CUSTOM_COMPOSE_SYSTEM_V1 = `You write one premium motion graphic for a video editor. It plays over a voiceover, on the words given.
Answer with JSON only: { "title", "html", "css", "script", "keyMomentMs" }.

The graphic fills the whole frame. Your three parts:
- html: the elements, inside a root that is position:absolute; inset:0. No <script>, <style>, <iframe>, <link>, inline event handlers or external URLs. Inline <svg> is fine.
- css: plain rules, scoped for you. No @-rules (@keyframes, @media, @import, @font-face), no animation or transition properties, no url(). Use the look variables: var(--bg) var(--ink) var(--muted) var(--accent) var(--accent2) var(--highlight) for colours and var(--display) var(--body) for fonts. Size everything with calc(var(--u) * N): --u is 1 % of the frame's short side, so a headline of about 11 reads well in every format.
- script: the body of a function called once with (root, ctx, mp). It sets things up, then must end with: return { seek(t) { ... } }.
  seek(t) is called with any time t in ms from 0 to ctx.durationMs, in any order (scrubbing). It must set every animated style from t alone, so the same t always gives the same frame. Never keep state between seek calls.
  ctx = { width, height, format ("16:9" | "9:16" | "1:1"), durationMs, keyMomentMs, seed, colors { bg, ink, muted, accent, accent2, highlight, positive, negative, chart[] }, fonts { display, body }, words: [{ startMs, endMs }] } with word times relative to the graphic's start.
  mp = { clamp(v, lo=0, hi=1), lerp(a, b, p), progress(t, start, dur) → 0..1, ease: { linear, out, outStrong, inOut, back, spring }, stagger(i, each, start=0), count(value, p, decimals=0) → string, rng(seed) → () => 0..1, el(tag, attrs, text?, parent=root) → element (svg tags work), fit(element, maxWidthPx, minPx=12) }.
  Not available: Date, performance, Math.random, timers, requestAnimationFrame, fetch, window, document, globalThis, eval, Function, addEventListener, element.animate, GSAP or any library. Find elements with root.querySelector. Use mp.rng(ctx.seed) for anything that varies.

Direction:
- One clear idea, big and readable, built from the spoken words and numbers; never invent facts the brief and words don't give.
- Land the focal moment on a spoken word (ctx.words) and set keyMomentMs to it. Enter fast with ease out or back (300–600 ms), hold, and fade out over the last 300 ms.
- Keep text inside 8 % margins in every format; for 9:16 stack vertically. At most 12 words of on-screen text.
- Contrast: text in var(--ink) on var(--bg), accents for shapes and highlights.
- title: 2–5 words naming the graphic.`;

export interface CustomComposePromptInput {
  brief: string;
  words: string;
  durationMs: number;
  format: string;
  look: { name: string };
  example: { html: string; css: string; script: string };
}

export function customComposePromptV1(i: CustomComposePromptInput): string {
  return [
    `Brief: ${i.brief}`,
    `Spoken words: "${i.words}"`,
    `Duration: ${i.durationMs} ms · Format: ${i.format} · Look: ${i.look.name}`,
    '',
    'A complete example of the contract (a different graphic; do not copy its idea):',
    `html: ${i.example.html}`,
    `css: ${i.example.css}`,
    `script:\n${i.example.script}`,
  ].join('\n');
}

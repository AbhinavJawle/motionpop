# Design: 03 motion engine

## Packages
| Package | Adds |
|---|---|
| `packages/schemas` | `style.ts`: `StylePackSchema`, `StylePack` |
| `packages/motion/src/core` | `rng.ts`, `stagger.ts`, `timeline.ts`, `split-text.ts`, `path-draw.ts`, `fit-text.ts`, `camera.ts`, `safe-area.ts` |
| `packages/motion/src/styles` | `editorial-explainer.json`, `index.ts` (parsed with zod at import) |
| `packages/motion/src/fonts` | bundled woff2 + `font-faces.ts` (data-URL `@font-face` CSS per family) |
| `packages/motion/src/compiler` | formats, fonts, background/texture layers |
| `packages/motion/src/runtime` | fonts gate, per-slot error isolation, `__motionpop` API |
| `packages/motion/scripts` | `check.ts` (motion:check), `parity.ts` |

## Core APIs (all pure)
```ts
// rng.ts
mulberry32(seed: number): () => number          // [0, 1)
rngFor(seed: number, key: string): () => number // stable sub-streams (hash key into seed)

// stagger.ts
stagger(i: number, n: number, stepMs: number, from?: "start" | "end" | "center"): number // offset ms

// timeline.ts: keyframed tracks, evaluated at t
type Key = { t: number; v: number; ease?: EaseName };
track(keys: Key[]): (tMs: number) => number      // holds first/last value outside the range
// convenience: enter(tMs, startMs, durMs, from, to, ease) = tween(...)

// split-text.ts
splitText(el: HTMLElement, text: string, by: "word" | "char"): HTMLSpanElement[] // builds spans once (build time)

// path-draw.ts
pathDraw(path: SVGPathElement, progress: number): void  // dasharray = length, dashoffset = length*(1-p)
// length measured once at build with getTotalLength(), cached on the element

// fit-text.ts
fitText(el: HTMLElement, box: { width: number; height: number }, opts: { max: number; min: number; lineHeight?: number; maxLines?: number })
  → { size: number; truncated: boolean }
// binary search on font-size against scrollWidth/scrollHeight; at min size, truncate words + "…" and set truncated

// camera.ts
pushIn(tMs, durMs, amount = 1.05): number          // scale 1 → amount, inOutSine over the slot

// safe-area.ts
safeArea(format, width, height): { x; y; width; height } // 5 % margins (16:9, 1:1); 9:16 uses platform zones (top 12 %, bottom 20 %, sides 6 %)
```
Measurement (`getTotalLength`, `fitText`) happens only at build; `seek` only reads cached numbers and writes styles.

## StylePack schema
Exactly `style-pack-format.md`. `colors.chart` length ≥ 3. Eases are `EaseName` from `core/ease.ts`. `BuildContext.style: StylePack`. Components use `style.colors.*`, `style.fonts.*`, `style.motion.*`; never literals.

## Fonts
- Geist + Geist Mono woff2 (OFL, from the `geist` package already in `apps/web`) copied into `packages/motion/src/fonts/` by `build:runtime`; `font-faces.ts` returns `@font-face` CSS with base64 data URLs for the families a pack uses (weights 400/500/600).
- The compiler injects that CSS into the composition `<style>`. ~200 KB per composition is acceptable (preview is local, render is server-side).

## Composition shape (v1)
```html
<div id="mp-root" data-composition-id="motionpop" data-width="1920" data-height="1080" data-duration="18">
  <div class="mp-bg"></div>               <!-- style.colors.bg -->
  <div class="mp-texture"></div>          <!-- deterministic grain (seeded SVG turbulence, fixed seed) + vignette -->
  <audio id="voice" class="clip" …></audio>
  <div class="clip mp-slot" id="slot-1" data-start="4.2" data-duration="3.6" data-track-index="1"></div>
  <div id="mp-captions"></div>            <!-- filled in spec 12 -->
</div>
```
Formats: `{ "16:9": [1920,1080], "9:16": [1080,1920], "1:1": [1080,1080] }`. Preview may scale down; components always lay out in frame pixels.

## Runtime v1
```ts
window.__motionpop = { ready: Promise<void>, seek(tMs), errors: SlotError[] };
await document.fonts.ready; build every slot inside try/catch (failure → placeholder div "Couldn't render" + errors.push);
hf-seek → seek(Math.round(time*1000)); each slot seek wrapped in try/catch.
```

## motion:check
- `pnpm motion:check <id>` → `tsx packages/motion/scripts/check.ts <id>`.
- For each format in `component.formats` × params set (`defaults`, 4 seeded random samples from a per-component arbitrary in `components/<id>/samples.ts`, edge cases from the same file) × times (0 %, key moment, 90 %):
  - compile a one-slot project (editorial-explainer), load it in headless Chrome (Puppeteer from the producer's install), `await __motionpop.ready`, `seek(t)`, screenshot.
  - Collect boxes of `[data-text]` elements and `[data-focal]`; assert inside `safeArea`, pairwise no overlap (> 2 px intersection), contrast of text colour vs `style.colors.bg` ≥ 4.5, focal opacity ≥ 0.9 and fully inside the frame at the key moment.
- Output: `packages/motion/.check/<id>/<format>-<sample>-<pct>.png` + `report.json`; `.check/` is gitignored. Exit 1 on failures (listed per still).

## Parity
`scripts/parity.ts`: compile a fixture project, (a) screenshot runtime seeks at 5 timestamps in Chrome, (b) render with `@hyperframes/producer` and extract the same frames with ffmpeg, (c) compare with a per-pixel mean absolute difference; fail above 2 % (video compression noise allowed).

## Testing
- **Property [kiro]:** rng determinism and range; stagger monotonic and bounded; `track` holds endpoints and is continuous at keys; `countAt` lands exactly.
- **Property [kiro]:** `fitText` (happy-dom stub measuring by char count) never reports a size outside [min, max] and never overflows when `truncated` is false.
- **Property:** big-number layout: for random params and every format, every `[data-text]` box is inside the safe area (run inside motion:check, real Chrome).
- **Unit:** StylePack schema accepts the reference pack and rejects bad colours; compiler emits correct sizes per format and `@font-face` rules; runtime isolates a throwing component.

## Correctness properties
1. `seek(t)` determinism for every core function and component (same t → same output, order independent).
2. Text never leaves the safe area silently (fit, truncate + warning, or check failure).
3. Preview and render agree (parity threshold).

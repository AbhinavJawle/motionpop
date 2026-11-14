# Design: 03 motion engine

Revised after two Kiro reviews. Bracketed numbers like [1.3] point at `review-run5.md`; [F4] at `review.md` (run 6).

## Packages
| Package | Adds |
|---|---|
| `packages/schemas` | `style.ts`: `EaseNameSchema`, `StylePackSchema` (strict), `StylePack`; `color.ts`: `contrastRatio(a, b)`; `format.ts`: `FORMATS` |
| `packages/motion/src/core` | `rng.ts`, `stagger.ts`, `timeline.ts`, `split-text.ts`, `path-draw.ts`, `fit-text.ts`, `camera.ts`, `safe-area.ts` |
| `packages/motion/src/styles` | `editorial-explainer.json`, `test-inverted.json` (tests and motion:check only), `index.ts` (parsed with zod at import) |
| `packages/motion/src/fonts` | committed Geist + Geist Mono **variable** woff2 (OFL) + `font-faces.ts` |
| `packages/motion/src/compiler` | formats, fonts, background/texture layers, preview vs render mode, slot seeds |
| `packages/motion/src/runtime` | fonts gate, active-slot seeking, per-slot error isolation, `__motionpop` API |
| `packages/motion/scripts` | `build-runtime.ts` (runtime, `fonts.json`, `textures.json`), `check.ts` (motion:check) |
| `services/render/scripts` | `parity.ts` (needs the producer, which lives here) [3/R6] |

## Core APIs (all pure)
```ts
// rng.ts [4.5]
mulberry32(seed: number): () => number          // seed coerced with >>> 0; integer seeds only; [0, 1)
hashString(s: string): number                    // FNV-1a 32-bit with Math.imul (engine-independent)
rngFor(seed: number, key: string): () => number  // mulberry32((seed ^ hashString(key)) >>> 0); golden-value tests

// stagger.ts [1.7]
STAGGER = { word: 50, item: 90, dot: 25 }                       // ms
STAGGER_RANGE = { word: [30, 80], item: [60, 120], dot: [10, 40] }
clampStep(kind: keyof typeof STAGGER, ms: number): number
stagger(i: number, n: number, stepMs: number, from?: "start" | "end" | "center"): number
// property: for i < n, offset ∈ [0, (n - 1) * step]

// timeline.ts [1.6]
type Key = { t: number; v: number; ease?: EaseName };
track(keys: Key[]): (tMs: number) => number      // holds first/last value outside the range
sequence(items: { at: number; track: (t: number) => number }[]): (tMs: number) => number[] // each track at t - at
OVERLAP_MS = 200   // principle 3 range 150–350
EXIT_RATIO = 0.6   // principle 12

// split-text.ts: splitText(el, text, "word" | "char") → spans, built once at build time
// path-draw.ts: pathDraw(path, progress); length measured once (getTotalLength), cached in a WeakMap
// camera.ts: pushIn(tMs, durMs, amount = 1.05) → scale, inOutSine over the slot
// safe-area.ts: safeArea(format, w, h) → box; insetForCamera(box, w, h, amount) shrinks the box so text
//   scaled by the push-in around the frame centre stays inside the original safe area [3/R5.2]

// fit-text.ts [4.1–4.3]
fitText(el, box, { max, min, lineHeight?, maxLines?, truncatable? = true }, overflows?)
  → { size: number; text: string; truncated: boolean; overflow: boolean }   // text = final string to split [F22]
// binary search on font-size; at min: truncatable → word truncation + "…" (truncated); not truncatable → overflow
```
Rules:
- Measurement (`getTotalLength`, `fitText`) only at build; `seek` reads cached numbers and writes styles.
- `fitText` runs on plain text **before** `splitText`, and sizes the box for the **final** string (for counters: `formatCount(value, fmt)`, which is the widest, since counts go up from `countFrom`; if `countFrom` formats wider, use that).
- Numbers and units pass `truncatable: false`; an overflow calls `ctx.warn` and motion:check fails.
- happy-dom has no layout: unit and property tests use a deterministic measuring stub (`overflows` callback, `getTotalLength` stub). Real behaviour is covered by motion:check [4.4].

## StylePack schema [5, 2.2]
- Exactly `style-pack-format.md`, `.strict()` at every level. Colours `#RRGGBB`. `colors.chart` length 3–8. `motion.enterMs`, `staggerMs`, `holdMs` positive integers. `texture.grain` and `vignette` in 0–1. `camera.pushIn` in 1–1.1.
- `EaseNameSchema` is a literal enum in schemas; a test in `packages/motion` asserts `Object.keys(eases)` equals `EaseNameSchema.options` (no import cycle: motion depends on schemas, never the reverse).
- Pack test: `contrastRatio(ink, bg) ≥ 4.5` and `contrastRatio(muted, bg) ≥ 4.5` (`accent` is never used as text on `bg` [1.1]).
- Packs are JSON imported with `import pack from "./editorial-explainer.json" with { type: "json" }` and parsed at import; task 5 confirms this works in Next, Vitest and Node type stripping, else it generates `.ts` modules [4.11].
- `fonts.displayWeight` is 400–900 in steps of 100. `styles/index.ts` also checks every pack font family is in `BUNDLED_FONTS` [F3]. `allowPlayful` is reserved: no playful ease exists yet; spec 07 adds `outBack` gated by it [F16].
- `BuildContext.style: StylePack`; `BuildContext.warn(message)`. `contract.ts` drops `StyleTokens` entirely (no alias); `primaryFamily` is the one place that turns a family name into a CSS stack [F15]. Components use `style.colors.*`, `style.fonts.*`, `style.motion.*`; never literals.
- Brand-kit merge (`mergeBrandKit`) and slot-level `styleId` overrides: deferred to spec 14 [2.3].

## Fonts [1.2, 1.4, 3/R3.2] (done in task 6)
- Variable `Geist-Variable.woff2` and `GeistMono-Variable.woff2` are committed in `packages/motion/src/fonts/` with `OFL-Geist.txt`; any weight 100–900 is real, never faux-bold.
- `build:runtime` writes `dist/fonts.json` (family → base64). The compiler stays browser-safe: callers pass the data via `CompileAssets.fonts` (required; the compiler throws when a pack family has no data [F3]); `fontFaceCss` emits `@font-face` rules (`font-weight: 100 900`, `font-display: block`).
- Runtime gate: for every embedded family, `document.fonts.load('<w> 16px "<family>"')` for each weight the pack uses (body 400/500, `displayWeight`), then `await document.fonts.ready`. motion:check asserts `document.fonts.check(...)` for each.
- turbo: `test` and `motion:check` depend on `build:runtime` (task 10 adds the `dependsOn`).

## Texture [3/R3.3]
- `build:runtime` generates static tiles with the seeded rng and Node `zlib` (no deps): `grain` 256×256 greyscale noise PNG, `paper` 512×512 low-frequency noise (8 px cells, bilinear), both written to `dist/textures.json` as data URLs and passed via `CompileAssets.textures`.
- The compiler draws `.mp-texture` with `background-image: url(grain)` at `opacity: style.texture.grain`, `background-size: 256px` in frame pixels (the player scales the whole frame, so the tile scales with it), plus paper at half that opacity when `paper: true`, plus a radial vignette at `style.texture.vignette`. Nothing animates (principle 14).

## Composition shape (v1)
```html
<div id="mp-root" data-composition-id="motionpop" data-width="1920" data-height="1080" data-duration="18">
  <div class="mp-bg"></div>               <!-- style.colors.bg -->
  <div class="mp-texture"></div>          <!-- static grain + paper tiles, vignette -->
  <audio id="voice" class="clip" …></audio>
  <div class="clip mp-slot" id="slot-1" data-start="4.2" data-duration="3.6" data-track-index="1"></div>
  <div id="mp-captions"></div>            <!-- filled in spec 12 -->
</div>
```
- HyperFrames 0.9.46 reads `data-track-index` (`@hyperframes/core` `clipFacts`, `compositionReadiness`); the v0 compiler's `data-track-kind` is replaced [4.8].
- `CompileInput` takes `format`; width and height come from `FORMATS = { "16:9": [1920,1080], "9:16": [1080,1920], "1:1": [1080,1080] }` in schemas [4.9]. Components always lay out in frame pixels.
- `CompileInput.mode: "preview" | "render"` (default preview) is written into the payload for the runtime [3/R4.2].
- `CompileInput.background: "style" | "transparent"` (default style). Transparent omits `.mp-bg` and `.mp-texture` for WebM overlays (spec 08) [F4].
- Each slot is `div.clip.mp-slot > div.mp-cam > div.mp-root-slot`. The runtime sets `.mp-cam` scale to `pushIn(t, dur, style.motion.camera.pushIn)` around the frame centre; components never apply the camera themselves [F6].
- Components render on a transparent root: no background on the slot root, no full-frame opaque fills [F4].
- Property test: for random integer-ms slots, `data-start` and `data-duration` round-trip to the same integers [F13].
- Slot seed: `hashString(slot.id)` [4.5].

## Runtime v1
```ts
window.__motionpop = { ready: Promise<void>, seek(tMs), errors: SlotError[], warnings: SlotWarning[] };
// SlotError = { slotId, phase: "build" | "seek", message }, de-duplicated by all three fields
```
1. The `hf-seek` listener is registered synchronously at load; seeks before `ready` store the latest ms (`pendingMs`) and apply it once ready [1.3] (done in task 6). A test seeks before ready.
2. Fonts gate (above), then build every slot inside try/catch. Key moment = `clamp(slot.keyMomentMs ?? component.keyMomentMs(p, dur), 0, dur)`, warning when clamped [4.7].
3. `seek(tMs)`: for each slot whose `[start, end)` contains t, set the camera scale and call `composition.seek(t - start)` inside try/catch; other slots are hidden by HyperFrames and not seeked [4.6]. Pure seeks make re-entry safe.
   A slot shorter than `component.durationMs.min` still builds (components compress timings proportionally) and records a warning [F7].
4. Errors: preview → placeholder div "Couldn't render" (tokens: muted on bg) in that slot; render → no placeholder, the producer script reads `__motionpop.errors` after `ready` and fails the job.
5. Event contract test [F21]: load a compiled composition with the pinned HyperFrames runtime in Chrome, drive the HyperFrames clock (not our `seek`) and compare `__motionpop` state at the same times.
6. Producer readiness: task 8 reads `@hyperframes/producer` 0.9.46 to confirm how it waits for the page (readiness hook vs fixed delay) and records it here; if it does not wait on our promise, the runtime holds HyperFrames' readiness signal until `ready` resolves.

## big-number v1 [1.1, 1.5, 2.5, R7]
- Timings from `style.motion`: `enter = min(enterMs, 0.25 · dur)`, `exit = round(EXIT_RATIO · enter)`, eases `eases[enterEase]` / `eases[moveEase]`; label starts `OVERLAP_MS` after the number lands.
- Hold: the label must be settled ≥ 800 ms before the exit starts. `durationMs.min` is raised to whatever satisfies that at the default key moment (computed, ≈ 2600 ms); motion:check enforces it.
- Accent: the number stays `ink`; at the key moment a `highlight` bar swipes in behind it (scaleX 0 → 1, origin left, `enter` ms). The number element carries `data-on="highlight"` for the contrast check.
- Files: `params.ts` (every field `.describe()`d), `layout.ts` (pure per-format boxes), `build.ts`, `index.ts`, `samples.ts`, `README.md` [F11]. Transparent root [F4].
- Per-format layouts (16:9 left-aligned, 9:16 centred stack, 1:1 centred), text boxes inside `insetForCamera(safeArea(...))`. Number `fitText` with `truncatable: false`; label and context truncatable.
- `data-text` on context, number, label; `data-focal` on the number. Camera push-in from `style.motion.camera.pushIn`.
- `samples.ts` exports `arbitrary` (fast-check) and `edgeCases`: empty optional fields, schema-max-length strings, long unbroken words in a 9:16 box, 0, negative values, 9-digit values with and without decimals, non-Latin text [F23].
- README with examples; tests: determinism (`assertSeekPure`), data honesty (text at `durationMs` before exit equals `formatCount(value, fmt)` for any value and decimals).
- `formats: ["16:9", "9:16", "1:1"]`.

## motion:check [3/R5, 5]
- Root script `pnpm motion:check <id>` → `node packages/motion/scripts/check.ts <id>` (Node type stripping, no tsx); `.check/` gitignored; explicit devDependency on the `puppeteer-core` version the producer uses, Chrome resolved the same way the producer does.
- Matrix: each format in `component.formats` × params (`defaults`, N fast-check samples from `samples.ts`, default N = 20, seed printed in the report, plus `edgeCases`) × durations (min, ideal, max) × key moment (default, 10 %, 90 %). Times: 0 %, key moment, end of hold, 90 % (stills); assertions run at key moment and end of hold.
- Each case: compile a one-slot project with `editorial-explainer` (and `test-inverted` for defaults), load it in headless Chrome, `await __motionpop.ready`, `seek(t)`, screenshot.
- Assertions on `[data-text]` elements with effective opacity ≥ 0.05 and not `visibility:hidden`, boxes from `getBoundingClientRect` (after the camera and all transforms) [F5]:
  - every still: inside `safeArea`; pairwise no overlap (> 2 px intersection; a `data-text` nested in another is not counted);
  - key moment and end of hold only (elements at opacity ≥ 0.9):
  - contrast of computed text colour vs backdrop ≥ 4.5 (backdrop = `style.colors[data-on]` if set, else `bg`);
  - `[data-focal]` opacity ≥ 0.9 and fully inside the frame at the key moment;
  - sync: focal state (text, opacity, box ±1 px) at key − 80 ms differs from key + 400 ms; at key + 80 ms equals it;
  - hold: focal and label at opacity ≥ 0.9 throughout `[exitStart − 800, exitStart]` (sampled every 100 ms);
  - fonts: `document.fonts.check` true for each family/weight; `__motionpop.errors` empty; overflow warnings fail, other warnings are listed in the report;
  - transparency: the slot root's computed background alpha is 0 [F4].
- motion:check is not part of `vitest`; it runs per component as part of the definition of done (needs Chrome). CI job later.
- Output: `packages/motion/.check/<id>/<format>-<case>-<pct>.png` + `report.json`. Exit 1 on failures (listed per still).

## Parity [3/R6]
`services/render/scripts/parity.ts`: compile a fixture project, (a) runtime screenshots at 5 frame-aligned timestamps (`frameToMs(msToFrame(t))`), (b) producer render and frame extraction with the ffmpeg the producer already uses, (c) preview stills at deviceScaleFactor 1 and frame size; fail if the global mean absolute difference exceeds 2 % or any 64×64 tile exceeds 10 % (tolerance for H.264 + YUV colour shift; the comment says so, so later changes are deliberate) [F20]. Fails with a clear message if ffmpeg is missing. First task to cut; may slip to spec 08.

## Testing
- **Property [kiro]:** rng determinism, range, golden values; stagger bounds and kind ranges; `track` holds endpoints and is continuous at keys; `sequence` offsets; `countAt` lands exactly.
- **Property [kiro]:** `fitText` (stub measuring by char count) never returns a size outside [min, max]; never overflows when neither `truncated` nor `overflow`; `truncatable: false` never changes the text.
- **Property [kiro]:** `assertSeekPure(component, params)` helper in `packages/motion/src/testing/seek-pure.ts` (random time lists: random order equals sequential, same t twice equals) used by every component, starting with big-number. Layout properties run inside motion:check with fast-check samples.
- **Unit:** StylePack schema (accepts both packs; rejects bad hex, unknown keys, unknown eases, short or long chart palette, non-positive timings, out-of-range texture, low contrast); compiler (sizes per format, `@font-face`, texture layers, `data-track-index`, mode); runtime (throwing component isolated, de-duplicated errors, seek before ready, key moment clamp).
- **Lint [kiro]:** ESLint `no-restricted-globals` / `no-restricted-properties` for clocks, timers and `Math.random` in `packages/motion/src/{core,components,runtime}`; a test that `components/**` source has no colour literals.
- A bug found by a property test gets a regression test and a DEV_LOG note (definition of done for every task).

## Correctness properties
1. `seek(t)` determinism for every core function and component (same t → same output, order independent).
2. Text never leaves the safe area silently (fit, truncate + warning, overflow + warning + check failure).
3. Preview and render agree (parity threshold).
4. A pack that passes the schema has readable text colours.

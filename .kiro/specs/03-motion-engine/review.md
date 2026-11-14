# Review: spec 03 motion engine

Reviewed by Kiro (review run, no code changed). Inputs: this spec (`requirements.md`, `design.md`, `tasks.md`), steering (`component-contract.md`, `motion-principles.md`, `style-pack-format.md`, `testing.md`, `tech.md`, `structure.md`, `component-library.md`), and the current code in `packages/motion` and `packages/schemas`.

Findings are ordered by importance. IDs (F1…) can be referenced from tasks.

## A. Blocking: will cause failing checks or wrong output

### F1. The reference pack fails the contrast assertion with big-number's own accent colour

R5.2 asserts text contrast ≥ 4.5:1 against `style.colors.bg`. `big-number` turns the number to `style.colors.accent` at the key moment. For `editorial-explainer`, accent `#FF7A3D` on bg `#F2EDE4` is about 2.2:1 (relative luminance ≈ 0.36 vs ≈ 0.85). The number is large text, but the spec only has the 4.5:1 rule, so `pnpm motion:check big-number` (R7.1) cannot pass as written.
**Fix:** Define two thresholds in R5.2: 4.5:1 for normal text and 3:1 for large text (≥ 24 px, or ≥ 18.66 px bold), following WCAG. Compute the ratio against the actual pixels behind the element (sample the screenshot), not `style.colors.bg`, because the texture, vignette and any slot background change the backdrop. Also add a pack-level unit test that `ink` and `muted` on `bg` are ≥ 4.5:1 and `accent` on `bg` is ≥ 3:1.

### F2. `document.fonts.ready` does not guarantee the fonts are loaded

R4.1 and task 6 rely on `await document.fonts.ready` before building. That promise resolves when currently pending loads finish. Fonts declared with `@font-face` start loading only when some rendered text uses them. At runtime start nothing has rendered yet, so `ready` can resolve immediately and `fitText` then measures with fallback fonts. The current `runtime.ts` has this exact flow. Symptoms: wrong fit, wrong truncation, and preview vs render differences.
**Fix:** In runtime v1, call `document.fonts.load(\`${weight} 16px "${family}"\`)` for every family and weight the pack declares (`displayWeight`, body 400/500, mono), `await Promise.all`, then `await document.fonts.ready`. Reject `ready` (and record an error) if a declared family is not `document.fonts.check`-true afterwards. Add a runtime test for this. Update `component-contract.md` ("Fonts loaded before the first seek") to describe the mechanism.

### F3. Missing fonts fall back silently

`compileProject` takes `assets.fonts?` and `fontFaceCss` filters out any family without data, so a missing `fonts.json` produces a system-font composition with no error. `motion:check`, parity and any CI run would then pass or fail against the wrong glyphs. `StylePackSchema` also accepts any font name, but only Geist and Geist Mono are bundled.
**Fix:** Make `assets.fonts` required, and throw from the compiler when a pack family is not in `BUNDLED_FONTS`. Validate pack fonts against the bundled list in `styles/index.ts` (the schema cannot know the list). Add a test for each failure.

### F4. Components paint an opaque background, which hides the texture layer and breaks transparent export

Design puts the background and texture in compiler-owned layers (`.mp-bg`, `.mp-texture`) behind the slots. `big-number` sets `root.style.background = style.colors.bg` and `overflow:hidden`, so it covers those layers. This also defeats the transparent WebM export in `product.md` (journey 4). Neither the contract nor the spec says who owns the background.
**Fix:** Add a rule to `component-contract.md` and R7: components render on a transparent root; only the compiler paints the background and texture. Add a compiler option `background: "style" | "transparent"` (used by export in spec 08). Add a check in `motion:check` that the slot root has no opaque full-frame background (computed style alpha 0), and update task 9.

### F5. `motion:check` assertions are not defined per timestamp

The check runs at 0 %, key moment and 90 %, but R5.2 applies every assertion to every still. At 0 % everything is at opacity 0 or mid-entrance, so "focal visible" and contrast are meaningless. At 90 % `big-number` is already exiting: with `exitDur = 300 ms`, a 2 s slot starts exiting at 1.7 s, before 90 % (1.8 s). The number is partly faded there.
**Fix:** Add a table to the design: safe-area and overlap on all stills; contrast and focal-visible only at the key moment (elements with opacity ≥ 0.9); at 90 % assert only the safe area plus "no element has opacity between 0.1 and 0.9 unless the component declares an exit". Skip elements with computed opacity 0 or `visibility:hidden`. Define "overlap" so a text box nested in another `data-text` box is not counted.

### F6. Camera push-in moves text out of the safe area

The design has `pushIn` (scale 1 → 1.05) and `motion-principles.md` §7 wants it on most scenes, while §10 requires text inside the 5 % safe margin. Scaling about the centre pushes a box sitting on the safe edge about 2.5 % of the half-frame outward, outside the safe area, and the 90 % still will catch it. The spec does not say who applies the camera (compiler or component), at what level, or how the check accounts for it.
**Fix:** Decide in the design: the compiler applies the camera to a wrapper around the slot root using `style.motion.camera.pushIn`, and `motion:check` measures boxes with the camera transform included. Components then lay out inside a safe area shrunk by the pack's `pushIn` (safeArea gets an optional `cameraScale` argument). Add a task and a test. Note `pushIn` takes `amount` as an argument, but the pack field `motion.camera.pushIn` should be the only source.

### F7. big-number cannot meet the hold rule at the minimum duration

`component-contract.md` gives `durationMs.min = 2000`; `motion-principles.md` §5 requires a 0.8–1.2 s hold. Current code with min duration: key moment = 900 ms, the label enters from 1050 to 1550 ms, exit starts at 1700 ms. The number is fully readable for under 800 ms and the label for about 150 ms. Nothing in R5 checks hold.
**Fix:** Either raise `durationMs.min` to what the choreography needs (≈ 3000 ms) or compress the entrance when the slot is short. Add a `hold` assertion to `motion:check`, or a unit test: for `min`, `ideal` and `max`, the time from last entrance end to exit start is ≥ 800 ms. Also state how a slot shorter than `min` is handled (clamp, warn) since slots come from speech.

## B. Missing requirement-to-task coverage

### F8. No task covers the build-time warning channel (R1.3, R4.3, contract "flag a warning")

`fitText` returns `truncated`, but nothing receives it. `BuildContext` has no `warn`, `__motionpop` exposes only `errors`, and the check script cannot see truncation.
**Fix:** Add `warn(code, message)` to `BuildContext`. The runtime collects `{slotId, level: "error" | "warning", code, message}` into `window.__motionpop.issues` (keep `errors` as a filtered view). Define `SlotError`, which the design uses but never declares. `motion:check` fails on `error` and lists `warning` entries in the report. Add a test with a forced truncation. Add to tasks 3, 8 and 10.

### F9. R1.4 (stagger ranges) is not enforceable as designed

`stagger(i, n, stepMs, from)` takes any step, so nothing keeps offsets in the 30–80 ms / 60–120 ms / 10–40 ms ranges that `motion-principles.md` §4 lists, and the property test in the design only checks monotonic and bounded.
**Fix:** Export `STAGGER = { letters: [30, 80], items: [60, 120], dots: [10, 40] }` and a `staggerStep(kind, requestedMs)` that clamps. Property test: output offset per index is within the range for random inputs. Mention the 150–350 ms overlap offsets (§3) as a helper or document that components choose them. The design's `enter(...) = tween(...)` is an alias with no new behaviour; drop it or define it.

### F10. Component-level determinism is required but has no task

`testing.md` requires: `seek(t)` twice gives identical DOM state, and random seek order equals sequential. The design's correctness property 1 says "every core function and component", but task 2 tests only the core functions, and task 9 lists no tests.
**Fix:** Add to task 9: a fast-check test that builds `big-number` in happy-dom (with the stub measurer), seeks a random sequence of times, and compares `root.innerHTML` (and inline styles) to a fresh instance seeked only at the last time. Make this a reusable helper (`testing/composition-determinism.ts`) that every later component spec uses.

### F11. R7 is thinner than the component contract

R7.1 lists layouts, `fitText`, tokens and `data-focal`. The contract also requires a README with examples, params `.describe()`, unit tests, property tests (determinism, bounds, data honesty) and `structure.md` lays out `params.ts`, `layout.ts`, `build.ts`, `index.ts`, `README.md`. Today `big-number` is a single `index.ts` with `formats: ['16:9']`, and `ENTER_MS = 500` is a literal instead of `style.motion.enterMs`.
**Fix:** Expand R7 and task 9: split into `layout.ts` (pure per-format layout returning boxes) and `build.ts`; `formats: ['16:9','9:16','1:1']`; all timings from `style.motion`; README; a data-honesty property (final text equals `formatCount(value, fmt)`, and the count is monotonic); a test that `params` fields all have descriptions. Move "passing `pnpm motion:check big-number`" from R7.1 to its own criterion mapped to task 10.

### F12. Tokens-only rule is not checked

The contract forbids hard-coded colours, fonts and timings. Nothing in the spec enforces it (task 5 only migrates).
**Fix:** Add a lint-style unit test that scans `components/**/*.ts` for hex colour literals and `rgb(` / `rgba(` and fails with the file and line. Allow an explicit `// token-ok:` escape hatch with a reason. Optionally add an eslint `no-restricted-syntax` rule.

### F13. Other requirements with no task or no owner

- R5.3: the `.check/` gitignore entry has no task (currently not in `.gitignore`).
- R3.4 (integer ms, seconds only in HTML) is mapped to task 7, but the existing compile test coverage should be extended with a property: for random integer slots, `data-start * 1000` round-trips to the integer ms.
- Brand-kit overrides ("style pack + brand-kit overrides", `style-pack-format.md`) are in the contract but not in this spec. State explicitly that they are out of scope and name the owning spec (13 or 14), and that `BuildContext.style` is the already-merged pack.
- The captions host appears in design and task 7 but has no requirement. Either add a one-line requirement ("the compiler SHALL emit an empty `#mp-captions` host; content lands in spec 12") or remove it from task 7.
- `data-text` and `data-focal` are the contract between components and `motion:check` but are defined only in this design. Add them to `component-contract.md` (rules section) so every component spec inherits them.

## C. Contradictions with steering or code

### F14. The spec is out of date with the code

Files named in tasks as new already exist, uncommitted: `core/camera.ts`, `fit-text.ts`, `path-draw.ts`, `safe-area.ts`, `split-text.ts`, `core.test.ts`, `fonts/font-faces.ts`, plus compiler and runtime edits. Task 3 and most of task 6 are therefore half done while unchecked, and `git status` shows 8+ uncommitted changes. The design's APIs also differ from the code: `splitText` and `pathDraw` match, but `fitText` takes a third `overflows` argument and `pathDraw` is paired with `measurePath`; `font-faces.ts` takes a `data` map (from `dist/fonts.json`), not data URLs built in place.
**Fix:** Commit the existing work, then re-scope tasks 3 and 6 to "tests and gaps" (what is missing per this review) and update the design signatures to match. Keep a rule that a task is only checked when its tests exist.

### F15. `StyleTokens` replacement is described inconsistently

`contract.ts` says the full `StylePack` replaces `StyleTokens` "in spec 07"; R2.2 and task 5 do it in spec 03.
**Fix:** Update the comment in `contract.ts` as part of task 5, and make the task say the whole `StyleTokens` type is deleted, not aliased. `compile.ts` also uses `input.style.fonts.display` as a family stack; with the real schema (`fonts.display: "Geist"`) keep one place (`primaryFamily`) that converts it.

### F16. `EaseName` is defined in two packages

Task 1 puts an `EaseName` enum in `packages/schemas`, while `core/ease.ts` derives `EaseName` from the `eases` object, and `motion` depends on `schemas` (not the reverse). The two lists can drift silently. Also `motion-principles.md` §2 allows elastic when `allowPlayful` is true, but no elastic ease exists, so the flag has no effect.
**Fix:** Add a test in `packages/motion` asserting `z.enum` options equal `Object.keys(eases)`. Decide whether `allowPlayful` gates an `outBack` / `outElastic` ease (add to both lists, with a test that non-playful packs reject them) or document that the flag is reserved. Also add `export * from './style'` to `packages/schemas/src/index.ts` in task 1 (not mentioned).

### F17. `tsx` and Puppeteer assumptions do not match the repo

Design says `tsx packages/motion/scripts/check.ts`, but no `tsx` dependency exists and the repo runs scripts with `node scripts/*.ts` (Node 24 type stripping, see `build:runtime`). Puppeteer is taken "from the producer's install", but pnpm does not hoist transitive dependencies, so `import "puppeteer"` from `packages/motion` fails unless declared. There is no root `motion:check` script (root `package.json` has none), and `tech.md` / `workflow.md` define `pnpm motion:check <id>` as part of Definition of Done.
**Fix:** Use `node scripts/check.ts`. Add `puppeteer` (catalog version equal to the producer's) as a `devDependency` of `packages/motion`. Add `"motion:check": "pnpm --filter @motionpop/motion motion:check"` at the root and `"motion:check": "node scripts/check.ts"` in the package. Note `build:runtime` must run first (the check needs `dist/`); make the script call it or fail with a clear message. Note that `.turbo` caching is irrelevant to this script.

### F18. Runtime does not implement what R4 and the contract require

`runtime.ts` today: `params.parse` and `build` are unguarded (one bad slot throws out of `mount` and drops all later slots); unknown component or missing host only calls `console.error`; no placeholder; `seek` calls every slot with clamped local time instead of only active slots ("calls `composition.seek(t - slotStart)` on every active slot"); `seed` is hard-coded to 1; `__motionpop` has no `errors`.
**Fix:** Covered by task 8, but make the acceptance concrete: try/catch around parse, build and each seek; placeholder text `Couldn't render` using tokens; an `issues` list; seek only when `0 ≤ t - start ≤ duration` plus one final seek at the clamped end when leaving, so the exit state is exact; per-slot seed from `rngFor(projectSeed, slot.id)`, with `seed` added to `CompileSlot` or a project field. Add the hf-seek payload test (see F21).

## D. Risky assumptions

### F19. Seeded SVG turbulence is not a deterministic texture

Design R3.3 uses `feTurbulence` with a fixed seed. The seed is fixed, but the rasterised noise depends on the Chrome version, GPU vs software path and device scale factor, and it scales with the element size. Preview (scaled iframe, possibly GPU) and render (headless, software) can differ, which also hurts parity (R6) and costs render time per frame.
**Fix:** Generate the grain once at build time from `rng` as a small tiled PNG/data URL (or canvas drawn once with seeded values), tile it with `background-repeat`, and draw the vignette with a CSS radial gradient. Keep the layer static (no per-frame change, consistent with principle 14). Define `paper: true` explicitly (e.g. a second low-contrast fibre tile), or drop the field from this spec. Test: two compiles of the same input are byte-identical.

### F20. Parity method can pass broken frames

R6 and the design compare a mean absolute difference with a 2 % threshold. A mean over a 1920×1080 frame hides a missing line of text. Preview "may scale down" while components lay out in frame pixels, so screenshots must be taken at the same size and device scale factor. Producer frames sit on 30 fps boundaries, so a timestamp like 4.2 s is exact but 4.215 s is not. The ffmpeg dependency is also not declared.
**Fix:** Pick the five timestamps as frame multiples (`msToFrame` round trip), take preview stills at deviceScaleFactor 1 at the frame size, and compare with a combination: global MAD ≤ 2 % and no 64×64 tile with MAD > 10 %. Declare how ffmpeg is found (the producer bundles one? verify) and fail with a clear message if missing. Mark parity as non-blocking for the Definition of Done until it is stable, but run it in the spec 08 render task.

### F21. `hf-seek` shape and player behaviour are assumed

`component-contract.md` says to verify the current `hf-seek` event shape before changing the runtime. The runtime reads `detail.time` in seconds, and R4/task 8 do not add a test against the pinned `@hyperframes/core` version. The design also removes `data-track-index` from the clip markup used in the walking skeleton (`compile.ts` emits `data-track-kind`), and `design.md`'s example shows `data-track-index`.
**Fix:** Add a task-8 test that loads the compiled HTML in Chrome with the pinned runtime, drives it via the HyperFrames clock and checks `__motionpop` state at the same times, so the event contract is exercised. Reconcile the attribute (`data-track-index` vs `data-track-kind`) with the HyperFrames docs and update either the design or the compiler.

### F22. `fitText` and `splitText` interact badly

`fitText` truncation rewrites `el.textContent`, which destroys spans created by `splitText`. A component that splits a headline and also fits it would lose its animated spans. `fitText` reads `scrollWidth` per iteration (reflow each step) and relies on the fixed `lineHeight` set on the element, so components that style lines separately may measure incorrectly. Also real `fitText` is only property-tested through a char-count stub, which cannot catch real font metrics issues.
**Fix:** Document the order (fit first, then `splitText` on the final text) and make `fitText` return the final string so callers split after it. Add a Chrome-based case in `motion:check` samples (long German-style words, narrow 9:16 box) as the real test of fit quality.

### F23. Check inputs are loosely specified

- "Key moment" for the check: which slot duration is used? Use `durationMs.ideal`, and also `min` and `max` as edge samples (this also covers F7).
- Edge-case params are left to `samples.ts` with no list. Specify minimums: empty optional fields, maximum-length strings (the schema max), 0, negative values, very large numbers with and without decimals, non-Latin characters.
- "4 seeded random samples" need a fixed fast-check seed stored in the report so a failure reproduces.
- The vitest suite does not run `motion:check`. State where it runs (manual and per-component Definition of Done today). Add a CI job note for later, since it needs Chrome.

### F24. Style pack schema details are open

Task 1 says "bad hex" without defining it. Colours are parsed by the contrast code, so 3-digit or 8-digit hex or CSS names would break the check. `colors.chart` has a minimum of 3 but no maximum; the other fields (`texture.grain`, `vignette`, `pushIn`, `radius`) have no bounds, so a pack can request `pushIn: 3` or negative `enterMs`.
**Fix:** `#RRGGBB` only (regex, case-insensitive), `.strict()` objects so typos fail, `chart` 3–8 entries, grain/vignette 0–1, `pushIn` 1.00–1.10 (matches §7 1.04–1.06 plus slack), `enterMs`/`staggerMs`/`holdMs` positive integers with sensible caps, `displayWeight` one of 400–900 in steps of 100. Tests for each bound.

## E. Task list adjustments

- Split task 2 (three modules and four property areas) into two tasks: `rng` + `stagger`, and `timeline` + `track`. It is the first Kiro task and has the largest diff.
- Task 3 depends on nothing in task 2 but task 4 depends on task 3: keep the order and mark the dependency. Re-scope task 3 per F14.
- Task 5 should include deleting `StyleTokens` (F15) and the tokens-only test (F12).
- Task 8 should include F8, F18 and F21.
- Task 9 should include F4, F7, F10, F11.
- Task 10 should include F5, F17, F23 and the `.gitignore` entry.
- Task 11 should include F20 and be explicitly allowed to slip to spec 08 if the producer needs the render service first. Say so in `requirements.md` so the Nov 19 target is honest.
- Kiro share: tasks 1, 2 and 4 are tagged [kiro] (3 of 11 ≈ 27 %). Task 12 (the tokens test, F12) and the determinism helper (F10) are good further Kiro candidates, since they are self-contained with clear acceptance.

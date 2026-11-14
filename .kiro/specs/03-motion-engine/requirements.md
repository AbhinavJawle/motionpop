# Requirements: 03 motion engine

Turns the walking-skeleton motion core into the engine every library component and every tier-2 composition builds on: a complete deterministic core, style packs, per-format compositions with embedded fonts, a robust runtime and the `motion:check` quality gate. Lands by **Thu Nov 19, 2026**. Written in Claude Code; revised after two Kiro spec reviews (`review-run5.md`, `review.md` from run 6).

## R1 Deterministic core
_As a component author, I want a small, pure animation toolkit so every graphic is reproducible frame by frame._
1. THE SYSTEM SHALL provide in `packages/motion/src/core`: `timeline` (keyframed tracks plus `sequence` with overlap offsets), `stagger`, `splitText` (words and letters into spans), `pathDraw` (stroke reveal from path length), `countAt` (existing), `rng` (seeded), `fitText`, `camera` (push-in) and `safeArea`.
2. WHEN any core function is evaluated at time t THE SYSTEM SHALL return a value that depends only on t and its arguments (no clocks, timers, global state or unseeded randomness), and lint SHALL reject `Date.now`, `Math.random`, `performance.now`, `setTimeout`, `setInterval` and `requestAnimationFrame` in `packages/motion/src/{core,components,runtime}`.
3. WHEN `fitText` cannot fit truncatable text at the minimum size THE SYSTEM SHALL truncate with an ellipsis and report a warning instead of overflowing. Numbers and units SHALL never truncate: they shrink to the minimum and report an overflow warning.
4. THE SYSTEM SHALL provide default stagger steps inside the motion-principles ranges (words/letters 30–80 ms, items 60–120 ms, dot grids 10–40 ms) and a helper that clamps a step to its kind's range.
5. THE SYSTEM SHALL expose named constants for overlap offsets (150–350 ms, default 200) and the exit ratio (0.6 of the entrance).

## R2 Style packs
_As a creator, I want a consistent look across every graphic so my video feels designed._
1. THE SYSTEM SHALL validate style packs with a strict `StylePackSchema` (packages/schemas) matching `style-pack-format.md`.
2. THE SYSTEM SHALL pass the full style pack to components through `BuildContext.style`, replacing the v0 `StyleTokens`, plus `ctx.warn(message)` for non-fatal problems.
3. THE SYSTEM SHALL ship `editorial-explainer` as the reference pack (the other four land in spec 07) and a test-only inverted pack so hard-coded colours or timings show up in tests.
4. THE SYSTEM SHALL reject a pack whose `ink` or `muted` colour has contrast below 4.5:1 against `bg`.

## R3 Compiler v1
_As a creator, I want my video in 16:9, 9:16 and 1:1 with identical type in preview and export._
1. THE SYSTEM SHALL compile a project for 16:9 (1920×1080), 9:16 (1080×1920) and 1:1 (1080×1080), deriving the frame size from the format through one `FORMATS` constant.
2. THE SYSTEM SHALL embed the fonts the style pack needs as `@font-face` data URLs so preview and render use identical glyphs.
3. THE SYSTEM SHALL render the style pack's background and static texture (grain, paper, vignette) behind the slots from pre-generated seeded tiles, identically at any scale.
4. THE SYSTEM SHALL keep slot timing in integer ms and derive `data-start` / `data-duration` seconds only in the HTML.
5. THE SYSTEM SHALL give each slot a seed derived from a stable hash of its id.
6. THE SYSTEM SHALL paint the background and texture only in compiler-owned layers (components render on a transparent root), with a `transparent` background mode for overlay export.
7. THE SYSTEM SHALL apply the camera push-in from `style.motion.camera.pushIn` to a wrapper around each slot.
8. IF the style pack names a font family that is not bundled, or font data is missing, THEN THE SYSTEM SHALL fail compilation with a clear error.
9. THE SYSTEM SHALL emit an empty captions host (`#mp-captions`); captions land in spec 12.

## R4 Runtime v1
_As a creator, I want the preview and the export to show the same correct frame, and one broken graphic not to break the rest._
1. WHEN the composition loads THE SYSTEM SHALL request every embedded font family and weight with `document.fonts.load`, await `document.fonts.ready`, then build components and apply the latest seek received so far.
2. IF a component throws during build or seek THEN THE SYSTEM SHALL contain the failure to that slot and record the error once per slot, phase and message, without stopping other slots. In preview it SHALL show a neutral "Couldn't render" placeholder; in render the job SHALL fail (credits refunded, spec 08).
3. THE SYSTEM SHALL expose `window.__motionpop` with `seek(tMs)`, `ready` (promise), `errors` and `warnings` for tests and the check script.
4. THE SYSTEM SHALL seek only slots whose range contains t, and SHALL clamp a slot's key moment into `[0, durationMs]` with a warning.
5. WHEN a slot is shorter than its component's `durationMs.min` THE SYSTEM SHALL still build it (the component compresses its timings) and record a warning.

## R5 Motion check
_As a component author, I want one command that proves a component looks right in every format before it ships._
1. WHEN a developer runs `pnpm motion:check <id>` THE SYSTEM SHALL render stills for every supported format, with default, random (fast-check) and edge-case params, at the minimum, ideal and maximum durations and with the key moment at its default, near the start and near the end.
2. THE SYSTEM SHALL assert, at the key moment and at the end of the hold: every visible text box (after transforms) inside the safe area, no overlapping text boxes, text contrast ≥ 4.5:1 against its backdrop, the focal element visible, and all fonts loaded.
3. THE SYSTEM SHALL assert sync: the focal element is still changing at key − 80 ms and settled at key + 80 ms; and hold: focal and label fully readable for ≥ 800 ms before the exit.
4. THE SYSTEM SHALL write the stills and a JSON report (with the failing seed) to `packages/motion/.check/<id>/` and exit non-zero on any failure.

## R6 Parity
_As a creator, I want the export to match what I previewed._
1. THE SYSTEM SHALL provide a parity script that compares preview stills (runtime in Chrome) with producer frames at 5 frame-aligned timestamps per tile and fails when any tile differs beyond a small threshold. (First item to cut: it may slip to spec 08 if the producer needs the render service first.)

## R7 Reference component
_As a creator, I want big numbers that land on the word I say._
1. THE SYSTEM SHALL upgrade `big-number` to the v1 contract: all three formats with per-format layouts, `fitText`, style-pack tokens and timings (no hard-coded timings or eases), a highlight swipe behind ink text as the accent, `data-text` / `data-focal` elements, a transparent root, `layout.ts` / `build.ts` split, params with descriptions, README, `samples.ts`, determinism and data-honesty property tests, passing `pnpm motion:check big-number`.

## Non-functional
- Seeking one slot takes ≤ 8 ms at 1080p in desktop Chrome.
- A compiled one-slot composition (with fonts and texture tiles) is ≤ 2 MB. Measured 2026-11-14: 1.5 MB, of which the HyperFrames runtime is 679 KB, our minified runtime 460 KB (mostly zod; worth trimming later), fonts 188 KB and texture tiles 207 KB. The first draft's 600 KB target was below the HyperFrames runtime alone.
- Brand-kit merging and slot-level style overrides are deferred to spec 14 (recorded in design.md).

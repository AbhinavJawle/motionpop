# Requirements: 03 motion engine

Turns the walking-skeleton motion core into the engine every library component and every tier-2 composition builds on: a complete deterministic core, style packs, per-format compositions with embedded fonts, a robust runtime and the `motion:check` quality gate. Lands by **Thu Nov 19, 2026**. Written in Claude Code.

## R1 Deterministic core
1. THE SYSTEM SHALL provide in `packages/motion/src/core`: `timeline` (keyframed tracks with offsets), `stagger`, `splitText` (words and letters into spans), `pathDraw` (stroke reveal from path length), `countAt` (existing), `rng` (seeded), `fitText`, `camera` (push-in) and `safeArea`.
2. WHEN any core function is evaluated at time t THE SYSTEM SHALL return a value that depends only on t and its arguments (no clocks, timers, global state or unseeded randomness).
3. WHEN `fitText` cannot fit text at the minimum size THE SYSTEM SHALL truncate with an ellipsis and report a warning instead of overflowing.
4. THE SYSTEM SHALL keep stagger offsets within the motion-principles ranges by default (words 30–80 ms, items 60–120 ms).

## R2 Style packs
1. THE SYSTEM SHALL validate style packs with `StylePackSchema` (packages/schemas) matching `style-pack-format.md`.
2. THE SYSTEM SHALL pass the full style pack to components through `BuildContext.style`, replacing the v0 `StyleTokens`.
3. THE SYSTEM SHALL ship `editorial-explainer` as the reference pack (the other four land in spec 07).

## R3 Compiler v1
1. THE SYSTEM SHALL compile a project for 16:9 (1920×1080), 9:16 (1080×1920) and 1:1 (1080×1080).
2. THE SYSTEM SHALL embed the fonts the style pack needs as `@font-face` data URLs so preview and render use identical glyphs.
3. THE SYSTEM SHALL render the style pack's background and texture (grain, vignette) behind the slots, deterministically.
4. THE SYSTEM SHALL keep slot timing in integer ms and derive `data-start` / `data-duration` seconds only in the HTML.

## R4 Runtime v1
1. WHEN the composition loads THE SYSTEM SHALL wait for `document.fonts.ready` before building components and applying the first seek.
2. IF a component throws during build or seek THEN THE SYSTEM SHALL contain the failure to that slot, render a neutral placeholder and report the error, without stopping other slots.
3. THE SYSTEM SHALL expose `window.__motionpop` with `seek(tMs)`, `ready` (promise) and `errors` for tests and the check script.

## R5 Motion check
1. WHEN a developer runs `pnpm motion:check <id>` THE SYSTEM SHALL render stills at 0 %, the key moment and 90 % of the slot for every supported format, with default, random and edge-case params.
2. THE SYSTEM SHALL assert: every text box inside the safe area, no overlapping text boxes, text contrast ≥ 4.5:1, and the focal element visible at the key moment.
3. THE SYSTEM SHALL write the stills and a JSON report to `packages/motion/.check/<id>/` and exit non-zero on any failure.

## R6 Parity
1. THE SYSTEM SHALL provide a parity test that compares preview stills (runtime in Chrome) with producer frames at 5 timestamps and fails when the difference exceeds a small threshold.

## R7 Reference component
1. THE SYSTEM SHALL upgrade `big-number` to the v1 contract: per-format layouts, `fitText`, style-pack tokens and a `data-focal` element, passing `pnpm motion:check big-number`.

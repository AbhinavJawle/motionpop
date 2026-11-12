# Requirements: Deterministic Quality Checks

## Introduction
Code-based checks that guarantee generated scenes are readable, safe and numerically correct. Used by the planning engine's validation step and by the component quality hook.

## Glossary
- **Check**: pure function `(scene, context) → Issue[]`.
- **Issue**: `{ code, severity: 'error'|'warning', path?, message, suggestedFix? }`.
- **Layout probe**: component-exported function returning bounding boxes of its elements at a given time.

## Requirements

### R1: Check runner
1. THE runner SHALL execute all checks for a scene and return the combined Issue list.
2. Checks SHALL be pure and deterministic.
3. THE runner SHALL report `ok = true` only when there are no `error` issues.

### R2: Text overflow
WHEN any text bounding box exceeds its container or leaves the canvas at any sampled time, THE check SHALL emit `TEXT_OVERFLOW` (error).

### R3: Minimum font size
WHEN a text element renders below `MIN_FONT_SIZE[format]`, THE check SHALL emit `FONT_TOO_SMALL` (error).

### R4: Element collisions
WHEN two non-nested elements' bounding boxes overlap by more than 2% of the smaller area at the same sampled time, THE check SHALL emit `ELEMENT_COLLISION` (warning). Intentional overlays flagged `allowOverlap` SHALL be ignored.

### R5: Safe zones
WHEN a text or key element lies outside the format's safe area, THE check SHALL emit `OUTSIDE_SAFE_ZONE` (error for text, warning otherwise).

### R6: Data match
1. THE check SHALL compare every numeric value displayed in the scene with the input data and SHALL emit `DATA_MISMATCH` (error) when they differ.
2. Formatting differences (locale, compact notation) SHALL NOT count as mismatch when the parsed value equals the source after rounding to displayed precision.

### R7: Duration and timing
1. Duration SHALL be within 1–30s, else `DURATION_OUT_OF_RANGE` (error).
2. A hold SHALL be at least `0.3s × words + 1s` for text-bearing holds, else `HOLD_TOO_SHORT` (warning).
3. SFX and camera keyframe times SHALL lie within 0–1, else `TIMING_OUT_OF_RANGE` (error).

### R8: Sampling
THE runner SHALL sample frames at 0%, 25%, 50%, 75%, 100% of the duration plus the hold point.

### R9: Component quality hook
WHEN a file under `packages/components/src/**` is saved, THE Kiro hook SHALL run the component's schema test, property tests and checks on a test-frame render.

## Out of scope
Vision-model visual QA, photosensitivity (flash) checks, WCAG contrast checks beyond brand mapping, brand rules [V1/V2].

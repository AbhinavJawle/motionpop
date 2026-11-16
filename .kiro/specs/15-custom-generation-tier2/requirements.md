# Spec 15 · Custom generation (tier 2) · requirements

Written in a Claude Code session (2026-11-16, ship mode: lean by the founder's request). Steering: `ai-tasks.md` §7, `security-and-cost.md` (generated code), `component-contract.md`, `hybrid-ai.md`.

## R1 · Ask for a graphic the library doesn't have
1. WHEN a slot is selected THE SYSTEM SHALL offer "Custom graphic" next to Generate, using the slot's prompt as the brief, with the cost (☁ 3) shown before the click.
2. WHEN the creator confirms THE SYSTEM SHALL spend 3 credits (`custom`), run `custom.compose` in the cloud only, and refund the credits when no valid graphic comes back.
3. WHILE a custom graphic is being made THE SYSTEM SHALL show the slot as generating with "Pip is writing a custom graphic".

## R2 · The generated code obeys the motion contract
1. THE SYSTEM SHALL accept only `{ title, html, css, script, keyMomentMs }` validated by zod, with size limits (html 12 kB, css 12 kB, script 24 kB).
2. THE SYSTEM SHALL reject (lint) any script or markup that uses the clock, randomness, timers, animation frames, network, storage, `eval`/`Function`, parent windows, external URLs, `<script>`/`<iframe>`/`<link>`, CSS animations or transitions, or GSAP.
3. WHEN lint or parsing fails THE SYSTEM SHALL ask the model once more with the problems listed, and otherwise fail with "Couldn't make that one. Try the library." and a refund.
4. THE SYSTEM SHALL run the script as a pure function of time: the same `t` gives the same frame, in any seek order, with the clock, randomness and timers unavailable to it.

## R3 · It plays and exports like any graphic
1. A custom slot SHALL render through the same engine in preview and export (same composition HTML), styled by the project's look tokens.
2. WHEN a project has a custom slot THE SYSTEM SHALL run the preview in an opaque-origin sandbox (D-021).
3. Each custom graphic SHALL be saved as a version (source `ai-cloud`), undoable, with its brief.

## R4 · Provider
1. THE SYSTEM SHALL use Gemini through Firebase AI Logic by default; `customProvider = claude` (Remote Config) is reserved for a server route that is not built in this spec.

# Spec 07c · Engine v2 and first-load pictures · design

Written in a Claude Code session (Fable 5.2, 2026-11-17). Requirements: `requirements.md`. Decision: D-075.

## Overview
```
project.slots ─► planVideo(slots, images) ─► VideoPlan { slots: Map<id, SlotStaging>, order, climaxId }
                      │                              │
                      │ numberCompanion / lineCompanion (engine/companion.ts, pure)
                      ▼                              ▼
             createEngine: ctx.staging ──► defineScene build: peak variant, calm energy,
                                            side, companion layer or image layer
runtime.ts: plan ? mountWorld(host, project, plan, seams) : mountBackdrop(...)
projectSeams(project, plan): climax entered with a pull; journey = one direction
```
Editor: `useAutoPictures()` (mounted after `useAutoFill()`) → `runAutoPictures` → `/api/media/search` (server LRU) → `/api/media/image` → `addOwnImage`.

## Modules
| File | Role |
|---|---|
| `packages/motion/src/engine/companion.ts` | Companion type, icon lexicon, `numberCompanion`, `lineCompanion`, `companionSig`, `picturableNouns`. Pure, no DOM. |
| `packages/motion/src/engine/video-plan.ts` | `planVideo`: strength scoring, climax, calm slot, variety, sides, stations (`STATION_STEP` 0.4 frame widths). Pure. |
| `packages/motion/src/scenes/companion-layer.ts` | SVG renderings of the five companions with `seek(t)`, look-aware (stepped quantisation, torn discs, roughjs rings). |
| `packages/motion/src/scenes/image-layer.ts` | `splitFrame` / `frameAround`: the text sub-frame is the inverse of `safeArea` around a target box inside the frame's safe area (1.2 % slack for overhang and tilt; vertical pairs drop 5 % in 1:1 and 1.5 % in 9:16 to sit on the optical centre). Also fixes D-070 pictures. |
| `packages/motion/scripts/check.ts` | Staged by default; companions and pictures join the composition group. |
| `packages/motion/src/scenes/define.ts` | Reads `ctx.staging`: peak variant on the climax, calm energy, split side, companion or picture in the split box. |
| `packages/motion/src/runtime/world.ts` | `cameraPath`, `cameraAt`, `mountWorld`: ground grid, far landmarks (parallax 0.6), thread clipped to the camera, knots at stations. |
| `packages/motion/src/runtime/engine.ts` | `projectSeams`; plans before mounting and re-plans once the pictures are known. |
| `packages/motion/src/runtime/seams.ts` | `planSeams(..., { journey })`: every boundary travels in one direction. |
| `packages/motion/src/compiler/*` | `staging?: boolean` on the compile input; scene words carry their text. |
| `packages/ai/src/slots/detect-local.ts` | `labelAfter` for stat labels. |
| `apps/web/lib/images/auto-pictures.ts` | Pure: `pictureQueries`, `pickHit`, `looksLikeLogo`, `cleanQuery`; `runAutoPictures` with injected deps. |
| `apps/web/lib/images/use-auto-pictures.ts` | Hook: waits for auto-fill, Remote Config cap, browser caches, fetches, attaches. |
| `apps/web/lib/media/openverse.server.ts`, `app/api/media/search/route.ts` | Server cache (500 queries, 6 h) and 429 passthrough (`MediaRateLimited`). |

## Companion scoring (video plan)
Strength of a stat: money +3; scale B 4 / M 3 / k 2 / none 1; percent +1.5; plus log10 of the value. A hook line is 0.5. The climax is the strongest slot with index ≥ 1 in a plan of ≥ 3 slots. The slot just before it is calm. A signature `scene:companionKind` equal to the previous slot's drops the companion.

## Camera
Each slot has a hold at its station. Between holds, a seam leg uses an inQuart out of the old station and an outQuart into the new one, meeting at the cut, so speed is the same on both sides of the cut (cut-the-curve). Gaps over 700 ms use a smooth inOutCubic leg. The leg into the climax also zooms 1.14 → 1 (a pull). A calm hold doesn't drift.

## First-load pictures flow
1. Wait 2.5 s after load, then until `autoFilling` is null (max 60 s).
2. Cap = `min(6, imagesPerVideoMax)` from Remote Config (defaults when offline).
3. For each query in time order: mark tried → search (localStorage cache 24 h) → 429 stops → `pickHit(hits, nthUseOfThisQuery)` → re-check the slot → download (full, then thumbnail) → `addOwnImage`.
4. Cancelled when the effect unmounts or the project changes.

## Edge cases
- Film projects: no plan, no world, no searches.
- A slot with a ready picture keeps it; the plan gives it no companion (pictures win the split box).
- `staging: false` restores the old per-slot backdrop and seams (used by `reel --no-plan`).
- Private window / blocked storage: searches still run (capped), nothing is remembered.
- The anonymous Openverse API is rate-limited; the server cache shares answers between creators (search words only, nothing about the caller).

## Testing
- Unit: companion derivation table, video plan (climax rule, calm slot, no repeated neighbours, sides), camera continuity at seams, labelAfter cases, auto-pictures queries, fences and the run loop with fake deps (no network).
- Property (fast-check, Kiro tasks): plan invariants for random slot lists; companion layer `seek(t)` purity; `cameraAt` continuous in position and speed at every seam; `pictureQueries` never exceeds the cap and never yields a brand word.
- Visual: `pnpm --filter @motionpop/motion exec node scripts/run-reel.ts <transcript.json>` writes a whole-video contact sheet; compare `before-suez` and `v2-suez`.
- `pnpm motion:check stat-punch`, `pnpm motion:check hook-statement`.

## Correctness properties
1. `planVideo` is a pure function of its input; the climax is never the first slot; no two neighbours share a companion signature.
2. A companion's rendered count at the focal land time equals its target count.
3. `cameraAt(t)` is continuous; its velocity is continuous at every seam cut.
4. `pictureQueries(p).length ≤ min(6, max)` and every query passes `cleanQuery`.

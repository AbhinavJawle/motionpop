# Design — Spec 24: Talking-Head Reel Engine v2

## Architectural Overview

Spec 24 cleanly bifurcates **Talking-Head Reels (`hasVideo: true`)** from **Voiceover Documentaries (`hasVideo: false`)** inside the shared HyperFrames + Firebase AI Logic runtime, fixing both the 4 silent Spec 23 bugs and the 6 core architectural weaknesses.

```
Uploaded Video (+ optional Media Bin clips)
  ├── Pipeline defaults: look = studio-light, captions = studio (seam-docked), audio = autoSfx + musicId: 'none'
  ├── Face-safe keyframes sampled (probeAndSampleVideo)
  ├── reel.direct (gemini-4-neon, thinking: MEDIUM, full Reel v2 JSON Schema)
  │     ├── Outputs tone (tech-explainer | listicle | hot-take | personal-story)
  │     ├── Zero film.props cartoon SVGs (props = [])
  │     └── Locked visual grammar (50/50 split-top-stage + clean + top-card + media stages)
  ├── Media resolution (Pexels/Wikimedia stock B-roll + optional AI cutouts)
  ├── Parallel Beat Construction:
  │     ├── Pure `clean` beats (text.length === 0) → zero-call deterministic pass-through
  │     └── Visual beats → reel.build (gemini-4-neon, sees clipped stage dims + speaker keyframe + stage-matched Swiss/Studio example)
  ├── Sandbox DOM Critic (clipped stage bounds + data-mp-stage-bg contrast + empty-box guardrail)
  └── Full-Reel Vision QA (ALL visual beats in parallel batches of 6 on gemini-4-neon → surgical frontier repairs)
```

## Key Design Decisions

### 1. Hard Container Clipping for Video Stages (`compile.ts` + `engine.ts` + `build.ts`)
- In `compile.ts`, when `hasVideo && slot.componentId === 'custom'`:
  - `split-top-stage` (9:16): `.mp-slot-top-stage > .mp-cam` is bounded to `top: 0; left: 0; right: 0; height: 50%; bottom: auto; overflow: hidden;` with deterministic studio/editorial stage background + subtle 36px architectural grid and `data-mp-stage-bg="${style.colors.bg}"`.
  - `split-top-stage` (16:9): bounded to `left: 0; top: 0; width: 52%; height: 100%; overflow: hidden;`.
  - `top-card` (9:16): `.mp-slot-top-card > .mp-cam` is bounded to `top: 0; left: 0; right: 0; height: 28%; bottom: auto; overflow: hidden;`.
- In `engine.ts`, `slotStageSize(project, slot)` computes the slot's true clipped `{ width, height }` and passes `frameWidth`/`frameHeight` alongside clipped `width`/`height` so `--u` stays consistent (`Math.min(frameW, frameH) / 100`) while `mp.W`, `mp.H`, and CSS `height: 100%` match the clipped canvas exactly.
- `mp.stage()` in `reel-kit.ts` becomes a safe no-op on `full`, `backdrop`, `top-card`, and `clean` stages (and always writes `background-color` + `data-mp-stage-bg` when active).

### 2. Mathematically Identical Face-Centered Cover Crop (`video.ts`, `preview-player.tsx`, `video-ffmpeg.ts`)
- Pure helper `coverObjectPosition(focusX, focusY, srcW, srcH, boxW, boxH)` computes the exact CSS `object-position` percentages that align image focal point `(focusX, focusY)` to the exact center of the container — matching FFmpeg's `crop=bw:bh:round(iw*fx-bw/2):round(ih*fy-bh/2)` pixel for pixel.
- `clampSpeakerFocusY(fy)` clamps vertical focus to `[0.18, 0.50]` (default `0.33`) on talking-head stages so erratic model coordinates can never crop to the microphone or lower torso.

### 3. Dedicated `reel.direct` & `reel.build` Tasks (`packages/ai`)
- Keeps legacy `film.direct`, `film.props`, and `film.build` untouched for voiceover-only films (`hasVideo: false`), preserving 100% test & feature compatibility.
- Adds `reelDirectTask` (`id: 'reel.direct'`, `model: cfg.modelStrong`, `thinking: 'MEDIUM'`, `maxOutputTokens: 8192`) and `reelBuildTask` (`id: 'reel.build'`, `model: cfg.modelFilmBuild` = `'gemini-4-neon'`, `thinking: 'LOW'`, `maxOutputTokens: 8192`, with optional `speakerFrame` inline image).
- Prompt module `packages/ai/src/prompts/reel-v2.ts` contains zero Vox-documentary rules, zero cartoon prop instructions, and clean Swiss/Studio + Editorial motion-UI guidance.

### 4. Stage-Matched Reference Library (`packages/motion/src/film/archetypes.ts`)
- Exports `reelExampleFor(stage, archetype)` with clean, clipped-container examples (animated property/easing inspector, icon checklist stack, side-by-side wireframe verification, code/terminal showcase, crisp top-card stat pill, minimal clean editorial stamp).

### 5. Full-Reel Batched Vision QA (`vision-qa.ts` + `film-vision-critic.ts`)
- Batches all non-empty visual beats into chunks of 6, renders `360px`-wide tiles using exact `stageBoxForMode` + face-centered cover crop + clipped executed DOM snapshot + studio seam caption ribbon, and runs `film.vision-critic` on `cfg.modelStrong` (`gemini-4-neon`) in parallel across batches.
- Repairs up to 4 flagged beats total using `rebuildBeat` on the frontier model.

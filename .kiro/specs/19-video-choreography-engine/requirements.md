# Requirements — Spec 19: Video Choreography Engine

## Problem
The v1 default pipeline maps voiceover/video moments onto 9 rigid JSON scene templates and shrinks them into translucent corner boxes (`scale: 0.44`) over a static `<video>` element. That produces repetitive slides, dead gaps between graphics, disconnected hard-snapped zooms, and zero visual interplay between speaker footage and motion graphics.

Meanwhile, Motionpop already contains a 4-stage code-generation engine (**Film Mode**: Director → deterministic word-index beat tiling → parallel bespoke HTML/CSS/SVG/JS Builders on the `mp` kit → Visual Critic repair loop), but it is voiceover-only, hidden behind a manual button, and uses one static example for every beat.

## Requirements

### R1 — Deterministic Gapless Beat Timing & Coupled Video Stage Schema
- R1.1: Every beat in a choreographed video is bounded strictly by transcript word indices (`wordStart`, `wordEnd`, `landsOn`). Deterministic code (`timeBeats`) computes integer millisecond `startMs` / `endMs` so `beat[0].startMs === 0`, `beat[i].endMs === beat[i+1].startMs`, and `beat[last].endMs === durationMs` — zero timeline gaps.
- R1.2: Define six coupled video stage modes (`VideoStageMode`): `full`, `split-left`, `split-right`, `pip`, `backdrop`, and `cutaway`, plus seven visual archetypes (`BeatArchetype`): `kinetic-type`, `hero-stat`, `callout-hud`, `data-chart`, `diagram-flow`, `comparison-split`, and `map-story`.
- R1.3: Provide a pure deterministic spring/eased geometry evaluator `videoStageRectAt(tMs, stages, punchIns, width, height)` in `@motionpop/schemas` that smoothly interpolates video frame bounds (`x, y, w, h`), corner radius, scale, focal point, blur, dim, and opacity across beat boundaries and punch-in windows (no hard snapping).

### R2 — Dynamic Archetype Few-Shot Library & Frameless Video Compiler
- R2.1: Ship a tested, lint-clean library of high-craft `mp` kit reference examples in `@motionpop/motion`, indexed by `(archetype, videoStage)`, so every parallel builder receives an archetype-matched example rather than one generic snippet.
- R2.2: Update `compileProject` in `@motionpop/motion` so `custom` choreographed beats on video projects render full-canvas (`100% × 100%`) on a transparent stage without the v1 `scale(0.44)` boxed card wrapper.

### R3 — Multimodal Video-Aware Director & Parallel Builders (`gemini-4-neon`)
- R3.1: Upgrade `film.direct` (`gemini-4-neon`) to accept optional sampled video keyframes (`frames`) and `hasVideo: true`. When `hasVideo` is true, every beat specifies `archetype`, `videoStage`, `focusX`, `focusY`, `idea`, `text`, `landsOn`, `staging`, and `seam`.
- R3.2: Enforce structural variety in `storyboardIssues`: no two consecutive beats may share the same `archetype`, and on video projects with ≥3 beats the director must vary `videoStage` (never 3 consecutive identical stages).
- R3.3: Upgrade `film.build` (`gemini-4-neon`) to inject dynamic archetype examples and exact safe-zone spatial contracts matching each beat's `videoStage` (`full`, `split-left`, `split-right`, `pip`, `backdrop`, `cutaway`).
- R3.4: Update the visual Critic so transparent video-stage beats (`videoStage !== 'cutaway'`) are inspected cleanly without false-positive background coverage failures.
- R3.5: Support live beat streaming callback (`onBeatReady`) and model override in `makeFilm` so beats appear in the editor as soon as each parallel builder finishes.

### R4 — Live Dancing Preview, Automatic Video Choreography & Controls
- R4.1: Upgrade `PreviewPlayer` to render the project's look canvas behind `<video>` and continuously animate `<video>` geometry, scale, rounded mask, shadow, blur, and dim via `videoStageRectAt(ms)` synchronized with `<hyperframes-player>` on every clock tick.
- R4.2: Automatically trigger the gapless choreography build when opening a newly processed video project (or let users re-run/stop it cleanly from the editor), streaming finished beats live into the timeline with full Undo/Redo support.
- R4.3: Upgrade the Inspector's `VIDEO LAYER` controls (`PlacementSection`) and Pip (`pip.plan` + `apply`) to switch any beat's `videoStage` (`Full`, `Split L`, `Split R`, `PiP`, `Dim BG`, `Cutaway`) in one undoable command.

### R5 — Video Export Wiring & Stage-Aware FFmpeg Compositing
- R5.1: Add `videoPathFor(uid, projectId)` in `@motionpop/schemas` accepting `.mp4`, `.mov`, `.webm`, and wire source video upload in `render-client.ts` (cloud and offline).
- R5.2: Extend `services/render/src/video-ffmpeg.ts` and `run-render.ts` to composite source video with per-beat `videoStage` framing (`full`, `split-left`, `split-right`, `pip`, `backdrop`, `cutaway`) over the look's studio canvas beneath the transparent HyperFrames overlay WebM.

## Constraints
- Strict TypeScript, Zod validation at every boundary, integer milliseconds for all time fields.
- Zero GSAP; all motion graphics remain pure deterministic functions of `tMs` inside `sandbox-origin="opaque"`.
- All runtime AI calls route through `@motionpop/ai` with `gemini-4-neon` default and Pip model selection respected.
- Never break existing voiceover-only Film Mode or unit tests.

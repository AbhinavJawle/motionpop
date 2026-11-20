# Design — Spec 19: Video Choreography Engine

## 1. Coupled Video Stage Model (`packages/schemas`)

### Types
- `VideoStageModeSchema = z.enum(['full', 'split-left', 'split-right', 'pip', 'backdrop', 'cutaway'])`
- `BeatArchetypeSchema = z.enum(['kinetic-type', 'hero-stat', 'callout-hud', 'data-chart', 'diagram-flow', 'comparison-split', 'map-story'])`
- `VideoStageSegmentSchema`:
  ```ts
  {
    id: string;
    startMs: number;
    endMs: number;
    mode: VideoStageMode;
    focusX: number;     // 0..1 speaker focal X (default 0.5)
    focusY: number;     // 0..1 speaker focal Y (default 0.35)
    scaleFrom: number;  // e.g. 1.0
    scaleTo: number;    // e.g. 1.06 subtle kinetic push-in across beat
    pipCorner?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  }
  ```
- Added `stages?: VideoStageSegment[]` to `VideoTrackSchema`, and optional `videoStage?: VideoStageMode`, `archetype?: BeatArchetype`, `focusX?: number`, `focusY?: number` to `StoryBeatSchema` and `SlotSchema`.

### Deterministic Spring/Eased Geometry (`videoStageRectAt`)
Given `(tMs, stages, punchIns, width, height)`:
1. Compute target box per `VideoStageMode` (normalized 0..1):
   - `full`: `{ x: 0, y: 0, w: 1, h: 1, radius: 0, blurPx: 0, dim: 0, opacity: 1 }`
   - `split-left`: `{ x: 0.03, y: 0.06, w: 0.43, h: 0.88, radius: 24, blurPx: 0, dim: 0, opacity: 1 }`
   - `split-right`: `{ x: 0.54, y: 0.06, w: 0.43, h: 0.88, radius: 24, blurPx: 0, dim: 0, opacity: 1 }`
   - `pip` (default `bottom-left`): `{ x: 0.035, y: 0.67, w: 0.24, h: 0.27, radius: 22, blurPx: 0, dim: 0, opacity: 1 }`
   - `backdrop`: `{ x: 0, y: 0, w: 1, h: 1, radius: 0, blurPx: 10, dim: 0.58, opacity: 1 }`
   - `cutaway`: `{ x: 0, y: 0, w: 1, h: 1, radius: 0, blurPx: 0, dim: 0, opacity: 0 }`
2. Across any stage boundary (`tMs - stage.startMs < TRANSITION_MS`, `TRANSITION_MS = 420`), interpolate smoothly from the previous stage's end state to the active stage's target state with an overshoot-free spring/quintic-out curve (`easeOutQuint` / smooth spring).
3. Apply slow continuous kinetic push-in (`lerp(scaleFrom, scaleTo, beatProgress)`) plus smooth eased `punchIns` ramps (360ms ease-in / 360ms ease-out — eliminating hard snaps).

## 2. Dynamic Archetype Examples & Compiler (`packages/motion`)
- `packages/motion/src/film/archetypes.ts`: 7 handcrafted, lint-verified `mp` kit examples matching each `BeatArchetype`, styled to read crisply over both live video (`full`, `backdrop`, `split-*`, `pip`) and opaque studio backgrounds (`cutaway`).
- `packages/motion/src/compiler/compile.ts`:
  - Custom slots (`s.componentId === 'custom'`) on video projects get `.mp-slot-choreo` (`position: absolute; inset: 0; background: transparent; pointer-events: none`) instead of `.mp-slot-overlay` (`scale: 0.44` card).
  - Non-custom legacy slots still fall back gracefully if present.
- `packages/motion/src/film/critic.ts`: add `transparent?: boolean` option so video-stage beats (`videoStage !== 'cutaway'`) skip opaque-coverage penalties while still checking clipping, overlap, tiny text, zero motion, and runtime errors.

## 3. Unified Multimodal Director + Parallel Builders (`packages/ai`)
- `FilmDirectInputSchema` gains optional `hasVideo?: boolean` and `frames?: { timeMs: number; mimeType: 'image/jpeg' | 'image/png'; base64: string }[]`.
- `filmDirectTask` attaches `mediaList` from `frames` when present.
- `FILM_DIRECT_SYSTEM_V1` + `filmDirectPromptV1` instruct `gemini-4-neon` on video choreography rules (rotating archetypes, varying `videoStage`, speaker focal point from keyframes, zero gaps via word indices).
- `storyboardIssues` enforces:
  - 100% word coverage `0..words.length-1` with no gaps/overlaps
  - No two consecutive beats with identical `archetype` (when `archetype` is set)
  - On video projects with ≥3 beats, never 3 identical `videoStage` values in a row
- `makeFilm` passes `archetypeExample(beat.archetype, beat.videoStage)` and the exact `videoStage` safe-zone contract into each parallel `film.build` call, forwards `opts.model`, and invokes `onBeatReady(beatResult, index, storyboard)` immediately as each parallel beat finishes so the UI can stream graphics in live.

## 4. Dancing Preview, Auto-Choreography & Controls (`apps/web`)
- `PreviewPlayer`:
  - Renders look studio background (`style.colors.bg`) behind the video container.
  - Wraps `<video>` in a GPU-composited animated stage wrapper driven by `videoStageRectAt(ms, ...)` on every `subscribePreviewSeek` tick (`left/top/width/height`, `borderRadius`, `boxShadow`, `opacity`, `filter`, and inner `<video>` `objectPosition` + `scale`).
- `apps/web/lib/film/film.ts` & `use-film.ts`:
  - Reads keyframes from `project.video` (or samples 4–6 frames on demand if needed) when `project.video` exists, runs `makeFilm` with `hasVideo: true` + live `onBeatReady` progressive slot updates, and writes synchronized `project.video.stages` from the storyboard's timed beats!
  - Respects Pip's selected model (`usePipModel`).
- Auto-choreography on new video project arrival in `EditorScreen`:
  - New video projects created by `/processing/new` set a transient one-shot flag (e.g. `needsChoreography` / session marker) so `/editor/[id]` automatically starts the gapless choreography build right on entry, streaming live beats onto the timeline with a Cancel button in the timeline header.
- Inspector `PlacementSection` + `commands/video.ts` + `pip/plan.ts` + `pip/apply.ts`:
  - Expose all 6 `videoStage` modes (`Full`, `Split L`, `Split R`, `PiP`, `Dim BG`, `Cutaway`) per slot, keeping `project.video.stages` synchronized with the slot's timing.

## 5. Video Export Wiring & Stage-Aware FFmpeg (`services/render`, `apps/web/lib/renders`)
- `videoPathFor(uid, projectId)` in `packages/schemas/src/render.ts` validates `users/{uid}/video/{projectId}/source-{hash16}.(mp4|mov|webm)`.
- `RenderRequestSchema` accepts optional `videoPath`.
- `render-client.ts` resolves and uploads `project.video.src` when `project.video` is present (Storage for cloud, multipart `video` field for offline).
- `video-ffmpeg.ts` composites the cut footage onto a `color=<bgColor>` studio canvas using each beat's `videoStage` (`full`, `split-left`, `split-right`, `pip`, `backdrop` blur/dim, `cutaway`) and overlays the transparent HyperFrames WebM + audio.

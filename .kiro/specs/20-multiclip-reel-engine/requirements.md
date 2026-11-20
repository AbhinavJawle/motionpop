# Spec 20 — Multi-Clip Media Bin & Multimodal Reel Choreography Engine

## Problem

Real creator Reels and short-form explainers are never just a single talking-head camera angle: creators drop in their **A-roll talking head**, plus **B-roll clips**, **product / code screen recordings**, and **screenshots / charts / photos** — and expect the editor to watch every clip, understand what happens in each moment, and weave them together with the speaker and bespoke motion graphics so the entire video flows and dances with zero dead air.

Spec 19 established gapless speaker-video + frameless motion choreography (`full`, `split-left`, `split-right`, `pip`, `backdrop`, `cutaway`). Spec 20 extends Motionpop into a full **Multi-Clip Reel Engine** powered by `gemini-4-neon`:

1. **Multi-Clip Media Bin (`A-roll` + `B-roll` + `Screen Recordings` + `Screenshots/Photos`)** — creators can attach extra B-roll videos, screen recordings, and screenshots right on `/start` alongside their main A-roll video (or add/manage them anytime in the Editor's Media panel).
2. **Multimodal Clip Indexing (`media.index`)** — the browser extracts compact JPEG keyframe strips from every uploaded B-roll / screen recording (or downscaled JPEG from screenshots) and sends them to `gemini-4-neon`, which returns structured clip metadata (`kind`, `summary`, `tags`, `dominantColors`, and `bestMoments: [{ startMs, endMs, focusX, focusY, zoom, description }]`) including Screen-Studio-style UI zoom targets for raw uploaded screen recordings without requiring any cursor log.
3. **4 New Multi-Clip Reel Choreography Stages** — wired end-to-end across schemas, deterministic spring geometry, Director, Builders, live 60fps preview, Inspector, and Pip:
   - `split-top-broll`: B-roll / screen recording plays in the upper half while the speaker stays anchored below (or side-by-side in 16:9), with kinetic motion labels dancing along the seam.
   - `screen-showcase`: Uploaded screen recording floats in a sleek 3D-tilted rounded window frame with smooth auto-zoom toward `(clipFocusX, clipFocusY)`, speaker docked in a crisp PiP corner, and frameless vector callout arrows pointing directly at the zoomed UI area.
   - `broll-full`: J/L-cut full-bleed B-roll playing seamlessly over the speaker's voiceover while frameless motion typography & highlight badges dance over the footage.
   - `media-card-pop`: User's screenshot / photo springs onto the stage in a clean floating showcase frame alongside the speaker with animated highlight callouts.
4. **Beat 1 Viral Hook & Prosody-Aware Directing** — the Director receives the indexed Media Bin catalog AND vocal prosody stress words from on-device audio analysis so Beat 1 opens with an immediate visual hook and emphasis animations land on the exact stressed words.

## Requirements

### R1 — Multi-Clip Schemas & Deterministic Dual-Layer Spring Geometry (`@motionpop/schemas`)
- R1.1: Extend `VIDEO_STAGE_MODES` with `'split-top-broll'`, `'screen-showcase'`, `'broll-full'`, `'media-card-pop'` (10 total modes).
- R1.2: Define `MediaClipKindSchema` (`'broll' | 'screen-recording' | 'screenshot' | 'photo'`), `MediaClipMomentSchema` (`{ startMs, endMs, focusX, focusY, zoom, description }`), and `MediaClipSchema` (`{ id, name, src, kind, mimeType, width, height, durationMs?, summary?, tags?, dominantColors?, moments?, indexedAt? }`).
- R1.3: Add optional `mediaBin: MediaClip[]` (max 24 clips) on `EditorProjectBaseSchema`, and optional clip-binding fields (`clipId`, `clipStartMs`, `clipEndMs`, `clipFocusX`, `clipFocusY`, `clipZoom`) on `VideoStageSegmentSchema`, `StoryBeatSchema`, and `SlotSchema`.
- R1.4: Extend `videoStageRectAt` for all 10 modes AND export `mediaLayerRectAt(cleanedMs, stages, width, height)` — a pure deterministic evaluator returning exact frame pixels, corner radius, 3D tilt (`rotateX`, `rotateY`), inner zoom scale, focal point (`focusX`, `focusY`), window-chrome flag (`framed`), and smooth 420ms quintic-out spring transitions (`opacity`, position, scale) so the speaker layer and B-roll/screen-recording/screenshot layer dance together at 60fps.
- R1.5: Extend `stagesFromTimedBeats` to preserve `clipId`, `clipStartMs`, `clipEndMs`, `clipFocusX`, `clipFocusY`, `clipZoom` on generated `VideoStageSegment`s.
- R1.6: Extend `PipActionSchema` / `PipStepSchema` with `setBeatClip` and all 10 `VideoStageMode` values.
- R1.7: Extend `PendingIntakeSchema` in `packages/schemas/src/start.ts` with optional `extraClips` so multi-clip uploads survive `/start` → `/processing/new` hand-off cleanly.

### R2 — Multimodal `media.index` & Multi-Clip Director/Builder (`@motionpop/ai` & `@motionpop/motion`)
- R2.1: Add `mediaIndexTask` (`media.index`) in `packages/ai/src/tasks/media-index.ts` using `modelStrong` (`gemini-4-neon`) with clean hand-crafted JSON Schema (`jsonSchema`) and `mediaList` keyframes to classify and summarize every uploaded B-roll video, screen recording, and screenshot, returning `bestMoments` with normalized `(focusX, focusY, zoom)` UI/subject targets.
- R2.2: Upgrade `film.direct` (`FilmDirectInputSchema`, `storyboardJsonSchema`, `filmDirectPromptV1`, `FILM_DIRECT_SYSTEM_V1`) to accept `mediaBin` (clip catalog with summaries & best moments) and `stressedWords` (from on-device prosody), instructing `gemini-4-neon` to:
  - weave user clips into beats via `split-top-broll`, `screen-showcase`, `broll-full`, `media-card-pop` with explicit `clipId`, `clipStartMs`, `clipFocusX`, `clipFocusY`, `clipZoom`;
  - enforce an immediate Beat 1 Viral Hook;
  - validate in `storyboardIssues` that any referenced `clipId` exists in `mediaBin` (when `mediaBinIds` is supplied).
- R2.3: Upgrade `packages/motion/src/film/archetypes.ts` (`videoStageZoneGuide`) to provide exact spatial safe-zone + callout coordinate contracts for all 10 stages (including targeting `(clipFocusX, clipFocusY)` on `screen-showcase` and `media-card-pop`).

### R3 — Multi-Clip Intake, Media Bin Storage & Auto-Indexing (`apps/web`)
- R3.1: Build `apps/web/lib/video/media-bin.ts` to ingest video (`mp4/mov/webm`) and image (`png/jpg/webp`) files into `appAudioStore()`, probe dimensions/duration/keyframes (videos via `probeAndSampleVideo`, images via canvas downscale), and batch-index them with `media.index` (`gemini-4-neon`), with a clean offline/deterministic fallback when cloud AI is unavailable.
- R3.2: Upgrade `/start` (`UploadCard`, `handOffFile` / `handOffFiles`, `pending.ts`, `processing-screen.tsx`, `pipeline/run.ts`) so creators can attach optional extra B-roll / screen-recording / screenshot files right alongside their main A-roll upload (or drop multiple files at once — longest/first video becomes A-roll, rest become `mediaBin` clips!).
- R3.3: Upgrade `MediaPanelBody` (`apps/web/components/editor/media-panel.tsx`) with a **"Project Clips"** section showing every clip in `project.mediaBin` with its kind badge (`B-Roll`, `Screen`, `Screenshot`), AI summary/tags, upload button (supports multiple videos & images), delete button, "Analyze with AI" trigger, and one-click "Use on beat" button.
- R3.4: Add undoable commands in `apps/web/lib/commands/video.ts`: `addMediaClips`, `updateMediaClips`, `removeMediaClip`, and `setSlotMediaClip` (which also updates `video.stages`).

### R4 — Live Multi-Layer 60fps Dancing Preview, Inspector & Pip (`apps/web`)
- R4.1: Upgrade `PreviewPlayer` (`apps/web/components/editor/preview-player.tsx`) to mount a second spring-animated **Media Stage Layer (`data-testid="preview-media-stage"`)** driven by `mediaLayerRectAt(ms)` at 60fps:
  - Renders active B-roll / screen-recording `<video>` synced to `clipStartMs + (ms - beatStartMs)` (looped/clamped safely inside clip duration) with smooth auto-zoom toward `(clipFocusX, clipFocusY)` and optional sleek macOS-style window header + 3D perspective tilt when `mode === 'screen-showcase'`;
  - Renders uploaded screenshot/photo `<img>` with spring pop and soft shadow when `mode === 'media-card-pop'` (or image clip on any media stage);
  - Dances smoothly alongside the A-roll `<video>` stage (`data-testid="preview-video-stage"`) and transparent `<hyperframes-player>` layer.
- R4.2: Upgrade `makeFilmForProject` (`apps/web/lib/film/film.ts`) to auto-index any unindexed clips in `project.mediaBin` before calling `film.direct`, pass `mediaBin` + `stressedWords` to `makeFilm`, and preserve `clipId` / `clipStartMs` / `clipFocusX` / `clipFocusY` / `clipZoom` on resulting slots and `video.stages`.
- R4.3: Upgrade `PlacementSection` (`apps/web/components/inspector/placement-section.tsx`) to expose all 10 stage modes + a Clip selector when a media stage is active or clips exist in `mediaBin`.
- R4.4: Wire all 10 stage modes + `setBeatClip` into Pip (`pip-plan.ts`, `pip-plan.v1.ts`, `apps/web/lib/pip/plan.ts`, `apps/web/lib/pip/apply.ts`).

## Non-Goals (Covered in Specs 21–22)
- Modern Reel looks (`Creator Dark`, `Keynote Clean`), kinetic active-word captions, whip-pan transitions, stage-glide SFX, live audio re-splicing on cut toggle, and multi-clip FFmpeg MP4 export → **Spec 21**.
- Multimodal contact-sheet Vision Critic QA & speed tuning → **Spec 22**.

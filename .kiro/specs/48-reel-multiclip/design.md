# Design — Spec 48: Native Multi-Clip Editing & A-Roll Selection for the Reel Engine

## Architecture Summary
Rather than reviving the legacy Slot/Film engine (`PreviewPlayer` + `video-ffmpeg.ts`) or stacking uncoordinated `StockOverlaysLayer` boxes over Reel scenes, user clips become **first-class scenes inside the Reel Engine** (`ReelTemplateSchema` + `mountReel` + `compileReel`). Because `mountReel` runs identically in the browser (`ReelPreview`) and in headless Chromium (`compileReel` / HyperFrames), preview and export share one code path.

## Key Changes

### 1. Intake & Configure (`packages/schemas/src/start.ts`, `apps/web/lib/intake/`, `apps/web/lib/pipeline/jobs-store.ts`, `apps/web/components/configure/`)
- Extend `PendingExtraClipSchema` with optional `kindHint?: MediaClipKind` (`broll` | `screen-recording` | `screenshot` | `photo`) and `sizeBytes?: number`.
- Update `handOffFiles` in `apps/web/lib/intake/hand-off.ts`: prefer the first audio/video file (rather than largest by byte size) as initial primary A-roll, store `sizeBytes` on extra clips, and keep the remaining up to 12 supported clips in `extraClips`.
- Extend `Job` in `apps/web/lib/pipeline/jobs-store.ts` with `extraClips?: JobExtraClip[]` (carrying `ref`, `name`, `mimeType`, `sizeBytes`, optional `kindHint`, `thumbUrl`, `durationMs`, `width`, `height`) and expose store mutations:
  - `addJobExtraClips(id, files)` — validates, stores in `appAudioStore`, updates pending intake + job state, probes thumbnails lazily.
  - `removeJobExtraClip(id, ref)` — removes clip from job + pending intake.
  - `setJobExtraClipKind(id, ref, kindHint)` — updates user role hint.
  - `swapJobPrimaryClip(id, ref)` — swaps the selected video/audio extra clip with the current primary take, aborts the previous prep, updates `PendingIntake`, resets `rt.audio`/`rt.probe`/`rt.transcript`, and restarts `runPrep` on the new primary blob.
- Update `MediaCard` / `ConfigureScreen` to render the multi-clip tray whenever the job is a video or voiceover, with clear **"Main A-roll"** badge on the primary card, **"Make main"** button on every video/audio extra clip, role selector (`Auto`, `B-roll`, `Screen`, `Screenshot`), remove button, and **"+ Add B-roll / clips"** file picker.

### 2. Pipeline Ingestion & Vision Indexing (`apps/web/lib/pipeline/run.ts`, `apps/web/lib/pipeline/browser-deps.ts`)
- Add optional `indexMediaClips?(clips, preSampled, signal)` dep to `PipelineDeps`, wired in `browserPipelineDeps` to `indexUnindexedMediaClips` using `getRouter()`.
- Preserve `kindHint` from `PendingExtraClip` through `ingestExtraClip` (and pass frames from `ingestMediaClipBlob` so `indexUnindexedMediaClips` doesn't re-decode videos).
- In both the talking-head Reel branch (`isVideoInput && !input.single`) and voiceover Reel branch (`!isVideoInput && !input.single && deps.directReel`) of `runPipeline`:
  1. Start ingesting + indexing `input.extraClips` into `mediaBin` (preserving user `kindHint` if set).
  2. Pass summarized `mediaBin` metadata into `deps.directReel`.
  3. Persist `mediaBin` on the saved `EditorProject`.

### 3. Reel Engine Multi-Clip Support (`packages/schemas/src/reel.ts`, `packages/ai/src/reel/`, `packages/motion/src/reel/`, `apps/web/components/editor/reel-preview.tsx`, `apps/web/lib/renders/`, `services/render/src/`)
- **Schema (`packages/schemas/src/reel.ts`):**
  - Add `'pip'` to `ReelLayoutSchema`.
  - Add `clip` variant to `ReelTemplateSchema`:
    - `template: 'clip'`
    - `clipId: z.string().min(1).max(64)`
    - `clipStartMs: z.number().int().nonnegative().default(0)`
    - `fit: z.enum(['cover', 'screen-window', 'card']).default('cover')`
    - `focusX: z.number().min(0).max(1).default(0.5)`
    - `focusY: z.number().min(0).max(1).default(0.5)`
    - `zoom: z.number().min(1).max(2.5).default(1.0)`
    - `label: short(40).optional()`
    - `audioMode: z.enum(['mute', 'duck', 'solo']).default('mute')`
  - Add helper `reelClipIdsOf(plan): string[]` for upload/render discovery.
- **Director (`packages/ai/src/reel/director.ts`, `prompt.ts`):**
  - Add optional `mediaBin` array to `ReelDirectInputSchema`.
  - Add `clip` to `G` (director output schema) and JSON Schema builder (dynamically enumerating valid `clipId`s when `mediaBin` is present, or omitting/restricting when empty).
  - Add `'pip'` to allowed layouts when `!noVideo`.
  - Teach `REEL_DIRECT_SYSTEM_V3` + `reelDirectPromptV3` how to weave uploaded B-roll, screen recordings, and screenshots into matching beats with `clipStartMs`, `focusX`, `focusY`, and `zoom` from indexed moments.
  - Validate `clipId` against `input.mediaBin` in `toReelPlan`; if invalid, fall back cleanly to `headline` / `none`.
- **Motion Engine (`packages/motion/src/reel/looks.ts`, `mount.ts`, `templates.ts`, `compile.ts`):**
  - Support `'pip'` layout in `looks.ts` (`graphicArea` = full frame) and `mount.ts` (`speakerBox('pip')` = rounded corner PiP at bottom-right with drop shadow, elevated above graphic panel).
  - Add `clips?: Record<string, ReelClipMedia>` (`{ src, isVideo, w, h, durationMs?, name? }`) to `ReelData` and `ReelCompileInput`.
  - In `templates.ts`, implement `clip` template:
    - `'cover'`: full-bleed inside graphic area with deterministic eased zoom/pan toward `(focusX, focusY, zoom)` across the scene duration.
    - `'screen-window'`: sleek framed window (title bar dots + subtle 3D perspective tilt + shadow) with smooth auto-zoom into `(focusX, focusY, zoom)` over the scene.
    - `'card'`: elevated rounded media card with soft shadow and gentle float-in reveal.
    - For video clips, in preview (`ReelPreview`) it renders a muted/volume-controlled `<video>` synced to `clipStartMs + (t - startMs)` (looped mod `durationMs`); in export (`compileReel`) it binds to HyperFrames timed `<video id="clip_sN" class="clip" data-start="..." data-duration="..." data-media-start="..." data-has-audio="...">` elements placed inside the scene container or tracked cleanly by HyperFrames!
    - Note on HyperFrames video tracking: HyperFrames tracks top-level `.clip` `<video>` elements inside the composition for frame-exact seeking & audio mixing. For `compileReel`, we emit each video clip scene's `<video id="mclip_${i}" class="clip" data-start="..." data-duration="..." data-media-start="..." data-track-index="1" data-has-audio="${audioMode !== 'mute'}">` inside a dedicated `[data-reel-clips]` host (or tagged `data-reel-clip-scene="${s.id}"`) so `mountReel` adopts the existing `<video>` node without moving it out of HyperFrames' reach — matching how `vwrap` adopts `#spk0..N`!
- **Render Upload & Worker (`apps/web/lib/renders/voice-upload.ts`, `render-client.ts`, `services/render/src/run-render.ts`):**
  - Update `uploadMediaBinClips` (or caller in `render-client.ts`) to gather `clipId`s from BOTH `project.video.stages` AND `reelClipIdsOf(project.reel)`.
  - In `run-render.ts`, download `doc.clipPaths` whenever `project.mediaBin?.length` AND (`videoComposite` OR `useReelEngine`). For `useReelEngine`, place downloaded clips in `compDir/assets/mclip-N.<ext>`, run `ffmpeg.proxyVideo` on video clips for frame-accurate H.264 CFR playback, and pass `clips` into `compileReel`.

### 4. Editor Controls, Late Uploads & Pip (`apps/web/lib/commands/`, `apps/web/components/editor/media-panel.tsx`, `apps/web/components/inspector/`, `packages/ai/src/tasks/pip-plan.ts`, `apps/web/lib/pip/plan.ts`)
- Add undoable Reel command `setReelSceneClip(sceneId, clipId, opts?)` (and `replaceReelScenes(scenes)`) in `apps/web/lib/commands/reel.ts`.
- Update `MediaPanel`:
  - Show **"On scene"** button for Reel projects (bound to selected scene or scene under playhead) so creators can bind/unbind a Media Bin clip directly as a native `clip` scene.
  - Add **"Weave into reel (AI)"** button when `project.reel && mediaBin.length > 0`, invoking `directReelPaid` with the current transcript + indexed `mediaBin` and replacing `project.reel.scenes` via an undoable command (preserving cuts & music).
- Update Reel scene inspector (`apps/web/components/inspector/reel-scene-section.tsx` or equivalent) to expose `clip` template fields (`clipId`, `layout`, `fit`, `clipStartMs`, `zoom`, `focusX`/`focusY`, `label`, `audioMode`).
- Update Pip (`packages/ai/src/tasks/pip-plan.ts`, `prompts/pip-plan.v2.ts`, `apps/web/lib/pip/plan.ts`) to support `setReelSceneClip` for Reel projects alongside legacy `setBeatClip`.

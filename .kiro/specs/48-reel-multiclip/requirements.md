# Requirements — Spec 48: Native Multi-Clip Editing & A-Roll Selection for the Reel Engine

## Overview
Creators frequently record a main talking-head video alongside secondary clips (screen recordings, own B-roll videos, and screenshots). Today, multi-file drops guess the primary A-roll by largest byte size, and talking-head projects take the Reel Engine path that drops `extraClips` completely. This spec brings multi-file intake, explicit A-roll selection, Gemini vision indexing, native Reel Engine clip choreography (preview + export), and editor/Pip controls to Reel projects.

## Requirements

### R1 — Multi-File Intake & Explicit A-Roll Selection
1. **R1.1 (Default primary selection):** WHEN a creator drops or selects multiple files on `/start`, the system SHALL pick an initial primary A-roll (preferring the first video/audio file rather than blindly choosing the largest byte size) and attach up to 12 additional supported videos/images as `extraClips`.
2. **R1.2 (Configure clip tray):** WHEN `/start/configure` renders for a video or voiceover job, the system SHALL display any attached extra clips in a clip tray under the main media card and provide an "+ Add B-roll / screen recording" control so creators can attach additional files before clicking Create.
3. **R1.3 (User chooses main talking head):** WHEN a video extra clip is shown on `/start/configure`, the system SHALL allow the creator to click "Make main" to swap that clip with the current primary A-roll, persisting the updated pending intake and restarting free local preparation (decode, probe, Whisper transcription) on the newly selected primary file.
4. **R1.4 (Clip tagging & removal):** WHEN extra clips are shown on `/start/configure`, the system SHALL allow the creator to remove any extra clip or tag its role (`auto`, `broll`, `screen-recording`, `screenshot`, `photo`) before creating the project.

### R2 — Pipeline Ingestion & Vision Indexing for Reel Projects
1. **R2.1 (Reel ingestion):** WHEN `runPipeline` runs for a talking-head reel or a voiceover reel with `input.extraClips`, the system SHALL ingest those clips via `deps.ingestExtraClip` into `project.mediaBin` and store them under the project.
2. **R2.2 (Pre-direct vision indexing):** WHEN `project.mediaBin` has unindexed clips during Reel pipeline execution and an indexer is available, the system SHALL run vision indexing (`indexUnindexedMediaClips`) before calling `deps.directReel`, populating `kind`, `summary`, `tags`, and zoomable `moments` (`startMs`, `endMs`, `focusX`, `focusY`, `zoom`) while respecting user-selected role tags.

### R3 — Native Multi-Clip Support in the Reel Engine (Schema, Director, Preview, Export)
1. **R3.1 (Schema):** `ReelTemplateSchema` SHALL support a native `clip` template (`clipId`, `clipStartMs`, `fit: 'cover' | 'screen-window' | 'card'`, `focusX`, `focusY`, `zoom`, optional `label`, `audioMode: 'mute' | 'duck' | 'solo'`) and `ReelLayoutSchema` SHALL support `'pip'` (full-frame graphic/clip with rounded corner speaker PiP).
2. **R3.2 (Director choreography):** WHEN `directReel` receives non-empty `mediaBin` clips, the director prompt and output schema SHALL allow choosing `template: 'clip'` scenes paired with `'split'`, `'pip'`, `'full'`, or `'card'` layouts, using indexed `moments` for smooth UI focus-zoom on screen recordings and validating every `clipId` against the provided `mediaBin` IDs.
3. **R3.3 (Deterministic preview rendering):** WHEN `mountReel` renders a `clip` template in `ReelPreview`, it SHALL display the bound video or image clip with deterministic `seek(ms)` eased pan/zoom toward `(focusX, focusY, zoom)`, optional window chrome for `screen-window`, rounded framing for `card`, and smooth speaker PiP positioning for `'pip'` layout, with zero graphic collisions.
4. **R3.4 (Export parity):** WHEN exporting a Reel project with `clip` scenes, the render client SHALL upload referenced `mediaBin` clips in `clipPaths`, and the render worker SHALL download `clipPaths` even when `useReelEngine` is true, transcode secondary video clips into upright CFR H.264 proxies via `ffmpeg.proxyVideo`, and pass them into `compileReel` as timed `<video>` / `<img>` elements so export matches preview.

### R4 — Editor Controls, Late Uploads & Pip AI Chat
1. **R4.1 (Bind clip to Reel scene):** WHEN editing a Reel project in the Media Panel, clicking "On scene" on a Media Bin clip SHALL bind or clear that clip on the currently selected (or playhead) `ReelScene` as a native `clip` template scene.
2. **R4.2 (Weave late-uploaded clips with AI):** WHEN a Reel project has Media Bin clips, the Media Panel SHALL provide a "Weave into reel" action that asks the Reel director to weave the Media Bin clips into matching scenes while preserving cuts and music.
3. **R4.3 (Inspector controls):** WHEN a `clip` Reel scene is selected in the editor, the Reel scene inspector SHALL expose controls for layout (`split`, `pip`, `full`, `card`), framing (`cover`, `screen-window`, `card`), start offset (`clipStartMs`), zoom/focus, and clip audio mode (`mute`, `duck`, `solo`).
4. **R4.4 (Pip chat integration):** WHEN a creator asks Pip to place, swap, or adjust a Media Bin clip on a Reel project, Pip SHALL emit a Reel-aware action (`setReelSceneClip`) that updates `project.reel.scenes` directly.

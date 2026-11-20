# Spec 18 · Native AI Video + Motion Graphics Editor (Gemini 4 Neon)

## Goal
Turn Motionpop's own `/editor/[id]` into a unified AI video + motion graphics editor that accepts raw talking-head or explainer videos (30 s–3 min, MP4/MOV/WebM), analyzes speech and visual framing with **Gemini 4 Neon** (and selectable models in Pip), automatically cuts retakes/mistakes/dead air, adds punch-in zooms, places transparent overlays and full-screen motion graphic cutaways synced to spoken words, lets the creator refine edits via transcript or Pip (with on-device Gemini Nano for fast free edits), and exports a finished 1080p MP4 through `services/render`.

Voiceover-only projects continue to work unchanged in the same schema, editor, and render service.

## Requirements (EARS)

### R1 · Clean Native Architecture (Superseding D-076)
- **R1.1:** The repository SHALL contain no vendored third-party video editor UI, no `/studio` route, and no GSAP dependency; the repository licence SHALL be Apache-2.0 (D-077).
- **R1.2:** When a user uploads a video file on Start or Processing, the app SHALL process it and open Motionpop's own `/editor/[id]`.

### R2 · Video-Native Project Schema
- **R2.1:** `EditorProject` SHALL support an optional `video` field storing the source asset ref, natural width/height, original duration in integer milliseconds, non-destructive `cuts[]` (each with `id`, `startMs`, `endMs`, `kind: 'silence' | 'filler' | 'retake' | 'ramble' | 'manual'`, `reason`, `enabled`), `punchIns[]` (each with `id`, `startMs`, `endMs`, `scale`, `focusX`, `focusY`, `reason`), and `safeRegion` (speaker face-safe overlay zone).
- **R2.2:** Each `Slot` SHALL support an optional `placement` (`'cutaway' | 'overlay'`, default `'cutaway'` for voice-only projects and `'overlay'` or `'cutaway'` as directed for video projects) and optional `overlayAnchor` (`'top-right' | 'top-left' | 'lower-third' | 'side-right' | 'side-left' | 'center'`).
- **R2.3:** All existing voiceover-only `EditorProject` fixtures and saved projects without `video` or `placement` SHALL parse and render identically without migration errors.

### R3 · Gemini 4 Neon & Pip Model Selector
- **R3.1:** `APP_CONFIG_DEFAULTS.modelStrong` SHALL default to `gemini-4-neon` (verified on Vertex `global` endpoint), while keeping `modelFast` (`gemini-3.5-flash-lite`) and Remote Config overrides intact.
- **R3.2:** `packages/ai` `Router.run` SHALL accept an optional `model` override in `RunOptions` so callers (Pip, video director, custom motion graphics) can target a user-selected model while preserving zod validation, repair, cost tracking, and usage logging.
- **R3.3:** The Pip panel SHALL expose a model selector allowing the creator to pick among supported cloud models (`gemini-4-neon` default, `gemini-4-hydrogen`, `gemini-4-carbon`, `gemini-3.8-flash`, `gemini-3.5-flash-lite`), persisted per browser session/localStorage, and displaying the selected model on Pip replies and usage events.
- **R3.4:** On-device Gemini Nano (`PREFER_ON_DEVICE`) SHALL remain active for free instant quick edits, frame notes, and auto-fill so #BuildHybridAI hybrid inference stays front and center.

### R4 · Video Intake, Frame Sampling & Multimodal AI Video Directing
- **R4.1:** When a video is uploaded (MP4/MOV/WebM up to 500 MB), the processing pipeline SHALL probe dimensions/duration, extract audio for on-device Whisper transcription + prosody, sample up to 8 evenly spaced low-res JPEG keyframes on-device, store the video blob in `AudioStore` (IndexedDB + Firebase Storage when signed in), and preserve the video's native aspect ratio (`16:9`, `9:16`, or `1:1`).
- **R4.2:** A new `packages/ai` task `video.direct` (defaulting to `gemini-4-neon` in the cloud, with a deterministic code fallback when offline/local) SHALL inspect the word-timed transcript + sampled keyframes and return a zod-validated `VideoEditPlan`:
  - smart `cuts` (retakes, false starts, stumbles, dead air, rambling — mapped strictly to valid integer ms ranges on the source timeline),
  - `punchIns` (emphatic zoom moments with `scale` in `[1.08, 1.3]` and focal point `(focusX, focusY)`),
  - `safeRegion` (where the speaker sits so overlays avoid covering their face),
  - `slots` placement hints (`overlay` vs `cutaway` + `overlayAnchor`).
- **R4.3:** Every cut, punch-in, and slot returned by `video.direct` SHALL be enforced and clamped in pure code (no overlapping cuts, never removing >65% of spoken words, valid ms bounds) with property-based tests.

### R5 · Live Cut/Zoom Video + Transparent Overlay Preview in `/editor/[id]`
- **R5.1:** When `project.video` is present, [PreviewPlayer](file:///Users/abhinavjawle/Developer/motionpop/apps/web/components/editor/preview-player.tsx) SHALL render a `<video>` layer synchronized to `PlaybackClock` behind a transparent `<hyperframes-player>` layer.
- **R5.2:** During playback and scrubbing, enabled `video.cuts` SHALL be skipped smoothly in real time (mapping cleaned timeline ms ↔ source video ms via pure `mapCleanedToSource` / `mapSourceToCleaned` helpers), and active `video.punchIns` SHALL apply deterministic CSS `transform: scale(...)` centered on `(focusX, focusY)`.
- **R5.3:** Slots with `placement: 'overlay'` SHALL compile with a transparent background and safe-area positioning (`overlayAnchor`) over the live speaker footage; slots with `placement: 'cutaway'` SHALL render their full-frame opaque look background over the footage.
- **R5.4:** In the editor timeline and Inspector, creators SHALL be able to toggle/restore any AI cut, manually cut/restore a word range, toggle punch-ins, and switch any slot between **Overlay** and **Full-screen cutaway** with full undo/redo support.

### R6 · Agentic Pip Video Editing
- **R6.1:** `pip.plan` SHALL support video editing actions (`cutRange`, `toggleCuts`, `addPunchIn`, `setPlacement`) alongside existing slot/style/caption/format actions, enforced in pure code and applied as a single undoable composite command.
- **R6.2:** When a video project is open, Pip SHALL offer video-aware quick chips (e.g., *"Cut retakes & dead air"*, *"Add punch-ins on key points"*, *"Make graphics transparent overlays"*, *"Turn this into a full motion film"*) and run using the model selected in Pip's model picker (default `gemini-4-neon`).

### R7 · Real Final MP4 Video Export (`services/render`)
- **R7.1:** When `project.video` is present, `services/render` SHALL download the source video from Storage, build a deterministic FFmpeg filter graph to trim/concat kept segments and apply punch-in crop/scale transforms, render Motionpop's motion graphics + captions with alpha channel (WebM VP9+alpha or PNG sequence via HyperFrames), composite the graphics over the edited video, mux cleaned voice + SFX + ducked music, and output the final 1080p H.264 MP4 + thumbnail.
- **R7.2:** Voiceover-only exports SHALL continue through the existing fast path unchanged.

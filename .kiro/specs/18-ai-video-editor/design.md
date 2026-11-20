# Spec 18 · Design

## 1. Unified Data Model (`packages/schemas`)
- New `packages/schemas/src/video.ts`:
  - `VideoCutSchema`: `{ id, startMs, endMs, kind: 'silence' | 'filler' | 'retake' | 'ramble' | 'manual', reason, enabled }` (source-clock integer ms, `endMs > startMs`).
  - `VideoPunchInSchema`: `{ id, startMs, endMs, scale (1.05..1.4), focusX (0..1), focusY (0..1), reason }` (cleaned-timeline integer ms).
  - `OverlayAnchorSchema`: `'top-right' | 'top-left' | 'lower-third' | 'side-right' | 'side-left' | 'center'`.
  - `SlotPlacementSchema`: `'cutaway' | 'overlay'`.
  - `VideoTrackSchema`: `{ src, width, height, originalDurationMs, cuts: VideoCut[], punchIns: VideoPunchIn[], defaultOverlayAnchor: OverlayAnchor }`.
  - Pure time-mapping helpers (shared by preview, timeline, commands, and FFmpeg export):
    - `keptSourceSegments(originalDurationMs, cuts)` → sorted non-overlapping `[{ startMs, endMs, timelineStartMs, timelineEndMs }]`
    - `cleanedToSourceMs(cleanedMs, segments)` → exact source-video ms
    - `sourceToCleanedMs(sourceMs, segments)` → cleaned ms or `null` if inside a cut
    - `activePunchIn(cleanedMs, punchIns)` → active punch-in or `null`
- Extend `SlotSchema` in `packages/schemas/src/project.ts` with optional `placement?: SlotPlacement` and `overlayAnchor?: OverlayAnchor`.
- Extend `EditorProjectBaseSchema` with optional `video?: VideoTrack`.
- Extend `AppConfigSchema` / `APP_CONFIG_DEFAULTS` in `packages/schemas/src/config.ts`:
  - `modelStrong: 'gemini-4-neon'` (default)
  - Export `PIP_MODEL_CHOICES`:
    1. `gemini-4-neon` ("Gemini 4 Neon · Frontier")
    2. `gemini-4-hydrogen` ("Gemini 4 Hydrogen · Fast Frontier")
    3. `gemini-4-carbon` ("Gemini 4 Carbon · Deep Reasoning")
    4. `gemini-3.8-flash` ("Gemini 3.8 Flash · Balanced")
    5. `gemini-3.5-flash-lite` ("Gemini 3.5 Flash Lite · Ultra Fast")

## 2. AI Router & `video.direct` (`packages/ai`)
- `packages/ai/src/router.ts`:
  - Add `model?: string` to `RunOptions`; when supplied (and allowed/non-empty), `router.run` uses `opts.model` instead of `task.model(cfg)` and logs the actual model in `RunResult.model` and `UsageEvent.model`.
- New `packages/ai/src/tasks/video-direct.ts`:
  - Input: numbered words (`[index, startMs, endMs, text]`), `durationMs`, `format`, `styleId`, optional `frames` (up to 6 base64 JPEG keyframes with timestamp ms).
  - Mode: `ONLY_IN_CLOUD`, default model `cfg.modelStrong` (`gemini-4-neon`), thinking `LOW`, `maxOutputTokens: 4096`.
  - Structured JSON output (`VideoDirectOutputSchema`):
    - `summary`: short editorial note
    - `defaultOverlayAnchor`: face-safe anchor inferred from frames
    - `cuts`: `[{ wordStart, wordEnd, kind, reason }]` (retakes, false starts, stumbles, rambling)
    - `punchIns`: `[{ wordStart, wordEnd, scale, focusX, focusY, reason }]`
    - `placements`: `[{ wordStart, wordEnd, placement: 'overlay' | 'cutaway', anchor, reason }]`
  - Pure enforcer (`enforceVideoPlan`): validates word indices, merges with audio silence/filler EDL cuts, prevents cutting >65% of words, clamps scales/anchors, guarantees non-overlapping sorted ranges.
  - Deterministic offline/fallback planner (`fallbackVideoPlan`) when offline or router unavailable.
- Extend `packages/schemas/src/pip.ts` + `packages/ai/src/tasks/pip-plan.ts`:
  - Add video actions: `'cutRange'`, `'toggleCuts'`, `'addPunchIn'`, `'setPlacement'`.
  - Include video summary (cut count, punch-in count, slot placements) in `PipPlanInputSchema` when `project.video` exists.

## 3. Compiler & Motion Overlay Mode (`packages/motion`)
- `CompileSlot` gains optional `placement?: 'cutaway' | 'overlay'` and `overlayAnchor?: OverlayAnchor`.
- `CompileInput` gains optional `hasVideo?: boolean`.
- When `hasVideo` is true:
  - The root composition background is `transparent` (no solid `.mp-bg` / `#mp-backdrop` covering the underlying `<video>`).
  - Slots with `placement === 'cutaway'` render an opaque per-slot `.mp-slot-bg` (`style.colors.bg` + subtle texture) inside their `.clip` so they cleanly cut away full-screen from the speaker and return to the speaker when the slot ends!
  - Slots with `placement === 'overlay'` render transparently inside a positioned safe-box (`top-right`, `top-left`, `lower-third`, `side-right`, `side-left`, or `center`) scaled cleanly (e.g., 42%–55% card width with crisp glass/paper card backing from the active look) so they NEVER block the speaker's face!

## 4. Video Preview, Playback & Editor UI (`apps/web`)
- `apps/web/lib/video/frames.ts`: pure browser helper to probe video metadata (`width`, `height`, `durationMs`, aspect format) and sample up to 6 small JPEG keyframes (480px wide, q=0.7) via `<video>` + `<canvas>`.
- `apps/web/lib/pipeline/run.ts`: when `input.file.type.startsWith('video/')`:
  - Stores video in `AudioStore` (`kind: 'video'` / existing blob store ref) so it works locally in IndexedDB and syncs to Firebase Storage when signed in.
  - Extracts audio + Whisper word timings + prosody + keyframes.
  - Calls `video.direct` (with `gemini-4-neon` via router, falling back to `fallbackVideoPlan`).
  - Applies enabled cuts to audio EDL + builds `project.video` with cuts, punch-ins, and overlay/cutaway slot placements.
  - Opens directly in `/editor/[id]`.
- `apps/web/components/editor/preview-player.tsx`:
  - When `project.video` exists, renders a muted `<video>` (audio is still driven cleanly by `PlaybackClock`'s cleaned voiceover track so audio & captions are 100% glitch-free across cuts!) behind `<hyperframes-player>`.
  - On every `playheadMs` update, seeks `<video>` to `cleanedToSourceMs(playheadMs, segments) / 1000` (with smooth continuous playback when inside a segment and instant jump across cut boundaries!) and applies active `punchIn` CSS `transform: scale(...)` + `transformOrigin: "${focusX*100}% ${focusY*100}%"`.
- Editor Timeline & Inspector & Pip:
  - Timeline: show cut-count / video-cuts bar or toggleable cut chips + word-range "Cut footage" action.
  - Inspector: when `project.video` exists, show a **Layer** segmented toggle (**Overlay** vs **Full-screen**) and **Position** picker (`top-right`, `top-left`, `lower-third`, `side-right`, `side-left`).
  - Pip Panel: add the sleek **Model selector** (`Gemini 4 Neon`, `Gemini 4 Hydrogen`, `Gemini 4 Carbon`, `Gemini 3.8 Flash`, `Gemini 3.5 Flash Lite`) persisted in localStorage, passed into `sendToPip`, `applyPipPlan`, and custom/film generation!

## 5. Final MP4 Export (`services/render`)
- `services/render/src/video-ffmpeg.ts` (pure filter-graph builder + unit/property tests):
  - Given `segments = keptSourceSegments(originalDurationMs, cuts)` and `punchIns`, generates a deterministic FFmpeg `filter_complex` script that:
    1. Trims and concatenates each kept video segment from the source video, normalizing scale/pad to the output `FORMATS[format]` dimensions at 30 fps.
    2. Applies smooth/instant punch-in crop+scale for each active punch-in window.
    3. Overlays the transparent HyperFrames graphic+caption WebM (VP9+alpha) stream cleanly on top (`overlay=0:0:shortest=1`).
    4. Muxes cleaned voice + synthesized SFX + ducked music bed into H.264 + AAC 1080p MP4.
- `services/render/src/run-render.ts`: when `project.video` is present, downloads the source video blob, compiles the composition with `hasVideo: true` + `background: 'transparent'`, renders the transparent overlay via HyperFrames producer (WebM alpha), and runs `video-ffmpeg` to produce the final composited MP4 + thumbnail.

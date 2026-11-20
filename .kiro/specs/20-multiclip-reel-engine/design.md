# Spec 20 Design — Multi-Clip Media Bin & Multimodal Reel Choreography Engine

## 1. Dual-Layer Deterministic Choreography Geometry (`packages/schemas/src/video.ts`)

Every frame `tMs` on the cleaned timeline evaluates two pure deterministic rects from the same `VideoStageSegment[]`:
1. `videoStageRectAt(tMs, stages, punchIns, width, height)` — positions and animates the **A-roll speaker `<video>`**.
2. `mediaLayerRectAt(tMs, stages, width, height)` — positions and animates the **B-roll / Screen Recording / Screenshot layer** (`clipId`, `clipStartMs`, `clipFocusX`, `clipFocusY`, `clipZoom`, `x`, `y`, `w`, `h`, `radius`, `shadow`, `rotateX`, `rotateY`, `framed`, `opacity`, `zIndex`).

### Stage Layout Geometry (adapts to `9:16` vertical Reels and `16:9` landscape)

| Mode | A-Roll Speaker (`videoStageRectAt`) | Media Layer (`mediaLayerRectAt`) | Motion Graphics Layer (`hyperframes-player`) |
|---|---|---|---|
| `full` | 100% full-bleed | hidden (`opacity: 0`) | Frameless floating typography / HUD / arrows |
| `split-left` | Left 43% (16:9) / Top 42% (9:16) | hidden | Right 47% (16:9) / Bottom 46% (9:16) |
| `split-right` | Right 43% (16:9) / Bottom 42% (9:16) | hidden | Left 47% (16:9) / Top 45% (9:16) |
| `pip` | Bottom-left bubble (23%×27% or 32%×20%) | hidden | Full studio canvas avoiding PiP corner |
| `backdrop` | 100% dimmed & blurred (`blurPx: 10, dim: 0.56`) | hidden | Bold high-contrast centered graphics |
| `cutaway` | hidden (`opacity: 0`) | hidden | Full-screen `mp.sheet()` graphic beat |
| `split-top-broll` | Bottom 44% (9:16) / Left 43% (16:9) | Top 48% (9:16) / Right 50% (16:9), rounded card | Seam pill/kinetic label bridging speaker + B-roll |
| `screen-showcase` | Bottom-left PiP bubble (z-index above media!) | 88%×62% (9:16) / 76%×74% (16:9) 3D-tilted framed macOS window with smooth auto-zoom to `(clipFocusX, clipFocusY, clipZoom)` | Frameless callout arrows & highlight rings pointing at zoomed UI |
| `broll-full` | hidden (`opacity: 0`) — J/L-cut voiceover continues! | 100% full-bleed subtle push-in (`1.0 → 1.07`) | Frameless floating kinetic title / stat over B-roll |
| `media-card-pop` | Full-bleed gently dimmed (`dim: 0.22`) or shifted down in 9:16 | Floating rounded showcase card (82%×40% upper center in 9:16; 46%×68% right in 16:9) with slight crisp tilt & shadow | Animated callout badge & hand-drawn highlight marks |

### Smooth Spring Transitions (`STAGE_TRANSITION_MS = 420`)
- Both `videoStageRectAt` and `mediaLayerRectAt` use `easeOutQuint` across the first `420 ms` of every segment transition.
- When entering a media stage from a non-media stage, `mediaLayerRectAt` springs in from slightly scaled-down (`0.92`) and shifted (`+28px` Y) with `opacity: 0 → 1`.
- When leaving a media stage into a non-media stage, `mediaLayerRectAt` glides cleanly out over the first `280 ms` of the next beat so clips never hard-pop off screen!
- For `screen-showcase`, inner zoom ramps smoothly from `1.0` to `clipZoom` (1.15–2.2) across the beat using `easeInOutCubic` centered on `(clipFocusX, clipFocusY)` — giving instant Screen-Studio polish to any raw uploaded `.mp4` screen recording.

## 2. Multimodal Clip Indexing (`media.index`)

- **Browser intake (`apps/web/lib/video/media-bin.ts`):**
  - Video files (`video/*`): stored in `appAudioStore()`, probed with `probeAndSampleVideo(blob, 4)` (max 4 compact 480px JPEG frames per clip).
  - Image files (`image/*`): stored in `appAudioStore()`, decoded via `createImageBitmap` / `Image`, downscaled to max 640px JPEG base64.
  - Up to 6 clips batched per `media.index` call (max 16 images per call to stay fast & well under token/payload budgets).
- **AI Task (`packages/ai/src/tasks/media-index.ts`):**
  - `id: 'media.index'`, `model: cfg.modelStrong` (`gemini-4-neon`), `thinking: 'LOW'`, `maxOutputTokens: 3072`.
  - Clean hand-crafted JSON Schema (no Zod v4 `maximum` bugs).
  - Returns `{ clips: [{ id, kind, summary, tags, dominantColors, moments: [{ startMs, endMs, focusX, focusY, zoom, description }] }] }`.
  - Prompt instructs Gemini to distinguish `screen-recording` (UI/browser/code/terminal — pinpoint clickable buttons, charts, code lines with `focusX/Y` and `zoom: 1.35..1.85`), `broll` (lifestyle/product/environment footage — pick the highest-motion cleanest 2–5s window), and `screenshot` / `photo` (pinpoint the hero metric/region).

## 3. Multi-Clip Director & Builder Wiring

- `FilmDirectInputSchema` adds:
  - `mediaBin?: Array<{ id, name, kind, durationMs?, summary, tags, moments }>`
  - `stressedWords?: number[]` (indices of vocal-stress peak words from on-device prosody).
- `FILM_DIRECT_SYSTEM_V1` + `filmDirectPromptV1`:
  - Lists every clip in `mediaBin` with its `id`, `kind`, `summary`, and `moments` (exact `startMs..endMs`, `focusX/Y`, `zoom`).
  - Instructs the Director to use `screen-showcase` for screen recordings, `split-top-broll` / `broll-full` for B-roll, and `media-card-pop` for screenshots whenever the narration matches what's in the clip — without forcing clips onto unrelated beats.
  - Instructs Beat 1 to be a **high-impact Viral Hook** that visually grabs attention in the first 300ms.
  - Lists vocal-stress word indices so `landsOn` aligns with the creator's natural vocal emphasis.
- `videoStageZoneGuide(stage, format, clipFocus?)` passes the exact screen-showcase / media-card safe zone and focus point to each parallel Builder so callout arrows point cleanly without overlapping the subject.

## 4. Multi-Clip Preview Rig (`apps/web/components/editor/preview-player.tsx`)

- Keeps a small cache of resolved object URLs for clips referenced in `project.mediaBin` (revoking unused URLs on unmount/change).
- Renders a dedicated spring-animated layer `data-testid="preview-media-stage"` alongside `data-testid="preview-video-stage"`:
  - Uses `z-index` dynamically (`screen-showcase` puts A-roll PiP above the framed screen recording; `split-top-broll` and `media-card-pop` layer cleanly with crisp rounded corners and drop shadows).
  - For video clips, keeps a `<video muted playsInline loop preload="auto">` synced to `clipStartMs + (ms - stage.startMs)` when active (paused when hidden to save CPU/GPU).
  - For `screen-showcase`, renders a lightweight translucent dark window header bar (3 subtle traffic-light dots + clip name) and subtle CSS `perspective(1200px) rotateX(...) rotateY(...)`.
  - For image clips (`screenshot` / `photo`), renders `<img className="h-full w-full object-contain" />` (or `object-cover` for `broll-full`) inside the animated stage frame.

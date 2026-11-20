# Spec 21 Design — 10/10 Reel Polish Engine

## 1. Modern High-Contrast Reel Looks (`packages/motion/src/styles/`)
- **`creator-dark.json` ("Creator Dark"):**
  - `bg: "#0B0C12"`, `ink: "#F6F7FB"`, `muted: "#9599AD"`, `accent: "#FF6B35"`, `accent2: "#8B7CFF"`, `highlight: "#FACC15"`, `positive: "#34D399"`, `negative: "#F87171"`, `chart: ["#6366F1", "#8B7CFF", "#FF6B35"]`.
  - Fonts: `display: "Space Grotesk"`, `body: "Geist"`, `mono: "Geist Mono"`, `displayWeight: 700`.
  - High-energy snappy motion (`energy: "hype"`, `personality.preset: "snappy"`, `camera.whip: true`, `texture.paper: false`, crisp dark vignette `0.18`).
- **`keynote-clean.json` ("Keynote Clean"):**
  - `bg: "#0F141E"`, `ink: "#FFFFFF"`, `muted: "#94A3B8"`, `accent: "#38BDF8"`, `accent2: "#A78BFA"`, `highlight: "#FDE047"`, `positive: "#22C55E"`, `negative: "#EF4444"`, `chart: ["#38BDF8", "#818CF8", "#34D399"]`.
  - Fonts: `display: "Geist"`, `body: "Geist"`, `mono: "Geist Mono"`, `displayWeight: 700`.
  - Crisp studio polish (`energy: "lively"`, `personality.preset: "smooth"`, `texture.paper: false`).

## 2. Stage-Aware Kinetic Captions (`packages/motion/src/runtime/captions.ts`)
- In `mountCaptions`, every word is checked for automatic numeric/currency emphasis (`/\d|%|[$€£]/`) in addition to `w.emphasis`, so stats in spoken captions automatically pop in the accent color!
- Active word scale pop in `'pop'` preset upgrades from `1.06` to `1.11` with `-2px` subtle upward lift and crisp dark drop-shadow so captions pop effortlessly over both bright B-roll and dark studios.
- Optional `stageWindows?: { startMs: number; endMs: number; mode: string }[]` on `CaptionsConfig`:
  - In `9:16` vertical Reels, normal captions sit at `24%` from bottom; during `split-top-broll` they glide smoothly to `45%` (right along the crisp seam between B-roll and speaker!); during `screen-showcase` they sit neatly at `26%` right below the tilted window; during `media-card-pop` they sit cleanly at `22%`.
  - Pure function of `tMs` (with 220ms `outCubic` glide across stage boundaries) — zero CSS transitions, 100% deterministic for frame-accurate export!

## 3. 3D Perspective Tweens, Whip-Pan Seam & Stage-Glide SFX
- `timeline.ts`: add `rotateX`, `rotateY`, `skewX`, `perspective` to `TRANSFORM`. When `rotateX` or `rotateY` is active, prepend `perspective(${persp}px)` cleanly before `translate/rotate/scale`.
- `kit.ts`: add `'whip'` case to `tl.enter` / `tl.exit` (fast `260ms` high-velocity horizontal whip with `blur: 14 → 0` on enter and `0 → 14` on exit).
- `place.ts`: `SfxProject` accepts optional `videoStages`; whenever `stage[i].mode !== stage[i-1].mode`, adds a subtle `whoosh` (`gainDb: -4`) right at `stage[i].startMs + SFX_FRAME_LAG_MS` (deduped through the existing `SFX_MIN_GAP_MS` priority filter so it never clutters speech!). Also adds a crisp `impact` at Beat 1's key moment on video projects when no `hype` peak exists yet.

## 4. Live Audio Re-Splice (`apps/web/lib/video/resplice-audio.ts`)
- Pure async helper `respliceProjectAudio(project)` reads `project.voiceover.originalSrc`, decodes PCM via `decodeForPipeline`, applies `renderCleaned` over the currently enabled `project.video.cuts`, encodes WAV via `encodeWav`, stores the new blob in `appAudioStore()`, retimes `project.originalTranscript.words` via `retimeWords`, and computes the new `durationMs`.
- Triggered cleanly after `toggleVideoCut` in `VideoCutsBar` so toggling any cut immediately keeps voiceover audio, captions, and `<video>` frame-locked!

## 5. Multi-Clip FFmpeg Export (`services/render/src/video-ffmpeg.ts`)
- `VideoCompositeArgs` accepts `mediaClips?: Record<string, { path: string; isVideo: boolean; durationMs?: number }>`.
- Every referenced clip is added as an FFmpeg input (`-stream_loop -1` for video clips or `-loop 1` for static screenshots/photos!).
- For each stage segment with a valid `clipId` present in `mediaClips`:
  - Computes exact target box from `mediaBoxForMode(s.mode, width, height)`.
  - Crops/zooms cleanly around `(s.clipFocusX, s.clipFocusY, s.clipZoom)` (trimming video clips from `clipStartMs` and resetting PTS so the exact moment plays!).
  - Adds a subtle dark border frame (`pad`) for `screen-showcase`.
  - Overlays in exact z-order (`screen-showcase`: media window below A-roll PiP; `split-top-broll` / `broll-full` / `media-card-pop`: media cleanly composited with A-roll) — all beneath the transparent HyperFrames graphics & captions stream `[1:v]`!

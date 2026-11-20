# Spec 21 — 10/10 Reel Polish Engine

## Problem

Spec 20 gave Motionpop multi-clip B-roll, screen-recording, and screenshot choreography powered by `gemini-4-neon`. To make every generated Reel feel genuinely **10/10 viral / flagship-creator grade** — not just functionally correct — five polish layers must click together:

1. **Modern High-Contrast Creator Looks:** Currently all 4 looks (`editorial-explainer`, `newsprint`, `field-notes`, `paper-collage`) are warm paper/editorial aesthetics. Creators filming Reels, SaaS launches, and tech breakdowns need crisp dark/modern looks too: **`Creator Dark`** (obsidian studio glass, crisp white type, ember + electric violet accents) and **`Keynote Clean`** (sleek slate-obsidian gradient, bold studio sans, sharp cyan/amber highlights).
2. **Stage-Aware Kinetic Reel Captions:** Captions (`packages/motion/src/runtime/captions.ts` & `packages/motion/src/compiler/project.ts`) should pop the active spoken word with springy scale + automatic accent highlight on numbers & power words, AND automatically dodge `split-top-broll` / `screen-showcase` / `split-left` / `split-right` stage seams so captions never collide with B-roll or speaker faces!
3. **3D Perspective + Whip-Pan Motion Primitives & Stage-Glide SFX:** Add `rotateX`, `rotateY`, `perspective` tween properties and a `"whip"` directional-blur seam transition to `mp.timeline()` / `mp` kit (`packages/motion/src/film/`), AND upgrade `placeSfx` (`packages/motion/src/sfx/place.ts`) so video stage transitions automatically receive crisp `whoosh` gliders and Beat 1 Viral Hook gets a punchy `impact`!
4. **Live Cleaned-Audio Re-Splice on Cut Toggle:** When a creator toggles an AI cut on or off in `VideoCutsBar` after processing, the cleaned voice WAV should re-render live from `voiceover.originalSrc` (updating `voiceover.src`, `durationMs`, and retimed `transcript.words`) so audio and video stay 100% lip-synced!
5. **1:1 Multi-Clip MP4 Export (`services/render/src/video-ffmpeg.ts` & `run-render.ts`):** Upgrade the FFmpeg video compositor and render pipeline so every Media Bin clip (B-roll videos, screen recordings with smooth zoom-to-focus & dark window border, and screenshots) composites cleanly into the exported H.264/AAC MP4 alongside the staged A-roll speaker and transparent HyperFrames overlay!

## Requirements

### R1 — Modern High-Contrast Reel Looks (`@motionpop/motion` & `apps/web`)
- R1.1: Add `packages/motion/src/styles/creator-dark.json` (**Creator Dark**) and `packages/motion/src/styles/keynote-clean.json` (**Keynote Clean**), both strictly passing `LookSchema` and using bundled OFL fonts (`Geist`, `Space Grotesk`, `Geist Mono`).
- R1.2: Register both looks in `packages/motion/src/styles/index.ts` (`looks` record & named exports) and ensure `/styles` gallery, `styleFor`, and Pip `setStyle` pick them up automatically.

### R2 — Kinetic Reel Captions with Stage-Aware Vertical Dodging (`@motionpop/motion`)
- R2.1: Upgrade `packages/motion/src/runtime/captions.ts`:
  - Enhance `'pop'` preset with crisp springy active-word scale pop (`1.12x` + micro-lift `-2px`), stronger drop shadow for readability over live video, and automatic emphasis detection on numbers/percentages/currencies (`/\d|%|[$€£]/`).
  - Add optional `stageWindows?: { startMs: number; endMs: number; mode: string }[]` on `CaptionsConfig` so captions dynamically adjust their vertical offset (`bottom`) during `split-top-broll` (centered neatly at the split seam in 9:16), `screen-showcase` (sitting cleanly below the tilted window), and `split-left`/`split-right` (avoiding the graphic zone) with smooth easing!
- R2.2: Pass `project.video?.stages` into `captionsConfig` inside `packages/motion/src/compiler/project.ts` and `packages/motion/src/runtime/engine.ts`.

### R3 — 3D Perspective Tweens, Whip-Pan Seam & Automatic Stage-Glide SFX (`@motionpop/motion`)
- R3.1: Extend `packages/motion/src/film/timeline.ts` to support `rotateX`, `rotateY`, `perspective` (in `TRANSFORM`), and `skewX` so Builders can craft crisp 3D card flips and kinetic tilts deterministically.
- R3.2: Extend `tl.enter` / `tl.exit` in `packages/motion/src/film/kit.ts` + `SEAM_KINDS` documentation in `packages/motion/src/film/doc.ts` with `"whip"` (fast directional blur + high-velocity slide).
- R3.3: Upgrade `packages/motion/src/sfx/place.ts` (`SfxProject` / `placeSfx`) to accept optional `videoStages?: readonly { id: string; startMs: number; endMs: number; mode: string }[]` and automatically place subtle `whoosh` SFX (`-4 dB`) on stage mode transitions and an opening `impact` on Beat 1 when `autoSfx` is enabled. Pass `project.video?.stages` from `apps/web/lib/sound/use-sound-bed.ts` and `services/render/src/bed.ts`.

### R4 — Live Cleaned-Audio Re-Splice on Cut Toggle (`apps/web`)
- R4.1: Build `apps/web/lib/video/resplice-audio.ts` — when a creator toggles any cut in `VideoCutsBar` (or via Pip `toggleCuts` / `cutRange`), decodes `voiceover.originalSrc`, re-runs `renderCleaned` + `encodeWav` + `retimeWords(originalTranscript.words, enabledCuts)`, stores the new cleaned WAV in `appAudioStore()`, and applies a clean project update (`applyResplicedVoice`) so audio, captions, transcript, and `<video>` cuts stay 100% locked!

### R5 — 1:1 Multi-Clip FFmpeg MP4 Export (`@motionpop/schemas`, `services/render`, `apps/web`)
- R5.1: Extend `RenderRequestSchema` & `RenderDocSchema` (`packages/schemas/src/render.ts`) with optional `clipPaths?: Record<string, string>` (mapping `clipId` → Storage path validated against `mediaClipPathFor(uid, projectId)`).
- R5.2: Extend `VideoCompositeArgs` & `buildVideoCompositeArgs` (`services/render/src/video-ffmpeg.ts`) to accept `mediaClips?: Record<string, { path: string; isVideo: boolean; durationMs?: number }>`:
  - Renders `split-top-broll`, `screen-showcase` (with dark rounded-style border + zoomed crop around `clipFocusX/Y`), `broll-full` (J/L-cut full-bleed), and `media-card-pop` (floating screenshot/photo) directly in the FFmpeg filter graph, layered cleanly with A-roll speaker PiP/split and the transparent HyperFrames overlay!
- R5.3: Wire `clipPaths` upload in `apps/web/lib/renders/voice-upload.ts` + `render-client.ts` and download/pass-through in `services/render/src/run-render.ts`.
- R5.4: Add unit tests + real FFmpeg multi-clip composite test producing a verified H.264/AAC MP4.

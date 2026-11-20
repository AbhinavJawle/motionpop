# Spec 21 Tasks — 10/10 Reel Polish Engine

- [x] **Task 1 — Modern Reel Looks (`Creator Dark` & `Keynote Clean`) + Stage-Aware Kinetic Captions (`@motionpop/motion`)**
  - Create `packages/motion/src/styles/creator-dark.json` and `packages/motion/src/styles/keynote-clean.json`.
  - Register both in `packages/motion/src/styles/index.ts`.
  - Upgrade `packages/motion/src/runtime/captions.ts` with kinetic active-word pop, auto number/currency accent highlight, and deterministic `stageWindows` vertical dodging.
  - Thread `project.video?.stages` into `captions` config in `packages/motion/src/compiler/project.ts` & `packages/motion/src/runtime/engine.ts`.

- [x] **Task 2 — 3D Perspective Tweens, Whip-Pan Seam & Stage-Glide SFX (`@motionpop/motion` & `apps/web`)**
  - Add `rotateX`, `rotateY`, `skewX`, `perspective` tween properties to `packages/motion/src/film/timeline.ts`.
  - Add `"whip"` directional-blur seam transition to `packages/motion/src/film/kit.ts` & document in `packages/motion/src/film/doc.ts`.
  - Upgrade `packages/motion/src/sfx/place.ts` to auto-place stage-transition `whoosh` SFX and Beat 1 hook `impact`.
  - Pass `videoStages` into `placeSfx` from `apps/web/lib/sound/use-sound-bed.ts`, `bed-messages.ts`, `bed.worker.ts`, and `services/render/src/bed.ts`.
  - Rebuild `packages/motion/dist/runtime.js` and verify tests.

- [x] **Task 3 — Live Cleaned-Audio Re-Splice on Cut Toggle (`apps/web`)**
  - Create `apps/web/lib/video/resplice-audio.ts` + `applyResplicedAudio` command in `apps/web/lib/commands/video.ts`.
  - Wire automatic audio re-splicing when toggling cuts in `apps/web/components/editor/video-cuts-bar.tsx`.

- [x] **Task 4 — 1:1 Multi-Clip FFmpeg MP4 Export (`@motionpop/schemas`, `services/render`, `apps/web`)**
  - Add `mediaClipPathFor` and optional `clipPaths` on `RenderRequestSchema` & `RenderDocSchema` (`packages/schemas/src/render.ts`).
  - Upgrade `services/render/src/video-ffmpeg.ts` to composite B-roll videos, zoomed `screen-showcase` clips, and screenshots/photos alongside staged A-roll and transparent HyperFrames overlay.
  - Wire `clipPaths` upload/download across `apps/web/lib/renders/` and `services/render/src/run-render.ts` & `store/firestore.ts`.
  - Verify with real FFmpeg multi-clip MP4 render test + `pnpm typecheck` + `pnpm lint` + unit tests.

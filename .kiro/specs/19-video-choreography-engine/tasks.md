# Tasks — Spec 19: Video Choreography Engine

- [x] **Task 1 — Coupled Video Stage & Beat Archetype Schemas + Spring Geometry (`@motionpop/schemas`)**
  - Added `VideoStageModeSchema`, `BeatArchetypeSchema`, `VideoStageSegmentSchema`, `stagesFromTimedBeats`, `easedPunchInAt`, and `videoStageRectAt` smooth spring/eased geometry evaluator in `packages/schemas/src/video.ts`.
  - Extended `VideoTrackSchema`, `SlotSchema`, and `StoryBeatSchema` + `storyboardIssues` anti-repetition checks in `packages/schemas/src/film.ts` and `packages/schemas/src/project.ts`.
  - Added `videoPathFor` and optional `videoPath` in `packages/schemas/src/render.ts`.
  - Added unit tests (`video.test.ts`).

- [x] **Task 2 — Dynamic Archetype Example Library & Frameless Video Compiler (`@motionpop/motion`)**
  - Created `packages/motion/src/film/archetypes.ts` with 7 high-craft, lint-passing `mp` kit examples (`kinetic-type`, `hero-stat`, `callout-hud`, `data-chart`, `diagram-flow`, `comparison-split`, `map-story`) + `archetypeExample()` and `videoStageZoneGuide()`.
  - Updated `packages/motion/src/compiler/compile.ts` and `project.ts` so `custom` choreographed beats render full-canvas transparent over the animated video stage (no `scale: 0.44` card boxes).
  - Updated `packages/motion/src/film/critic.ts` and `runtime.ts` with `transparent` video-stage support.
  - Rebuilt `packages/motion/dist/runtime.js` and added unit tests (`archetypes.test.ts`, `video-compile.test.ts`).

- [x] **Task 3 — Multimodal Video-Aware Director & Parallel Builders (`@motionpop/ai`)**
  - Upgraded `packages/ai/src/tasks/film.ts`, `prompts/film-direct.v1.ts`, `prompts/film-build.v1.ts`, and `film/make-film.ts`:
    - Multimodal keyframes (`frames` -> `mediaList`) in `film.direct` when `hasVideo` is true.
    - Stage-aware spatial safe-zone instructions + dynamic archetype few-shot injection per beat in `film.build` (keeping the shared prefix cacheable).
    - Live `onBeatReady` streaming callback and `model` override support.
  - Added `setVideoStage` action to `pip-plan.ts` and `pip-plan.v1.ts`.

- [x] **Task 4 — Live Dancing Video Preview Rig (`apps/web`)**
  - Upgraded `apps/web/components/editor/preview-player.tsx` to render the studio background canvas + spring-animated `<video>` stage container driven by `videoStageRectAt(ms)` synchronized with `<hyperframes-player>`.

- [x] **Task 5 — Automatic Gapless Choreography Pipeline (`apps/web`)**
  - Upgraded `apps/web/lib/film/film.ts`, `use-film.ts`, `sandbox-critic.ts`, `auto-choreograph.ts`, `pipeline/run.ts`, and `editor-screen.tsx`:
    - Wired video projects cleanly into `makeFilm` (passing sampled keyframes, `hasVideo: true`, dynamic archetype examples, transparent critic mode, and Pip's selected model).
    - Synced gapless `project.video.stages` from the Director's timed beats with full Undo/Redo support.
    - Auto-started gapless choreography when a freshly processed video project opens in `EditorScreen`.

- [x] **Task 6 — Inspector Video Stage Controls & Pip Choreography Actions (`apps/web`, `@motionpop/schemas`, `@motionpop/ai`)**
  - Upgraded `apps/web/components/inspector/placement-section.tsx` and `apps/web/lib/commands/video.ts` (`setSlotVideoStage`, `setAllSlotsVideoStage`) to switch any beat's `videoStage` (`Full`, `Split L`, `Split R`, `PiP`, `Dim BG`, `Cutaway`).
  - Wired `setVideoStage` into `apps/web/lib/pip/plan.ts` and `apps/web/lib/pip/apply.ts`.

- [x] **Task 7 — Source Video Export Upload & Stage-Aware FFmpeg Compositing (`services/render`, `apps/web`, `storage.rules`)**
  - Added `users/{uid}/video/{file=**}` rule in `storage.rules` and deployed to `fbailogic26vrt-3068`.
  - Wired source video upload (`videoPath`) in `apps/web/lib/renders/voice-upload.ts`, `render-client.ts`, `handlers.server.ts`, `local-handlers.server.ts`, `app/api/local-renders/route.ts`, and `services/render/src/run-render.ts`.
  - Upgraded `services/render/src/video-ffmpeg.ts` to composite per-beat `videoStage` geometry (`full`, `split-left`, `split-right`, `pip`, `backdrop`, `cutaway`) over the look background + overlay WebM.

- [x] **Task 8 — Full Verification, Live Chrome + `gemini-4-neon` + FFmpeg E2E & Close-out**
  - Verified `pnpm typecheck` (5/5), `pnpm lint` (5/5), unit tests across all packages, live FFmpeg 5-stage MP4 composite, and live Chrome E2E with `gemini-4-neon`.

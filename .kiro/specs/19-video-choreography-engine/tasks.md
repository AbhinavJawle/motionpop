# Tasks — Spec 19: Video Choreography Engine

- [ ] **Task 1 — Coupled Video Stage & Beat Archetype Schemas + Spring Geometry (`@motionpop/schemas`)**
  - Add `VideoStageModeSchema`, `BeatArchetypeSchema`, `VideoStageSegmentSchema`, and `stagesFromTimedBeats` / `videoStageRectAt` smooth spring/eased geometry evaluator in `packages/schemas/src/video.ts`.
  - Extend `VideoTrackSchema`, `SlotSchema`, and `StoryBeatSchema` + `storyboardIssues` anti-repetition checks in `packages/schemas/src/film.ts` and `packages/schemas/src/project.ts`.
  - Add `videoPathFor` and optional `videoPath` in `packages/schemas/src/render.ts`.
  - Add thorough unit tests (`video.test.ts`, `film.test.ts`).

- [ ] **Task 2 — Dynamic Archetype Example Library & Frameless Video Compiler (`@motionpop/motion`)**
  - Create `packages/motion/src/film/archetypes.ts` with 7 high-craft, lint-passing `mp` kit examples (`kinetic-type`, `hero-stat`, `callout-hud`, `data-chart`, `diagram-flow`, `comparison-split`, `map-story`) + `archetypeExample()` selector.
  - Update `packages/motion/src/compiler/compile.ts` and `project.ts` so `custom` choreographed beats render full-canvas transparent over the animated video stage (no `scale: 0.44` card boxes).
  - Update `packages/motion/src/film/critic.ts` with `transparent` video-stage support.
  - Rebuild `packages/motion/dist/runtime.js` and add unit tests (`archetypes.test.ts`, `video-compile.test.ts`).

- [ ] **Task 3 — Multimodal Video-Aware Director & Parallel Builders (`@motionpop/ai`)**
  - Upgrade `packages/ai/src/tasks/film.ts`, `prompts/film-direct.v1.ts`, `prompts/film-build.v1.ts`, and `film/make-film.ts`:
    - Multimodal keyframes (`frames` -> `mediaList`) in `film.direct` when `hasVideo` is true.
    - Stage-aware spatial safe-zone instructions + dynamic archetype few-shot injection per beat in `film.build`.
    - Live `onBeatReady` streaming callback and `model` override support.
  - Add unit tests and run a live `gemini-4-neon` smoke test on `fbailogic26vrt-3068`.

- [ ] **Task 4 — Live Dancing Video Preview Rig (`apps/web`)**
  - Upgrade `apps/web/components/editor/preview-player.tsx` to render the studio background canvas + spring-animated `<video>` container driven by `videoStageRectAt(ms)` synchronized with `<hyperframes-player>`.
  - Keep eased punch-ins and cut skipping smooth at 60fps.

- [ ] **Task 5 — Automatic Gapless Choreography Pipeline & Streaming Beats (`apps/web`)**
  - Upgrade `apps/web/lib/film/film.ts`, `use-film.ts`, and `apps/web/lib/pipeline/run.ts`:
    - Wire video projects cleanly into `makeFilm` (passing sampled keyframes, `hasVideo: true`, dynamic archetype examples, transparent critic mode, and selected Pip model).
    - Sync `project.video.stages` from the Director's timed beats and stream completed beats live into `editorStore`.
    - Auto-start gapless choreography when a freshly processed video project opens in `EditorScreen` (with live progress + cancel + one-step Undo).

- [ ] **Task 6 — Inspector Video Stage Controls & Pip Choreography Actions (`apps/web`, `@motionpop/schemas`, `@motionpop/ai`)**
  - Upgrade `apps/web/components/inspector/placement-section.tsx` and `apps/web/lib/commands/video.ts` to edit any beat's `videoStage` (`Full`, `Split L`, `Split R`, `PiP`, `Dim BG`, `Cutaway`).
  - Add `setVideoStage` action to `packages/schemas/src/pip.ts`, `packages/ai/src/prompts/pip-plan.v1.ts`, and `apps/web/lib/pip/apply.ts`.

- [ ] **Task 7 — Source Video Export Upload & Stage-Aware FFmpeg Compositing (`services/render`, `apps/web`)**
  - Wire source video upload (`videoPath`) in `apps/web/lib/renders/render-client.ts`, `handlers.server.ts`, `local-handlers.server.ts`, and `services/render/src/run-render.ts`.
  - Upgrade `services/render/src/video-ffmpeg.ts` to render per-beat `videoStage` geometry (`full`, `split-left`, `split-right`, `pip`, `backdrop`, `cutaway`) over the look background + overlay WebM.

- [ ] **Task 8 — Full Verification, Live Chrome + `gemini-4-neon` + FFmpeg E2E & Close-out**
  - Run `pnpm typecheck`, `pnpm lint`, unit tests across all packages.
  - Run live Chrome E2E on a real spoken `.mp4` verifying zero gaps, varied archetypes, dancing `<video>` stage transitions, live `gemini-4-neon` bespoke beat code, and real FFmpeg stage-composited MP4 output.
  - Update `DEV_LOG.md` and mark Spec 19 complete.

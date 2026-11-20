# Spec 20 Tasks — Multi-Clip Media Bin & Multimodal Reel Choreography Engine

- [ ] **Task 1 — Multi-Clip Schemas & Dual-Layer Spring Geometry (`@motionpop/schemas`)**
  - Extend `VIDEO_STAGE_MODES` with `'split-top-broll'`, `'screen-showcase'`, `'broll-full'`, `'media-card-pop'`.
  - Add `MediaClipKindSchema`, `MediaClipMomentSchema`, `MediaClipSchema`, and optional `mediaBin` on `EditorProjectBaseSchema`.
  - Add `clipId`, `clipStartMs`, `clipEndMs`, `clipFocusX`, `clipFocusY`, `clipZoom` on `VideoStageSegmentSchema`, `StoryBeatSchema`, and `SlotSchema`.
  - Extend `videoStageRectAt`, add `mediaLayerRectAt` (pure 60fps deterministic evaluator with 3D tilt, auto-zoom, and smooth enter/exit glides), and update `stagesFromTimedBeats`.
  - Update `PipActionSchema` / `PipStepSchema` (`setBeatClip` + 10 stages) and `PendingIntakeSchema` (`extraClips`).
  - Add comprehensive unit tests in `packages/schemas/src/video.test.ts`.

- [ ] **Task 2 — Multimodal `media.index`, Multi-Clip Director & Archetype Guides (`@motionpop/ai` & `@motionpop/motion`)**
  - Create `packages/ai/src/prompts/media-index.v1.ts` and `packages/ai/src/tasks/media-index.ts` (clean JSON Schema + `gemini-4-neon` multimodal indexing).
  - Export `mediaIndexTask` from `packages/ai/src/index.ts`.
  - Upgrade `packages/ai/src/tasks/film.ts`, `film-direct.v1.ts`, `film-build.v1.ts`, `make-film.ts`, and `packages/schemas/src/film.ts` (`storyboardIssues` clip validation) for `mediaBin` + `stressedWords` + Beat 1 Viral Hook.
  - Upgrade `packages/motion/src/film/archetypes.ts` (`videoStageZoneGuide` for all 10 stages) and rebuild `packages/motion/dist/runtime.js`.
  - Update `packages/ai/src/tasks/pip-plan.ts` & `prompts/pip-plan.v1.ts` for all 10 stages + `setBeatClip`.
  - Add unit tests in `packages/ai/src/tasks/media-index.test.ts` and `packages/ai/src/film/make-film.test.ts`.

- [ ] **Task 3 — Multi-Clip Intake, Media Bin Service & Editor Media Panel (`apps/web`)**
  - Create `apps/web/lib/video/media-bin.ts` (ingest video/image clips to `appAudioStore()`, probe keyframes/dimensions, run `media.index` with offline fallback).
  - Add undoable Media Bin & clip-binding commands in `apps/web/lib/commands/video.ts` (`addMediaClips`, `updateMediaClips`, `removeMediaClip`, `setSlotMediaClip`).
  - Upgrade `/start` (`UploadCard`, `hand-off.ts`, `pending.ts`, `processing-screen.tsx`, `pipeline/run.ts`) so creators can drop/pick A-roll + extra B-roll/screen-recordings/screenshots in one flow.
  - Upgrade `apps/web/components/editor/media-panel.tsx` with the **Project Clips & B-Roll** bin (upload, preview thumbnails/badges, AI summary/tags, "Analyze with AI", delete, "Use on selected beat").

- [ ] **Task 4 — Live Dual-Layer Dancing Preview, Auto-Indexing Choreography, Inspector & Pip (`apps/web`)**
  - Upgrade `apps/web/components/editor/preview-player.tsx` with spring-animated `preview-media-stage` (B-roll `<video>`, 3D-tilted auto-zoom `screen-showcase` window, `media-card-pop` screenshots) dancing alongside A-roll `<video>` and `<hyperframes-player>`.
  - Upgrade `apps/web/lib/film/film.ts` to auto-index unindexed `mediaBin` clips, feed `mediaBin` + prosody `stressedWords` into `makeFilm`, and bind clips to slots + `video.stages`.
  - Upgrade `apps/web/components/inspector/placement-section.tsx` with all 10 stage modes + Clip picker.
  - Upgrade `apps/web/lib/pip/plan.ts` & `apps/web/lib/pip/apply.ts` for all 10 stages + `setBeatClip`.
  - Verify `pnpm typecheck`, `pnpm lint`, and unit tests pass cleanly.

# Tasks — Spec 24: Talking-Head Reel Engine v2

- [x] **Task 1: Schemas, Frontier Model Default, 50/50 Split & Face-Centering Math (`packages/schemas`)**
  - [x] 1.1 Set `APP_CONFIG_DEFAULTS.modelFilmBuild = 'gemini-4-neon'` in `packages/schemas/src/config.ts`.
  - [x] 1.2 Update `stageBoxForMode('split-top-stage')` on 9:16 to exact crisp 50/50 split (`y: 0.50, h: 0.50, radiusFrac: 0`), add `clampSpeakerFocusY` + `coverObjectPosition` helpers in `packages/schemas/src/video.ts`, and update `stagesFromTimedBeats`.
  - [x] 1.3 Update `storyboardIssues` in `packages/schemas/src/film.ts` for `hasVideo` Reels (lift 25% type-led cap, allow consistent `split-top-stage`/`clean`/`top-card` runs, allow 1200ms min beat duration, allow `brollQuery` on media stages before stock fetch).
  - [x] 1.4 Update & add unit tests in `packages/schemas`.

- [x] **Task 2: Hard Container Clipping, Stage-Safe Reel Kit, Seam Captions, Critic Guardrails & Swiss Examples (`packages/motion`)**
  - [x] 2.1 Implement clipped stage containers (`.mp-slot-top-stage`, `.mp-slot-top-card`, architectural grid stage surface, `data-mp-stage-bg`) in `compile.ts`, `engine.ts`, `runtime.ts`, and `build.ts` while preserving frame-relative `--u`.
  - [x] 2.2 Guard `mp.stage()` in `reel-kit.ts` against opaque curtains on `full`/`backdrop`/`top-card`/`clean` and always emit `background-color` + `data-mp-stage-bg`.
  - [x] 2.3 Upgrade `critic.ts`: read `data-mp-stage-bg` in `backgroundBehind`, add blocking `empty-box` detector, add `reelMode` support (structured UI/typography counts as visual without forcing fake SVG shapes), and protect the face zone on `full`/`clean`.
  - [x] 2.4 Polish `studio-light.json` and `captions.ts` (`studio` preset docked cleanly across the 50% split seam with crisp `#0A0A0E` black bar and high-contrast pill on full-bleed stages).
  - [x] 2.5 Add stage-matched Swiss/Studio Reel v2 reference examples (`reelExampleFor`) in `archetypes.ts` and update `videoStageZoneGuide` for exact clipped stage coordinates.
  - [x] 2.6 Rebuild runtime (`pnpm --filter @motionpop/motion build:runtime`) and pass all `@motionpop/motion` tests.

- [x] **Task 3: Dedicated Reel v2 Prompts, Full Schema, Keyframe-Aware Frontier Builder & Zero-Clutter Clean Beats (`packages/ai`)**
  - [x] 3.1 Write contradiction-free `packages/ai/src/prompts/reel-v2.ts` (`REEL_DIRECT_SYSTEM_V2`, `reelDirectPromptV2`, `reelBuildSystemV2`, `reelBuildPromptV2`).
  - [x] 3.2 Add `reelDirectTask` (`thinking: 'MEDIUM'`, full Reel v2 JSON schema with `tone`, `brollQuery`, `imageSubject`, `imageKeyed`, locked Reel `videoStage` enum) and `reelBuildTask` (frontier `modelFilmBuild`, `imageAsset`, clipped stage box, inline speaker keyframe `media`) in `packages/ai/src/tasks/film.ts`.
  - [x] 3.3 Update `makeFilm` and `rebuildBeat` in `packages/ai/src/film/make-film.ts` to route `hasVideo: true` through `reelDirectTask` + `reelBuildTask`, skip `filmPropsTask`, fast-path pure `clean` breathing beats (`text.length === 0`) with 0 AI calls, and pass nearest speaker keyframe + clipped stage dimensions.
  - [x] 3.4 Upgrade `filmVisionCriticTask` (`packages/ai/src/tasks/film-vision-critic.ts` & `film-vision-critic.v1.ts`) to run on `cfg.modelStrong` (`gemini-4-neon`) with sharper Reel QA criteria.
  - [x] 3.5 Update & add tests in `packages/ai` (including `output-caps.test.ts`, `film.test.ts`, `make-film.test.ts`).

- [x] **Task 4: Full-Reel Batched Vision QA, Preview/FFmpeg Face-Centering Parity & Video Pipeline Defaults (`apps/web` + `services/render`)**
  - [x] 4.1 Upgrade `apps/web/lib/film/vision-qa.ts` to inspect ALL built visual beats in parallel batches of 6 at 360px with face-centered speaker framing, clipped stage boxes, and studio seam captions.
  - [x] 4.2 Update `apps/web/lib/film/film.ts`, `apps/web/lib/film/rebuild.ts`, and `apps/web/lib/film/sandbox-critic.ts` to pass frontier `buildModel`, `reelMode`, `reelExampleFor`, `hasVideo`, and keyframes consistently.
  - [x] 4.3 Apply exact shared `coverObjectPosition` / clamped face-centered `focusY` in `apps/web/components/editor/preview-player.tsx` and `services/render/src/video-ffmpeg.ts`.
  - [x] 4.4 Update `apps/web/lib/pipeline/run.ts` defaults for video uploads (`studio-light`, `studio` captions, `musicId: 'none'` + `autoSfx: true`).
  - [x] 4.5 Update & add tests in `services/render` and `apps/web`.

- [x] **Task 5: Full Verification, Live Build Check & Log Update**
  - [x] 5.1 Run `pnpm --filter @motionpop/motion build:runtime`, `pnpm -r typecheck`, `pnpm -r lint`, and full test suites across all 5 packages.
  - [x] 5.2 Update `DEV_LOG.md`, mark all tasks complete in `tasks.md`, and commit cleanly.

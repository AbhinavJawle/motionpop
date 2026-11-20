# Spec 22 Tasks — Multimodal Vision Critic Contact-Sheet QA & Speed Pass

- [x] **Task 1 — `film.vision-critic` Multimodal Task (`@motionpop/ai`)**
  - Create `packages/ai/src/prompts/film-vision-critic.v1.ts` and `packages/ai/src/tasks/film-vision-critic.ts`.
  - Export from `packages/ai/src/index.ts` and add unit tests in `packages/ai/src/tasks/film-vision-critic.test.ts`.

- [x] **Task 2 — Browser Contact-Sheet Renderer & Auto-Polish Hook (`apps/web`)**
  - Create `apps/web/lib/film/vision-qa.ts` (offscreen canvas contact-sheet composer + `runVisionQaPass`).
  - Wire optional non-blocking Vision QA targeted polish into `apps/web/lib/film/film.ts`.
  - Apply tiered model routing speed pass (`gemini-3.8-flash` for `video.direct`, `media.index`, `film.props`, `film.vision-critic`; `gemini-4-neon` for mastermind `film.direct`; `cfg.modelFilmBuild` for parallel `film.build` fan-out) + parallel A-roll frame sampling and clip indexing.

- [x] **Task 3 — Real Multi-Clip FFmpeg MP4 Export & Live Chrome E2E Verification**
  - Verify real multi-clip FFmpeg MP4 composite (`A-roll + B-roll + screen-recording + screenshot + overlay`).
  - Verify real Chrome E2E on `fbailogic26vrt-3068` + `gemini-4-neon` (multi-clip upload → `media.index` → choreography → Vision QA → dancing preview → Creator Dark look).
  - Run `pnpm typecheck`, `pnpm lint`, unit tests, and update `DEV_LOG.md`.

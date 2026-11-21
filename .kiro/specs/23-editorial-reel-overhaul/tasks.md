# Spec 23 — Editorial Reel Quality Overhaul (Tasks)

## Phase 1: Stage Grammar, Captions, Looks & Audio Foundation (Pillars 1, 2, 3, 7c)
- [x] **Task 1.1:** Add `split-top-stage`, `top-card`, and `clean` to `VIDEO_STAGE_MODES` and `stageBoxForMode` / `videoStageRectAt` (including arched top-corner `topRadiusOnly` support for editorial split framing) in `packages/schemas/src/video.ts`.
- [x] **Task 1.2:** Update `PreviewPlayer`, `VideoTrack`, and `VideoCutsBar` to render arched top-corner `split-top-stage`, `top-card`, and `clean` stages seamlessly.
- [x] **Task 1.3:** Upgrade `services/render/src/video-ffmpeg.ts` to support `split-top-stage` (including arched top-corner alpha masks), `top-card`, `clean`, and smooth eased punch-in zooms + seam bar parity.
- [x] **Task 1.4:** Add `editorial`, `studio` (with automatic black seam-bar docking on splits), and `minimal-pill` caption presets to `packages/schemas/src/project.ts`, `packages/motion/src/captions/chunk.ts`, `packages/motion/src/runtime/captions.ts`, and `apps/web/components/editor/preview-pane.tsx`.
- [x] **Task 1.5:** Create `editorial-cream.json` (new default video look matching Ref 2), `studio-light.json` (Ref 1), and upgrade `creator-dark.json` (Ref 3) in `packages/motion/src/styles/`; set `editorial-cream` + `editorial` captions + subtle ducked ambient music bed as default for new video uploads in `apps/web/lib/pipeline/run.ts`.

## Phase 2: Agency `mp` Motion Graphics, UI & 3D Kit (Pillars 4, 5)
- [x] **Task 2.1:** Add deterministic UI & motion primitives to `packages/motion/src/film/kit.ts`: `mp.stage`, `mp.card`, `mp.odometer`, `mp.ring`, `mp.meter`, `mp.window`, `mp.tile`, `mp.flowDots`, `mp.chart`, `mp.stamp`, `mp.strike`, `mp.chapter`.
- [x] **Task 2.2:** Add deterministic media & 3D primitives to `packages/motion/src/film/kit.ts`: `mp.image(assetId)`, `mp.card3d`, `mp.globe` (wired to WebGL/orthographic 3D Earth), and `mp.mesh3d` (deterministic procedural 3D cube/coins/bars/nodes).
- [x] **Task 2.3:** Update `packages/motion/src/film/doc.ts`, `packages/motion/src/compiler/compile.ts`, and `packages/motion/src/runtime/runtime.ts` so `ctx.images` flows into custom film beats cleanly; rebuild `@motionpop/motion` runtime and add unit tests.

## Phase 3: External Stock B-Roll (Pexels + Wikimedia) & AI Cutouts (Pillars 6, 7b)
- [x] **Task 3.1:** Build `/api/media/stock` route supporting Pexels (HD vertical stock videos & photos when `PEXELS_API_KEY` is set) + Wikimedia Commons (zero-key public-domain/CC photography fallback) with allowlisted proxy streaming.
- [x] **Task 3.2:** Build `apps/web/lib/video/stock-media.ts` client fetcher to auto-ingest Director `brollQuery` clips/photos into the project Media Bin (local IndexedDB blobs) and support AI-generated chroma-key cutouts (`imageSubject`) via existing `generateImageWithFirebase` + `key.ts`.
- [x] **Task 3.3:** Wire stock B-roll resolution, AI cutout generation (budgeted to max 2–3 beats per reel, parallelized), and hybrid scene support into `apps/web/lib/film/film.ts` + `packages/schemas/src/film.ts`.

## Phase 4: Tone-Aware Director & Executed-Frame Vision QA (Pillars 7a, 8)
- [x] **Task 4.1:** Upgrade `packages/ai/src/prompts/film-craft.v1.ts` (add `REEL_CRAFT_RULES` lifting flat-paper shadow/gradient bans for video reels), `film-direct.v1.ts` (tone classification `personal-story` vs `tech-explainer` vs `listicle`, breathing beats, B-roll/cutout/3D directing), `film-build.v1.ts`, and `packages/motion/src/film/archetypes.ts` (high-craft Editorial Cream / Studio Light / Luminous Dark examples).
- [x] **Task 4.2:** Fix `apps/web/lib/film/sandbox-critic.ts` and `apps/web/lib/film/vision-qa.ts` so Vision QA captures the **real executed beat DOM at `keyMomentMs`** composited over the actual speaker keyframe in its real stage geometry + live caption rail.
- [x] **Task 4.3:** Add deterministic DOM guardrails to `packages/motion/src/film/critic.ts` (face-zone intrusion on `top-card`, stick-figure bust ban, full-frame viewport border ban, blank opening `> 300ms`).

## Phase 5: Verification, Benchmark & Close-out
- [x] **Task 5.1:** Rebuild `@motionpop/motion` runtime, verify full workspace `typecheck`, `lint`, and `test` green across all packages.
- [x] **Task 5.2:** Run live verification of the new Editorial Cream look, arched `split-top-stage`, `editorial` captions, `mp.*` Reel & 3D kit, stock B-roll API, and FFmpeg export parity; update `DEV_LOG.md` & `KIRO_LOG.md` and commit cleanly.

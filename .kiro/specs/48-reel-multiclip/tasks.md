# Tasks — Spec 48: Native Multi-Clip Editing & A-Roll Selection for the Reel Engine

## Phase 1 — Multi-File Intake & A-Roll Selection
- [x] Task 1.1: Extend `PendingExtraClipSchema` (`kindHint`, `sizeBytes`) and fix `handOffFiles` default primary selection in `apps/web/lib/intake/hand-off.ts` (prefer first audio/video file instead of largest by bytes).
- [x] Task 1.2: Add `extraClips` state and actions (`addJobExtraClips`, `removeJobExtraClip`, `setJobExtraClipKind`, `swapJobPrimaryClip`) to `apps/web/lib/pipeline/jobs-store.ts`, keeping `PendingIntake` in sync and restarting prep on primary swap.
- [x] Task 1.3: Add the multi-clip tray UI to `/start/configure` (`MediaCard` / `ConfigureScreen`) with "Main A-roll" badge, "Make main" swap button on extra video/audio clips, role selector, remove button, and "+ Add B-roll / clips" picker + unit tests.

## Phase 2 — Pipeline Ingestion & Vision Indexing for Reel Projects
- [x] Task 2.1: Update `browserPipelineDeps` (`ingestExtraClip` preserving `kindHint` + frames, and `indexMediaClips`) and wire `input.extraClips` ingestion + pre-direct Gemini vision indexing into both talking-head and voiceover Reel branches of `apps/web/lib/pipeline/run.ts` + pipeline unit tests.

## Phase 3 — Native Multi-Clip Support in the Reel Engine
- [x] Task 3.1: Extend `packages/schemas/src/reel.ts` with `'pip'` layout, `clip` template in `ReelTemplateSchema`, and `reelClipIdsOf()` helper + schema tests.
- [x] Task 3.2: Extend `packages/ai/src/reel/director.ts` and `prompt.ts` to accept `mediaBin`, guide the director to weave B-roll / screen recordings / screenshots with `clip` template + `pip`/`split`/`full`/`card` layouts + indexed zoom moments, and validate `clipId`s + director tests.
- [x] Task 3.3: Implement `'pip'` layout and `clip` template rendering in `packages/motion/src/reel/` (`looks.ts`, `parts.ts`, `templates.ts`, `mount.ts`, `compile.ts`) and wire resolved `mediaBin` blob URLs in `apps/web/components/editor/reel-preview.tsx` + motion/compile tests.
- [x] Task 3.4: Wire `clipPaths` upload for Reel `clip` scenes in `apps/web/lib/renders/voice-upload.ts` & `render-client.ts`, and download + `ffmpeg.proxyVideo` + pass `clips` into `compileReel` in `services/render/src/run-render.ts` + render tests.

## Phase 4 — Editor Controls, Late Uploads & Pip Integration
- [x] Task 4.1: Add `setReelSceneClip` and `replaceReelScenes` undoable commands in `apps/web/lib/commands/` and wire Media Panel ("On scene" + "Weave into reel (AI)") and Reel Scene Inspector controls for `clip` scenes.
- [x] Task 4.2: Add Reel-aware `setReelSceneClip` support to Pip (`packages/ai/src/tasks/pip-plan.ts`, `prompts/pip-plan.v2.ts`, `apps/web/lib/pip/plan.ts`) + tests.

## Final Verification
- [x] Task 5.1: Run full typecheck, lint, and affected test suites across `packages/schemas`, `packages/ai`, `packages/motion`, `services/render`, and `apps/web`, and log the session in `DEV_LOG.md`.

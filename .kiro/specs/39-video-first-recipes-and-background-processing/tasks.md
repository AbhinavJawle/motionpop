# Spec 39 tasks: video first, recipes, and background processing

Executed one task at a time, mostly by kiro-cli (`motionpop-builder`), reviewed by Claude Code.
Commits through kiro-cli only, no Co-Authored-By trailers.

## Phase 1 — Schemas, recipes, skill library
- [x] 1. `edit-config.ts` schemas (EditConfig, ResolvedRecipe, RecipeId, ReelCaptionStyle, ReelHookStyle, MusicMood); `project.edit`; `ReelPlan.captionStyle/hookStyle`; script pending intake without a ref; tests (R2.10, R5.1, R8.1)
- [x] 2. Recipe + director skill registry in `packages/ai/src/skills/` (5 recipes × 2–3 styles, `SkillRegistry`, `builtInSkills`), `skills/recipes/*.md` and the sync test (R3.1–R3.4)
- [x] 3. Slot shot sequences: generated `slot-sequences.ts` from `skills/*.md` + sync test; fill `shotSequence` in `scene-fill.ts` and `component-fill-input.ts` (R3.6)
- [x] 4. `recipe.resolve` task (ONLY_ON_DEVICE, free, jsonSchema), prompt v1, keyword fallback, tests (R4.1, R4.2)

## Phase 2 — Engine and AI wiring
- [x] 5. `applyEditChoices` post-pass (CTA, hook, captions, theme, look, music mood) + property test; used by `toReelPlan` callers and `autoReelPlan` path (R5.3, R5.4, R5.5, R5.7)
- [x] 6. `reel.direct` brief: input schema, `recipeBrief()` RECIPE block in the prompt, `directReel`/`directReelPaid` pass-through; tests (R3.5)
- [x] 7. Reel caption styles: `chunkCaptions` per style, painter + CSS for seam/pop/editorial/boxed/clean, default-unchanged test (R5.1, R5.2)
- [x] 8. Pipeline takes `edit` (+ `prepared`): video and voiceover mappings, `project.edit`, illustrations cap, music none, autoSfx; tests in `run.test.ts` (R2.10, R5.5)
- [x] 9. Reel sound guardrails: no `useSoundBed` on reels; `reelBedSound` preview/render parity test (R7)
- [ ] 10. Styles panel for reels: recipe styles + caption styles, `setReelStyle` command with one undo (R5.6)

## Phase 3 — Background jobs
- [ ] 11. `eta.ts` (weights, prior, blend, `formatEta`) + property tests (R6.4)
- [ ] 11b. Credit safety: AbortSignal + refund-on-abort in `directReelPaid`, `resolveReelMedia`, `generateVoice`; `PipelineInput.reuse` for paid results; Whisper FIFO lock (R6.9, R6.3)
- [ ] 12. `jobs-store.ts` (prepare, submit, queue, cancel, retry, dismiss; runtime map; prepared-media wrappers) + deps provider + uid capture + pending ownership + tests: survives without a mounted screen, one at a time, cancel aborts only that job, idempotent submit, refund property, completion sets projectId (R6.1–R6.3, R6.9, R6.10, R2.8, R2.12)
- [ ] 13. `<JobsHost/>` in the app layout: beforeunload while live, done toast with Open, project list refresh (R6.5, R6.6)
- [ ] 14. `/processing/[jobId]` on the store: live view, "Continue in background", interrupted state, `/processing/new` redirect, video/voice headline and strip copy (R6.8, R1.3)
- [ ] 15. Dashboard "Working on it" section: cards with step, bar, ETA, View progress, Cancel / Retry / Open (R6.7)

## Phase 4 — Video first and the configure screen
- [ ] 16. Copy: `/start`, dashboard empty + drag, `layout.tsx` metadata (R1.1, R1.2)
- [ ] 17. Entry points go to `/start/configure`: Start upload + sample, dashboard drop, recorder, script screen (script → pending without blob, voice made after Create) (R2.1, R2.4)
- [ ] 18. `summaryRows()` pricing + tests (signed out, no credits, illustrations off, script minutes) (R2.7, R2.9)
- [ ] 19. Configure screen: layout, media card with prep bar and Pip, option cards (CSS art) for recipe/style/hook/captions/CTA/sound, custom fields with `recipe.resolve`, sticky summary + Create → `jobs.submit` (R2.2, R2.3, R2.5, R2.6, R4.3)
- [ ] 20. e2e: sample → configure → Create → processing → editor; leave processing → dashboard Working card (R8.2)

## Phase 5 — Verification and logs
- [ ] 21. Gates across schemas, ai, motion, web, render; screenshots of configure (video, audio, script), processing, dashboard working card (R8.3)
- [ ] 22. DEV_LOG, KIRO_LOG, decision D-088, steering notes (screens, ai-tasks, hybrid-ai, data-model) (R8.4)

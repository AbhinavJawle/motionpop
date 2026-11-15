# 07 · Scene engine and looks — tasks

_Written in a Claude Code session (2026-11-15). Requirements and design approved by the founder the same day (D-028)._

One task at a time. Each ends with typecheck, lint and tests green; motion work also passes `pnpm motion:check`. **[kiro]** marks tasks run headlessly with Kiro CLI and logged in `KIRO_LOG.md`. Tasks 1–20 are the Nov 30 scope. Spec 08 (export) runs in parallel from task 8.

## A. Foundations

- [ ] 1. **Spike (day one): cutouts.** Generate about 12 hard test images across `field-notes`, `paper-collage` and one token-level look. Compare keying alone, keying plus on-device segmentation (permissive licence only) and a second edit pass, at 100 % on light and dark surfaces. Record quality, time, cost and the chosen pipeline in `docs/decisions.md`. Also confirm the image call shape against the installed SDK types and the real price on the Agent Platform backend if the console shows it. — R4.1, R4.3
- [ ] 2. Library evaluation: `roughjs`, `perfect-freehand`, `d3-shape`, `d3-scale` for licence, size and determinism under our seeded RNG. Adopt or reject each; record in `docs/third-party.md` and `tech.md`. — NFR
- [ ] 3. Schemas: `score.ts` (score, energy), `look.ts` (extends `StylePackSchema`, all new blocks optional), `asset.ts`, `plan.ts` (director plan). Remote Config keys `imagesPerVideoMax`, `imageCredits`, `modelImage`, `planFreeCloudPerDay`. — R1.1, R3.1, R4.5, R6.1
- [ ] 4. **[kiro]** Property tests for the task 3 schemas: every existing style pack parses as a look; random valid scores round-trip; out-of-range values are rejected. — R1.1, R3.1

## B. Stage engine

- [ ] 5. Stage core: `stage.ts`, actors `text`, `number`, `shape` (depth layers, `set(props)`), behaviour families enter / emphasis / exit / secondary resolved from the look's motion personality, `compile()` returning a pure `seek`. — R2.4, R3.3
- [ ] 6. `beats.ts`: `scheduleBeats` (land on the word, forced order, read time, optional cues dropped and reported, exit timing) and quiet windows. — R2.3, R5.1, R5.1b
- [ ] 7. **[kiro]** fast-check properties for task 6: order kept; anchored cues within ± 80 ms when the slot allows; no overlap with a read window; deterministic. — R2.3, R5.1b
- [ ] 8. `juice.ts` + `camera-track.ts`: budget fill per energy from `look.juice`, legality against quiet windows, one camera track from camera cues, `insetForCamera` from the look's largest zoom. — R5.1, R5.1b, R6.2
- [ ] 9. **[kiro]** Properties for task 8: no gap longer than the energy interval; juice never targets a box in a quiet window; no fast camera move in a quiet window; `assertSeekPure` on random stages. — R5.1, R5.3

## C. First scenes

- [ ] 10. `stat-punch` (3 variants × 3 formats, image-free forms) on the engine, with `big-number` as its actor. Pure migration of saved `big-number` slots; the demo fixture renders unchanged. — R1.5, R2.1, R2.2
- [ ] 11. `hook-statement` (3 variants, word-by-word on the voice). Scene registry + generated catalogue summary for prompts; `solo(actor)` helper. — R2.1, R2.6
- [ ] 12. `motion:check` for scenes: scene × look × format matrix, new assertions from the stage report (beat budget per energy, read time, no dropped cue at ideal duration). — R5.2

## D. Looks

- [ ] 13. Materials (`paper`, `torn-edge`, `tape`, `white-border`, `shadow-soft`, `tilt`, `grain`) and decor (`marker-circle`, `marker-arrow`, `marker-underline`, `highlighter`, `stamp`, `torn-rule`), all seeded and identical in preview and render. Surface and mark resolution with plain fallbacks. — R3.1, R3.3
- [ ] 14. Look `field-notes`: look.json, fonts (OFL, bundled, recorded), reference provenance in its README, tuned against tasks 10–11 in all three formats. — R3.2, R3.4, R3.5, R8.1
- [ ] 15. Look `paper-collage`: stepped motion, torn strips, cut-out emphasis; same deliverables as task 14. Parity test gains one scene per polished look. — R3.2, R3.4, R8.1

## E. More scenes

- [ ] 16. `chart-story` (bars and line, each series on its word, data honesty). **[kiro]** property tests: geometry proportional from zero, labels equal formatted values, no label overlap. — R2.1, R2.5
- [ ] 17. `versus` (two sides, divider, verdict; image-free tiles). — R2.1, R2.2

## F. Images

- [ ] 18. `image.generate` in `packages/ai` (cloud only, kill switch, usage event, cost), prompt from the look recipe, subject validation; the cutout pipeline chosen in task 1 in a worker; asset store (Storage, IndexedDB in local mode) with hash reuse. — R4.1, R4.2, R4.3, R4.5
- [ ] 19. `photo-evidence` scene + image roles on `stat-punch` and `versus`; in-look placeholder and swap-in; one confirm card per video with the cloud chip and total; retry and upload; `canRender` gate and the compiler's render-mode guard. **[kiro]** properties: `canRender` false while any asset is pending; cap never exceeded; cutout function deterministic with alpha in [0, 1]. — R4.4, R4.5, R4.6, R4.7

## G. Direction and wiring

- [ ] 20. Director: `direct.plan` task (on-device first), `enforce.ts`, `fallback.ts`, the Processing step with its route chip, per-slot energy. Server route `plan-allowance` with the daily limit, rules for `users/{uid}/limits` and a rules test. Catalogue wiring: `slots.detect` and the deterministic detector map to scenes; `component.fill` returns scores with scene-aware checks; auto-fill stays device-only. **[kiro]** enforcer properties (any plan, garbage or fallback: no repeats, cap, candidates only, deterministic). — R1.2, R1.4, R6.1, R7.1
- [ ] 21. End-to-end on the sample and one real voiceover in both polished looks, all three formats: measure fill and preview times against R7, tune juice per energy, record numbers in DEV_LOG. Update `component-contract.md`, `component-library.md`, `style-pack-format.md` and `ai-tasks.md` to match what was built. — R7, NFR

## H. After Nov 30 (before Dec 4)

- [ ] 22. `map-journey` (moves into the Nov 30 scope if tasks 1–21 finish early; first to cut otherwise). — R2.1
- [ ] 23. Actor drawer in the rail: drop a single number, headline, chart, callout or image. — R2.6
- [ ] 24. Transitions between touching slots and look sound cues exported for spec 12. — R6.2, R6.3
- [ ] 25. Scenes `list-stack`, `timeline`, `quote`. — R2.1
- [ ] 26. Looks `ink-essay`, `bright-science`, `launch-day`; upgrade `editorial-explainer`. — R3.2
- [ ] 27. Director skills map to scenes, variants and beat patterns; Styles drawer reads them. — R6.4
- [ ] 28. Optional vision check on stills (off by default). — R5.4
- [ ] 29. Scenes `concept-diagram`, `document-highlight`, `product-hero`. — R2.1

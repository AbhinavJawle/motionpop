# 07 · Scene engine and looks — tasks

_Written in a Claude Code session (2026-11-15). Requirements and design approved by the founder the same day (D-028). Revised the same day to add the research additions (R9, D-029); no task had started, so the list is renumbered._

One task at a time. Each ends with typecheck, lint and tests green; motion work also passes `pnpm motion:check`. **[kiro]** marks tasks run headlessly with Kiro CLI and logged in `KIRO_LOG.md`. Tasks 1–28 are the Nov 30 scope. Spec 08 (export) runs in parallel from task 10.

**If time runs short, cut in this order:** `versus` (task 23), then the eval harness down to the `local` provider only (task 27), then the second polished look's tuning pass. `map-journey` is already after Nov 30.

## A. Foundations

- [x] 1. **Spike (day one): cutouts and image style.** Done 2026-11-15, D-030: colour keying with backdrop unmixing and a neutral-light prompt line; BiRefNet and the second edit pass rejected; text recipes hold the look, so reference images stay at task 32; real token counts, latency and the rate limit recorded. Evidence in `docs/research/experiments/cutout-spike/`. — R4.1, R4.2, R4.3, R9.7
- [x] 2. Library evaluation (2026-11-15). **Adopt at task 20:** `roughjs` 4.6.6 (MIT; generator API runs without a DOM; identical output for the same seed, but it calls `Math.random` when no seed is given, so every call must pass a non-zero seed and a test enforces it) and `perfect-freehand` 1.2.3 (MIT, no dependencies, pure). **Not adopted:** `d3-shape` and `d3-scale` (ISC, fine, but they bring 6 more packages for bars and polylines we can draw in a few lines; revisit for curved lines). They enter `docs/third-party.md` when installed. — NFR
- [x] 3. Schemas: `score.ts` (score, energy), `look.ts` (extends `StylePackSchema`, all new blocks optional), `asset.ts`, `plan.ts`, `gate.ts` (gate report), the optional `prosody` block on the transcript. Remote Config keys `imagesPerVideoMax`, `imageCredits`, `modelImage`, `planFreeCloudPerDay`. — R1.1, R3.1, R4.5, R6.1, R9.1, R9.2 _(The project's `assets` and `energy` fields are added with the tasks that use them, 25 and 27.)_
- [x] 4. **[kiro]** Property tests for the task 3 schemas: every existing style pack parses as a look; random valid scores round-trip; out-of-range values are rejected; a transcript without prosody still parses. — R1.1, R3.1
- [ ] 5. Schema rules applied: re-check the structured-output limits against the current docs, fix the numbers in `ai-tasks.md`, bring the existing tasks (`slots.detect`, `component.fill`, `edit.patch`, `transcribe.cloud`) in line, add `maxRepairs` to the router. **[kiro]** a test that walks every task's JSON Schema (depth, enum size, optional count, no schema text in prompts, prompt size against the on-device limit). — R9.4

## B. The voice as a signal

- [x] 6. `prosody.ts`: per-word loudness, pitch, duration per syllable and stress (0–100), pauses of 300 ms or longer; run after cleaning on the cleaned audio; stored on the transcript; the moments card shows the stressed-word count. _(Runs inline, not in a worker: it samples at most 8 pitch frames per word on an 8 kHz copy. Task 7 measures it; move it to the worker only if that is slow. A word with no audio under it stays at 50.)_ — R9.1
- [ ] 7. **[kiro]** Prosody tests: a table on synthesized signals with known loud, high and long words and known pauses; properties (deterministic, stress in 0–100, pauses inside the audio, silence gives none, input not mutated); a timing check on 3 minutes of audio. — R9.1

## C. Stage engine

- [ ] 8. Stage core: `stage.ts`, actors `text`, `number`, `shape` (depth layers, `set(props)`), behaviour families resolved from the look's motion personality, entrance intensity from stress, `compile()` returning a pure `seek` and a report. — R2.4, R3.3, R9.1
- [ ] 9. `beats.ts`: `scheduleBeats` (prosody snap for `snap: true` cues, land on the word, forced order, read time, optional cues dropped and reported, exit timing) and quiet windows. — R2.3, R5.1, R5.1b, R9.1
- [ ] 10. **[kiro]** fast-check properties for task 9: order kept; anchored cues within ± 80 ms of their (snapped) word when the slot allows; snap never moves more than one word and never moves a `snap: false` cue; no overlap with a read window; deterministic. — R2.3, R5.1b, R9.1
- [ ] 11. `juice.ts` + `camera-track.ts`: budget fill per energy from `look.juice`; the read-hold rule (only slow, non-covering motion while any quiet window is open; camera push at most 3 %); fast juice prefers pauses; one camera track from camera cues. — R5.1, R5.1b, R6.2, R9.5
- [ ] 12. **[kiro]** Properties for task 11: no gap longer than the energy interval; no fast juice, cover or text movement inside a quiet window; camera scale change within 3 % across a quiet window; `assertSeekPure` on random stages. — R5.1, R5.3, R9.5

## D. First scenes

- [ ] 13. `stat-punch` (3 variants × 3 formats, image-free forms) on the engine, with `big-number` as its actor. Pure migration of saved `big-number` slots; the demo fixture renders unchanged. — R1.5, R2.1, R2.2
- [ ] 14. `hook-statement` (3 variants, word by word on the voice). Scene registry, `scoreSchemaFor(scene)`, generated catalogue summary for prompts, `solo(actor)` helper. — R2.1, R2.6, R9.4
- [ ] 15. `motion:check` for scenes: scene × look × format matrix, with the stage-report assertions (beat budget per energy, read time, no dropped cue at the ideal duration). — R5.2

## E. Check, repair, examples, eval

- [ ] 16. Gate reports and repair: `gateSlot` (schema, fit, overlap, dropped cues, anchors, budget, read time) with code-written hints; `component.fill` uses it as its check with 2 repair rounds; safe default per scene; failures logged as usage events. — R1.4, R9.2
- [ ] 17. **[kiro]** Properties for task 16: every report names an actor and a rule; the loop never exceeds 2 rounds; whatever the model answers, the slot ends with a score that passes the gates; the safe default passes the gates for random spans and all formats. — R1.4, R5.3, R9.2
- [ ] 18. Example library: `exemplars.ts` for `stat-punch` and `hook-statement` (at least 2 per variant), code retrieval of the 2 closest, the CI test that gates every exemplar in all formats. Later scenes add their exemplars inside their own tasks. — R9.3
- [ ] 19. Eval harness (small): 6–8 fixtures, `local` and `cloud` providers, the metrics report and contact sheets. First baseline numbers go in DEV_LOG. — R9.6

## F. Looks

- [ ] 20. Materials (`paper`, `torn-edge`, `tape`, `white-border`, `shadow-soft`, `tilt`, `grain`) and decor (`marker-circle`, `marker-arrow`, `marker-underline`, `highlighter`, `stamp`, `torn-rule`), all seeded and identical in preview and render. Surface and mark resolution with plain fallbacks. — R3.1, R3.3
- [ ] 21. Look `field-notes`: look.json, fonts (OFL, bundled, recorded), reference provenance in its README, tuned against tasks 13–14 in all three formats. — R3.2, R3.4, R3.5, R8.1
- [ ] 22. Look `paper-collage`: stepped motion, torn strips, cut-out emphasis; same deliverables as task 21. Parity test gains one scene per polished look. — R3.2, R3.4, R8.1

## G. More scenes

- [ ] 23. `versus` (two sides, divider, verdict; image-free tiles), with exemplars. — R2.1, R2.2, R9.3
- [ ] 24. `chart-story` (bars and line, each series on its word, data honesty), with exemplars. **[kiro]** property tests: geometry proportional from zero, labels equal formatted values, no label overlap. — R2.1, R2.5, R9.3

## H. Images

- [ ] 25. `image.generate` in `packages/ai` (cloud only, kill switch, usage event, cost), prompt from the look recipe, subject validation; the colour-key cutout from D-030 in a worker (key estimate, matte, unmix, despill, guard); sequential generation with backoff; asset store (Storage, IndexedDB in local mode) with hash reuse. — R4.1, R4.2, R4.3, R4.5
- [ ] 26. `photo-evidence` scene with exemplars, plus image roles on `stat-punch` and `versus`; in-look placeholder and swap-in; one confirm card per video with the cloud chip and total; retry and upload; `canRender` gate and the compiler's render-mode guard. **[kiro]** properties: `canRender` false while any asset is pending; cap never exceeded; cutout function deterministic with alpha in [0, 1]. — R4.4, R4.5, R4.6, R4.7

## I. Direction and wiring

- [ ] 27. Director: `direct.plan` task (on-device first, peak stress per slot in its input), `enforce.ts`, `fallback.ts`, the Processing step with its route chip, per-slot energy. Server route `plan-allowance` with the daily limit, rules for `users/{uid}/limits` and a rules test. Catalogue wiring: `slots.detect` and the deterministic detector map to scenes; auto-fill stays device-only. **[kiro]** enforcer properties (any plan, garbage or fallback: no repeats, cap, candidates only, deterministic). — R1.2, R6.1, R7.1
- [ ] 28. End to end on the sample and at least two **real** recordings in both polished looks and all three formats: tune the prosody snap margin and juice per energy; rerun the eval harness and record before-and-after numbers in DEV_LOG; measure fill and preview times against R7. Update `component-contract.md`, `component-library.md`, `style-pack-format.md` and `ai-tasks.md` to match what was built. — R7, R9.1, R9.6, NFR

## J. After Nov 30 (before Dec 4)

- [ ] 29. `map-journey` (moves into the Nov 30 scope only if tasks 1–28 finish early). — R2.1
- [ ] 30. Actor drawer in the rail: drop a single number, headline, chart, callout or image. — R2.6
- [ ] 31. Transitions between touching slots and look sound cues exported for spec 12. — R6.2, R6.3
- [ ] 32. Style-reference images per look in `image.generate` (earlier if task 1 shows drift). — R9.7
- [ ] 33. Scenes `list-stack`, `timeline`, `quote`, with exemplars. — R2.1
- [ ] 34. Looks `ink-essay`, `bright-science`, `launch-day`; upgrade `editorial-explainer`. — R3.2
- [ ] 35. Eval harness grows to about 20 voiceovers with a model judge calibrated on 30 founder-labelled keyframes; then offline prompt optimisation with the harness as the metric. — R9.7
- [ ] 36. Director skills map to scenes, variants and beat patterns; Styles drawer reads them. — R6.4
- [ ] 37. Scenes `concept-diagram`, `document-highlight`, `product-hero`; optional vision check on stills (off by default). — R2.1, R5.4

Post-hackathon, not a task here: a small model fine-tuned on logged, gate-passing scores.

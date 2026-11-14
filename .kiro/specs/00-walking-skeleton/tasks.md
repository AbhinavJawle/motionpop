# Tasks: 00 walking skeleton

Tasks marked **[kiro]** are executed by Kiro CLI (`motionpop-builder` agent) and logged in `KIRO_LOG.md`. Others are done in Claude Code and logged in `DEV_LOG.md`.

- [x] 1. Monorepo skeleton: add `services/*` to the workspace; create `packages/schemas`, `packages/motion`, `packages/ai` (tsconfig, package.json, vitest) and `services/render`; scaffold `apps/web` (Next 16, Tailwind 4). Typecheck/lint/test green. _(shared with 01 task 1–2)_ — R3, R4
- [ ] 2. **[kiro]** `packages/schemas`: `time.ts` (+ property test round-trip), `transcript.ts`, `slot.ts` (SlotSuggestion), `ai.ts` (RunResult, JsonPatchOp). — R1.4, R2, R5
- [ ] 3. `packages/motion` core v0: eases, tween/interp, count-up; **[kiro]** property tests for eases (`e(0)=0`, `e(1)=1`, monotonic). — R3
- [ ] 4. `big-number` v0 (params zod, 16:9 layout, build, keyMoment) + **[kiro]** seek-determinism property test. — R3
- [ ] 5. Compiler + runtime (`hf-seek` bridge) → composition HTML; verify attributes against the HyperFrames skill/source. Unit test for clip attributes. — R3.1, R3.2, R3.4
- [ ] 6. **Spike:** play the compiled composition in `<hyperframes-player>` on `/dev/skeleton` with the voiceover; check sync. — R3.2, R3.3
- [ ] 7. **Spike:** render the same composition to MP4 with `@hyperframes/producer` from `services/render/scripts/skeleton.ts`; compare stills with the preview. Record D-009. — R4, R6.2
- [ ] 8. Whisper worker (transformers.js, WebGPU → WASM) + upload + word list on `/dev/skeleton`. — R1
- [ ] 9. Firebase client + App Check debug + AI Logic; `packages/ai` router with `slots.detect` and repair/fallback; show ranOn. _(needs the Firebase project)_ — R2
- [ ] 10. `edit.patch` on-device + apply + validate + recompile; show ranOn. — R5
- [ ] 11. Log timings; write DEV_LOG measurements; update decisions. — R6

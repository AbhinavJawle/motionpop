# Tasks: 03 motion engine

Tasks marked **[kiro]** are executed by Kiro CLI (`motionpop-builder`) and logged in `KIRO_LOG.md`. Others are done in Claude Code and logged in `DEV_LOG.md`.

- [ ] 1. **[kiro]** `packages/schemas/src/style.ts`: `StylePackSchema` exactly per `style-pack-format.md` (+ `EaseName` enum matching `packages/motion/src/core/ease.ts`), unit tests (accepts the example pack, rejects bad hex / short chart palette). — R2.1
- [ ] 2. **[kiro]** Core: `rng.ts` (`mulberry32`, `rngFor`), `stagger.ts`, `timeline.ts` (`track`) with fast-check property tests (determinism, range, monotonic stagger, endpoint holds, continuity at keys). — R1.1, R1.2, R1.4
- [ ] 3. Core: `split-text.ts`, `path-draw.ts`, `camera.ts`, `safe-area.ts`, `fit-text.ts` + unit tests. — R1.1, R1.3
- [ ] 4. **[kiro]** Property test for `fitText` bounds and truncation (happy-dom with a deterministic measuring stub). — R1.3
- [ ] 5. `editorial-explainer.json` + `styles/index.ts`; `BuildContext.style: StylePack`; migrate big-number and the skeleton page. — R2.2, R2.3
- [ ] 6. Fonts: bundle Geist/Geist Mono woff2, `font-faces.ts`, compiler embeds `@font-face`; runtime waits for `document.fonts.ready`. — R3.2, R4.1
- [ ] 7. Compiler v1: formats, background + deterministic texture layers, captions host; tests. — R3.1, R3.3, R3.4
- [ ] 8. Runtime v1: `__motionpop` API, per-slot error isolation with placeholder; test with a throwing component. — R4.2, R4.3
- [ ] 9. big-number v1: per-format layouts, `fitText`, `data-text` / `data-focal`, samples file. — R7.1
- [ ] 10. `motion:check` script + root `pnpm motion:check <id>`; `big-number` passes. — R5
- [ ] 11. Parity script (runtime stills vs producer frames at 5 timestamps). — R6.1

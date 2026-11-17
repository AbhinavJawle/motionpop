# Spec 07b · tasks

Order: engine and kit first (the lab proves them against real models), then the app.

- [x] 1. Experiment: the Suez voiceover as custom graphics in 3 setups × 2 models, logged in `docs/research/film-mode.md` with contact sheets. — R3 (evidence)
- [x] 2. Film kit: timeline, word timing, sheet, paper, marks, lines, icons, dots, map with camera, shared drawings, seam halves, sound cues; `KIT_DOC` and `kitExample`. Lint accepts kit scripts. — R2.3, R3.2
- [x] 3. Runtime and compiler: film beats (no whole-frame seam, no push-in, no backdrop, tail and stacking, grain over), words with text for custom scripts. — R2.2, R2.5, R7.1
- [x] 4. Storyboard schema, `timeBeats`, `storyboardIssues`, spoken-number check. — R1.2, R1.3, R1.4
- [x] 5. `film.direct`, `film.build`, `film.props` tasks and prompts with the distilled craft; `makeFilm` orchestration (parallel builders, critic rounds, best-version rule, failed beats). — R1.1, R2.1, R2.4, R3.1, R4.2
- [x] 6. Critic: `inspectBeat`, `criticText`, `window.__motionpop.inspect`. — R4.1
- [ ] 7. **[kiro]** Tests for tasks 2 to 6 (design §9): property tests for `timeBeats`, `storyboardIssues` and the timeline; unit tests for the seam halves, lint additions, `lintProp`, `unspokenNumbers`, `makeFilm` with a fake router; `kitExample` purity in every format; the kit reference names only things the kit has. — design §9
- [ ] 8. App: `film` credit action (unit: started 30 s) in the price list, spend route and tests; `makeFilmForProject` (router, sandbox critic by `postMessage`, refund on failure, quick-mode fill for failed beats); one command that replaces the slots. — R4.3, R5.3, R6.1, R6.2
- [ ] 9. App: project `film { storyboard, props }`, "Make it a film" button with cost and route chip, progress by role, "Rebuild this beat", the offline / no-credits / paused states. — R5.1, R5.2, R5.4, R5.5, R6.3
- [ ] 10. **[kiro]** Export parity for a film (tails and stacking) in the render service; a film project fixture; motion:check accepts film beats. — R7.1
- [ ] 11. Hosted end-to-end check on the judge account (one short film, cents), DEV_LOG and the decision entry. — all

_Built (Claude Code, 2026-11-17): tasks 1 to 6, proven in the lab against real models (see the research log). Not yet: the app (tasks 8, 9), so film mode is not reachable from the editor._

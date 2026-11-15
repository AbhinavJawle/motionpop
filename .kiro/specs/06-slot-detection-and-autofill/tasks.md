# Tasks: 06 slot detection and auto-fill

Tasks marked **[kiro]** are executed by Kiro CLI (`motionpop-builder`) and logged in `KIRO_LOG.md`. Others are done in Claude Code and logged in `DEV_LOG.md`. Blocked tasks wait on the Firebase project.

- [x] 1. **[kiro]** `packages/ai/src/slots/numbers.ts`: `parseSpokenNumber` per design, with a table of at least 40 cases and a fast-check round-trip for digit numbers. — R1.2
- [ ] 2. **[kiro]** `gazetteer.ts` (public-domain place names) + `tagger.ts` (`tagSpans`), with a table of at least 20 cases including the demo transcript, and properties (no fillers, no cross-sentence spans, deterministic). — R1.1, R1.3, R1.4
- [x] 3. `catalogue.ts`: components (from `component-library.md`) and skills (from `skills/*.md` frontmatter), plus consistency tests against the motion registry. — R2.4
- [ ] 4. **[kiro]** `post-pass.ts` with injected limits/validation and fast-check properties (R3.3). — R3
- [x] 5. `detect-local.ts`: deterministic detector (scores, budget, params, reasons) + unit tests. — R2.1, R2.2
- [ ] 6. Pipeline integration: moments and suggest steps, `slots` event, dashed slot cards in the word strip, versions for ready slots; Pip bubble "N slots ready". — R4, R5.2
- [ ] 7. **[kiro]** Update the e2e and perf tests: the sample yields its suggested slots in the editor; tagger + detect + post-pass < 50 ms on 3,000 words. — R4, NFR
- [ ] 8. _(blocked: Firebase)_ `slots.detect` through the router with prompt v1, repair and fallback to `detectLocal`. — R2.3
- [ ] 9. _(blocked: Firebase)_ `useAutoFill` with `component.fill` on-device. — R5.1, R5.3

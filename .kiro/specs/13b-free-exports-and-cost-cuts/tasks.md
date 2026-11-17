# Spec 13b · tasks

- [x] 1. **[kiro]** Free exports: `DEFAULT_EXPORT_CREDITS` 0, no spend / ledger / refund at cost 0 (client flow, server handler, render service ledger), "Free" chip in the export modal, export prices removed from landing, ledger and out-of-credits texts. Tests. — R1 *(Kiro CLI run18, 2026-11-17)*
- [ ] 2. **[kiro]** Film mode cheaper: `modelFilmBuild` default fast model, thinking levels, `maxRepairs: 1` in the app, shared/beat prompt split with the identical-prefix test. — R3.1–R3.4
- [ ] 3. **[kiro]** `maxOutputTokens` on every cloud task, passed through the provider; test that every cloud task has one. — R3.5
- [ ] 4. **[kiro]** Router cache (`packages/ai/src/cache.ts`, IDB store in the app), `cacheable` on prefill / slots.detect / captions.chunk, `cached` on the result and usage event; cached token count from the provider when present. — R4.1, R5.1
- [ ] 5. **[kiro]** Voice part cache in `generate-voice.ts`. — R4.2
- [ ] 6. **[kiro]** Chunked on-device `slots.detect` for long transcripts (`detectInChunks` + route change), property test. — R4.3
- [ ] 7. **[kiro]** Render reuse by `renderKey` in the export handler; tests. — R2
- [ ] 8. D-074 in `docs/decisions.md`, steering updates (`security-and-cost.md` cost controls, `hybrid-ai.md` routing table row for long `slots.detect`, `ai-tasks.md` film costs). — R5.2

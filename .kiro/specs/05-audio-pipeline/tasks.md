# Tasks: 05 audio pipeline

Tasks marked **[kiro]** are executed by Kiro CLI (`motionpop-builder`) and logged in `KIRO_LOG.md`. Others are done in Claude Code and logged in `DEV_LOG.md`. Blocked tasks wait on the Firebase project.

- [ ] 1. **[kiro]** `lib/audio/intake.ts`: `INTAKE_LIMITS` and `validateIntake` (MIME with extension fallback, 50 MB, friendly messages) + unit tests. Tighten `chunksToWords` to R2.3 (min 40 ms, no overlap) and check `isFiller` never flags meaningful words. fast-check property for the R2.3 word invariants over random chunk lists. — R1.1, R1.2, R2.3, R2.4
- [ ] 2. **[kiro]** `lib/audio/edl.ts`: `buildEdl`, `mapTime`, `retimeWords`, `cleanedDuration` per design "Cleanup rules", with unit tests for each rule and fast-check properties for the EDL and re-timing invariants. — R3.1, R3.2, R3.4, R3.6
- [ ] 3. Schemas: `VoiceoverSchema` optional fields, `EditorProject.originalTranscript`; update `data-model.md`; fixtures still parse. — R3.5, R4.2, R4.4
- [ ] 4. `lib/audio/wav.ts` (moved `encodeWav`), `decode.ts` (16 kHz + 24 kHz, `isSilent`), `render-cleaned.ts` (OfflineAudioContext, equal-power crossfades). — R1.3, R3.3
- [ ] 5. `AudioStore` interface, `MemoryAudioStore`, `IdbAudioStore` (lazy factory) + tests with fake-indexeddb; `loadVoice` resolves `idb:` refs. — R4.1, R4.3
- [ ] 6. `lib/pipeline/events.ts` + `run.ts` orchestrator with injected deps, cancel and rollback; sample input (synth fallback, honestly labelled). — R2.1, R2.2, R3.5, R4.2, R1.4
- [ ] 7. **[kiro]** Unit tests for `runPipeline` with fakes: event order, cancel at each step writes nothing, failed store rolls back refs, cleanup over 40 % skipped, no-words error. — R4, R5.4
- [ ] 8. Processing screen `/processing/[id]`: drop zone (`new`), Pip glow, step cards, mini timeline, live region, cancel/retry, transition to the editor, reduced motion. — R5
- [ ] 9. **[kiro]** Playwright: `renderCleaned` seam/length test on a synthetic tone; Processing with the sample reaches the editor and survives a reload; real Whisper run behind `E2E_WHISPER=1`. — R3.3, R5, NFR
- [ ] 10. Measure a 3-minute voiceover end to end (cached model) and log it in DEV_LOG; record D-024 (step order, 24 kHz output). — NFR
- [ ] 11. _(blocked: Firebase)_ `transcribe.cloud` fallback through `packages/ai` with the cost shown first; `timingQuality: "approx"` warning. — R2.5
- [ ] 12. _(blocked: Firebase)_ `tts.generate` for script → voice, cleanup off by default. — R6.1

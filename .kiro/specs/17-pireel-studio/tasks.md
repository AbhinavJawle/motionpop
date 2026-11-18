# Spec 17 · tasks

Order: prove the embed first (the riskiest step), then the bridge and graphics, then providers, then video and export.

- [x] 1. **Founder:** install and run Pireel standalone (`corepack pnpm@9.12.0 install && pnpm dev` in `~/Developer/ref/pireel`): import a clip, cut, caption, export. Note what works without a backend. — R2
- [x] 2. Vendor the four packages under `vendor/pireel/`, add to the workspace, licence to AGPL-3.0, credit in `docs/third-party.md`. Typecheck the workspace. — R1
- [x] 3. `/studio/[id]` mounts `<PireelEditor>` with `unavailableProviders()` in the Next app (client-only, Pireel CSS, GSAP vendor file served). — R2.1
- [x] 4. `bridge.ts` + tests: a Motionpop voice project opens in the studio with its narration, transcript and captions. — R3.3–R3.5
- [x] 5. `mountBlock` + `block-runtime.js`; vendored `assembleHtml` loads it; a `motionpop` block template; seek purity and parity tests. — R4.1–R4.3
- [x] 6. Slots become word-anchored graphic clips; graphics play in the studio preview. — R3.4
- [ ] 7. **[kiro]** Provider adapters on the device: transcriber, autoHighlight, draftInsertPrompt, syncFill, translate (fake router in tests). — R5.1, R5.3, R5.6
- [ ] 8. speechCleanup (EDL + retakes), projects/vault/uploads (IDB first, then Firestore/Storage). — R5.2, R5.5
- [ ] 9. Route chips and the on-device/cloud toast inside the studio (extensions). — R2.3
- [x] 10. Video on the start screen: accept video, extract audio on the device, run the pipeline, open the studio with narrative clips per kept segment. — R3.1–R3.3
- [ ] 11. composer, brandTitles, editPlan, chat endpoint in the cloud with costs shown. **Needs the founder's go for paid test calls.** — R5.4
- [ ] 12. R6 prompt changes for `custom.compose` and film builders; `data-edit` keys; graphic fit over footage. — R6
- [ ] 13. Export: browser export by default, Cloud Run for canvas/WebGL graphics; parity stills. — R4.3, R4.4
- [ ] 14. **[kiro]** E2E (fake AI): start → video → processing → studio → export. — all

## Notes
- 2026-11-18 (Claude Code): task 1 run by the founder (`pnpm dev` in the Pireel clone, editor loads). Tasks 2–3: four packages vendored, explicit exports generated (Next resolves package exports, not tsconfig paths), vendored code checked as its own TS project with Pireel's settings (`tsc -b vendor/pireel`), the studio got its own root layout (site pages moved into `app/(site)/`, URLs unchanged). Checked headless: `/studio/demo` renders the full editor; a 64 s MP4 imports, decodes and lands on the timeline with thumbnails and waveform. Web typecheck, lint and 1153 tests green.
- 2026-11-18 (Claude Code): tasks 4, 5, 6 and 10 built without tests (founder's call: speed first). Upload a video → the pipeline runs on its audio on the device → `lib/studio/bridge.ts` builds the edited document: ripple cuts where cleanup cut fillers and pauses, punch-ins on alternate jump cuts, captions, each ready slot as a word-anchored `custom` block driving our engine through `block-runtime.js` (`globalThis.__mpBlocks`), synthesized SFX and a music bed → the studio adopts it once (IndexedDB hand-off). Checked headless in local mode (no cloud calls): a 64 s MP4 goes from upload to an edited studio timeline in about 64 s, and our map scene renders in the studio preview under the captions. Open: assets show "Uploading 0%" (the uploads provider is development-only); only slots with status `ready` become graphics; full-frame graphics cover the speaker.

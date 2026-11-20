# Spec 18 · Tasks

- [x] 0. Remove all third-party Pireel/studio code, restore Apache-2.0 licence, update steering/docs (D-077), verify typecheck + lint green. — R1.1, R1.2
- [x] 1. **[kiro]** Video-native schemas (`packages/schemas/src/video.ts`) + `EditorProject.video` + `Slot.placement` + `Slot.overlayAnchor` + time-mapping helpers (`keptSourceSegments`, `cleanedToSourceMs`, `sourceToCleanedMs`, `activePunchIn`) + unit & fast-check property tests. — R2.1, R2.2, R2.3
- [ ] 2. **[kiro]** Default `modelStrong` to `gemini-4-neon`, add `PIP_MODEL_CHOICES` in `packages/schemas/src/config.ts`, add `model` override support in `packages/ai/src/router.ts`, and update tests. — R3.1, R3.2
- [ ] 3. Multimodal AI Video Director task `video.direct` (`packages/ai/src/tasks/video-direct.ts`, prompt, enforcer, deterministic fallback, and tests including property tests). — R4.2, R4.3
- [ ] 4. Video overlay & cutaway mode in `packages/motion` compiler + runtime (`hasVideo`, per-slot opaque cutaway backdrop vs positioned transparent overlay card, seek purity + compile tests). — R5.3
- [ ] 5. Video intake, keyframe sampling (`apps/web/lib/video/frames.ts`), and `runPipeline` integration so uploaded videos run `video.direct`, store source video, and open directly in `/editor/[id]`. — R4.1, R4.2
- [ ] 6. Live `<video>` + cut-skipping + punch-in zoom layer behind transparent `<hyperframes-player>` in [PreviewPlayer](file:///Users/abhinavjawle/Developer/motionpop/apps/web/components/editor/preview-player.tsx) + playback sync. — R5.1, R5.2
- [ ] 7. **[kiro]** Editor undoable video commands (toggle cut, manual word-range cut, toggle/add punch-in, set slot placement & overlay anchor) + Inspector Overlay/Full-screen & position controls + timeline cut indicators + tests. — R5.4
- [ ] 8. Pip model selector UI + localStorage persistence + upgraded `pip.plan` video actions (`cutRange`, `toggleCuts`, `addPunchIn`, `setPlacement`) + video quick chips + tests. — R3.3, R6.1, R6.2
- [ ] 9. **[kiro]** FFmpeg video cut + punch-in + alpha-overlay filter-graph builder (`services/render/src/video-ffmpeg.ts`) + unit/property tests + wire into `services/render/src/run-render.ts` and storage upload/download. — R7.1, R7.2
- [ ] 10. End-to-end verification (full workspace typecheck, lint, tests, live Gemini 4 Neon smoke test on `fbailogic26vrt-3068`, DEV_LOG + KIRO_LOG honest entries). — all

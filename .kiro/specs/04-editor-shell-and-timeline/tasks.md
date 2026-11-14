# Tasks: 04 editor shell and timeline

Tasks marked **[kiro]** are executed by Kiro CLI (`motionpop-builder`) and logged in `KIRO_LOG.md`. Others are done in Claude Code and logged in `DEV_LOG.md`. Definition of done: typecheck, lint and tests green; UI tasks compared with `design/screens/editor.png` at 1440×900.

- [x] 1. **[kiro]** `packages/schemas/src/project.ts`: `SlotStatusSchema`, `SlotSchema`, `FrameNoteSchema`, `VersionSchema`, `VoiceoverSchema`, `EditorProjectSchema` (integer ms, `schemaVersion: 1`, timeline invariants in `superRefine`); export from `index.ts`; tests (accepts a valid project; rejects overlap, out-of-bounds, non-integer ms, end ≤ start). Verify: `pnpm --filter @motionpop/schemas test`. — R1.1, R2.2
- [x] 2. **[kiro]** `apps/web/lib/timeline/` `geometry.ts`, `snap.ts`, `constraints.ts`, `invariants.ts` per design.md, with fast-check properties. Verify: `pnpm --filter @motionpop/web test`. — R2.2, R2.3, R6.1, R6.3
- [x] 3. **[kiro]** `apps/web/lib/commands/` (Command, Composite, history with cap 200, AddSlot, DeleteSlot, MoveSlot, ResizeSlot, DuplicateSlot, UpdateParams via fast-json-patch, SetFormat, SetStyle, RenameProject) using task 2's constraints; property tests `undo(do(s)) == s` and random sequences keep invariants. — R2.1–R2.4
- [x] 4. **[kiro]** Peaks: `apps/web/lib/audio/peaks.ts` (pure min/max per bucket) + `workers/peaks.worker.ts` (zod-validated messages) + tests. — R4.4
- [x] 5. Store and persistence: `useEditor` (Zustand + Immer, selectors, `exec`/`undo`/`redo`, drag preview), `ProjectRepository`, IndexedDB implementation with last-good backup, debounced save + status, demo fixture with the seeded synthetic voice. — R1.2–R1.4
- [x] 6. Shell: `/editor/[id]` route, TopBar, Rail, PreviewPane (player + recompile), Inspector (basic), layout at 1440×900 / 1280×720. Compare with editor.png. — R3
- [x] 7. Timeline static: header, ruler, SLOTS (all card states), WORDS (karaoke styles, selected band), VOICE canvas, AUDIO band, hints. Compare with editor.png. — R4
- [x] 8. Playback: audio master clock, rAF loop writing CSS vars, playhead + capsule scrubbing, word click seek, preview sync, transport and timecode. — R5
- [ ] 9. Interactions: drag move/resize with snap + magnetic settle + neighbour stops, shift-drag create, zoom anchored at the cursor, scroll, auto-scroll, keyboard map, focusable slots. — R6, R7
- [ ] 10. E2E (Playwright) demo-path test for the editor and the 1440×900 design check; performance page (50 slots / 3,000 words). — R1–R7, NFR

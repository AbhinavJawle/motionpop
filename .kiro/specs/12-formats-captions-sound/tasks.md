# Tasks: 12 formats, captions and sound

_Written headlessly in Kiro CLI (claude-opus-5.5), 2026-11-16. Revised the same day (headless run, claude-sonnet-5.5) to apply every finding of `REVIEW.md`. Not yet approved by the founder; open questions are at the end._

One task at a time. Definition of done for each: prettier, typecheck, lint (0 warnings) and the touched packages' tests green; `packages/motion` work also passes `pnpm motion:check` for what it touches; UI tasks pass their design check. **[kiro]** marks tasks suited to the headless `motionpop-builder` agent; they are logged in `KIRO_LOG.md`. **IDE** marks steps outside the builder agent's write paths (root rules files, `docs/**`, `.kiro/steering/**`, `.github/**`): the exact edit is in the task.

## Two deliverables, one folder

Decision: one folder `12-formats-captions-sound` with two task sections, not two folders. The spec list in `workflow.md`, the session hook (it reads `tasks.md` per folder) and every cross-reference keep working; the split is the section. Task ids are `A1…` and `B1…`.

- **Section A, 12a formats and captions: must ship by Thu Nov 26.** Format switch, safe zone, three caption presets, captions in the export. It never depends on section B.
- **Section B, 12b sound: first to cut, and cut as one block** (the plan's cut #4 drops the Audio panel; the block also drops effects, music, ducking and the bed), so the product never ships half a mixer. Order of the block if it must be trimmed instead of dropped: the Audio panel first, then music, then ducking, then auto effects.
- If 12b is cut, the export modal's "Include music" stays "Soon" (spec 08 R1.7) and nothing in section A changes.

Prerequisites from other specs: spec 10 task 2b (`captions` field and `setCaptions`) before A1; spec 08 task 4 (`projectCompileInput` in `packages/motion`) before A5; spec 08 tasks 5, 12 and 15 before A8; spec 11 tasks 1 and 7 (derived `ProjectDocSchema`, the audio path) before B1 and B7; spec 10 task 1 (the left-panel container) before B10.

## A. 12a formats and captions (demo path, must ship)

- [ ] A1. **[kiro]** Settings, verified and bound. Spec 10 task 2b already built the `captions` field (default `{ enabled: true, presetId: 'pop' }`) and `setCaptions`; this task lists it as done and does the rest of R3: new projects start with `enabled = settings.captionsDefault` (the pipeline's project creation reads `UserSettings.captionsDefault`; Settings keeps writing it, spec 13); remove `captions` and `toggleCaptions` from `apps/web/lib/stores/editor.ts` and bind the toolbar toggle in `preview-pane.tsx` to `setCaptions`. Tests: an old project parses with captions on + pop; a project with captions set round-trips through spec 11's `toDocs` → `fromDocs` (waits for spec 11 task 2 if it is not done); property 10 (`undo(do(s)) == s` for `setCaptions`, a format switch changes only `format`). — R3.1, R3.2, R1.4
- [ ] A2. Format switch feedback: the new runtime call `__motionpop.buildAll()` (it does not exist yet; builds every slot once, hidden, returns the warnings) in `packages/motion/src/runtime`, the measured toast with "{n} graphics shortened their text" + Show, burst suppression, wired to the `SegmentedPills` in `top-bar.tsx`; a `packages/motion` test that every registered component and scene supports all three formats. — R1.1–R1.4
- [ ] A3. Safe zones: `platformZones(format, w, h)` in `packages/motion/src/core/safe-area.ts` (design §3, built only from `safeArea`'s numbers, unit-tested against it), the overlay (hatched outside area, 9:16 platform zones with labels), the toggle persisted in localStorage `mp:safe-zone` (the store already has `safeZone`), outside the iframe. — R2
- [x] A4. **[kiro]** `packages/motion/src/captions/chunk.ts`: `chunkCaptions` per design §4.1, with unit cases and properties 1 (coverage) and 2 (timing). No model, no device path. — R4.1–R4.5
- [x] A5. `packages/motion/src/runtime/captions.ts` (`mountCaptions`, presets, positions, `fitText`, `data-text` / `data-on` hooks, the feather inset), `CompileInput.captions`, and `projectCompileInput` (spec 08 task 4, `packages/motion/src/compiler/project.ts`) passing groups (recomputed on transcript or format change) and the look's accent, in preview mode and in render mode (computed from the snapshot). **[kiro]** for properties 3 (contrast), 4 (safe area) and 5 (`assertSeekPure`). — R5, R4.5
- [ ] A6. `pnpm motion:check captions`: a target in `scripts/check.ts` over presets × formats × white / black / built looks with random and edge-case groups, asserting safe area, overflow, contrast and one visible group, plus the **report-only overlap line** (caption box against `data-text` / `data-focal` elements at the hold-end frame of every scene and format); `show-*` stills kept. — R11.1
- [x] A7. Captions UI: toolbar toggle on the command, the "CC Captions" popover with the three presets and live sample lines, keyboard and reduced-motion behaviour. **Flips `PIP_CAPTIONS_READY` to `true`** in spec 10's `lib/pip/enforce.ts`, so Pip's `setCaptions` steps stop being dropped. — R3.2, R3.3, R3.4
- [ ] A8. **Captions in the export: the spec 08 changes of design §9, items 1 to 4.** Spec 08's files are not edited; these are built when spec 08's route and job exist (prerequisite: its tasks 5, 12 and 15):
  1. `RenderRequestSchema`/`RenderOptionsSchema` stay strict; the route accepts `captions: true` and the handler test that rejected it now asserts acceptance;
  2. the job computes `chunkCaptions(snapshot)` through `projectCompileInput` in render mode (the client uploads nothing);
  3. the export modal's "Captions" toggle leaves "Soon" and defaults to `project.captions.enabled`;
  4. `services/render/scripts/parity.ts` gets a captions-on case per format.
  Tests: a render request with `captions: true` is accepted and the doc stores it; the compile input of preview and render modes carry the same groups for random projects (extends 08's P9); parity stills match. — R4.5, R5.5
- [ ] A9. **[kiro]** Playwright `apps/web/e2e/formats-captions.spec.ts` on `/editor/demo?rail=none`: 16:9 → 9:16 shows "Re-laid out for vertical · …" and a vertical frame, ⌘Z restores 16:9; Safe zone shows the bands in 9:16; the captions toggle and the "Boxed" preset survive a reload; no page errors. — R1–R3
- [ ] A10. Design check with the Chrome DevTools MCP: `/editor/demo?t=5600&select=slot-2&rail=none` at 1440×900, device scale 2, compared with `editor.png` for the preview toolbar; then same-language review stills of the 9:16 editor with Safe zone on and the captions popover against `screens.md` and `design-system.md`. Fix, re-check once, log the findings, keep stills in `.check/design/`. — R11.2
- [ ] A11. Stills review: contact sheets of captions (each preset) over the hold-end stills of every scene in 3 formats × the built looks, reviewed by the `motion-qa` agent together with the overlap numbers of A6, its findings fixed (if the 16:9 overlap is often above 15 % the caption lifts by one line, decided here and logged in D-067), one confirming look by eye; logged. — R5.1, R5.4, R11.1
- [ ] A12. Performance: format switch on the 5-slot demo project **and a 40-slot project**, median of 5 runs, logged with the machine. — R11.3

## B. 12b sound (first to cut; one block)

- [ ] B1. **[kiro]** `audio` on `EditorProjectSchema` with defaults (design §1), the `setAudio` command (`undo(do(s)) == s`), `AppConfigSchema` keys `musicSynthEnabled` / `audioDefaultMusic` with `parseRemoteConfig` tests; verify that a project with `audio` set round-trips through spec 11's `toDocs` → `fromDocs`. Tests: an old project parses with default audio. — R10.2, R7.3
- [ ] B2. **[kiro]** `packages/motion/src/sfx/synth.ts`: the five kinds with ≥ 2 takes each per design §5, seeded from `core/rng.ts`; `sfx/wav.ts` with `encodeWav16` as the **one** WAV encoder, and `apps/web/lib/audio/wav.ts` `encodeWav` becomes a wrapper that keeps its 22 050 Hz default and `ArrayBuffer` return (existing tests and `readWavHeader` unchanged). Property 7 for effects (deterministic, finite, peak ≤ −1 dBFS, exact length) and a test that each kind's peak position matches its table entry within 2 ms; the WAV header test uses a small parser written in the test (packages/motion cannot import `readWavHeader` from apps/web), and an apps/web test checks `readWavHeader(encodeWav(x))` is unchanged. — R6.1, R6.3
- [ ] B3a. **IDE:** apply this diff to `storage.rules` (before the `renders` block), validate it with the emulator load, never deploy:
  ```diff
  +    // The mixed sound bed (spec 12b): written by the owner's browser, read by the owner;
  +    // the render service reads it with the Admin SDK.
  +    match /users/{uid}/projects/{pid}/bed/{file} {
  +      allow read: if isOwner(uid);
  +      allow write: if isOwner(uid)
  +        && request.resource != null
  +        && request.resource.contentType == 'audio/wav'
  +        && request.resource.size <= 50 * 1024 * 1024;
  +      allow delete: if isOwner(uid);
  +    }
  ```
  Music uploads need no rule change: `users/{uid}/audio/{file=**}` already covers `audio/{projectId}/music-*.wav`. — R9.4, R7.1
- [ ] B3b. **[kiro]** Storage rules tests (`apps/web/rules/storage.rules.test.ts`): owner write/read of `…/bed/{key}.wav`; another user denied; a wrong content type and a > 50 MB object denied; the `renders` path is still server-only; `…/audio/{projectId}/music-{hash16}.wav` writable by the owner. — R9.4, R7.1
- [ ] B4. **[kiro]** `packages/motion/src/sfx/place.ts`: `placeSfx` per design §5 with unit cases and property 6. — R6.2, R6.5
- [ ] B5. **[kiro]** `packages/motion/src/sfx/duck.ts`, `limiter.ts`, `mix.ts` (`mixBed`, `bedKey` with `voiceLevelDb` and the active voice ref among its inputs), `level.ts` (voice level over word regions); properties 8 (ducking) and 9 (bed). — R8.1, R8.2, R9.1, R9.2
- [ ] B6. Bed in the editor: `workers/bed.worker.ts` (zod messages), debounced re-mix (300 ms), `lib/editor/bed-player.ts` synced to `PlaybackClock` (`lib/editor/playback.ts`) with drift correction and a click-free swap (best effort: R9.4 says why), and the timeline `audio-track.tsx` drawing `placeSfx` pills and the `duckEnvelope` line with the three labels ("♫ Music · ducked", "♫ {name}", "♫ Add music" → opens the Audio panel). — R6.4, R8.3, R9.3, R9.4
- [ ] B7. Music: `packages/motion/src/sfx/music.ts` (`synthBed` calm-pad and steady-pulse per design §6, loops, fades, crossfades) behind `musicSynthEnabled`; own-track upload (intake rules, decode, resample, `HybridAudioStore.put(blob, { projectId, kind: 'music' })`), decode failure message; new projects take `audioDefaultMusic`. Property 7 for the beds. — R7
- [ ] B8. **The bed in the export: the spec 08 changes of design §9, items 5 to 9.** `ensureBedUploaded(project, { includeMusic }) → { path, key } | null` (null with nothing to mix, reuse by `bedKey`, upload once per key, keep the last 3 beds of the project); `bedPathFor` in `packages/schemas/src/render.ts`; `bedPath` on the request and doc; the route and the job check it like the voice and `ffprobe` it; `music: true` accepted; no `<audio id="bed">` when there is no bed; `parity.ts` gets the audio case; the export modal's "Include music" leaves "Soon". Prerequisite: spec 08 tasks 6, 12 and 13. Tests: a bed outside the owner's path fails as `input-missing` without a read; no bed → no `bedPath` → no `<audio id="bed">`; `music: false` gives a bed with effects only. — R9.4, R9.5
- [ ] B9. **[kiro]** The real-producer audio test (R11.5; needs ffmpeg and Chrome, skipped locally when missing, always run in CI): a bed with a click at a known time and level, rendered to MP4 through the job's compile path; assert the click lands within one frame (33 ms) and its level is within 1 dB of the bed file. Add the same assertion to spec 08 task 9's integration test list. — R11.5
- [ ] B10. Audio panel (design §8) in the spec 10 left-panel container: music rows with ▶ excerpts, own-track picker, level slider with dB readout, ducking toggle, effects toggle, count, Shuffle takes, effects level, footer note; one command per release. — R10
- [ ] B11. _(blocked: the founder)_ Listening check: the founder hears every effect take and both beds over the demo voiceover in the **exported MP4** (task B8's output) and in the preview, on laptop speakers and headphones, and approves, asks for changes, or rejects the beds (then they stay off and "Your own track" is the music path). Log the verdict; turn `music_synth_enabled` on in Remote Config only after approval (production config: the founder does it or approves it). — R11.4
- [ ] B12. **[kiro]** Playwright `apps/web/e2e/sound.spec.ts` on `/editor/demo?rail=audio`: turning "Pops and whooshes" off empties the AUDIO pills and re-mixes; the bed element stays within 60 ms of the clock after 5 s of play (it checks the element's `currentTime`, not what the user hears, R9.4); no page errors. — R6, R9
- [ ] B13. Design check and stills: `editor.png` regions for the timeline AUDIO track (labels, envelope line, pill positions) with `rail=none`, and the Audio panel against `screens.md` and `design-system.md`; fix, re-check once, log. — R11.2
- [ ] B14. Performance: a 3-minute bed mix in the worker, median of 5 runs, logged with the machine. — R11.3

## C. Steering and decisions (IDE, after the founder approves)

- [ ] C1. **IDE:** apply the edits of design §12 exactly (`data-model.md`, `component-library.md`, `architecture.md`, `tech.md` twice, `ai-tasks.md` §5); D-067 is already on this branch as a "proposed" entry in `docs/decisions.md`, change its status on approval and add the measured numbers (format switch, bed mix) and the caption overlap decision of A11. — workflow rule 1

## Later (not in the Nov 26 scope)

- **Device-refined captions** (`captions.chunk` on Gemini Nano). Removed from this spec because the render job has no Nano and the export would differ from the preview. To do it properly, store the refined groups in the project as user content (`captionOverrides`, undoable), render the stored groups in both places, and drop R4.5's "never stored".
- "Embed" captions: one promoted word composited behind a scene's subject at a peak (captions-overlay doctrine), scarce and spaced.
- Caption translation and SRT/VTT sidecar export.
- A 44.1 kHz export-only bed (about 4 times larger, uploaded once) if the 12 kHz band limit is audible.
- Manual SFX editing on the timeline (`Slot.sfx` overrides: add, move, delete, pick a take).
- Full BS.1770 loudness measurement and export normalisation to −16…−14 LUFS (spec 08 or later).
- More synthesized beds, chosen per look and energy.
- A Storage lifecycle rule for old beds.

## Open questions for the founder

1. Music: are you OK shipping with "No music" as the default and "Your own track", with the two synthesized beds only after your listening check? (The HyperFrames sound guide advises against music written in code; our steering rules out stock libraries.)
2. Caption default preset: `pop` (bold, 2–3 words, Gen-Z feel) or `clean` (calmer, one line)? The spec picks `pop`.
3. In 9:16 the caption line sits at 75 % of the height, so it can cross the lower part of a graphic. The doctrine says that's fine for an overlay, and task A6 now measures how often it happens; tell me if you'd rather keep it lower.
4. The sound bed is 24 kHz mono like the voice, so music loses everything above 12 kHz in the exported file (cymbals and strings get duller). Fine for the hackathon, or should export use a 44.1 kHz bed (listed under Later)?

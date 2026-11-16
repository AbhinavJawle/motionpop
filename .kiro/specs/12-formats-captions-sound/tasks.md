# Tasks: 12 formats, captions and sound

_Written headlessly in Kiro CLI (claude-opus-5.5), 2026-11-16. Not yet approved by the founder; open questions are at the end._

One task at a time. Definition of done for each: prettier, typecheck, lint (0 warnings) and the touched packages' tests green; `packages/motion` work also passes `pnpm motion:check` for what it touches; UI tasks pass their design check. **[kiro]** marks tasks suited to the headless `motionpop-builder` agent; they are logged in `KIRO_LOG.md`.

Demo path: tasks 1–8, 10–13, 16–19. **Cut in this order if time runs short:** task 9 (`captions.chunk` on the device), task 14's synthesized beds (own track only), the captions popover's live samples (names only), "Shuffle takes".

## A. Settings and format

- [ ] 1. **[kiro]** Schemas and commands: `captions` and `audio` on `EditorProjectSchema` with defaults (design §1), the same on spec 11's `ProjectDocSchema` if it exists, `AppConfigSchema` keys `musicSynthEnabled` / `audioDefaultMusic` with `parseRemoteConfig` tests; `setCaptions` and `setAudio` commands; remove `editorStore.captions` / `toggleCaptions` and bind the toolbar toggle to the command. Tests: an old project parses with captions on + pop and default audio; property 10 (`undo(do(s)) == s`, a format switch changes only `format`). If spec 10 task 7 needs `setCaptions` first, this task runs then. — R3.1, R3.2, R10.2, R1.4
- [ ] 2. Format switch feedback: runtime `__motionpop.buildAll()` (build every slot once, hidden, return warnings) in `packages/motion/src/runtime`, the measured toast with "{n} graphics shortened their text" + Show, burst suppression; a `packages/motion` test that every registered component and scene supports all three formats. — R1.1–R1.4
- [ ] 3. **[kiro]** `storage.rules`: `users/{uid}/projects/{pid}/bed/{file}` owner write, `audio/wav`, ≤ 50 MB, owner read; music uploads use the existing audio path. Rules tests: owner write/read, other user denied, wrong type and size denied, renders path still server-only. — R9.4, R7.1
- [ ] 4. Safe-zone overlay (design §3): hatched outside area, 9:16 platform bands with labels, persisted toggle, outside the iframe. — R2

## B. Captions

- [ ] 5. **[kiro]** `packages/motion/src/captions/chunk.ts`: `chunkCaptions` per design §4.1, with unit cases and properties 1 (coverage) and 2 (timing). — R4.1–R4.3, R4.5
- [ ] 6. `packages/motion/src/runtime/captions.ts` (`mountCaptions`, presets, positions, `fitText`, `data-text` / `data-on` hooks), `CompileInput.captions`, `projectToCompile` passing groups (recomputed on transcript or format change) and the look's accent. **[kiro]** for properties 3 (contrast), 4 (safe area) and 5 (`assertSeekPure`). — R5
- [ ] 7. `pnpm motion:check captions`: a target in `scripts/check.ts` over presets × formats × white / black / built looks with random and edge-case groups, asserting safe area, overflow, contrast and one visible group; `show-*` stills kept. — R11.1
- [ ] 8. Captions UI: toolbar toggle on the command, the "CC Captions" popover with the three presets and live sample lines, keyboard and reduced-motion behaviour. — R3.2, R3.3
- [ ] 9. _(optional, cut first)_ `captions.chunk` task in `packages/ai` (ONLY_ON_DEVICE, schema-rules compliant, 2 examples), `validateGroups`, cache per transcript hash + format; fall back to the code groups on any failure. — R4.4

## C. Sound

- [ ] 10. **[kiro]** `packages/motion/src/sfx/synth.ts`: the five kinds with ≥ 2 takes each per design §5, seeded from `core/rng.ts`; property 7 for effects (deterministic, finite, peak ≤ −1 dBFS, exact length) and a test that each kind's peak position matches its table entry within 2 ms. — R6.1, R6.3
- [ ] 11. **[kiro]** `packages/motion/src/sfx/place.ts`: `placeSfx` per design §5 with unit cases and property 6. — R6.2, R6.5
- [ ] 12. **[kiro]** `packages/motion/src/sfx/duck.ts`, `limiter.ts`, `mix.ts` (`mixBed`, `bedKey`), `wav.ts` (`encodeWav16`), `level.ts` (voice level over word regions); properties 8 (ducking) and 9 (bed), and a test that the WAV header matches `decodeWavHeader` in `apps/web`. — R8.1, R8.2, R9.1, R9.2
- [ ] 13. Bed in the editor: `workers/bed.worker.ts` (zod messages), debounced re-mix (300 ms), `lib/editor/bed-player.ts` synced to `PlaybackClock` with drift correction and a click-free swap, and the timeline `AudioTrack` drawing `placeSfx` pills and the `duckEnvelope` line with the three labels ("♫ Music · ducked", "♫ {name}", "♫ Add music" → opens the Audio panel). — R6.4, R8.3, R9.3, R9.4
- [ ] 14. Music: `packages/motion/src/sfx/music.ts` (`synthBed` calm-pad and steady-pulse per design §6, loops, fades, crossfades) behind `musicSynthEnabled`; own-track upload (intake rules, decode, resample, AudioStore), decode failure message; new projects take `audioDefaultMusic`. Property 7 for the beds. — R7
- [ ] 15. _(blocked: the founder)_ Listening check: the founder hears every effect take and both beds over the demo voiceover on laptop speakers and headphones and approves, asks for changes, or rejects the beds (then they stay off and "Your own track" is the music path). Log the verdict; turn `music_synth_enabled` on in Remote Config only after approval (production config: the founder does it or approves it). — R11.4
- [ ] 16. Audio panel (design §8) in the spec 10 left-panel container: music rows with ▶ excerpts, own-track picker, level slider with dB readout, ducking toggle, effects toggle, count, Shuffle takes, effects level, footer note; one command per release. — R10
- [ ] 17. Export hand-off: `ensureBedUploaded(project, { includeMusic })` (reuse the cached blob by `bedKey`, upload once per key), `projectToCompile` adding `<audio id="bed">` and the caption groups for render mode, and a note in spec 08's tasks (or its design if spec 08 exists by then) that the parity script needs a captions-on case per format. — R9.4, R9.5

## D. Verification

- [ ] 18. **[kiro]** Playwright `apps/web/e2e/formats-captions-sound.spec.ts` on `/editor/demo`: 16:9 → 9:16 shows "Re-laid out for vertical · …" and a vertical frame, ⌘Z restores 16:9; Safe zone shows the bands in 9:16; captions toggle and the "Boxed" preset survive a reload; turning "Pops and whooshes" off empties the AUDIO pills and re-mixes; the bed element stays within 60 ms of the clock after 5 s of play; no page errors. — R1–R3, R6, R9
- [ ] 19. Design check with the Chrome DevTools MCP: `/editor/demo?t=5600&select=slot-2` at 1440×900, device scale 2, compared with `editor.png` for the preview toolbar and the timeline AUDIO track (labels, envelope line, pill positions); then same-language review stills of the 9:16 editor with Safe zone on, the captions popover and the Audio panel against `screens.md` and `design-system.md`. Fix, re-check once, log the findings, keep stills in `.check/design/`. — R11.2
- [ ] 20. Stills review: contact sheets of captions (each preset) over the hold-end stills of every scene in 3 formats × the built looks, reviewed by the `motion-qa` agent, its findings fixed, one confirming look by eye; logged. — R5.1, R5.4, R11.1
- [ ] 21. Performance: format switch on the demo project and a 3-minute bed mix in the worker, median of 5 runs, logged with the machine. — R11.3

## Later (not in the Nov 26 scope)

- "Embed" captions: one promoted word composited behind a scene's subject at a peak (captions-overlay doctrine), scarce and spaced.
- Caption translation and SRT/VTT sidecar export.
- Manual SFX editing on the timeline (`Slot.sfx` overrides: add, move, delete, pick a take).
- Full BS.1770 loudness measurement and export normalisation to −16…−14 LUFS (spec 08 or later).
- More synthesized beds, chosen per look and energy.

## Open questions for the founder

1. Music: are you OK shipping with "No music" as the default and "Your own track", with the two synthesized beds only after your listening check? (The HyperFrames sound guide advises against music written in code; our steering rules out stock libraries.)
2. Caption default preset: `pop` (bold, 2–3 words, Gen-Z feel) or `clean` (calmer, one line)? The spec picks `pop`.
3. In 9:16 the caption line sits at 75 % of the height, so it can cross the lower part of a graphic. The doctrine says that's fine for an overlay; tell me if you'd rather keep it lower.

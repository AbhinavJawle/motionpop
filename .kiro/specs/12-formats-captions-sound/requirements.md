# Requirements: 12 formats, captions and sound

_Written headlessly in Kiro CLI (agent `motionpop-builder`, model claude-opus-5.5) on 2026-11-16, overnight, while the founder was asleep. Revised the same day (headless run, claude-sonnet-5.5) to apply every finding of `REVIEW.md`; the mapping is in its "Resolved" list. Decisions taken without asking are in `design.md` §0 and D-067 in `docs/decisions.md` (renumbered from D-036, which was a clash). Not yet approved by the founder._

The finishing layer of a video, in **two deliverables that share one folder** (decision: one folder `12-formats-captions-sound` with two task sections, so the numbering of the spec list, the session hook and the cross-references stay as they are; the split is in `tasks.md` sections A and B):

- **12a, formats and captions (must ship by Thu Nov 26, 2026, the Nov 30 build):** switching between 16:9, 9:16 and 1:1 with a real re-layout and visible safe zones (R1, R2); captions that follow the voice word by word in three presets, in the preview and in the export (R3, R4, R5); and the 12a parts of the quality bar (R11.1 to R11.3 for formats and captions).
- **12b, sound (first to cut, cut as one block; Kiroween polish):** synthesized effects on the graphics, a music bed that ducks under the voice, one mixed bed identical in preview and export, and the rail **Audio** panel (R6 to R10, R11.3 for the bed, R11.4).

The same captions and the same mixed sound play in the preview and in the export.

Visual source of truth: `design/screens/editor.png` (preview toolbar "CC Captions" toggle and "Safe zone"; the timeline AUDIO track "♫ Music · ducked" with the ducking line and the "• pop" / "• whoosh" pills) and `screens.md` (9:16 editor variant, not designed: safe-zone overlay with striped platform-UI areas, toast "Re-laid out for vertical · 0.8s"). Behaviour from `motion-principles.md` §10 (safe areas), `component-library.md` (captions overlay), `component-contract.md`, `ai-tasks.md` §5 (`captions.chunk`), `data-model.md` (`captions`, `audio`, `Slot.sfx`), `architecture.md` (video engine, parity), D-016 (synthesized SFX), D-023 (transparent root), the `captions-overlay` skill and the HyperFrames `sound.md` and `captions.md` references.

**Reused, not re-specified:** `setFormat` and the format pills (spec 04), per-format layouts of every component and scene (specs 03, 07), `safeArea()` (`core/safe-area.ts`), `fitText`, the compiler and runtime (spec 03), the tagger and prosody (specs 06, 07), the left-panel container (spec 10 task 1), the audio store (specs 05, 11).

**Out of scope:** the Export modal and the render job themselves (spec 08; the changes spec 08 needs for captions and the bed are listed as tasks inside this spec, `tasks.md` A8 and B-section, and spec 08's files are not edited here), caption translation, device-refined captions (`captions.chunk`, see Later), "embed" captions composited behind a subject, per-slot manual SFX editing. See **Later** in `tasks.md`.

---

## R1 Format switch _(12a)_
_As a creator, I want the same video in vertical or square without rebuilding it._
1. **R1.1** WHEN the user picks 16:9, 9:16 or 1:1 in the top bar THE SYSTEM SHALL change the project's format as one undoable command and recompile the preview so every graphic re-lays itself out for the new frame (never a crop).
2. **R1.2** WHEN the new preview is ready THE SYSTEM SHALL show a toast with the measured time: "Re-laid out for vertical · 0.8s", "…for square · …", "…for widescreen · …" (one decimal).
3. **R1.3** IF any graphic had to shorten or shrink its text in the new format THEN the toast SHALL add "{n} graphics shortened their text" with "Show", which selects the first one.
4. **R1.4** THE SYSTEM SHALL keep slot times, words, params and captions unchanged by a format switch; only layout changes.
5. **R1.5** THE SYSTEM SHALL use the user's default format (`settings.defaultFormat`) for new projects unless the Start screen chose another (spec 11).

## R2 Safe zones _(12a)_
_As a creator, I want to see where platform buttons and captions will sit._
1. **R2.1** WHEN "Safe zone" is on THE SYSTEM SHALL draw, over the preview only, the text-safe area from `safeArea()`: a dashed violet outline, and the areas outside it hatched with soft diagonal stripes. In 9:16 the bottom zone (the bottom 20 %) and the right side strip (the 6 % margin, between 50 % and 80 % of the height) SHALL be stronger, labelled "Captions and username" and "Platform buttons". All geometry SHALL come from `platformZones()` in `packages/motion` next to `safeArea()` (the single source, `motion-principles.md` §10); the overlay SHALL NOT invent its own numbers.
2. **R2.2** THE SYSTEM SHALL never draw the safe-zone overlay into a still, a check or an export.
3. **R2.3** THE SYSTEM SHALL remember the Safe zone toggle per browser.

## R3 Captions settings _(12a)_
_As a creator, I want captions on or off and a style that fits my video, and I want it undoable._
1. **R3.1** THE SYSTEM SHALL store captions on the project as `{ enabled, presetId: "pop" | "clean" | "boxed" }`. New projects SHALL start with `enabled = settings.captionsDefault` and preset `pop`; older projects without the field SHALL read as on with `pop`.
2. **R3.2** WHEN the user flips the "CC Captions" toggle in the preview toolbar THE SYSTEM SHALL change `enabled` as one undoable command.
3. **R3.3** WHEN the user clicks the "CC Captions" label THE SYSTEM SHALL open a small popover with the three presets, each with a live sample line, and picking one SHALL be one undoable command.
4. **R3.4** Pip's `setCaptions` step (spec 10) SHALL use the same command. The `captions` field and the `setCaptions` command are built by spec 10 task 2b (spec 10 lands first); this spec verifies them, binds the toolbar toggle to them and removes the UI-only flag.

## R4 Caption lines _(12a)_
_As a viewer, I want short caption groups that appear exactly when the words are said._
1. **R4.1** THE SYSTEM SHALL split the transcript into caption groups in code, deterministically: at most 3 words per group in 9:16, 4 in 1:1 and 5 in 16:9 (pop preset: at most 3 in every format); a break at a sentence end, at a pause of 150 ms or more, or at the limit; never splitting a tagged number, place or name span that fits the limit; and never showing a filler word.
2. **R4.2** Each group SHALL open at most 100 ms before its first word and never before the previous group closes, never at exactly 0 ms (at least 100 ms in), and close at its last word's end plus up to 200 ms, cut short by the next group. Exactly one group or none SHALL be visible at any time.
3. **R4.3** THE SYSTEM SHALL mark at most one emphasis word per group: a tagged number first, else the most stressed word above stress 70 (prosody), else none.
4. **R4.4** THE SYSTEM SHALL compute caption groups in code only, with no model call, on every machine, so the groups of the preview and of the export are always the same. (Device-refined groups were removed: the render job runs in Cloud Run with no Gemini Nano, so a refined preview would differ from the export; see Later.)
5. **R4.5** THE SYSTEM SHALL recompute caption groups when the transcript or format changes, and SHALL never store them as user content. The render job SHALL compute them itself from the snapshot with the same pure function (`chunkCaptions`); the browser SHALL NOT upload groups.

## R5 Caption rendering _(12a)_
_As a viewer, I want captions I can always read, that never fight the graphics._
1. **R5.1** THE SYSTEM SHALL draw captions as an overlay layer on top of the whole frame (the captions host), never as a reserved band: graphics keep their full frame and their own layouts.
2. **R5.2** THE SYSTEM SHALL place the caption line: 16:9 and 1:1 with its bottom 96 px (at 1080 px height) above the frame bottom; 9:16 with its bottom at 75 % of the frame height, above the platform caption area. The line SHALL stay inside the safe area and fit its width with `fitText` (max width 1600 px in 16:9, 900 px in 9:16 and 1:1; base size 7 % of frame height for pop, 5.5 % for clean and boxed; minimum 4 %).
3. **R5.3** THE SYSTEM SHALL render the presets: **pop** (bold, the current word on an accent pill with the better-contrast ink colour, the line on a dark rounded backing), **clean** (semibold, one line on a dark soft backing, the current word underlined in the accent), **boxed** (a rounded dark box, current word full white, the others 75 % white).
4. **R5.4** Caption text SHALL reach a contrast of at least 4.5:1 over any background, including pure white and pure black frames. Text SHALL be inset by the feather width inside any feathered backing, so no glyph sits on a backing alpha below 0.66.
5. **R5.5** Caption drawing SHALL be a pure function of time (no timers, transitions or animations; `seek(t)` sets every property), identical in the preview, the checks and the render.
6. **R5.6** Group entrances SHALL be quick and quiet (fade + 6 px rise over 120 ms); the pop preset's current word SHALL scale to 106 % over 80 ms. Reduced motion in the editor SHALL not change the video output.

## R6 Sound effects _(12b)_
_As a creator, I want my graphics to land with a sound, without a sound library._
1. **R6.1** THE SYSTEM SHALL synthesize every effect in code, deterministically from a seed: whoosh, pop, tick, rise and impact, each with at least 2 takes. No stock samples, no pure tones, chimes or dings.
2. **R6.2** WHEN auto sound effects are on THE SYSTEM SHALL place effects on ready slots: a whoosh on a slot's entrance when its graphic enters with large motion, a pop on the focal landing of number and data scenes, ticks for word-by-word text, and one rise into an impact on the director's peak slot at most once per video. Effects SHALL be at least 1.2 s apart (the lower-priority one is dropped) and consecutive effects of the same kind SHALL use different takes.
3. **R6.3** Each effect's peak SHALL land one frame (33 ms) after its picture moment.
4. **R6.4** THE SYSTEM SHALL show the placed effects as pills on the timeline AUDIO track ("• pop", "• whoosh") at their times.
5. **R6.5** WHEN the user turns auto sound effects off THE SYSTEM SHALL place none.

## R7 Music _(12b)_
_As a creator, I want a music bed under my voice that I'm allowed to use._
1. **R7.1** THE SYSTEM SHALL offer "No music", the synthesized beds "Calm pad" and "Steady pulse" (only while the Remote Config flag `music_synth_enabled` is on), and "Your own track" (an uploaded MP3, WAV or M4A up to 50 MB, stored like a voiceover, at spec 11's path `users/{uid}/audio/{projectId}/music-{hash16}.wav`).
2. **R7.2** THE SYSTEM SHALL loop or trim the music to the video's length with a 1 s fade in and a 1.5 s fade out, crossfading loop seams over 500 ms.
3. **R7.3** The default for new projects SHALL come from Remote Config `audio_default_music` (default "No music").
4. **R7.4** IF an own track can't be decoded THEN THE SYSTEM SHALL say so in one line and keep the previous choice.

## R8 Ducking and levels _(12b)_
_As a viewer, I want to hear every word over the music._
1. **R8.1** WHEN ducking is on THE SYSTEM SHALL lower the music while the voice speaks and raise it in pauses of at least 400 ms, from the transcript word timings: down by `duckDepthDb` (default 8 dB) with a 80 ms attack, back up with a 400 ms release.
2. **R8.2** THE SYSTEM SHALL set levels relative to the measured voice level: music under speech at `musicGainDb` (default −18 dB) below the voice; effects 3–6 dB over the bed and at least 6 dB under the voice; the user can move music between −40 and 0 dB and effects between −24 and +6 dB.
3. **R8.3** THE SYSTEM SHALL draw the ducking envelope as a thin line on the AUDIO track's music band, labelled "♫ Music · ducked" (or "♫ {track name}" when ducking is off, or "♫ Add music" when there is none, which opens the Audio panel).

## R9 One mixed bed, preview equals export _(12b; R9.5 and the captions line are in 12a's export task)_
_As a creator, I want the export to sound exactly like the preview._
1. **R9.1** THE SYSTEM SHALL mix music (with its ducking) and every placed effect into one 24 kHz mono WAV "bed" in a worker, deterministically: the same inputs SHALL give the same bytes.
2. **R9.2** THE SYSTEM SHALL keep the bed's sample peak at or below −1 dBFS with a look-ahead limiter and SHALL report it.
3. **R9.3** WHEN the inputs change THE SYSTEM SHALL re-mix within 300 ms of the last change (debounced) and swap the preview's bed without a click.
4. **R9.4** The preview SHALL play the bed in sync with the voiceover's clock (the element's `currentTime` corrected beyond 40 ms). Browser audio output latency differs by device by 50 to 100 ms, so preview sync is best effort and exact only in the export, where the bed is one `<audio id="bed">` element at the composition's time 0. The export SHALL use the same bed file, uploaded by `ensureBedUploaded` (keyed by a hash of its inputs, including the voice level and the active voice ref) and passed to the job as `bedPath`. THE SYSTEM SHALL measure that the exported MP4's bed matches the bed file (R11.5).
5. **R9.5** THE SYSTEM SHALL offer spec 08 a bed without music for "Include music" off (effects only), and no bed at all (`ensureBedUploaded` returns `null`) when effects are off and there is no music, in which case the composition has no `<audio id="bed">`.
6. **R9.6** The 24 kHz mono bed band-limits music to 12 kHz in the final file (the voice is already 24 kHz mono, D-024). THE SYSTEM SHALL state this trade-off in D-067 and in open question 4; a 44.1 kHz export-only bed is a later option.

## R10 Audio panel _(12b)_
_As a creator, I want one place for music, effects and levels._
1. **R10.1** WHEN the user opens the rail item "Audio" THE SYSTEM SHALL show the Audio panel (not designed; Pip-panel language): MUSIC (the options from R7.1 with a play preview for each bed, upload for "Your own track", "Music level" slider with a dB readout, "Duck under my voice" toggle with "Music dips while you talk."), SOUND EFFECTS ("Pops and whooshes" toggle with "On your graphics' entrances and landings.", "{n} sounds placed", "Shuffle takes", "Effects level" slider), and the note "Every sound here is made in code. No stock libraries."
2. **R10.2** Every change in the panel SHALL be one undoable command; slider drags SHALL commit once on release.

## R11 Quality _(12a: R11.1 to R11.3 for formats and captions; 12b: R11.3 for the bed and R11.4)_
1. **R11.1** `pnpm motion:check captions` SHALL render stills of every preset in every format with random and edge-case lines (long words, numbers, one-word groups) over white, black and every built look, and assert: inside the safe area, no overflow, contrast ≥ 4.5:1, exactly one group visible at mid-group times. It SHALL also report (not fail on) the overlap area between the caption box and any `data-text` or `data-focal` element at the hold-end frame of every scene in every format; an overlap above 15 % of the caption box goes to the `motion-qa` agent.
2. **R11.2** The AUDIO track and the preview toolbar SHALL keep matching `editor.png` at 1440×900; the 9:16 editor, the safe-zone overlay, the captions popover and the Audio panel SHALL pass a same-language review.
3. **R11.3** A format switch SHALL be ready in under 1.5 s on the demo project and on a 40-slot project; a 3-minute bed SHALL mix in under 1.5 s in the worker on an M-series laptop.
4. **R11.4** A listening check by the founder SHALL approve the effects and the synthesized beds, heard in the **exported MP4** as well as in the preview, before `music_synth_enabled` is turned on; the result is logged.
5. **R11.5** A real-producer test SHALL render a bed with a click at a known time and level to MP4 and assert that the click lands within one frame (33 ms) and within 1 dB of the bed file's level.

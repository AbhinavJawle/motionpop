# 12 · Formats, captions and sound: spec review

_Reviewer: `spec-reviewer` (read-only), model claude-sonnet-5.5, 2026-11-16. Read: `requirements.md`, `design.md`, `tasks.md`, the steering files that apply, `docs/decisions.md`, `docs/plan.md` §2, `firestore.rules`, `storage.rules`, spec 08's requirements, design and tasks, specs 10 and 11, the HyperFrames skill's `format.md`, and the code this spec reuses (`safe-area.ts`, the compiler, the editor store, the preview pane, `wav.ts`). I had no shell, so I could not run git or the tests. Specs 09 and 13 have no folder yet, so those seams are checked against the plan, the steering files and what other specs assume._

## Verdict: ready after fixes

Formats, safe zones and captions are well specified and testable. The sound half is a second project inside this spec. Four findings need a decision or an edit before task 1 (F1 to F4). The rest can be fixed on the way.

## Findings

### High

**F1. The sound half does not fit the date or the plan's cut list, and the demo path includes almost all of it.**
- Evidence: `docs/plan.md` §2.5 cut #4 is "Media/Fonts/Audio panels (rail icons stay, panels show 'coming soon')", and the freeze is Nov 27. This spec is due Nov 26. Its "Demo path" is tasks 1 to 8, 10 to 13 and 16 to 19, which keeps the whole sound pipeline: synthesis, placement, ducking, limiter, mix worker, bed player, own-track upload, Audio panel and the export hand-off. Task 15 (the founder's listening check) blocks the beds. Only the synthesized beds (14) and "Shuffle takes" are on the cut line. The never-cut list names 9:16 only; captions are the other thing a 9:16 export needs.
- Fix: split the spec into two deliverables in `tasks.md`:
  - **12a (must ship):** tasks 1, 2, 4 to 8, plus the captions half of 17 and the checks (18 to 20, trimmed). That gives format switch, safe zone, three caption presets, and captions in the export.
  - **12b (first to cut, in this order):** the Audio panel, then music, then ducking, then auto effects. The bed pipeline (10 to 14, 16, 17) is cut as one block, not task by task, so the product never ships half a mixer.
  - Move "Include music" and effect placement in the export modal to stay "Soon" in spec 08 if 12b is cut.

**F2. The export hand-off to spec 08 is a one-line note, but spec 08 needs changes.**
- Evidence: task 17 says "a note in spec 08's tasks". Spec 08 (already reviewed, tasks 1 and 2 done) has: `RenderOptionsSchema` and `RenderRequestSchema` both `.strict()` with `captions` and `music` as booleans and "the route rejects true as `invalid`"; no `bedPath` anywhere; `voicePath` is the only audio path the route and the job re-check (R2.2, R3.9); the job downloads only the voice and probes it with `ffprobe`; the Storage table in §11 lists no `bed/` path; and its compile input is `projectCompileInput` in `packages/motion`, not an apps/web function.
- Fix: write the change list into spec 08 now (it is waiting for approval, so changing it is cheap):
  1. `RenderRequest` gains `bedPath` (optional) and `RenderDoc` stores it. A `bedPathFor(uid, projectId, key)` helper lives next to `voicePathFor` and `renderPaths`.
  2. The route checks it like the voice: exact path pattern, exists, `audio/wav`, ≤ 50 MB. The job re-checks it (R3.9) and runs `ffprobe` on it.
  3. The route accepts `captions: true` and `music: true` once this spec lands; `music: false` means a bed without music (R9.5).
  4. Caption groups are computed **in the job** from the snapshot with the pure `chunkCaptions`, never uploaded by the client. That keeps one source of truth and removes a client-supplied input.
  5. No bed at all (effects off, no music) means no `<audio id="bed">`. State this in `ensureBedUploaded`'s contract (it can return `null`).
  6. `parity.ts` gets a captions-on case per format and an audio case (F8).
  7. Task 3 of this spec adds the Storage rule `users/{uid}/projects/{pid}/bed/{file}`; spec 08 task 13's rules tests list it.

**F3. Device-refined captions would make the export differ from the preview.**
- Evidence: R4.4 and task 9 let `captions.chunk` on Gemini Nano refine group breaks and emphasis. The result is "cached per transcript hash + format in memory". The render job (Cloud Run) has no Nano and, per R4.5 and design §4.1, recomputes groups with the code. So on a machine with Nano the preview shows refined groups and the export shows code groups. The summary of this spec promises "the same captions … in the preview and in the export", and spec 08's parity principle says the same HTML runs both ways.
- Fix: remove task 9 and R4.4 from this spec (it is already "cut first") and put `captions.chunk` under "Later" with the reason. If the founder wants the on-device story here, the refined groups must be stored in the project (a `captionOverrides` field, user content, undoable). That contradicts R4.5, so it is a different feature.

**F4. Names and files in the design do not exist.**
- Evidence:
  - `projectToCompile` (design §4.2, §9; task 6, 17) does not exist. The apps/web function is `previewCompileInput` in `apps/web/lib/composition/project-to-compile.ts`, and spec 08 moves the shared part into `packages/motion/src/compiler/project.ts` as `projectCompileInput`. The render job cannot import apps/web, so captions must be added in the packages/motion function.
  - `decodeWavHeader` in apps/web (task 12) does not exist. `apps/web/lib/audio/wav.ts` exports only `encodeWav(samples, sampleRate = 22_050)`.
  - `encodeWav16` in `packages/motion/src/sfx/wav.ts` would be a second WAV encoder.
- Fix: say "the packages/motion `projectCompileInput`" everywhere. Keep one encoder: put it in `packages/motion` (it is also used by the render service) and have `apps/web/lib/audio/wav.ts` re-export it with its existing default. In task 12, the header test uses a small parser written in the test, not a missing helper.

### Medium

**F5. `ProjectDocSchema` (spec 11) will strip `captions` and `audio`.**
- Evidence: spec 11 lists the project-document fields by hand and spec 12 task 1 adds them "to spec 11's `ProjectDocSchema` if it exists". Spec 11 lands first. Zod drops unknown keys on parse, so a saved project would silently lose its caption and audio settings.
- Fix: as in spec 11 F10, build the document schema from `EditorProjectSchema`. In this spec, task 1 changes from "if it exists" to "verify the round trip with captions and audio set".

**F6. `[kiro]` task 3 edits `storage.rules`, a root file.**
- Evidence: handoff §7 limits the headless agent to `apps/`, `packages/`, `services/`, `skills/` and `.kiro/specs/`.
- Fix: the rules test stays `[kiro]`; the rule edit is an IDE step done before it.

**F7. Music uploads and the bed leak on delete and duplicate.**
- Evidence: `audio.musicSrc` points to `users/{uid}/audio/music-*.wav`; the bed lives at `users/{uid}/projects/{pid}/bed/{key}.wav`, one new file per mix key at each export. Spec 11's delete removes only the voiceover; its duplicate shares the same object between two projects (spec 11 F2).
- Fix: the project delete route removes `projects/{pid}/` and `musicSrc`; "duplicate" copies the track. Add a "keep the last 3 beds" cleanup to `ensureBedUploaded` or list a lifecycle rule in "Later".

**F8. "Preview equals export" has no audio test.**
- Evidence: R9.4 and D-036 #1 say the bed is the same file, so parity holds "by construction". But the preview plays the bed through a second `HTMLAudioElement` outside the iframe, and the export mixes it through HyperFrames (`data-volume`, AAC encoding, any loudness handling in the producer). Spec 08's P10 tests only the voice beep.
- Fix: add to task 17 (or spec 08 task 9) a real-producer test: a bed with a click at a known time and level, rendered to MP4; assert the click lands within one frame and its level is within 1 dB of the bed file. Make the founder's listening check (task 15) use the **exported** MP4, not only the preview.

**F9. The bed is 24 kHz mono, so the export loses the top octave of music.**
- Evidence: R9.1 and D-024. The voice is already 24 kHz mono, so the voice is unaffected; an own music track is downmixed and band-limited to 12 kHz in the final file. For a product described as "premium" this is audible on cymbals and strings.
- Fix: state it in D-036 as a known trade-off with the number (12 kHz), and add one open question: a 44.1 kHz bed for export only (about 4 times larger, uploaded once). It does not change the design, but the founder should choose it knowingly.

**F10. Safe-zone geometry is invented in the overlay, not in `safeArea()`.**
- Evidence: design §3 draws a 9:16 "right band" from 50 % to 80 % of the height. `core/safe-area.ts` has top 12 %, bottom 20 % and sides 6 % and no right band. Motion principles §10 says `safeArea()` is the single source.
- Fix: add `platformZones(format, w, h)` next to `safeArea()` in `packages/motion`, use it for the overlay and the checks, and cite where the right-band numbers come from (the principle says the zones were measured from the main platforms' layouts).

**F11. Captions can cover graphic text, and nothing measures it.**
- Evidence: R5.2 puts the 16:9 caption bottom 96 px above the frame bottom (1080), while the text-safe area leaves 54 px at the bottom, so a graphic's text can sit under the caption. `motion-principles.md` §10 accepts captions as an overlay, and §16 protects text during its read time. R11.1 checks captions alone (over white, black and looks) and task 20 is a visual review.
- Fix: no layout change. Add a report-only `motion:check` line: the overlap area between the caption box and any `data-text` or `data-focal` element at the hold-end frame of every scene, per format. A number above a threshold goes to `motion-qa` in task 20. Decide in D-036 what happens when it is high (for example, 16:9 lifts the caption by one line).

### Low

- **F12.** `ai-tasks.md` §5 (`captions.chunk`: "up to 6 words for 16:9", output `lines`) disagrees with this spec (5 words, output `groups`) and the steering list in design §12 omits it. If F3 is taken, the §5 entry is marked "later" instead.
- **F13.** R5.4's contrast argument covers the line backing, but the clean preset uses "feathered edges 0.6 em". Text near the edge would sit on alpha below 0.66. Property 3 over white frames will catch it; say in design §4.2 that text is inset by the feather width.
- **F14.** Preview sync for the bed is best effort: browser audio latency differs by device by 50 to 100 ms, so e2e's "within 60 ms of the clock" checks the element's `currentTime`, not what the user hears. R6.3's "one frame after the picture" is exact only in the export. Say so in R9.4.
- **F15.** The synthesized effects' cost: `buildAll()` builds every slot off-screen on each format switch. R11.3 (1.5 s) is measured on the demo project of 5 slots; add a 40-slot case in task 21.
- **F16.** Add `voiceLevelDb` and the active voice ref to `bedKey` inputs explicitly; the Voice panel's cleanup toggle (spec 11) changes both.

## Checks that passed

- **EARS and numbering:** 11 groups, numbered, mostly WHEN/IF/WHILE; numeric thresholds are explicit (100 ms, 33 ms, 1.2 s, −1 dBFS, 4.5:1).
- **Traceability:** R1 → 1, 2; R2 → 4; R3 → 1, 8; R4 → 5, 9; R5 → 6, 7, 20; R6 → 10, 11, 13; R7 → 14, 15; R8 → 12, 13; R9 → 12, 13, 17; R10 → 16; R11 → 7, 15, 19, 20, 21. Every task cites requirements.
- **Steering:** captions are an overlay and not a reserved band (matches motion-principles §10 and the `captions-overlay` skill); no stock libraries, synthesized sound only (D-016) with the music beds behind a flag until a listening check; no GSAP; integer milliseconds; zod config keys with typed defaults; deterministic pure functions of time; audio ≤ 50 MB; no brand names.
- **Reality:** these exist as the design says: `safeArea`, `fitText`, `PlaybackClock`, the `#mp-captions` host in `compile.ts` (an empty absolute layer), `editorStore.captions` and `toggleCaptions` in the preview pane (to be removed), `Slot.sfx` (kept for later), the `look.sound` field in `look.ts`, and the HyperFrames rule that every `<audio>` needs an `id` (skill rule 8). Declared new: `buildAll()`, `mountCaptions`, `chunkCaptions`, the `sfx/*` modules, the bed worker. Not declared and missing: see F4.
- **Testing:** ten named properties with owners (many `[kiro]`), a `motion:check captions` target, a listening gate, an e2e, a design check, a stills review by `motion-qa`, and a measured performance task.

## Seams

- **Spec 08 (export):** F2, F6, F8, F9. Spec 08 already says captions and music "stay off until spec 12" and "the options already travel to the job", so the field names `captions` and `music` stay; only the bed path and the job-side grouping are new.
- **Spec 09:** no folder yet. The preview toolbar belongs to specs 04 and 09; this spec only rebinds the captions toggle to a project command. Spec 09 must not add its own captions state.
- **Spec 10:** the `setCaptions` step (spec 10 review F4): carve the command and field out of task 1 so spec 10 can use them first. The Audio panel needs spec 10's left-panel container, which lands first.
- **Spec 11:** `ProjectDocSchema` (F5), delete and duplicate (F7), the cleanup toggle changing the transcript, which recomputes caption groups (R4.5) and re-places effects (F16).
- **Spec 13:** it needs nothing from this spec. `settings.captionsDefault` and `defaultFormat` already exist in `UserSettings` and are read here, so the Settings screen must keep writing those two fields.

## Resolved

_Applied 2026-11-16 by a headless Kiro CLI run (claude-sonnet-5.5), with Claude Code's decisions on the open choices. The findings above are kept as written. D-036 is renumbered **D-067** (the first drafts of specs 10, 11 and 12 clashed with specs 08, 09 and 13)._

| # | Finding | Resolution | Where |
|---|---|---|---|
| F1 | The sound half does not fit the date or the cut list | The spec is split into **12a formats and captions** (must ship by Nov 26, including captions in the export) and **12b sound** (first to cut, cut as one block, trim order Audio panel, music, ducking, effects). One folder `12-formats-captions-sound` with two task sections (A and B), because the spec list, the session hook and the cross-references stay valid; requirements are tagged per group | requirements intro, tasks "Two deliverables", design §0 #12 |
| F2 | The export hand-off is a one-line note | The spec 08 changes are listed in design §9 and built by tasks A8 (captions: route accepts `captions: true`, the job computes groups with the pure `chunkCaptions`, the modal toggle, a captions parity case) and B8 (`bedPath` and `bedPathFor`, route and job checks with `ffprobe`, `music: true`, `ensureBedUploaded` returning `null` when there is nothing to mix, the audio parity case, the Storage table entry). Spec 08's own files are not edited | design §9, tasks A8, B8, B3a, B3b |
| F3 | Device-refined captions differ from the export | Removed: R4.4 now says code only, the old task 9 is gone, `captions.chunk` is under Later with the stored-overrides route written out. `ai-tasks.md` §5 gets a "Later, not built" note (F12) | R4.4, design §0 #6, §4.1, Later |
| F4 | Names and files that do not exist | `projectToCompile` becomes `projectCompileInput` in `packages/motion/src/compiler/project.ts` (spec 08 task 4; today `previewCompileInput` in apps/web) and captions are added there; `decodeWavHeader` is dropped (the header test uses a parser in the test; apps/web keeps `readWavHeader`); one encoder `encodeWav16` in `packages/motion/src/sfx/wav.ts` with `encodeWav` as a wrapper; the top bar's `SegmentedPills` replace the invented `FormatPills`; `buildAll` is marked new | design §4.2, §7, §2, tasks A5, B2 |
| F5 | `ProjectDocSchema` strips `captions` and `audio` | Spec 11's schema is now derived from `EditorProjectBaseSchema`; tasks A1 and B1 each verify the round trip | design §1, tasks A1, B1 |
| F6 | A `[kiro]` task edits `storage.rules` | Split into IDE task B3a (the exact diff) and `[kiro]` task B3b (the tests) | tasks B3a, B3b |
| F7 | Music and bed leak on delete and duplicate | Music at spec 11's `users/{uid}/audio/{projectId}/music-{hash16}.wav`, the bed at `users/{uid}/projects/{projectId}/bed/{key}.wav`; spec 11's delete route removes both prefixes and its duplicate copies the music; `ensureBedUploaded` keeps the last 3 beds | R7.1, design §0 #16, §6, §7, task B8 |
| F8 | No audio parity test | A real-producer test (a click at a known time and level, rendered to MP4, within one frame and 1 dB) and a listening check on the exported MP4 | R11.4, R11.5, tasks B9, B11 |
| F9 | 24 kHz bed loses the top octave | Stated as a known trade-off with the number (12 kHz) in D-067 and R9.6; open question 4 asks about a 44.1 kHz export-only bed (Later) | R9.6, design §0 #17, open question 4 |
| F10 | Safe-zone geometry invented in the overlay | `platformZones()` next to `safeArea()` is the only source, built only from `safeArea`'s numbers; the "Platform buttons" strip is the 6 % margin between 50 % and 80 % of the height, declared an illustration | R2.1, design §0 #14, §3, task A3 |
| F11 | Captions can cover graphic text, nothing measures it | A report-only `motion:check captions` line (overlap with `data-text` / `data-focal` per scene and format, above 15 % goes to `motion-qa`), and the decision (lift the 16:9 caption one line) is taken with the stills in A11 | R11.1, design §0 #18, tasks A6, A11 |
| F12 | `ai-tasks.md` §5 disagrees | The steering list gets a "Later, not built" note and the real group sizes | design §12 item 6 |
| F13 | Feathered edge below alpha 0.66 | Text is inset by the feather width inside the `clean` backing | R5.4, design §4.2 |
| F14 | Preview sync is best effort | R9.4 says so and where it is exact (the export); the e2e checks `currentTime` and its task says it does not measure what the user hears | R9.4, task B12 |
| F15 | `buildAll` cost on large projects | R11.3 and task A12 add a 40-slot project | R11.3, task A12 |
| F16 | `bedKey` inputs | `voiceLevelDb` and the active voice ref are named inputs | design §7, task B5 |

**Also changed in this run:** the spec 10 carve-out (`captions` field and `setCaptions` built in spec 10 task 2b) is recorded in A1 and R3.4; `settings.captionsDefault` is read for new projects (A1); the export modal's "Captions" and "Include music" toggles leave "Soon" in A8 and B8.

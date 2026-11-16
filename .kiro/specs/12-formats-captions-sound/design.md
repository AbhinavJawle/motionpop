# Design: 12 formats, captions and sound

_Written headlessly in Kiro CLI (claude-opus-5.5), 2026-11-16. Revised the same day (headless run, claude-sonnet-5.5) to apply every finding of `REVIEW.md`. Requirements in `requirements.md`. The spec has two deliverables in one folder: **12a** formats and captions (sections 2 to 4, §9 captions part) and **12b** sound (sections 5 to 8, §9 bed part)._

## 0. Decisions taken without the founder (D-067)

| # | Decision | Why |
|---|---|---|
| 1 | **One pre-mixed bed WAV** (music with ducking + all effects) is the only extra audio, in preview and export. | Parity by construction (same bytes), one `<audio>` in the composition, no envelope automation in the player. VideoHub's lesson: share the ducking envelope between preview and render. |
| 2 | The bed is mixed by **pure JS DSP** (no Web Audio) in `packages/motion/src/sfx/`, run in a browser worker. Export uploads the exact file the preview played (`ensureBedUploaded`, keyed by an input hash), so the render service needs no DSP and never decodes MP3s. | Determinism; Cloud Run stays simple; no upload on every edit. |
| 3 | **Synthesized music ships behind `music_synth_enabled` (default off) until the founder listens.** "Your own track" is always there. Default music is "No music" (Remote Config `audio_default_music`). | Steering says synthesized, no stock libraries (D-016, tech.md); the HyperFrames `sound.md` warns that music written in code can't be judged by a model. The founder's ears decide. |
| 4 | Effects avoid pure tones (noise sweeps, transients, filtered thumps). | Same `sound.md` advice ("no synthesised tones, chimes or dings"), compatible with D-016. |
| 5 | **Captions are rail-only** (verbatim lower line, one emphasis word). "Embed" captions behind a subject are Later. | `captions-overlay` doctrine: rail-first; embeds need mattes we don't have for graphics. |
| 6 | **Caption groups are made in code only**, the same pure function in the browser and in the render job. Device-refined captions (`captions.chunk` on Gemini Nano) are removed from this spec. | The render job runs in Cloud Run with no Nano, so a refined preview would differ from the export, against the parity rule. If the founder wants the on-device story here, refined groups must be stored in the project (`captionOverrides`, user content, undoable), which contradicts R4.5: a different feature, listed under Later. Review F3. |
| 7 | Caption backings (pill, soft backing, box) guarantee ≥ 4.5:1 for white text even over a white frame: backing opacity ≥ 0.66 at the text. | Contrast rule (motion-principles, testing.md) without per-frame measurement. |
| 8 | 9:16 caption line sits with its bottom at 75 % of the height (480 px above the bottom at 1920). | Above our 20 % platform zone with margin; HyperFrames suggests ~600–700 px for portrait over footage, our graphics need more of the frame. |
| 9 | Format switch warnings come from a new runtime call `__motionpop.buildAll()` that builds every slot once off-screen and returns their warnings. | Today warnings only exist for slots that were seeked. |
| 10 | Captions and audio settings are project fields with commands (undoable), not editor UI state. | Export, Pip and the dashboard need them; `editorStore.captions` (UI-only today) goes away. |
| 11 | Levels are relative to a **measured voice level** (RMS over word regions, a documented approximation, not full BS.1770 loudness). | Enough to keep the music under the voice for any recording; full loudness normalisation belongs to the export (spec 08). |
| 12 | **Split: 12a formats and captions (must ship, Nov 26) and 12b sound (cut as one block)**, in one folder with two task sections. | The demo path needs a 9:16 export with captions; the plan's cut list drops the Audio panel and sound first. Cutting 12b as a block means the product never ships half a mixer. Review F1. |
| 13 | **The spec 08 changes this spec needs are tasks inside this spec** (`tasks.md` A8 and B8, design §9), not edits to spec 08's files: `captions: true` accepted and groups computed in the job (12a), `bedPath`, `music: true`, a bed Storage path, the audio parity cases (12b). | Spec 08 is reviewed and waiting for approval; the owner of the export sees one list. Review F2. |
| 14 | **`platformZones(format, w, h)` lives next to `safeArea()`** in `packages/motion` and is the only source for the overlay and the checks. It adds no geometry beyond what `safeArea` defines (top 12 %, bottom 20 %, side 6 %); the "Platform buttons" strip is the 6 % right margin between 50 % and 80 % of the height, an illustration, not measured. | `motion-principles.md` §10: one source. The first draft's right band was invented in the overlay. Review F10. |
| 15 | **One WAV encoder**, `encodeWav16` in `packages/motion/src/sfx/wav.ts`; `apps/web/lib/audio/wav.ts` `encodeWav` becomes a thin wrapper that keeps its 22 050 Hz default and returns an `ArrayBuffer`. `readWavHeader` stays in apps/web. | The render service also needs it; a second encoder would drift. Review F4. |
| 16 | **Music and bed objects follow spec 11's audio path:** music at `users/{uid}/audio/{projectId}/music-{hash16}.wav`, the bed at `users/{uid}/projects/{projectId}/bed/{key}.wav`; spec 11's delete route removes both prefixes, its duplicate copies the music, and `ensureBedUploaded` keeps the last 3 beds of a project. | No orphans on delete, no sharing on duplicate. Review F7. |
| 17 | **The bed is 24 kHz mono** (D-024), so music is band-limited to 12 kHz in the export; the voice is unaffected. Known trade-off, open question 4. | One file, small, same as the voice; a 44.1 kHz export-only bed is about 4 times larger and uploads once. Review F9. |
| 18 | **Captions are an overlay, and overlap with graphic text is measured, not prevented:** `motion:check captions` reports the overlap between the caption box and `data-text` / `data-focal` elements per scene and format; above 15 % of the caption box the case goes to `motion-qa`; if it is often high the 16:9 caption lifts by one line (decided with the stills, task A11). | `motion-principles.md` §10 accepts the overlay; the number tells us whether to act. Review F11. |

## 1. Data model

```ts
// packages/schemas/src/project.ts — EditorProject gains (optional, defaults on read):
captions: z.object({
  enabled: z.boolean(),
  presetId: z.enum(['pop', 'clean', 'boxed']),
}).default({ enabled: true, presetId: 'pop' }),
audio: z.object({
  musicId: z.enum(['calm-pad', 'steady-pulse', 'own']).optional(),    // absent = no music
  musicSrc: z.string().min(1).optional(),                             // AudioStore ref when musicId = 'own'
  musicName: z.string().max(80).optional(),
  musicGainDb: z.number().int().min(-40).max(0).default(-18),
  ducking: z.boolean().default(true),
  duckDepthDb: z.number().int().min(0).max(24).default(8),
  autoSfx: z.boolean().default(true),
  sfxGainDb: z.number().int().min(-24).max(6).default(0),
  sfxSeed: z.number().int().nonnegative().default(0),                 // "Shuffle takes"
}).default({}),
```

`data-model.md` already lists `captions { enabled, presetId }` and `audio { musicId?, musicGainDb, ducking, autoSfx }`; this adds `musicSrc`, `musicName`, `duckDepthDb`, `sfxGainDb`, `sfxSeed` (proposed steering change §12). `Slot.sfx` stays for later manual overrides; auto effects are **derived**, never stored, so retiming a slot moves its sounds for free.

Spec 11's `ProjectDocSchema` is **derived from `EditorProjectBaseSchema`**, so both fields are stored with no edit there; task A1 and task B1 each verify the round trip (a project with `captions` set, then with `audio` set, survives `toDocs` → `fromDocs`). The `captions` field and `setCaptions` are built by spec 10 task 2b; `audio` and `setAudio` are 12b. `AppConfigSchema` gets `musicSynthEnabled: boolean` (`music_synth_enabled`, default false) and `audioDefaultMusic: 'none' | 'calm-pad' | 'steady-pulse'` (`audio_default_music`, default `none`).

Commands (`lib/commands/project.ts`): `setCaptions({ enabled?, presetId? })`, `setAudio(partial)` (one command per committed change), both with `undo(do(s)) == s`.

## 2. Format switch

```
top-bar `SegmentedPills` (components/editor/top-bar.tsx).onChange(f) → store.exec(setFormat(f)) → t0 = performance.now()
PreviewPlayer recompiles (existing 150 ms debounce) → iframe __motionpop.ready
  → warnings = await __motionpop.buildAll()           // new: builds every slot once, hidden, returns SlotWarning[]
  → toast(`Re-laid out for ${noun(f)} · ${((now - t0) / 1000).toFixed(1)}s`, warnings ? { description, action: Show } : {})
```

`noun`: 9:16 "vertical", 1:1 "square", 16:9 "widescreen". The toast is skipped when the format change came from an undo/redo burst (more than one switch in 1 s) to avoid toast spam. A unit test in `packages/motion` asserts every registered component and scene lists all three formats. `buildAll` is **new** (it does not exist in the runtime today); it builds every slot, so its time grows with the slot count, and R11.3 is measured on the 5-slot demo project and on a 40-slot project.

Preview frame sizing already follows the format (`ASPECT` in `preview-pane.tsx`). The 9:16 frame is 405 px tall (≈ 228 px wide) in the 1440×900 editor, centred.

## 3. Safe zones (`components/editor/safe-zone-overlay.tsx`)

Replaces the current dashed box (the editor store already has `safeZone: boolean`, today not persisted). Geometry comes from `platformZones(format, w, h)` in `packages/motion/src/core/safe-area.ts`, next to `safeArea()`: it returns `{ safe: Box, zones: { id: 'top' | 'bottom' | 'sides' | 'platform-buttons', label?: string, box: Box }[] }`, built only from `safeArea`'s numbers (§0 #14). Drawn as percentages:
- dashed outline `violet/60`, 1 px;
- outside area: `repeating-linear-gradient(135deg, rgba(139,124,255,.10) 0 6px, transparent 6px 12px)`;
- 9:16: the `platform-buttons` zone (the 6 % right margin between 50 % and 80 % of the height) and the `bottom` zone (the bottom 20 %) at `.18`, with labels "Platform buttons" (rotated, 10 px) and "Captions and username" (10 px, `text-2`).
- `pointer-events: none`, `aria-hidden`. Lives in the editor DOM, outside the iframe, so it can never reach a still or a render (R2.2). `safeZone` persists in localStorage `mp:safe-zone`.

## 4. Captions

### 4.1 Grouping (`packages/motion/src/captions/chunk.ts`, pure)

```ts
interface CaptionWord { text: string; startMs: number; endMs: number; emphasis: boolean }
interface CaptionGroup { openMs: number; closeMs: number; words: CaptionWord[] }
chunkCaptions(words: Word[], opts: { format: Format; presetId; spans: TaggedSpan[]; stress?: number[] }): CaptionGroup[]
```

1. Drop fillers (`filler: true`) and empty tokens.
2. Walk words; start a new group when: the group is at the limit (§R4.1 table), the previous word ends a sentence (`.?!` or `…`), or the gap to the previous word is ≥ 150 ms. A tagged span (number, place, name) that fits the limit is kept whole: if it would straddle the limit, the group breaks before the span.
3. Times: `openMs = max(prevClose, first.startMs − 100, 100)`; `closeMs = min(last.endMs + 200, nextFirst.startMs − 100)`, but never below `last.endMs`. If `closeMs − openMs < 500`, extend `closeMs` into the free gap up to 500 ms.
4. Emphasis (R4.3): a word inside a `number` span; else the max-stress word if stress > 70; else none.

There is no model in this path (§0 #6): the same `chunkCaptions` runs in the editor and in the render job, so the groups match by construction. `captions.chunk` (device refinement) is under Later.

### 4.2 Compile and runtime

`CompileInput` gains `captions?: { presetId; groups: CaptionGroup[]; accent: string }` (accent from the look's tokens) and, in 12b, `bedSrc?: string`. The function that builds it is `projectCompileInput(project, opts)` in `packages/motion/src/compiler/project.ts` (spec 08 task 4 moves it there from `previewCompileInput` in `apps/web/lib/composition/project-to-compile.ts`, which re-exports it); **captions are added in that packages/motion function**, never in an apps/web wrapper, so the render job (which cannot import apps/web) gets them too. In render mode the job computes `chunkCaptions(snapshot)` itself (§9); in preview mode the editor does. The old name `projectToCompile` in the first draft does not exist. The compiler writes `<div id="mp-captions" data-track-kind="captions">` (exists) and the runtime gains `packages/motion/src/runtime/captions.ts`:

```ts
mountCaptions(host: HTMLElement, cfg, frame: { width, height, format }): { seek(tMs): void }
```

- Builds one DOM block per group once (spans per word, `data-text`, `data-on` for the pill and the box), sized with `fitText` against the preset's max width, positioned per §R5.2 using `safeArea()`.
- `seek(t)`: the group with `openMs ≤ t < closeMs` gets `opacity` and `translateY` from a 120 ms out-cubic entrance (and a 90 ms exit if `closeMs − t < 90`); every other group `opacity: 0; visibility: hidden`. Current word = the last word with `startMs ≤ t`: pop → pill behind it (scale 1→1.06 over 80 ms from its start); clean → 4 px accent underline; boxed → full white vs 75 % white. All values computed from `t` only.
- Presets (frame px at 1080 height; scale for other sizes):

| Preset | Type | Backing | Current word |
|---|---|---|---|
| pop | Geist 800, 7 % of height, tracking −1 % | rounded line backing `rgba(8,8,12,.66)`, radius 0.3 em, padding 0.15 em 0.35 em | accent pill; ink colour = black or white, whichever contrasts more with the accent (≥ 4.5 required, else the pill is white with black text) |
| clean | Geist 600, 5.5 % | soft backing `rgba(8,8,12,.66)` with 0.6 em feathered edges | 4 px accent underline, 0.12 em below the baseline |
| boxed | Geist 600, 5.5 % | box `rgba(8,8,12,.78)`, radius 0.35 em, padding 0.35 em 0.6 em | white 100 %, others 75 % |

Contrast reasoning (R5.4): white text over a 0.66 black backing over a pure white frame gives a backing of about (90, 90, 92) → 7.1:1 (property 3 computes it for every preset over white and black). The `clean` backing's 0.6 em feathered edge is the exception: alpha falls below 0.66 at the edge, so the text block is inset by 0.6 em on each side inside the backing and no glyph sits on the feather (property 3 covers the text box, not the backing box).

Transparent export keeps captions (they are part of the overlay); the backing makes them readable over the editor's own footage.

### 4.3 Editor UI

- Toolbar toggle (`preview-pane.tsx`) binds to `project.captions.enabled` via `setCaptions`; `editorStore.captions` and `toggleCaptions` are removed.
- Clicking the "CC Captions" text opens `captions-popover.tsx` (glass, 220 px): three rows "Pop", "Clean", "Boxed" with a 2-second looping mini line ("Revenue grew forty percent") drawn by the same `mountCaptions` in a tiny non-video canvas element; selection with the violet check. Not designed; same language as the format pills.

## 5. Sound effects (`packages/motion/src/sfx/`)

```ts
type SfxKind = 'whoosh' | 'pop' | 'tick' | 'rise' | 'impact';
synthSfx(kind: SfxKind, take: number, sampleRate = 24000): Float32Array   // pure, seeded by (kind, take)
```

| Kind | Recipe (all seeded noise from `core/rng.ts`) | Length | Peak at |
|---|---|---|---|
| whoosh | band-passed noise, centre sweeping 400 Hz → 3 kHz → 800 Hz, Hann envelope; takes vary sweep and length | 420–520 ms | ~55 % |
| pop | 3 ms noise transient + 60 ms low thump (fast-decaying 140–180 Hz body with pitch drop) | 90 ms | 6 ms |
| tick | 1.5 ms high-passed click + 20 ms resonant decay, very quiet | 25 ms | 1 ms |
| rise | noise with a rising band-pass and rising level | 900 ms | end |
| impact | low thump (60–80 Hz, pitch drop) + 300 ms noise tail | 450 ms | 8 ms |

Placement (`placeSfx(project, keyMomentOf, seed) → { kind, take, atMs, slotId }[]`, pure):
1. For each ready slot in time order: entrance whoosh at `slot.startMs + entranceOffset` when the component's category is `data`, `map` or `transition`, or the scene's first cue is a large move (the scene catalogue marks it); pop at `slot.startMs + keyMomentMs + 33` for `data` components and number scenes (`stat-punch`, `bar-chart`, `big-number`, `line-chart`); ticks at word cues for word-by-word text scenes (`hook-statement`), at most 4 per slot, at −6 dB.
2. Rise ending exactly at the peak slot's key moment + impact there, once (peak from the director's energy curve; none if no slot is `hype` or marked peak).
3. Priority impact > pop > whoosh > tick; drop the lower one when two are closer than 1.2 s.
4. Takes: `take = hash(seed, slotId, kind) mod takes`, then bumped if equal to the previous same-kind take.

The timeline's `AudioTrack` reads `placeSfx` (memoised on slots, transcript and `sfxSeed`) instead of `slot.sfx`.

## 6. Music and ducking

`synthBed(id: 'calm-pad' | 'steady-pulse', durationMs, seed)`: pure DSP, built from short seeded patterns (pad: detuned saw stacks through a slow low-pass, chord changes every 4 bars at 72 BPM; pulse: soft kick + filtered hats + pad at 96 BPM), rendered once per 8-bar loop and looped with 500 ms crossfades, fades per R7.2. **Quality gate:** the founder listens (task B11) before the flag goes on.

Own track: decoded in the browser (`decodeAudioData`), resampled to 24 kHz mono, stored through the `HybridAudioStore` of spec 11 (`users/{uid}/audio/{projectId}/music-{hash16}.wav` when signed in; the project delete route removes it and duplicate copies it), cached decoded in memory for re-mixing.

`duckEnvelope(words, durationMs, { depthDb, attackMs: 80, releaseMs: 400, minGapMs: 400 }) → Float32Array` of gains at 100 Hz (pure): speech regions are word spans merged across gaps under 400 ms; inside a region the gain ramps down to `−depthDb` over the attack; after it, back to 0 dB over the release. The timeline draws the same array as the band's line.

## 7. The bed mix (`packages/motion/src/sfx/mix.ts`)

```ts
interface BedInput {
  durationMs: number; sampleRate: 24000;
  voiceLevelDb: number;                         // measured once per voiceover (§0 #11)
  music: { samples: Float32Array; levelDb: number } | null;   // levelDb = measured RMS of the music
  musicGainDb: number; ducking: boolean; duckDepthDb: number; envelope: Float32Array | null;
  sfx: { kind: SfxKind; take: number; atMs: number; gainDb: number }[];
  sfxGainDb: number;
}
mixBed(i: BedInput): { samples: Float32Array; peakDb: number }
bedKey(i: BedKeyInput): string                  // stable hash of every input: music by its source ref + id, the sfx list, the levels, `voiceLevelDb` and the active voice ref (the Voice panel's cleanup toggle changes both)
encodeWav16(samples, sampleRate): Uint8Array    // packages/motion/src/sfx/wav.ts, the one encoder; apps/web's encodeWav wraps it (§0 #15)
```

- Music gain = `voiceLevelDb + musicGainDb − music.levelDb`, times the envelope when ducking.
- Each effect at `voiceLevelDb − 6 + sfxGainDb + kindOffset` (pop 0, whoosh −3, tick −8, rise −4, impact 0), placed so its synthesized peak lands at `atMs`.
- Look-ahead limiter (5 ms look-ahead, 50 ms release) to keep the sample peak ≤ −1 dBFS (R9.2).
- Runs in `apps/web/workers/bed.worker.ts` (zod-validated messages, transferable buffers). The editor keeps `bedUrl` (blob URL) and `bedKey` in a small store slice.

Preview playback (`lib/editor/bed-player.ts`): a second `HTMLAudioElement` follows `PlaybackClock` (play/pause/seek/rate events); every 250 ms while playing, if `|bed.currentTime − clock| > 40 ms` it re-seeks. Swapping a new bed: wait for `canplay`, seek to the clock, 30 ms volume crossfade between the two elements.

Export contract (for spec 08; the changes themselves are tasks in this spec, §9): `ensureBedUploaded(project, { includeMusic }) → { path: string; key: string } | null`. It returns `null` when there is nothing to mix (effects off and no music, or `includeMusic` off with effects off), and then the composition has no `<audio id="bed">`. Otherwise it mixes (or reuses the cached blob when `bedKey` matches), uploads to `users/{uid}/projects/{projectId}/bed/{key}.wav` once per key, deletes the project's beds beyond the last 3, and returns the path that goes to the render route as `bedPath`. The job adds `<audio id="bed" class="clip" data-start="0" data-duration="{d}" data-track-index="2" data-volume="1" src="…">` (HyperFrames mixes every `<audio>` with an id, skill rule 8). Storage rules need the bed path (owner write, `audio/wav`, ≤ 50 MB; the render service reads it with the Admin SDK): an IDE rule edit and tests (tasks B3a, B3b).

Preview-versus-export audio: the preview plays the bed through a second `HTMLAudioElement` outside the iframe, the export through HyperFrames (`data-volume`, AAC, whatever loudness handling the producer applies). They are the same file but not the same path, so "parity by construction" holds for the bytes only. The real-producer test of R11.5 (a click at a known time and level, rendered to MP4, within one frame and within 1 dB) covers the rest, and the founder's listening check uses the exported MP4.

## 8. Audio panel (`components/editor/panels/audio-panel.tsx`)

In the spec 10 left-panel container, 340 wide, 24 px side padding, sections with uppercase 11 px labels (`MUSIC`, `SOUND EFFECTS`):
- Music options as 4 selectable rows (56 px; selected: violet border + check): "No music"; "Calm pad" ▶; "Steady pulse" ▶; "Your own track" (opens a file picker; shows the file name, "Replace", and the line "Use music you have the rights to." in `text-3`, because hackathon rules forbid copyrighted music in the demo). The two beds are hidden while `musicSynthEnabled` is off. ▶ plays a 6-second excerpt mixed at the current level (no voice).
- "Music level" `Slider` −40…0 with the mono readout "−18 dB"; "Duck under my voice" `Toggle` + "Music dips while you talk."
- "Pops and whooshes" toggle + "On your graphics' entrances and landings."; "{n} sounds placed" (mono n); "Shuffle takes" (ghost button, bumps `sfxSeed`); "Effects level" slider −24…+6.
- Footer note in `text-3`: "Every sound here is made in code. No stock libraries."
- Sliders preview live (store-local value) and commit one `setAudio` on release.

## 9. What spec 08 (export) needs from this spec: the change list

Spec 08 is reviewed and waiting for approval; its files are not edited here. These are tasks of this spec (A8 for 12a, B8 for 12b) so the owner of the export sees one list. Names are spec 08's (`render.ts`, `renderPaths`, `voicePathFor`, `isSafeId`, `startExport`, `projectCompileInput`).

**12a (captions in the export):**
1. `RenderRequestSchema` and `RenderOptionsSchema` are `.strict()` with `captions` and `music` booleans, and the route rejects `captions: true` as `invalid` today (08 task 12, R1.7). The route accepts `captions: true`; the job reads `options.captions`.
2. The render job computes the caption groups itself: `projectCompileInput(snapshot, { mode: 'render', captions: options.captions })` calls the pure `chunkCaptions` with the snapshot's transcript, format and look. The client uploads nothing for captions, so there is one source of truth and no client-supplied input.
3. The export modal's "Captions" toggle (08 task 15) leaves its "Soon" state and defaults to `project.captions.enabled`.
4. `services/render/scripts/parity.ts` (08 task 5) gains a captions-on case per format.

**12b (the bed in the export):**
5. `RenderRequestSchema` gains optional `bedPath`; `RenderDocSchema` stores it; `bedPathFor(uid, projectId, key)` sits next to `voicePathFor` and `renderPaths` in `packages/schemas/src/render.ts`, with the same `isSafeId` check on the key.
6. The route checks `bedPath` like the voice (exact path pattern, the object exists, `audio/wav`, ≤ 50 MB); the job re-checks it before reading anything (08 R3.9) and runs `ffprobe` on it; a bed that fails fails the render as `input-missing`.
7. The route accepts `music: true`; `music: false` means a bed with effects only (R9.5). No bed (`ensureBedUploaded` returned `null`) means no `bedPath` and no `<audio id="bed">`.
8. 08 §11's Storage table gets `users/{uid}/projects/{pid}/bed/{file}`; 08 task 13's rules tests list it (task B3b here adds the rule and the tests).
9. `parity.ts` gains an audio case (a bed with a click, R11.5); the real-producer integration test of 08 task 9 gains the same assertion.

## 10. Failure handling

| Failure | Behaviour |
|---|---|
| Bed worker throws | keep the last good bed; warn dot on the AUDIO band, tooltip "Couldn't mix the sound. Your last mix is playing." |
| Own track can't be decoded | toast "Pip couldn't read that track. Try an MP3, WAV or M4A." Keep the previous music. |
| Bed upload fails at export | spec 08 shows its error with Retry (the render does not start); `ensureBedUploaded` throws a typed error the modal maps to "Couldn't upload the sound mix. Try again." |
| `buildAll` throws | toast without the warning count; errors already go to `__motionpop.errors` |
| Captions popover preview fails | rows show the preset names only |

## 11. Testing approach

- **Unit:** schema defaults (old projects read with captions on/pop and default audio), commands, `chunkCaptions` cases (sentence end, pause, limit, span kept, fillers dropped, 0 ms start), presets' ink choice, `placeSfx` cases, `duckEnvelope` cases, limiter, WAV encoder header, bed key stability, toast text.
- **Motion check:** a `captions` target in `scripts/check.ts` (R11.1) with stills kept for `show-*` cases.
- **Stills review:** contact sheets of captions over the hold-end stills of every scene, 3 formats × the built looks, reviewed once by the `motion-qa` agent and once by eye.
- **Listening:** founder check on the exported MP4 and the preview (task B11), logged.
- **Preview versus export audio (R11.5):** the real-producer test with a click bed.
- **Performance:** format switch on the 5-slot demo and a 40-slot project; a 3-minute bed mix in the worker.
- **E2E (Playwright):** 16:9 → 9:16 shows the toast and a vertical frame; ⌘Z restores 16:9; captions toggle and preset survive a reload; turning effects off empties the AUDIO pills; the bed element plays in sync (|Δ| < 60 ms after 5 s of play).
- **Design check:** `editor.png` regions for the AUDIO track and the toolbar (Chrome DevTools MCP); same-language review stills for the 9:16 editor with the safe zone, the popover and the Audio panel.

### Correctness properties (fast-check)

1. **Caption coverage:** for random transcripts (with fillers, pauses, punctuation, spans) and every format and preset, the groups contain every non-filler word exactly once in order; each group has 1..limit words; no fitting span is split.
2. **Caption timing:** groups never overlap; `open ≥ 100`; `open ≤ first.startMs`; `close ≥ last.endMs`; at every t at most one group is visible.
3. **Contrast:** for each preset and any accent colour, the worst-case contrast (over white and over black) of every text state is ≥ 4.5:1.
4. **Safe area:** for random groups (long words, numbers) and every format, every caption box lies inside `safeArea()` after `fitText` (or is truncated with a warning).
5. **Seek purity:** `assertSeekPure` on `mountCaptions` with random groups.
6. **SFX placement:** placements lie inside their slots; any two are ≥ 1.2 s apart; at most one rise+impact; consecutive same-kind takes differ when the kind has ≥ 2 takes; deterministic for a seed.
7. **Synthesis:** every kind and take, and each bed, is deterministic (identical samples twice), finite, with peak ≤ −1 dBFS and the exact length.
8. **Ducking:** envelope values lie in [−depth, 0] dB; inside a speech region after the attack the value is exactly −depth; per-sample change never exceeds the attack/release slopes.
9. **Bed:** `mixBed` is deterministic; equal inputs ⇔ equal `bedKey`; output length = `durationMs × 24`; peak ≤ −1 dBFS.
10. **Commands:** `undo(do(s)) == s` for `setCaptions` and `setAudio`; a format switch changes nothing but `format`.

## 12. Proposed steering changes (to apply from the IDE)

The headless agent may not write `.kiro/steering/`, `docs/` or the root rules files. These are IDE tasks (task C1 lists them with the exact text):

1. `data-model.md` `Project.audio`: `{ musicId?: 'calm-pad' | 'steady-pulse' | 'own'; musicSrc?; musicName?; musicGainDb; ducking; duckDepthDb; autoSfx; sfxGainDb; sfxSeed }`, and "auto effects are derived, `Slot.sfx` is for manual overrides (later)".
2. `component-library.md` "Runtime overlay: captions": positions (16:9 / 1:1 bottom 96 px above the frame bottom at 1080; 9:16 bottom at 75 % of the height), group limits (3 / 4 / 5 words, pop 3), backing opacities, rail-only.
3. `architecture.md` video engine: replace "`<audio>` voice, music, synthesized SFX" with "`<audio>` voice and one pre-mixed bed (music with ducking + effects), the same file in preview and export".
4. `tech.md` explicit non-choices: add "no music written by a model; synthesized beds only behind a founder listening check".
5. `tech.md` Audio line: synthesized effects, beds, ducking and the bed mix are pure JS DSP in `packages/motion/src/sfx/` (deterministic, runs in a worker and in Node), not Web Audio / OfflineAudioContext; Web Audio stays for decoding, cleanup and peaks.
6. `ai-tasks.md` §5 (`captions.chunk`): add "**Later, not built:** device refinement of caption groups was removed from spec 12 (D-067); the code grouping is the only source. Groups are 3, 4 or 5 words for 9:16, 1:1 and 16:9 (pop: 3)." The §5 text about `lines` and "up to 6" would otherwise contradict the spec.

# Design: 04 editor shell and timeline

## Files
| Area | Path |
|---|---|
| Schemas | `packages/schemas/src/project.ts` (`EditorProjectSchema`, `SlotSchema`, `SlotStatusSchema`, `VersionSchema`, `VoiceoverSchema`) |
| Pure timeline logic | `apps/web/lib/timeline/` `geometry.ts` (ms ↔ px, zoom anchoring, ruler ticks), `snap.ts` (word-boundary snapping), `constraints.ts` (clamp move/resize against neighbours and limits), `invariants.ts` |
| Commands | `apps/web/lib/commands/` `command.ts` (interface, Composite), `slots.ts`, `project.ts`, `history.ts` |
| Store | `apps/web/lib/stores/editor.ts` (`useEditor`, Zustand + Immer + selectors), `playback.ts` (clock, rAF loop) |
| Persistence | `apps/web/lib/projects/repository.ts` (interface), `idb-repository.ts`, `fixture.ts` (demo project + seeded synthetic voice) |
| Workers | `apps/web/workers/peaks.worker.ts` (+ `lib/audio/peaks.ts` pure core) |
| UI | `app/(app)/editor/[id]/page.tsx`; `components/editor/` (TopBar, Rail, PreviewPane, Inspector, EditorShell); `components/timeline/` (Timeline, TimelineHeader, Ruler, SlotsTrack, SlotCard, WordsTrack, VoiceTrack, AudioTrack, Playhead) |

## Schemas (excerpt)
```ts
SlotStatusSchema = z.enum(["suggested", "generating", "ready", "failed"]);
SlotSchema = z.object({
  id, startMs: int ≥ 0, endMs: int, wordStart: int, wordEnd: int, reason: string,
  componentId: string, skillId: string, styleId?: string, prompt: string,
  params: z.record(z.string(), z.unknown()), status: SlotStatusSchema,
  error?: string, currentVersionId?: string, notes: FrameNote[] (default []),
}).refine(endMs > startMs);
EditorProjectSchema = z.object({
  schemaVersion: z.literal(1), id, title, format: FormatSchema, fps: z.literal(30), styleId,
  durationMs: int > 0, voiceover: { src: string, durationMs: int, peaks?: number[] },
  transcript: TranscriptSchema, slots: SlotSchema[], versions: VersionSchema[],
  createdAt: int, updatedAt: int,   // epoch ms (Firestore Timestamps convert at the adapter)
}).superRefine(timeline invariants);
```
Parsing the project validates the invariants, so a corrupt save never loads silently: the repository returns a typed error, and the UI offers "Restore last good version" (the IndexedDB store keeps the previous save).

## Pure timeline logic (property-tested)
- `geometry`: `msToX(ms, view)`, `xToMs(x, view)` with `view = { pxPerMs, scrollMs }`. `zoomAt(view, factor, anchorX)` keeps the time under the cursor fixed. `rulerTicks(view, widthPx)` picks a step from {0.5, 1, 2, 5, 10, 30} s so labels stay ≥ 64 px apart.
- `snap(ms, words, pxPerMs, thresholdPx = 8)` → nearest word start/end within the threshold, else `ms`. `snapRange` applies it to both edges of a move (the edge that snaps wins).
- `constraints`: `clampMove(slots, id, startMs)` keeps the duration and stops at neighbours and `[0, durationMs]`. `clampResize(slots, id, edge, ms, limits)` keeps `[min, max]`, neighbours and bounds. `limitsFor(componentId)` = intersect(global [1000, 12000], component `durationMs.min/max`).
- `wordsInRange(words, startMs, endMs)` → `wordStart/wordEnd` (re-derived after every move/resize so `reason` / "You said" stay true).

## Commands
```ts
interface Command { label: string; do(p: EditorProject): EditorProject; undo(p: EditorProject): EditorProject }
```
- Commands are pure (Immer `produce` inside) and capture what they need to undo (e.g. the removed slot and its index).
- `history.ts`: `{ past: Command[], future: Command[] }`, `exec`, `undo`, `redo`, cap 200. Drags coalesce: one MoveSlot per gesture (pointerup), not per pointermove. During the drag the store holds a transient `dragPreview`.
- The store exposes `exec(cmd)`. Components never mutate the project directly.

## Playback
- `playback.ts` owns an `HTMLAudioElement` (voiceover src) and a rAF loop:
  - While playing: `t = audio.currentTime * 1000`.
  - While paused: `t = playheadMs`.
  - Each frame writes `--playhead-x` on the timeline root, the timecode text node, the current-word index (karaoke via a data attribute on the word span), and `player.seek(frame / 30)` when the frame changes.
- The store's `playheadMs` updates only on pause, seek and scrub end, to avoid React renders per frame.
- No audio (fixture without decodable audio or autoplay blocked): the clock falls back to `performance.now()` deltas. This lives in the UI clock only, never in compositions.
- The preview player is `<hyperframes-player>` with the compiled project (`compileProject`, assets from a route that serves `dist/`, as `/dev/skeleton` does). It recompiles when slots, params, format or style change (debounced 150 ms). Library-only compositions use the default sandbox (D-021).

## Timeline rendering
- One scroll container, with `pxPerMs` from zoom (default: fit the whole voiceover to the visible width).
- Tracks are absolutely positioned rows (labels 168 px wide on the left, as in the design). Slots and words are positioned with `left: msToX(start)` and `width: msToX(end) - msToX(start)`.
- Words track: text spans at word start, virtualised by visible range above 600 words. The selected slot's words get one continuous band element (from the first word start to the last word end).
- Voice track: a canvas redrawn on zoom/scroll. Peaks are min/max pairs per 10 ms bucket, computed in the worker. The played portion is clipped with `--playhead-x` (two layers: grey base, ember overlay with `clip-path: inset(0 calc(100% - var(--playhead-x)) 0 0)`), so playback doesn't redraw the canvas.
- Playhead: a line with z-index under the slot cards, the capsule above everything.

## Slot card visuals (from editor.png / editor-generating.png)
Tokens from spec 02:
- **suggested:** dashed `violet` border, sparkle icon, breathing glow (`breathe` preset).
- **generating:** violet gradient + `Shimmer`.
- **ready:** thumbnail tile (a still from the composition at the key moment, rendered later; until then a component glyph) and a mint dot.
- **selected:** violet→ember gradient border + bloom (`--shadow-sel`).
- **note:** red dot.
- **failed:** red outline with Retry / Use a template (disabled until spec 06).

Titles come from the component name, subtitles from the params (e.g. big-number: `formatCount(value)` + label).

## Fixture (`/editor/demo`)
The transcript is the editor.png script ("Let's look at the numbers. Our revenue grew forty percent since 2020. And this is only the beginning. Here's what comes next."), 18 s, with word timings as in the design. It has four slots matching the design states (suggested opening title, ready big-number "40%", generating, ready). The voice is synthesized at load by a pure function (`lib/audio/synth-voice.ts`, no Web Audio, so it is testable and can run in a worker): per word, a seeded pulse train plus noise through a two-pole formant resonator, shaped by an attack/decay envelope with a syllable wobble, then encoded as a 16-bit WAV blob URL. The waveform and karaoke line up with the words. Word timings and slot ranges are measured from editor.png. Only `big-number` exists until spec 07, so the two ready slots use it; the suggested title and generating map don't render. It is procedural (no third-party audio) and replaced by real sample audio in spec 05.

## Edge cases
- Zero-word transcript: SLOTS and WORDS show an empty state, and shift-drag is disabled.
- A slot shorter than its component's min after a resize: clamped. Loaded data that violates invariants: typed error → restore flow.
- A drag past the edge of the visible area auto-scrolls (`12 px` zone, speed proportional to distance).
- Window resize keeps the fit-to-width zoom unless the user zoomed manually.

## Testing
- **Property [kiro]:** commands (`undo(do(s)) == s`; random sequences keep invariants; history cap); geometry (round trip ms ↔ px within 1 px; `zoomAt` keeps the anchor fixed); snap (result is a word boundary or the input; never moves more than the threshold); constraints (never overlap; durations within limits).
- **Unit:** schemas accept the fixture and reject overlapping slots; peaks core (known signal → known min/max); repository round trip (fake-indexeddb).
- **Component (Testing Library):** slot card states render; word click calls seek; keyboard map.
- **E2E (Playwright):** open `/editor/demo`, play 1 s, click "forty", drag the 40 % slot by +1 s (snaps to a word), ⌘Z restores, reload keeps the change.
- **Design check:** 1440×900 screenshot of `/editor/demo` (paused at 5.6 s, slot 2 selected) next to `editor.png`.
- **Performance:** a dev page with 50 slots / 3,000 words; record fps while playing (target 60).

## Correctness properties
1. The project in the store always satisfies the timeline invariants.
2. Every user-visible mutation is one undoable step.
3. Playhead, karaoke, timecode and preview always show the same frame.

## As built (tasks 6–8, 2026-11-14)
- **Root font size:** `globals.css` set `font-size: 13px` on `html`, which made every rem-based Tailwind size 13/16 of its intended value (`h-14` rendered as 45.5 px instead of 56). The design comparison caught it. The root now stays at 16 px and only `body` is 13 px, which also corrects the spec 02 primitives to the sizes their comments state.
- **Ruler:** `MIN_LABEL_SPACING_PX` is 96 (not 64) and the minor step for 2 s majors is 1 s, which gives editor.png's "0s, 2s, … 18s" labels at the default fit (68 px per second at 1440 px). The time area clips with `clip-path: inset(0 0 0 -24px)` so the centred "0s" label isn't cut.
- **Playback:** `lib/editor/playback.ts` (`PlaybackClock`) reads the audio element once per animation frame and notifies subscribers (`useFrame`). Subscribers write `--playhead-x`, the timecode text, word `data-state` and the preview seek (`lib/editor/preview-bridge.ts`, which only seeks when the 30 fps frame changes). The preview player is muted; the editor plays the voice itself.
- **Waveform:** bars every 4 px (2 px wide, 4–31 px tall) from `peaksForRange`, drawn on two canvases with the played copy clipped at `--playhead-x`, on a rounded ember band, as in the design.
- **Open at a moment:** `/editor/demo?t=5600&select=slot-2` opens paused at 5.6 s with slot 2 selected (used by the design check).
- **Composition assets:** served by `app/api/composition/assets` from `packages/motion/dist`. Packaging `dist/` for App Hosting is part of spec 08.
- **Keyboard (part of task 9):** `use-editor-keys.ts` already handles Space, J/K/L, ←/→ (⇧ = 1 s), ⌘Z/⇧⌘Z, Delete, ⌘D and Esc. Arrows nudge a focused slot. J steps back 1 s, because an `<audio>` element can't play in reverse.

## As built (task 9)
- **Drag** (`components/timeline/slot-drag.ts`): pointer capture on the card, 3 px threshold so clicks still select, mode from `dragModeAt` (8 px edges; cards under 24 px only move). Every move recomputes `dragRange` from the press-time project and writes `dragPreview { slotId, startMs, endMs, snapped }`; release commits that exact range as one MoveSlot / ResizeSlot (property-tested: committed range equals the preview). Escape cancels without deselecting.
- **Magnetic settle**: while `snapped`, the card's `left`/`width` ease over 150 ms with a slight overshoot; off under reduced motion.
- **Auto-scroll**: when zoomed, a 12 px zone at either edge of the time area scrolls 10 px per frame, and the drag delta includes the scroll change so the card stays under the pointer.
- **Shift-drag create** (`words-track.tsx`): shift + press on a word shows a dashed band and an "Add graphic here" chip; release runs `slotForWords` → AddSlot and selects the new slot. No room → `reject()` toast "Those words already have a graphic." The click after a shift-drag never seeks.
- **Wheel** (`lib/timeline/wheel.ts`, non-passive listener on the timeline): ⌘/ctrl + wheel (trackpad pinch) zooms at the pointer, never wider than fit (zooming out past fit snaps back to `fit: true`); shift + wheel or a sideways swipe scrolls; `clampScroll` keeps the scroll within [0, duration − visible]. The zoom slider uses the same clamp.
- When scrolled, the time area clips at its left edge (the −24 px inset for the "0s" label only applies at scroll 0).
- Footer hint uses the design copy "Drag a slot to retime · Space to play".


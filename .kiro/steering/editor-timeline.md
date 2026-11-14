---
inclusion: fileMatch
fileMatchPattern: ["apps/web/components/timeline/**", "apps/web/components/editor/**", "apps/web/lib/stores/**", "apps/web/lib/commands/**"]
---

# Editor timeline (transcript-first)

The timeline is the hero of the product: full width at the bottom of the editor (300 px at 1440×900), never covered by panels. Match `design/screens/editor.png`.

## Structure (top to bottom)
1. **Header row:** tab "Transcript" (violet underline) · "Voiceover · 18.0s" · chip "✓ Synced" (mint) · centre transport: previous, play/pause (round white button), next · timecode "00:05.6" (bright mono) "/ 00:18.0" (dim mono) · right: settings (sliders icon), zoom − slider +, fullscreen.
2. **Ruler:** "0s 2s 4s …" (mono, `text-3`), major + minor ticks. Playhead capsule (ember pill "5.6s") at the top; ruler labels under the capsule are hidden.
3. **SLOTS track:** slot cards positioned by `startMs/endMs`.
4. **WORDS track:** every transcript word at its time.
5. **VOICE track:** waveform (peaks precomputed, canvas) inside an ember-tinted band. Played part ember, unplayed grey.
6. **AUDIO track:** mint gradient band "♫ Music · ducked" with the ducking envelope drawn as a thin line, plus SFX pills ("• pop", "• whoosh") at slot entrances.
7. **Hints footer:** "Space play · ⌘G generate · Drag slot to retime" (`text-3`).

Track labels on the left: uppercase 11 px, letter-spaced (SLOTS, WORDS, VOICE + waveform icon, AUDIO + note icon). Hairline separators.

## Slot card states
| State | Visual (from the design) |
|---|---|
| suggested | dashed border, violet sparkle, title + "Suggested", slow breathing glow |
| generating | violet gradient fill, sparkle, shimmer sweep, "Generating map" / "Preparing motion…" / "Animating…" |
| ready | thumbnail tile, title + subtitle ("Callout · Ready"), mint dot top-right |
| selected | violet→ember gradient border + soft bloom; thumbnail + "Bar chart / Revenue grew 40%" |
| has note | red dot top-right |
| failed | red outline, "Couldn't generate", inline Retry · Use a template |

## Words track
- Karaoke: spoken words `text-2`, **current word** bright white with an ember underline glow, upcoming words dim.
- Words linked to the selected slot sit on **one continuous violet band** (no gaps).
- Fillers removed by cleanup are not shown here (struck through in the Voice panel only).
- Click a word → seek to its start. Shift-drag across words → create a slot spanning them ("Add graphic here").

## Playhead
Ember line with a soft glow spanning all tracks, **passes behind slot cards** (z-order), capsule handle draggable for scrubbing.

## Interactions
- Drag slot body → retime (keeps duration); drag edges → resize. Snap to word starts/ends within 8 px; magnetic settle 120–180 ms.
- Overlaps prevented: a dragged slot stops at its neighbours.
- Min slot 1.0 s, max 12 s (component limits override).
- Double-click slot → select + focus prompt. Delete/Backspace → delete (undoable). ⌘D duplicate.
- Zoom: ⌘+scroll or slider, cursor-anchored. Horizontal scroll with trackpad / shift+wheel.
- Keys: Space play/pause · J/K/L shuttle · ←/→ one frame · ⇧←/→ one second · ⌘Z / ⇧⌘Z · ⌘G generate selected · Esc deselect.

## State and commands
- Zustand store `useEditor` (Immer): `{ project, transcript, slots, versions, selection, playheadMs, zoom, panels, aiStatus }`.
- All mutations are **commands** (`do` / `undo`): AddSlot, DeleteSlot, MoveSlot, ResizeSlot, UpdateParams (JSON patch), SetStyle, SetFormat, ApplyPlan (composite). History capped at 200.
- Firestore sync: debounced writes (500 ms) after commands, optimistic UI, last write wins per slot.

## Invariants (property-tested)
1. Slots never overlap.
2. `0 ≤ startMs < endMs ≤ voiceover.durationMs`.
3. After any snap, slot boundaries equal word boundaries.
4. `undo(do(s)) == s` for every command; random command sequences keep 1–3.

## Performance
- The audio element is the master clock while playing. Playhead and karaoke are driven by rAF writing CSS variables / refs, not React state per frame.
- Virtualise the words track above 600 words. Peaks computed once in a worker and cached in Storage.

# Requirements: 04 editor shell and timeline

The editor at `/editor/[id]`: top bar, left rail, live preview, a basic inspector and the transcript-first timeline that is the hero of the product. It includes the editor store, undoable commands with property-tested invariants, playback with the voiceover as master clock, and slot retiming by drag. Lands by **Fri Nov 20, 2026**. Written in Claude Code. Visual source of truth: `design/screens/editor.png` and `editor-generating.png` at 1440×900; behaviour from `editor-timeline.md` and `screens.md`.

Out of scope here (later specs): generation and auto-fill (06), the full inspector, quick edits and frame notes (09), the Pip panel (10), export (08), music/SFX and captions (12), and Firestore sync (01, when Firebase is set up). This spec persists locally through a repository interface that Firestore will implement.

## R1 Editor data and store
_As a creator, I want my edits to be instant, undoable and never lost on reload._
1. **R1.1** THE SYSTEM SHALL define zod schemas in `packages/schemas` for the editor project (`EditorProject`: title, format, styleId, durationMs, voiceover, transcript, slots, versions) and `Slot` / `SlotStatus` / `Version` per `data-model.md`, with integer ms everywhere.
2. **R1.2** THE SYSTEM SHALL hold editor state in a Zustand + Immer store `useEditor` (project, selection, playheadMs, zoom, panels, playing), with selectors so the timeline doesn't re-render on unrelated changes.
3. **R1.3** THE SYSTEM SHALL load and save projects through a `ProjectRepository` interface (`load(id)`, `save(project)`), parsed with zod on read. It ships an IndexedDB implementation and a seeded demo fixture (`/editor/demo`).
4. **R1.4** WHEN a command changes the project THE SYSTEM SHALL save it after 500 ms of quiet and show "● All changes saved" (mint) or "● Saving…".

## R2 Commands and invariants
_As a creator, I want ⌘Z to undo exactly what I did, and the timeline to stay valid whatever I do._
1. **R2.1** THE SYSTEM SHALL apply every project mutation as a command with `do` / `undo`: AddSlot, DeleteSlot, MoveSlot, ResizeSlot, DuplicateSlot, UpdateParams (RFC 6902 patch), SetFormat, SetStyle, RenameProject and Composite (one undo step). History is capped at 200.
2. **R2.2** THE SYSTEM SHALL keep these invariants after every command: slots never overlap; `0 ≤ startMs < endMs ≤ durationMs`; slot duration within `[1000, 12000]` ms (narrowed by the component's limits); snapped boundaries equal word boundaries.
3. **R2.3** IF a command would break an invariant THEN THE SYSTEM SHALL clamp it to the nearest valid state (dragging stops at neighbours) or reject it, never store an invalid project.
4. **R2.4** THE SYSTEM SHALL prove with fast-check that `undo(do(s)) == s` for every command and that random command sequences keep the invariants.

## R3 Shell
_As a creator, I want the editor to look exactly like the design and fit a laptop screen._
1. **R3.1** THE SYSTEM SHALL render the top bar per `screens.md`: logo, "‹ Home", editable title with pencil, format pills (16:9 / 9:16 / 1:1 → SetFormat), undo, redo, history, brand kit chip, credits chip, "Export" (ember gradient, opens a placeholder until spec 08), and avatar.
2. **R3.2** THE SYSTEM SHALL render the 72 px rail (Voice, AI, Styles, Media, Audio, Fonts, Brand, Projects; active item violet pill). At the bottom, Pip and a bubble ("3 slots ready" / "Pip is thinking…").
3. **R3.3** THE SYSTEM SHALL render the preview: glass toolbar (pen, CC Captions toggle, Safe zone, zoom), a frame card with the HyperFrames player showing the compiled project in the current format, the status badge, and a footer ("SCENE 02 / 04", style name, save status).
4. **R3.4** WHEN a slot is selected THE SYSTEM SHALL show a 360 px inspector with the header ("GRAPHIC", "Slot 2 · Big number", time range), the "You said" card, the prompt box with a disabled "✦ Generate ☁ 3" (until spec 06), and TIMING (duration slider + mono value). The rest lands in spec 09.
5. **R3.5** THE SYSTEM SHALL lay out at 1440×900 with the timeline 300 px tall at full width, never covered by panels, and SHALL stay usable down to 1280×720.

## R4 Timeline
_As a creator, I want to see my words, my voice and my graphics on one timeline._
1. **R4.1** THE SYSTEM SHALL render the header row (Transcript tab, "Voiceover · 18.0s", "✓ Synced", transport, timecode, settings, zoom − slider +, fullscreen), the ruler (labels and major/minor ticks), and the SLOTS, WORDS, VOICE and AUDIO tracks plus the hints footer, matching `editor.png`.
2. **R4.2** THE SYSTEM SHALL draw slot cards in every state from `editor-timeline.md` (suggested, generating, ready, selected, has note, failed).
3. **R4.3** THE SYSTEM SHALL draw words karaoke-style (spoken `text-2`, current word bright with an ember underline glow, upcoming dim). Words linked to the selected slot sit on one continuous violet band.
4. **R4.4** THE SYSTEM SHALL draw the voice waveform on a canvas from peaks computed in a worker, ember for the played part and grey for the rest.
5. **R4.5** THE SYSTEM SHALL draw the AUDIO track as the design's mint band. Music, ducking and SFX are placeholders until spec 12.

## R5 Playback and playhead
_As a creator, I want to scrub and play and see the right word and graphic at every moment._
1. **R5.1** WHILE playing THE SYSTEM SHALL use the voiceover audio element as the master clock and drive the playhead, timecode, karaoke and preview seek from `requestAnimationFrame`, writing CSS variables and refs, not React state per frame.
2. **R5.2** THE SYSTEM SHALL draw the playhead as an ember line with a glow across all tracks, behind slot cards, with a draggable capsule ("5.6s") for scrubbing. Ruler labels under the capsule are hidden.
3. **R5.3** WHEN the user clicks a word THE SYSTEM SHALL seek to its start.
4. **R5.4** WHEN the playhead moves THE SYSTEM SHALL seek the preview player to the same frame (paused) or keep it in sync (playing).

## R6 Interactions
_As a creator, I want to retime graphics by dragging, with the words as a magnetic guide._
1. **R6.1** WHEN the user drags a slot body THE SYSTEM SHALL move it keeping its duration. Dragging an edge resizes it. Both snap to word starts and ends within 8 px, with a 120–180 ms magnetic settle, and stop at neighbouring slots.
2. **R6.2** WHEN the user shift-drags across words THE SYSTEM SHALL create a suggested slot spanning them ("Add graphic here").
3. **R6.3** THE SYSTEM SHALL support zoom with ⌘+scroll or the slider, anchored at the cursor, and horizontal scroll with the trackpad or shift+wheel.
4. **R6.4** THE SYSTEM SHALL support the keys: Space play/pause · J/K/L shuttle · ←/→ one frame · ⇧←/→ one second · ⌘Z / ⇧⌘Z · Delete/Backspace delete slot · ⌘D duplicate · Esc deselect · double-click slot → select and focus the prompt.
5. **R6.5** THE SYSTEM SHALL animate in the poppy UI language (springy selection, card pop-in) and respect reduced motion.

## R7 Accessibility
1. **R7.1** THE SYSTEM SHALL make slots focusable with arrow-key nudging (one frame; ⇧ one second), give the timeline and its tracks accessible names, and keep the 2 px violet focus ring.

## Non-functional
- 60 fps playhead with 50 slots and 3,000 words on an M-series laptop. The words track is virtualised above 600 words.
- Opening `/editor/demo` shows the first frame in under 1.5 s on a warm cache (excluding the Whisper model).
- No third-party names in UI copy.

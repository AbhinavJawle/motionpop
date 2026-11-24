# Requirements — Spec 45: Multi-Track Timeline, Razor Split & Stock Export Parity

## Introduction

Creators want real video-editor control directly on the MotionPop timeline: splitting their main video, stock footage, photos, music, and sound effects at the playhead; removing unwanted video segments non-destructively; stacking multiple visual and audio lanes with per-track visibility/mute toggles and cross-lane drag; and having every placed, split, trimmed, and layered stock clip appear identically in exported MP4s across all project modes (motion, video, and reel).

## Requirements

### R1. Multi-Lane Track & Clip Data Model
- **R1.1** WHEN a project stores stock visual overlays (`stockOverlays`) or stock audio clips (`stockAudio`) THE SYSTEM SHALL allow optional integer millisecond `sourceOffsetMs` (default `0`) and optional zero-based lane index `track` (`0..3`, default `0`) on every clip, and optional `clipDurationMs` on stock audio clips, while remaining 100% backwards-compatible with existing `schemaVersion: 1` projects.
- **R1.2** WHEN a project adds, hides, mutes, or removes extra stock media or stock audio lanes THE SYSTEM SHALL persist lane state in optional `stockMediaLanes` and `stockAudioLanes` arrays (up to 4 visual lanes and 4 audio lanes) and derive lane `0` automatically when omitted.
- **R1.3** WHEN a creator splits the main source video (`project.video`) THE SYSTEM SHALL record non-destructive integer source-clock millisecond split points in `video.splits` and compute deterministic non-overlapping display segments from `keptSourceSegments` partitioned at those split points.
- **R1.4** WHEN visual overlay geometry or lane visibility/audibility is evaluated THE SYSTEM SHALL compute normalized box coordinates (`stockOverlayBoxFor`), active lanes (`resolvedMediaLanes`, `resolvedAudioLanes`), visible visual clips (`visibleStockOverlays`), and audible audio clips (`audibleStockAudio`) through shared pure helpers in `@motionpop/schemas` used by both browser preview and server render.

### R2. Undoable Razor Split, Video Cut & Multi-Lane Commands
- **R2.1** WHEN a creator splits a stock visual or stock audio clip at `splitMs` strictly inside `[startMs + 250, endMs - 250]` THE SYSTEM SHALL replace the clip with two contiguous halves (`[startMs, splitMs]` and `[splitMs, endMs]`), advancing the right half's `sourceOffsetMs` by `splitMs - startMs`, in a single undoable command.
- **R2.2** WHEN a creator trims the left edge of a stock visual or stock audio clip THE SYSTEM SHALL update both `startMs` and `sourceOffsetMs` so the remaining clip continues from the matching source offset without jumping back to `0`.
- **R2.3** WHEN a creator adds or removes an extra media or audio lane, toggles hide on a media lane, or toggles mute on an audio lane THE SYSTEM SHALL execute an undoable command (`undo(do(p)) === p`), refusing removal of base lane `0` and compacting higher lane indices cleanly when an extra lane is removed.
- **R2.4** WHEN a creator splits the main video track at a valid source timestamp or removes a manual split seam THE SYSTEM SHALL execute an undoable command (`splitVideoAt` / `removeVideoSplit`).
- **R2.5** WHEN a creator cuts out a video display segment THE SYSTEM SHALL add a `kind: 'manual'` `VideoCut` and re-splice audio/transcript/duration atomically in one undoable composite step, clamping slots, stages, reel scenes, and stock clips cleanly to the new duration.

### R3. Multi-Track Timeline UI & Keyboard Ergonomics
- **R3.1** WHEN extra stock media or stock audio lanes exist THE SYSTEM SHALL render every lane with its own track header (`+` to add lane up to 4, hide/mute toggle, and remove button on lanes `>= 1`), keep the header and time ruler pinned, and scroll the track stack vertically when total height exceeds the timeline viewport.
- **R3.2** WHEN a creator drags a stock visual or stock audio clip horizontally or vertically across lanes THE SYSTEM SHALL show live time and lane feedback and commit the updated `startMs`, `endMs`, and `track` on pointer release in one undoable command.
- **R3.3** WHEN a creator clicks the Split button in the timeline header or presses `S` THE SYSTEM SHALL split the selected clip (or the top-most clip under the playhead, or the main video segment under the playhead) at the current playhead time.
- **R3.4** WHEN a creator selects a stock clip or video segment and presses `Delete` / `Backspace` THE SYSTEM SHALL remove the stock clip or non-destructively cut out the video segment (provided at least one kept segment remains).

### R4. Preview & Audio Playback Parity
- **R4.1** WHEN multiple visible stock media lanes overlap at timestamp `t` THE SYSTEM SHALL render each active lane simultaneously in ascending lane z-order (`track 0` behind `track 1`, etc.), skip hidden lanes, and seek videos using `(sourceOffsetMs + (t - startMs)) % clipDurationMs`.
- **R4.2** WHEN playing audio in the editor THE SYSTEM SHALL schedule only clips from non-muted audio lanes (`audibleStockAudio`), respecting each clip's `sourceOffsetMs` on start, seek, and audition.

### R5. Cloud & Offline Export Parity
- **R5.1** WHEN exporting a project in cloud, emulator, or offline mode THE SYSTEM SHALL upload/attach every blob referenced by visible `stockOverlays` and audible `stockAudio`, deduplicated by source ref, validated against owner-scoped Storage path regexes (`stockOverlayPathFor`, `stockAudioPathFor`).
- **R5.2** WHEN `renderKeyOf` computes an export cache key THE SYSTEM SHALL incorporate `stockOverlays`, `stockAudio`, lane flags, and `video.cuts` so timeline edits always produce a fresh export.
- **R5.3** WHEN `runRender` finishes rendering the base MP4 (for motion, video, or reel projects) and downloaded visible stock overlays or audible stock audio clips exist THE SYSTEM SHALL composite all visual overlays in ascending lane z-order (with exact `stockOverlayBoxFor` framing, rounded corners, and `sourceOffsetMs` trimming) and mix all stock audio clips (with `sourceOffsetMs`, `startMs` delay, `volume`, and music looping) via FFmpeg before loudness normalization, output probing, and thumbnail extraction.
- **R5.4** WHEN no visible stock overlays and no audible stock audio clips are present THE SYSTEM SHALL skip the extra FFmpeg pass with zero overhead or behavioral change to existing renders.

# Design — Spec 45: Multi-Track Timeline, Razor Split & Stock Export Parity

## 1. Architecture Overview

```
packages/schemas (single source of truth)
  ├── project.ts : TimelineLaneSchema, StockOverlayClip (+sourceOffsetMs, +track),
  │                StockAudioClip (+sourceOffsetMs, +clipDurationMs, +track),
  │                resolvedMediaLanes(), resolvedAudioLanes(),
  │                visibleStockOverlays(), audibleStockAudio(), stockOverlayBoxFor()
  ├── video.ts   : VideoTrackSchema (+splits), videoDisplaySegments()
  └── render.ts  : stockOverlayPathFor(), stockAudioPathFor(),
                   RenderRequestSchema & RenderDocSchema (+stockOverlayPaths, +stockAudioPaths)

apps/web (browser preview, commands, timeline UI, export client & routes)
  ├── lib/commands/stock.ts  : splitStockOverlay, splitStockAudio, addTimelineLane,
  │                            removeTimelineLane, toggleTimelineLaneHidden, toggleTimelineLaneMute
  ├── lib/commands/video.ts  : splitVideoAt, removeVideoSplit, removeVideoCut,
  │                            applyResplicedAudio (clamps stock clips + tiles reel scenes)
  ├── lib/stores/editor.ts   : selectedItem (stockOverlay | stockAudio | videoSegment)
  ├── lib/sound/use-stock-audio.ts : audibleStockAudio() + sourceOffsetMs scheduling/audition
  ├── components/editor/stock-overlays-layer.tsx : multi-lane simultaneous DOM layers + sourceOffsetMs
  ├── components/editor/use-editor-keys.ts : S split, Delete/Backspace selected item
  ├── components/timeline/   : pinned Ruler + scrollable multi-lane track stack, cross-lane drag,
  │                            Split button, lane headers (+/hide/mute/remove), VideoTrack segments
  └── lib/renders/           : uploadStockOverlays, uploadStockAudio, cloud + offline forwarding,
                               renderKeyOf invalidation

services/render (FFmpeg export parity for ALL project modes)
  ├── src/stock-ffmpeg.ts : buildStockCompositeArgs() (deduped inputs, split/asplit, trim+setpts,
  │                         roundedCornerFilter before PTS shift, lane z-order overlay, amix)
  ├── src/ffmpeg.ts       : compositeStockLayers() implementation
  ├── src/ports.ts        : optional Ffmpeg.compositeStockLayers port
  ├── src/run-render.ts   : downloads validated stock files (deduped by path), runs stock pass
  │                         right before normalizeLoudness, probe, and thumbnail
  └── src/store/firestore.ts : NewRender picks stockOverlayPaths & stockAudioPaths
```

## 2. Key Design Decisions & Invariants

### Backwards Compatibility
- All new schema fields (`sourceOffsetMs`, `track`, `clipDurationMs`, `stockMediaLanes`, `stockAudioLanes`, `video.splits`, `stockOverlayPaths`, `stockAudioPaths`) are optional.
- `schemaVersion` remains `1`.
- Existing projects without `stockMediaLanes`/`stockAudioLanes` automatically resolve to one lane (`index: 0`) with labels `"Stock Media"` and `"Stock Audio"`.

### Storage Security (Zero `storage.rules` Changes Required)
- Stock visual files upload under `users/{uid}/video/{projectId}/stock-ov-{hash16}.{ext}` (`(video|image)/.*`, <= 500 MB — matches existing `users/{uid}/video/{file=**}` rule).
- Stock audio files upload under `users/{uid}/audio/{projectId}/stock-au-{hash16}.{ext}` (`audio/.*`, <= 50 MB — matches existing `users/{uid}/audio/{file=**}` rule).
- Both `/api/renders` and `services/render` strictly re-validate every storage path against `stockOverlayPathFor(ownerId, projectId)` and `stockAudioPathFor(ownerId, projectId)`.

### Universal Post-Composite FFmpeg Pass (`compositeStockLayers`)
- Runs after the base MP4 is produced (whether via Motion `producer.render`, Reel `producer.render`, or Video `ffmpeg.compositeVideo`), and **before** `normalizeLoudness`, `probe`, and `frame` (thumbnail).
- Video-only overlays copy audio (`-c:a copy`); audio-only stock clips copy video (`-c:v copy`); combined runs encode H.264 + AAC cleanly.
- Rounded corners apply `alphamerge=shortest=1` at `PTS = 0` BEFORE shifting PTS by `startMs` (`setpts=PTS-STARTPTS+{startSec}/TB`), avoiding frame sync lag on late clips.
- Video `sourceOffsetMs` wraps modulo `clipDurationMs` (when provided) with `-stream_loop -1`, matching `<video loop>` preview behavior 1:1.
- Audio `amix` uses `duration=first:dropout_transition=0:normalize=0` with `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo` so mono SFX and stereo voiceover mix cleanly without attenuating voice volume.

### Correctness Properties (Property-Tested with fast-check)
1. **Command reversibility:** `undo(do(p))` equals `p` for every new stock/lane/video-split command and random sequences.
2. **Split continuity:** Splitting clip `C` at `t` produces `L` and `R` with `L.startMs === C.startMs`, `L.endMs === t === R.startMs`, `R.endMs === C.endMs`, and `R.sourceOffsetMs === (C.sourceOffsetMs ?? 0) + (t - C.startMs)`.
3. **Video display segment partition:** `videoDisplaySegments(dur, cuts, splits)` returns sorted, non-overlapping, non-empty segments whose durations sum identically to `cleanedDurationFromSegments(keptSourceSegments(dur, cuts))`.
4. **FFmpeg filter graph validity:** For random combinations of multi-lane stock videos, photos, SFX, and music (including split clips sharing one file), `buildStockCompositeArgs` emits balanced split/asplit outputs, valid `between(t,...)` windows, valid input indices, and clean output mapping.

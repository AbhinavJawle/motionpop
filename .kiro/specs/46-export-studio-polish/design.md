# Design — Spec 46: Export Studio Polish

## Pure Logic (`apps/web/lib/renders/subtitles.ts`)
- `formatSrtTimestamp(ms)` / `formatVttTimestamp(ms)`: deterministic `HH:MM:SS,mmm` and `HH:MM:SS.mmm` formatting from integer ms.
- `groupWordsForSubtitles(words)`: deterministic cue grouper (max 6 words, max 2.8s, split on >450ms gaps or terminal punctuation `.!?`), ensuring strictly non-overlapping `startMs < endMs` cues.
- `buildSrt(words)` / `buildVtt(words)`: full `.srt` and `WEBVTT` string builders.
- `formatFileSize(bytes)`: clean KB/MB/GB formatter.
- `exportStageSteps(status, progress, hasStockLayers)`: maps render state (`starting | queued | rendering | encoding | done`) to 4 user-facing pipeline stages (`done | active | pending`).

## UI Components (`apps/web/components/export/`)
- `option-cards.tsx`: adds optional `disabledReason?: string` distinct from `soon?: string` (no `"Soon"` pill) for Reel format lock.
- `options-view.tsx`: accurate Reel scene count, visible Reel 9:16 hint, and multi-track summary badge (`media overlays · audio clips · cuts`) in `ProjectCard`.
- `progress-view.tsx`: keeps exact existing progressbar/status/Pip contract while adding live elapsed timer and 4-step pipeline checklist.
- `ready-view.tsx`: adds inline `<video>` Watch toggle, `sizeBytes` display, visible **Publish kit** (`.srt`, `.vtt`, Cover `.jpg`) with short labels, and **Export another format** quick pills wired through `ExportDialog` → `ExportController`.

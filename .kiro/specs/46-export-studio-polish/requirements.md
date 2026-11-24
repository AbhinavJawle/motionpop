# Requirements — Spec 46: Export Studio Polish (Inline Player, Publish Kit, Stage Stepper & Reel/Track Accuracy)

## Requirements

### R1. Inline Video Playback, File Size & Quick Format Re-Export (`ReadyView`)
- **R1.1** WHEN a render finishes (`status === 'done'`) THE SYSTEM SHALL display the exported file's size (formatted in KB/MB) alongside resolution, format, and duration whenever `sizeBytes` is present.
- **R1.2** WHEN a creator clicks **Watch video** in `ReadyView` THE SYSTEM SHALL load the exported MP4 URL via `client.downloadUrl(renderId)` and play it inline inside a `<video controls playsInline>` player within the export modal, revoking any `blob:` URL on unmount.
- **R1.3** WHEN a render finishes THE SYSTEM SHALL offer one-click **Export another format** pills (other aspect ratios for non-reel projects, or **Export again** for reels) that return directly to `OptionsView` with the chosen format pre-selected without closing the modal.

### R2. Instant Client-Side Publish Kit (`.srt`, `.vtt`, Cover `.jpg`)
- **R2.1** WHEN a project has transcript words THE SYSTEM SHALL generate valid SubRip (`.srt`) and WebVTT (`.vtt`) subtitle files purely client-side with strictly increasing, non-overlapping timestamps derived from integer millisecond word timings.
- **R2.2** WHEN viewing `ReadyView` THE SYSTEM SHALL display a visible **Publish kit** section with short explanations and one-click buttons to download `.srt` subtitles, `.vtt` subtitles, and (when available) the rendered cover thumbnail `.jpg`.

### R3. Live Render Stage Stepper & Elapsed Timer (`ProgressView`)
- **R3.1** WHEN an export is starting, queued, rendering, or encoding THE SYSTEM SHALL show a 4-stage pipeline checklist (`Prepare & upload media`, `Render motion frames`, `Composite & mix tracks`, `Loudness (-14 LUFS) & finalize`) with short descriptions and active/completed indicators plus a live elapsed timer.

### R4. Options Accuracy for Reels & Multi-Track Timelines (`OptionsView` & `ProjectCard`)
- **R4.1** WHEN exporting a talking-head Reel project THE SYSTEM SHALL display the accurate Reel scene count (`project.reel.scenes.length`) instead of `0 scenes` and visibly disable non-portrait formats (`16:9`, `1:1`) with a clear explanation (`Reels export in 9:16 vertical.`).
- **R4.2** WHEN a project contains visible Stock Media overlays, audible Stock Audio clips, or enabled video cuts THE SYSTEM SHALL display a concise track summary badge in `ProjectCard` confirming those timeline edits are included in the export.

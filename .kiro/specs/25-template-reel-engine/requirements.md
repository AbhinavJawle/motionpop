# Spec 25 — Template reel engine (talking head → reference-quality reel)

> Written in a Claude Code session (2026-11-21). Founder ask: "I put in the talking head video, I should get this exact quality of videos" (two reference reels: a white split-screen explainer with black seam labels, and a warm cream editorial reel with a rounded speaker card).

## Why
Specs 18–24 had the model write animation code per beat. Output quality was random and the preview (CSS) and export (FFmpeg composite) drifted. The references are built from a small set of repeated, polished patterns. This spec replaces generated code with hand-crafted templates the director only fills.

## Requirements (EARS)
- **R1.1** WHEN a talking-head video is turned into a reel THE SYSTEM SHALL render every graphic from a fixed library of hand-crafted templates (headline, list, stack, checklist, compare, statement, counter, progress, terminal, chart, browser, flow, quote, punch, cta); the director SHALL NOT write code.
- **R1.2** THE SYSTEM SHALL offer two looks: `mono` (white grid panel, black uppercase seam labels, Inter) and `cream` (warm cream, serif headlines with italic accents, bold lowercase captions, rounded speaker card).
- **R1.3** THE SYSTEM SHALL support four layouts per scene: `split` (graphic top half, speaker bottom half), `card` (graphic fills, speaker card along the bottom), `full` (graphic only) and `speaker` (speaker fills, optional overlay).
- **R1.4** Template elements SHALL appear on the spoken word they belong to (`at`, integer ms).
- **R2.1** THE SYSTEM SHALL draw every frame as a pure function of time (`seek(ms)`), with no clocks or timers.
- **R2.2** The editor preview and the export SHALL run the same reel code; the export SHALL be a single HyperFrames composition holding the speaker video as timed `<video>` clips (no separate FFmpeg composite).
- **R2.3** Captions SHALL be chunked from word timings (mono: ≤ 2 words, uppercase labels at the seam; cream: ≤ 2 words, bold, above the speaker card).
- **R3.1** WHEN a video project has words and no reel plan THE SYSTEM SHALL ask the director (`reel.direct`, one cloud call, cost shown) for a plan, validate it with zod, repair once, and otherwise fall back to the deterministic `autoReelPlan`.
- **R3.2** THE SYSTEM SHALL tile scenes over the whole video with no gaps or overlaps (`tileReelScenes`).
- **R4.1** The user SHALL be able to switch look, regenerate, and export an MP4 (1080×1920, H.264 + AAC) whose frames match the preview.

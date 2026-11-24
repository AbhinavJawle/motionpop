# Spec 47 — Transparent Background Alpha WebM Export

## Goal
Enable creators to export motion-graphics and video-overlay compositions with a true transparent alpha channel (`WebM` · `VP9` · `yuva420p` + `Opus` audio) directly from the Export modal so they can drag-and-drop overlays onto their own footage in Premiere Pro, DaVinci Resolve, or Final Cut.

## Requirements

- **R1 — Schema & Identity**
  - **R1.1**: `RenderOptionsSchema`, `RenderDocSchema`, and `RenderStatusResponseSchema` accept optional `transparent?: boolean` while staying backwards-compatible with existing MP4 documents and requests.
  - **R1.2**: `renderPaths(uid, projectId, renderId, container)` resolves `video.webm` when `container === 'webm'` and `video.mp4` otherwise.
  - **R1.3**: `renderKeyOf` differentiates transparent and opaque exports so cached renders are never mixed.

- **R2 — Alpha-Preserving Render Pipeline**
  - **R2.1**: When `doc.transparent` is true (non-Reel projects), `runRender` compiles with `background: 'transparent'`, skips source-video compositing, and renders through `@hyperframes/producer` with `container: 'webm'` (`VP9` + `yuva420p`).
  - **R2.2**: When multi-track Stock Media / Stock Audio layers exist on a transparent render, `compositeStockLayers` decodes the base WebM with `-c:v libvpx-vp9`, preserves `yuva420p` alpha (or stream-copies video when only audio is mixed), and encodes audio with `libopus`.
  - **R2.3**: `normalizeLoudness` preserves the VP9 alpha video stream (`-c:v copy`) and re-encodes audio to `libopus` (without MP4 `-movflags`) for `.webm` outputs.
  - **R2.4**: Output verification (`probe` + `outputIssues`), thumbnail extraction (`premultiply` for clean JPEG edges), storage upload (`video/webm`, `.webm` `Content-Disposition`), download routes (including HTTP `206` byte-range streaming), and share routes all honor `video/webm` and `.webm`.

- **R3 — Export Modal UX**
  - **R3.1**: The **Transparent background (for editors)** switch in `OptionsView` is live (no longer `"Soon"`). For Reels, it is disabled with an explanatory reason (`disabledReason`) without a `"Soon"` pill.
  - **R3.2**: Toggling transparent on updates the hint copy and format footer (`WebM · VP9 Alpha · 30 fps`).
  - **R3.3**: `ProgressView` reflects VP9 alpha encoding in the 4-stage pipeline checklist.
  - **R3.4**: `ReadyView` names the file `.webm`, displays an `Alpha WebM` badge, and renders a checkerboard backdrop behind the inline `<video>` preview so transparency is immediately visible.

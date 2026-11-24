# Spec 47 — Design

## Container & MIME Derivation
- `RenderContainer = 'mp4' | 'webm'`, derived via `renderContainerFor({ transparent })` (`transparent === true ? 'webm' : 'mp4'`).
- `renderMimeType(container)` returns `'video/webm'` or `'video/mp4'`.
- `transparent` is optional on `RenderOptionsSchema`, `RenderDocSchema`, and `RenderStatusResponseSchema` and omitted when false so existing render docs, cache keys, and tests remain unchanged.

## Pipeline Flow (Transparent WebM)
1. **Compile**: `projectCompileInput` receives `background: 'transparent'`, `voiceSrc: 'assets/voice.wav'`, and optional `bedSrc`. `compileProject` omits `.mp-bg`, `#mp-backdrop`, `.mp-texture`, and `#mp-lens`.
2. **Produce**: `producer.render` runs with `container: 'webm'` and `outPath: workDir/video.webm`, producing VP9 (`yuva420p`) + Opus.
3. **Stock Layers (optional)**: `buildStockCompositeArgs` accepts `container?: 'mp4' | 'webm'`. In `webm` mode:
   - Prepends `['-c:v', 'libvpx-vp9']` before `-i baseVideoPath` so FFmpeg's decoder retains the alpha plane.
   - Outputs `format=yuva420p` with `-c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -crf 24 -b:v 0` when visual overlays are composited, or `-c:v copy` when only audio is mixed.
   - Mixes audio with `-c:a libopus -b:a 192k -ar 48000` (or `-c:a copy`), without `-movflags +faststart`.
4. **Loudness (-14 LUFS)**: `normalizeLoudness` checks `dest.endsWith('.webm')` and selects `-c:a libopus -b:a 192k` (omitting `-movflags +faststart`) while stream-copying the VP9 alpha video stream (`-c:v copy`).
5. **Probe & Thumbnail**: `ffmpeg.probe` decodes `.webm` with `-c:v libvpx-vp9` when counting frames so `pixFmt` and frame count are accurate; `ffmpeg.frame` decodes `.webm` with `-c:v libvpx-vp9` and applies `format=rgba,premultiply=inplace=1` so transparent pixels render cleanly into `thumb.jpg`.
6. **Upload & Serve**: Uploads `video.webm` with `contentType: 'video/webm'` and `contentDisposition(title, 'webm')`. Local file route (`/api/local-renders/[id]/file`), cloud download route (`/api/renders/[id]/download`), and emulator share stream route (`/api/shares/[shareId]/video`) all serve `video/webm` with byte-range support.

## UI Surface
- `SwitchRow` gains `disabledReason?: string` (matching `OptionCards`) for disabling transparent export on Reels without a `"Soon"` badge.
- `OptionsView` enables the switch for motion and video projects, updates hint + footer line (`WebM · VP9 Alpha · 30 fps`).
- `ReadyView` uses `.webm` filename, shows `Alpha WebM` metadata tag, and displays a subtle dark transparency checkerboard behind the inline `<video>` player.

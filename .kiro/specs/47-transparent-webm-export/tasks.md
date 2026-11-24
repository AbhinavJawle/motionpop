# Spec 47 — Tasks

- [x] **T1**: Extend `@motionpop/schemas` (`RenderContainerSchema`, `renderContainerFor`, `renderMimeType`, optional `transparent` on options/doc/status, `renderPaths(..., container)`).
- [x] **T2**: Update `@motionpop/render` (`headers.ts`, `ports.ts`, `store/firestore.ts`, `ffmpeg.ts`, `stock-ffmpeg.ts`, `run-render.ts`) for full alpha-preserving VP9 WebM encoding, stock compositing, loudness normalization, probing, thumbnail extraction, and upload metadata.
- [x] **T3**: Update `@motionpop/web` server handlers & routes (`render-key.ts`, `handlers.server.ts`, `local-handlers.server.ts`, `render-client.ts`, `/api/local-renders/[id]/file`, `/api/renders/[id]/download`, `/api/shares/[shareId]/video`).
- [x] **T4**: Wire Export Modal UI (`switch-row.tsx`, `options-view.tsx`, `progress-view.tsx`, `ready-view.tsx`, `export-controller.tsx`, `subtitles.ts`) for live Transparent WebM toggle, Reel disable guard, pipeline label, `.webm` filename, and checkerboard inline preview.
- [x] **T5**: Add unit, schema, FFmpeg integration, and UI tests covering transparent WebM end-to-end and verify `typecheck`, `lint`, and all package test suites pass.

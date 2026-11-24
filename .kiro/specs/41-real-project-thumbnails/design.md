# Design — Spec 41: Real Content Project Thumbnails

## Schema
- `VideoTrackSchema` (`packages/schemas/src/video.ts`): adds optional `posterUrl` (`data:image/jpeg;base64,...`, max 120 KB).
- `ProjectPreviewSchema` (`packages/schemas/src/project-doc.ts`): lightweight, strictly bounded preview descriptor attached optionally to `ProjectSummaryFieldsSchema` (and `CloudProjectDocSchema`).

## Preview Extraction
- `apps/web/lib/projects/preview.ts`: pure `buildProjectPreview(project)` and `buildProjectPreviewFromBody(body, styleId, title)` extracting real hero content from all 21 `ReelTemplate` variants, all 9 built motion-graphic scenes, photo assets, and spoken transcripts, plus look/reel palettes and first kept source timestamp.
- `apps/web/lib/projects/summary.ts` & `apps/web/lib/projects/cloud-docs.ts`: populate `preview` on both local `summarise()` and cloud `summaryFromDoc()` (backfilling from `bodyJson` for existing Firestore docs without `preview`).
- `apps/web/lib/pipeline/run.ts`: stores `probe.frames[0]` as `video.posterUrl` on new video uploads.

## Lazy Video Frame & Asset Cache
- `apps/web/lib/projects/video-thumb.ts`: `useVideoThumb` + `useAssetThumb` with in-memory Map + IndexedDB (`mp-project-thumbs`) persistence and a concurrency-2 `<video>`/`<canvas>` frame extractor reading blobs from `appAudioStore()`.

## UI Surfaces
- `ProjectPoster` (`apps/web/components/dashboard/project-poster.tsx`): replaces static `LOOK_STILLS` lookup with real video + reel split previews and live motion-graphic content cards (`sm` / `md` / `lg`).
- Wired into `ContinueCard`, `ProjectCard`, `ProjectRow`, editor `ProjectsPanelBody`, export `VideoStill` (for video/reel projects), and `WorkingSection` (face-centred crop + script excerpt).

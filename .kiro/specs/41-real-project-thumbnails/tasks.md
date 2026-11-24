# Tasks — Spec 41: Real Content Project Thumbnails

- [x] 1. Add optional `posterUrl` on `VideoTrackSchema` and `ProjectPreviewSchema` on `ProjectSummaryFieldsSchema`.
- [x] 2. Persist `video.posterUrl` from `probe.frames[0]` during video upload in `apps/web/lib/pipeline/run.ts`.
- [x] 3. Implement `apps/web/lib/projects/preview.ts` and wire into `summary.ts` and `cloud-docs.ts` (including `bodyJson` backfill for existing Firestore projects and accurate reel scene summary counts).
- [x] 4. Implement cached concurrency-limited browser extractor `apps/web/lib/projects/video-thumb.ts` (`useVideoThumb` + `useAssetThumb`).
- [x] 5. Rebuild `ProjectPoster` to render real video/reel split previews and real motion-graphic slot/transcript previews, and wire it into `ContinueCard`, `ProjectCard`, `ProjectRow`, editor `ProjectsPanelBody`, export `VideoStill`, and `WorkingSection`.
- [x] 6. Add unit & component tests, run typecheck, lint, Prettier, and Vitest, and log honestly in `DEV_LOG.md`.

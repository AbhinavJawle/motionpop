# Requirements — Spec 41: Real Content Project Thumbnails

## R1 — Content-authentic project previews everywhere
- **R1.1:** Project thumbnails across the Dashboard (Continue card, Grid cards, List rows), the Editor Projects panel, and the Export dialog SHALL reflect what is actually inside each project instead of rendering static `/looks/*.jpg` demo stills.
- **R1.2:** Video and talking-head Reel projects SHALL display a real keyframe extracted from the project's source video (face-centred cover crop, skipping leading silence cuts), paired on medium/large Reel cards with the project's actual opening graphic in its real reel theme palette.
- **R1.3:** Voiceover, script, and motion-graphic projects SHALL render a live miniature composition of the project's actual hero slot (number, headline, versus, chart, list, timeline, quote, map, photo asset, or opening spoken transcript) in the project's actual look palette and brand accent.

## R2 — Zero-migration compatibility for existing projects
- **R2.1:** Newly uploaded video projects SHALL persist a compact JPEG keyframe (`video.posterUrl`) at creation time.
- **R2.2:** Existing saved projects in IndexedDB or Firestore without `video.posterUrl` or stored `preview` SHALL still render real thumbnails automatically: `summaryFromDoc` SHALL derive `preview` from `bodyJson`, and a cached concurrency-limited browser frame extractor SHALL lazily capture and cache the real video frame from `appAudioStore()`.
- **R2.3:** Reel projects with directed scenes SHALL report ready status and scene progress ticks in `ProjectSummary` rather than showing as empty drafts.

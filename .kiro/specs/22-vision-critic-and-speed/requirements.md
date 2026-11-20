# Spec 22 — Multimodal Vision Critic Contact-Sheet QA & Speed Pass

## Problem

Our DOM critic (`packages/motion/src/film/critic.ts`) catches runtime errors, blank frames, off-frame text, overlap, and made-up numbers deterministically — **without looking at pixels**. Sometimes a beat passes every DOM bounding-box check yet still looks cramped, visually imbalanced, clashing with the live speaker face, or aesthetically weak.

Running a multimodal vision call on every beat individually would be slow and expensive. Instead, **Spec 22** introduces a single-call **Multimodal Vision Critic Contact-Sheet QA Pass** powered by `gemini-4-neon`, plus final speed tuning:

1. **Single-Call Contact-Sheet Vision Critic (`film.vision-critic`):**
   - Renders one crisp contact sheet image (up to 6 representative beats at their `keyMomentMs`, composited over their real studio background / sampled A-roll frame or clean preview canvas) in the browser using `<svg>`/`canvas` serialization or lightweight DOM-to-canvas snapshots.
   - Sends that **single** JPEG contact sheet + beat ids/stages/texts to `gemini-4-neon` (`thinking: 'LOW'`, clean hand-crafted JSON Schema).
   - Gemini inspects the actual rendered visuals and returns `{ pass: boolean, flagged: [{ beatId, severity: 'fix' | 'note', issue, suggestion }] }` — flagging only genuinely broken/ugly/cramped/unreadable beats (0 to 2 max).
   - For any `'fix'`-flagged beat, runs a targeted single-beat repair (`rebuildBeat`) without touching any of the clean beats!
2. **Speed & Throughput Optimization:**
   - `film.direct` runs at `thinking: 'LOW'` (already tuned in Spec 20, cutting storyboarding from ~84s to ~20–30s).
   - `makeFilm` parallel builder concurrency tuned to `6`, `maxRepairs: 1`, and vision QA strictly bounded to 1 single contact-sheet call + at most 2 targeted beat repairs (never blocking or failing a good film if canvas capture or vision call fails!).
3. **End-to-End Multi-Clip Live Verification:**
   - Verified end-to-end with real Chrome + live Firebase AI Logic (`gemini-4-neon`) uploading real spoken A-roll `.mp4` + real B-roll `.mp4` + real screen-recording `.mp4` + real screenshot `.png`, PLUS real FFmpeg multi-clip MP4 export producing a verified playable H.264/AAC MP4!

## Requirements

### R1 — `film.vision-critic` Multimodal Task (`@motionpop/ai`)
- R1.1: Create `packages/ai/src/prompts/film-vision-critic.v1.ts` and `packages/ai/src/tasks/film-vision-critic.ts` with clean hand-crafted JSON Schema (Vertex-safe), `model: cfg.modelStrong` (`gemini-4-neon`), `thinking: 'LOW'`, `mediaList` accepting 1 JPEG contact sheet, and returning `{ pass, summary, flagged: [{ beatId, severity, issue, fixHint }] }`.
- R1.2: Export `filmVisionCriticTask` and `critiqueContactSheet` from `packages/ai/src/index.ts` with deterministic unit tests in `packages/ai/src/tasks/film-vision-critic.test.ts`.

### R2 — Browser Contact-Sheet Renderer & Post-Build Targeted Polish (`apps/web`)
- R2.1: Build `apps/web/lib/film/vision-qa.ts`:
  - Renders a clean 2×3 or 3×2 JPEG contact sheet (1200px wide) showing each built beat's `keyMomentMs` visual composition (with beat ID badge `b1..bN`, stage label, and visual elements rendered cleanly onto canvas — zero CORS tainting, safe fallback if unavailable).
  - Calls `critiqueContactSheet(router, contactSheetBase64, beatMeta, { model })`.
  - Never throws or blocks film delivery: if vision QA finds 0 `'fix'` beats (or errors), returns immediately; if 1–2 beats are flagged `'fix'`, returns targeted repair instructions so `makeFilmForProject` can auto-polish just those beats via `rebuildBeat`!
- R2.2: Wire optional post-build Vision QA polish cleanly into `makeFilmForProject` (`apps/web/lib/film/film.ts`) with a safe 18s timeout guard so demo runs stay fast and reliable.

### R3 — Real Multi-Clip End-to-End Verification & Close-Out
- R3.1: Run real FFmpeg multi-clip export test (`split-top-broll` + `screen-showcase` + `broll-full` + `media-card-pop` + `full` using real synthetic B-roll `.mp4`, screen-recording `.mp4`, screenshot `.png`, and spoken A-roll `.mp4`) and verify valid H.264/AAC MP4 via `ffprobe`.
- R3.2: Run real Chrome E2E on `fbailogic26vrt-3068` + `gemini-4-neon` uploading A-roll + B-roll + screen recording + screenshot, verifying:
  - Media Bin ingestion & multimodal `media.index` on `gemini-4-neon`,
  - Auto-choreography generating multi-clip beats with 0 gaps,
  - Live dual-layer dancing preview (`preview-video-stage` + `preview-media-stage` + `<hyperframes-player>`),
  - Modern looks (`Creator Dark` / `Keynote Clean`) available,
  - 0 console/page errors.
- R3.3: Update `DEV_LOG.md` summarizing Specs 20, 21, and 22.

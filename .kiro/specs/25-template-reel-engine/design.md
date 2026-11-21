# Spec 25 — design

## Data
`ReelPlan` (`packages/schemas/src/reel.ts`): `{ v: 1, look, focus {x,y}, captions, hook?, scenes[] }`. A scene is `{ id, startMs, endMs, layout, bg?, tag?, content }` where `content` is a discriminated union over the template ids with short, length-capped text props and cue times (`at`). Stored on the editor project as `reel` (spec 25 task 5).

## Engine (`packages/motion/src/reel/`)
- `looks.ts` — tokens for `mono` and `cream` on a 720 × 1280 logical stage; `graphicArea(layout)`.
- `anim.ts` — eases, `prog`, the house blur-rise reveal.
- `dom.ts` — DOM/SVG builders, lucide icons with stroke draw-on.
- `templates.ts` — the template builders: `build → { el, mount?(), seek(t) }`.
- `captions.ts` — pure chunking + lookup.
- `mount.ts` — `mountReel(host, data, videos)`: builds every scene once (after fonts), then `seek(ms)` shows the active scene, frames the speaker video for the layout (cover + face focus, slow push-in), positions captions and the hook band.
- `hf-entry.ts` → `dist/reel-runtime.js` — mounts on `#reel-stage`, draws from `hf-seek`.
- `compile.ts` — `compileReel(input, assets)` → one HyperFrames `index.html`: fonts as data URLs, the stage scaled to the output size, one timed `<video data-has-audio>` per kept segment inside an untimed wrapper, `data-no-timeline` on the root.

## Pipeline (video uploads)
`runPipeline` sends every talking-head video upload down the reel path. The steps are:
1. Transcribe.
2. Build jump cuts from a tighter EDL: pauses over 500 ms keep 240 ms of air, and fillers are cut. The cuts are stored as `video.cuts`.
3. Re-time the words onto the cleaned timeline.
4. Run `directReel`: cloud when available, else `autoReelPlan`.
5. Save a 9:16 project with `reel`, no slots, and the slot captions off.

The old spec 18–24 video director (`video.direct`) and the stage choreography are not used for new uploads.

## Preview
`ReelPreview` (`apps/web/components/editor/reel-preview.tsx`) mounts the same `mountReel` into a 720 × 1280 div scaled to the frame, with a muted native `<video>`:
- The editor's cleaned voice stays the master clock. Every clock tick calls `seek(playheadMs)` and keeps the video on `cleanedToSourceMs(playheadMs)`.
- No iframe is needed, because the reel runs only our own code.
- Fonts come from `/api/composition/reel-fonts`, the same files the export inlines.

The toolbar shows the look (mono/cream, via `restyleReelPlan`), captions and Re-direct (☁ 3). Each one is a single undo step (`setReel*` commands).

## Export
When the snapshot has `reel` and `video`, `runRender`:
- downloads the source video into `composition/assets/speaker.<ext>`;
- compiles `compileReel` with one clip per kept segment, at the output size;
- skips the slot preflight and the FFmpeg composite, so the producer writes the MP4 directly (the voice comes from the clips' own audio).

Reels always export in 9:16. `exportAvailability` allows reels without slots.

## Director
`reel.direct` (`packages/ai`) gets the indexed words and returns scenes with word indices (`fromWord`, `toWord`, cue words); post-processing maps indices to ms, clamps text, tiles scenes and validates with `ReelPlanSchema`. `autoReelPlan` is the free deterministic fallback.

## Testing
Unit + property tests: caption chunking, `tileReelScenes` tiling (fast-check), compiler output. Visual QA with `scripts/reel-dev.ts sheet` (contact sheet) and `render` (MP4) against the reference reels.

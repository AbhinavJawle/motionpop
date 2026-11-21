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

## Preview
The editor mounts the same `mountReel` into a scaled div with a native `<video>`; a rAF loop calls `seek(video.currentTime)`. No iframe is needed: the reel runs only our own code.

## Director
`reel.direct` (`packages/ai`) gets the indexed words and returns scenes with word indices (`fromWord`, `toWord`, cue words); post-processing maps indices to ms, clamps text, tiles scenes and validates with `ReelPlanSchema`. `autoReelPlan` is the free deterministic fallback.

## Testing
Unit + property tests: caption chunking, `tileReelScenes` tiling (fast-check), compiler output. Visual QA with `scripts/reel-dev.ts sheet` (contact sheet) and `render` (MP4) against the reference reels.

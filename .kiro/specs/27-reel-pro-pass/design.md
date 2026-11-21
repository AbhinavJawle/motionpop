# Spec 27 design

## Transitions (R1.1), `packages/motion/src/reel/mount.ts` + `transition.ts`
- `TRANS_MS` window at each scene start (scene index > 0, not carried in place). During the window the previous view stays displayed and keeps seeking.
- Each scene host gets its background on its own child (`bgEl`) so the new host's background can fade while the old content shows through underneath.
- Kinds (pure, from the two layouts):
  - `push`: same graphic region. The old content rises out with blur and fade; the new background fades in.
  - `morph`: both scenes have a speaker box with different layouts. The box interpolates (`easeInOutCubic`) over `MORPH_MS`; the old panel slides away behind the growing video, and the new panel is revealed as the video lifts off it.
  - `reveal`: to or from `full` (no speaker box). The video fades out or in over the window; the full panel scales from 1.04 to 1.
  - `overlay`: speaker to speaker. The old overlay fades out quickly.
- The camera drift transform composes with the transition transform.

## Jump-cut punch-ins (R1.2), `punch.ts`
- `ReelData.cuts`: reel-time ms of each join between kept segments (compile: from `segments`; preview: from `keptSourceSegments`).
- `punchLevels(cuts)` → change points ≥ 700 ms apart; level alternates 0/1. Zoom ×1.0 / ×1.09 (speaker), ×1.0 / ×1.05 (split/card), applied hard on the cut.

## Footage awareness (R2), director + engine
- `ReelDirectInput.frames` (≤ 6 JPEG keyframes with `atMs` on the source clock, remapped to reel time) → `mediaList`.
- Output `footage { kind, faces[{frame, x, y}] }` → `plan.footage = { kind, focus[{atMs, x, y}] }`. `plan.focus` keeps the median for older readers.
- Engine: `focusAt(t)` interpolates the keys. `kind !== 'talking-head'` (or no faces) → contain-fit inside the box over the panel colour.

## Music (R3), `packages/ai/src/music.ts` + `/api/reel/music`
- The director's `music` brief → POST `/api/reel/music` → server calls the music model (Vertex `lyria-002`, ADC), zod-validates, decodes WAV, loops with a crossfade to the reel length (server, pure PCM helper), and returns a 44.1 kHz stereo WAV.
- The client stores it with the audio store (`kind: 'music'`) as `project.reel.music = { brief, src }`. Preview: `useReelBedUrl` mixes it ducked under the voice. Export: `prepareReelBed` downloads and mixes it the same way (`mixBed` with ducking).
- Failure → no `src` → the synth bed.

## Loudness (R3.3)
The render's final audio passes through ffmpeg `loudnorm=I=-14:TP=-1:LRA=11` (two-pass when measurable). The preview applies the same gain offset measured on the voice.

## Testing
- Unit and property tests: `punchLevels` (alternation, min gap), transition kind table, the `focusAt` interpolation stays in [0, 1], the loop/crossfade length is exact, director mapping of footage and music.
- Lab: contact sheets and full renders on portrait and landscape footage.
- App: a headless Chrome run through upload → export.

# Requirements: 00 walking skeleton

## Introduction
The thinnest end-to-end path, ugly on purpose, that resolves every big technical unknown before the real product is built: browser transcription, the AI router with hybrid inference, our motion core driving HyperFrames through `hf-seek` (no GSAP), local MP4 render with the producer, and an on-device quick edit. Lands by **Mon Nov 16, 2026**.

Lives on a dev-only route `/dev/skeleton`. Nothing here needs to match the designs.

## R1 Word timings in the browser
**User story:** As the developer, I want word-level timings from an uploaded voiceover, so I know browser Whisper is viable.
1. WHEN a 15–30 s MP3/WAV/M4A is selected on `/dev/skeleton` THE SYSTEM SHALL transcribe it in a Web Worker with transformers.js Whisper and list every word with `startMs` and `endMs` (integers).
2. WHILE transcription runs THE SYSTEM SHALL show model download and transcription progress and keep the page responsive.
3. IF WebGPU is unavailable THEN THE SYSTEM SHALL fall back to WASM and say which backend ran.
4. THE SYSTEM SHALL validate the worker output with the `Transcript` zod schema.

## R2 Slot suggestions through the AI router
**User story:** As the developer, I want `slots.detect` to run through `packages/ai`, so I know the router and Nano work.
1. WHEN timings exist and the developer clicks "Detect" THE SYSTEM SHALL call `run("slots.detect", input)` and show 1–4 suggestions as JSON.
2. THE SYSTEM SHALL show `ranOn` (device | cloud), `model` and `latencyMs` for the call.
3. IF the model output fails zod validation THEN THE SYSTEM SHALL repair once and otherwise fall back to cloud.
4. WHEN on-device inference is unavailable THE SYSTEM SHALL say so and use the cloud.

## R3 Motion core drives HyperFrames
**User story:** As the developer, I want one of our components to play inside `<hyperframes-player>` driven by `hf-seek`, so I know preview works without GSAP.
1. THE SYSTEM SHALL compile a one-slot project (the `big-number` component with params from R2 or defaults) plus the voiceover into a HyperFrames composition HTML.
2. WHEN the player seeks or plays THE SYSTEM SHALL render each frame by calling `composition.seek(tMs)` from an `hf-seek` listener.
3. THE SYSTEM SHALL keep the voiceover and graphics in sync within one frame during playback.
4. THE SYSTEM SHALL contain no GSAP code or dependency.

## R4 Local MP4 render
**User story:** As the developer, I want the same composition rendered to MP4, so I know preview/render parity holds.
1. WHEN `pnpm --filter @motionpop/render skeleton` runs with a composition directory THE SYSTEM SHALL produce a 1280×720, 30 fps H.264 MP4 with the voiceover, using `@hyperframes/producer`.
2. THE SYSTEM SHALL produce stills at 0 %, the key moment and 90 % that match the preview at the same times (visual check, then an automated pixel diff later in spec 08).

## R5 On-device quick edit
**User story:** As the developer, I want a quick edit to become a JSON patch on-device, so I know the hybrid showcase works.
1. WHEN the developer types an instruction ("slower", "change 40 to 45") THE SYSTEM SHALL call `run("edit.patch", …)` with PREFER_ON_DEVICE and get an RFC 6902 patch.
2. THE SYSTEM SHALL apply the patch to a copy, validate it with the component schema, and re-render the preview.
3. THE SYSTEM SHALL show where the call ran (`⚡ device` or `☁ cloud`).
4. IF the patch is invalid THEN THE SYSTEM SHALL repair once, then fall back to cloud.

## R6 Measurements and decisions
1. THE SYSTEM SHALL log timings for transcribe, detect, compile, render and edit to the console.
2. THE SYSTEM SHALL record the spike outcome (HyperFrames via hf-seek: confirmed or fallback) in `docs/decisions.md` (D-009) and the measurements in `DEV_LOG.md`.

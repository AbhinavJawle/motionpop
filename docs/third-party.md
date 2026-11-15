# Third-party resources and pre-existing work (disclosure)

Both hackathons require disclosure of pre-existing code and third-party resources. Keep this list current.

## Pre-existing work
- None of the application code existed before the submission periods. Planning documents (product spec, steering drafts, spec drafts) were written with AI assistance (Claude) between Nov 11–14, 2026. The locked plan is `docs/plan.md`.
- Designs: generated with Figma AI from our prompts (Nov 14, 2026) and refined by us; exports in `/design`.
- Motion references: some components are informed by reference animations generated with large language models outside the product; adopted timings/eases/layout ratios are noted per component README.

## Libraries (fill with versions)
| Library | Licence | Use |
|---|---|---|
| Next.js 16, React 19 | MIT | app |
| Tailwind CSS 4, shadcn/ui, Radix, lucide | MIT / ISC | UI |
| motion | MIT | UI animation and Pip (never in rendered video) |
| Firebase JS SDK, firebase-admin | Apache-2.0 | backend + AI Logic |
| zod, zustand, immer, fast-json-patch | MIT | state/validation |
| Geist + Geist Mono variable woff2 (bundled in `packages/motion/src/fonts`, embedded in compositions) | SIL OFL 1.1 (`OFL-Geist.txt`) | identical type in preview and render |
| `@huggingface/transformers` 4.3.2 (+ onnxruntime-web) | Apache-2.0 (onnxruntime: MIT) | on-device transcription in a Web Worker |
| Whisper base weights, ONNX export `onnx-community/whisper-base_timestamped` (from `openai/whisper-base`) | Apache-2.0 (upstream model card; the ONNX export lists no separate licence) | word-timed transcription, downloaded at runtime from the Hugging Face hub |
| d3-geo, topojson-client | ISC/BSD | maps |
| roughjs 4.6.6 | MIT | hand-drawn marks in looks (marker circle, underline). Always called with a non-zero seed: without one it uses `Math.random` |
| perfect-freehand 1.2.3 | MIT | highlighter stroke outline |
| Caveat variable woff2, latin subset, from `@fontsource-variable/caveat` 5.3.0 (bundled in `packages/motion/src/fonts`) | SIL OFL 1.1 (`OFL-Caveat.txt`) | handwriting font of the `field-notes` look |
| Natural Earth data | Public domain | map shapes |
| HyperFrames (`@hyperframes/player`, `producer`, `lint`, `gcp-cloud-run`) | Apache-2.0 | preview + rendering (brings Puppeteer/Chrome and FFmpeg) |
| fast-check, vitest, playwright | MIT / Apache-2.0 | tests |

Not used: GSAP (licence excludes no-code animation tools), Remotion, Rive, ElevenLabs.

## Ideas and agent skills
- VideoHub (MIT): render-worker, frame-notes, preview-clock and synthesized-SFX ideas re-implemented in our own code; no code copied.
- HyperFrames agent skills (Apache-2.0) and Firebase agent skills (Apache-2.0) in `.claude/skills/` and `.kiro/skills/`: used by coding agents at dev time only, not shipped.

## Fonts
Geist, Geist Mono (OFL), Inter (OFL), Fraunces (OFL) — self-hosted.

## Media
- SFX: synthesized in code. Music: only own recordings or CC0 (source + licence listed here).
- Stock images/video (Media panel): Openverse (CC0/CC-BY only, attribution stored), Pexels (Pexels licence).

## AI services
Firebase AI Logic (Gemini Nano on-device, Gemini cloud, Gemini TTS). Claude API for tier-2 custom compositions only if organisers permit (D-010). Whisper (transformers.js) runs in the browser.

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
| Firebase JS SDK, firebase-admin | Apache-2.0 | backend, Auth, Firestore, Storage, Remote Config, App Check, AI Logic |
| `dodopayments` | Apache-2.0 | server-side Merchant-of-Record checkout sessions and Standard Webhooks verification |
| zod, zustand, immer, fast-json-patch | MIT | state/validation |
| Geist + Geist Mono variable woff2 (bundled in `packages/motion/src/fonts`, embedded in compositions) | SIL OFL 1.1 (`OFL-Geist.txt`) | identical type in preview and render |
| `@huggingface/transformers` 4.3.2 (+ onnxruntime-web) | Apache-2.0 (onnxruntime: MIT) | on-device transcription in a Web Worker |
| Whisper base weights, ONNX export `onnx-community/whisper-base_timestamped` (from `openai/whisper-base`) | Apache-2.0 (upstream model card; the ONNX export lists no separate licence) | word-timed transcription, downloaded at runtime from the Hugging Face hub |
| d3-geo 3.1.1, topojson-client 3.1.0 | ISC | map-zoom scene: projection and paths (`packages/motion/src/scenes/map-zoom`) |
| world-atlas 2.0.2 (`countries-110m.json`), from Natural Earth 1:110m admin-0 | ISC (package); Natural Earth data is public domain | country shapes bundled into the composition runtime |
| roughjs 4.6.6 | MIT | hand-drawn marks in looks (marker circle, underline). Always called with a non-zero seed: without one it uses `Math.random` |
| perfect-freehand 1.2.3 | MIT | highlighter stroke outline |
| Lucide icons (144 shapes copied from `lucide-react` 1.73.0 by `packages/motion/scripts/build-icons.ts` into `src/film/icons.generated.ts`) | ISC | the film kit's `mp.icon`: outline pictograms inside generated graphics |
| Caveat variable woff2, latin subset, from `@fontsource-variable/caveat` 5.3.0 (bundled in `packages/motion/src/fonts`) | SIL OFL 1.1 (`OFL-Caveat.txt`) | handwriting font of the `field-notes` look |
| Fraunces, Space Grotesk, Bricolage Grotesque, Playfair Display variable woff2, latin subset, from `@fontsource-variable/*` 5.3.0 (bundled in `packages/motion/src/fonts`, copies in `apps/web/public/fonts` for the panel previews) | SIL OFL 1.1 (`OFL-fraunces.txt`, `OFL-spacegrotesk.txt`, `OFL-bricolagegrotesque.txt`, `OFL-playfairdisplay.txt`) | Fonts panel choices |
| Inter, Newsreader (variable), Playfair Display Italic (variable), Instrument Serif Italic woff2, latin subset from google/fonts (bundled in `packages/motion/src/reel/fonts`, embedded in reel compositions) | SIL OFL 1.1 (`OFL-inter.txt`, `OFL-newsreader.txt`, `OFL-playfairdisplay.txt`, `OFL-instrumentserif.txt`) | reel looks (spec 25) |
| Bebas Neue and Patrick Hand woff2, latin subset, from Google Fonts (bundled in `apps/web/components/landing/fonts`) | SIL OFL 1.1 | marketing-site display and speech-bubble faces (spec 34) |
| Openverse API (`api.openverse.org`), photo search in the Media panel | API terms; each photo CC0 or CC BY, attribution stored with the asset | free photos for scenes |
| Pixabay API, Pexels API, Wikimedia Commons API | Pixabay Content License / Pexels License / CC0 & CC-BY | royalty-free stock B-roll & photos in Media panel and Reel Engine |
| Simple Icons CDN (`cdn.simpleicons.org`) | CC0 1.0 | brand/tool vector marks for reel logo slots (SVG script-stripped) |
| Uncommon Ear API (`uncommonear.com`) | CC0 / CC-BY (attribution stored) | royalty-free music & SFX search in Audio panel |
| NASA Blue Marble (land and oceans, via Wikimedia Commons, 24000 x 12000 scaled to 8192 x 4096) in `packages/motion/assets/maps/satellite-8k.webp` | Public domain (NASA) | satellite globe in map scenes |
| NASA Earth's City Lights (DMSP 1994-1995, via Wikimedia Commons, scaled to 4096 x 2048) in `packages/motion/assets/maps/night-4k.webp` | Public domain (NASA) | night globe in map scenes |
| Natural Earth I shaded relief with hypsometric tints, 1:50m, and Gray Earth shaded relief, 1:50m (scaled to 8192 x 4096) in `packages/motion/assets/maps/relief-8k.webp`, `gray-8k.webp` | Public domain (Natural Earth) | terrain and paper globes in map scenes |
| world-atlas `countries-50m.json`, `land-50m.json` (Natural Earth 1:50m) | ISC package, public-domain data | close-up borders and the paper map's land mask |
| HyperFrames (`@hyperframes/player`, `producer`, `lint`, `gcp-cloud-run`) | Apache-2.0 | preview + rendering (brings Puppeteer/Chrome and FFmpeg) |
| Rive CLI (`rive.app/cli`) | Rive CLI terms | authoring tool used to compile and export Pip mascot animations (`apps/web/rive/` → `apps/web/public/pip/*.webm`, `*.webp`) |
| fast-check, vitest, playwright | MIT / Apache-2.0 | tests |

Not used: GSAP (licence excludes no-code animation tools), Remotion, ElevenLabs.

## Ideas and agent skills
- VideoHub (MIT): render-worker, frame-notes, preview-clock and synthesized-SFX ideas re-implemented in our own code; no code copied.
- HyperFrames agent skills (Apache-2.0) and Firebase agent skills (Apache-2.0) in `.claude/skills/` and `.kiro/skills/`: used by coding agents at dev time only, not shipped.

## Fonts
Geist, Geist Mono (OFL), Inter (OFL), Fraunces (OFL) — self-hosted.

## Media
- SFX: synthesized in code. Music: only own recordings or CC0 (source + licence listed here).
- Stock images/video (Media panel): Openverse (CC0/CC-BY only, attribution stored), Pexels (Pexels licence), Pixabay (Pixabay Content License).
- Marketing-page reel showcase stills (`apps/web/public/landing/reel-*.jpg`, `editor-reel.jpg`): compiled with Motionpop's reel engine over Pixabay Content License photos by `radu_floryn22` (#4494498), `danielchrisman` (#8683196), `Sdbtyyy` (#10570499), and `binmassam` (#4807268).

## AI services & payments
Firebase AI Logic (Chrome Gemini Nano on-device, Gemini 4 Neon, Gemini 3.5 Flash-Lite, Gemini 3.8 Flash TTS, Gemini Nano Banana 2.1 image generation), Vertex AI (`lyria-002` instrumental music generation), optional Claude API for tier-2 custom compositions via Remote Config (D-010), optional browser-local Google AI Studio BYOK, and local Whisper (`transformers.js`) in a browser Web Worker. Credit pack purchases are processed via Dodo Payments (Merchant of Record).

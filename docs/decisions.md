# Decision log

Format: `D-NNN · date · status (decided/open/superseded)` — context, options, decision, reason, consequences.

## D-001 · 2026-11-13 · decided — Product
Motionpop: transcript-first AI motion graphics editor; graphics follow the voiceover. Rejected: AI animated story shorts for app marketing (needs heavy human direction per video; buyers won't give input), a generic AI video generator without a wedge.

## D-002 · 2026-11-13 · decided — Quality strategy
Library-first (tier 1): hand-crafted components + style packs filled by AI with JSON params. Custom AI-written compositions (tier 2) only as an option. Reason: consistent premium quality, seconds-fast, cheap models suffice.

## D-003 · 2026-11-14 · decided — Runtime AI on Firebase AI Logic
Gemini Nano on-device (Chrome) + Gemini cloud via Firebase AI Logic for all runtime AI in the Firebase entry. Claude only for tier-2 if organisers confirm (open: D-010). Reason: #BuildHybridAI rules; hybrid also solves cost (free instant edits).

## D-004 · 2026-11-14 · decided — Hosting on Google
Firebase (Auth, Firestore, Storage, Remote Config, App Check, App Hosting) + Cloud Run for rendering. No AWS services. Reason: one cloud, required Firebase products.

## D-005 · 2026-11-14 · decided — Own motion core, no GSAP in product
GSAP's free licence restricts use in no-code visual animation tools competing with Webflow. We build a small deterministic motion core (or MIT library). GSAP allowed only in throwaway prototypes/model tests.

## D-006 · 2026-11-14 · decided — Time units
Integers in milliseconds as source of truth; frames derived at render (fps 30).

## D-007 · 2026-11-14 · decided — No creator/brand names
Style packs and copy use descriptive names only (both rulebooks forbid third-party trademarks).

## D-008 · 2026-11-14 · decided — Category
Kiroween: Frankenstein. Firebase: Web/Chrome platform.

## D-009 · 2026-11-14 · decided (spike confirmed) — Render engine: HyperFrames via hf-seek
HyperFrames (`@hyperframes/player` for preview, `@hyperframes/producer` for render, `@hyperframes/gcp-cloud-run` as the long-video upgrade). Our motion core draws each frame from an `hf-seek` listener, so no GSAP ships. Rejected: Remotion (company licence), our own Puppeteer + FFmpeg loop (rebuilds what HyperFrames already does).

**Spike (Nov 14, HyperFrames 0.9.46, Chrome 155 headless):** a plain-DOM composition (count-up to 40 % landing at 2.0 s, beep in the audio at 2.0 s), no timeline registered.
- Producer: 4 s 1280×720 30 fps clip rendered in 8.4 s (draft, 1 worker). Frames exact (36 % at 1.0 s = outExpo, 40 % at 2.0 s), clips hidden outside `[data-start, +duration)`, beep at 2.0004 s in the muxed AAC.
- Player: seeks exact; during playback `hf-seek` fires every frame and our time tracks `currentTime` within ~2 ms.
- **Gotcha:** the player only auto-injects the runtime for compositions with GSAP timelines or nested scenes. A pure `hf-seek` composition must include the runtime itself: the compiler embeds `@hyperframes/core/dist/hyperframe.runtime.iife.js` from the pinned package (never the CDN). The producer works the same with it embedded.

## D-010 · 2026-11-14 · decided — Tier-2 provider
The founder confirmed Claude is allowed in both builds and is the frontier model for tier-2 custom graphics (server route, key in Secret Manager). Gemini stays available behind the `custom_provider` flag.

## D-011 · 2026-11-14 · decided — TTS: Gemini TTS via Firebase AI Logic
Gemini TTS through AI Logic, so all runtime AI stays on Firebase. No ElevenLabs. Model: `gemini-3.8-flash-tts` (the preview model this first named is being shut down, see D-026).

## D-012 · open — Cloud transcription fallback
Gemini audio understanding with timestamps vs dedicated speech API. Measure word-timing accuracy on fixtures.

## D-013 · 2026-11-14 · decided — Region: us-central1
Cloud Run, Storage and Firestore in us-central1 (most judges are in the US).

## D-014 · 2026-11-14 · decided — Designs are the source of truth
`design/screens/*.png` + `design/figma-export.css` win over any doc. Consequences: Generate = 3 credits, 1080p export = 5, generating state replaces the inspector, 5 style packs.

## D-015 · 2026-11-14 · decided — Pip in SVG + Motion
The mascot is hand-built SVG animated with `motion` (UI layer only). No Rive.

## D-016 · 2026-11-14 · decided — Synthesized SFX
Whooshes, pops and ticks are generated in code (Web Audio / OfflineAudioContext). No sample libraries to license.

## D-017 · 2026-11-14 · decided — Kiro path
Kiro CLI headless runs with custom agents (`.kiro/agents/`), hooks, MCP, steering and specs execute real tasks. Every run is logged in `KIRO_LOG.md` from its own output.

## D-018 · 2026-11-14 · decided — Auto-fill on-device
After processing, slots are pre-filled with Gemini Nano (free, on-device); cloud Generate is an explicit 3-credit upgrade.

## D-019 · 2026-11-14 · decided — Credits
Free plan = 20 credits. Judge/test accounts get more through Remote Config.

## D-020 · 2026-11-14 · decided — Auth
Firebase Auth with Google and email/password.

## D-021 · 2026-11-14 · decided — Player sandbox mode
`<hyperframes-player>` defaults to `sandbox="allow-scripts allow-same-origin"` (trusted mode; the player README says it is not an isolation boundary). Compositions built only from our library components and zod-validated params use the default, because the editor needs DOM access (frame-note crops, mobile audio hand-off). Any composition containing tier-2 generated code uses `sandbox-origin="opaque"` (no same-origin). Open item for spec 15: an opaque iframe can't read the parent's `blob:` voice URL, so tier-2 preview needs a data URL or a message bridge for audio.

## D-022 · 2026-11-14 · decided — On-device transcription model
transformers.js 4.3.2 + `onnx-community/whisper-base_timestamped` (the `_timestamped` export includes the cross-attentions word timing needs). WebGPU with fp32 encoder + q4 merged decoder; WASM fallback with q8. Measured on headless Chrome (M-series Mac, WebGPU, cold cache): model load ~80–87 s, transcription of 4.8 s of speech ~1.7–1.9 s. The load is a one-time download cached by the browser; the UI must show progress and offer cloud transcription while it downloads.

## D-023 · 2026-11-14 · decided — Motion engine contract after Kiro review
Two Kiro review runs of spec 03 (`.kiro/specs/03-motion-engine/review-run5.md`, `review.md`) changed the contract: components render on a transparent root (the compiler owns background, texture and a transparent mode for WebM overlays); the camera push-in is applied by the runtime to a `.mp-cam` wrapper from `style.motion.camera.pushIn`; `BuildContext.warn` and `__motionpop.{errors,warnings}` carry non-fatal and fatal problems; `data-text` / `data-focal` / `data-on` are the hooks motion:check reads; fonts are bundled variable Geist/Geist Mono, explicitly loaded with `document.fonts.load` and an unbundled family fails compilation; the grain/paper texture is a pre-generated seeded PNG tile, not SVG turbulence; accents on text use a highlight swipe behind ink text, never accent-coloured text on `bg` (contrast); parity moves to `services/render`. Brand-kit merging is deferred to spec 14.

## D-024 · 2026-11-14 · decided — Audio pipeline order and cleaned audio format
Processing transcribes before it cleans, because filler removal needs the words. `screens.md` lists "Cleaning audio" first; the Processing screen shows Transcribing → Cleaning audio → Finding moments → Suggesting graphics instead. Whisper runs once on the original audio, and words are re-timed through the edit decision list, so cleaning never needs a second transcription and can be turned off later. Cleaned audio is mono 24 kHz 16-bit WAV (speech is lossless at 24 kHz, and 3 minutes is about 8.6 MB), rendered with OfflineAudioContext and 10 ms equal-power crossfades whose centres sit exactly on the mapped times. The original file is always kept. Until the founder records a sample, "Try a sample" uses the synthesized demo voice with the fixture transcript, labelled "Sample transcript" (no claim of speech recognition).

## D-025 · 2026-11-14 · decided — AI Logic backend: Agent Platform, global endpoint
Linking billing (Blaze) moves the Gemini Developer API to its paid tier, which needs prepaid credits (minimum $5); the first live call returned 429 "prepayment credits are depleted". AI Logic's Agent Platform (Vertex) backend bills per call on the Blaze account with no prepay, which keeps spend at a few cents for our volume. Current Gemini models are only served from the `global` location (us-central1 returns 404, checked 2026-11-14), so AI calls use `global` while everything else stays in us-central1. `NEXT_PUBLIC_AI_BACKEND=google` switches back to the Gemini Developer API. App Check is enforced on AI Logic (`firebaseml.googleapis.com`), Firestore and Storage, with limited-use tokens for AI calls; local development uses a registered debug token from `.env.local`.

## D-026 · 2026-11-14 · decided — Model defaults
The AI Logic models page (checked 2026-11-14) lists `gemini-3.1-flash-tts-preview` as shutting down on Nov 17, 2026, so TTS uses `gemini-3.8-flash-tts`. Defaults: fast `gemini-3.5-flash-lite`, strong `gemini-3.8-flash` (plans, long slot detection), TTS `gemini-3.8-flash-tts`. `gemini-4-carbon` is available for heavier reasoning through Remote Config. All four answered live on the global endpoint.

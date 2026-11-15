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

**Re-checked 2026-11-15:** the motion-engine research (`docs/research/motion-engine-research.md`, section 5) reaches the same choice on licence grounds: HyperFrames is Apache-2.0 with no team-size or per-render terms, while Remotion needs a paid licence for companies of four or more. The founder confirmed HyperFrames unless a spike finds a blocker. The Nov 14 spike above found none, so D-009 stands.

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

## D-027 · 2026-11-15 · decided — AI router behaviour
- **Typed tasks:** `run(task, input)` takes a task definition, not a string id, so inputs and outputs are typed from their zod schemas.
- **No surprise spend:** cloud escalation after a failed device answer is opt-in per task. `edit.patch` opts in (1 credit, as ai-tasks.md says); `slots.detect` and auto-fill don't, and fall back to deterministic code instead.
- **Semantic checks:** a task can add a `check` after the schema parse (`edit.patch`: the patch applies and the component params stay valid). A failing check is treated as an invalid answer, and its message drives the one repair.
- **Thinking levels per task:** on the demo, `slots.detect` took 12 s with the model's default thinking and about 3 s with `LOW`, with the same result. Extraction tasks use `LOW` or `MINIMAL`; plans can use more later.
- **Kill switch:** cloud-only tasks stop; every other task is pinned to the device.
- **Prompts:** versioned `.ts` string modules rather than `.md`, so Next, Vitest and Cloud Run need no loader.
- **Usage events:** in memory for now. Writing them to Firestore needs a server route (spec 13), because the rules block client writes.

## D-028 · 2026-11-15 · decided — Scene engine and looks: the AI scores, the engine animates
- **Decision:** spec 07 becomes "scene engine and looks". At run time a cheap model writes a small, enum-heavy JSON score per slot (scene, variant, content, beat anchors, image subjects). All craft (layout, timing, easing, materials, camera, decorations, sound cues) is authored in scenes and looks. Deterministic checks gate the result. Free-form generation (spec 15) is the escape hatch.
- **Why:** the founder wants excellent, dynamic results every time, in seconds, from a cheap model. Evidence that unconstrained generation is unreliable: MoVer (arXiv 2502.13372, https://www.arxiv.org/pdf/2502.13372) reports 58.8 % of test prompts correct without its correction loop. A 90 % / 20 % figure quoted in the first draft is dropped, because I had only seen it in a search summary of a secondary write-up.
- **Looks:** original names only (`field-notes`, `paper-collage`, `ink-essay`, `bright-science`, `launch-day`, plus the designed packs). `field-notes` and `paper-collage` get full polish first.
- **Motion principles changed:** rule 6 allows purposeful secondary motion around one focal point; rule 14 bans meaningless loops rather than all secondary motion; new rule 16 (read time) and rule 17 (beats follow a four-step energy setting, calm to hype).
- **Images:** Gemini image model through Firebase AI Logic, cloud only, route and cost shown first, at most 6 per video. Price on Google's pricing page (https://aistudio.google.com/docs/pricing, read 2026-11-15): $0.0336 per 1K image for `gemini-nano-banana-2.1`. That is the Gemini Developer API list; the Agent Platform price is unconfirmed until the first bill. Every scene has an image-free form. Previews use placeholders; final renders wait for every image to settle.
- **Scope by Nov 30:** engine, 6 scenes, 2 polished looks, images, with export (spec 08) and the hybrid path working.

## D-029 · 2026-11-15 · decided — Research additions to the scene engine
Source: `docs/research/motion-engine-research.md` (research run outside this repo's sessions, with two small experiments kept in `docs/research/experiments/`). Its figures are its own claims; each task re-checks what it depends on.
- **Adopted for Nov 30:** an on-device prosody module (the AI decides what matters, the audio refines when and how hard); gate reports that name the actor and rule, with at most 2 repair rounds, then a safe default; a hand-approved example library with code retrieval; schema rules in `ai-tasks.md`; the read-hold rule for juice (only slow, non-covering motion while text is being read); a small eval harness.
- **Cutout spike:** BiRefNet is a candidate, with a check of the weights' licence, not only the code's. RMBG-2.0 (CC-BY-NC) and RMBG-1.4 are excluded.
- **After Nov 30:** style-reference images per look (earlier only if the spike shows drift), a larger eval set with a calibrated model judge, offline prompt optimisation. A fine-tuned small model is post-hackathon.
- **Not adopted for now:** several candidate plans scored by code. The enforcer and fallback already bound the plan.
- **Pitch rule:** no retention numbers from marketing blogs. The energy setting is the answer, calibrated with our own tests.
- **Evidence limits:** the prosody experiment used a synthetic voice (6 of 6 pauses, 3 of 4 stressed words, one false hit). Real recordings are untested until the end-to-end task.

## D-030 · 2026-11-15 · decided (spike) — Cutouts by colour keying; no segmentation model; no reference images yet
Spec 07 task 1. 22 test images (about $0.90 at list price), evidence in `docs/research/experiments/cutout-spike/`. Subjects: curly hair, a glass bottle, bicycle spokes, a white mug, in three look recipes.
- **Chosen pipeline:** the prompt asks for a flat chroma-green backdrop; the cutout estimates the key colour from the border, builds a soft matte, **unmixes the backdrop out of edge pixels**, then despills. 11 of 12 were clean at 100 % on light and dark surfaces, including hair and spokes; the twelfth was the green-tinted mug below. About 50–150 ms per 1K image in the NumPy prototype.
- **What the spike changed:**
  - The model does not paint exactly #00FF00 (it ranged from (8, 237, 5) to (60, 174, 57), duller in desaturated looks), so the key colour is always estimated, never assumed.
  - Head-and-shoulders subjects touch the bottom edge, so the border estimate must be robust (use the border pixels that agree, and require 55 % agreement).
  - Clamping the green channel alone left an olive halo on fine hair. Unmixing fixed it.
  - A white mug came out green-tinted: the model lights the subject with the backdrop. Despill could not fix it. Adding one prompt line ("lit only by neutral white light, no green tint or reflection on the subject") did.
- **Rejected:**
  - **BiRefNet lite** as a matte on these images: a magenta halo on hair and broken bicycle spokes, so worse than keying on both hard cases. It also costs a 114 MB (fp16) or 224 MB (fp32) download, not the 47 MB the research file quoted, and took over a minute per image on CPU in Node (browser WebGPU not measured). Licence check: the weights repositories (`ZhengPeng7/BiRefNet_lite`, `onnx-community/BiRefNet_lite-ONNX`) are tagged MIT; the weights were trained on DIS5K, whose terms, as reported by a web search I could not confirm against the PDF, ask commercial users to sign separate terms. Unresolved, and moot while it is not used. It may return later for user uploads on non-uniform backgrounds.
  - **A second "same subject on white" edit pass:** it kept the green tint and fringe and costs another image.
- **Style locking:** the text recipe alone held the `paper-collage` look across 6 subjects (the model even drew the cut-out paper border). Two reference images made the palette slightly more uniform; `gemini-3.1-flash-image` looked no better than `gemini-nano-banana-2.1` at twice the price. Reference images stay after Nov 30 (task 32).
- **Measured on our backend:** 1,120 image output tokens per 1K image, as the pricing page says, plus about 900–1,100 thinking tokens per call. At list prices that is roughly $0.04 per image, not $0.034. One call takes 12–18 s. **Rate limit:** 6 parallel calls returned 429 for 4 of 12, and 2 parallel still hit some. Generation must be sequential with backoff, so 6 images take about 1.5–3 minutes.
- **Not checked:** the Agent Platform price list (only the token counts), and browser timings.


# Decision log

Format: `D-NNN · date · status (decided/open/superseded)` — context, options, decision, reason, consequences.

**Reserved ids (parallel spec runs).** D-034: spec 08. D-035 to D-049: spec 09. D-050 to D-064: spec 13. D-065: spec 11. D-066: spec 10. D-067: spec 12. Take the next free number above D-067 for anything else, and check this line first.

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

## D-031 · 2026-11-15 · decided — Read time protects text and limits juice; it does not delay content
`motion:check` on the first scene (`stat-punch`) showed that my first beat scheduler was wrong in two ways. It made every cue wait for the previous text's whole read time, so a context line pushed the number more than a second past its spoken word, and at the scene's ideal length the label no longer fit and was dropped. It also let the exit start before a late spoken word landed.
- **Rule now:** (1) a cue anchored to a spoken word lands on it; (2) landed text is never moved or covered during its read time and stays on screen at least that long; (3) a cue with no word to hit follows the previous landing by 150 ms; (4) only engine-added juice and the camera are restricted during read time (slow, non-covering, camera within 3 %).
- **Why this is the intended rule:** the founder asked that text stay still long enough to be read, and the research rule is about juice. "Nothing else may move anywhere" was my own extension in R5.1b; it contradicted voice sync (principle 13) and overlap (principle 3), and made scenes slow and linear.
- **Also:** a late spoken word shortens the exit (to 60 ms at least) instead of losing its landing.
- R5.1b, motion principle 16 and the design are corrected. Two of Kiro's run 32 properties were updated to the new rule, with a note in the test file.

## D-032 · 2026-11-15 · decided (Kiro IDE) — Scenes in detection; the director plans variants and energy
Spec 07 task 27, written in a Kiro IDE session (Opus 5.5).
- **Detection offers scenes.** `stat-punch` replaces `big-number` and `hook-statement` replaces `kinetic-headline` for new detections only. The old components stay registered, so saved projects render unchanged (R1.5). Code writes scene params from the words: a stat-punch from the tagger's number (ready), a hook-statement from the spoken sentence (a draft that stays suggested for auto-fill). The model never writes scene params in `slots.detect`, and a stat-punch with no tagged number is dropped.
- **The safe default never shows example content.** `safeScore` falls back to a scene's `defaultContent` ("40 %, Revenue growth since 2020") when the words give nothing. The app uses `safeScoreFromWords` instead, and the slot stays suggested when the words give nothing. Rule: a viewer never sees a number or a line the narrator didn't say.
- **Post-pass rules for anchored scenes.** Beats are rebased when a slot's first word moves. A scene with beats grows towards its ideal at the end only, because an earlier start is an empty frame before its first cue. The detector's lead-in for a scene stops at the first word 0.9 s before its anchor (it was up to 4 words, which put up to 2 s of empty frame before the number). A hook needs 1.3 s after its last word starts before the transcript ends, else it is not suggested: the gate would fail it, and the fallback would cut the line short.
- **Director scope for Nov 30.** Each slot has one candidate scene (the detected one), so `direct.plan` chooses variants, per-slot energy and the peak, not scenes. Planned images and motifs are enforced but have no consumer until tasks 25–26 and 31. The cloud route needs a server-granted free plan (`plan-allowance`); the design's note on what a modified client could bypass stands.

## D-033 · 2026-11-15 · decided (Kiro IDE) — Paper Collage: readable colours, fitted tilt, checks on set lines
Spec 07 task 22, written in a Kiro IDE session (Opus 5.5). Provenance in `packages/motion/src/styles/README.md`.
- **Colours follow the design thumbnail except where text must be read.** Kraft `#DFCDB7`, cream `#F7F0D8` and coral `#D96648` are kept exactly. Ink goes from `#352F29` to `#1F1A17` (the old ink was 3.7:1 on the coral, under the 4.5:1 rule), muted from `#6F5B4D` to `#5F4C40` (4.1:1 → 5.2:1 on the kraft), and text on coral is ink, not the thumbnail's cream (3.3:1).
- **Cut pieces alternate the coral and a darker kraft** (`bg` mixed 12 % towards `ink`). The cream highlight was rejected: a cream piece on a cream card vanishes.
- **Tilt is fitted, not fixed.** Carried text and its marks turn with their paper about its centre. The stage tries 1, 0.6 and 0.3 of the look's tilt and keeps the first that leaves every turned line inside the safe area and clear of other text, else 0. The design's -4°/+5° was rejected: 9:16 lines left the safe area.
- **motion:check measures text on its set lines.** Safe area and overlap now use the lines' client rects (a turned box's bounding rect overstates it), and two texts carried by the same surface are not an overlap pair. The rule change is marked "Changed by spec 07 task 22" in `scripts/check.ts`; the contrast, orphan and surface-through-glyph assertions are unchanged.
- **Parity covers every polished look.** `services/render/scripts/parity.ts` renders one stat-punch + hook-statement project per look besides the big-number case.

## D-034 · 2026-11-16 · decided (Kiro CLI, spec 08) — Export renders with the local producer settings; hostile audio is contained; one style resolver
Spec 08 tasks 1, 4 and 6, built headless by the Kiro builder agent (Sonnet 5.5) and entered here from a Claude Code session (the agent can't write `docs/`).
- **Producer settings.** 720p uses the producer's `outputResolution` presets (verified on 0.9.46, so no ffmpeg scale step); 1080p is native. Renders use `quality: 'high'` and `workers: 2`: an 18 s 1080p export took 23 s wall time and peaked at 1.3 GB on a laptop. Cloud Run timings come from task 6a (needs founder approval).
- **Uploaded voice is untrusted.** ffmpeg runs with `-protocol_whitelist file` and a demuxer forced from the file extension, so a playlist renamed `.wav` is not followed; the re-encode is cut at the export limit plus 1 s and the length is checked on the WAV.
- **One style resolver for preview and render.** `styleFor` resolves `looks`, then `stylePacks`, then the editorial explainer. Behaviour change: a project with `styleId: 'field-notes'` used to preview in the editorial look; it now previews and renders in Field Notes.
- **Scope.** MP4 at 720p and 1080p in every format for Nov 30; 4K and transparent WebM are Later, shown as disabled "Soon" cards. Export limit 3 minutes, 10 renders per user per day.

## D-065 · 2026-11-16 · proposed (Kiro CLI spec run, awaiting founder) — Spec 11: projects in the account, new takes, recorded WAV, TTS path
(Renumbered from D-034, which is spec 08's; review fixes applied 2026-11-16.)
Written headlessly in Kiro CLI (claude-opus-5.5) while writing `.kiro/specs/11-dashboard-start-recording/`. Full table in that spec's `design.md` §0.
- **Projects move to Firestore + Storage in spec 11**, IndexedDB stays for local mode. No spec owned the sync (spec 04 parked it), the dashboard needs a real list, and a project must open on a second device. (The first draft said "export needs the audio in Storage"; that was wrong: spec 08 uploads the voice itself.)
- **Storage shape:** project-document times are integer epoch ms; slot and version params are JSON strings (`paramsJson`), because scene params can nest arrays; `voiceover.peaks` is never written; a `poster` slot and counts are denormalised so the dashboard reads one query.
- **The project-document schema is derived from `EditorProjectBaseSchema`**, so fields added later (spec 12's `captions` and `audio`) are stored without an edit; zod would strip a hand-written list.
- **Render state is derived, not stored.** `status` is `draft | processing | ready`, client-written; the dashboard joins `renders` by `projectId` (an active render shows `Rendering p%`, a finished one `Exported`). Autosave would overwrite a server-written field. New index `renders (ownerId, status, createdAt desc)`.
- **One audio path for the product:** `users/{uid}/audio/{projectId}/{kind}-{hash16}.{ext}`; `voice-{hash16}` is spec 08's `voicePathFor` shape, so export finds the object and uploads nothing twice. Delete is a server route (`recursiveDelete`, `renders`, `shares`, Storage prefixes); duplicate copies the audio, so no two projects share an object.
- **A finished take is stored locally at once** and the page warns before unloading while recording.
- **Credits are spec 13's only:** `ServerCredits.spend({ action: 'tts', units })` with a new key per attempt, a refund only when `speak()` failed, `costOf('tts', units)`; Generate is disabled until spec 13 tasks 1–5 and 8 land. The threat model is spec 13's "Trust model": browser-side AI calls can't be verified by the server, so the caps (App Check, hourly rate limit, `refundsPerDay`, 15-minute refund window, budgets, kill switch) are what bound abuse.
- **A new take is a new project** ("{title} (take 2)"); the old one stays. Slots belong to words, so a new take can't be mapped honestly.
- **Recording is a 24 kHz mono WAV from an AudioWorklet**, not MediaRecorder WebM: intake and Storage accept MP3/WAV/M4A, and 10 minutes fit under 50 MB.
- **`tts.generate` moves from spec 05 task 12 to spec 11** and gets a media path in the router (`speak()`), because it returns audio, not JSON. Voices use our own labels; provider ids come from Remote Config. Speed is a delivery instruction in the prompt (the speech config has no rate field, per the Firebase "Generate speech" page read via Context7 on 2026-11-16); how well the model follows it is not measured yet.
- **"Try a sample" sits on the Upload card** of `/start`, a deliberate small deviation from `start.png`, because judges need it and the design has no place for it.
- **Open:** the 5-minutes-per-graphic figure behind "~saved", the voice preview spend (about $0.01), the Storage CORS rule for a second device.

## D-066 · 2026-11-16 · proposed (Kiro CLI spec run, awaiting founder) — Spec 10: Pip plans, routes and one undo
(Renumbered from D-035, which is spec 09's; review fixes applied 2026-11-16.)
Written headlessly in Kiro CLI (claude-opus-5.5) while writing `.kiro/specs/10-pip-panel/`. Full table in that spec's `design.md` §0.
- **Suggestion chips are planned in code**, free and instant; typed messages go to `pip.plan`. That is why the designed empty state can honestly say "⚡ free · on-device".
- **Code picks the route before sending** (`ONLY_ON_DEVICE` for slot-scoped requests that fit the device budget, else `ONLY_IN_CLOUD`), so the hint shown is the route used. A failed device plan offers "Ask in the cloud ☁ 2" instead of escalating. This replaces `PREFER_IN_CLOUD` in `ai-tasks.md` §6 (steering change proposed in the spec).
- **The model's step is flat** (`action, slot, choice, atWord, instruction, label`, all required, with sentinels), because structured output has no `anyOf` and free `args` objects break the schema rules. Code computes every credit figure.
- **Steps land one by one in one undo entry** (`amendTop` amends the plan's history entry with a growing composite), matching the design's mid-apply frame. Undo on the action card stops and undoes the whole plan; a user ⌘Z on the plan stops it too.
- **A failed device edit never spends credits by itself.** The step is skipped with "Ask in the cloud ☁ 1", so Apply all spends at most the estimate (generations only) and the hint equals what runs.
- **Credits are spec 13's, with no new refund design.** `ServerCredits.spend` before a cloud call, `refund` only when the call fails, never on Undo. Every cloud path of spec 10 stays disabled ("Cloud AI is coming soon") until spec 13 tasks 1–5 and 8 land.
- **The project sub-collections get explicit rules, not a wildcard.** Firestore ORs matching rules, so a `chat` rule beside `match /{sub}/{doc=**}` validates nothing. An unknown sub-collection name is denied. `projectOwnerAfter` (`getAfter`) lets the first save of a project write its sub-documents in one batch.
- **Panel default and checks:** the AI panel opens on a first visit; `?rail=` overrides it in development and test builds; checks against `editor.png` pass `rail=none`.
- **Brand colours in the demo:** journey 2 in `product.md` changes to "fill the empty slots and add an opening title" because brand kits are spec 16; the designed chip gets the honest reply.
- **Carve-out:** `captions` and `setCaptions` are built in spec 10 (task 2b) so Pip can use them first; the plan drops `setCaptions` steps until spec 12a renders the presets. Code-built plans write no usage event.
- **Open:** a minimal brand-colours field before spec 16 if the founder wants brand colours in the demo; whether chips should also use Gemini Nano.

## D-067 · 2026-11-16 · proposed (Kiro CLI spec run, awaiting founder) — Spec 12: one mixed bed, captions in code, music behind a listening check
(Renumbered from D-036, which clashed; review fixes applied 2026-11-16.)
Written headlessly in Kiro CLI (claude-opus-5.5) while writing `.kiro/specs/12-formats-captions-sound/`. Full table in that spec's `design.md` §0.
- **One pre-mixed bed WAV** (music with ducking plus every effect) is the only extra audio, mixed by pure JS DSP in a worker and played by the preview. Export uploads the same file (keyed by a hash of its inputs) as one `<audio id="bed">`, so preview and export match by construction and the render service needs no DSP.
- **Effects are synthesized from noise and transients, not tones.** **Synthesized music sits behind `music_synth_enabled` (default off) until the founder listens.** "Your own track" is always available and "No music" is the default. Reason: steering rules out stock libraries (D-016), and the HyperFrames sound guide says music written in code can't be judged without ears.
- **Captions are rail-only and grouped in code only** (3 / 4 / 5 words for 9:16 / 1:1 / 16:9, pop 3; breaks at sentence ends and 150 ms pauses; tagged spans kept whole; fillers dropped). **Device-refined captions (`captions.chunk`) are removed:** the render job has no Gemini Nano, so a refined preview would differ from the export. Backings guarantee 4.5:1 for white text even over a white frame (text inset by the feather width).
- **Captions and audio settings are project fields with undoable commands**; the editor's UI-only captions flag goes away. Auto effects are derived from the slots, not stored.
- **Levels are relative to a measured voice level** (RMS over word regions, an approximation); full loudness normalisation is left to export.
- **Split in two deliverables, one folder:** 12a formats and captions (must ship Nov 26, including captions in the export) and 12b sound (first to cut, cut as one block). The spec 08 changes each needs are listed as tasks inside spec 12 (spec 08's files are not edited): `captions: true` accepted and groups computed in the job; `bedPath`, `music: true`, a bed Storage path and the audio parity cases.
- **Safe-zone geometry has one source:** `platformZones()` next to `safeArea()`; it adds no numbers of its own. Caption/graphic overlap is measured by a report-only `motion:check` line, not prevented.
- **One WAV encoder** (`encodeWav16` in `packages/motion`); the bed is 24 kHz mono, so music is band-limited to 12 kHz in the export (a 44.1 kHz export-only bed is Later). The listening check uses the exported MP4, and a real-producer test asserts the click lands within one frame and 1 dB.
- **Audio objects follow spec 11's path:** music under `users/{uid}/audio/{projectId}/`, the bed under `users/{uid}/projects/{projectId}/bed/`; spec 11's delete removes both and duplicate copies the music; the last 3 beds are kept.
- **Open:** music default and the listening check, the caption default preset, the 9:16 caption height, 24 versus 44.1 kHz for the exported bed.

## D-068 · 2026-11-16 · decided (Claude Code, ship mode) — Projects sync: local first, JSON bodies in Firestore
Spec 11 R1 asked for projects in the account; design §2.1 stored each field as a Firestore field. Built instead (`apps/web/lib/projects/cloud-docs.ts`, `synced-library.ts`, `firestore-cloud.ts`):
- **Same layout, string bodies.** `projects/{id}` holds the dashboard summary fields (queryable) plus `bodyJson`; `transcript/main|original`, `slots/{id}` and `versions/{id}` each hold `{ json }`. Reason: Firestore refuses nested arrays and `undefined`, and component params are free-form, so a JSON string is the one shape that always round-trips. Every read is still zod-parsed, then `EditorProjectSchema` runs on the whole project.
- **Local first.** IndexedDB saves at once; the cloud push runs in the background, one push at a time per project, writing only changed documents with the project document last. A cloud failure is logged and never breaks a save. Opening takes the newer copy (by `updatedAt`); a local project the cloud lacks uploads itself. A project naming another owner is never pushed.
- **No composite index.** The list query is `where('ownerId','==',uid)` with `limit(200)` and the client sorts, so nothing needs deploying beyond the rules already live. A new project's document is written before its first batch because the sub-collection rule reads the project's owner.
- **Delete** goes through `DELETE /api/projects/{id}` (owner check, every sub-collection, the caller's renders and shares, the Storage prefixes, the project document last; idempotent).
- **Not yet:** audio is still local to the browser that recorded it (`HybridAudioStore`, task 7), so a project opened on a second device has its graphics and transcript but no voice until that lands.

## D-069 · 2026-11-16 · decided (Claude Code, ship mode) — The render job mixes the bed; render image and bucket IAM
- **Bed in the export, mixed by the job.** Spec 12 task B8 (design §9 items 5–9) had the client upload the bed to `users/{uid}/projects/{pid}/bed/{key}.wav` with a new route field, job check and Storage rule. Built instead: the job runs the same `buildBed` from the snapshot and the re-encoded voice (`services/render/src/bed.ts`) and the compiler adds `<audio id="bed">`. Reason: the bed is a pure function of the project, so the job can make the same bytes without a new upload path to validate. The voice level is measured from the 48 kHz WAV instead of the browser's decode; the difference is a fraction of a dB. The export modal's `music` option now means "include the bed" (on by default). Own music tracks are not exported yet (they live only in the browser). `musicSynthEnabled` now only hides the music picker; a project that has synthesized music plays it in the editor exactly as it is exported.
- **Render image.** It ships only chrome-headless-shell (the producer's BeginFrame browser; the preflight uses it too), drops dev dependencies after building the runtime, and sets `PRODUCER_LOW_MEMORY_MODE=false` (the producer took 8 GiB for a low-memory host and switched to screenshot capture). The image went from 681 MB to 493 MB, and the producer time for 10 s of video went from 37 s to 28 s. Most of an export's wait is now Cloud Run starting the job (40–115 s, varying between runs; gen1 was slower than gen2 in one probe).
- **Bucket IAM.** The render job's service account got an unconditional `roles/storage.objectAdmin` on the Firebase bucket. Spec 08 asked for a condition limited to `users/*/projects/*/renders/`, but IAM conditions need uniform bucket-level access, which the Firebase bucket doesn't have, and turning it on changes how every object is authorised. Revisit if uniform access is turned on.

## D-070 · 2026-11-16 · decided (Claude Code, ship mode) — Pictures in scenes; motion that never stops
- **Pictures.** Scenes that declare an image role (stat, hook, list, quote, the new Photo scene) split the frame when a ready picture exists: the picture takes a side in 16:9 or the top in 9:16 and 1:1, and the scene builds its text into the rest as its own smaller frame. With no ready picture the scene keeps its picture-free form, so a pending or failed picture never breaks a slot. Pictures come from three places: the image model through AI Logic (`imageModel`, cloud only, `imageCredits` per picture, refunded on failure, painted in the look's recipe on a chroma backdrop and cut out on the device when the key guard passes), Openverse (CC0 and CC BY only, attribution stored with the asset) and uploads. Each is a WebP ≤ 1024 px addressed by its sha256 (`media:{hash}.webp`) in IndexedDB and `users/{uid}/media/` (the existing owner-only rule). The preview inlines data URLs (the iframe is sandboxed); the render job downloads the assets in use next to the composition. Pip offers "Add pictures to N graphics" as a plan (one confirm per video, never automatic), and the editor offers it once when a project has none.
- **Motion that never stops.** The default look (Editorial Explainer) was a plain style pack, so it had no personality, camera, marks or juice: it is now a full look. Under the slots a backdrop of drifting accent fields, a sliding dot grid and an accent sweep on every entrance keeps the frame alive between graphics (left out of transparent exports). Every boundary between graphics is a velocity-matched seam (12 % partial travel, mirrored power-4 eases, light blur at the cut). All of it is a pure function of time, so preview and export match.
- **Fonts.** Four more SIL OFL families are bundled (Fraunces, Space Grotesk, Bricolage Grotesque, Playfair Display); `project.fonts` overrides the look's type through `styleFor`.

## D-071 · 2026-11-16 · decided (Claude Code, ship mode) — Globe maps, seams between graphics, the Newsprint look
- **Context:** the founder asked for graphics that look like the best current explainer channels: an editorial collage style, real camera moves, and realistic maps in several styles. I researched current motion-design practice (transition grammar, timing rules, collage explainer craft, map fly-ins) before building.
- **Decision:**
  - **Globe maps.** A WebGL fragment shader draws an orthographic globe from bundled public-domain equirectangular images: satellite (NASA Blue Marble), relief and paper (Natural Earth), and night (NASA city lights). A matched d3-geo projection draws the borders, the traced outline, the lift and the pin over it. Borders sharpen from 1:110m to 1:50m on the way in. The camera spins, then flies down: rotation leads and zoom follows on a log scale. Each look picks a map style, and a slot can override it. Without WebGL or the image, the flat vector map is used. I chose this over three.js and MapLibre: it is one small shader, deterministic, needs no tiles and no network, and stays seekable frame by frame.
  - **Map images** are served same-origin with CORS from `/api/composition/maps/[file]` for the opaque preview iframe. The render job copies them into the composition folder.
  - **Seams.** Each boundary between graphics uses one technique, shared by both sides: slide (cut the curve), zoom-through, pull-back (always into the payoff), whip, or a paper sweep. Arrivals decelerate and exits accelerate, and exits are shorter than entrances. No kind repeats back to back. A seam never touches a key moment; that side becomes a cut instead.
  - **Lens layer** over the graphics: the paper sweep at paper cuts, and a 12 fps texture boil on stepped looks.
  - **Newsprint look:** newsprint ground, high-contrast serif headlines, halftone cut-outs on torn colour backing, highlighter and red marker, a 12 fps step, paper maps. Picture treatments are duotone, halftone, torn edge and backing. The name is original, and no outlet or creator is named anywhere.
- **Consequences:**
  - The runtime bundle is about 2.1 MB because the 50m borders are inside it. Map images add 0.5–2.3 MB per style used.
  - motion:check measures layout with seams off (seams move whole slots on purpose). The key-moment guard is unit-tested.
  - The producer launches Chrome with SwiftShader GL, so export WebGL is software-rendered. A hosted export confirms it.

## D-072 · 2026-11-16 · decided (Claude Code, founder ask) — Longer scripts, voiced in parts; 8-minute exports
- **Context:** the founder found pasting a long script broken, and the 3,000-character limit too short. Two causes: a paste was cut at the limit with no warning, and the script went to `/start/script` in the URL (`?text=`), which a long script pushes past what the hosting layer accepts. The voice was also one TTS call for the whole script.
- **Decision:** `SCRIPT_MAX_CHARS` = 6,000 (about 1,000 words, about 6.5 minutes) in `@motionpop/schemas`. The script travels in session storage. Over-limit text stays in the box: the counter turns red, and Generate says how many characters to trim. The voice is made in parts of 1,200 characters or less, split on sentence ends, called in order and joined with a 220 ms pause, with "part N of M" on the button. `exportMaxMs` goes to 8 minutes, the render job's task timeout to 60 minutes and the producer's to 55.
- **Budget:** TTS costs the same per minute of speech whatever the part count. Credits are charged per started minute.
- **Correction (same day):** the first version of this entry said a full-length export takes "roughly 75 minutes", with a 60-minute job timeout and a 55-minute producer cap. That was wrong. At the measured ~11× real time (the globe export), an eight-minute video with maps needs about 90 minutes, so it would have timed out. The job's task timeout is now 150 minutes and the producer cap 140 minutes. One such export is about 22,000 vCPU-seconds, roughly $0.50 of Cloud Run. Every export also pays a 1.5–2.5 minute cold start (a 493 MB image).
- **Upgrade path:** `@hyperframes/producer/distributed` (planV2 → renderChunkV2 → assembleV2) can split a render across the tasks of one Cloud Run job execution. That would cut a long export's wall time by the task count at about the same CPU cost. Not built yet.

# Motionpop — `#BuildHybridAI` Hackathon Devpost Write-Up

> **Track:** Web (Chrome) — eligible for **Best Web / Chrome App ($3,000)** and **Grand Prize ($10,000)**
> **Open Source:** Apache-2.0 (`https://github.com/AbhinavJawle/motionpop`)
> **Architecture deep dive:** `/how-it-works`

---

## 1. Value Proposition: AI Short-Form Video Editor & Immaculate Motion Graphics

Generative pixel-diffusion video tools bake frames you cannot edit and mangle on-screen text. **Motionpop** takes the opposite path: drop raw talking-head video, a voiceover, or a script, and **Pip** (our agentic AI director) auto-cuts dead air, hiccups and repeated takes, then compiles **deterministic, word-locked motion graphics** on an integer-millisecond timeline.

Every headline, stat, chart, caption, cut and timing is editable structured JSON—never melted pixels—and **Firebase AI Logic hybrid inference** puts **10 everyday AI editing tasks directly on your device with Chrome Gemini Nano** at **$0 cost, sub-second latency, and full offline support**, reserving frontier cloud Gemini models strictly for heavy multi-scene directing, custom motion code, voice synthesis, bespoke illustrations and soundtracks.

---

## 2. Why Desktop Chrome (Web) Is the Natural Home (Grand Prize Platform Rationale)

Pro multi-track video and motion-graphics editing demands a wide timeline canvas, precision scrubbing, frame-annotation drawing, and gigabyte-scale media buffers. Submitting on **Web (Desktop Chrome 139+)** is not a compromise—it is the only zero-install platform where **four heavy local engines run side by side inside one browser tab**:

1. **WebGPU Whisper Worker** (`apps/web/lib/transcribe/whisper-client.ts`) — runs `whisper-base_timestamped` locally on the creator's GPU (with automatic WASM fallback) for free word-level integer-ms timestamps.
2. **Built-in Multimodal Chrome Gemini Nano via Firebase AI Logic** (`packages/ai/src/providers/firebase.ts`) — executes **10 structured text + JPEG editing tasks** locally at 0 credits, even offline.
3. **Web Audio `OfflineAudioContext` DSP + IndexedDB** (`apps/web/lib/audio/`) — performs 10 ms speech-energy mapping, LCS retake & dead-air auto-cutting, 70–400 Hz vocal prosody, procedural SFX synthesis, and multi-gigabyte local media persistence without uploading raw takes first.
4. **Opaque Sandboxed 30 fps Deterministic HyperFrames Player** (`packages/motion/`) — previews pure `seek(tMs)` HTML/SVG compositions with **≤ 1.02% pixel difference** against Cloud Run MP4 exports.

---

## 3. How We Use Firebase AI Logic (Hybrid Inference Architecture)

Every AI call in Motionpop goes through a single typed router (**`packages/ai/src/router.ts`**) backed by **Firebase AI Logic** (`AgentPlatformBackend('global')` with `useLimitedUseAppCheckTokens: true` in **`apps/web/lib/firebase/client.ts`** and **`packages/ai/src/providers/firebase.ts`**).

- **Transparent route chips before every click (`apps/web/lib/ai/route.ts`):** Users see mint `⚡ free · on-device` vs violet `☁ N credits` upfront. Under our strict D-035 rule, a mint on-device chip **never silently charges cloud credits**; if a frame note needs a full custom graphic rewrite, Nano explains why and offers an explicit one-click **Try in the cloud** button.
- **10 On-Device Gemini Nano Tasks (`ONLY_ON_DEVICE` / `PREFER_ON_DEVICE`, 0 credits, offline-capable):**
  1. `reel.note.local` (`packages/ai/src/reel/note-local.ts`) — **multimodal** cropped JPEG + text frame notes on talking-head reels (headline, kicker, counter value/prefix/suffix, tag, background, layout, hook, caption typo fixes).
  2. `pip.quick` (`packages/ai/src/tasks/pip-quick.ts`) — fast on-device Pip chat commands (reel look, theme gradients, captions, SFX, music, aspect ratio, auto-cuts, clear scene, single voiceover slot tweaks), escalating complex redesigns to cloud `pip.plan`.
  3. `reel.draft` (`packages/ai/src/reel/draft-local.ts`) — compact 4-template on-device reel director (`headline`, `counter`, `punch`, `cta`) for free, offline, and cloud-fallback initial reel generation.
  4. `edit.patch` (`packages/ai/src/tasks/edit-patch.ts`) — RFC 6902 JSON Patch quick edits on motion-graphic slots.
  5. `note.fix` (`packages/ai/src/tasks/note-fix.ts`) — multimodal JPEG crop + text frame notes on motion-graphic slots.
  6. `recipe.resolve` (`packages/ai/src/tasks/recipe-resolve.ts`) — turns custom style/recipe prose into strict `ResolvedRecipe` JSON.
  7. `component.fill` (auto-fill mode, `packages/ai/src/tasks/component-fill.ts`) — background draft fill of detected voiceover slots (`ONLY_ON_DEVICE`).
  8. `slots.detect` (`packages/ai/src/tasks/slots-detect.ts`) — chunked ≤ 400-word spoken-moment detection on Nano, cloud fallback above the Remote Config word threshold.
  9. `direct.plan` (`packages/ai/src/tasks/direct-plan.ts`) — whole-video energy arc planning.
  10. `prompt.prefill` (`packages/ai/src/tasks/prompt-prefill.ts`) — instant slot prompt suggestions.
- **Cloud Frontier Tasks (`ONLY_IN_CLOUD` via Firebase AI Logic + Vertex AI):**
  - `reel.direct` (`gemini-4-neon` + 6 sampled video keyframes across 21 strict reel templates), `reel.edit` (semantic retake second-opinion), `reel.note` & `reel.compose` (sandbox-verified custom motion graphics), `pip.plan` (multi-step whole-timeline execution plans), `media.index` (multimodal B-roll indexing), `film.direct` / `film.build` / `film.vision-critic` (storyboard + parallel custom beats + Vision QA loop), `tts.generate` (`gemini-3.8-flash-tts`), `image.generate` (`gemini-nano-banana-2.1` 1K illustrations & chroma-key cutouts), and server-side Vertex AI `lyria-002` (`/api/reel/music`) for crossfade-looped custom soundtracks.
- **Engineered around real Gemini Nano constraints:** Every on-device schema is guarded in CI by `packages/ai/src/schema-rules.test.ts` and `packages/ai/src/schema-caps.test.ts` (nesting depth ≤ 3, ≤ 6 optional fields per object, numeric `maxLength` on every free-text string matching Zod, and total prompt `< 8,000` chars—our new tasks measure just `968–1,622` chars, leaving ample headroom inside Nano's 9,216-token multimodal window).
- **Live Telemetry:** Every call logs `{ task, ranOn, model, credits, cloudCost, latencyMs, ok }` so **Settings → Usage** displays real-time `% on-device`, latency comparison, and exact credits saved.

---

## 4. Seven Firebase Products Used Meaningfully + Built With Antigravity & Firebase Agent Skills

Motionpop uses **7 Firebase products** in production—not as boilerplate, but as the core runtime spine:

1. **Firebase AI Logic** — default hybrid inference layer (`AgentPlatformBackend('global')`, `ONLY_ON_DEVICE` / `PREFER_ON_DEVICE` / `ONLY_IN_CLOUD`, limited-use App Check tokens) powering all 10 Chrome Gemini Nano tasks plus cloud Gemini text, multimodal vision, TTS and image generation.
2. **Firebase App Check** — `ReCaptchaEnterpriseProvider` with `useLimitedUseAppCheckTokens: true` enforced across AI Logic, Firestore, Cloud Storage, and signed Next.js server routes (`apps/web/lib/firebase/verify.server.ts`).
3. **Firebase Authentication** — Google Sign-In and Email Link authentication with server-side ID token verification on every spend, music, media and render endpoint.
4. **Cloud Firestore** — stores projects, 200-step versioned histories, usage telemetry, **bidirectional custom user `SKILL.md` documents (`users/{uid}/skills/{id}`)**, and a **server-only atomic credit ledger** with hourly rate limits and automatic failure refunds (client writes blocked by Security Rules).
5. **Cloud Storage** — stores raw talking-head video, cleaned 24 kHz voiceovers, Media Bin B-roll, Vertex AI Lyria WAV soundtracks, rendered MP4/WebM exports, thumbnails and public `/share/[id]` video streams.
6. **Firebase Remote Config** — live-tunes `routing_overrides`, `routing_slots_detect_device_max_words`, active model IDs, credit prices, `custom_provider`, `exports_enabled`, and an instant `kill_switch` with zero redeployment.
7. **Firebase App Hosting** — hosts the Next.js 16 production web app alongside Cloud Run (`services/render`) and Secret Manager.

**Built with Antigravity & Official Firebase Agent Skills:**
Motionpop was built using **Antigravity**, **Kiro** (44 EARS specs, 21 steering docs), and **8 official Firebase Agent Skills** checked into `.kiro/skills/` and `.claude/skills/` (`firebase-ai-logic-basics`, `firebase-app-hosting-basics`, `firebase-auth-basics`, `firebase-basics`, `firebase-firestore`, `firebase-remote-config-basics`, `firebase-security-rules-auditor`, `firestore-rules-creation`).

---

## 5. The Frankenstein Monster — Every Stitched Element

Motionpop stitches **12 distinct engines and data planes** into one studio (documented interactively at `/how-it-works`):

1. **On-Device Edge AI Brain:** 10 Chrome Gemini Nano tasks via Firebase AI Logic (multimodal JPEG + JSON constrained decoding, 0 credits, offline).
2. **In-Browser Speech & Vocal Prosody:** `transformers.js` `whisper-base_timestamped` in a WebGPU/WASM Web Worker + 70–400 Hz autocorrelation pitch & RMS stress scoring (`prosody.ts`).
3. **Automatic Video Editing & Cut Engine:** 10 ms dBFS speech-energy tightening (`speech.ts`), Longest Common Subsequence (LCS) retake & false-start detector with tense/plural folding, parallel-list & negation-contrast guards (`retakes.ts`), dead-air (> 380 ms), hiccup & filler trimming (`autocut.ts`), optional cloud `reel.edit` review, and non-destructive EDL audio resplicing (`OfflineAudioContext`).
4. **Multi-Model Cloud Orchestra:** `gemini-4-neon`, `gemini-3.5-flash-lite`, `gemini-3.8-flash-tts` (5 voices + `PartCache`), `gemini-nano-banana-2.1` (1K illustrations + `#00FF00` chroma-key cutouts), **Vertex AI `lyria-002`** (crossfade-looped custom WAV soundtracks), plus a Remote Config Claude hook for Tier-2 custom code.
5. **Dual Deterministic Motion Engines:** Reel Engine v3 (21 vertical templates, 4 stage layouts, 5 kinetic caption presets) + Motion-Graphic & Film Engine (9 responsive scenes, 8 bundled OFL Style Packs, zero-crop 16:9 / 9:16 / 1:1 reflow) — pure `seek(tMs)` JSON-to-HTML compilation with zero GSAP.
6. **4-Stage Custom Motion Code & Vision QA Gate:** `lintCustom` static ban (`fetch`, `Date.now`, `Math.random`, timers, external URLs) → `@hyperframes/lint` → opaque sandboxed iframe DOM critic (overflow, safe zones, face overlap, contrast) → multimodal `film.vision-critic` self-repair.
7. **Procedural Web Audio SFX & Ducking Synth:** 14 deterministic seeded takes across 5 classes (`whoosh`, `pop`, `tick`, `rise`, `impact`) built from biquad-filtered noise carriers & pitch-drop sine thumps, peak-aligned to graphic entrances—zero stock SFX MP3s—plus procedural music beds and auto voice ducking.
8. **6-Source Real-World Visual & Vector Geo Resolvers:** Pixabay API (24 h cache, HD video/photo), Pexels fallback, Wikimedia Commons fallback, Openverse API (CC0/CC-BY with stored attribution & UUID-only anti-SSRF proxy), Simple Icons CDN + Favicons (`/api/reel/logo` with SVG script stripping), Headless Chrome live web captures (`/api/reel/screenshot`), and offline Natural Earth `d3-geo` + `topojson-client` vector world maps.
9. **Database-Backed Modular `SKILL.md` System:** 5 built-in Reel Recipes (`skills/recipes/*.md`), 8 Motion Slot Skills (`skills/*.md`), and custom user/GitHub `SKILL.md` imports synced bidirectionally with Cloud Firestore (`users/{uid}/skills/{id}`).
10. **7-Service Firebase Production Backbone:** AI Logic, App Check, Auth, Firestore, Cloud Storage, Remote Config, and App Hosting.
11. **Optional Power-User BYOK:** Firebase AI Logic is always the default path; power users can optionally supply a Google AI Studio key in `localStorage` (`x-goog-api-key` direct to Google, keeping multimodal `chromeOnDeviceProvider` Nano first at 0 Motionpop credits).
12. **Cloud Run Parity Renderer:** `@hyperframes/producer` + `video-ffmpeg.ts` rendering the exact compiled preview HTML at 30 fps (≤ 1.02% pixel diff) to 1080p MP4, transparent WebM alpha overlays, and public `/share/[id]` links.

---

## 6. Testing Instructions for Judges (Default Firebase AI Logic Path)

> **Default Path:** Motionpop runs on **Firebase AI Logic out of the box**—no API key setup is required. Sign in with Google (or the judge test account with 500 pre-loaded credits). *(Power-user BYOK in Settings → AI & models is strictly optional.)*

1. **Verify On-Device Gemini Nano (Desktop Chrome 139+):**
   - Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and relaunch Chrome.
   - Visit `/how-it-works` (or **Settings → AI & models**) and verify the live Nano probe reads **Gemini Nano READY** (or click **Set up Gemini Nano** to download weights).
   - Drop a short talking-head video (or try a sample voiceover) on `/start`. Watch Whisper transcribe locally and auto-cut silences/retakes.
   - In the editor, **open DevTools → Network → Offline**. Ask Pip *"switch to cream look and hide captions"* or circle a graphic and leave a frame note (*"change title to Ship Faster"*). Both execute locally on Gemini Nano at **0 credits**, log `ranOn: "device"` in **Settings → Usage**, and undo cleanly in one step.
2. **Verify Hybrid Escalation & Cloud Fallback:**
   - Re-enable network (or test in Safari/Firefox where Nano is absent).
   - Circle a reel graphic and ask for a complex rewrite (*"replace this with a custom animated rocket bar chart"*): on Nano, Motionpop never silently charges—it explains why and shows a one-click **Try in the cloud** button, which runs `reel.note` + `reel.compose`, lints and DOM-checks the custom scene in an opaque sandbox, and lands it on the timeline.
   - Export 1080p MP4 via Cloud Run and compare preview vs output.

---

## 7. Challenges, Learnings & Verified Engineering Numbers

- **Taming Gemini Nano's 9,216-token & structured-output limits:** Early hand-written schemas with > 6 optional properties or uncapped strings caused small-model JSON loops. Enforcing strict CI schema tests (`schema-rules.test.ts` + `schema-caps.test.ts` + 350 `fast-check` fuzz runs in `hybrid-local.test.ts`) eliminated malformed-output crashes completely.
- **Whisper timestamp bleed on pauses:** Whisper routinely stretches the final word before silence across the pause. Building a 10 ms dBFS speech-energy map (`speech.ts`) before running LCS retake cutting (`retakes.ts`) made auto-cuts crisp without clipping breath tails.
- **Scale verified in repo:** **44 Kiro specs**, **21 steering docs**, **8 Firebase Agent Skills**, **236+ test files** (685 tests in `@motionpop/ai`, 1,600+ tests in `@motionpop/web`, plus `services/render` parity & ledger property tests).

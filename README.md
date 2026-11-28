# motionpop

**AI short-form video editor. Immaculate motion graphics. Hybrid on-device + cloud AI via Firebase AI Logic.**

Motionpop is an open-source, agentic AI video editor and motion-graphics studio built for **Desktop Chrome**. Drop raw talking-head video, a voiceover, or a script—**Pip** auto-cuts dead air, hiccups and repeated takes non-destructively, directs deterministic `seek(tMs)` HTML/SVG motion graphics synced to every spoken word, edits locally on your device with **Chrome Gemini Nano via Firebase AI Logic** at $0 cost (even offline), and exports pixel-identical 1080p MP4s and transparent WebM overlays.

- **11 on-device Gemini Nano tasks via Firebase AI Logic (0 credits, offline-capable).**
  - *Reel Engine (5 tasks):* automatic recipe/look picker (`setup.recommend`), talking-head reel frame notes (`reel.note.local`), instant Pip commands (`pip.quick`), 8-template offline reel drafts (`reel.draft`), and custom style parsing (`recipe.resolve`).
  - *Motion-Graphic Slot Engine (6 tasks):* quick JSON Patch edits (`edit.patch`), multimodal JPEG slot frame notes (`note.fix`), background auto-fill (`component.fill`), chunked spoken-moment detection (`slots.detect`, honoring Remote Config `routing_slots_detect_device_max_words`), energy-arc planning (`direct.plan`), and prompt prefill (`prompt.prefill`).
- **Auto-cuts raw talking-head video.** Multi-file upload (talking video + voiceover + B-roll + screenshots) paired with on-device Whisper WebGPU/WASM + 10 ms speech-energy mapping + LCS retake detection removes dead air, fillers, hiccups and repeated takes non-destructively—keeping your cleanest take.
- **Dual deterministic engines + Bespoke Film Kit (zero GSAP).** Reel Engine v3 (21 templates, 5 stage layouts, 5 kinetic caption styles) + 6 flagship Film Kit motion archetypes (Editorial Paper Collage, Keynote Glass, Kinetic Reel, Financial Newsprint, Dark SaaS Glass UI, Blueprint Schematic) across **Talking-Head Reels, Voiceover/Script Reels, and Standalone Motion Graphics** in 16:9, 9:16, or 1:1 with **11 Studio Looks** and **≤ 1.02% preview-vs-MP4 diff** (plus transparent alpha WebM export).
- **16 curated open-source `SKILL.md` director skills + 8 built-in recipes.** Selectable right alongside visual styles with GitHub attribution and preview thumbnails, backed by Firestore (`community_skills` + `users/{uid}/skills`) plus custom Markdown/GitHub skill imports.
- **7 Firebase products in production.** Firebase AI Logic (`AgentPlatformBackend("global")` + `useLimitedUseAppCheckTokens: true`), App Check (reCAPTCHA Enterprise), Authentication (Google + Email/Password), Cloud Firestore (owner-only rules + server-only atomic credit ledger `allow write: if false`), Cloud Storage, Remote Config (live routing overrides, thresholds & kill switch), and Firebase App Hosting.
- **Optional power-user Local LLM & BYOK modes.** Firebase AI Logic (Chrome Gemini Nano + Cloud Gemini) is always the zero-setup default; power users can optionally connect a local Ollama / LM Studio server or supply a browser-local Google AI Studio key (`listGeminiModels`) while keeping on-device Chrome Gemini Nano first at 0 Motionpop credits.

> Built for **#BuildHybridAI 2026** (Firebase — Web / Chrome) using **Antigravity**, **8 official Firebase Agent Skills**, and **Kiro** (49 specs, 21 steering docs; also entered in **#KiroweenHackathon26**). Interactive walkthrough & live Nano probe: `/how-it-works`.

## Hybrid AI Architecture

```
raw video / voice / script
  ─▶ Whisper WebGPU/WASM worker (word-level int ms)
  ─▶ 10 ms speech map + LCS retake/hiccup/dead-air auto-cutter + vocal prosody
  ─▶ Firebase AI Logic hybrid router (default, zero API key setup):
       • On-device Chrome Gemini Nano (11 tasks · 0 credits · offline · inferenceSource === "on_device")
       • Cloud Gemini 4 Neon / Flash-Lite / TTS / Nano Banana 2.1 + Vertex AI Lyria 2
       • Automatic Cloud Gemini fallback when Nano is absent (Safari / Firefox / Incognito)
       • Optional power-user Ollama / LM Studio or BYOK (Nano still first via Firebase AI Logic)
  ─▶ Real-world visual resolvers (Pixabay · Pexels · Wikimedia · Openverse · Simple Icons · d3-geo)
  ─▶ Firestore-synced SKILL.md recipes + deterministic seek(tMs) HyperFrames composition
  ─▶ 4-stage custom code & Vision QA gate ─▶ live preview ─▶ Cloud Run + FFmpeg ─▶ MP4 / alpha WebM
```

| Layer | Tech |
|---|---|
| App | Next.js 16, React 19, TypeScript 6, Tailwind CSS 4, Motion (UI), Zustand + Immer (200-step undo) |
| Hybrid AI (Default) | **Firebase AI Logic** (`AgentPlatformBackend("global")` + limited-use App Check tokens): 11 on-device Chrome Gemini Nano tasks + cloud `gemini-4-neon`, `gemini-3.5-flash-lite`, `gemini-3.8-flash-tts`, `gemini-nano-banana-2.1`, server-side Vertex AI `lyria-002` music, plus optional Ollama / LM Studio & browser-local BYOK |
| Firebase Ecosystem (7 Products) | **AI Logic**, **App Check** (reCAPTCHA Enterprise + limited-use tokens), **Authentication**, **Firestore** (projects, custom `SKILL.md` DB sync, atomic server-only credit ledger), **Cloud Storage**, **Remote Config** (live routing & kill switch), **App Hosting** |
| Motion & Video | Deterministic zero-GSAP `seek(tMs)` core (`packages/motion`) rendered with **HyperFrames** (opaque sandbox player in editor, `@hyperframes/producer` + FFmpeg on Cloud Run) |
| Audio & Auto-Cut | Whisper WebGPU/WASM worker (`transformers.js`), 10 ms speech-energy map, LCS retake & dead-air EDL, 70–400 Hz vocal prosody, 14-take procedural Web Audio SFX synth & auto voice ducking |
| Media & Skills | Pixabay, Pexels, Wikimedia Commons, Openverse (CC0/CC-BY), Simple Icons + Favicons, optional Headless Chrome screenshots (`MP_SCREENSHOTS=on`), Natural Earth `d3-geo` maps, built-in + GitHub/Firestore `SKILL.md` recipes |

## On-device AI in Desktop Chrome

Motionpop runs on **Firebase AI Logic out of the box** (no API key needed). On Desktop Chrome 139+ with Gemini Nano enabled, 11 editing tasks run locally at 0 credits and even offline; on other browsers, Firebase AI Logic automatically falls back to cloud Gemini.

1. Use Desktop Chrome 139 or newer.
2. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, set it to **Enabled** and relaunch Chrome.
3. Open `/how-it-works` or **Settings › AI & models** and click **Set up Gemini Nano** (or click **Test Gemini Nano** on `/how-it-works` once ready to inspect a live `inferenceSource: "on_device"` response).
4. Once status reads **Gemini Nano READY**, edits display the mint `⚡ free · on-device` chip and keep working even offline.

## For Judges: Firebase Verification Map

- **Default hybrid path (no API key needed):** Firebase AI Logic (`AgentPlatformBackend("global")` + `useLimitedUseAppCheckTokens: true`) in `apps/web/lib/firebase/client.ts`, `packages/ai/src/providers/firebase.ts`, `packages/ai/src/speech.ts`, and `packages/ai/src/image.ts`.
- **Browser hybrid router (`firebaseProvider` + cold-offline fallback):** `apps/web/lib/ai/router-client.ts`, `apps/web/lib/pipeline/browser-deps.ts` (`detectSlots`), and `packages/ai/src/router.ts`.
- **Remote Config, App Check, Auth & Security Rules:** `packages/schemas/src/config.ts`, `apps/web/lib/firebase/remote-config.ts`, `apps/web/lib/firebase/verify.server.ts`, `firestore.rules`, `storage.rules`, and `services/render/src/store/ledger.ts`.
- **Testing hybrid fallback:** Click **Test Gemini Nano** on `/how-it-works` or run a frame note / Pip quick edit in Desktop Chrome 139+ (executes on-device with Gemini Nano at 0 credits, even offline), then open the same hosted URL in Safari/Firefox/Incognito (automatically falls back to Cloud Gemini via Firebase AI Logic).
- **Optional power-user modes:** Ollama / LM Studio and BYOK in **Settings › AI & models** are strictly optional; Firebase AI Logic is always the zero-setup default.

## Repository

```
apps/web           Next.js 16 app (landing, /how-it-works, /pricing, dashboard, start, editor, recipes, skills, styles, settings)
packages/schemas   Zod 4 schemas shared across browser, API and Cloud Run
packages/motion    Deterministic motion core, 21 reel templates, 6 Film Kit archetypes, 9 explainer scenes, 11 studio looks, HyperFrames compiler, procedural SFX
packages/ai        Firebase AI Logic hybrid router, 20+ tasks (11 on-device Nano), 16 curated open-source skills, prompts, schema/cap guards, Lyria 2, dynamic BYOK
services/render    Cloud Run render service (@hyperframes/producer + FFmpeg parity compositor) & Firestore credit/billing ledger
skills/            8 Reel Director Recipes & 8 Motion-Graphic Slot Skills (Markdown)
.kiro/             49 EARS specs, 21 steering docs, hooks, 8 Firebase Agent Skills & HyperFrames skills
docs/              plan, decisions (D-001..D-087+), third-party disclosure, demo scripts, hackathon write-ups
```

## Development

Requires Node 24 and pnpm 11.

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in Firebase web config; never commit real keys
pnpm dev          # web app
pnpm test         # 394 test files (unit + fast-check property-based tests)
pnpm typecheck && pnpm lint
```

## How we build

Spec-driven with **Antigravity**, **8 official Firebase Agent Skills**, and **Kiro**: steering rules in `.kiro/steering`, 49 specs in `.kiro/specs/<NN-feature>/` (requirements → design → tasks), and honest engineering logs in [`DEV_LOG.md`](DEV_LOG.md) and [`KIRO_LOG.md`](KIRO_LOG.md).

## Third-party resources

See [`docs/third-party.md`](docs/third-party.md).

## License

Apache-2.0. See [`LICENSE`](LICENSE).

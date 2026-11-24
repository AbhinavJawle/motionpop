# motionpop

**AI short-form video editor. Immaculate motion graphics.**

Motionpop is an open-source, agentic AI video editor and motion-graphics studio built for **Desktop Chrome**. Drop raw talking-head video, a voiceover, or a script—**Pip** auto-cuts dead air, hiccups and repeated takes non-destructively, directs deterministic `seek(tMs)` HTML/SVG motion graphics synced to every spoken word, edits locally on your device with **Chrome Gemini Nano via Firebase AI Logic** at $0 cost, and exports pixel-identical 1080p MP4s and transparent WebM overlays.

- **Auto-cuts raw talking-head video.** On-device Whisper WebGPU/WASM + 10 ms speech-energy mapping + LCS retake detection remove dead air, fillers, hiccups and repeated takes non-destructively—keeping your cleanest take.
- **10 on-device Gemini Nano tasks.** Talking-head reel frame notes (`reel.note.local`), instant Pip commands (`pip.quick`), free/offline reel drafts (`reel.draft`), quick edits (`edit.patch`), slot frame notes (`note.fix`), custom recipe parsing (`recipe.resolve`), auto-fill, chunked slot detection, energy arcs and prompt prefill run locally in Chrome at **0 credits**, even offline.
- **Dual deterministic engines (zero GSAP).** Reel Engine v3 (21 strict vertical templates, 4 stage layouts, 5 kinetic caption styles) + Motion-Graphic & Film Engine (9 responsive scenes, 8 OFL Style Packs, 16:9 / 9:16 / 1:1 zero-crop reflow)—compiled from Project JSON into one HyperFrames composition with **≤ 1.02% preview-vs-MP4 diff**.
- **True Frankenstein stack.** Stitches Chrome Gemini Nano, Whisper WebGPU, Gemini 4 Neon, Gemini TTS, Nano Banana 2.1 art, Vertex AI Lyria 2 soundtracks, procedural Web Audio SFX, 6 real-world media/logo/screenshot/geo resolvers (Pixabay, Pexels, Wikimedia, Openverse, Simple Icons, Headless Chrome, Natural Earth `d3-geo`), Firestore-synced `SKILL.md` recipes, 7 Firebase products and Cloud Run FFmpeg rendering.

> Built for **#BuildHybridAI 2026** (Firebase — Web / Chrome) and **#KiroweenHackathon26** (Kiro — Frankenstein Category) using **Antigravity**, **Kiro** (44 specs, 21 steering docs) and **8 official Firebase Agent Skills**. Interactive deep dive: `/how-it-works`.

## How it works (The Frankenstein Monster)

```
raw video / voice / script
  ─▶ Whisper WebGPU/WASM worker (word-level int ms)
  ─▶ 10 ms speech map + LCS retake/hiccup/dead-air auto-cutter + vocal prosody
  ─▶ Firebase AI Logic hybrid router:
       • On-device Chrome Gemini Nano (10 tasks · 0 credits · offline)
       • Cloud Gemini 4 Neon / Flash-Lite / TTS / Nano Banana 2.1 + Vertex AI Lyria 2
       • Optional power-user BYOK (localStorage + x-goog-api-key, Nano still first)
  ─▶ 6-source real-world visual resolvers (Pixabay · Pexels · Wikimedia · Openverse · Simple Icons · Chrome screenshots · d3-geo)
  ─▶ Firestore-synced SKILL.md recipes + deterministic seek(tMs) HyperFrames composition
  ─▶ 4-stage custom code & Vision QA gate ─▶ live preview ─▶ Cloud Run + FFmpeg ─▶ MP4 / alpha WebM
```

| Layer | Tech |
|---|---|
| App | Next.js 16, React 19, TypeScript 6, Tailwind CSS 4, Motion (UI), Zustand + Immer (200-step undo) |
| Hybrid AI (Default) | **Firebase AI Logic** (`AgentPlatformBackend("global")` + limited-use App Check tokens): 10 on-device Chrome Gemini Nano tasks + cloud `gemini-4-neon`, `gemini-3.5-flash-lite`, `gemini-3.8-flash-tts`, `gemini-nano-banana-2.1`, Vertex AI `lyria-002` music, optional Claude Tier-2 hook & optional browser-local BYOK |
| Firebase Ecosystem (7 Products) | **AI Logic**, **App Check** (reCAPTCHA Enterprise + limited-use tokens), **Authentication**, **Firestore** (projects, custom `SKILL.md` DB sync, atomic server-only credit ledger), **Cloud Storage**, **Remote Config** (live routing & kill switch), **App Hosting** |
| Motion & Video | Deterministic zero-GSAP `seek(tMs)` core (`packages/motion`) rendered with **HyperFrames** (opaque sandbox player in editor, `@hyperframes/producer` + FFmpeg on Cloud Run) |
| Audio & Auto-Cut | Whisper WebGPU/WASM worker (`transformers.js`), 10 ms speech-energy map, LCS retake & dead-air EDL, 70–400 Hz vocal prosody, 14-take procedural Web Audio SFX synth & auto voice ducking |
| Media & Skills | Pixabay, Pexels, Wikimedia Commons, Openverse (CC0/CC-BY), Simple Icons + Favicons, Headless Chrome screenshots, Natural Earth `d3-geo` maps, built-in + GitHub/Firestore `SKILL.md` recipes |

## On-device AI in Desktop Chrome

Motionpop runs on **Firebase AI Logic out of the box** (no API key needed). On Desktop Chrome 139+ with Gemini Nano enabled, 10 editing tasks run locally at 0 credits and even offline; on other browsers, Firebase AI Logic automatically falls back to cloud Gemini.

1. Use Desktop Chrome 139 or newer.
2. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, set it to **Enabled** and relaunch Chrome.
3. Open `/how-it-works` or **Settings › AI & models** and click **Set up Gemini Nano**.
4. Once status reads **Gemini Nano READY**, edits display the mint `⚡ free · on-device` chip and keep working even offline.

## Repository

```
apps/web           Next.js 16 app (landing, /how-it-works, dashboard, start, editor, recipes, skills, styles, settings)
packages/schemas   Zod 4 schemas shared across browser, API and Cloud Run
packages/motion    Deterministic motion core, 21 reel templates, 9 explainer scenes, 8 looks, HyperFrames compiler, procedural SFX
packages/ai        Firebase AI Logic hybrid router, 20+ tasks (10 on-device Nano), prompts, schema/cap guards, Lyria 2, BYOK
services/render    Cloud Run render service (@hyperframes/producer + FFmpeg parity compositor)
skills/            5 Reel Director Recipes & 8 Motion-Graphic Slot Skills (Markdown)
.kiro/             44 EARS specs, 21 steering docs, hooks, 8 Firebase Agent Skills & HyperFrames skills
docs/              plan, decisions (D-001..D-087+), third-party disclosure, demo scripts, hackathon write-ups
```

## Development

Requires Node 24 and pnpm 11.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in Firebase web config; never commit real keys
pnpm dev          # web app
pnpm test         # unit + fast-check property-based tests
pnpm typecheck && pnpm lint
```

## How we build

Spec-driven with **Kiro**, **Antigravity**, and **8 official Firebase Agent Skills**: steering rules in `.kiro/steering`, 44 specs in `.kiro/specs/<NN-feature>/` (requirements → design → tasks), and honest engineering logs in [`DEV_LOG.md`](DEV_LOG.md) and [`KIRO_LOG.md`](KIRO_LOG.md).

## Third-party resources

See [`docs/third-party.md`](docs/third-party.md).

## License

Apache-2.0. See [`LICENSE`](LICENSE).

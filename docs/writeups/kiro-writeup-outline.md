# Motionpop — Kiroween 2026 (`Frankenstein` Category) Devpost Write-Up

> **Category:** Frankenstein · **Tag:** `#KiroweenHackathon26`
> **Open Source:** Apache-2.0 (`https://github.com/AbhinavJawle/motionpop`) · `/.kiro` checked in at repo root
> **Interactive Architecture & Live Diagrams:** `/how-it-works`

---

## 1. What Motionpop Is

Motionpop is an open-source, agentic AI short-form video editor and motion-graphics studio for **Desktop Chrome**. Drop raw talking-head video, a voiceover, or a script—**Pip** auto-cuts dead air, hiccups and repeated takes non-destructively, directs deterministic `seek(tMs)` HTML/SVG motion graphics synced to every spoken word, edits locally on your device with **Chrome Gemini Nano via Firebase AI Logic** at $0 cost, and exports pixel-identical 1080p MP4s and transparent WebM overlays via Cloud Run.

---

## 2. The Frankenstein Monster — 12 Stitched Organs

Instead of calling one LLM and rendering one template, Motionpop stitches **12 distinct engines, models, DSP pipelines, and data planes** into one coherent product:

| # | Stitched Organ | What It Does & Exact Code Seam |
|---|---|---|
| 1 | **10 Chrome Gemini Nano Tasks** | Free, private, offline multimodal frame notes (`reel.note.local`, `note.fix`), instant Pip commands (`pip.quick`), free/offline reel directing (`reel.draft`), RFC 6902 quick edits (`edit.patch`), recipe parsing (`recipe.resolve`), slot auto-fill, chunked slot detection (`≤ 400w`), energy arcs & prompt prefill via **Firebase AI Logic** (`packages/ai/src/providers/firebase.ts`). |
| 2 | **Whisper WebGPU/WASM + Vocal Prosody** | `transformers.js` `whisper-base_timestamped` in a dedicated Web Worker (`apps/web/lib/transcribe/whisper-client.ts`) + local 70–400 Hz autocorrelation pitch & RMS stress scoring (`apps/web/lib/audio/prosody.ts`). |
| 3 | **Auto Video Cut, Retake, Hiccup & Dead-Air Engine** | 10 ms dBFS speech-energy map (`speech.ts`), LCS retake & false-start detector with tense/plural folding, parallel-list & negation-contrast guards (`retakes.ts`), dead-air (`> 380 ms`) & filler removal (`autocut.ts`), optional cloud `reel.edit` semantic second-opinion, and non-destructive EDL audio resplicing (`OfflineAudioContext`). |
| 4 | **Multi-Model Cloud AI Orchestra** | `gemini-4-neon` (21-template `reel.direct`, `pip.plan`, `reel.compose`, `film.direct`/`build`/`vision-critic`, `media.index`), `gemini-3.5-flash-lite`, `gemini-3.8-flash-tts` (5 voices + `PartCache`), `gemini-nano-banana-2.1` (1K illustrations + `#00FF00` chroma-key cutouts), **Vertex AI `lyria-002`** (crossfade-looped instrumental WAV soundtracks via `/api/reel/music`), plus a Remote Config Claude custom-code hook. |
| 5 | **Dual Deterministic Motion & Reel Engines** | **Reel Engine v3** (21 strict vertical templates, 4 stage layouts, 2 house looks + themes, 5 kinetic captions) + **Motion-Graphic & Film Engine** (9 responsive scenes, 8 OFL Style Packs, zero-crop 16:9 / 9:16 / 1:1 reflow) compiled from Project JSON into zero-GSAP pure `seek(tMs)` HyperFrames HTML (`packages/motion/`). |
| 6 | **4-Stage Custom Code & Vision QA Gate** | `lintCustom` static ban (`fetch`, `Date.now`, `Math.random`, timers, external URLs) → `@hyperframes/lint` → opaque sandboxed iframe DOM critic (overflow, safe zones, face overlap, WCAG contrast) → multimodal `film.vision-critic` self-repair loop (max 2 rounds). |
| 7 | **Procedural Web Audio SFX & Ducking Synth** | Zero stock SFX MP3s: 14 deterministic seeded takes across 5 families (`whoosh`, `pop`, `tick`, `rise`, `impact`) built from biquad filters, pitch-drop sine thumps and tanh noise carriers peak-aligned to entrances, plus procedural music beds and auto voice ducking (`packages/motion/src/sfx/`). |
| 8 | **6-Source Real-World Visual & Geo Resolvers** | Pixabay API (24 h cache, HD video & photo), Pexels fallback, Wikimedia Commons fallback (`/api/media/stock`), Openverse API (CC0/CC-BY with stored attribution & UUID anti-SSRF proxy via `/api/media/search`), Simple Icons CDN + Favicons (`/api/reel/logo` with SVG script stripping), Headless Chrome live web captures (`/api/reel/screenshot`), and offline Natural Earth `d3-geo` vector world maps. |
| 9 | **Database-Backed Modular `SKILL.md` System** | 5 built-in Reel Recipes (`skills/recipes/*.md`), 8 Motion Slot Skills (`skills/*.md`), plus custom user skills & GitHub `SKILL.md` imports validated by `UserSkillSchema` and synced bidirectionally with Cloud Firestore (`users/{uid}/skills/{id}`). |
| 10 | **7-Product Firebase Backbone** | Firebase AI Logic, App Check (reCAPTCHA Enterprise + limited-use tokens), Auth, Cloud Firestore (projects, skills DB, atomic server-only credit ledger), Cloud Storage, Remote Config (live routing & `kill_switch`), and App Hosting. |
| 11 | **Optional Zero-Server Browser BYOK** | Firebase AI Logic is the zero-setup default; power users can optionally store a Google AI Studio key in `localStorage` (`x-goog-api-key` direct to Google, keeping multimodal `chromeOnDeviceProvider` Nano first at 0 Motionpop credits). |
| 12 | **Cloud Run HyperFrames + FFmpeg Parity Renderer** | `services/render` steps `@hyperframes/producer` through the exact compiled preview HTML at 30 fps (`≤ 1.02%` pixel diff), compositing A-roll cuts, B-roll, alpha overlays and ducked audio into 1080p MP4, transparent WebM overlays and public `/share/[id]` links. |

---

## 3. How We Used Kiro (Full Breadth Across Surfaces, Specs, Steering, Agents, Hooks, MCP & PBT)

Everything below is genuinely checked into `/.kiro` and logged honestly in [`KIRO_LOG.md`](../../KIRO_LOG.md) and [`DEV_LOG.md`](../../DEV_LOG.md):

- **Kiro CLI (142 Logged Runs) + Antigravity + Claude Code:**
  - We used **Kiro CLI** (`kiro-cli chat --agent motionpop-builder`) for scoped, spec-task-at-a-time implementation across **142 logged sessions** in `KIRO_LOG.md`, while pairing with **Antigravity** and **Claude Code** for architecture spikes, visual verification, and adversarial audits.
- **3 Custom Scoped Agents (`.kiro/agents/`):**
  - `motionpop-builder.json` — implements one spec task at a time with strict `allowedPaths` (`apps/**`, `packages/**`, `services/**`, `skills/**`, `.kiro/specs/**`), explicit `deniedPaths` (`.env*`, `**/*.pem`, `.kiro/steering/**`, `.kiro/agents/**`, `LICENSE`), and `deniedCommands` (blocks `git push`, `rm -rf`, `firebase deploy`, `gcloud`, `curl`, `sudo`).
  - `motion-qa.json` — visual & determinism motion verification agent.
  - `spec-reviewer.json` — reviews completed spec tasks against EARS acceptance criteria before merge.
- **3 Automated Agent Hooks (`.kiro/hooks/scripts/`):**
  - `session-start.mjs` (`SessionStart`) — injects active spec context and records exact run start time.
  - `check-touched.mjs` (`PostToolUse`) — automatically runs scoped checks on touched packages right after edits so broken types/lint never compound.
  - `log-run.mjs` (`Stop`) — automatically appends every Kiro CLI session's commits, duration, and agent metadata to `KIRO_LOG.md`.
- **44 EARS Specs (`.kiro/specs/00-walking-skeleton` → `43-modular-user-skills`):**
  - Every major subsystem (Whisper audio pipeline, slot detection, timeline undo/redo, HyperFrames parity renderer, Reel Engine v3, Lyria 2 music, LCS auto-retake cutting, Paper Editor, Video-First Recipes, `/how-it-works`, BYOK, Firestore modular skills) followed `requirements.md` (EARS) → `design.md` → `tasks.md`.
  - **Spec-driven vs vibe coding:** On complex state machines (integer-ms EDL cuts, atomic Firestore credit ledger, preview-vs-FFmpeg parity), specs let `motionpop-builder` land complex tasks in **one pass with zero follow-up questions**, whereas small visual polish moved faster in interactive sessions.
- **21 Steering Docs (`.kiro/steering/` — `always` + `fileMatch` inclusion):**
  - `component-contract.md` and `motion-principles.md` kept every animation strictly deterministic (`seek(tMs)`, zero GSAP).
  - `hybrid-ai.md` & `ai-tasks.md` locked in Gemini Nano's real constraints (depth ≤ 3, ≤ 6 optional props, `maxLength` caps, D-035 no silent cloud charges).
  - `security-and-cost.md` enforced App Check, server-only credit ledgers, and zero-SSRF open media fetching.
- **3 Live MCP Servers (`.kiro/settings/mcp.json`) + 15 Bundled Skills (`.kiro/skills/`):**
  - `context7` (pulled live `@firebase/ai` 3.1.0 & Next.js 16 docs instead of stale training knowledge), `chrome-devtools` (real browser inspection of renders & responsive layouts), and `firebase-tools` MCP (Firestore/App Hosting/Rules workflows), backed by **8 official Firebase Agent Skills** and **HyperFrames skills**.
- **Property-Based Testing (`fast-check`) Caught Real Bugs Unit Tests Missed:**
  - `packages/ai/src/reel/hybrid-local.test.ts` (350 `fast-check` runs) fuzzed `draftToReelPlan`, `applyReelNoteLocal`, and `pipQuickToModelOutput` against adversarial Nano outputs (out-of-bounds words, NaN values, invalid layouts on speaker templates, hex colours placed in `choice` instead of `instruction`—catching a real silent-drop bug in `setReelTheme`!).
  - `packages/ai/src/schema-rules.test.ts` & `schema-caps.test.ts` caught our own initial violation of `MAX_OPTIONAL = 6` and missing `maxLength` caps on Nano schemas before shipping.
  - `services/render/src/store/ledger-logic.property.test.ts` & `packages/motion/src/scenes/gate.property.test.ts` prove credit conservation and zero text overflow across `16:9`, `9:16`, and `1:1`.
- **Honest Moments Kiro Surprised Us & Real Friction (From `KIRO_LOG.md` & `DEV_LOG.md`):**
  - *Stop-hook bug caught on Run 1:* Our first `Stop` hook logged "commits since start: none" because it read the start timestamp from the first stop rather than session start—fixed immediately by adding `session-start.mjs`.
  - *Agent identity surprise:* On Run 1, `motionpop-builder` finished the task cleanly in one pass with 8 passing `fast-check` tests, then politely warned us it "hadn't run the motionpop-builder agent" because its prompt didn't explicitly state it was running inside Kiro CLI! Adding one line to `prompts/builder.md` fixed it permanently.
  - *HyperFrames `hf-seek` discovery:* Reading HyperFrames source rather than guessing revealed we could drive both preview and Cloud Run producer via pure `hf-seek` with zero GSAP—unblocking Apache-2.0 licensing and achieving `≤ 1.02%` pixel parity.

---

## 4. Verified Numbers

- **142** Kiro CLI sessions logged · **44** EARS specs · **21** steering docs · **3** custom scoped agents · **3** hook scripts · **3** MCP servers · **8** official Firebase Agent Skills
- **10** on-device Chrome Gemini Nano tasks · **7** Firebase products · **12** stitched Frankenstein organs · **6** external visual/open-media resolvers
- **21** reel templates · **9** responsive explainer scenes · **8** Style Packs · **14** procedural Web Audio SFX takes
- **236+ test files** (685 tests in `@motionpop/ai`, 1,600+ tests in `@motionpop/web`, plus `services/render` parity & ledger property suites) · **≤ 1.02%** verified preview-to-MP4 pixel diff

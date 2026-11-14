# motionpop

**Bring your voice. We'll bring the motion.**

Motionpop is an AI motion-graphics editor for creators. Record, upload or paste a voiceover, and premium animated graphics (charts, numbers, titles, maps, callouts) appear synced to the exact words you speak. Click a slot to generate, type a quick edit, draw on a frame, or ask Pip, our ghost mascot, to change the whole video.

- **Graphics follow your voice.** Word-level timings place graphic slots exactly where you say "forty percent", "Tokyo" or a name.
- **Premium by default.** A hand-crafted library of deterministic motion components and style packs, directed by readable director skills and filled in by AI.
- **Hybrid AI.** Small edits run on-device with Gemini Nano through Firebase AI Logic: instant, free and private, even offline. Heavy creative work runs in the cloud. Every action shows where it runs and what it costs before it runs.
- **Code-native superpowers.** One click to 9:16 (re-laid out, not cropped), captions on/off, export MP4.

> Status: in active development for **#BuildHybridAI 2026** (Firebase) and **Kiroween 2026** (Kiro). Plan: [`docs/plan.md`](docs/plan.md).

## How it works

```
voice ─▶ Whisper word timings (on-device) ─▶ cleanup (ums, long pauses) ─▶ slot detection (Gemini Nano / cloud)
      ─▶ motion components filled with params ─▶ HyperFrames composition ─▶ live preview ─▶ Cloud Run render ─▶ MP4
```

| Layer | Tech |
|---|---|
| App | Next.js, React, TypeScript, Tailwind CSS, Motion (UI animation), Zustand |
| AI | Firebase AI Logic hybrid inference: Gemini Nano on-device in Chrome + Gemini in the cloud; Gemini TTS; optional Claude for custom graphics |
| Backend | Firebase Auth, Firestore, Cloud Storage, Remote Config, App Check, App Hosting |
| Video | Our own deterministic motion core rendered with HyperFrames (player in the editor, producer on Cloud Run) |
| Audio | Whisper in a Web Worker (transformers.js), Web Audio for cleanup, waveform peaks and synthesized SFX |

## Repository

```
apps/web           Next.js app (dashboard, start, editor, styles, landing)
packages/schemas   zod schemas shared across the app
packages/motion    motion core, components, style packs, HyperFrames compiler + runtime, SFX synth
packages/ai        AI router (device vs cloud), tasks, prompts, cost accounting
services/render    Cloud Run render service (HyperFrames producer)
skills/            director skills (markdown) that direct each scene
design/            Figma screens and CSS export (visual source of truth)
.kiro/             Kiro steering, specs, agents, hooks, MCP settings, skills
docs/              plan, decisions, third-party disclosure, demo scripts, write-ups
```

## Development

Requires Node 24 and pnpm 11.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in Firebase web config; never commit real keys
pnpm dev          # web app
pnpm test         # unit + property-based tests
pnpm typecheck && pnpm lint
```

## How we build

Spec-driven: steering in `.kiro/steering`, one spec per feature in `.kiro/specs/<NN-feature>/` (requirements → design → tasks). Development sessions are logged honestly: Claude Code sessions in [`DEV_LOG.md`](DEV_LOG.md), Kiro sessions in [`KIRO_LOG.md`](KIRO_LOG.md).

## Third-party resources

See [`docs/third-party.md`](docs/third-party.md).

## License

Apache-2.0. See [`LICENSE`](LICENSE).

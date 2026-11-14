---
inclusion: always
---

# Tech stack

Versions checked 2026-11-14 and pinned at install. Verify fast-moving APIs (Firebase AI Logic, HyperFrames, transformers.js) against current docs (Context7 MCP or the installed skills) before coding.

## Runtime and tooling
Node 24, pnpm 11 workspaces, Turborepo 2, TypeScript 6 strict (`noUncheckedIndexedAccess`), ESLint, Prettier, Vitest, fast-check, Playwright, gitleaks in CI.

## App (`apps/web`)
- Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui (Radix), lucide-react icons (1.5 px stroke).
- `motion` (Motion for React) for **UI animation only**: springs, layout animations, gestures, Pip. Never inside video compositions.
- Zustand + Immer for editor state, command pattern for undo/redo, react-resizable-panels, sonner (toasts), cmdk (⌘K).
- zod 4 at every boundary; fast-json-patch (RFC 6902) for quick edits.
- Fonts: Geist and Geist Mono (self-hosted via `geist` package / next/font).

## Firebase (required for #BuildHybridAI)
- `firebase` JS SDK: **AI Logic** with hybrid inference, Auth (Google + email/password), Firestore, Cloud Storage, Remote Config, App Check (reCAPTCHA Enterprise).
- `firebase-admin` on the server (credits, renders, shares).
- Hosting: Firebase App Hosting (Next.js). Region **us-central1** for everything.

AI Logic shape (verified against docs 2026-11-14; re-check before coding):
```ts
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "firebase/ai";
const ai = getAI(app, { backend: new GoogleAIBackend() });
const model = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE });
// modes: PREFER_ON_DEVICE | ONLY_ON_DEVICE | PREFER_IN_CLOUD | ONLY_IN_CLOUD
// initializeDeviceModel() only after a user gesture (first download takes minutes)
```

## Video
- **HyperFrames** (Apache-2.0): `@hyperframes/player` (preview web component, sandboxed iframe), `@hyperframes/producer` (render to MP4/WebM), `@hyperframes/lint` (tier-2 checks). `@hyperframes/gcp-cloud-run` is the upgrade path for long videos.
- Our own deterministic motion core in `packages/motion` drives every frame through HyperFrames' `hf-seek` event. **No GSAP anywhere in product code** (its licence excludes no-code animation tools).
- Maps: d3-geo + topojson-client + Natural Earth (public domain).
- Render service: Cloud Run (`services/render`), built with Cloud Build.

## AI
- All runtime AI goes through `packages/ai` (router, tasks, prompts, zod, cost). See `hybrid-ai.md` and `ai-tasks.md`.
- On-device: Gemini Nano via AI Logic. Cloud: `gemini-3.5-flash-lite` for fast tasks, a stronger Gemini for plans and slot detection (Remote Config). TTS: `gemini-3.1-flash-tts-preview` via AI Logic.
- Tier-2 custom graphics: provider flag `AI_CUSTOM_PROVIDER = gemini | claude`. Claude only if the Firebase organisers allow it; always allowed in the Kiroween build. Claude calls go through a server route with the key in Secret Manager.

## Audio
transformers.js Whisper in a Web Worker (WebGPU, WASM fallback) for word timings · Web Audio / OfflineAudioContext for cleanup, peaks, synthesized SFX and ducking.

## Explicit non-choices
No GSAP, no Remotion, no Rive, no ElevenLabs, no AWS services, no stock sound libraries.

## Environments
- **Local:** `pnpm dev` + Firebase Emulator Suite (Auth, Firestore, Storage); App Check debug token in `.env.local` (never committed).
- **Prod:** App Hosting (web) + Cloud Run (render) + Secret Manager, all in us-central1.
- **Two deployments:** `buildhybridai` (frozen at the `buildhybridai-submission` tag, live until Dec 16, 2026) and `main` (Kiroween, live until Jan 29, 2027).

## Browser support
Desktop Chrome 139+ is the target (Gemini Nano). Other browsers work with cloud fallback and the "Using cloud AI" toast.

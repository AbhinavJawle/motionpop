# Spec 42: Gemini BYOK & Hybrid AI Visibility — Requirements

## Goal
Let creators optionally bring their own Google AI Studio Gemini API key (BYOK), stored strictly in the browser, to run cloud Gemini tasks at 0 Motionpop credits while keeping Firebase AI Logic as the zero-setup default and keeping Chrome on-device Gemini Nano first for local tasks. Surface both **BYOK** and **local on-device AI** prominently across Settings, Dashboard, How it works, Configure, Credits, and Landing.

## Requirements (EARS)

- **R1 (Browser-only BYOK key storage & safety):**
  - When a user enters a Google AI Studio Gemini API key in Settings, the system shall validate its format with Zod, store it exclusively in browser `localStorage` (`mp:byok-gemini-key`), and never transmit it to Motionpop API routes, Firestore, Cloud Storage, or console logs.
  - When making Google AI Studio REST requests, the system shall pass the key exclusively via the `x-goog-api-key` HTTP header (never in URL query parameters) and redact the key from any thrown error messages.
  - The user shall be able to mask/reveal, test (live zero-token check against `GET /v1beta/models?pageSize=1`), switch model tier (`balanced` vs `flash`), and clear the key at any time, resetting the browser AI router immediately without a page reload.

- **R2 (Hybrid preservation & provider routing):**
  - When BYOK is active, the router shall continue to attempt Chrome on-device Gemini Nano first for `PREFER_ON_DEVICE` and `ONLY_ON_DEVICE` tasks, falling back to Google AI Studio REST only for cloud inference (`ONLY_IN_CLOUD`, `PREFER_IN_CLOUD`, or `PREFER_ON_DEVICE` when Nano is unavailable).
  - When BYOK is active, cloud Gemini text/JSON tasks, Gemini TTS (`tts.generate`), and Gemini image generation (`image.generate`) shall route to Google AI Studio REST with mapped public Gemini model IDs (`gemini-2.5-pro` / `gemini-2.5-flash` / `gemini-2.5-flash-preview-tts` / `gemini-2.5-flash-image`).
  - When BYOK is not active, all routing and Firebase AI Logic behavior shall remain unchanged.

- **R3 (Zero Motionpop credit spend under BYOK):**
  - When BYOK is active, Gemini cloud actions shall report `0` Motionpop credits across `chooseRoute`, `CostChip`, `Configure` summary, and `CreditsClient`, shall not call `/api/credits/spend`, and shall not be blocked by insufficient balance or signed-out state (requiring only an internet connection).
  - Server-only capabilities (`lyria-002` music via `/api/reel/music` and Cloud Run MP4 export) shall remain transparently documented as Motionpop server-backed.

- **R4 (Cross-app surfacing of BYOK and Local On-Device AI):**
  - **Settings (`#ai` / `#byok` & `#credits`):** Full BYOK configuration card alongside the existing on-device Gemini Nano toggle/status, plus a clear BYOK/on-device note in Credits.
  - **Dashboard (`/dashboard`):** A Spec 35 Paper strip highlighting both **Local On-Device AI (Gemini Nano)** (with live availability status and setup CTA when downloadable) and **Bring Your Own Key (Gemini BYOK)** (with live status and direct link to `/settings#byok`).
  - **AppBar:** Compact `BYOK` badge when a key is active.
  - **How it works (`/how-it-works`):** Document BYOK in the Hybrid AI section & diagram, Routing/Pricing section, and Security section.
  - **Landing (`/`):** Mention optional Gemini BYOK alongside free on-device Gemini Nano in the Hybrid AI, Pricing, and FAQ copy.

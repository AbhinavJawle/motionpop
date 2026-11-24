# Spec 42: Gemini BYOK & Hybrid AI Visibility — Design

## 1. Provider Layer (`packages/ai/src/providers/gemini-byok.ts`)
- Exported at `@motionpop/ai/byok` (and key helpers/types re-exported cleanly without pulling Firebase SDK into server code).
- `GeminiApiKeySchema`: trimmed string, 20–128 printable ASCII chars, no whitespace.
- `ByokModelModeSchema`: `'balanced' | 'flash'`.
  - `byokModelFor(requestedModel, mode)`:
    - Maps Vertex/AgentPlatform internal names (`gemini-4-*` → `gemini-2.5-pro` in `balanced` or `gemini-2.5-flash` in `flash`; `gemini-3.5-*`/`gemini-3.8-flash` → `gemini-2.5-flash`; `*-tts*` → `gemini-2.5-flash-preview-tts`; `*nano-banana*`/`*image*` → `gemini-2.5-flash-image`).
    - Passes standard `gemini-2.*` / `gemini-3.*` AI Studio IDs through.
- `geminiByokProvider({ apiKey, onDevice, modelMode, fetchImpl })`:
  - Implements `AIProvider` (`generate(req)`).
  - For `ONLY_ON_DEVICE`: requires `onDevice` (Firebase on-device or direct Chrome Prompt API) and never calls the cloud.
  - For `PREFER_ON_DEVICE`: tries `onDevice` with `mode: 'ONLY_ON_DEVICE'` first; on unavailability/error, falls back to Google AI Studio REST.
  - For `ONLY_IN_CLOUD` / `PREFER_IN_CLOUD`: calls `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }`.
  - Strips unsupported JSON Schema keywords (`$schema`, `additionalProperties`) recursively if needed for AI Studio `responseJsonSchema` compatibility, uses `responseMimeType: 'application/json'` and `responseJsonSchema`, passes `systemInstruction` and `inlineData` parts for `media`/`mediaList`.
  - Redacts `apiKey` (and `AIza[A-Za-z0-9_-]{10,}`) from every thrown error.
- `testGeminiApiKey(apiKey, fetchImpl?)`: calls `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=1` with `x-goog-api-key` header (0 tokens). Returns `{ ok: true } | { ok: false; message: string }`.
- `speakWithGeminiByok(apiKey, model, input, now?, onPart?, partCache?, fetchImpl?)`: mirrors `speakWithFirebase` over AI Studio REST (`responseModalities: ['AUDIO']`, `speechConfig`).
- `generateImageWithGeminiByok(apiKey, model, input, now?, wait?, fetchImpl?)`: mirrors `generateImageWithFirebase` over AI Studio REST (`responseModalities: ['IMAGE']`, `imageConfig`).

## 2. Browser Store & Router (`apps/web/lib/ai/byok.ts` & `router-client.ts`)
- `useByok()` backed by `useSyncExternalStore` + `localStorage` (`mp:byok-gemini-key`, `mp:byok-gemini-mode`) + cross-tab `storage` listener.
- `setByokKey(key)` / `clearByokKey()` / `setByokModelMode(mode)` validate with Zod, persist locally, notify subscribers, and call `resetRouter()`.
- `router-client.ts`: exports `resetRouter()`. When `getByokKey()` is set (and not in `fake` mode), creates a router using `geminiByokProvider` with `onDevice` backed by `firebaseProvider(getAILogic)` (when Firebase is enabled) or direct Chrome `LanguageModel` on-device fallback.

## 3. Zero-Credit Accounting (`byok-credits.ts`, `use-credits-client.ts`, `route.ts`, `summary.ts`)
- `ByokCredits` (`apps/web/lib/credits/byok-credits.ts`) wraps the active `CreditsClient | null`: delegates `balance()`/`subscribe()` to the inner client, marks `isByok = true`, and resolves `spend()` locally with `cost: 0` without calling `/api/credits/spend`.
- `spendWithUi` skips `blockIfInsufficient` when `client.isByok === true`.
- `useCreditsClient()` returns `ByokCredits` + `cloudAvailable: true` + `byok: true` whenever a BYOK key is saved (outside `fakeAi`).
- `chooseRoute` + `useRoute` accept `byok?: boolean`: when `byok: true`, cloud routes return `credits: 0, insufficient: false, byok: true`, and `CostChip` renders `BYOK · 0`.
- `summarize` accepts `byok?: boolean`: Gemini steps show `Free · your key` (`0` credits) and never block on sign-in or low balance.

## 4. UI Surfaces (Spec 35 Paper)
- `apps/web/components/settings/byok-card.tsx` inside `AISection` (works in both `page` and editor `panel` variants).
- `apps/web/components/dashboard/ai-modes-banner.tsx` inside `DashboardScreen`.
- `apps/web/components/paper/app-bar.tsx`: compact `BYOK` indicator pill when active.
- `apps/web/components/how-it-works/how-it-works-page.tsx` & `diagrams.tsx`: BYOK documentation across Hybrid AI, Routing, and Security sections.
- `apps/web/components/settings/credits-section.tsx` & `apps/web/components/landing/copy.ts`: consistent BYOK + local on-device AI mentions.

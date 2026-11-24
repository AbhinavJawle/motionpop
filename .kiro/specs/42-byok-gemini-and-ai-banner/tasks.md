# Spec 42: Gemini BYOK & Hybrid AI Visibility — Tasks

- [x] 1. Implement `packages/ai/src/providers/gemini-byok.ts` (`geminiByokProvider`, `testGeminiApiKey`, `byokModelFor`, `speakWithGeminiByok`, `generateImageWithGeminiByok`, `chromeOnDeviceProvider`, key/error sanitization) + export in `packages/ai/package.json` & `src/index.ts` + unit tests (`gemini-byok.test.ts`).
- [x] 2. Implement browser BYOK store (`apps/web/lib/ai/byok.ts` + `byok.test.ts`), wire `resetRouter()` & BYOK provider in `apps/web/lib/ai/router-client.ts`, and wire BYOK TTS/image paths in `generate-voice.ts`, `images/generate.ts`, `reel/media.ts`, and `video/stock-media.ts`.
- [x] 3. Implement zero-credit BYOK credits & routing (`apps/web/lib/credits/byok-credits.ts`, `spend-with-ui.ts`, `use-credits-client.ts`, `spend-callers.test.ts`, `route.ts`, `use-route.ts`, `chip.tsx`, `summary.ts`, `configure-screen.tsx`) + tests.
- [x] 4. Surface BYOK & Local On-Device AI across Settings (`byok-card.tsx`, `ai-section.tsx`, `credits-section.tsx`), Dashboard (`ai-modes-banner.tsx`, `dashboard-screen.tsx`), AppBar (`app-bar.tsx`), How it works (`how-it-works-page.tsx`, `diagrams.tsx`), and Landing (`landing/copy.ts`) + tests.
- [x] 5. Run full verification (`prettier`, `tsc --noEmit`, `eslint`, Vitest suites) and log in `DEV_LOG.md`.

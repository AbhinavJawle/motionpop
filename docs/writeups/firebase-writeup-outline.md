# #BuildHybridAI write-up outline (true details only)

## Value proposition
Creators get premium motion graphics synced to their voice in seconds. Hybrid inference makes edits instant, free and private, and keeps cloud costs low enough for a cheap product.

## How we use Firebase AI Logic (point to files)
- Routing layer `packages/ai/src/router.ts`: tasks with modes (PREFER_ON_DEVICE / PREFER_IN_CLOUD / ONLY_IN_CLOUD), zod validation, repair, fallback.
- On-device (Gemini Nano in Chrome): quick edits → JSON patches, component param filling, captions chunking, prompt prefill, slot detection for short transcripts. Works offline.
- Cloud (Gemini): long transcripts, Pip whole-video plans, transcription fallback, custom compositions.
- Users see where each action runs and what it costs before it runs.
- Measured stats: % of AI calls on-device, median latency device vs cloud, credits saved (from usage events).

## Other Firebase products
App Check (required, reCAPTCHA Enterprise), Authentication (Google + email link), Firestore (projects, slots, versions, usage, credits ledger), Cloud Storage (audio, renders), Remote Config (model routing table, prompt versions, budget kill-switch, feature flags), App Hosting.

## Features summary
## What we built during the submission period
## Challenges and learnings (Nano availability, small-context prompting, JSON reliability on-device)
## What's next

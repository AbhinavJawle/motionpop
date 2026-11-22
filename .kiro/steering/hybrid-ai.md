---
inclusion: always
---

# Hybrid AI (Firebase AI Logic) and routing

Hybrid inference is a core product feature, not a checkbox. Users always see where an action runs.

## Gemini Nano facts (official docs, checked 2026-11-14)
- Desktop Chrome 139+ with the `prompt-api-for-gemini-nano-multimodal-input` flag (judges: we document this; cloud fallback otherwise).
- `initializeDeviceModel()` must run after a user gesture; the first download takes minutes. Show progress, never block.
- On-device input: **text and JPEG/PNG images only (no audio)**. JSON structured output supported. **Single-turn only, no tools.** Max 9,216 tokens multimodal.
- Consequences: quick edits and frame notes are single-turn JSON on-device. Pip conversations, audio transcription and TTS go to the cloud.

## Routing table (defaults; Remote Config can override)
| Task | Mode | Why |
|---|---|---|
| `edit.patch` (quick edit) | PREFER_ON_DEVICE | instant, free, private, works offline |
| `note.fix` (frame note: text + JPEG crop) | PREFER_ON_DEVICE | image input supported on-device |
| `component.fill` auto-fill after processing | PREFER_ON_DEVICE | small structured output, free |
| `component.fill` on **Generate** | ONLY_IN_CLOUD | the explicit 3-credit upgrade |
| `prompt.prefill`, `captions.chunk` | PREFER_ON_DEVICE (captions: deterministic fallback) | short text |
| `slots.detect` ≤ 400 words | PREFER_ON_DEVICE | fits the small model |
| `slots.detect` > 400 words, device ready | PREFER_ON_DEVICE in chunks of ≤ 400 words (sentence ends), merged | free; a chunk that fails twice sends the whole transcript to the cloud (spec 13b R4.3) |
| `slots.detect` > 400 words without the device model, `pip.plan` | PREFER_IN_CLOUD | longer context, multi-step reasoning |
| `custom.compose` (tier 2) | ONLY_IN_CLOUD (Claude or Gemini per flag) | heavy generation |
| `reel.note`, `reel.compose` (reel frame notes) | ONLY_IN_CLOUD (`modelStrong`) | founder decision D-078: notes on reels get the frontier model and may rewrite their scene |
| `tts.generate`, `transcribe.cloud` | ONLY_IN_CLOUD | audio is not supported on-device |

## Rules
- Every call goes through `packages/ai/src/router.ts`: `run(task, input, opts) → { output, ranOn: "device" | "cloud", model, costCredits, latencyMs }`.
- Every output is JSON validated with zod. Parse failure → one repair attempt → fallback (cloud or component defaults).
- Show the route in the UI before the action: mint chip `⚡ free · on-device` or violet chip `☁ N`. The Pip input hint switches between `⚡ free · on-device` and `☁ ~N credits` based on the estimated route.
- Detect availability at startup → toast "On-device AI ready" (mint) or "Using cloud AI" (violet). Offline: on-device edits keep working; cloud actions are disabled with "Needs connection".
- Log `ranOn`, model, latency and credits per call (`users/{uid}/usage`) for the settings usage chart and the write-up stats.
- App Check is required for AI Logic. No server keys in the client.

---
inclusion: fileMatch
fileMatchPattern: ["packages/ai/**", "apps/web/app/api/**"]
---

# AI task catalogue (contracts)

Every runtime AI call is one of these tasks, defined in `packages/ai/src/tasks/<task>.ts` with: `id`, `defaultMode`, `inputSchema`, `outputSchema` (zod), `prompt` (file in `prompts/`), `cost` (credits when cloud), `maxLatencyMs`, `fallback`. The router (`run(taskId, input, opts)`) picks device vs cloud, validates, repairs once, records usage, and returns `{ output, ranOn, model, costCredits, latencyMs }`.

General prompt rules (all tasks):
- Output **JSON only**, matching the schema. No prose, no markdown fences.
- **Never invent data.** Numbers, names, dates come only from the user's words or inputs. Missing → `needsInput`.
- Keep outputs small (on-device context is limited). Pass compact inputs (word index + text + ms).
- Prompts are versioned (`prompts/<task>.v1.ts`, exported string constants, so no bundler loader is needed in Next, Vitest or Cloud Run); active version selectable in Remote Config.
- AI Logic setup is in `tech.md`; Nano limits are in `hybrid-ai.md` (single-turn, text + JPEG/PNG, JSON output, ≤ 9,216 tokens). Use structured output (response schema) where supported; always still validate with zod.
- Re-check the SDK against current docs (Context7 / `firebase-ai-logic-basics` skill) before changing a provider.

### Schema rules (D-029, apply to every task)
- Structured output on both routes (`responseJsonSchema` in the cloud, `responseConstraint` on-device), then zod again: constrained decoding guarantees shape, not sense.
- Ids are **string enums** (scene, variant, cue, role, component, skill). Never free strings for anything the code looks up.
- Schemas stay small and flat: depth 3 at most, at most 6 optional properties per object, enums of 40 values at most. These are our own limits, chosen to keep prompts small for the on-device model; the Firebase structured-output page (read 2026-11-15) gives no numeric limits. It does say the schema counts toward input tokens, unsupported fields are ignored silently, and the supported subset is `enum`, `items`, `maxItems`, `nullable`, `properties`, `required`. So never rely on `minimum`, `maxLength` or `format` being enforced by the model: zod enforces them.
- Don't paste the JSON schema into the prompt text. Describe intent and give examples instead.
- One slot per fill call, in parallel. Only tiny per-row plans go in a single call.
- Give 2 hand-approved examples (input → output) per call where a library exists.
- A failed check goes back to the same model as a structured report (actor, rule, measured, limit, hint), for at most the task's repair limit, then the deterministic fallback.

---

## 1. `slots.detect`
- **Mode:** PREFER_ON_DEVICE if transcript ≤ 400 words, else PREFER_IN_CLOUD. Cost cloud: 1 credit per 200 words (min 1).
- **Input:** `{ words: [i, text, startMs, endMs][], candidates: TaggedSpan[], components: CatalogueEntry[], skills: SkillEntry[], maxSlots: number, language }`
- **Output:** `SlotSuggestion[]`:
  ```ts
  { wordStart: number; wordEnd: number; componentId: string; skillId: string;
    reason: string;            // must quote the exact words, e.g. "revenue grew forty percent since 2020"
    score: number;             // 0..1
    params: Record<string, unknown>; // validated later against the component schema
    needsInput?: string[] }
  ```
- **Rules in prompt:** prefer numbers, comparisons, places, dates, names, lists, key claims; ~1 slot per 4–6 s of speech; never overlap; each slot spans the words that justify it; choose the component whose `use_when` fits; extract values exactly as spoken ("forty percent" → 40, unit "%").
- **Post-pass (code, not AI):** snap to word boundaries, de-overlap by score, enforce ≥ 400 ms gaps and component min/max durations, validate params, fill defaults.

## 2. `prompt.prefill`
- **Mode:** PREFER_ON_DEVICE. Free.
- **Input:** `{ slot: { reason, componentId, skillId }, style: { id, name } }`
- **Output:** `{ prompt: string }` (one sentence, ≤ 140 chars, e.g. "A clean, animated bar chart with warm orange bars and an editorial feel.")

## 3. `component.fill`
- **Mode:** PREFER_ON_DEVICE for **auto-fill** after processing (free). ONLY_IN_CLOUD when the user clicks **Generate**: **3 credits** (as in the design's "☁ 3" chip).
- **Input:** `{ componentId, paramsSchemaSummary, words: string, prompt: string, currentParams?, styleId, skill: { shotSequence, emphasis } }`
- **Output:** `{ params: object, needsInput?: string[] }` → parsed with the component zod schema.
- **Fallback:** auto-fill: cloud is NOT used automatically (no surprise spend); fall back to component defaults with `needsInput` flagged. Generate: one repair, then defaults + error state.

## 4. `edit.patch` (quick edits + frame notes)
- **Mode:** PREFER_ON_DEVICE. Free on-device; cloud 1 credit.
- **Input:** `{ componentId, paramsSchemaSummary, currentParams, instruction, note?: { tMs, region: {x,y,w,h} } }`
- **Output:** `{ patch: JsonPatchOp[], escalate?: boolean, message?: string }` (RFC 6902; only `replace`/`add`/`remove` on param paths; timing changes via `/timing/*`).
- **Validation:** apply patch to a copy → parse with component schema. Invalid → repair once → cloud. `escalate: true` means "needs a new generation" → suggest Generate.
- **Examples:** "slower" → `replace /timing/speed 0.8`; "make the last bar red" → `replace /highlightIndex 2` + `replace /colors/highlight "negative"`; "change 2022 to 150k" → `replace /data/2/value 150000`.

## 4b. `note.fix` (frame notes)
- **Mode:** PREFER_ON_DEVICE. Free on-device; cloud 1 credit.
- **Input:** `{ componentId, paramsSchemaSummary, currentParams, note: { text, tMs, region: {x,y,w,h} }, image: JPEG crop of the noted region (≤ 512 px) }`. Nano accepts JPEG/PNG + text in one single-turn prompt.
- **Output:** same as `edit.patch`. The note is marked `fixed` when the patch applies; the user can reopen it ("still there").

## 5. `captions.chunk`
- **Mode:** ONLY_ON_DEVICE with deterministic fallback (no AI) if unavailable. Free.
- **Input:** `{ words: [i, text, startMs, endMs][] }`
- **Output:** `{ lines: { wordStart: number; wordEnd: number; emphasis: number[] }[] }` (1–3 words per line for 9:16, up to 6 for 16:9; emphasis = word indices to highlight).

## 6. `pip.plan`
- **Mode:** PREFER_IN_CLOUD (multi-turn context; Nano is single-turn). A single-slot, single-step request may run on-device (the input hint then shows "⚡ free · on-device"). Cloud cost: 2 credits + resulting generations, shown as "☁ ~N credits" before sending and in the plan card before Apply all.
- **Input:** `{ projectSummary: { format, styleId, brand, slots: [{ id, componentId, reason, status }] }, message, scope: "video" | { slotId } }`
- **Output:**
  ```ts
  { summary: string;
    steps: { action: "updateSlot" | "addSlot" | "removeSlot" | "setStyle" | "setCaptions" | "generateSlot" | "setFormat";
             args: Record<string, unknown>; label: string }[];
    estimatedCredits: number }
  ```
- **Execution:** each step maps to an editor command; all steps run inside one composite command (single undo).

## 7. `custom.compose` (tier 2)
- **Mode:** ONLY_IN_CLOUD. Provider: `AI_CUSTOM_PROVIDER` = `gemini` (default, Firebase AI Logic) or `claude` (server route, key in Secret Manager; only if allowed for the Firebase entry, always OK for Kiroween). Cost: 3 credits.
- **Input:** `{ brief, words, durationMs, format, style: StylePack, skill: DirectorSkill (full text), contract: componentContractSummary, examples: 1–2 library component sources }`
- **Output:** `{ html: string; css: string; script: string; params: JSONSchema; keyMomentMs: number }`: a HyperFrames sub-composition implementing the same `seek(t)` contract (component-contract.md) using only `@motionpop/motion` core helpers. No GSAP.
- **Checks before saving:** static lint (no `Date.now`, `Math.random`, timers, `fetch`, CSS animations, external URLs, GSAP) + `@hyperframes/lint` → sandbox mount → stills at 0 %, key moment, 90 % → layout checks (overflow, safe area, contrast) → save version. Fail → 1 retry with errors fed back → else suggest nearest library component.

## 8. `tts.generate`
- **Mode:** ONLY_IN_CLOUD. Provider: Gemini TTS (`gemini-3.8-flash-tts`, D-026) through Firebase AI Logic. Cost: 2 credits per started minute.
- **Input:** `{ text, voiceId, speed }` → **Output:** audio file in Storage + duration.

## 9. `transcribe.cloud` (fallback)
- **Mode:** ONLY_IN_CLOUD (Gemini audio understanding via Firebase AI Logic). Cost: 1 credit per started minute.
- **Output:** `{ words: { text, startMs, endMs, conf }[] }` validated; if timestamps are coarse, mark `timingQuality: "approx"` and warn in UI.

## 10. `brand.extract` (no LLM required)
- Server route; deterministic parsing of the site (favicon/logo, theme colours, CSS variables, fonts). Optional `component.fill`-style cleanup.

---

## Cost table (credits; Remote Config can change)
| Action | Credits |
|---|---|
| Any on-device task | 0 |
| slots.detect (cloud) | 1 per 200 words |
| component.fill on Generate (cloud) | 3 |
| edit.patch / note.fix (cloud fallback) | 1 |
| pip.plan | 2 + generations |
| custom.compose | 3 |
| tts.generate | 2 per minute |
| transcribe.cloud | 1 per minute |
| Export 720p / 1080p / 4K (≤ 60 s) | 3 / 5 / 10 |
| BYOK (post-hackathon, not in MVP) | AI calls 0, render still charged |

Free plan: **20 credits** on sign-up. Judge/test plan: larger allowance from Remote Config (default 500). The design's "120" chip just shows a balance.

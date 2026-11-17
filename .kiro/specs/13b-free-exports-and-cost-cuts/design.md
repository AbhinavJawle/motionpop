# Spec 13b · Free exports and cost cuts · design

Written in a Claude Code session (Opus 5.5, 2026-11-17). Nothing in this spec may be checked with a paid call: the Vertex spend cap is reached. Tests use fakes; savings are estimates until a hosted run.

## 1. Where the founder's money goes (by call path)
| Source | Today | Cut |
|---|---|---|
| Film mode | ~20 calls per 37 s film on `gemini-3.8-flash`, director thinking HIGH, builders MEDIUM, up to 2 repairs, $0.29–0.40 | R3: fast builders, lower thinking, 1 repair, shared prefix for implicit caching. Estimate $0.05–0.10 |
| Generate (component.fill, cloud) | one fast-model call | output cap only |
| `slots.detect` > 400 words | strong model, cloud | R4.3 chunked on-device; R4.1 cache |
| `pip.plan` | strong model | output cap |
| TTS | one call per ≤ 1,200-char part | R4.2 cache by part |
| Image model | per picture, only on request | unchanged; pictures on first load come from the free open media search (spec 07c) |
| Export (Cloud Run) | ~11× real time, cold start 1.5–2.5 min | R2 reuse identical renders; R1.4 daily limit stays |

## 2. Free exports (R1)
- `packages/schemas/src/render.ts`: `DEFAULT_EXPORT_CREDITS = { '720p': 0, '1080p': 0 }`. `exportCost` already multiplies; 0 stays 0. `ExportCreditsSchema` must accept 0 (check it is `nonnegative`, not `positive`).
- `costOf('export', …)` returns 0. Wherever the export flow spends (`apps/web/lib/renders/export-flow.ts`, `apps/web/lib/renders/handlers.server.ts`, the render service ledger in `services/render/src/store/`), a cost of 0 skips the spend and the refund. The server route still checks auth, App Check, the daily limit and the export cap.
- UI: the export modal shows a mint "Free" chip where the credit chip was; ledger texts and the landing page drop export prices.

## 3. Render reuse (R2)
- `renderKey = sha256(compiledHtml + '\n' + sortedAssetHashes.join(',') + '\n' + JSON.stringify(options))`, computed on the server in the export handler from the same compile the job uses (`projectCompileInput` + `compileProject`, assets by hash). Stored as `renders/{id}.key`.
- Before creating a job: query the caller's renders with that key, status `ready`, output object still present (Storage `exists`). If found: return it (`reused: true`), no job, no limit increment. Otherwise proceed as today and store the key.
- Firestore: a single-field equality query on `key` + `uid` needs no composite index if filtered by `uid` and `key` only (check; if it needs one, store the key in the doc id `renders/{uid}_{key}` lookup doc instead).

## 4. Film mode (R3)
- `APP_CONFIG_DEFAULTS.modelFilmBuild = 'gemini-3.5-flash-lite'`.
- `packages/ai/src/tasks/film.ts`: thinking `film.direct` MEDIUM, `film.build` LOW, `film.props` LOW.
- `apps/web/lib/film/film.ts` passes `maxRepairs: 1` to `makeFilm`.
- Prompt order: `filmBuildPromptV1` currently mixes the film and the beat. Split into `filmSharedV1(input)` (thesis, world, recurring element, props, the whole beat list with indices, format, look) and `filmBeatV1(input)` (this beat's index, words with times, duration, seams). The request is system instruction, then a first user part with the shared text, then a second part with the beat text. Repairs append after that. Test: two beats of one film give byte-identical shared parts.
- Implicit caching facts (checked 2026-11-17 against Google's context-cache overview and the Gemini 2.5 implicit caching announcement): automatic for Gemini 2.5 and later, cached input billed at 10 % of the input rate, no storage fee, minimum prefix size depends on the model (1,024–4,096 tokens and up). The film builder's system instruction plus the film text is about 5–7k tokens, so it should qualify. Not measured yet.

## 5. Output caps (R3.5)
A `maxOutputTokens` on every cloud task definition, read by the provider. Sizes: edit/note 1,024; prefill 512; component.fill 2,048; slots.detect 4,096; pip.plan 4,096; custom.compose and film.build 8,192; film.direct 6,144; film.props 6,144; transcribe.cloud as today. Thinking tokens count against the cap on these models, so caps include the thinking budget. If the provider in `packages/ai/src/providers/firebase.ts` already sets `generationConfig`, add the field there.

## 6. Caches (R4)
- `packages/ai/src/cache.ts`: `RouterCache { get(key), set(key, value, ttlMs) }`, an in-memory implementation for tests, an IndexedDB implementation in `apps/web/lib/ai/` (store `ai-cache`, bump the IDB version in `apps/web/lib/storage/idb.ts` and add the migration note). The router takes an optional `cache` and a per-task `cacheable: true` flag; key = `sha256(task + promptVersion + model + stableJson(input))`. Only successful, zod-valid outputs are stored.
- Voice parts: `apps/web/lib/tts/generate-voice.ts` looks up each part by `sha256(text + voice + model)` in IDB (`tts-cache` store) before calling; stores the PCM/WAV it gets. 30-day TTL, at most 50 MB (oldest out first).
- Chunked on-device detection: `packages/ai` gets `detectInChunks(words, maxWords, run)` that splits on sentence ends under the limit, runs each chunk with its word offset, and merges; the existing post-pass (snap, de-overlap, gaps) runs once on the merged list. The route for `slots.detect` > max words becomes PREFER_ON_DEVICE-with-chunks when the device model is ready, else the cloud as today.

## 7. Testing
- schemas: export cost 0 by default; override still works; `ExportCreditsSchema` accepts 0.
- web: export flow with cost 0 calls no spend; the modal shows "Free"; render reuse handler (same key → reused, different options → new job, missing object → new job); TTS cache hit makes no call.
- ai: thinking levels and models per film task; `filmShared` identical across beats; `maxOutputTokens` present on every cloud task; router cache hit/miss/expiry/invalid-output-not-stored; `detectInChunks` (property: chunks cover all words in order, none over the limit, merged slots never overlap).
- No paid calls anywhere. Playwright not required.

## 8. Not in scope
Client-side export rendering, distributed rendering, a vision critic for film beats, explicit (paid-storage) context caches.

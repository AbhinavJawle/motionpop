# Design: 00 walking skeleton

## Overview
```
/dev/skeleton (client page)
  ├─ <input type=file> → whisper.worker.ts (transformers.js) → Transcript (zod)
  ├─ Detect → @motionpop/ai run("slots.detect") → SlotSuggestion[] (zod) + ranOn
  ├─ compileProject(project) → composition HTML (string)
  │     └─ <hyperframes-player srcdoc=…>  (preview, seek/play)
  ├─ Quick edit → run("edit.patch") → patch → apply → validate → recompile
  └─ "Export bundle" → writes composition dir (dev only) → services/render skeleton script → MP4
```

## Packages touched
| Package | What the skeleton adds |
|---|---|
| `packages/schemas` | `time.ts` (`msToFrame`, `frameToMs`, `Ms` branded int), `transcript.ts`, `slot.ts` (SlotSuggestion), `ai.ts` (RunResult, JsonPatchOp) |
| `packages/motion` | `core/` v0: `ease.ts` (outExpo, outCubic, inOutCubic, linear), `tween.ts` (`interp(t, t0, t1, from, to, ease)`), `count.ts`; `components/big-number/` (params, layout 16:9 only, build); `compiler/compile.ts`; `runtime/runtime.ts` |
| `packages/ai` | `router.ts`, `providers/firebase.ts`, `tasks/slots-detect.ts`, `tasks/edit-patch.ts`, `prompts/*.v1.md` |
| `apps/web` | `app/dev/skeleton/page.tsx` (dev only, 404 in production), `workers/whisper.worker.ts`, `lib/firebase/client.ts` |
| `services/render` | `scripts/skeleton.ts` (producer `createRenderJob` + `executeRenderJob`) |

## Composition shape (compiler output)
```html
<!doctype html>
<html><head><meta charset="utf-8"><style>/* frame + component css */</style></head>
<body>
  <div data-composition-id="mp-root" data-width="1280" data-height="720" data-duration="18.0">
    <audio id="voice" class="clip" data-start="0" data-duration="18.0" src="voice.wav"></audio>
    <div id="slot-1" class="clip" data-start="4.2" data-duration="3.6"></div>
  </div>
  <script>window.__MP_PROJECT__ = { /* slots, params, style, format */ };</script>
  <script type="module" src="runtime.js"></script>
</body></html>
```
- Exact attribute names (`data-composition-id`, sizing, audio handling) are verified against the HyperFrames skill (`.kiro/skills/hyperframes`) and `packages/core` before task 5; adjust the compiler, not the contract.
- `runtime.js` (bundled from `packages/motion/src/runtime`) builds every slot's composition once, then:
```ts
window.addEventListener("hf-seek", (e) => {
  const tMs = Math.round(e.detail.time * 1000);
  for (const s of slots) {
    const local = tMs - s.startMs;
    s.el.style.visibility = local >= 0 && local < s.durationMs ? "visible" : "hidden";
    s.composition.seek(Math.min(Math.max(local, 0), s.durationMs));
  }
});
```
- Verified in the HyperFrames source (0.9.45): the runtime's TypeGPU and Three adapters are always registered and dispatch `hf-seek` (`{ time: seconds, waitUntil }`) on every seek and every transport tick, deduplicated by time. Our runtime does not need GPU; it just listens.
- **Spike result (D-009):** works in both player and producer, frame-exact. The composition must embed the HyperFrames runtime itself (`<script src="assets/hyperframe.runtime.iife.js">`, copied from the pinned `@hyperframes/core` dist), because the player only auto-injects it for GSAP or nested compositions. The root needs `data-duration`; the runtime handles clip visibility, so `runtime.js` only seeks the active slot compositions.

## AI router (v0)
```ts
run<T extends TaskId>(task: T, input: Input<T>, opts?: { mode?: InferenceMode }): Promise<RunResult<Output<T>>>
// RunResult = { output, ranOn: "device" | "cloud", model, costCredits: 0, latencyMs }
```
- One `GenerativeModel` per mode via `getGenerativeModel(ai, { mode })`. `ranOn` comes from the SDK if it exposes it; otherwise from an availability check before the call (verify in the SDK docs during task 3).
- Structured output: `responseMimeType: "application/json"` + response schema derived from the zod schema; still parsed with zod.
- Repair: on parse failure, one retry with the zod error appended; then `PREFER_IN_CLOUD`.
- Credits are not charged in the skeleton.

## Whisper worker
- `@huggingface/transformers` pipeline `automatic-speech-recognition`, model `onnx-community/whisper-base` (or `tiny.en` if too slow), `return_timestamps: "word"`, `device: "webgpu"` with WASM fallback.
- Input: decode to 16 kHz mono Float32 with `OfflineAudioContext` on the main thread, transfer the buffer.
- Verify the current transformers.js API (v3+) via docs before coding.

## big-number v0
Params: `{ value, prefix?, suffix?, decimals, label, context? }`. 16:9 layout only. Count-up with `outExpo` landing at `keyMomentMs`, label slide-up after. Tokens from a hard-coded skeleton style (proper packs come in spec 07).

## Render script
```ts
const job = createRenderJob({ fps: 30, quality: "draft" });
await executeRenderJob(job, compositionDir, "out/skeleton.mp4", (j) => log(j.progress));
```
Needs FFmpeg locally (`brew install ffmpeg` if missing). Chrome is auto-downloaded by the producer.

## Error handling
Every step shows its error inline with the step name. Nothing is persisted.

## Testing
- Property (fast-check): `big-number` `seek(t)` is deterministic: same t → identical `root.innerHTML`; random seek order equals sequential order at sampled times.
- Property: `msToFrame(frameToMs(f)) === f` for frames 0..10⁶.
- Unit: compiler output contains one `.clip` per slot with correct `data-start` / `data-duration`; router repair path with a mocked provider.

## Correctness properties
1. Seek determinism (component level).
2. Time round-trip.
3. Router never returns output that fails its zod schema.

## Fallback if the spike fails
If `hf-seek` cannot drive our runtime reliably in the player or the producer: keep the same compiler and runtime, expose `window.__motionpop.seek(tMs)`, and use our own Puppeteer + FFmpeg loop for render plus our own iframe player for preview (VideoHub-style). Record in D-009.

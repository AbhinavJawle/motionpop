# Design: 05 audio pipeline

## Overview
One orchestrator, `runPipeline`, takes a file and a set of injected dependencies, and emits typed events. The pure parts (validation, chunks → words, fillers, EDL, re-timing) live in small modules with property tests. The browser-only parts (decoding, the Whisper worker, OfflineAudioContext rendering, IndexedDB) sit behind interfaces, so the orchestrator is tested in Node with fakes, and the browser parts are tested in Playwright.

```
File ──validateIntake──► decode (twice: 16 kHz mono for Whisper, 24 kHz mono for output)
                           │
                           ├─ silent? → error
                           ▼
                 transcribe (Whisper worker, original audio) ──► chunksToWords ──► Word[] (filler flags)
                           ▼
                 buildEdl(words, durationMs) ──► CutRange[]   (skip if > 40 % cut)
                           ▼
         renderCleaned(buffer24k, edl) ──► Float32Array ──► encodeWav (24 kHz, 16-bit mono)
                           ▼
                 retimeWords(words, edl) ──► cleaned Word[]
                           ▼
       AudioStore.put(original), AudioStore.put(cleaned) ──► ProjectRepository.save(project)
                           ▼
                     /editor/[id]
```

**Step order (deviation from `screens.md`).** `screens.md` lists "Cleaning audio" before "Transcribing", but filler removal needs the words. The screen therefore shows Transcribing → Cleaning audio → Finding moments → Suggesting graphics. This is recorded as D-024.

## Modules (`apps/web`)
| File | Exports | Notes |
|---|---|---|
| `lib/audio/intake.ts` | `INTAKE_LIMITS`, `validateIntake(file: {name,type,size}) → IntakeResult` | Pure. Accepts by MIME, with an extension fallback when `type` is empty (Safari/Finder M4A). |
| `lib/audio/decode.ts` | `decodeForPipeline(blob) → { pcm16k, pcm24k, durationMs }`, `isSilent(pcm)` | Replaces `decode-16k.ts` (kept as re-export). Two `decodeAudioData` calls, on 16 kHz and 24 kHz OfflineAudioContexts, so the browser resamples. Silent = RMS < 0.002 over the whole file. |
| `lib/transcribe/whisper-chunks.ts` | `chunksToWords`, `isFiller` | Tightened to R2.3: min 40 ms per word, no overlap (a word's end is clamped to the next start, and the next start is pushed forward if it would leave < 40 ms). |
| `lib/audio/edl.ts` | `CutRange`, `buildEdl(words, durationMs, opts?) → { cuts, fillersRemoved, pausesShortened }`, `mapTime(ms, cuts)`, `retimeWords(words, cuts)`, `cleanedDuration(durationMs, cuts)` | Pure, integer ms. |
| `lib/audio/render-cleaned.ts` | `renderCleaned(pcm24k, cuts, sampleRate = 24000) → Promise<Float32Array>` | OfflineAudioContext, one AudioBufferSourceNode per kept segment, equal-power 10 ms crossfades. |
| `lib/audio/wav.ts` | `encodeWav(samples, sampleRate)`, `decodeWavHeader` | Moved from `synth-voice.ts` (re-exported there). |
| `lib/audio/audio-store.ts` | `AudioRef` (`idb:<key>`), `AudioStore { put(blob) → ref; get(ref) → Blob \| null; url(ref) → string \| null; delete(ref) }`, `MemoryAudioStore` | |
| `lib/audio/idb-audio-store.ts` | `IdbAudioStore` | Same DB as projects (`motionpop`), store `audio`. The factory is resolved lazily (SSR). |
| `lib/pipeline/events.ts` | `PipelineStep`, `PipelineEvent` (zod discriminated union) | |
| `lib/pipeline/run.ts` | `runPipeline(input, deps, onEvent, signal) → Promise<PipelineResult>` | Orchestrator. |
| `lib/pipeline/sample.ts` | `sampleInput()` | "Try a sample" (see below). |
| `lib/editor/voice.ts` | `loadVoice` resolves `idb:` refs through the AudioStore | R4.3. |
| `app/(app)/processing/[id]/page.tsx` + `components/processing/*` | Processing screen | `id = "new"` shows the drop zone. |

## Cleanup rules (`buildEdl`)
Inputs: words (with `filler`) and `durationMs`. Options: `{ pauseMs: 700, keepMs: 300, minCutMs: 20 }`.

1. **Speech words** are the non-filler words. Walk the gaps between consecutive speech words, plus the leading gap `[0, first.startMs]` and the trailing gap `[last.endMs, durationMs]`.
2. **Inner gap `[a, b]`:**
   - If `b − a > pauseMs`, cut `[a + keepMs/2, b − keepMs/2]`, plus each filler's own range, so a filler inside the kept 300 ms is still removed. `pausesShortened += 1`. As built in run 20.
   - Otherwise, cut each filler word's `[startMs, endMs]`, clamped to `[a, b]`.
3. **Leading gap:** if longer than `pauseMs`, cut `[0, first.startMs − keepMs]`. **Trailing gap:** if longer than `pauseMs`, cut `[last.endMs + keepMs, durationMs]`. Fillers inside either gap follow the same rule as inner gaps.
4. **Tidy up:** merge touching cuts and drop cuts shorter than `minCutMs`.
5. **No speech at all:** no cuts. Processing reports "No words found" (R1.2 covers silence).
6. **Over 40 %:** if the cuts total more than 40 % of `durationMs`, return no cuts with `skipped: "too-much"` (R3.6).

`fillersRemoved` counts filler words whose range lies inside a cut.

**Re-timing:**
- `mapTime(ms) = ms − Σ len(cut)` over the cuts that end at or before `ms`. A time inside a cut maps to that cut's start. Kiro run 20 found that the bare formula jumps back at each cut's end, so it isn't monotonic.
- A kept word becomes `startMs' = mapTime(startMs)` and `endMs' = startMs' + (endMs − startMs)`. Words inside cuts are dropped and the rest re-indexed 0..n−1.
- Speech words are never inside a cut, and cuts never overlap a speech word, so every kept word keeps its exact duration.

## Rendering the cleaned audio
- Output: mono, 24 kHz, 16-bit WAV. Speech is lossless at 24 kHz, and 3 minutes is about 8.6 MB.
- The source is `pcm24k`. Kept segments are the complements of the cuts.
- Each segment is placed at its mapped output time and extended by 5 ms on each side that touches a cut, reading 5 ms more source. Gain uses `setValueCurveAtTime` with equal-power curves (sin/cos, 32 points) over those 10 ms.
- Segment centres stay exactly on the mapped times, so word timings are unchanged. The output length is `cleanedDuration`.
- A file with no cuts skips rendering, and the cleaned ref equals the original (24 kHz WAV).

## Data and storage
`VoiceoverSchema` (packages/schemas) gains optional fields, so existing projects and fixtures still parse:
```ts
VoiceoverSchema = z.object({
  src: z.string().min(1),            // active audio: "idb:…" | "synth:…" (later a Storage path)
  durationMs: IntMs,                 // of the active audio
  peaks: z.array(z.number()).optional(),
  source: z.enum(['record', 'upload', 'tts', 'sample']).optional(),
  originalSrc: z.string().optional(),
  originalDurationMs: IntMs.optional(),
  cleanup: z.object({ fillersRemoved: IntNonNeg, pausesShortened: IntNonNeg, enabled: z.boolean(),
                      skipped: z.enum(['too-much', 'no-speech']).optional() }).optional(),
});
EditorProjectSchema += { originalTranscript: TranscriptSchema.optional() }  // for turning cleanup off (spec 09)
```
- `data-model.md` is updated to match: Firestore stores the original under `projects/{id}/transcript/original`.
- `AudioStore` refs are opaque strings. The Firebase implementation (spec 01) will use `users/{uid}/audio/{projectId}/{original|cleaned}.{ext}`.
- The project `id` is `p-` plus 10 base-36 characters from `crypto.getRandomValues`. Projects keep `createdAt` and `updatedAt`.

## Pipeline events
```ts
type PipelineStep = 'transcribe' | 'clean' | 'moments' | 'suggest';
type PipelineEvent =
  | { type: 'step'; step: PipelineStep; state: 'active' | 'done' | 'skipped' | 'failed'; detail?: string }
  | { type: 'progress'; step: 'transcribe'; stage: 'loading' | 'transcribing'; percent?: number }
  | { type: 'words'; words: Word[] }                 // for the mini timeline
  | { type: 'peaks'; peaks: Float32Array; bucketMs: number }
  | { type: 'done'; projectId: string }
  | { type: 'error'; step: PipelineStep | 'intake'; message: string };
```
`runPipeline` deps: `{ decode, transcribe, renderCleaned, encodeWav, audioStore, repo, now, newId, peaks }`.
- **Cancel:** the AbortSignal is checked between steps. On abort, nothing is written. Writes only happen in the final store step, and a failed write deletes the refs it already put.
- `moments` and `suggest` are emitted as `skipped` with "Up next" until spec 06 replaces them.

## "Try a sample"
The best sample is a ~20 s recording of the founder reading the demo script, bundled as `public/samples/sample-voice.m4a`. Until that file exists, the sample synthesizes the demo voice (`synthVoice`). Whisper can't transcribe a synthetic buzz, so the transcribe step uses the fixture words and labels the result "Sample transcript", never claiming on-device speech recognition. When the real recording lands, the sample goes through Whisper like any upload.

## Processing screen
- Layout: centred column of max width 560 on the app background with the ember/violet glow.
  - Pip (`thinking`) at 96 px in a soft radial glow.
  - Mono "PIP IS WORKING" in violet, 11 px with 1.1 px tracking.
  - Title "Turning your voice into motion" at 28/34 semibold.
- Four step cards (glass card, 56 px, radius 12) with an icon, title and detail line. States:
  - pending: `text-3`;
  - active: shimmer, violet icon;
  - done: mint check + detail;
  - skipped: "Up next" chip;
  - failed: red outline + message.
- Below the cards, the mini timeline: a 64 px card with the cleaned waveform (or the original until cleaning finishes) and words that fade in at their positions.
- Actions: "Cancel" (ghost) while running; on failure, "Try again" (ember) and "Choose another file".
- `id = "new"` shows the drop zone instead: a dashed glass card with "Drop it, I'll catch it!" and Pip reacting on drag-over, the size/type hint "MP3, WAV or M4A · up to 50 MB · 20 min", and a "Try a sample" link. Once a file is accepted, the URL becomes `/processing/<projectId>` via `history.replaceState`.
- Opening `/processing/<id>` for a project that already exists redirects to the editor. Opening it for a run interrupted by a reload says "This upload was interrupted" and offers "Choose another file".
- Reduced motion turns off the shimmer and the word fade-in. A `role="status"` live region announces "Transcribing…", "Cleaning audio: removed 7 ums and 3 long pauses", and so on.
- Built from spec 02 primitives (Card, Chip, Shimmer, Pip, Button). Spacing and tokens come from the generating panel (`editor-generating.png`).

## Edge cases
| Case | Behaviour |
|---|---|
| Empty or 0-byte file, or unknown type | intake error "That doesn't look like audio. Try MP3, WAV or M4A." |
| > 50 MB / > 20 min | "That's a big one. Up to 50 MB and 20 minutes for now." |
| Silent file | "I couldn't hear anything in that file." |
| Whisper returns no words | transcribe fails: "No words found". Offer another file (or cloud, when available). |
| Model download fails (offline) | transcribe fails with "Needs connection to download the voice model (once)". Retry. |
| Overlapping or out-of-order chunks | `chunksToWords` normalises (R2.3 property). |
| Cleanup over 40 % | skipped. Detail: "Kept your audio as it is". |
| Filler at the very start or end | covered by the leading/trailing gap rules. |
| Tab hidden during processing | keeps running (worker plus offline rendering). |
| IndexedDB quota exceeded | store step fails. Message names the storage, "Try again" retries, nothing half-written. |

## Testing
- **Unit:** `validateIntake` (types, extension fallback, limits); `isFiller` (meaningful words never flagged); `encodeWav` header; the `runPipeline` event order with fakes; cancel at each step writes nothing; a failed store rolls back refs; cleanup over 40 % is skipped.
- **Property tests (fast-check):**
  - `chunksToWords`: for random chunk lists (nulls, overlaps, out-of-order, empty texts), the R2.3 invariants hold.
  - `buildEdl`: cuts sorted, non-overlapping, inside [0, duration]; no speech word intersects a cut; every cut ≥ `minCutMs`; total cut ≤ 40 % or no cuts.
  - `retimeWords` + `mapTime`: kept words keep their durations and order; `cleanedDuration = duration − Σcuts`; re-timed words are within [0, cleanedDuration]; `mapTime` is monotonic non-decreasing.
- **Browser (Playwright):**
  - `renderCleaned` on a synthetic tone with known cuts: output length matches within one sample, and the sample-to-sample jump at each seam is under 0.05 (no click).
  - Processing page with the sample: the steps reach done or skipped, the editor opens, and the project survives a reload.
  - A real Whisper run is gated by `E2E_WHISPER=1`, because the cold model download takes about 80 s.
- **Design check:** the Processing screen at 1440×900, compared by eye with `editor-generating.png` (no PNG of its own).

## As built (tasks 6–8)
- The URL stays `/processing/new` while processing, because the project id only exists at the final store step. A reload mid-run returns to the drop zone, and nothing was written. `/processing/<id>` for a saved project redirects to the editor; any other id says "This upload was interrupted".
- The mini timeline is a **word strip**: one violet pill per word, placed by time. When cleaning re-times the words, the pills glide left as the pauses close. Keys come from `matchKeys`, which maps each kept word to its original index. A waveform can replace it once peaks are cheap to compute mid-pipeline.
- Intake errors found while decoding (undecodable, too long, silent) return to the drop zone with the reason. Errors in later steps stay on the steps, with "Try again" and "Choose another file".
- Store-step failures keep their underlying cause (`PipelineError.cause`) and log it to the console.
- **Bug found in the browser, not by tests:** `IdbAudioStore.put` awaited `blob.arrayBuffer()` after opening its transaction. Real IndexedDB auto-commits the transaction across that await, so the put threw `TransactionInactiveError`. fake-indexeddb doesn't enforce this, so the unit tests passed. The bytes are now read first, and the Playwright sample test (task 9) covers it.


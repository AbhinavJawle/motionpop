# Spec 28 design

## Flow (reel branch of `apps/web/lib/pipeline/run.ts`)
```
intake → titles event (REEL_STEP_TITLES)
       → speechMap(pcm16k)               ← before transcription (R1.3); browser passes a copy to the worker
       → transcribe (Whisper, word timings)
clean  → planAutoCuts (first pass)       → "7 pauses · 30.0 s of dead air cut"
moments→ findRetakes → reviewPhrases → deps.reviewEdit (cloud, optional) → applyReview
       → planAutoCuts({ retakes })       → videoCuts {startMs, endMs, kind, reason}
       → retimeWords(plan.words, cuts)   → "3 retakes cut · checked · 89.6 s → 36.7 s"
suggest→ director                        plan → media + music
```

## Speech map (R1), `apps/web/lib/audio/speech.ts`
- `speechMap(pcm, sampleRate)`: 10 ms frames → dB. floor = p10, peak = p95, threshold = max(floor + 12, peak − 32). Reliable when peak − floor ≥ 18 and peak > −50 dB. Runs: hang 60 ms, close gaps < 160 ms, drop runs < 90 ms. `silences` is the complement.
- `tightenWords(words, map)`: for each word, the bursts it overlaps; the end stops at the first burst followed by a ≥ 250 ms gap (`WORD_GAP_MS`), then the start/end snap to burst edges within 300 ms. A word over no speech is capped at 500 ms. Order and indices are preserved (property test).

## Retakes (R2), `apps/web/lib/audio/retakes.ts`
- `phrasesOf`: split at sentence punctuation or gaps ≥ 650 ms. `normToken` lowercases, drops punctuation and folds -ing/-ed/-s.
- `isRetakePair(a, b)`: ≥ 3 tokens each, LCS similarity ≥ 0.6, not a parallel list line. If a negation is only on one side and both sides have swapped content words → contrast, not a retake. If both sides have words the other lacks → needs ≥ 0.75. Pure additions/truncations pass at 0.6.
- `findRetakes(words)`: each phrase vs the next 3 within 30 s → retake (earlier take cut, short phrases between the takes go too) or false start (prefix of the next phrase). Asides by regex (≤ 9 tokens). Restarts inside a phrase: a 2–4-gram said twice in a row, first copy cut.

## Cloud review (R3), `packages/ai/src/reel/edit.ts` + `applyReview`
- Task `reel.edit`: ONLY_IN_CLOUD, `gemini-3.8-flash`, thinking LOW, `maxOutputTokens` 4096, `cloudCost` 0 (inside the reel's 3 credits), `check` rejects unknown phrase ids. Input `[id, text, cutByRules][]` (≤ 400); output `{ cut[{phrase, kind, reason}], keep[] }`.
- `reviewReelCuts` (`apps/web/lib/reel/media.ts`) returns null without credits, under the kill switch or with < 2 phrases.
- `applyReview`: drops keeps on near-identical full repeats (≥ 5 tokens, ≥ 0.85, within 30 s); additions totalling > 30 % of speech → ignore all additions; whole-phrase cuts replace restarts inside them.
- Lab check (`packages/ai/scripts/reel-edit-lab.ts`): the lite model restored repeated takes and misread the marks; the balanced model answered `{cut: [], keep: []}` on the founder's clip in about 2 s.

## Edit plan (R4), `apps/web/lib/audio/autocut.ts`
- `planAutoCuts({ words, durationMs, speech?, retakes?, opts })`: tightened words → voiced runs (runs overlapping words, or ≥ 1200 ms) → interior silences > `pauseMs` (380) cut with `tailMs` 150 / `leadMs` 90; head/tail cut outside the first/last kept word ± `edgeMs` 120; retakes cut from the previous kept word's end + tail to the next kept word's start − lead; untranscribed duplicate takes; fillers.
- Resolve: carve out kept words, priority retake > filler > silence, merge, fold slivers < 60 ms. `maxRetakeShare` 0.45.

## Progress copy (R5)
- New event `{type: 'titles'}` and optional `title` on step events; the processing reducer keeps titles across updates; the screen shows `state.steps[step].title ?? STEP_TITLES[step]`.

## Testing
- `lib/audio/autocut.test.ts`: speech map on synthetic recordings, unreliable meter, tightening, order property; retakes (last take kept, false start, restart, aside, parallel lines, contrast and refrain lines, corrected line, never cuts every take property); the raw-take regression; cut invariants property; word-gap fallback; review marks, keep/aside, runaway, keep-guard.
- `lib/pipeline/run.test.ts`: reel run with a fake transcriber that detaches the buffer (as the worker does), asserting the titles event, the review marks, a retake cut and the summary.
- Real-app run of the founder's clip on the lab profile, export re-transcribed with whisper.cpp; offline planner runs on clean and already-edited clips.

# Requirements: 05 audio pipeline

Turns a voiceover into an editor project. The audio is decoded, transcribed on-device with word timings, and cleaned (fillers and long pauses cut, with words re-timed to the cleaned audio). The result is stored, and the Processing screen shows each step live. Lands by **Sat Nov 21, 2026**. Written in Claude Code.

Behaviour comes from `architecture.md` (flow 1), `hybrid-ai.md`, `ai-tasks.md` (§8 `tts.generate`, §9 `transcribe.cloud`), `data-model.md` (Voiceover, Transcript) and `screens.md` (Processing). Processing has no design PNG, so it is built from existing components in the generating-panel language.

Out of scope here:
- The Start, Recording and Paste-script screens (spec 11). This spec ships the pipeline and a minimal entry: a drop zone on `/processing/new` and a "Try a sample" button.
- Slot detection and auto-fill (spec 06). Processing shows those steps as "Up next" until then.
- The Voice panel (spec 09).
- Firebase Storage and Firestore (spec 01, when the Firebase project exists). Audio and projects persist locally behind interfaces that Firebase will implement.
- Cloud transcription and TTS also wait for the Firebase project. Their tasks are marked blocked.

## R1 Intake
_As a creator, I want to drop a voice memo and know right away whether it will work._
1. **R1.1** THE SYSTEM SHALL accept MP3, WAV, M4A (AAC) and WebM/Opus audio up to 50 MB and 20 minutes, checking type and size before reading the file.
2. **R1.2** IF the file is the wrong type, too large, too long, silent or undecodable THEN THE SYSTEM SHALL say so in one friendly line, with no step started and nothing stored.
3. **R1.3** THE SYSTEM SHALL decode the file once in the browser into 16 kHz mono PCM (for transcription) and keep the original file untouched.
4. **R1.4** THE SYSTEM SHALL offer "Try a sample", which runs the same pipeline on a bundled sample voiceover. The sample is synthesized or recorded by us, with no third-party audio.

## R2 Transcription
_As a creator, I want my words with exact timings, without waiting on a server._
1. **R2.1** THE SYSTEM SHALL transcribe on-device with the Whisper worker (WebGPU, WASM fallback), with word timestamps, reporting `ranOn: "device"`.
2. **R2.2** WHILE the model downloads THE SYSTEM SHALL show download progress in percent. It SHALL never block the UI thread for more than 50 ms at a time.
3. **R2.3** THE SYSTEM SHALL convert Whisper chunks into `Word[]`. Indices run 0..n−1, times are integer ms within [0, durationMs], every word has `endMs ≥ startMs + 40`, words never overlap, and starts never go backwards.
4. **R2.4** THE SYSTEM SHALL flag hesitation fillers (um, uh, erm, hmm…) with `filler: true`. It SHALL never flag a word that could carry meaning ("like", "so", "well").
5. **R2.5** IF on-device transcription is unavailable or fails THEN THE SYSTEM SHALL offer cloud transcription (`transcribe.cloud`, ☁ 1 credit per started minute, cost shown first). Words with coarse timings are marked `timingQuality: "approx"`. _(Blocked on the Firebase project.)_

## R3 Cleanup
_As a creator, I want ums and dead air gone without my words drifting out of sync._
1. **R3.1** THE SYSTEM SHALL build an edit decision list (EDL) of cut ranges: every filler word, plus the part of any pause longer than 700 ms that exceeds 300 ms of kept silence.
2. **R3.2** THE SYSTEM SHALL never cut inside a non-filler word. Cut ranges SHALL be sorted, non-overlapping and within the audio.
3. **R3.3** THE SYSTEM SHALL render the cleaned audio from the EDL with OfflineAudioContext at the original sample rate. Each cut gets a 10 ms equal-power crossfade, so no click is audible.
4. **R3.4** THE SYSTEM SHALL re-time every kept word through the EDL. A kept word's duration is unchanged, word order is preserved, and the cleaned duration equals the original minus the total cut. Removed fillers are dropped from the cleaned transcript and counted.
5. **R3.5** THE SYSTEM SHALL keep the original audio and transcript, so cleanup can be turned off later (Voice panel, spec 09) without transcribing again. The project records `cleanup { fillersRemoved, pausesShortened, enabled }`.
6. **R3.6** IF cleanup would remove more than 40 % of the audio THEN THE SYSTEM SHALL skip it, keep the original, and say "Kept your audio as it is".

## R4 Project creation and storage
_As a creator, I want the result to open in the editor and survive a reload._
1. **R4.1** THE SYSTEM SHALL store the original and cleaned audio through an `AudioStore` interface (`put`, `get`, `url`). It ships an IndexedDB implementation now; Firebase Storage comes later.
2. **R4.2** THE SYSTEM SHALL create an `EditorProject` through `ProjectRepository`. It holds the voiceover (source, original and cleaned refs, active ref, duration, cleanup stats), the cleaned transcript, no slots yet, the default style and the 16:9 format. Its title comes from the file name, or "Untitled Project".
3. **R4.3** THE SYSTEM SHALL let the editor play stored audio: `loadVoice` resolves `AudioStore` refs as well as `synth:*` fixtures.
4. **R4.4** THE SYSTEM SHALL parse every stored record with zod on read.

## R5 Processing screen
_As a creator, I want to watch Pip turn my voice into a project, and know what happened._
1. **R5.1** THE SYSTEM SHALL show `/processing/[id]` with Pip thinking in a glow, "PIP IS WORKING", "Turning your voice into motion", and step cards in the generating-panel style.
2. **R5.2** THE SYSTEM SHALL show the steps in pipeline order, each pending → active (shimmer) → done (mint check) with a live result:
   - Transcribing ("Downloading the voice model · 42 %", then "214 words · 18.0s").
   - Cleaning audio ("Removed 7 ums and 3 long pauses").
   - Finding moments and Suggesting graphics. These show "Up next" until spec 06.
3. **R5.3** THE SYSTEM SHALL show a mini timeline of the cleaned waveform with the words appearing as they are transcribed.
4. **R5.4** WHEN processing finishes THE SYSTEM SHALL move to `/editor/[id]` with a short transition. On failure it SHALL show the failed step in red with "Try again" and "Choose another file". Cancel stops the work and stores nothing.
5. **R5.5** THE SYSTEM SHALL respect reduced motion and announce each step change to screen readers (polite live region).

## R6 Script to voice
_As a creator without a recording, I want to paste a script and get a voiceover._
1. **R6.1** THE SYSTEM SHALL generate speech from a script with `tts.generate` (Gemini TTS through AI Logic, ☁ 2 credits per started minute, cost shown first). The audio then runs through R2–R5, with cleanup off by default for generated audio. _(Blocked on the Firebase project; the screen is spec 11.)_

## Non-functional
- A 3-minute voiceover goes from drop to editor in under 60 s on an M-series laptop with WebGPU and a cached model (cold model download excluded and shown separately).
- Pipeline logic is pure and unit-tested: chunks → words, filler detection, EDL, re-timing. Property tests (fast-check) cover the R2.3 word invariants, the R3.2 EDL invariants, and the R3.4 re-timing properties (duration identity, order, kept-word durations, no word inside a cut).
- No audio leaves the device in this spec.

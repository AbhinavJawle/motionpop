# Spec 28: Automatic edit of raw talking-head footage

> Written in a Claude Code session (2026-11-21/22). Founder ask: "for reel it says it skips moments … then i tested with a video which was raw and had double takes and dead pauses and our tool wasnt too good about it … work till you fix it and make the automatic video editing bullet proof." Evidence: the founder's raw clip (89.7 s, 360×640, two repeated takes and long dead pauses), our export of it (62.4 s) and a screen recording of the editor.

## Why
On the founder's raw clip the export was 62.4 s and still held both botched takes and most of the dead air:
- Pauses were found from Whisper word gaps only. Whisper stretches a word across the silence after it ("lifting" ran 43.7–48.5 s), so the pause was invisible and was kept.
- Nothing looked for repeated takes. Both takes of the last tool line and both takes of the call to action stayed in.
- Head and tail junk (pre-roll noise, the reach for the stop button) was kept.
- The processing screen said "Reels skip this" on the moments step, which reads as if the edit was skipped.
- In the browser the speech meter could not run: the Whisper worker takes ownership of the audio buffer, so the meter saw an empty buffer and fell back to word gaps.

## Requirements (EARS)
### R1 Speech map
- **R1.1** THE system SHALL measure where speech is from the audio itself (10 ms RMS frames, an adaptive threshold between the noise floor and the speech peak), and SHALL mark the measurement unreliable WHEN the recording has too little contrast (for example music under the voice), falling back to word gaps.
- **R1.2** THE system SHALL pull Whisper word timings onto the measured speech: a word end SHALL stop at the first speech burst followed by a gap of at least 250 ms, and word starts and ends SHALL snap to burst edges within 300 ms. Word order and indices SHALL never change.
- **R1.3** THE measurement SHALL run before the audio is handed to the transcription worker (or on a copy), so it works in the browser.

### R2 Retakes
- **R2.1** WHEN a line is said again within 30 s (up to 3 phrases ahead) THE system SHALL cut the earlier take(s) and keep the last one.
- **R2.2** THE system SHALL cut false starts (an abandoned opening of the next phrase), restarts inside a sentence ("the best part, the best part is"), short stumbles between two takes, and asides to the camera ("let me do that again").
- **R2.3** THE system SHALL NOT treat as retakes: list lines that swap a counting word ("Step one … / Step two …"), contrast lines ("You don't have a motivation problem. You have a follow-through problem."), or refrains whose key words differ ("this is your tip of the day" / "this was your tip of the day"). A pair whose words only differ by additions or truncation needs 60 % in common; a pair with words swapped on both sides needs 75 %.
- **R2.4** THE last phrase of the recording SHALL never be cut by the retake rules, and retake cuts SHALL be capped at 45 % of the recording.

### R3 Cloud review
- **R3.1** WHEN the user has credits and the kill switch is off THE system SHALL send the numbered phrases, with the rule cuts marked, to a cloud editor (`reel.edit`, through `packages/ai`, zod-validated, part of the reel's 3 credits) that may add whole-phrase cuts (botched takes worded differently, off-script talk) or keep a marked phrase (a deliberate repeat).
- **R3.2** THE system SHALL enforce limits in code: additions over 30 % of the speech are ignored, and a keep is ignored for a full line (≥ 5 words) said again almost word for word (≥ 85 %) within 30 s. Any failure SHALL leave the rule-based edit standing.

### R4 Edit plan
- **R4.1** THE system SHALL cut head and tail dead air outside the first and last kept words (with a margin), interior silences longer than 380 ms (keeping 150 ms after and 90 ms before speech), fillers, and retakes, without ever cutting into a kept word; cuts shorter than 60 ms SHALL fold into a neighbour.
- **R4.2** Each cut SHALL carry its kind (silence, filler, retake, ramble) and a short reason for the editor timeline.

### R5 Honest progress
- **R5.1** For a reel THE processing screen SHALL name the steps for what they do ("Cutting dead air", "Removing retakes", "Directing the reel", "Adding visuals and music") and report what was done ("3 retakes cut · checked · 89.6 s → 36.7 s"), never "skip".

### R6 Verification
- **R6.1** THE founder's raw clip SHALL go through the real app (upload → processing → editor → export) with both retakes and the dead air removed and no clipped words, confirmed by re-transcribing the export.
- **R6.2** Clean and already-edited clips SHALL lose no lines (only breaths and dead air).

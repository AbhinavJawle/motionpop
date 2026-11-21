# Spec 27: Reel pro pass (5/10 → ready for heavy founder testing)

> Written in a Claude Code session (2026-11-21). Founder ask: "I want to test with a lot of demo raw footage myself. Make the software at its maximum output and fix any bugs before I get testing … great outputs for any style of videos, great edits, great motion graphics, great music and SFX from the get go (after uploading and initial load)." Testing runs on the lab cloud profile (Google-funded), so the best cloud models are allowed by default.

## Why
After spec 26 the founder rated exports 5/10. An audit of the engine found:
- Scenes switch with a hard cut (`display` toggles): nothing exits and no motion carries across.
- Jump cuts (removed pauses and fillers) keep the same framing, so every cut visibly jumps.
- The speaker's face position is never detected (`plan.focus` is always the default), so landscape or off-centre footage crops badly. The director also never sees the footage, so screen recordings and B-roll are treated as a talking head.
- Music is a synthesised bed; loudness is not normalised (−17.5 LUFS measured).
- In the app the director runs on the fast model, not the strong one used in the lab.

## Requirements (EARS)
- **R1.1** WHEN a scene follows another THE engine SHALL transition between them as a pure function of time: the old graphic exits while the new one enters, and the speaker's box morphs between layouts (split ↔ speaker ↔ card) instead of jumping. A carried scene SHALL not transition its graphic.
- **R1.2** WHEN the reel crosses a jump cut in the speaker video THE engine SHALL alternate the speaker framing between two zoom levels on the cut, ignoring cuts closer than 700 ms to the previous change.
- **R2.1** THE director SHALL see up to 6 keyframes of the footage and return the footage kind (`talking-head`, `screen`, `scene`) and the face centre in each keyframe where a face is visible.
- **R2.2** THE engine SHALL frame the speaker from the face positions over time (interpolated, clamped to the crop), and footage without a face SHALL be shown whole (contain-fit) rather than cropped to a face that is not there.
- **R3.1** THE director SHALL write a short music brief (mood, genre, instruments, tempo; no artist or brand names).
- **R3.2** THE system SHALL generate the reel's music from the brief with the cloud music model through `packages/ai` on the server, loop it to the reel length with a crossfade, store it as a project audio file, and mix it ducked under the voice in the preview and the export. On any failure the synthesised bed SHALL be used.
- **R3.3** THE export SHALL be loudness-normalised to about −14 LUFS integrated with a true-peak ceiling of −1 dBTP.
- **R4.1** In the app THE reel director SHALL use the strong model (Remote Config `modelStrong`) with the keyframes, and processing SHALL direct, fetch pictures and music with no extra clicks after upload.
- **R5.1** THE full flow (upload → processing → editor preview → export) SHALL be exercised on portrait and landscape footage before hand-off, and every bug found SHALL be fixed or listed.
- **R5.2** WHEN a reel exports raw phone footage (up to the 500 MB intake limit; 4K, HEVC, variable frame rate or rotated) THE SYSTEM SHALL accept the upload for export and render an upright H.264 proxy with the speaker's audio in sync, falling back to the original file if the proxy fails.

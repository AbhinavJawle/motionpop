# Spec 13b · Free exports and cost cuts · requirements

Written in a Claude Code session (Opus 5.5, 2026-11-17) after the founder's ask: "exports shouldnt cost credits. make all the costs related to everything (for me) go down somehow". Steering: `security-and-cost.md`, `hybrid-ai.md`, `ai-tasks.md`. Changes spec 13 (credits) and spec 08 (export pricing); spec 07b (film mode) gets cheaper defaults.

**Why.** Two kinds of cost. Credits are what the creator pays; exporting a video they already made should not be one of them. Money is what the founder pays: model calls through Vertex (the project hit its spend cap on 2026-11-17 at about 5 euros), Cloud Run render minutes, and storage. Every requirement below either removes a paid call, makes one cheaper, or makes a repeat free.

## R1 · Exports are free
1. THE price of an export SHALL be 0 credits at every resolution by default (`DEFAULT_EXPORT_CREDITS`), still overridable from Remote Config (`export_credits`).
2. WHEN an export costs 0 credits THE SYSTEM SHALL NOT call the spend route or write a ledger entry, and SHALL NOT need a refund on failure.
3. THE export modal and every other place that shows an export price (landing page, out-of-credits modal, ledger texts, settings) SHALL say the export is free instead of showing a credit chip.
4. THE daily export limit (`rendersPerUserPerDay`) SHALL still apply, so free exports can't be used to run up render cost.

## R2 · A repeat export costs nothing to make
1. WHEN a creator exports a project whose composition, assets and export options are identical to a render of theirs that is ready and still stored THE SYSTEM SHALL return that render (download and share link) without starting a render job.
2. THE identity SHALL be a sha256 over the compiled composition HTML, the hashes of every asset it uses, and the export options (format, resolution, transparent, captions, music). It SHALL be stored on the render document.
3. A reused render SHALL NOT count against the daily export limit.

## R3 · Film mode is cheaper
1. THE builders' model (`modelFilmBuild`) SHALL default to the fast model (`gemini-3.5-flash-lite`). The Director stays on the strong model. (Lab evidence: the fast model on the film kit built 8 of 9 beats that passed the critic, `docs/research/film-mode.md` S3.)
2. THE thinking levels SHALL be: `film.direct` MEDIUM, `film.build` LOW, `film.props` LOW.
3. THE app SHALL allow at most 1 critic repair per beat (`makeFilm` `maxRepairs: 1`).
4. THE `film.build` request SHALL put everything the film's builders share (system instruction, then the film: thesis, world, recurring element, shared drawings, the full beat list) before anything beat-specific, so the shared prefix is identical across the film's builders and the model API's implicit prompt caching can bill it at the cached rate.
5. Every cloud task SHALL set an output token cap (`maxOutputTokens`) sized to its schema, so a runaway answer can't cost more than a bounded amount.

## R4 · Free work is not paid for twice
1. THE SYSTEM SHALL cache the answers of free routed tasks (`prompt.prefill`, `slots.detect`, `captions.chunk`) on the device, keyed by task, prompt version, model and a sha256 of the input, for 7 days; a hit returns the stored answer with `ranOn` unchanged and `cached: true`, and makes no model call.
2. THE SYSTEM SHALL cache generated voice parts on the device keyed by a sha256 of (text part, voice, model). Generating the same script again with the same voice SHALL make no TTS call for the parts already stored.
3. WHEN `slots.detect` gets more than `routingSlotsDetectDeviceMaxWords` words and the on-device model is available THE SYSTEM SHALL detect on the device in chunks of at most that many words (split on sentence ends, merged and post-passed as one list) instead of calling the cloud. The cloud stays the fallback when the device model is unavailable or a chunk fails twice.

## R5 · Visible and measured
1. THE router result SHALL report `cached: boolean` and, for cloud calls, the cached input token count when the provider returns it; both are logged with the usage event.
2. A short note in `docs/decisions.md` (D-074) SHALL list each cut, its expected saving, and what was not measured because paid calls were paused.

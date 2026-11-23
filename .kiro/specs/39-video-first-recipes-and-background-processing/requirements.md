# Spec 39 requirements: video first, recipes, and background processing

> Claude Code session, 2026-11-23. Founder brief: "Motionpop is an AI Video Editor — NOT just a
> voiceover motion-graphics tool." A choose-then-create flow (founder reference screenshots, idea only): choose a
> recipe and settings before anything is spent, see an itemised summary, press Create, and let the
> work carry on in the background. Founder answers: no credits before Create (TTS included, as a
> summary line); recipes for voiceovers "whatever is best"; a reload stops a job (warn first);
> illustrated CSS preview cards; all commits through kiro-cli, no co-author trailers.

Visual language stays Paper / Ink / Flame (spec 35) on every screen outside the editor. No
third-party brand, creator or competitor names anywhere (recipes, styles, copy, code).

## R1 Video first copy
- R1.1 THE `/start` page SHALL lead with video: headline, subline and the upload panel name video
  and audio ("Upload video or audio", "Drop your video or audio"), listing `MP4, MOV, WebM` before
  `MP3, WAV, M4A`, plus B-roll and screenshots.
- R1.2 THE dashboard empty state, drag overlay and the app metadata (`layout.tsx`) SHALL describe
  Motionpop as an AI video editor that also takes voiceovers and scripts.
- R1.3 WHEN a job processes a video THE processing screen SHALL say "Editing your video." and its
  word strip SHALL be headed "Your video"; for audio it SHALL keep "Turning your voice into
  motion." and "Your voice".

## R2 Configure your edit (nothing spent before Create)
- R2.1 WHEN a creator drops or picks a video or audio file, finishes a recording, chooses the
  sample, or submits a script THE SYSTEM SHALL open `/start/configure` instead of processing.
  (The single-graphic line keeps going straight to processing.)
- R2.2 THE configure screen SHALL show a media card on top: a video frame or a waveform (or the
  script's first lines for a script), file name, duration, resolution/aspect for video, and a
  Remove/Swap control.
- R2.3 WHILE the creator chooses settings THE SYSTEM SHALL run free local preparation in the
  background (keep the file locally, decode audio, probe video, transcribe on device) and show it
  as one progress bar (`Preparing 42%` → `Ready`). Preparation SHALL never spend credits or call a
  cloud model.
- R2.4 THE SYSTEM SHALL NOT run `reel.direct`, the cloud edit review, illustrations, music
  generation or `tts.generate` before Create.
- R2.5 THE left column SHALL offer, in order: Recipe, Style (scoped to the recipe), Hook,
  Captions (toggle + style cards), CTA (toggle + optional text), Sound (speech cleanup toggle,
  sound-effects toggle, music mood). Each choice is an illustrated card with a clear Selected state;
  Recipe and Style each have a "Describe your own…" field; Recipe, Style, Hook, Captions and Sound
  each show a "More coming soon" pill.
- R2.6 FOR audio and script inputs THE style row SHALL show the voiceover looks; hook and CTA rows
  SHALL be hidden (they only apply to reels), captions SHALL map to the voiceover caption presets.
- R2.7 THE right column SHALL stay in view and list every enabled step with its real price from
  `costOf` (free items say "Free" or "Free · on-device"; illustrations say "up to N credits" and
  can be switched off), a bold total estimate and a Create button.
- R2.8 WHEN Create is pressed before preparation is done THE job SHALL start at once and pick up
  the preparation where it is; nothing is done twice. Create opens `/processing/[jobId]`.
- R2.11 THE intake checks (type, size, duration, silence) SHALL run during preparation; a file
  that fails them disables Create and shows the reason with "Choose another file".
- R2.12 THE configure screen SHALL read the pending intake without consuming it (a reload keeps
  the file and re-prepares); the job takes ownership of the stored file at Create.
- R2.9 WHEN the creator is signed out, offline or short of credits THE summary SHALL say so and
  the paid lines SHALL fall back to their free versions (free director, no illustrations), as
  processing does today; a script without credits SHALL block Create with the reason.
- R2.10 THE chosen settings SHALL be stored on the project (`project.edit`) so the editor knows the
  recipe, style and sound choices.

## R3 Recipes and the director skill library
- R3.1 THE SYSTEM SHALL ship five recipes: Tech Explainer, Finance & Business, Gaming, Podcast &
  Story, Hot Take; plus "Describe your own".
- R3.2 EACH recipe SHALL carry a director skill: scene length range, layout mix (split / card /
  full / speaker targets), preferred templates, hook pattern, visual grammar, music mood brief,
  sound-effect density, banned tropes, a default look and voiceover look, and 2–3 curated styles.
- R3.3 EACH style SHALL be a real reel look (`mono` | `cream`) plus a `ReelTheme` preset and a
  caption style; voiceover inputs use the existing voiceover looks.
- R3.4 THE registry SHALL sit behind a `SkillRegistry` interface (list, get, recipe skills) so
  other skill packs can plug in later without touching prompts or engines; each recipe also has a
  human-readable `skills/recipes/<id>.md` that a test keeps in sync.
- R3.5 WHEN a reel is directed THE chosen recipe skill, style, hook style, CTA choice, caption
  style, music mood and the creator's own notes SHALL be part of the `reel.direct` prompt.
- R3.7 FOR voiceover inputs a recipe is a preset: it chooses the default look, caption preset,
  music and cleanup; the director and detector are unchanged in v1.
- R3.6 WHEN a voiceover graphic is filled (`component.fill`) THE slot's director skill shot
  sequence SHALL be sent (no more empty `shotSequence`).

## R4 Describe your own (`recipe.resolve`)
- R4.1 WHEN the creator describes their own recipe or style THE SYSTEM SHALL turn it into a
  validated object `{ recipeId, look, theme, captionStyle, hookStyle, musicMood, directorNotes }`
  with a new task `recipe.resolve`, ONLY_ON_DEVICE (free, Gemini Nano through AI Logic).
- R4.2 IF the model is unavailable or its output fails validation after one repair THEN a
  deterministic keyword resolver SHALL pick the nearest recipe and style; the creator is never
  blocked.
- R4.3 THE resolved values SHALL show in the summary ("Your style: …") and travel into
  `reel.direct` and `project.reel`.

## R5 Engine wiring
- R5.1 THE reel plan SHALL carry `captionStyle` (`seam` | `pop` | `editorial` | `boxed` | `clean`)
  and `hookStyle` (`headline` | `stat` | `visual` | `cold-open`); both optional, old projects keep
  their look's style.
- R5.2 THE reel caption painter SHALL draw each caption style deterministically (pure function of
  time, no GSAP), inside the safe area.
- R5.3 WHEN CTA is off THE plan SHALL contain no `cta` scene; WHEN CTA is on with text THE last
  scene SHALL be a speaker `cta` scene with that ask; WHEN on without text THE SYSTEM SHALL keep
  the director's `cta` scenes and add none.
- R5.4 THE hook style SHALL shape scene 1: stat → a counter when a number is said in scene 1,
  else a headline; visual → the director's image/logo/website if scene 1 has one, else a headline;
  cold-open → no hook title (any look); headline → a title card from the hook text (or the first
  words) when scene 1 is a speaker shot.
- R5.5 Speech cleanup off SHALL skip dead-air and retake cuts; sound effects off SHALL silence the
  reel's automatic hits; music mood `none` SHALL produce no music, any other mood steers the brief.
- R5.6 THE Styles panel SHALL, for reel projects, offer the reel looks, styles and caption styles
  (and change `project.reel`), not voiceover looks.
- R5.7 The free director (`autoReelPlan`) SHALL honour the same CTA, hook and caption choices.

## R6 Background processing
- R6.1 Jobs SHALL run in a module-level store mounted once in the app layout, so moving between
  dashboard, editor, styles, settings or processing never stops them. Only Cancel aborts a job.
- R6.2 EACH job SHALL track id, title, kind (video | voiceover), recipe and style labels, an
  optional thumbnail, status (`preparing` | `queued` | `running` | `done` | `error` |
  `cancelled`), the processing state, start time, progress 0–100, an ETA and the project id.
- R6.3 Jobs SHALL run one at a time (Whisper and memory); later jobs wait as `queued`. On-device
  transcription is serialised across preparation and jobs (the running job goes first). The queue
  moves on after done, error or cancel.
- R6.9 Cancel SHALL refund anything charged by that job that produced nothing saved (reel
  directing, illustrations, the script's voice); Retry SHALL reuse what the job already paid for
  (generated voice, directed plan, pictures, music); Create SHALL be idempotent per job.
- R6.10 THE job SHALL capture the signed-in user at Create; IF the user changes mid-job THEN the
  job is cancelled (with refunds).
- R6.4 THE ETA SHALL come from the media duration, weighted step progress and the observed rate,
  never negative, and shown rounded ("~30s left", "~2 min left").
- R6.5 WHILE a job is preparing or running THE SYSTEM SHALL ask before the tab is closed or
  reloaded ("Leave? Processing stops and this edit is lost."); with no live job it SHALL not.
- R6.6 WHEN a job finishes THE project list SHALL refresh, a toast SHALL say "'<title>' is ready"
  with Open; IF the creator is watching that job THEN the editor opens as before.
- R6.7 THE dashboard SHALL show a "Working on it" section on top while any job is live, failed or
  just finished: title, recipe/style badge, current step ("04 · Directing the reel"), progress bar,
  ETA, View progress, Cancel (or Retry / Open).
- R6.8 THE processing page SHALL live at `/processing/[jobId]` with a "Continue in background"
  button beside Cancel; an unknown id after a reload says the upload was interrupted.

## R7 Reel sound guardrails
- R7.1 THE editor SHALL not run the voiceover sound bed on reel projects (no double music).
- R7.2 Reel preview and export SHALL keep building the bed from the one shared `reelBedSound`
  (a parity test pins it).

## R8 Quality
- R8.1 Every new boundary parsed with zod; time in integer ms; no GSAP; deterministic seek.
- R8.2 Unit tests: schemas, recipe registry + md sync, `recipe.resolve` (+ fallback), summary
  pricing, `toReelPlan` CTA/hook/caption enforcement, caption chunking per style, jobs store
  (survives navigation, queue, cancel, completion, idempotent submit, refunds), ETA (property:
  finite, ≥ 0, progress never decreases, 0 at the end), caption styles inside the 9:16 safe area
  for random words (property).
- R8.3 typecheck, lint and tests green in every touched package; UI checked by screenshot.
- R8.4 DEV_LOG, KIRO_LOG (from runs), decision D-088.

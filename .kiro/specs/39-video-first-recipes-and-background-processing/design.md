# Spec 39 design: video first, recipes, and background processing

> Claude Code session, 2026-11-23. Implemented in small tasks, mostly by kiro-cli runs
> (`motionpop-builder`), reviewed by Claude Code. Every commit goes through kiro-cli with no
> co-author trailer.

## 1. The flow

```
/start · dashboard drop · recorder "Use this take" · sample · /start/script "Continue"
   │  file → audio store + pending intake (unchanged, D-065 #18); script → pending intake without a blob
   ▼
/start/configure                                  (new, Paper/Ink/Flame)
   ├─ jobs.prepare(pending)  → job status 'preparing': keep · decode · probe · whisper (free, local)
   ├─ left:  media card · Recipe · Style · Hook · Captions · CTA · Sound
   └─ right: Summary (costOf rows) · Total · Create
         │ Create → jobs.submit(jobId, editConfig)
         ▼
jobs store (module-level Zustand, mounted by <JobsHost/> in app/(app)/layout.tsx)
   ├─ queue: one running job at a time; others 'queued'
   ├─ runPipeline(input + prepared + editConfig, deps, onEvent, job.abort.signal)
   │     TTS first for scripts (charged here, after Create)
   ├─ progress + ETA from events
   └─ done → save → project list refresh → toast "Open" → watcher on /processing/[jobId] → editor
/processing/[jobId]   · same step cards, "Continue in background" + Cancel
/dashboard            · "Working on it" cards on top
```

The single-graphic line skips configure (one line, one graphic, nothing to choose).

## 2. Schemas (`packages/schemas`)

### 2.1 `edit-config.ts`
```ts
export const RecipeIdSchema = z.enum(['tech-explainer','finance-business','gaming','podcast-story','hot-take','custom']);
export const ReelCaptionStyleSchema = z.enum(['seam','pop','editorial','boxed','clean']);
export const ReelHookStyleSchema = z.enum(['headline','stat','visual','cold-open']);
export const MusicMoodSchema = z.enum(['auto','minimal-tech','upbeat','lofi','dramatic','none']);
// ResolvedRecipeSchema (below) is declared first in the file.
export const EditConfigSchema = z.object({
  v: z.literal(1),
  recipeId: RecipeIdSchema,
  /** The creator's own words ("Describe your own…"), ≤ 300 chars each. */
  customRecipe: z.string().trim().max(300).optional(),
  styleId: z.string().min(1).max(60),          // recipe style id, or a voiceover look id
  customStyle: z.string().trim().max(300).optional(),
  hookStyle: ReelHookStyleSchema,
  captions: z.object({ enabled: z.boolean(), style: ReelCaptionStyleSchema }),
  cta: z.object({ enabled: z.boolean(), text: z.string().trim().max(40).optional() }),
  sound: z.object({ cleanup: z.boolean(), sfx: z.boolean(), music: MusicMoodSchema }),
  illustrations: z.boolean(),
  /** What `recipe.resolve` made of the custom text (R4). */
  resolved: ResolvedRecipeSchema.optional(),
}).strict();
export const ResolvedRecipeSchema = z.object({
  recipeId: RecipeIdSchema.exclude(['custom']),
  look: ReelLookSchema, theme: ReelThemeSchema,
  captionStyle: ReelCaptionStyleSchema, hookStyle: ReelHookStyleSchema,
  musicMood: MusicMoodSchema.exclude(['auto']),
  directorNotes: z.string().trim().max(400),
}).strict();
```
`EditorProjectSchema` gets `edit: EditConfigSchema.optional()`. `ReelPlanSchema` gets
`captionStyle` and `hookStyle` (both optional). Absent `captionStyle` means the look's own:
mono → `seam`, cream → `pop` (today's two hard-coded styles keep their exact pixels).

### 2.2 Pending intake for scripts
`PendingIntakeSchema.ref` becomes optional with a refinement: `ref` is required unless
`source === 'tts'` and `tts.script` is set. `takePending` returns `blob: null` for a script.

## 3. Recipes and skills (`packages/ai/src/skills/`)

```ts
export interface DirectorSkill {
  id: RecipeId; name: string; blurb: string;
  sceneMs: { min: number; max: number };
  layoutMix: Record<ReelLayout, number>;          // targets, sum ≈ 1
  preferredTemplates: ReelTemplateId[];
  hookPattern: string; visualGrammar: string; bannedTropes: string[];
  musicBrief: string; sfxDensity: 'low' | 'medium' | 'high';
  defaults: { hookStyle; captionStyle; music: MusicMood; voiceoverLook: string; ctaEnabled: boolean };
  styles: RecipeStyle[];                          // 2–3
}
export interface RecipeStyle { id: string; name: string; look: ReelLook; theme: ReelTheme;
  captionStyle: ReelCaptionStyle; swatch: [string, string, string] /* card art */ }
export interface SkillRegistry {
  recipes(): readonly DirectorSkill[];
  recipe(id: RecipeId): DirectorSkill | undefined;
  style(recipeId: RecipeId, styleId: string): RecipeStyle | undefined;
  slotSkill(id: string): SkillEntry | undefined;  // the voiceover skills (catalogue.ts)
}
export const builtInSkills: SkillRegistry;
```

Catalogue (styles in brackets, original names only):
| Recipe | Look default | Styles |
|---|---|---|
| Tech Explainer | mono | Mono Grid (mono, plain), Warm Editorial (cream, soft), Midnight Neon (mono, bold cyan/violet) |
| Finance & Business | cream | Newsprint Ink (mono, plain), Executive Cream (cream, soft), Market Dark (mono, bold green) |
| Gaming | mono | Hyper Color (mono, bold magenta/cyan), Clean HUD (mono, soft), Bold Meme (cream, bold yellow) |
| Podcast & Story | cream | Warm Paper (cream, soft), Intimate Clean (mono, plain) |
| Hot Take | mono | High Contrast (mono, plain), Flame Punch (mono, bold ember) |

`skills/recipes/<id>.md` mirrors each recipe in the director-skill markdown format (frontmatter
`id`, `name`, `version`, sections Intent / Pacing / Layout mix / Hook / Visual grammar / Music /
Banned). A test parses the frontmatter and checks ids and names match the registry.

The slot shot sequence (R3.6): `shotSequenceOf(skillId)` reads the `## Shot sequence` section of
the matching `skills/*.md`, bundled as a generated TS map (`packages/ai/src/skills/slot-sequences.ts`,
written by a small script and checked by a sync test, the same pattern as prompts: no fs at runtime).

## 4. `recipe.resolve` (`packages/ai/src/tasks/recipe-resolve.ts`)
- Input `{ recipeId, recipeText?, styleText?, kind: 'video' | 'voiceover' }` (texts ≤ 300); output
  `ResolvedRecipeSchema`. `defaultMode: ONLY_ON_DEVICE` (review #1: no unmetered cloud path), cost 0,
  `jsonSchema` for structured output (D-029), `maxOutputTokens` 300, prompt
  `prompts/recipe-resolve.v1.ts`. No device model → the keyword resolver, immediately.
- Fallback `resolveByKeywords(input)`: scores recipe keywords (code, app, AI → tech; money,
  market, stock → finance; game, stream → gaming; story, interview → podcast; opinion, rant,
  "unpopular" → hot-take), colour words → theme accent, "dark/neon" → mono + bold, "warm/paper" →
  cream. Pure, tested, always valid.
- Runs on the configure screen when a custom field loses focus (debounced 600 ms), shows its
  route chip (`⚡ free · on-device`, or "free · quick match" for the keyword resolver), and its
  result in the summary.

## 5. Engine wiring

### 5.1 `reel.direct`
`ReelDirectInputSchema` gains `brief?: { recipe: string; style: string; hookStyle; cta: { enabled; text? };
captionStyle; music: MusicMood; notes?: string }`. `reelDirectPromptV3` appends a
`RECIPE` block rendered by `recipeBrief(skill, config)`: pacing, layout targets in %, preferred
templates, hook pattern for the hook style, banned tropes, CTA rule, music brief for the mood, the
creator's notes (quoted as data). `directReel` / `directReelPaid` / pipeline `directReel` pass it.

### 5.2 `toReelPlan` and `autoReelPlan` enforcement: `applyEditChoices(plan, words, choices)`
One pure post-pass used by both directors:
- CTA off → every `cta` scene becomes speaker `none`. CTA on + text → the last scene becomes
  speaker `cta` with `verb`/`keyword` from the text (first word = verb, the rest = keyword,
  "Comment LINK" → verb Comment, keyword LINK; one word → verb Follow, keyword = text).
- Hook style → scene 1: `stat` = counter if a number word lies in scene 1, else headline;
  `visual` = keep an image/logo/website if the director chose one, else headline;
  `cold-open` = drop `plan.hook`; `headline` = headline card when scene 1 is a speaker shot.
- Sets `plan.captionStyle`, `plan.hookStyle`, `plan.captions = captions.enabled`, `plan.theme`
  from the style, `plan.look` from the style, and the music brief from the mood (`none` → drop
  `music`).
Property test: for random plans and choices the output parses, tiles the timeline, has no `cta`
scene when CTA is off, and ends in `cta` when CTA is on with text.

### 5.3 Captions (`packages/motion/src/reel/captions.ts`, `mount.ts`)
`chunkCaptions(words, look, style?)`: per style `{ maxWords, maxChars, casing }` —
seam (2 words, 16 chars, upper; today's mono), pop (2, 13, lower-sentence; today's cream),
editorial (3, 20, sentence case, italic serif-free Geist italic), boxed (2, 14, upper, ink box on
accent), clean (4, 26, sentence, small white with shadow). The painter sets
`data-caption-style` and the per-style CSS lives in the reel stylesheet. Pure function of time.
Absent style = the look's default, so stored reels are unchanged (snapshot test).

### 5.4 Pipeline
`PipelineInput` gains `edit?: EditConfig` and `prepared?: PreparedMedia` (§6.2).
- Video: `cleanupOn = edit.sound.cleanup`; `look`/`theme` from the style; `directReel` gets the
  brief; `applyEditChoices` runs on whatever plan comes back; `resolveReelMedia` gets
  `maxIllustrations: edit.illustrations ? 3 : 0`; music skipped for `none`;
  `audio.autoSfx = edit.sound.sfx`; `project.edit = edit`.
- Voiceover: `styleId` = the chosen look; captions preset from the caption style
  (seam→studio, pop→pop, editorial→editorial, boxed→boxed, clean→clean); `cleanup` from sound;
  `audio.autoSfx` from sound; music mood → `musicId` (`minimal-tech`/`lofi` → `calm-pad`,
  `upbeat`/`dramatic` → `steady-pulse`, `none`/`auto` → none unless the recipe default says
  otherwise); the recipe's slot skills bias nothing else in v1 (recipes for voiceover = look +
  captions + sound + director energy). `project.edit = edit`.
- Script: the job calls `generateVoice` (charged, after Create) then runs the pipeline with
  `source: 'tts'`, `cleanup: false`.

### 5.5 Styles panel for reels
When `project.reel` exists, the Styles panel lists the recipe styles (grouped by recipe) and the
five caption styles; picking one runs a `setReelStyle` command (look + theme + captionStyle, one
undo step, `restyleReelPlan` for the look change).

### 5.6 Sound guardrails
`useSoundBed` returns early (detaches) when `project.reel` is set. Render: `run-render.ts` /
`bed.ts` read `audio.autoSfx` (false → no reel hits), `audio.musicGainDb` (applied to the reel
music like the preview) and `reel.music.src`, matching `reel-preview.tsx`. A test pins the parity
of the three switches.

## 6. Jobs (`apps/web/lib/pipeline/jobs-store.ts`)

### 6.1 State
```ts
type JobStatus = 'preparing' | 'queued' | 'running' | 'done' | 'error' | 'cancelled';
interface Job {
  id: string;                     // 'j-' + 10 base-36
  title: string; kind: 'video' | 'voiceover';
  recipeLabel?: string; styleLabel?: string; thumbUrl?: string;
  status: JobStatus; prep: { pct: number; stage: PrepStage; error?: string };
  processing: ProcessingState;    // the existing reducer
  createdAt: number; startedAt?: number; progressPct: number; etaMs: number | null;
  durationMs?: number; projectId?: string; error?: string;
}
// actions: prepare(pending) → id · submit(id, edit) · cancel(id) · retry(id) · dismiss(id)
```
Controllers, blobs and prepared PCM live in a module `Map<jobId, Runtime>` outside Zustand
state (not serialisable, not rendered). Runtime = `{ abort, input, prepared: Promise<PreparedMedia>, edit }`.

### 6.2 Preparation
`prepare(media)`: decode once (`decodeForPipeline`), probe video once (`probeAndSampleVideo`),
then Whisper on device. Results land in `PreparedMedia { audio, probe?, transcript? }` as
promises. The pipeline's `deps.decode`, `deps.probeVideo` and `deps.transcribe` are wrapped to
return the prepared value when it exists (or await the in-flight one), so Create never repeats
work (R2.8). Prep percent: kept 5 % → decoded 25 % → probed 35 % → transcribe 35–100 %
(Whisper progress). Scripts have no prep (Ready at once).

### 6.3 ETA (`lib/pipeline/eta.ts`, pure)
Weights per kind: video {transcribe .25, clean .1, moments .15, suggest .3, plan .2},
voiceover {transcribe .4, clean .15, moments .05, suggest .15, plan .25}. Prior seconds =
`a + b · durationS` per kind (video a 20 b 0.6; voiceover a 8 b 0.35). `progress = Σ done weights +
active weight · within-step fraction (Whisper %, or 0.5)`. `eta = max(0, blend(prior · (1-progress),
elapsed · (1-progress)/progress))` with the blend shifting to the observed rate as progress grows.
Formatted by `formatEta`: "~15s left", "~2 min left", "Almost done". Property test: 0 ≤ eta,
eta = 0 at progress 1, never NaN.

### 6.4 Host
`<JobsHost/>` (client, in `app/(app)/layout.tsx`): `beforeunload` while any job is
`preparing | queued | running`; on done → `projectLibrary` refresh event, sonner toast with
Open; announces in an `aria-live` region. Processing page subscribes to its job; when it is the
watched job and done, it routes to the editor after the celebration delay (as today).

### 6.5 Routes
- `/start/configure` reads the pending intake; no pending → back to `/start`.
- `/processing/new` keeps working for old links: pending → `/start/configure`, else drop zone →
  configure.
- `/processing/[jobId]`: job in store → live view; project id → editor; else "interrupted".

## 7. Configure screen (`components/configure/`)
Two columns at ≥ 1024 px (left 1fr, right 360 px sticky), stacked below. PaperPage, ProjectTopBar,
Bebas section heads ("01 RECIPE" …), 2 px ink borders, hard shadows, flame for the Create button
only. Cards (`OptionCard`): 120×88 illustrated CSS thumbnail + label, Selected = ink 3 px ring +
"Selected" tag + flame offset shadow; keyboard: radiogroup with arrow keys. Thumbnails are CSS
drawings, never photos: recipe = icon + two swatch bars; style = the style's paper/ink/accent in a
tiny 9:16 frame with a caption bar; hook = mini frames (big title / big number / picture block /
plain speaker); caption = the caption text "TO GET STARTED" drawn in that style; music = a tiny
waveform tinted by mood. "More coming soon" = dashed pill, not clickable. Pip sits in the media card
corner with a speech bubble that follows prep ("Reading your video…", "Got every word!").

Summary rows (pure `summaryRows(kind, edit, ctx)` in `lib/configure/summary.ts`):
| Row | Video | Audio | Script |
|---|---|---|---|
| Voice from script | – | – | `costOf('tts', minutes)` |
| Transcription | Free · on-device | Free · on-device | Free (script timings) |
| Speech cleanup | Free (if on) | Free (if on) | – |
| Reel directing | `costOf('reel')` | – | – |
| Graphics plan | – | Free | Free |
| AI illustrations | up to `3 × costOf('image')` (if on) | – | – |
| Captions / Sound effects / Music | Free | Free | Free |
| **Total** | sum, "up to" when illustrations on | | |
Signed out / no credits → paid rows show "Free director" / "Off · needs credits" and the total is 0.

## 8. Testing
Unit + property tests as in R8.2; e2e: update the start → processing specs to pass through
configure (sample → configure → Create → processing → editor) and add a test that leaving
`/processing/[jobId]` for the dashboard keeps the job and shows the Working card.

## 9. Edge cases
- Pending file removed (Swap) → its prep is aborted and the stored blob deleted.
- Two configure tabs → each owns its own job id; the pending intake is cleared once taken.
- Prep failure (cannot decode) → media card shows the intake reason with "Choose another file";
  Create disabled.
- Create while signed out → job runs with free paths (as today).
- Cancel during TTS → spend refunded by `generateVoice`'s existing failure path.
- Reload during a job → `beforeunload` prompt; after reload `/processing/[jobId]` is
  "interrupted", the dashboard shows nothing for it.

## 10. Review fixes (Kiro spec-reviewer, run 2, 2026-11-23)

1. `recipe.resolve` is device-only; keywords otherwise (§4).
2. **Credit safety.** `directReelPaid`, `resolveReelMedia` and `generateVoice` take an `AbortSignal`;
   an abort after the spend refunds it (and drops the result). The job runtime caches what was
   paid for (`voice`, `directed plan`, `media`, `music`) and Retry passes it back through
   `PipelineInput.reuse`, so a retry never pays twice. `submit(id)` is a no-op unless the job is
   `preparing`. Property test: random submit/cancel/retry orders against a fake ledger never charge
   twice and every charge for an unsaved job is refunded.
3. TTS: `generateVoice(deps, input, signal?)`; abort → refund.
4. **Whisper slot.** `lib/transcribe/whisper-lock.ts`: a FIFO mutex around `transcribeOnDevice`;
   the running job's request jumps the queue ahead of preparation.
5. `/processing/new`: `meta.single` → straight to a job with no configure step (`jobs.prepare`
   + immediate `submit` with the default config).
6. **Pending ownership.** Configure `peekPending()`s and loads the blob without clearing; a
   reload re-prepares. At Create the job owns the ref and clears the hand-off (keepAudio). Blob
   deletion by status: done → kept by the project; error → kept until Dismiss/Choose another
   (Retry needs it); cancelled / dismissed → deleted.
7. Prep runs `validateIntake`, `checkDuration`, `isSilent` (the pipeline's own helpers); an intake
   error that still reaches the job sets `error` with a "Choose another file" action.
8. **Deps outside React.** `setJobDepsProvider(() => browserPipelineDeps({ credits }))` registered by
   `<JobsHost/>` from `useCreditsClient()`. `submit` captures `uid`; an auth change to another uid
   cancels running jobs.
9. Summary: "Reel directing" row notes "includes the retake check" (the review runs only inside a
   directed reel). Music row: "AI soundtrack · Free · ☁" (route chip shown); `none` hides it.
10. Music reused on Retry (cached on the runtime).
11. `applyEditChoices`: CTA with text **appends** a speaker `cta` scene over the last ~1.6 s (split
    from the last scene, min 900 ms; if the last scene is already speaker/none it converts it);
    verb/keyword truncated with `cut()` (14 / 16); converted scenes clear `carry`, `tag`, `bg`;
    property adds "cta ⇒ layout speaker" and length limits.
12. Hook data: `stat` uses the existing number extractor from `packages/ai/src/slots` (said numbers
    only); headline title = `plan.hook` if present else the first 4 words of scene 1, title-cased;
    `cold-open` removes `hook` for both looks.
14. Caption styles: `clean` capped at 3 words / 22 chars; `editorial` uses Geist (no italic face is
    bundled) at a lighter weight with an accent rule; property test: every style, 9:16, random
    words → each chunk within its limits and its box inside the clear zones (top 12 %, bottom 20 %).
15. Task 9 narrowed: the `useSoundBed` guard + a `reelBedSound` preview/render parity test.
16. ETA: `p = 0` → prior only; progress starts at the weights already covered by preparation;
    property: finite, ≥ 0, progress non-decreasing.
17. `setReelStyle` also updates `project.edit.styleId` / `captions.style` in the same command.
18. The look is chosen before `directReel` (from the style); the post-pass never changes `look`.
21. Steering: hybrid-ai routing row, ai-tasks task, data-model `project.edit`, screens
    `/start/configure`.
23. `ReelDirectInputSchema.brief` fields all have `.max()` (recipe 40, style 40, notes 400, cta 40).
24. `styleId` is resolved through the registry (`styleFor(recipeId, styleId)` → default style when
    unknown); changing recipe resets the style to the recipe's first.
25. Explicit `none` music wins; `source: 'tts'` forces cleanup off.
26. Script transcription row: "Free · on-device" (Whisper runs on the generated voice).
27. Voiceover recipes are presets (R3.7).
28. Job store keeps scalars + step states; words and slots for the strip live in the runtime map
    and are read by the processing page through a selector hook with a 150 ms throttle.
29. beforeunload is tested through the handler's `preventDefault`; offline / kill switch join R2.9.
30. Render parity: `captionStyle`/`hookStyle` reach the render through the same compiled reel
    runtime; task 21 rebuilds the runtime bundle and notes that the render service must be
    redeployed with the web app.
31. No third-party names in the spec header.
Not taken: #19 cut order (founder: no freeze date, build it all); #20 commit trailers (founder rule
2026-11-23: all commits through kiro-cli, no co-author trailers; the logs record which tool wrote
what); #32 pills (founder asked for "More coming soon" pills; they stay small and quiet).

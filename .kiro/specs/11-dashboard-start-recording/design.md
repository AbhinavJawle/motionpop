# Design: 11 dashboard, start and recording

_Written headlessly in Kiro CLI (claude-opus-5.5), 2026-11-16. Requirements in `requirements.md`._

## 0. Decisions taken without the founder (D-034)

| # | Decision | Why | Reversible? |
|---|---|---|---|
| 1 | Projects move to Firestore + Storage in this spec (R1), with IndexedDB kept for local mode. | Spec 04 parked Firestore sync "until Firebase is set up"; no spec owns it, the dashboard needs a real list, judges look for meaningful Firestore use, and spec 08 export needs the audio in Storage. | Yes: repository interface unchanged. |
| 2 | Project documents store times as **integer epoch ms**, not Timestamps; slot and version `params` are stored as **JSON strings** (`paramsJson`). | Integer ms everywhere (architecture "Time and units"); scene params can contain nested arrays, which Firestore rejects. Parsed with the component's zod schema on read anyway. | Yes, with a parser migration. |
| 3 | `voiceover.peaks` is never written to Firestore. | Peaks are recomputed in the worker in ~100 ms; they would bloat the document. | Yes. |
| 4 | A **poster slot** (`poster`) is denormalised on the project document. | Cards and the Continue card play a one-slot composition from the summary alone, so the dashboard reads one query and no sub-documents (R12.4). | Yes. |
| 5 | Re-record / Replace audio creates a **new project** ("{title} (take 2)"), the old one stays. | Slots belong to words; a new take has new words, so no mapping is honest. Non-destructive and simple. | Yes. |
| 6 | Recording captures PCM with an AudioWorklet and encodes a **24 kHz mono 16-bit WAV**, not MediaRecorder WebM. | Intake and Storage rules accept MP3/WAV/M4A only; 24 kHz matches D-024; 10 min = 28.8 MB < 50 MB. | Yes. |
| 7 | "Try a sample" sits on the Upload card's drop zone as a second line ("MP3, WAV, M4A · Try a sample"). **Deliberate deviation** from `start.png`, like the download icon in the Ready modal. | Judges need it (hackathon-compliance) and the design has no place for it; this is the smallest visual change. | Yes. |
| 8 | Unbuilt targets ("Styles", "Explore styles", unbuilt style cards, Brand kit, single graphic) answer with an "on its way" toast. | Handoff §10: never a dead click. | Yes. |
| 9 | `tts.generate` (spec 05 task 12) moves here. It gets a media path in the router (`speak`), because TTS returns audio, not JSON. | The screen and the task ship together; all runtime AI still goes through `packages/ai`. | Yes. |
| 10 | TTS voices are shown with our own labels ("Warm", "Bright", "Calm", "Deep"); provider ids live in Remote Config `tts_voices`. Voice preview clips are generated **once**, by a script, with the founder's go-ahead (about $0.01), and bundled. | R12.5; no per-click spend. | Yes. |
| 11 | Speech speed is a delivery instruction in the TTS prompt ("Read at a relaxed pace"), not a sample-rate change. | The SDK's `speechConfig` has no rate field (checked in the Firebase "Generate speech" docs via Context7, 2026-11-16); time-stretching shifts pitch. Unverified how precisely the model follows it: task 18 measures it. | Yes. |
| 12 | Stats formulas: "videos this week" = projects created in the last 7 local days; "graphics generated" = sum of `graphicsGenerated`; "saved" = 5 minutes per ready graphic, labelled "~" with a tooltip saying so. | Honest, computable from summaries. The 5-minute figure is a founder question. | Yes. |
| 13 | "Shared with me" shows an empty state; sharing to accounts is not in the MVP. | Product non-goal (team collaboration). | — |
| 14 | ⌘K focuses the capture bar; a full command palette is Later. | Smallest thing that honours the visible key. | Yes. |

## 1. Routes and components

```
app/(app)/dashboard/page.tsx      → <DashboardScreen/>           (replaces DashboardPlaceholder)
app/(app)/start/page.tsx          → <StartScreen/>               (?style=<id> preselects a style)
app/(app)/start/record/page.tsx   → <RecordScreen/>
app/(app)/start/script/page.tsx   → <ScriptScreen/>              (?text=… prefills, sessionStorage fallback)
app/page.tsx                      → redirect('/dashboard')        (landing is spec 16)

components/dashboard/
  dashboard-screen.tsx    top bar + header + capture bar + body (empty | full) + try-a-style + footer + drop layer
  dashboard-top-bar.tsx   80 px bar: logo, nav, CreditsChip variant="dashboard", New project, AvatarMenu
  greeting.tsx            eyebrow, greeting, subline, <Pip look="cursor" props={night?['nightcap']:[]} glow/>
  capture-bar.tsx         state machine §5
  empty-card.tsx          sleeping Pip on cloud, copy, CTA
  drop-layer.tsx          window drag listeners, dashed page border, catching card (R4.3–R4.5)
  continue-card.tsx       PosterPlayer + meta + Pip popcorn
  stat-tile.tsx           number (NumberRoll) + label + Sparkline (SVG polyline)
  projects-toolbar.tsx    title + count, search, sort, view toggle, tabs
  project-card.tsx        poster, meta, status chip, slot dots, ⋯ menu
  project-row.tsx         list view (not designed: same tokens, 56 px rows)
  try-a-style.tsx         scroll row of StyleCard
  help-sheet.tsx          Modal: shortcuts table + on-device AI note (shared with Start "? Help")
components/start/
  start-screen.tsx, project-top-bar.tsx (editor top bar layout without undo/redo/export),
  record-card.tsx, upload-card.tsx, script-card.tsx
  record-screen.tsx, record-card-live.tsx, live-waveform.tsx (canvas), mic-select.tsx
  script-screen.tsx, script-editor.tsx, voice-card.tsx
components/editor/panels/
  projects-panel.tsx, voice-panel.tsx      (inside the LeftPanel container of spec 10 task 1)
components/dashboard/poster-player.tsx   one-slot composition from a Poster (see §3), lazy, single-player lock
                                          (also used by the Projects panel)
components/ui/slot-dots.tsx, status-chip.tsx, avatar-menu.tsx   (new primitives, used by dashboard and editor)
lib/projects/
  firestore-repository.ts, project-docs.ts (pure: project ↔ documents), summary.ts (pure),
  repository-provider.ts (signed in → Firestore, else IDB), use-project-list.ts
lib/audio/
  hybrid-audio-store.ts, upload-queue.ts, recorder.ts, recorder.worklet.ts, level.ts (pure)
lib/intake/pending.ts     in-memory hand-off of a File/Blob from any entry point to /processing/new
lib/dashboard/            greeting.ts, stats.ts, relative-time.ts, search.ts (all pure)
lib/script/               estimate.ts (pure), voices.ts
packages/ai/src/tasks/tts-generate.ts, packages/ai/src/prompts/tts-generate.v1.ts, router `speak()`
packages/schemas/src/project-doc.ts, start.ts
```

Every new pure module gets unit tests; the ones in §9 get properties.

## 2. Data model

### 2.1 Firestore layout (refines `data-model.md`)

```
projects/{id}                  ProjectDoc (summary + project fields, no transcript/slots/versions)
projects/{id}/transcript/main      TranscriptDoc  { schemaVersion: 1, ...Transcript }
projects/{id}/transcript/original  TranscriptDoc
projects/{id}/slots/{slotId}       SlotDoc        Slot without `params`, plus paramsJson
projects/{id}/versions/{vid}       VersionDoc     Version without `params`, plus paramsJson (immutable)
```

```ts
// packages/schemas/src/project-doc.ts
export const PosterSchema = z.object({
  slot: z.object({                       // a CompileSlot, times relative to 0
    componentId: z.string().min(1),
    durationMs: z.number().int().positive().max(12_000),
    keyMomentMs: z.number().int().nonnegative(),
    paramsJson: z.string().max(20_000),
    words: z.array(z.object({ startMs: IntMs, endMs: IntMs })).max(60).optional(),
    stress: z.array(z.number().int().min(0).max(100)).max(60).optional(),
    energy: EnergySchema.optional(),
  }),
  styleId: z.string().min(1),
  format: FormatSchema,
});

export const ProjectDocSchema = z.object({
  schemaVersion: z.literal(1),
  ownerId: z.string().min(1),
  title: z.string().min(1).max(80),
  format: FormatSchema, fps: z.literal(30),
  styleId: z.string().min(1),
  energy: EnergySchema.optional(),
  durationMs: z.number().int().positive(),
  status: z.enum(['draft', 'processing', 'ready', 'rendering', 'exported']),
  voiceover: VoiceoverSchema.omit({ peaks: true }),
  // spec 12 adds `captions` and `audio` here, optional with defaults.
  slotCount: z.number().int().nonnegative(),
  readySlotCount: z.number().int().nonnegative(),
  graphicsGenerated: z.number().int().nonnegative(),
  poster: PosterSchema.optional(),
  lastRenderId: z.string().optional(),
  lastOpenedAt: IntMs,
  createdAt: IntMs, updatedAt: IntMs,
}).refine((d) => d.readySlotCount <= d.slotCount);

export type ProjectSummary = Pick<ProjectDoc,
  'title'|'format'|'styleId'|'durationMs'|'status'|'slotCount'|'readySlotCount'|
  'graphicsGenerated'|'poster'|'lastRenderId'|'lastOpenedAt'|'createdAt'|'updatedAt'>
  & { id: string; slotStates: ('ready'|'pending')[] };   // slotStates ≤ 12, for the dots
```

`slotStates` is stored too (array of ≤ 12 strings), so the dots need no slot reads.

`EditorProject` (spec 04) gains `ownerId?` (filled by the Firestore adapter) and `lastOpenedAt?` (set by the editor on open, outside the undo history, like `updatedAt`). No other editor-side change.

### 2.2 Pure mapping (`lib/projects/project-docs.ts`)

```ts
toDocs(p: EditorProject, ownerId: string): ProjectDocSet          // { project, transcripts, slots: Map, versions: Map }
fromDocs(set: unknown): ParseResult<EditorProject>                 // zod on every part, then EditorProjectSchema
summarise(p: EditorProject, resolveKeyMoment): ProjectSummaryFields // counts, slotStates, poster
diffDocs(prev: ProjectDocSet | null, next: ProjectDocSet): Write[] // set / delete per changed doc
```

- `graphicsGenerated` = versions whose `source` is `ai-device`, `ai-cloud`, `ai-claude` or `plan`.
- `poster` = the first `ready` slot whose component is in the registry, preferring the director's peak slot when `energy` marks one, with `keyMomentMs` from the component (or the scene's focal cue). No ready slot → no poster (R5.5).
- `diffDocs` compares canonical JSON (sorted keys) of each document. Versions are immutable: a changed version with an existing id is a bug and throws.
- One save = one `writeBatch` (≤ 500 operations; a save larger than that is split, project document last, so a reader never sees a summary ahead of its slots).

### 2.3 Repository (`ProjectRepository` from spec 04, extended)

```ts
interface ProjectRepository {
  load(id): Promise<LoadResult>; save(p): Promise<void>; restoreBackup(id): Promise<LoadResult>;
  list(): Promise<ProjectSummary[]>;              // new (IDB: summarise every stored project)
  subscribeList?(fn: (s: ProjectSummary[]) => void): () => void;   // Firestore onSnapshot
  delete(id): Promise<void>;                      // new
  duplicate(id, newTitle): Promise<string>;       // new: new ids for project, slots, versions
  markOpened(id, atMs): Promise<void>;            // new: lastOpenedAt only
}
```

`FirestoreProjectRepository` keeps the last saved `ProjectDocSet` per id in memory for `diffDocs`. `restoreBackup` returns not-found (Firestore has no backup copy; the editor's "Restore last good version" button only shows when `hasBackup`). List query: `where('ownerId','==',uid).orderBy('updatedAt','desc').limit(100)`, needing the composite index in `firestore.indexes.json`. The Continue card takes the summary with the highest `lastOpenedAt`.

Firestore is initialised with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` so edits queue offline (R1.2). Verify the current API name with Context7 before coding.

### 2.4 Audio (`HybridAudioStore`)

```
put(blob) → ref "storage:users/{uid}/audio/{key}.wav"
  1. IDB put under {key} (instant local playback)            2. enqueue upload (IDB-persisted queue)
get(ref)  → IDB hit, else Storage getBlob(path), cached into IDB
delete(ref) → Storage delete + IDB delete (best effort, logged)
pending(projectRefs) → number of queued uploads for these refs (drives "Saving…")
```

The queue retries with backoff (1 s, 4 s, 15 s, then on next app start). Reading a blob from another device (`getBlob`) needs a CORS rule on the Storage bucket for the app's origins; that is a one-line bucket configuration change and needs the founder's approval (open question 5), so until then a device without the local copy shows "This voiceover lives on another device" instead of failing silently. Content type `audio/wav`; size ≤ 50 MB is already enforced at intake and by `storage.rules`. `loadVoice` (spec 05) learns the `storage:` prefix. Local mode keeps `idb:` refs.

### 2.5 Start draft and intake hand-off

```ts
// packages/schemas/src/start.ts
export const StartDraftSchema = z.object({
  title: z.string().trim().min(1).max(80).default('Untitled Project'),
  format: FormatSchema.default('16:9'),          // initial value: users/{uid}.settings.defaultFormat
  styleId: z.string().min(1).optional(),          // from ?style= or a Try-a-style card
});
export const PendingIntakeSchema = z.object({
  source: z.enum(['upload', 'record', 'sample', 'tts']),
  name: z.string().min(1),
  cleanup: z.boolean(),                            // false for tts (spec 05 R6.1)
  tts: z.object({ voiceId: z.string(), speed: z.number(), script: z.string().max(3000) }).optional(),
});
```

`lib/intake/pending.ts` holds `{ blob, meta: PendingIntake, draft: StartDraft }` in memory only. `/processing/new` takes it on mount; with nothing pending (a reload) it shows its own drop zone, as today. `PipelineInput` grows `title?`, `format?`, `styleId?`, `cleanup?` and `source: … | 'tts'`; `runPipeline` passes them into the project it creates. The draft lives in `sessionStorage` (`mp:start-draft`), parsed with `StartDraftSchema` on read (a bad value falls back to the defaults), so a reload on `/start` keeps it.

## 3. Previews on the dashboard

`PosterPlayer` compiles a one-slot project from a `Poster` (`compileProject` with `durationMs = slot.durationMs`, no voice) into a `<hyperframes-player>` (default sandbox: library components only, D-021). It shows a still (seek to `keyMomentMs`, paused) until hover or focus, then plays a loop. A module-level lock allows one playing player; mounting is lazy (`IntersectionObserver`). Reduced motion: still only. Projects without a poster and unbuilt Try-a-style cards show a static `StylePoster` (HTML/CSS recreation of the designed thumbnail with its exact copy, from the "Try a style" CSS frames). The "↻ 0:0N" chip shows the loop length rounded to seconds.

Try-a-style samples: each built style gets `styles/<id>.sample.ts` in `apps/web/lib/motion/` (a ready slot with original content taken from the design thumbnails: "Small changes. Bigger impact.", "$2.4M", "Clarity is everything.", "Cut. Paste. Make it move.", "+128%"). Today `editorial-explainer` and `paper-collage` exist; Dark Money, Clean Minimal and Neon Data show stills until spec 14 builds them.

## 4. Dashboard states

```
data = loading | empty | full                    (list() / subscribeList; local mode: IDB)
drag = idle | over(files) | dropped               (drop-layer)
```

| State | Body |
|---|---|
| loading | skeleton of the full layout (shimmer, reduced motion: static) |
| empty | `EmptyCard` (R4.1) |
| full | `ContinueCard`, stat tiles, toolbar, grid or list |
| drag over (empty) | `EmptyCard` swaps to the catching variant in place |
| drag over (full) | catching card floats centred in the viewport over a 40 % `bg` scrim |

Drop layer: counts `dragenter`/`dragleave` on `window` (a counter, so moving over children does not flicker, R4.5), accepts only `DataTransfer.types` containing `Files`, and calls `validateIntake` on drop. Pip: `catching` while over, `caught` for 600 ms on drop, then `router.push('/processing/new')` with the pending intake.

Greeting (`lib/dashboard/greeting.ts`): `greet(hour: 0..23, name?) → { line, subline, night }`. Day sublines (not designed, same voice): morning "Fresh ideas taste better with coffee.", afternoon "Let's make something move.", evening "One more story before dinner?".

Stats (`lib/dashboard/stats.ts`): `dashboardStats(summaries, nowMs, tzOffsetMin) → { videos, graphics, savedMin, spark: { videos: number[7], graphics: number[7], saved: number[7] } }`. Day buckets are local days; graphics and saved minutes are attributed to the project's `updatedAt` day (documented approximation). Saved = 5 min × ready slots. Format: "~1h 10m", "~25m", "0m".

Relative time ("12 minutes ago", "1 hour ago", "yesterday", "2 days ago", then a date) is pure with an injected `now`. Search uses `normalize('NFD')` and strips marks.

## 5. Capture bar state machine

```
idle ──pointerdown(mic)──► arming (300 ms timer) ──timer──► recording ──pointerup──► handoff(record)
  │                          └─pointerup before 300 ms──► router.push('/start/record')
  ├─paste/typing──► typing ──Enter──► router.push('/start/script', text)
  │                         └─Escape──► idle
  └─⌘K──► focused
recording ──permission denied──► error("Pip can't hear you…", [Upload instead])
```

The inline recording reuses `lib/audio/recorder.ts`. While recording, the bar shows the timer (mono), a 24-bar mini level meter and "Release to finish". Keyboard users get the same via Space on the focused mic (toggle instead of hold, `aria-pressed`).

## 6. Recorder (`lib/audio/recorder.ts`)

```ts
interface Recorder {
  start(deviceId?: string): Promise<void>;   // getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl } })
  pause(): void; resume(): void;
  switchDevice(deviceId: string): Promise<void>;   // keeps captured chunks
  stop(): Promise<{ wav: Blob; durationMs: number }>;
  onFrame(fn: (f: { peak: number; rms: number; tMs: number }) => void): () => void;  // every 50 ms
  dispose(): void;
}
```

The AudioWorklet posts Float32 chunks; the main thread keeps them in a list (no growth beyond 10 min × ctx rate). `stop()` resamples to 24 kHz with an `OfflineAudioContext` and calls `encodeWav` (spec 05). `level.ts` is pure: `feedback(frames) → 'good' | 'quiet'`, quiet when the RMS of voiced frames (peak > −50 dBFS) in the last 1.5 s is below −42 dBFS. The live waveform keeps one bar per 50 ms: recorded bars ember, the newest 12 bars violet, then fading violet (as in `recording.png`).

Timer format `mm:ss.d` (tabular), from captured sample count, so pause never drifts it.

## 7. Paste script and `tts.generate`

```
ScriptScreen
  text ─► estimate.ts: words, estMs = words / (WPM[voice] × speed) × 60 000, credits = 2 × ceil(estMs / 60 000)
       ─► tagSpans(fakeTimedWords(text)) → underline spans of kind number | place | comparison
  Generate ─► credits.spend('tts', n, refId)      (spec 13 contract, §8)
           ─► router.speak(ttsGenerate, { text, voiceId, speed })   ONLY_IN_CLOUD
                 chunks of ≤ 1,500 chars at sentence ends, sequential, 300 ms silence between paragraphs
                 PCM 24 kHz mono 16-bit (Firebase docs) → concat → encodeWav
           ─► pending intake { source: 'tts', cleanup: false, tts: {...} } → /processing/new
  failure  ─► credits.refund(refId) → "Couldn't generate the voice. Nothing was charged." [Retry]
```

`TaskDef` is JSON-only, so the router gets a sibling entry for media output:

```ts
interface SpeechTaskDef<I> { id: 'tts.generate'; input: z.ZodType<I>; model(cfg): string;
  prompt(i: I): string; voice(i: I): string; cloudCost(i: I): number; }
speak<I>(task: SpeechTaskDef<I>, input: I): Promise<{ pcm: Int16Array; sampleRate: 24000;
  ranOn: 'cloud'; model: string; costCredits: number; latencyMs: number }>
AIProvider.generateSpeech?(req: { model; prompt; voiceName }): Promise<{ base64Pcm: string; mimeType: string }>
```

`speak` respects the kill switch, validates the input with zod, checks that the reply has an `audio/*` inline part of non-zero length, and emits a usage event like `run`. Provider: `getGenerativeModel(ai, { model: cfg.modelTts, generationConfig: { responseModalities: [ResponseModality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } } })`, then `generateContent(prompt)` and `response.inlineDataParts()` (Firebase "Generate speech" page, read via Context7 2026-11-16; its sample uses the Gemini Developer API backend, so check the Agent Platform backend at implementation).

Prompt (`prompts/tts-generate.v1.ts`): "Read the following script aloud for a narrated explainer video. {pace line}. Read only the script text." Pace lines: 0.9 "at a relaxed, unhurried pace", 1.0 "at a natural pace", 1.1 "at a brisk, energetic pace". Speed choices on screen: "Relaxed", "Natural", "Brisk".

Voices (`lib/script/voices.ts`): `{ id: 'warm' | 'bright' | 'calm' | 'deep', label, providerVoice, wpm, previewSrc }`. Defaults for `providerVoice` and `wpm` come from Remote Config `tts_voices` (JSON, zod-validated, typed defaults). `previewSrc` is `/voices/<id>.wav`, made by `apps/web/scripts/voice-previews.ts` (founder go-ahead, then recorded in `docs/third-party.md` as generated audio). Without preview files, the play buttons are hidden, not broken.

## 8. Credits contract (owned by spec 13)

This spec calls, and does not implement:

```ts
// lib/credits/client.ts (spec 13)
spend(task: CreditReason, credits: number, refId: string): Promise<{ ok: true; balance: number } | { ok: false; reason: 'insufficient' | 'unavailable' }>
refund(refId: string): Promise<void>        // idempotent
useCredits(): { balance: number | null }    // users/{uid}.credits, onSnapshot
```

If spec 13 has not landed when task 18 starts, task 18 implements `useCredits` (read-only) and stubs `spend`/`refund` as "allowed, free" **only in local mode**; with Firebase on, Generate stays disabled with "Credits are on their way" until spec 13 lands. No client-side balance writes, ever.

## 9. Routing and cost chips

| Action | Where it runs | Chip shown before |
|---|---|---|
| Moment underlines on the script | on-device code (tagger), no AI | none |
| `tts.generate` | ONLY_IN_CLOUD | violet `☁ {n}` on the Generate button |
| Transcribing the take | on-device Whisper (spec 05) | Processing step card route |
| Everything else here | no AI | — |

## 10. Failure handling

| Failure | Behaviour |
|---|---|
| Firestore read fails / offline on first load | cached list from the local cache, banner "You're offline. Showing what this device remembers." |
| A project document fails zod | card shows "This save looks damaged" with Open (the editor offers restore when it can) and Delete |
| Upload fails | queued, retried; the editor footer says "Saving…" then "Couldn't upload audio · retrying" (warn dot) after the third failure |
| Mic denied / no device | inline error with "Upload instead" (R3.5) |
| Mic unplugged mid-take | auto-pause, "Your mic went quiet. Pick another one to keep going." |
| Dropped file rejected | one-line toast with the intake reason; page unchanged |
| TTS fails | refund + message + Retry (R9.4) |
| Out of credits | spec 13 modal "Pip needs a recharge" |
| Delete fails halfway | the project document is deleted last, so a retry finds and finishes the rest |

## 11. Matching the PNGs (1× exports, CSS px = PNG px)

**Dashboard (`projects*.png`, CSS frames from line 43809 / 49813 / 52364):** top bar 80 px, `#0F0F15`, hairline at y 79; logo at x 45; nav "Projects" x 264 with a 56×2 ember underline at the bar's bottom, "Styles" x 360; credits chip 104×32 at (1032, 24); "New project" 160×40 at (1152, 20), `linear-gradient(180deg,#FF975C,#FF7A3D)`, r10, glow `0 4px 16px rgba(255,122,61,.1)`; avatar 32 at x 1336. Eyebrow y 126 (ember 11 px, tracking 1.4); greeting 36 px semibold y 148–186; subline 15 px y 209; Pip ~110 px at (1180–1280, 98–210). Capture bar 1296×64 at (72, 280), `#15151D`, r32, shadow `inset 0 1px 0 rgba(255,255,255,.05), inset 0 0 24px 1px rgba(139,124,255,.12)`. Empty card 1296×536 at (72, 400), `#0F0F15`, r20, quiet shadow; CTA 240×48 at (600, 768), `linear-gradient(180deg,#FF975C,#FF7A3D)`, r12. "Try a style" title y 1006; cards 256×204 r12 `#15151D` at y 1064, 16 px gaps, the fifth clipped by the page edge (scroll row). Footer at y 1343. Full state: Continue title y 414; card 1296×320 at (72, 448), preview half 768 wide; stat tiles 416×88 at y 800, 24 px gaps; "Your projects" y 960; search 284×38 at x 762, sort 202×38 at x 1059, view toggle at x 1274; tabs y 1001 with the violet underline under "All projects"; cards 416×312 in 3 columns with 24 px gaps from y 1044.

**Drag over:** dashed ember border inset 16 px from the viewport, r16, dash ~10/6; card tint `linear-gradient(180deg, rgba(255,122,61,.12), rgba(255,122,61,.04))`, border `rgba(255,122,61,.35)`; pill 248×48 at (596, 424), `rgba(255,122,61,.14)` with ember text.

**Start (`start.png`, line 23375):** project top bar 56 px; format pills 186×36 centred at x 611; cards 323×257 at x 210 / 558 / 906, y 480, r16; Record card border ember 40 %; icon tiles 42 r10; Pip ~120 px centred at y 215 with arcs; eyebrow y 314; headline 40 px y 340–384; subline 16 px y 404; link y 780; footnote y 828.

**Recording (`recording.png`, line 25312):** card 840×257 at (300, 480), r16; stop button: outer ring 116, fill 84 `ember-fill`, white rounded square 22; timer 28 px mono at (520, 678); waveform from x 520 to 1088, centred y 603; "Pause" 86×34 at (932, 667); "Discard" text at x 1041.

Exact copy is in the requirements. The design check (tasks) measures these.

## 12. Rail panels (not designed; Pip-panel language)

Both live in the 340 px `LeftPanel` container built in spec 10 task 1 (header 56 with title and actions, collapse chevron on the right edge, slide + fade 240 ms). If spec 11 is implemented first, its task 20 builds that container as specified there and ticks spec 10 task 1.

- **Projects:** header "Projects" + "+" (to `/start`). Rows 64 px: 72×40 poster still, title (13 px), "01:24 · Edited 12 minutes ago" (mono 10 px), status chip. The open project has the violet selected border. Click → `flushAutosave()` (resolves after the pending debounced save) → `router.push('/editor/{id}')`.
- **Voice:** header "Voice". A card with the source chip ("Recorded", "Uploaded", "Generated voice", "Sample"), duration (mono) and a 60 px waveform from the loaded peaks; "Re-record" and "Replace audio" (secondary buttons); the cleanup row "Clean up fillers and pauses" + toggle, and under it "Removed 7 ums and 3 long pauses" (mint) or the skip reason; the transcript as wrapped word buttons (13 px, `text-2`), fillers from `originalTranscript` shown struck through in `text-4` when cleanup is on. Generated voices also show the script and voice label, read-only.
- **New take (R11.2):** a confirm modal "Record a new take?" / "A new take becomes a new project with the same title, style and settings. This one stays in Projects." → `/start/record?from={id}` or a file picker. The draft copies title + " (take 2)", format, style, and spec 12's captions/audio settings.
- **Cleanup toggle (R11.3), `setCleanup(enabled)` command:**
  1. Recompute the cut list from the original words: `cuts = buildEdl(originalTranscript.words, originalDurationMs).cuts` (deterministic, spec 05).
  2. Word map: the k-th kept original word ↔ cleaned word k (fillers are the only removed words).
  3. Turning cleanup **off**: each slot's word range maps to original indices; `startMs/endMs` map through `unmapTime` (the inverse of `mapTime`, exact on integer ms because cleaned times are never inside a cut); `voiceover.src ↔ cleanedSrc`, `transcript ↔ originalTranscript` (the cleaned transcript is kept as `cleanedTranscript`).
  4. Turning it **on** is the reverse. Then `timelineIssues` and the per-component duration limits run; any failure rejects the command with the slot's name and the rule, and nothing changes.
  5. Needs two optional fields: `Voiceover.cleanedSrc` and `EditorProject.cleanedTranscript`. Old projects without `originalSrc` hide the toggle.

## 13. Testing approach

- **Unit:** greeting, stats, relative time, search, script estimate, level feedback, `toDocs`/`fromDocs`/`summarise`/`diffDocs`, capture-bar reducer, drop counter, voices config parse, `speak` with a fake provider.
- **Rules (emulator):** `apps/web/rules/firestore.rules.test.ts` and `storage.rules.test.ts` gain the cases in tasks 4–5.
- **Emulator integration:** `FirestoreProjectRepository` save → load round trip, diff writes, delete, duplicate, list ordering.
- **E2E (Playwright, local mode + emulator mode):** dashboard empty → Try a sample → editor → back → full dashboard shows the card; drag a WAV onto the dashboard → Processing; record with a fake mic (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`) → review → Processing; script screen estimate and disabled Generate offline.
- **Design check (Chrome DevTools MCP):** per screen, 1440 wide, against the PNG (tasks).

### Correctness properties (fast-check)

1. **Round trip:** for any valid `EditorProject` p, `fromDocs(toDocs(p, uid))` equals p minus `voiceover.peaks`.
2. **Minimal diff:** `diffDocs(toDocs(p), toDocs(p))` is empty; for p' = one command applied to p, the diff touches only the project doc and the documents of slots/versions the command changed.
3. **Diff applies:** applying `diffDocs(a, b)` to a's document set gives exactly b's set, for any pair a, b.
4. **Summary honesty:** `readySlotCount ≤ slotCount = slots.length`, `slotStates.length = min(12, slotCount)`, `graphicsGenerated` equals the count of AI versions, the poster (if any) is a ready slot of p.
5. **Stats:** sums of the sparkline buckets equal the windowed totals; `videos` counts exactly the projects created in the last 7 local days for any time zone offset.
6. **Greeting:** for every hour 0..23 exactly one greeting applies, and `night` is true exactly for 23..4.
7. **Estimate:** credits = 2 × ceil(estMs / 60 000) and is monotonic in word count and in 1/speed.
8. **Level feedback:** louder frames never turn `good` into `quiet` (monotonic).
9. **Cleanup toggle (task 22):** off then on returns the identical project; any toggle keeps the timeline invariants or is rejected unchanged.

## 14. Proposed steering changes (to apply from the IDE)

The headless agent may not write `.kiro/steering/` (its permissions), so these edits wait for an IDE or Claude Code session:

1. `data-model.md`, after the free-plan line: "**How projects are stored (spec 11, D-034).** `projects/{id}` holds the project fields plus the dashboard summary (`slotCount`, `readySlotCount`, `slotStates` ≤ 12, `graphicsGenerated`, `poster`, `lastOpenedAt`); transcripts, slots and versions are sub-documents. Project-document times are integer epoch ms. Slot and version params are stored as `paramsJson` and parsed with the component schema on read. `voiceover.peaks` is never written. Audio refs are `storage:users/{uid}/audio/{key}.wav` when signed in (with a local copy) and `idb:{key}` in local mode."
2. `data-model.md`, `Voiceover`: the `tts` comment becomes "spec 11 task 17 (was spec 05 task 12)"; add `cleanedSrc?: string` (spec 11, cleanup toggled off); `Project` gains `lastOpenedAt` and the summary fields above.
3. `design-system.md`, source-of-truth paragraph: "The editor, Pip and Export PNGs are 2× exports (2880 px); `projects*.png`, `start.png` and `recording.png` are 1× (1440 px, PNG px = CSS px)." Checked 2026-11-16 with PIL: the dashboard PNGs are 1440×1376 and 1440×2136, Start and Recording 1440×900.
4. `ai-tasks.md` §8 `tts.generate`: "Runs through `speak()` (router media path), not `run()`. Output: 24 kHz mono 16-bit PCM, chunked at ≤ 1,500 characters. Voices are our own labels mapped in Remote Config `tts_voices`."
5. `structure.md`: add `lib/intake/`, `lib/dashboard/`, `lib/script/`, `lib/credits/` (spec 13) and `components/editor/panels/`.

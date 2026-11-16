# Design: 11 dashboard, start and recording

_Written headlessly in Kiro CLI (claude-opus-5.5), 2026-11-16. Revised the same day (headless run, claude-sonnet-5.5) to apply every finding of `REVIEW.md`. Requirements in `requirements.md`._

## 0. Decisions taken without the founder (D-065)

| # | Decision | Why | Reversible? |
|---|---|---|---|
| 1 | Projects move to Firestore + Storage in this spec (R1), with IndexedDB kept for local mode. | Spec 04 parked Firestore sync "until Firebase is set up"; no spec owns it, the dashboard needs a real list, judges look for meaningful Firestore use, and a project has to open on a second device. (The old text said "export needs the audio in Storage"; that is wrong, because spec 08 uploads the voice itself, to the path in row 17.) | Yes: repository interface unchanged. |
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
| 15 | **Render state is derived, not stored.** `ProjectDoc.status` is `draft | processing | ready` and only the client writes it; `exported`, `rendering` and `lastRenderId` are gone. The dashboard joins the project list with two `renders` queries by `projectId`. | Autosave rewrites the project document from the editor's copy and would overwrite a server-written `exported`; spec 08 needs no change (it already adds the `renders (ownerId, status)` index; this spec adds one more, see tasks 4a). Review F3 option (a). | Yes. |
| 16 | **One audio path for the whole product:** `users/{uid}/audio/{projectId}/{kind}-{hash16}.{ext}` with `kind` ∈ `voice`, `music`; `voice-{hash16}` is exactly spec 08's `voicePathFor` shape. The editor uploads the active voice there when it is stored; spec 08's export finds it and skips its upload (its own text says "skipped when that object already exists"). | One object per voice, no second upload of up to 28 MB per first export. Review F5, option 1. | Yes. |
| 17 | **Delete and duplicate own their audio.** Duplicate copies every audio object into the new project's folder. Delete is a server route (Admin): `recursiveDelete` of the project document (every sub-collection, including `chat`), the project's `renders` and `shares` documents, and the Storage prefixes `users/{uid}/audio/{projectId}/` and `users/{uid}/projects/{projectId}/`. | No shared objects, no orphans, no list of sub-collection names to keep in sync. Review F2. | Yes. |
| 18 | **A finished take is stored locally at once** (the pending intake holds a reference), and the page warns before unloading while recording. | A reload or crash mid-take must not lose up to 10 minutes of voice (R8.1's promise). Review F9. | Yes. |
| 19 | **`ProjectDocSchema` is derived from `EditorProjectBaseSchema`** (new export: the object before `superRefine`), so spec 12's `captions` and `audio` are stored without a change here. | Zod strips unknown keys; a hand-written list would silently drop fields. Review F10. | Yes. |
| 20 | **Credits: spec 13's helper and routes only.** `useCredits`, `ServerCredits.spend/refund`, `costOf`; no interim stub, no refund design here. Generate stays disabled ("Cloud AI is coming soon") until spec 13 tasks 1–5 and 8 land. | One ledger, one hook, one refund path; spec 13 R1.4 limits refunds to the caller's own `s-{key}` spends within 15 minutes and `refundsPerDay`. Review F1, F11. | — |

## 1. Routes and components

```
app/(app)/dashboard/page.tsx      → <DashboardScreen/>           (replaces DashboardPlaceholder)
app/(app)/start/page.tsx          → <StartScreen/>               (?style=<id> preselects a style)
app/(app)/start/record/page.tsx   → <RecordScreen/>
app/(app)/start/script/page.tsx   → <ScriptScreen/>              (?text=… prefills, sessionStorage fallback)
app/page.tsx                      → redirect('/dashboard')        (landing is spec 16)

components/dashboard/
  dashboard-screen.tsx    top bar + header + capture bar + body (empty | full) + try-a-style + footer + drop layer
  dashboard-top-bar.tsx   80 px bar: logo, nav, `CreditsChip` with a new `variant="dashboard"` prop (the existing chip is the editor's 70×32 "⚡ n" and has no variant), New project, AvatarMenu
  greeting.tsx            eyebrow, greeting, subline, <Pip look="cursor" props={night?['nightcap']:[]} glow/>
  capture-bar.tsx         state machine §5
  empty-card.tsx          sleeping Pip on cloud, copy, CTA
  drop-layer.tsx          window drag listeners, dashed page border, catching card (R4.3–R4.5)
  continue-card.tsx       PosterPlayer + meta + Pip popcorn
  stat-tile.tsx           number (NumberRoll) + label + `Sparkline` (new, SVG polyline)
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
  render-status.ts (pure: summary + renders → the chip), use-project-list.ts, use-renders.ts
  repository-provider.ts (signed in → Firestore, else IDB)
lib/credits/            NOT in this spec: `useCredits`, `ServerCredits`, the modal are spec 13 (tasks 8, 9)
lib/dev/switches.ts     `devSwitch` (spec 10 task 2c): ?fixture= is ignored in production
lib/dashboard/copy.ts, lib/script/copy.ts   every exact user-facing string of this spec, so tests assert it once
app/api/projects/[id]/route.ts   DELETE (Admin): recursiveDelete + renders + shares + Storage prefixes (R1.6)
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

// packages/schemas/src/project.ts: EditorProjectSchema = EditorProjectBaseSchema.superRefine(timelineIssues)
// (the `z.object` is exported as EditorProjectBaseSchema, new; `.omit` does not exist on the refined schema).
// packages/schemas/src/project-doc.ts
export const ProjectDocSchema = EditorProjectBaseSchema
  .omit({ slots: true, versions: true, transcript: true, originalTranscript: true, voiceover: true,
          id: true, title: true })
  .extend({
    ownerId: z.string().min(1),
    title: z.string().min(1).max(80),
    voiceover: VoiceoverSchema.omit({ peaks: true }),
    // every other EditorProject field, including spec 12's captions and audio, comes from the base schema
    status: z.enum(['draft', 'processing', 'ready']),      // client-written; render state is derived (§0 #15)
    slotCount: z.number().int().nonnegative(),
    readySlotCount: z.number().int().nonnegative(),
    slotStates: z.array(z.enum(['ready', 'pending'])).max(12),
    graphicsGenerated: z.number().int().nonnegative(),
    poster: PosterSchema.optional(),
    lastOpenedAt: IntMs,
  })
  .refine((d) => d.readySlotCount <= d.slotCount);

export type ProjectSummary = Pick<ProjectDoc,
  'title'|'format'|'styleId'|'durationMs'|'status'|'slotCount'|'readySlotCount'|'slotStates'|
  'graphicsGenerated'|'poster'|'lastOpenedAt'|'createdAt'|'updatedAt'> & { id: string };
```

`schemaVersion`, `format`, `fps`, `styleId`, `energy`, `durationMs`, `createdAt` and `updatedAt` come from the base schema, and so will every field added to it later (spec 12's `captions` and `audio`): they are stored with no edit here. Property 1 runs over random projects and, once spec 12a lands, includes those fields.

`slotStates` is stored too (array of ≤ 12 strings), so the dots need no slot reads.

`EditorProject` (spec 04) gains `ownerId?` (filled by the Firestore adapter) and `lastOpenedAt?` (set by the editor on open, outside the undo history, like `updatedAt`). No other editor-side change.

### 2.2 Pure mapping (`lib/projects/project-docs.ts`)

```ts
toDocs(p: EditorProject, ownerId: string): ProjectDocSet          // { project, transcripts, slots: Map, versions: Map }
fromDocs(set: unknown): ParseResult<EditorProject>                 // zod on every part, then EditorProjectSchema (the refined one, so timelineIssues runs)
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
  delete(id): Promise<void>;                      // new: IDB removes the project and its audio; Firestore calls DELETE /api/projects/{id} (R1.6)
  duplicate(id, newTitle): Promise<string>;       // new: new ids for project, slots, versions, and a COPY of every audio object (R1.9)
  markOpened(id, atMs): Promise<void>;            // new: lastOpenedAt only
}
```

**Autosave flush (R10.2).** `startAutosave` (`lib/stores/autosave.ts`) returns one function today, held by a `useEffect` cleanup in `editor-screen.tsx`, that stops autosave and flushes. It has no callable flush. This spec changes it to return `{ flush(): Promise<void>; stop(): Promise<void> }`: `flush()` saves the pending project now, awaits the repository write and every pending upload of the open project (`HybridAudioStore.pending`), and does **not** unsubscribe; `stop()` is the old behaviour. The callers (`editor-screen.tsx` and three tests in `editor.test.ts`) change with it, and the screen registers `flush` in the editor store as `flushSave`, which the Projects panel calls. A test: a change, then `flush()` resolves only after the fake repository's `save` and the fake upload queue have both finished.

**Delete and duplicate (R1.6, R1.9).**
- `duplicate`: new ids for the project, slots and versions; each audio object the project references (`voiceover.src`, `originalSrc`, `cleanedSrc` when present, and `audio.musicSrc` once spec 12b exists) is read through `HybridAudioStore.get` and `put` again under the new project id, which gives the copy its own `voice-{hash16}` path. A test: deleting the duplicate leaves the original's audio playable, and the reverse.
- `delete` (signed in): `DELETE /api/projects/{id}` verifies the ID token and App Check, checks `projects/{id}.ownerId == uid`, then with the Admin SDK `db.recursiveDelete(projectRef)` (every sub-collection, so `chat` and any later one go with no list to keep in sync), deletes the `renders` and `shares` documents of the project (`where('projectId','==',id)` on the caller's own), and deletes the Storage objects under `users/{uid}/audio/{id}/` and `users/{uid}/projects/{id}/`. Ledger entries stay (they are history). The route answers `{ deleted: true }`; a failure halfway can be retried because every step is idempotent and the project document goes last. The client then drops the local IDB copy. Offline, the ⋯ menu's Delete is disabled with "Needs connection".

`FirestoreProjectRepository` keeps the last saved `ProjectDocSet` per id in memory for `diffDocs`. `restoreBackup` returns not-found (Firestore has no backup copy; the editor's "Restore last good version" button only shows when `hasBackup`). List query: `where('ownerId','==',uid).orderBy('updatedAt','desc').limit(100)`, needing the composite index in `firestore.indexes.json`. The Continue card takes the summary with the highest `lastOpenedAt`.

**Render chips (derived, §0 #15).** `use-renders.ts` subscribes to two queries on `renders` (owner-readable under spec 08's rules): active renders `where('ownerId','==',uid), where('status','in',['queued','rendering','encoding'])` (limit 20, no ordering) and finished ones `where('ownerId','==',uid), where('status','==','done'), orderBy('createdAt','desc'), limit(100)`. `renderStatusOf(summary, renders)` (pure, `lib/projects/render-status.ts`) returns `{ kind: 'rendering', progress }` when an active render has the project's id (the one with the highest `createdAt`), else `{ kind: 'exported' }` when a finished one does, else the project's own status. Local mode has no `renders`, so the chips show the project status only. The second query needs the index `renders (ownerId asc, status asc, createdAt desc)`, an IDE edit (task 4a).

Firestore is initialised with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` so edits queue offline (R1.2). Verify the current API name with Context7 before coding.

### 2.4 Audio (`HybridAudioStore`)

One path for the whole product (§0 #16): `users/{uid}/audio/{projectId}/{kind}-{hash16}.{ext}`, where `kind` is `voice` or `music` and `hash16` is the first 16 hex characters of the SHA-256 of the bytes. `voice-{hash16}.{ext}` is exactly the shape spec 08's `voicePathFor(uid, projectId)` accepts.

```
put(blob, { projectId, kind }) → ref "storage:users/{uid}/audio/{projectId}/{kind}-{hash16}.{ext}"
  1. hash the bytes, IDB put under the ref's key (instant local playback)    2. enqueue the upload (IDB-persisted queue)
get(ref)  → IDB hit, else Storage getBlob(path), cached into IDB
delete(ref) → Storage delete + IDB delete (best effort, logged)
copy(ref, toProjectId) → get + put under the new project (duplicate, R1.9)
pending(projectRefs) → number of queued uploads for these refs (drives "Saving…" and `flush()`)
```

Every voiceover ref of a project (`src`, `originalSrc`, `cleanedSrc`) lives under the project's folder, so deleting the project is a prefix delete. The pipeline must therefore **allocate the project id before the first `put`**: `runPipeline` (`lib/pipeline/run.ts`) creates the project id at the start and passes it to the store (task 8). A take that has no project yet (the recording screen, the pending intake) lives in the local IDB store only, under an `idb:` ref, until Processing assigns it an id.

**Export seam (no change to spec 08's text).** Spec 08's `voice-upload.ts` computes the same `voice-{hash16}` path from the bytes and skips the upload when the object exists. Task 7 makes `resolveVoiceBlob` (spec 08 task 14) resolve `storage:` refs through `HybridAudioStore.get`, and adds one test: with the editor's upload finished, the export path performs no upload. Until then spec 08's `resolveVoiceBlob` only knows `idb:` and `synth:` refs, so spec 08 and this spec agree through that one function.

The queue retries with backoff (1 s, 4 s, 15 s, then on next app start). Reading a blob from another device (`getBlob`) needs a CORS rule on the Storage bucket for the app's origins; that is a one-line bucket configuration change and needs the founder's approval (open question 5), so until then a device without the local copy shows "This voiceover lives on another device" instead of failing silently. Content type `audio/wav`; size ≤ 50 MB is already enforced at intake and by `storage.rules`. `loadVoice` (`lib/editor/voice.ts`, spec 05) learns the `storage:` prefix. Local mode keeps `idb:` refs.

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

`lib/intake/pending.ts` holds `{ ref, meta: PendingIntake, draft: StartDraft }`: **`ref` points at a blob already stored in the local `AudioStore`** (an `idb:` ref), not at the blob in memory (§0 #18). A recorded take is written to the store the moment recording stops; an upload, a sample and a generated voice are written when they are chosen. `meta` and `draft` are small and go to `sessionStorage` (`mp:pending-intake`, parsed with `PendingIntakeSchema`), so a reload keeps the whole hand-off. `/processing/new` takes it on mount and deletes the key once Processing has started; with nothing pending it shows its own drop zone, as today. `PipelineInput` (`lib/pipeline/run.ts`: `file`, `name`, `source: 'upload' | 'record' | 'sample'`, `words?`) grows `title?`, `format?`, `styleId?`, `cleanup?`, `tts?` and `source: … | 'tts'`; `runPipeline` passes them into the project it creates and allocates the project id first (§2.4). The draft lives in `sessionStorage` (`mp:start-draft`), parsed with `StartDraftSchema` on read (a bad value falls back to the defaults), so a reload on `/start` keeps it.

## 3. Previews on the dashboard

`PosterPlayer` compiles a one-slot project from a `Poster` (`compileProject(input, assets)` from `packages/motion/src/compiler/compile.ts`, with `durationMs = slot.durationMs`, no voice) into a `<hyperframes-player>` (default sandbox: library components only, D-021). It shows a still (seek to `keyMomentMs`, paused) until hover or focus, then plays a loop. A module-level lock allows one playing player; mounting is lazy (`IntersectionObserver`). **Stills go through a queue of at most 3 players at a time**: a player mounts, seeks to `keyMomentMs`, draws, and is released before the next one starts (a 3-column grid shows 6 to 9 cards at once, and 9 iframes would break R12.4). A card the queue has not reached after 1.5 s shows its style's static `StylePoster` and swaps to the live still when its turn comes. Task 27 measures the dashboard with 50 projects; if it misses 1.5 s the fallback is the service-rendered thumbnail already listed under Later. Reduced motion: still only. Projects without a poster and unbuilt Try-a-style cards show a static `StylePoster` (HTML/CSS recreation of the designed thumbnail with its exact copy, from the "Try a style" CSS frames). The "↻ 0:0N" chip shows the loop length rounded to seconds.

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
  text ─► estimate.ts: words, estMs = words / (WPM[voice] × speed) × 60 000, units = ceil(estMs / 60 000),
          credits = costOf('tts', units, cfg)      (spec 13's table; no literal 2 here)
       ─► tagSpans(scriptWords(text)) → underline spans of kind number | place | comparison
          (`tagSpans` is in `packages/ai/src/slots/tagger.ts` and takes `SlotWord[]`; `scriptWords` is new, in
           `lib/script/estimate.ts`: it splits the text and gives every word a synthetic 300 ms slot)
  Generate ─► ServerCredits.spend({ action: 'tts', units, refId: `${scriptHash}-${attempt}` })   (spec 13, §8)
           ─► router.speak(ttsGenerate, { text, voiceId, speed })   ONLY_IN_CLOUD
                 chunks of ≤ 1,500 chars at sentence ends, sequential, 300 ms silence between paragraphs
                 PCM 24 kHz mono 16-bit (Firebase docs) → concat → encodeWav
           ─► pending intake { source: 'tts', cleanup: false, tts: {...} } → /processing/new
  failure  ─► ServerCredits.refund(txId) → "Couldn't generate the voice. Nothing was charged." [Retry = new attempt, new key]
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

## 8. Credits (owned by spec 13)

This spec implements nothing of the ledger. It uses spec 13's pieces:

```ts
// spec 13 task 8 (client), tasks 1–5 (server): the contract this spec calls
useCredits(): { balance: number | null, plan, settings }              // lib/credits/use-credits.ts, one hook for the editor, the export modal and this spec
useCreditsClient(): CreditsClient                                      // ServerCredits with Firebase and a user; LocalCredits in local mode
creditsClient.spend({ action: 'tts', units, refId }): Promise<{ ok: true; txId; balance; cost } | { ok: false; reason: 'insufficient' | 'rate-limit' | 'paused' | 'key-used' | 'offline' | 'unavailable' }>
creditsClient.refund(txId): Promise<void>                              // refunds only the caller's own spend, within 15 minutes, at most refundsPerDay a day
costOf('tts', units, cfg): number                                       // packages/schemas/src/cost.ts
```

- **The key is per attempt.** `ServerCredits` makes a fresh idempotency key for every `spend` call; Retry after a refunded failure is a new `spend`, so the fixed ledger id (`s-{key}`, then `r-{key}` for its refund) never blocks it. The `refId` (`{scriptHash}-{attempt}`) is informational only (spec 13 R1.2).
- **Threat model (pointer, not a copy).** The TTS call runs in the browser through AI Logic, so the server can't see whether it succeeded; credits protect honest users and keep the demo's economics clear, they are not a security boundary against a modified client. Spec 13's "Trust model" owns the argument and the caps (App Check, the hourly rate limit, `refundsPerDay`, the 15-minute refund window, budgets, the kill switch). This spec adds one rule of its own: **refund only when `speak()` failed** (an error, or a reply with no audio part), never for Cancel, never after a take that was generated.
- **Until spec 13 tasks 1–5 and 8 are done**, with Firebase on, Generate is disabled with "Cloud AI is coming soon" and nothing is stubbed; in local mode `LocalCredits` makes it free. This removes the interim "allowed, free" stub the first draft had.
- **One hook.** The dashboard chip, the Start credits chip and the Projects panel use `useCredits()`. If spec 11 task 10 lands before spec 13 task 8, task 10 creates `lib/credits/use-credits.ts` read-only with the same signature (`users/{uid}` `onSnapshot`, parsed with `UserDocSchema`) and spec 13 task 8 extends it; no second hook is ever written. The top bar's `CREDITS_PLACEHOLDER` is removed by spec 13 task 8, not here.

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
| TTS fails | `refund(txId)` + message + Retry with a new key (R9.4) |
| Spend refused | `insufficient`: spec 13's out-of-credits modal; `rate-limit` and `paused`: spec 13's toasts; Generate stays enabled for a later try, except `paused` (disabled "Voice generation is paused") |
| Spec 13 not landed (Firebase on) | Generate disabled, "Cloud AI is coming soon" |
| Delete fails halfway | the route is idempotent and deletes the project document last, so a retry finishes the rest (R1.6) |
| Delete offline | the ⋯ menu's Delete is disabled, "Needs connection" |
| Duplicate: an audio copy fails | nothing is created (the new project document is written last); toast "Couldn't copy the audio. Nothing was duplicated." |
| Reload with a take waiting | the pending intake and its stored take are still there; Processing resumes from them (R8.4) |

## 11. Matching the PNGs (1× exports, CSS px = PNG px)

**Dashboard (`projects*.png`, CSS frames from line 43809 / 49813 / 52364):** top bar 80 px, `#0F0F15`, hairline at y 79; logo at x 45; nav "Projects" x 264 with a 56×2 ember underline at the bar's bottom, "Styles" x 360; credits chip 104×32 at (1032, 24); "New project" 160×40 at (1152, 20), `linear-gradient(180deg,#FF975C,#FF7A3D)`, r10, glow `0 4px 16px rgba(255,122,61,.1)`; avatar 32 at x 1336. Eyebrow y 126 (ember 11 px, tracking 1.4); greeting 36 px semibold y 148–186; subline 15 px y 209; Pip ~110 px at (1180–1280, 98–210). Capture bar 1296×64 at (72, 280), `#15151D`, r32, shadow `inset 0 1px 0 rgba(255,255,255,.05), inset 0 0 24px 1px rgba(139,124,255,.12)`. Empty card 1296×536 at (72, 400), `#0F0F15`, r20, quiet shadow; CTA 240×48 at (600, 768), `linear-gradient(180deg,#FF975C,#FF7A3D)`, r12. "Try a style" title y 1006; cards 256×204 r12 `#15151D` at y 1064, 16 px gaps, the fifth clipped by the page edge (scroll row). Footer at y 1343. Full state: Continue title y 414; card 1296×320 at (72, 448), preview half 768 wide; stat tiles 416×88 at y 800, 24 px gaps; "Your projects" y 960; search 284×38 at x 762, sort 202×38 at x 1059, view toggle at x 1274; tabs y 1001 with the violet underline under "All projects"; cards 416×312 in 3 columns with 24 px gaps from y 1044.

**Drag over:** dashed ember border inset 16 px from the viewport, r16, dash ~10/6; card tint `linear-gradient(180deg, rgba(255,122,61,.12), rgba(255,122,61,.04))`, border `rgba(255,122,61,.35)`; pill 248×48 at (596, 424), `rgba(255,122,61,.14)` with ember text.

**Start (`start.png`, line 23375):** project top bar 56 px; format pills 186×36 centred at x 611; cards 323×257 at x 210 / 558 / 906, y 480, r16; Record card border ember 40 %; icon tiles 42 r10; Pip ~120 px centred at y 215 with arcs; eyebrow y 314; headline 40 px y 340–384; subline 16 px y 404; link y 780; footnote y 828.

**Recording (`recording.png`, line 25312):** card 840×257 at (300, 480), r16; stop button: outer ring 116, fill 84 `ember-fill`, white rounded square 22; timer 28 px mono at (520, 678); waveform from x 520 to 1088, centred y 603; "Pause" 86×34 at (932, 667); "Discard" text at x 1041.

Exact copy is in the requirements and in `copy.ts` (`lib/dashboard/copy.ts`, `lib/script/copy.ts`: the greeting lines, the empty and drag-over strings, the wake-up and drop copy, every toast), so tests assert each string once. The design check (tasks) measures these with the tolerance of R12.1: every measured region within 2 px, every colour equal to its token.

## 12. Rail panels (not designed; Pip-panel language)

Both live in the 340 px `LeftPanel` container built in spec 10 task 1 (header 56 with title and actions, collapse chevron on the right edge, slide + fade 240 ms). If spec 11 is implemented first, its task 20 builds that container as specified there and ticks spec 10 task 1.

- **Projects:** header "Projects" + "+" (to `/start`). Rows 64 px: 72×40 poster still, title (13 px), "01:24 · Edited 12 minutes ago" (mono 10 px), status chip. The open project has the violet selected border. Click → `flushSave()` (the editor store's handle on the autosave module's `flush()`, §2.3; it resolves after the pending save and every pending upload) → `router.push('/editor/{id}')`.
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
- **Emulator integration** (files named `apps/web/rules/*.emulator.test.ts`, so the existing `rules` CI job runs them): `FirestoreProjectRepository` save → load round trip, diff writes, duplicate (own audio, independent), list ordering, `renderStatusOf` against real `renders` documents, and the delete route against the emulators (every sub-collection incl. `chat`, `renders`, `shares` and the Storage prefixes gone).
- **No stray strings (R12.5):** a test renders each screen of this spec and scans the text for the forbidden-name list.
- **Dev switches:** `?fixture=` is ignored in a production build (spec 10's `devSwitch`).
- **Reduced motion (R12.6):** a Playwright pass with `reducedMotion: 'reduce'` over the empty state, the capture bar and the recording screen.
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
10. **Render chip priority:** for random lists of summaries and renders, `renderStatusOf` returns `rendering` iff an active render has the project's id, else `exported` iff a finished one does, else the project's status; it never reads another project's render and ignores input order.
11. **Take survives a reload:** stop → store → new module instance → the pending intake resolves to the same bytes (fake IDB).

## 14. Proposed steering changes (to apply from the IDE)

The headless agent may not write `.kiro/steering/` (its permissions), so these edits wait for an IDE or Claude Code session:

1. `data-model.md`, after the free-plan line: "**How projects are stored (spec 11, D-065).** `projects/{id}` holds the project fields plus the dashboard summary (`slotCount`, `readySlotCount`, `slotStates` ≤ 12, `graphicsGenerated`, `poster`, `lastOpenedAt`); transcripts, slots and versions are sub-documents. Project-document times are integer epoch ms. Slot and version params are stored as `paramsJson` and parsed with the component schema on read. `voiceover.peaks` is never written. Render state is not stored on the project: the dashboard derives it from `renders`. Audio refs are `storage:users/{uid}/audio/{projectId}/{kind}-{hash16}.{ext}` when signed in (with a local copy; the same shape spec 08's `voicePathFor` accepts) and `idb:{key}` in local mode."
2. `data-model.md`, `Voiceover`: the `tts` comment becomes "spec 11 task 17 (was spec 05 task 12)"; add `cleanedSrc?: string` (spec 11, cleanup toggled off). `Project`: `status` becomes `"draft" | "processing" | "ready"` (render state is derived from `renders`), `lastRenderId` is removed, and it gains `lastOpenedAt`, `slotStates` and the summary fields above. The `RenderJob` line stays.
3. `design-system.md`, source-of-truth paragraph: "The editor, Pip and Export PNGs are 2× exports (2880 px); `projects*.png`, `start.png` and `recording.png` are 1× (1440 px, PNG px = CSS px)." Checked 2026-11-16 with PIL: the dashboard PNGs are 1440×1376 and 1440×2136, Start and Recording 1440×900.
4. `ai-tasks.md` §8 `tts.generate`: "Runs through `speak()` (router media path), not `run()`. Output: 24 kHz mono 16-bit PCM, chunked at ≤ 1,500 characters. Voices are our own labels mapped in Remote Config `tts_voices`."
5. `structure.md`: add `lib/intake/`, `lib/dashboard/`, `lib/script/`, `lib/credits/` (spec 13) and `components/editor/panels/`.

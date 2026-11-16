# Tasks: 11 dashboard, start and recording

_Written headlessly in Kiro CLI (claude-opus-5.5), 2026-11-16. Not yet approved by the founder; open questions are at the end._

One task at a time. Definition of done for each: prettier, typecheck, lint (0 warnings) and the touched package's tests green; UI tasks also pass their design check. **[kiro]** marks tasks suited to the headless `motionpop-builder` agent (pure logic, schemas, tests, rules); they are logged in `KIRO_LOG.md`. The rest are done in the Kiro IDE or Claude Code and logged in their own log.

Demo path first: tasks 1–18 and 23–25 are the Nov 25 scope. **Cut in this order if time runs short:** task 22 (cleanup toggle), task 13's list view and "Shared with me" tab content, task 16's inline hold-to-record (the mic then always opens `/start/record`), task 19 (voice previews).

## A. Projects in the account

- [ ] 1. **[kiro]** Schemas: `packages/schemas/src/project-doc.ts` (`PosterSchema`, `ProjectDocSchema`, `TranscriptDocSchema`, `SlotDocSchema` and `VersionDocSchema` with `paramsJson`, `ProjectSummary`) and `start.ts` (`StartDraftSchema`, `PendingIntakeSchema`); `EditorProject` gains optional `ownerId`, `lastOpenedAt`; `Voiceover.source` already has `tts`, add optional `tts { voiceId, speed, script }` (data-model.md). Export from `index.ts`. Unit tests: valid docs parse; `readySlotCount > slotCount`, a title over 80 characters, a non-integer time and `peaks` on a project doc are rejected; every existing fixture still parses. — R1.1, R1.7, R9.3
- [ ] 2. **[kiro]** `apps/web/lib/projects/project-docs.ts`: `toDocs`, `fromDocs`, `summarise`, `diffDocs` (design §2.2). Unit tests on the demo fixture plus fast-check properties 1–4 (round trip, minimal diff after one random command from `lib/commands`, diff applies, summary honesty). — R1.1, R1.2, R1.7
- [ ] 3. Extend `ProjectRepository` with `list`, `subscribeList?`, `delete`, `duplicate`, `markOpened`; implement them in `MemoryProjectRepository` and `IdbProjectRepository` (list = summarise every stored project); tests with fake-indexeddb. — R1.4, R1.5, R1.6
- [ ] 4. **[kiro]** `firestore.rules`: project create/update validate `schemaVersion == 1`, `title` string of 1–80, integer `updatedAt`, unchanged `ownerId`; list queries must filter on `ownerId == auth.uid`. Composite index (`ownerId` asc, `updatedAt` desc) in `firestore.indexes.json`. Rules tests in `apps/web/rules/firestore.rules.test.ts`: owner create/read/update/delete; another user denied on the doc and on `slots`, `versions`, `transcript`, `chat`; create with someone else's `ownerId` denied; changing `ownerId` denied; a list query without the owner filter denied; a 81-character title denied. — R1.8
- [ ] 5. **[kiro]** Storage rules tests in `apps/web/rules/storage.rules.test.ts` for `users/{uid}/audio/**`: owner writes a `audio/wav` file and reads it back; another user can't read or write; `image/png` and a > 50 MB object are denied; delete by owner only. No rule change expected; if one is needed, say so in the commit. — R1.8
- [ ] 6. `FirestoreProjectRepository` (persistent local cache, `writeBatch` from `diffDocs` with the project doc last, `list` + `subscribeList` on the index, `delete` with sub-documents first, `duplicate` with new ids, `markOpened`) and `repository-provider.ts` (signed in → Firestore, else IDB). Re-check the Firestore cache API with Context7 first. Emulator integration tests: save → load round trip, a one-slot edit writes 2 documents, list order, delete leaves nothing, duplicate is independent. Wire the editor, autosave and Processing to the provider. — R1.1–R1.6
- [ ] 7. `HybridAudioStore` + IDB-persisted upload queue with backoff; `loadVoice` resolves `storage:` refs; the editor's save indicator includes pending uploads ("Saving…", then "Couldn't upload audio · retrying"). Tests with a fake Storage: put returns before the upload ends, a failed upload retries and survives a new store instance, get falls back to Storage and caches. — R1.3

## B. Hand-off into Processing

- [ ] 8. `lib/intake/pending.ts`; `PipelineInput` gains `title?`, `format?`, `styleId?`, `cleanup?` and source `tts`; `runPipeline` honours them (cleanup off skips the EDL but keeps the step card as "Skipped for generated voices"); `/processing/new` takes a pending intake on mount and otherwise shows its drop zone. Extend `run.test.ts` for the new fields. — R4.4, R7.1, R9.3

## C. Dashboard

- [ ] 9. **[kiro]** `lib/dashboard/greeting.ts`, `stats.ts`, `relative-time.ts`, `search.ts` (design §4) with unit tests and properties 5 (stats sums, any time zone) and 6 (one greeting per hour, night = 23..4). — R2.2, R5.2, R5.3
- [ ] 10. Dashboard shell at `/dashboard` (replaces `DashboardPlaceholder`; `/` redirects here): top bar, avatar menu with Sign out, greeting with Pip (cursor look, nightcap at night, glow), footer, Help sheet (shared with Start), credits chip from `useCredits()` (spec 13; if absent, implement it read-only from `users/{uid}`, placeholder 120 in local mode), "Styles" toast. — R2
- [ ] 11. Empty card (sleeping Pip on the cloud, waking on hover and click, CTA to `/start`) and the drop layer (window drag counter, whole-page dashed border, catching card in place or floating, intake validation, `caught` → Processing). Unit tests for the drag counter reducer. — R4
- [ ] 12. `PosterPlayer` (lazy, one player at a time, still until hover/focus, reduced motion = still), `StylePoster` stills for the five designed thumbnails, `lib/motion/styles/*.sample.ts` for the built styles, and the Try a style row (live previews for built styles, `/start?style=`; toast for the others; "Explore styles ↗" toast). — R5.4–R5.6, R6
- [ ] 13. Full state: Continue card (highest `lastOpenedAt`, popcorn Pip, Resume), stat tiles with sparklines, projects toolbar (count, search, sort, grid/list persisted in localStorage, tabs with the "Shared with me" empty state "Nothing shared with you yet."), project cards and rows (status chip; `Rendering {p}%` from the `renders/{lastRenderId}` snapshot while `status == 'rendering'`), ⋯ menu (Open, Rename, Duplicate, Delete with the confirm modal "Delete "{title}"?" / "This removes its graphics and voiceover. You can't undo this."), the loading skeleton and the damaged-save card. — R5, R1.6

## D. Start, recording and script

- [ ] 14. `/start`: project top bar (rename, format pills, Brand kit toast, credits chip, Help, avatar), Pip with arcs, headline, the three cards, "Try a sample" line on the Upload card (deliberate deviation, design §0 #7), the single-graphic link toast, `StartDraft` in sessionStorage with `?style=`. Upload and drop go through intake → pending → Processing. — R7
- [ ] 15. `lib/audio/recorder.ts` + `recorder.worklet.ts` (capture, pause, device switch, 24 kHz WAV on stop) and **[kiro]**-style pure `level.ts` with property 8; `/start/record` screen (permission flow, mic selector, stop button, live waveform canvas, timer, feedback lines, Pause, Discard confirm, review state with play / "Use this take" / "Record again", 9:00 warning, 10:00 stop, keyboard map, mic-unplugged auto-pause). — R8, R3.5
- [ ] 16. Capture bar: reducer (unit-tested), hold-to-record inline with the recorder, short press → `/start/record`, typing + Enter → `/start/script`, ⌘K focus, permission error with "Upload instead". — R3
- [ ] 17. `tts.generate` in `packages/ai`: `SpeechTaskDef`, router `speak()` (kill switch, zod input, audio-part check, usage event), Firebase provider `generateSpeech` (re-check the speech API and the Agent Platform backend with Context7 first), prompt `tts-generate.v1.ts`, chunking at sentence ends ≤ 1,500 characters, PCM concat + WAV. **[kiro]** for the tests with a fake provider: kill switch blocks, a reply with no audio part is an error, chunk boundaries never split a word, the concatenated length equals the sum of chunk lengths plus the inserted silences. Moves spec 05 task 12 here (note added there). — R9.3, R9.7
- [ ] 18. `/start/script`: script editor with counts and the 3,000-character limit, moment underlines via `tagSpans`, voice cards from `lib/script/voices.ts` (new `ttsVoices` field in `AppConfigSchema`, Remote Config key `tts_voices`, JSON decoded and zod-validated with typed defaults, plus a `parseRemoteConfig` test), speed "Relaxed / Natural / Brisk", cost chip from `estimate.ts` (property 7), Generate → `spend` → `speak` → pending intake → Processing, refund + message on failure, disabled states (offline, kill switch, out of credits, credits not yet available). Measure once how far "Relaxed" and "Brisk" move the real duration and record it in D-034 and DEV_LOG or KIRO_LOG; adjust `wpm` defaults. — R9
- [ ] 19. _(needs the founder's go-ahead: about $0.01 of TTS)_ `apps/web/scripts/voice-previews.ts` generates one 4-second original line per voice into `apps/web/public/voices/`; record them in `docs/third-party.md` as generated audio. — R9.1

## E. Editor rail panels

- [ ] 20. Projects panel (design §12) in the spec 10 `LeftPanel` container (build the container here first if spec 10 task 1 is not done, and tick it there), with `flushAutosave()` before switching. The rail stops toasting "on its way" for Voice and Projects. — R10
- [ ] 21. Voice panel: source chip, duration, waveform, cleanup result, transcript with struck fillers and click-to-seek, Re-record / Replace audio with the new-take modal (new project via the start draft). — R11.1, R11.2
- [ ] 22. **[kiro]** `setCleanup(enabled)` command (design §12), the optional `cleanedSrc` / `cleanedTranscript` fields, `unmapTime`, and property 9 (off then on is identity; invariants kept or rejected unchanged) over random transcripts with fillers and pauses; then the toggle in the Voice panel. _(First to cut.)_ — R11.3

## F. Verification

- [ ] 23. **[kiro]** Playwright `apps/web/e2e/dashboard.spec.ts` in local mode: empty dashboard → "Create your first project" → Start → "Try a sample" → Processing → editor → "‹ Home" → the full dashboard shows the project card and the Continue card; drag a generated WAV onto the dashboard → Processing; `/start/record` with Chrome's fake mic → stop → "Use this take" → Processing; `/start/script` shows the estimate and the chip, and Generate is disabled offline (`context.setOffline(true)`); reduced motion shows no playing poster; no page errors. — R3–R9, R12.2
- [ ] 24. Design check, dashboard (Chrome DevTools MCP): `resize_page` 1440×900, `navigate_page` to `/dashboard` in each state (fixtures behind `?fixture=empty|full|drag` in development only, fixed clock at 23:30 so the night greeting matches), `take_screenshot` full page, compare with `projects-empty.png`, `projects-drag-over.png` and `projects.png` (1× exports, compare at device scale 1) region by region (top bar, header, capture bar, body, Try a style, footer). Fix differences, re-check once, keep the screenshots and a contact sheet in the gitignored `.check/design/`, and log the findings. — R12.1
- [ ] 25. Design check, Start and Recording: the same procedure for `/start` against `start.png` and `/start/record?fixture=recording` (fake mic, frozen at 00:12.8) against `recording.png`. — R12.1
- [ ] 26. Same-language review (not designed): screenshots at 1440×900 of `/start/script`, the Projects panel and the Voice panel, with `screens.md` and `design-system.md` side by side; note and fix anything off-token. — R12.1, R12.3
- [ ] 27. Performance: a 50-project fixture on the emulator; dashboard interactive under 1.5 s on a warm cache; an instrumented Firestore wrapper asserts zero sub-document reads for the dashboard. Log the numbers. — R12.4

## Later (not in the Nov 25 scope)

- Single-graphic mode behind "Or just make a single graphic →" (plan cut list #5).
- A real ⌘K command palette (cmdk).
- Moving IndexedDB projects from before sign-in into the account ("Move 2 local projects to your account").
- Sharing to other accounts ("Shared with me").
- Editable transcript in the Voice panel (word text edits flow into captions and reasons).
- Live dictation in the capture bar with the on-device Whisper worker.
- Per-project thumbnails rendered by the render service instead of live posters.

## Open questions for the founder

1. Is 5 minutes saved per ready graphic the figure you want behind "~1h 10m saved"? (D-034 #12)
2. OK to spend about $0.01 generating the four voice preview clips (task 19)?
3. The Try-a-style row follows the design (five named styles); three are not built yet and show stills. Do you want `field-notes` in the row instead of one of them until spec 14?
4. "Try a sample" on the Upload card is a small deviation from `start.png`. Happy with that spot?
5. Opening a project on a second device needs a CORS rule on the Storage bucket (`gsutil cors set` with the app's origins). It is a production configuration change, so it waits for your approval. Until then audio plays only on the device that recorded or uploaded it.

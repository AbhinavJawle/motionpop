# Requirements: 11 dashboard, start and recording

_Written headlessly in Kiro CLI (agent `motionpop-builder`, model claude-opus-5.5) on 2026-11-16, overnight, while the founder was asleep. Revised the same day (headless run, claude-sonnet-5.5) to apply every finding of `REVIEW.md`; the mapping is in its "Resolved" list. Decisions taken without asking are listed in `design.md` §0 and logged as D-065 in `docs/decisions.md` (renumbered from D-034, which is spec 08's). Not yet approved by the founder._

Everything before the editor: the projects dashboard (`/dashboard`) in its empty, drag-over and full states, the Start screen (`/start`), in-browser recording (`/start/record`), paste-a-script with a generated voice (`/start/script`), and the two editor rail panels that belong to the same story: **Projects** and **Voice** (handoff §10). It also moves projects and their audio into the user's account (Firestore and Storage), because a dashboard that only lists what one browser remembers is not a real dashboard, and a project must open on a second device. (Export does not need this spec to upload audio: spec 08 uploads the voice itself, to the path this spec also uses, R1.3.) Lands by **Wed Nov 25, 2026** (plan §5).

Visual source of truth: `design/screens/projects-empty.png`, `projects-drag-over.png`, `projects.png`, `start.png`, `recording.png` and the matching CSS frames in `design/figma-export.css` ("Motionpop · Projects", "· Projects · Empty", "· Projects · Drag over", "· Start", "· Recording"). Behaviour from `screens.md`, `pip-mascot.md`, `design-system.md`, `data-model.md`, `security-and-cost.md`, `hybrid-ai.md`, `ai-tasks.md` §8 and spec 05.

**Reused, not re-specified:** the audio pipeline and Processing screen (spec 05: intake, decode, Whisper, cleanup, `runPipeline`, `sampleInput`), slot detection and the director (specs 06, 07), the editor shell, store, commands and autosave (spec 04), Pip and the UI primitives (spec 02), auth and App Check (spec 01).

**Out of scope (later specs):** the credit ledger, its spend and refund routes, `costOf` and `useCredits` (spec 13 owns all of them; this spec calls them and adds no refund design), Styles page (spec 14), brand kit (spec 16), share links (spec 08/16), Settings (spec 13), the Pip panel (spec 10), the Audio panel (spec 12). Everything else that is not on the 3-minute demo path is in the **Later** section of `tasks.md`.

---

## R1 Projects live in the account
_As a creator, I want my projects on every device I sign in on, and I want them safe when I close the tab._
1. **R1.1** WHEN a user is signed in THE SYSTEM SHALL store each project in Firestore as `projects/{id}` (summary fields for the dashboard) with `transcript/main`, `transcript/original`, `slots/{slotId}` and `versions/{versionId}` sub-documents (and, from spec 10, `chat/{messageId}`), parsed with zod on every read. The project-document schema SHALL be derived from `EditorProjectSchema`, so a field added to the editor project (spec 12's `captions` and `audio`) is stored and read back without a change here.
2. **R1.2** WHEN the editor autosaves THE SYSTEM SHALL write only the documents that changed since the last save, in one batch, and SHALL keep editing possible offline (Firestore's persistent local cache queues the writes).
3. **R1.3** WHEN a voiceover is stored THE SYSTEM SHALL keep a local copy for instant playback and upload it to Cloud Storage at spec 08's path, `users/{uid}/audio/{projectId}/voice-{hash16}.{ext}` (`hash16` is the first 16 hex characters of the SHA-256 of the bytes), so the export finds the object already there and uploads nothing twice. Other audio of the project (the original take, the cleaned take, spec 12's own music track as `music-{hash16}.{ext}`) SHALL live under the same `users/{uid}/audio/{projectId}/` folder. Pending uploads SHALL survive a reload and retry. The save indicator SHALL read "Saving…" until every upload of the open project has finished.
4. **R1.4** WHEN Firebase is not configured (local mode, E2E tests) THE SYSTEM SHALL keep using the IndexedDB repository and audio store from specs 04–05, with the same interface, so every screen works without an account.
5. **R1.5** THE SYSTEM SHALL list the signed-in user's projects, newest edit first, from the summary documents alone (one query, no sub-document reads).
6. **R1.6** WHEN the user deletes a project THE SYSTEM SHALL ask for confirmation first, then call the server route `DELETE /api/projects/{id}`, which (with the Admin SDK, after checking the caller owns the project) deletes the project document with every sub-collection (`recursiveDelete`, so `transcript`, `slots`, `versions`, `chat` and any later one go), the project's `renders` and `shares` documents, and every Storage object under `users/{uid}/audio/{projectId}/` and `users/{uid}/projects/{projectId}/` (renders, bed, thumbnails). Ledger entries stay. IF the user is offline THEN deleting SHALL be disabled with "Needs connection". In local mode the IndexedDB project and its audio are removed.
7. **R1.7** THE SYSTEM SHALL keep a summary on every project document: title, format, style, duration, status (`draft`, `processing` or `ready`; written by the client only), slot count, ready slot count, graphics generated, the poster slot used for previews, created, opened and updated times (integer epoch ms). Render state is not stored on the project (R5.4).
8. **R1.8** Firestore and Storage rules SHALL allow these reads and writes only to the project's owner, SHALL reject a document whose `ownerId` is not the caller or whose `ownerId` changes, and SHALL be covered by emulator rules tests.
9. **R1.9** WHEN the user duplicates a project THE SYSTEM SHALL create new ids for the project, slots and versions and SHALL copy every audio object of the project (voice, original, cleaned, music) into the new project's own folder, so deleting either project never breaks the other.

## R2 Dashboard shell
_As a creator, I want to land somewhere that feels alive and tells me what to do next._
1. **R2.1** THE SYSTEM SHALL show the dashboard top bar as designed: Pip logo + "motionpop", nav "Projects" (active, ember underline) and "Styles", credits chip "✦ {n} credits", "+ New project" (ember, glow) and the avatar (Pip face) with a menu holding "Sign out".
2. **R2.2** THE SYSTEM SHALL greet by local time: "Good morning, {name}" (05:00–11:59), "Good afternoon, {name}" (12:00–16:59), "Good evening, {name}" (17:00–22:59), "Working late, {name}?" (23:00–04:59), with the eyebrow "YOUR CREATIVE SPACE". At night the subline is "Pip's still up. Let's make something." and Pip wears the violet nightcap. `{name}` is the first word of the display name, else "there".
3. **R2.3** THE SYSTEM SHALL show Pip floating top right with an ember glow, eyes following the cursor, and SHALL never let him block a click.
4. **R2.4** THE SYSTEM SHALL show the credits balance from spec 13's `useCredits()` (the one hook the editor and the export modal share), rolling when it changes; in local mode it SHALL show the design's placeholder balance (120) from the local credits client.
5. **R2.5** WHEN the user clicks "Styles" or "Explore styles ↗" before the Styles page exists THE SYSTEM SHALL answer with a short "on its way" toast, never a dead click.
6. **R2.6** THE SYSTEM SHALL show the footer "Made for the stories only you can tell." and "Help & shortcuts ↗", which opens the Help sheet (shortcuts and the on-device AI note).

## R3 Capture bar
_As a creator, I want to start from wherever my idea is: my voice, a script or a file._
1. **R3.1** THE SYSTEM SHALL show the capture bar as designed: mic in an ember ring + "Hold to record", divider, "…or paste a script, or drop audio anywhere", "MP3 · WAV · M4A", "⌘K".
2. **R3.2** WHEN the user presses and holds the mic for at least 300 ms THE SYSTEM SHALL record inline (timer and live level in the bar, "Release to finish") and, on release, hand the recording to Processing. A shorter press SHALL open `/start/record`.
3. **R3.3** WHEN the user pastes or types text into the bar and presses Enter THE SYSTEM SHALL open `/start/script` with that text.
4. **R3.4** WHEN the user presses ⌘K (Ctrl+K elsewhere) THE SYSTEM SHALL focus the capture bar.
5. **R3.5** IF microphone permission is missing or denied THEN THE SYSTEM SHALL say how to allow it, offer "Upload instead", and never leave a recording half-started.

## R4 Empty state and drag-over
_As a first-time creator, I want to know my first video is close and easy._
1. **R4.1** WHEN the user has no projects THE SYSTEM SHALL show the empty card: Pip asleep on a lavender cloud with the nightcap and floating "z z z", "Your first video is 2 minutes away", "Hold the mic, paste a script, or just drop your audio here.", "+ Create your first project" (ember, opens `/start`) and "No editing experience needed. Just something to say."
2. **R4.2** WHEN the pointer hovers the sleeping Pip THE SYSTEM SHALL open one eye; WHEN clicked, Pip SHALL wake, point at the capture bar and focus it.
3. **R4.3** WHEN files are dragged over any part of the dashboard THE SYSTEM SHALL show the whole-page dashed ember border and the ember-tinted card with the pill "Drop it, I'll catch it!", Pip awake with arms open (catching), "Your first video is 2 minutes away", "Release your audio anywhere. Pip will take it from here." and "MP3 · WAV · M4A". With projects, the same card SHALL appear centred over the page.
4. **R4.4** WHEN an audio file is dropped THE SYSTEM SHALL validate it with the spec 05 intake rules, play Pip's `caught` state and open Processing with the file. IF the file is rejected THEN THE SYSTEM SHALL say why in one line and keep the page as it was.
5. **R4.5** WHEN the drag leaves the window or is cancelled THE SYSTEM SHALL restore the previous state with no flicker between child elements.

## R5 Dashboard with projects
_As a returning creator, I want to resume in one click and find any project fast._
1. **R5.1** THE SYSTEM SHALL show "Continue where you left off" for the most recently opened project: a looping preview of its poster slot with the "↻ 0:0N" chip, "LAST OPENED", title, "{ready} of {total} slots ready" with slot dots, "Edited {relative time}" (mono) and "Resume →", with Pip holding popcorn on the card's top edge.
2. **R5.2** THE SYSTEM SHALL show three stat tiles with 7-day sparklines: "{n} videos this week", "{n} graphics generated" and "~{duration} saved", computed from the project summaries by documented formulas.
3. **R5.3** THE SYSTEM SHALL show "Your projects" with the count badge, search ("Search projects", case- and accent-insensitive on titles), sort ("Last edited", "Created", "Name"), grid/list toggle and tabs "All projects" / "Shared with me". The view choice SHALL persist per browser. "Shared with me" SHALL show a friendly empty state.
4. **R5.4** Each project card SHALL show the poster (a still at the poster slot's key moment; it plays the loop on hover or focus), title, duration (mono) · "Edited …", the status chip ("Draft" grey, "Exported" mint, "Rendering {p}%" violet with spinner; the last two derived from the user's `renders` documents, not stored on the project: an active render of the project wins, else a finished one, else the project's own status), one dot per slot and a ⋯ menu with Open, Rename, Duplicate and Delete. Cards SHALL sit in a 3-column grid.
5. **R5.5** WHEN a project has no ready slot THE SYSTEM SHALL show its style's static poster instead of a player.
6. **R5.6** THE SYSTEM SHALL mount at most one playing preview at a time and none while `prefers-reduced-motion` is set.
7. **R5.7** THE SYSTEM SHALL build still posters through a queue of at most 3 players at a time, each released after its still is drawn, and SHALL fall back to the style's static poster for any card the queue has not reached after 1.5 s.

## R6 Try a style
_As a creator, I want to see what my video could look like before I start._
1. **R6.1** THE SYSTEM SHALL show "Try a style" in every dashboard state with "A new point of view for your next story.", "Explore styles ↗" (violet) and the five designed cards in a horizontally scrollable row: Editorial Explainer "A point of view for every idea.", Dark Money "Make the numbers tell a story.", Clean Minimal "Less noise. More meaning.", Paper Collage "A little rough. Full of character.", Neon Data "Big signals. Bold energy."
2. **R6.2** WHERE a card's style exists in the style registry THE SYSTEM SHALL play a live preview built from that style's sample slot, and clicking the card SHALL open `/start` with the style chosen. WHERE it does not exist yet, the card SHALL show its designed still and clicking SHALL answer with an "on its way" toast.

## R7 Start
_As a creator, I want three obvious ways in and nothing else in the way._
1. **R7.1** THE SYSTEM SHALL show the project top bar on `/start`: logo, "‹ Home", "Untitled Project" with a pencil to rename, format pills 16:9 / 9:16 / 1:1, Brand kit chip, credits chip "⚡ {n}", "? Help" and the avatar. Title, format and style chosen here SHALL carry into the project Processing creates.
2. **R7.2** THE SYSTEM SHALL show Pip with ember sound arcs and glow, "A LITTLE VOICE. A LOT OF POSSIBILITY.", "Bring your voice. We'll bring the motion." and "Record, upload or paste a script, and graphics will follow every word."
3. **R7.3** THE SYSTEM SHALL show the Record card ("Your voice, in the moment.", ember waveform, "Start recording →" to `/start/record`), the Upload card ("Already have the perfect take?", dashed drop zone "Drop your audio or browse" / "MP3, WAV, M4A") and the Paste script card ("Start with the words.", input "Every great story starts with…", "We'll generate the voice →" to `/start/script` with the typed text).
4. **R7.4** THE SYSTEM SHALL offer "Try a sample" on the Upload card, running the spec 05 sample through Processing.
5. **R7.5** THE SYSTEM SHALL show "Or just make a single graphic →" and "No timeline to tame. Just a story to tell." Until single-graphic mode exists, the link SHALL answer with an "on its way" toast.
6. **R7.6** WHEN the Brand kit chip is clicked before the brand kit exists THE SYSTEM SHALL answer with an "on its way" toast.

## R8 Recording
_As a creator, I want to talk and trust that Pip is catching every word._
1. **R8.1** WHEN `/start/record` opens THE SYSTEM SHALL ask for the microphone and, once granted, start recording, showing Pip listening with sound arcs pulsing to the mic level, "PIP IS LISTENING", "Your voice is the starting point.", "Keep talking. Pip is catching every word.", the "● RECORDING" card, the mic selector ("Built-in microphone ▾", device labels), the round stop button "Click to stop", the live waveform (recorded ember, live tail violet), the timer "00:12.8" (mono), "Pause" and "Discard", and below the card "Your recording stays here until you're ready." / "Nothing is uploaded until you finish."
2. **R8.2** THE SYSTEM SHALL give live level feedback: "Nice and clear. Keep going." while the level is good and "A bit quiet, move closer" when the last 1.5 s of speech stays below the quiet threshold.
3. **R8.3** WHEN the user pauses THE SYSTEM SHALL stop capturing and the timer, and resume on the second press. WHEN the user switches microphones THE SYSTEM SHALL keep what was recorded and continue on the new device.
4. **R8.4** WHEN the user stops THE SYSTEM SHALL write the 24 kHz mono WAV to the local audio store at once and show the take for review (play, "Use this take", "Record again"). "Use this take" SHALL hand that stored take to Processing (source `record`). Nothing SHALL leave the device before that, and a reload between stopping and Processing SHALL keep the take (the pending intake holds a reference to the stored blob, not the blob).
5. **R8.5** WHEN the user discards a take longer than 3 s THE SYSTEM SHALL confirm first, then return to `/start`.
6. **R8.6** THE SYSTEM SHALL warn at 9:00 and stop at 10:00, keeping the take.
7. **R8.7** Keyboard: Space pauses or resumes, Enter stops, Escape asks to discard.
8. **R8.8** WHILE a take is recording or waiting for review THE SYSTEM SHALL warn before the page unloads.

## R9 Paste script → generated voice
_As a creator without a recording, I want to paste words and get a voiceover._
1. **R9.1** THE SYSTEM SHALL show `/start/script` (not designed; same language): the script editor with word count and estimated duration (mono), moments underlined in violet (numbers, places, comparisons from the spec 06 tagger, free and on-device), voice cards (play a short preview, waveform, selected card with an ember border), a speed choice and "Generate voice and continue" (ember) with the cost chip "☁ {n}".
2. **R9.2** THE SYSTEM SHALL estimate the cost before generation as `costOf('tts', startedMinutes)` (spec 13's table: 2 credits per started minute of estimated speech, at most 20 units) and SHALL show it on the chip; the chip SHALL update as the script and speed change.
3. **R9.3** WHEN the user generates THE SYSTEM SHALL spend those credits with spec 13's `ServerCredits.spend({ action: 'tts', units, refId })` (a new idempotency key per attempt, made by `ServerCredits`), call `tts.generate` (Gemini TTS through Firebase AI Logic, cloud only) through the `packages/ai` router, show Pip with the tiny mic while it works, and hand the audio to Processing with cleanup off (source `tts`, the script and voice stored on the voiceover). `refId` is `{scriptHash}-{attempt}`.
4. **R9.4** IF generation fails THEN THE SYSTEM SHALL return the credits with `ServerCredits.refund(txId)` (the only reason this spec refunds) and say "Couldn't generate the voice. Nothing was charged." with Retry; Retry is a new attempt with a new key. A refused refund shows spec 13's "Couldn't return your credits" toast.
5. **R9.5** IF the user is offline, out of credits or the kill switch is on THEN THE SYSTEM SHALL disable Generate with the reason ("Needs connection", spec 13's out-of-credits modal, or "Voice generation is paused"). WHILE spec 13 tasks 1 to 5 and 8 have not landed and Firebase is on, Generate SHALL be disabled with "Cloud AI is coming soon" (spec 13 R5.5); in local mode it is free.
6. **R9.6** THE SYSTEM SHALL accept scripts up to 3,000 characters and say so when the limit is reached.
7. **R9.7** Voice names shown to users SHALL be our own labels; provider voice ids stay internal and come from Remote Config.

## R10 Rail: Projects panel
_As a creator in the editor, I want to jump to another project without going home._
1. **R10.1** WHEN the user opens the rail item "Projects" THE SYSTEM SHALL show a 340 px left panel with "Projects", "+ New project" and the recent projects (poster, title, duration, "Edited …", status chip), the open project marked.
2. **R10.2** WHEN the user picks another project THE SYSTEM SHALL flush the pending autosave (`flush()` of the autosave module, which resolves after the repository write and every pending upload of the open project), then open it.

## R11 Rail: Voice panel
_As a creator, I want to see what Pip heard and redo my take if I need to._
1. **R11.1** WHEN the user opens the rail item "Voice" THE SYSTEM SHALL show the voiceover: source and duration, the waveform, the cleanup result ("Removed {n} ums and {m} long pauses") and the transcript with removed fillers struck through. Clicking a word SHALL seek to it.
2. **R11.2** WHEN the user chooses "Re-record" or "Replace audio" THE SYSTEM SHALL explain that a new take becomes a new project with the same title, style, format and settings, and the current project stays in Projects; on confirm it SHALL run Processing for the new take.
3. **R11.3** WHERE the project kept its original audio THE SYSTEM SHALL offer a "Clean up fillers and pauses" toggle. Toggling SHALL swap the active audio and transcript and re-map every slot through the cut list as one undoable command. IF a slot would break a timeline rule THEN THE SYSTEM SHALL refuse with the reason and change nothing.

## R12 Quality
1. **R12.1** Every screen SHALL match its PNG at 1440 px wide (the dashboard, Start and Recording PNGs are 1× exports, unlike the editor's 2×), checked with the Chrome DevTools MCP: every measured region within 2 px of the PNG and every colour equal to its design token.
2. **R12.2** Every async action SHALL show its state and end in success or a clear error with a next step.
3. **R12.3** Everything SHALL be keyboard accessible with the violet 2 px focus ring, AA contrast, and `prefers-reduced-motion` respected (no floating, breathing, z-drift or hover loops).
4. **R12.4** The dashboard SHALL become interactive within 1.5 s with 50 projects on a warm cache, with no project sub-document read.
5. **R12.5** No third-party brand, creator or voice-provider names SHALL appear in the UI. Wording such as "on-device AI" in the Help sheet is allowed; names of AI providers, models and voices are not. A test scans the rendered text of every screen of this spec for a list of forbidden names (provider, model and voice names, creator and brand names) and finds none.
6. **R12.6** WHILE `prefers-reduced-motion` is set THE SYSTEM SHALL show the empty state, the capture bar and the recording screen with no floating, breathing, z-drift or hover loop (a Playwright pass with reduced motion emulated).

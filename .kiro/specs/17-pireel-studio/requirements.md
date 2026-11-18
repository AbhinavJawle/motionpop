# Spec 17 · Pireel studio · requirements

Written in a Claude Code session (2026-11-18). Decision D-076; comparison and design notes in `docs/research/pireel-integration.md`. Steering: `product.md`, `hybrid-ai.md`, `security-and-cost.md`, `hackathon-compliance.md`.

**Why.** The founder wants video and video editing in Motionpop, working in sync with what it already does (voice, transcript, cleanup, graphics). Pireel is an open-source (AGPL-3.0) embeddable talking-head editor whose AI features are host-supplied providers. Motionpop becomes the host: its pipeline, Firebase services and hybrid AI fill Pireel's providers, and its graphics run inside Pireel's timeline.

## R1 · Pireel lives in the repository, credited
1. THE SYSTEM SHALL vendor Pireel's packages (`studio-engine`, `studio-ui`, `studio-kit`, `ui`) under `vendor/pireel/`, keeping their LICENSE, THIRD_PARTY_NOTICES and package names.
2. THE repository licence SHALL become AGPL-3.0, and `docs/third-party.md` SHALL credit Pireel with its commit and licence.
3. Changes to vendored files SHALL be marked with a `// motionpop:` comment so our work on top stays distinguishable.

## R2 · One editor for every project
1. WHEN a creator opens a project THE SYSTEM SHALL show the Pireel editor (`/studio/[id]`), mounted client-side with Motionpop's providers.
2. THE dashboard, start, recording and processing screens SHALL stay Motionpop's, and lead into the studio.
3. WHILE the editor is open THE SYSTEM SHALL show where AI work runs (`⚡ free · on-device` or `☁ N`) through Pireel's extension points.

## R3 · Video in, cleaned, in sync
1. THE start screen SHALL accept a video file (MP4, MOV, WebM ≤ 500 MB) next to voice, recording and script.
2. WHEN a video is added THE SYSTEM SHALL extract its audio on the device and run the existing pipeline (Whisper word timings, fillers and pauses, slot detection).
3. THE cuts SHALL be non-destructive: one narrative clip per kept segment, with source in/out, so turning cleanup off restores the take.
4. THE SYSTEM SHALL place each slot's graphic as a graphic clip anchored to the slot's first word, so cuts, trims and retake removal move graphics with their words.
5. THE SYSTEM SHALL create managed captions from the transcript.

## R4 · Motionpop's graphics run inside Pireel
1. THE motion runtime SHALL expose `mountBlock(el, input) → { seek(ms) }` for one component (scene, custom or film beat), deterministic, with no GSAP of its own.
2. Pireel's composition assembly SHALL load the motion runtime after GSAP, and a Motionpop graphic block SHALL drive `seek` from its GSAP timeline through a proxy tween.
3. A Motionpop graphic SHALL look the same in the studio preview, the browser export and the Cloud Run render (parity stills at 3 times).
4. WHEN a graphic draws on canvas or WebGL THE SYSTEM SHALL export through the Cloud Run renderer, because the browser export can't capture canvas.

## R5 · Providers: hybrid by default
1. `transcriber` SHALL be the on-device Whisper worker.
2. `speechCleanup` SHALL combine the existing filler/pause EDL with retake detection through `packages/ai` (PREFER_ON_DEVICE).
3. `autoHighlight`, `draftInsertPrompt`, `syncFill` and `translate` SHALL run through `packages/ai` with PREFER_ON_DEVICE and the cloud as fallback.
4. `composer`, `brandTitles`, `editPlan` and the chat endpoint SHALL run in the cloud through `packages/ai` or a server route, with the cost shown before each credited action.
5. `projects`, `vault` and `uploads` SHALL use the device first (IndexedDB/OPFS), then Firestore and Storage when signed in.
6. Every provider output SHALL be parsed with zod; every call SHALL log `ranOn`, model, latency and credits.

## R6 · Better graphics from what Pireel learned
1. THE custom-graphics and film prompts SHALL adopt: surface by backdrop (no card on footage), content-chosen layout archetypes with variety between neighbours, spoken-beat reveals, staged entrances, drawn symbols, token colour discipline and a closing self-check.
2. Generated graphics SHALL mark visible text with `data-edit` keys and images as `<img>`, so text and pictures are edited in place without regenerating.
3. WHEN a graphic is placed over footage THE SYSTEM SHALL fit it (readable text, off the face and the caption band) with the smallest similarity transform, before any regeneration.

## Non-goals (this spec)
Dubbing, object erasure, stock B-roll search, team features, the MCP bridge for outside agents (Pireel has it; wiring it is a stretch goal).

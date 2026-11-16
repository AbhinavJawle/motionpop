# 08 · Render and export — requirements

_Written by Kiro CLI (headless, agent `motionpop-builder`, model claude-opus-5.5) on 2026-11-16, in the `spec-08` worktree. Status: **draft, waiting for the founder's review.** The founder was asleep, so open product calls were decided here and are listed in `design.md` §21 ("Decisions taken in this draft") and §22 ("Open questions")._

The editor can preview a video but cannot export one: the top-bar Export button only shows a toast today. This spec turns a project into an MP4 file the creator can download and share. It covers the export modal and the ready modal from `design/screens/export.png` and `export-ready.png`, the render request with its credits, a Cloud Run job that runs the HyperFrames producer, progress in Firestore, failure handling with refunds, and a local mode that renders on the developer's machine with no cloud at all.

**Must work by Mon Nov 30, 2026** (the #BuildHybridAI submission). Lands by **Wed Nov 25** so there is time for the demo recording.

Sources: `architecture.md` (flow 6, video engine, failure table), `data-model.md` (`renders/{id}`, ledger, Storage paths), `security-and-cost.md`, `ai-tasks.md` (export cost table), `screens.md` (export and ready modals), `design-system.md`, `tech.md` (Cloud Run, us-central1), `handoff.md` §5 and §9, D-009 (HyperFrames), D-014 (1080p = 5 credits), D-019 (credits), D-021 (sandbox), spec 03 (compiler and parity) and spec 07 (`sceneTiming`, `canRender`).

## Glossary

| Term | Meaning |
|---|---|
| Render | One export attempt: a `renders/{renderId}` doc, one producer run, at most one output file. |
| Render options | What the creator picked in the export modal: format, resolution, transparent, captions, music. |
| Snapshot | The validated project JSON the render uses, frozen when the creator clicks Export. Later edits don't change a running render. |
| Render job | The Cloud Run job (`motionpop-render`) that compiles the snapshot, runs the producer and uploads the file. One job execution per render. |
| Render mode | Where renders run: `cloud` (Cloud Run job + Firebase), `emulator` (Firebase emulators + a local job process) or `offline` (no Firebase; in-process render; development and e2e only). |
| Active render | A render whose status is `queued`, `rendering` or `encoding`. |

## Scope for Nov 30

In scope: MP4 (H.264, 30 fps) at 720p and 1080p in 16:9, 9:16 and 1:1; the export and ready modals as designed; credits charged before the render and refunded on failure; download; a share link with a minimal share page; local and emulator modes; rules tests, property tests, an e2e test of the export path and a CI job.

Built but switched off by a flag until checked in the cloud: 4K (MP4 only) and transparent WebM.

Out of scope (see "Later" in `tasks.md`): cancel, partial re-export, distributed rendering, MOV/ProRes, share revocation and expiry, Open Graph previews, the dashboard's "Exported" and "Rendering 64%" chips (spec 11), music, SFX and burned-in captions themselves (spec 12), tier-2 custom slots in renders (spec 15), the out-of-credits modal (spec 13; this spec shows an inline message instead).

---

## R1 Export modal

_As a creator, I want to choose how my video comes out and see what it costs before I spend anything._

1. **R1.1** WHEN the creator clicks the top-bar "Export" button THE SYSTEM SHALL open the export modal shown in `design/screens/export.png`, with the same copy, layout, sizes and colours ("Export video", "A little voice. Ready for the world.", the project card, "Format", "Resolution", the three toggles, "Cost: N credits", "N available", "Export video", the file meta line).
2. **R1.2** THE SYSTEM SHALL fill the project card from the project: a still of the video, the title, "{seconds} sec · {n} scenes" (n = the slots that will render) and the look's display name.
3. **R1.3** THE SYSTEM SHALL preselect the project's current format and 1080p. Changing the format in the modal SHALL change only this export, not the project, and SHALL update the card's still to that format.
4. **R1.4** THE SYSTEM SHALL show the cost from the shared cost function (R2.4) and the creator's live credit balance, and SHALL update both immediately when an option or the balance changes.
5. **R1.5** WHILE the transparent-export flag is off, THE SYSTEM SHALL show the "Transparent background (for editors)" toggle switched off and disabled, with a "Soon" pill. WHILE the flag is on and the toggle is on, THE SYSTEM SHALL change the file meta line to "WebM · VP9 alpha · 30 fps" and disable 4K.
6. **R1.6** WHILE the 4K flag is off, or the video is longer than 60 s, THE SYSTEM SHALL show the 4K card disabled with a "Soon" pill or "Up to 60 sec" note, never as a dead click.
7. **R1.7** WHILE the project has no captions support (spec 12 not landed) or no music, THE SYSTEM SHALL show the "Captions" or "Include music" toggle off and disabled with a "Soon" pill. WHEN that support exists THE SYSTEM SHALL default the toggle to the project's setting.
8. **R1.8** IF some slots are not ready (suggested, generating, failed, or a component that doesn't support the chosen format) THEN THE SYSTEM SHALL say how many will be left out ("2 slots aren't ready and will be left out.") and still allow the export. IF no slot would render THEN THE SYSTEM SHALL disable "Export video" with "Add a graphic first."
9. **R1.9** IF the balance is below the cost THEN THE SYSTEM SHALL disable "Export video" and show "Not enough credits. Small edits stay free." in place of the balance.
10. **R1.10** WHILE any image asset is pending (`canRender` is false, spec 07 R4.4) THE SYSTEM SHALL show "Finishing N images…" on the button and start the export by itself when the images are done.
11. **R1.11** IF the video is longer than the export limit (`exportMaxMs`, default 3 min) THEN THE SYSTEM SHALL disable "Export video" and say "Exports are up to 3 min for now."
12. **R1.12** WHILE the device is offline THE SYSTEM SHALL disable "Export video" with "Needs connection" (as for other cloud actions, `hybrid-ai.md`).
13. **R1.13** THE SYSTEM SHALL make the modal keyboard accessible (focus trap, Esc closes, visible violet focus ring, option cards as radio groups, toggles as switches) and SHALL respect `prefers-reduced-motion`.

## R2 Render request and credits

_As a creator, I want to be charged exactly what I was shown, once, and get my credits back if the export fails._

1. **R2.1** WHEN the creator clicks "Export video" THE SYSTEM SHALL freeze a snapshot of the project, make the voiceover available to the render (R7.3 in offline mode; a Storage upload otherwise), and send one render request with a client-generated request id, the options, the snapshot and the cost shown.
2. **R2.2** THE SYSTEM SHALL verify the caller's ID token and App Check token, parse the body with zod, re-validate the snapshot with `EditorProjectSchema`, and check that the voice file belongs to the caller, exists, is `audio/*` and is at most 50 MB.
3. **R2.3** THE SYSTEM SHALL compute the cost on the server. IF it differs from the cost the client showed THEN THE SYSTEM SHALL reject the request with `cost-changed` and the new cost, and charge nothing.
4. **R2.4** THE SYSTEM SHALL price an export as the resolution's base cost (720p 3, 1080p 5, 4K 10 credits, from `ai-tasks.md`; Remote Config may change them) times the number of started minutes of the video. An 18-second 1080p export costs 5.
5. **R2.5** WHEN the request is valid THE SYSTEM SHALL, in one Firestore transaction: check the balance covers the cost, check the caller has no active render, check the caller's daily render count, deduct the cost from `users/{uid}.credits`, write the ledger entry `users/{uid}/credits/export-{renderId}` (`reason: "export"`, `refId`, `balanceAfter`), increment the daily count and create `renders/{renderId}` with status `queued`.
6. **R2.6** THE SYSTEM SHALL derive the render id from the caller and the request id, so a repeated request (double click, network retry) returns the existing render and charges nothing more.
7. **R2.7** IF the balance is too low THEN THE SYSTEM SHALL answer `insufficient-credits` (HTTP 402) and write nothing. IF an active render exists THEN `render-active` (409) with its id, so the modal can show its progress. IF the daily count is used up (`rendersPerUserPerDay`, default 10) THEN `daily-limit` (429).
8. **R2.8** WHILE exports are switched off (`exportsEnabled` false or the global `killSwitch` on) THE SYSTEM SHALL reject new renders with `disabled` (503); the modal says "Exports are paused for a moment. Try again soon."
9. **R2.9** THE SYSTEM SHALL never let a balance go below zero, and SHALL keep `users/{uid}.credits` equal to the sum of the user's ledger deltas.

## R3 Render job

_As a creator, I want the exported file to look and sound exactly like the preview._

1. **R3.1** WHEN a render is created THE SYSTEM SHALL start one execution of the render job for it (cloud mode: Cloud Run Admin API `jobs:run` with the render id as the only override; emulator mode: a local process running the same entry point; offline mode: in-process), and SHALL store the execution name on the render doc.
2. **R3.2** THE SYSTEM SHALL compile the snapshot with the same compile-input function the editor preview uses (shared in `packages/motion`), in render mode, with the voiceover as a local file. Only slots that pass `isRenderable` for the chosen format are included, and scenes get their words, stress and pauses through `sceneTiming`.
3. **R3.3** THE SYSTEM SHALL render with `@hyperframes/producer`: MP4 H.264 at 30 fps by default; 720p and 4K through the producer's `outputResolution`; WebM VP9 with alpha and a transparent compile background when transparent is on.
4. **R3.4** IF the runtime reports any slot error in render mode (`window.__motionpop.errors`), or the producer fails, THEN THE SYSTEM SHALL fail the render (never ship a frame with a missing graphic).
5. **R3.5** WHEN the producer finishes THE SYSTEM SHALL upload the file to `users/{uid}/projects/{projectId}/renders/{renderId}/video.{mp4|webm}` with the right content type and an attachment filename of the sanitized title, extract a JPEG thumbnail at the first rendered slot's key moment to `…/thumb.jpg`, and record the output path, thumbnail path and size.
6. **R3.6** THE SYSTEM SHALL keep the exported video's duration equal to the project's duration (within one frame) and the voice in sync with the graphics (offset under one frame), in every format.
7. **R3.7** THE SYSTEM SHALL delete the snapshot and the local working files when the render ends, whether it succeeded or failed.
8. **R3.8** THE SYSTEM SHALL run the job with no retries, a task timeout of 20 minutes, and an abort when its render doc leaves an active status.

## R4 Progress and the render state machine

_As a creator, I want to see that my video is on its way, and I want to keep editing while it renders._

1. **R4.1** THE SYSTEM SHALL move a render only along `queued → rendering → encoding → done` or from any active status to `error`. `done` and `error` are final. Every transition is a transaction that checks the current status first.
2. **R4.2** WHILE a render is active THE SYSTEM SHALL write progress (0–100, never decreasing) to the render doc at most once per second and only when it moved by at least 2 points or the status changed, plus a heartbeat every 10 s.
3. **R4.3** WHILE a render is active THE SYSTEM SHALL show the progress state in the export modal: Pip in the "thinking" state, the percentage in mono, a progress bar, and a stage line ("Warming up…", "Rendering frames…", "Encoding…").
4. **R4.4** WHEN the creator closes the modal during a render THE SYSTEM SHALL keep the render going, show the progress on the top-bar Export button, and reopen the progress state when the button is clicked again.
5. **R4.5** WHEN a render reaches `done` THE SYSTEM SHALL open the ready modal (R5), or, if the export modal is closed, show a mint toast "Your video is ready" with "Open".
6. **R4.6** IF a render is `queued` for more than 5 minutes, or active with a heartbeat older than 90 s, THEN THE SYSTEM SHALL treat it as stalled: mark it `error` (`stalled`) and refund it. The check runs when the caller starts a new render and when the client asks after seeing no change for 45 s.

## R5 Ready modal, download and share

_As a creator, I want to get my file and send it to someone in one click._

1. **R5.1** WHEN a render is done THE SYSTEM SHALL show the ready modal from `design/screens/export-ready.png`: Pip celebrating with confetti in the dark ember oval, "Your video is ready", "From your voice to something worth sharing.", the file card (thumbnail, "{title}.mp4", "{resolution} · {format} · {seconds} sec", "Ready to download" in mint), "Download video", "Copy share link" and "Made with your voice. Finished with motionpop."
2. **R5.2** WHEN the creator clicks "Download video" THE SYSTEM SHALL download the file under its attachment filename through a short-lived signed URL (10 minutes) issued by a server route that checks the caller owns the render.
3. **R5.3** WHEN the creator clicks "Copy share link" THE SYSTEM SHALL create (once per render) an unguessable share id in `shares/{shareId}`, copy `{origin}/share/{shareId}` to the clipboard and show "Link copied" (mint toast).
4. **R5.4** WHEN anyone opens `/share/{shareId}` THE SYSTEM SHALL show a minimal share page in the app's language (centred video player, title, duration, "Made with motionpop", "Make your own"), reading the share and render on the server and serving the video through a signed URL valid for 1 hour. IF the share or render is missing THEN THE SYSTEM SHALL show a friendly not-found page. The page is `noindex`.

## R6 Failure handling

_As a creator, I want a clear next step when something goes wrong, and my credits back._

1. **R6.1** IF a render fails at any step (start, compile, slot error, producer, upload, stall, timeout) THEN THE SYSTEM SHALL set status `error` with an error code from a fixed list and a short server-safe message, and refund the cost with the ledger entry `refund-{renderId}`, at most once.
2. **R6.2** WHEN a render fails THE SYSTEM SHALL show an error state in the modal: Pip, a message for the code ("Pip dropped a frame. Your credits are back."), "Try again" (a new request id, the same options) and "Close". IF the modal is closed when the render fails THEN THE SYSTEM SHALL show an error toast with the same message and "Retry" (`architecture.md` failure table). Errors never fail silently.
3. **R6.3** IF the render job cannot be started THEN THE SYSTEM SHALL mark the render `error` (`start-failed`), refund it before the request returns, and answer 502.
4. **R6.4** THE SYSTEM SHALL log each failure with the render id, code, stage and producer details on the server, never with tokens, signed URLs or the transcript text.

## R7 Local and emulator modes

_As the developer, I want to render on my machine with no cloud and no cost, and test the whole export path offline._

1. **R7.1** THE SYSTEM SHALL choose the render mode on the server: `cloud` in production; `emulator` when the Firebase emulator variables are set; `offline` when Firebase is not configured and the app is not in production.
2. **R7.2** WHILE in `emulator` mode THE SYSTEM SHALL run the full path (auth, App Check skip as today, credits, render doc, Storage) against the emulators and render with the local producer in a child process running the job's entry point.
3. **R7.3** WHILE in `offline` mode THE SYSTEM SHALL accept the snapshot and the voice file in one multipart request to a development-only route, render in-process into the OS temp directory, report progress through polling, serve the file from a local route, charge no credits, and show "Local render · free" instead of the cost.
4. **R7.4** IF the app runs in production THEN THE SYSTEM SHALL refuse the `offline` and `emulator` modes and the development-only routes SHALL answer 404.
5. **R7.5** THE SYSTEM SHALL offer a command-line render of a project JSON file to an MP4 (`pnpm --filter @motionpop/render render:project <project.json> <voice> <out>`), with no Firebase, for debugging and CI.

## R8 Security

_As the founder, I want exports to be impossible to abuse or to leak someone's video._

1. **R8.1** THE SYSTEM SHALL let clients read only their own render docs and render files, and SHALL let only server code write renders, ledger entries, daily counters and shares (rules as today, with tests for every path this spec adds).
2. **R8.2** THE SYSTEM SHALL compile the composition on the server from the validated snapshot. It SHALL never render HTML sent by a client.
3. **R8.3** THE SYSTEM SHALL run the render job as its own service account, which can only read and write Firestore and the Storage bucket's `users/` paths; it holds no other secrets. The web backend's service account may run that one job and nothing else in Cloud Run.
4. **R8.4** THE SYSTEM SHALL bound every input: body size ≤ 2 MB, video length ≤ `exportMaxMs`, slots within the timeline invariants, voice ≤ 50 MB, one active render and `rendersPerUserPerDay` renders per user.
5. **R8.5** THE SYSTEM SHALL make share ids 128-bit random (base64url) and render ids unguessable without the caller's request id; signed URLs expire (10 min download, 1 h share page).

## R9 Cost and operations

_As the founder, I want exports to cost close to nothing when nobody is exporting._

1. **R9.1** THE SYSTEM SHALL run renders as Cloud Run job executions in us-central1, which bill only while a render runs (no minimum instances; nothing idles).
2. **R9.2** THE SYSTEM SHALL build the job image with Cloud Build from the repository (no local Docker needed) and deploy only with the founder's approval.
3. **R9.3** THE SYSTEM SHALL record for each render its wall time, render time, output size and the producer's perf summary in the server log, so the per-export cost can be measured and written up.
4. **R9.4** THE SYSTEM SHALL ship `packages/motion/dist` (runtime, fonts, textures) with the web app on App Hosting, so the hosted preview and the export modal's still work.

## Non-functional

- **NFR1 Speed.** An 18-second 1080p 16:9 export finishes in under 90 s from the click in cloud mode, cold start included (target; measured in task 22 and recorded in D-034). Offline mode on the founder's laptop: under 45 s.
- **NFR2 Parity.** The preview and the exported MP4 match at 5 timestamps per case within the existing parity thresholds (global ≤ 2 %, worst 64 px tile ≤ 10 %), now also through the shared project compile input and in 9:16 and 1:1.
- **NFR3 Honesty.** Every number shown (cost, balance, progress, size, duration) comes from the same source the server uses.
- **NFR4 Determinism.** Rendering the same snapshot twice gives frames identical within the parity thresholds.

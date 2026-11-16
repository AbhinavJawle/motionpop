# 08 · Render and export — design

_Written by Kiro CLI (headless, `motionpop-builder`, claude-opus-5.5) on 2026-11-16. Revised the same day (headless run, claude-sonnet-5.5) to apply every finding of `REVIEW.md` (see §25). Waiting for the founder's approval. Requirement ids refer to `requirements.md`._

## 1. Overview

```
Export modal ──► POST /api/renders ──► transaction: deduct + ledger + renders/{id} (queued)
     ▲                                   │
     │ onSnapshot renders/{id}           ▼
     │                         Cloud Run Admin API  jobs/motionpop-render:run  (env RENDER_ID)
     │                                   │
     │                                   ▼
     └──── progress / done / error ◄── render job: snapshot → compileProject → producer → Storage
                                         (fails → error + refund)
Ready modal ──► GET /api/renders/{id}/download (signed URL)   ·   POST /api/shares → /share/{id}
```

The design reuses what exists. The compiler, runtime, fonts and parity script from spec 03 are already used by the walking-skeleton render (`services/render/scripts/skeleton.ts`). The verify-and-transact pattern comes from `/api/ai/plan-allowance` and `bootstrapUser`. The rules already cover `renders/{id}`, `shares/{id}` and the render Storage path. The new parts are:

- the render schemas and the pure logic (cost, state machine, paths, progress);
- the job core with injected stores, so cloud, emulator and offline modes share it;
- the export transaction and the launchers;
- the modals.

### 1.1 What I checked before writing this (2026-11-16)

| What | How | Result used here |
|---|---|---|
| HyperFrames producer API | Context7 `/heygen-com/hyperframes` (producer README, `docs/packages/producer.mdx`, rendering and 4K guides) **and** the installed type declarations of `@hyperframes/producer@0.9.46` (`dist/services/renderOrchestrator.d.ts`, read in the main worktree's `node_modules`; no install) | `createRenderJob({ fps, quality: 'draft'\|'standard'\|'high', format: 'mp4'\|'webm'\|…, workers?, maxRenderMs?, outputResolution?, crf?, … })`; `executeRenderJob(job, projectDir, outputPath, onProgress?, abortSignal?)`; `job.status` is `queued\|preprocessing\|rendering\|encoding\|assembling\|complete\|failed\|cancelled`; `job.progress` 0–100; `job.perfSummary`, `job.errorDetails`; `RenderCancelledError`. |
| Output size | same | The composition's `data-width`/`data-height` set the canvas. `outputResolution` (`landscape-720p`, `portrait-720p`, `square-720p`, `landscape-4k`, `portrait-4k`, `square-4k`, …) changes the encoded size through Chrome's `deviceScaleFactor`. Upscaling must be by a whole number (1080 → 4K is 2×). 4K cannot be combined with alpha. The HyperFrames weekly notes say renders smaller than the composition were added recently. **Not verified for 0.9.46: whether `landscape-720p` from a 1080p composition works.** Task 1 checks it; the fallback is an ffmpeg scale pass after the render. The 4K facts are kept for "Later" (review F7). |
| Transparent output (kept for "Later", review F7) | same | `format: 'webm'` = VP9 `yuva420p` with true alpha and Opus audio. The engine forces a transparent page background and screenshot capture. Inspect alpha with `ffmpeg -c:v libvpx-vp9 -i x.webm …` (the default decoder hides alpha). Our compiler's `background: 'transparent'` already omits the background and texture layers. |
| Cloud Run jobs | Context7 `/websites/cloud_google_run` (jobs execute and overrides, `jobs:run` REST reference, task timeout, max retries, billing settings) | `POST https://run.googleapis.com/v2/projects/{p}/locations/{r}/jobs/{job}:run` with `overrides.containerOverrides[].env`, `taskCount`, `timeout`; overrides need `run.jobs.runWithOverrides`. The response is a long-running Operation (the execution name is in its metadata). Task timeout defaults to 10 min, maximum 168 h. Max retries default 3, per task; 0 means no retry. **All jobs use instance-based billing**, charged only while a task runs. |
| Cloud Run free tier and prices | Context7 returned no pricing table | **Not verified.** The cost numbers in §16 are from memory and marked as estimates. Task 22 reads the pricing page and corrects them in D-034. |
| `@hyperframes/gcp-cloud-run` | Context7 (`renderToCloudRun`, Workflows) | The distributed renderer needs Cloud Workflows, a bucket and Terraform. That is too much for 18–180 s videos, so it stays the upgrade path (D-009); see Later. |

## 2. Render modes

| | `cloud` | `emulator` | `offline` |
|---|---|---|---|
| When | `NODE_ENV=production` | `FIRESTORE_EMULATOR_HOST` set, not production | no Firebase web config, not production |
| Auth, App Check | required | ID token required; App Check skipped (as `verifyRequest` does today) | none |
| Render doc and ledger | Firestore | Firestore emulator | in-memory map in the Next server |
| Files | Storage bucket | Storage emulator | `os.tmpdir()/motionpop-renders/{renderId}/` |
| Voice to the job | client uploads to Storage | same, emulator | multipart upload to the route |
| Job runs | Cloud Run job execution | child process: `node services/render/src/job.ts` with `RENDER_ID` and the emulator env | in-process `runRender()` in the Next server |
| Progress to the client | `onSnapshot(renders/{id})` | same | polling `GET /api/local-renders/{id}` every 500 ms |
| Credits | charged and refunded | charged and refunded | none ("Local render · free") |

`renderMode()` (in `apps/web/lib/renders/mode.server.ts`) decides from the environment. A startup assertion and a unit test make production refuse `emulator` and `offline` (R7.4). The development-only routes check `renderMode() === 'offline'` and return 404 otherwise.

## 3. Data flow (cloud and emulator)

1. **Open the modal.** The modal reads the project from the editor store, the balance from `users/{uid}` (`useCreditBalance`, `onSnapshot`; owner read is allowed), the cost table and `exportsEnabled` from Remote Config, and any active render for this user (a query on `renders` where `ownerId == uid`, which the rules allow).
2. **Click Export video.**
   - `requestId = crypto.randomUUID()`.
   - `snapshot = structuredClone(project)`.
   - `voice = await resolveVoiceBlob(project)`, which reads the AudioStore (`idb:` refs) or synthesizes the `synth:` sample voice (`synth-voice.ts`).
   - The voice is uploaded to `users/{uid}/audio/{projectId}/voice-{sha256(bytes)[0..16]}.{ext}`, skipped when that object already exists.
3. **`POST /api/renders`** with `{ requestId, options, expectedCost, project: snapshot, voicePath }` (§5 `RenderRequestSchema`). The route:
   1. checks the body size, `verifyRequest`, the zod parse, `exportsEnabled`/`killSwitch` and the server config;
   2. checks that `voicePath` matches `voicePathFor(uid, project.id)` and that the object exists, is `audio/*` and is at most 50 MB, through the Admin Storage metadata. An id that fails the id regex in `renderPaths` is `invalid` (400), never a 500;
   3. computes the cost;
   4. sweeps the caller's stalled renders, then runs the `startExport` transaction (§7). A replay (`existing`) answers with the existing render and stops here: no second snapshot, no second launch. A rejection answers its error, and nothing is written anywhere;
   5. writes the snapshot to `…/renders/{renderId}/input/project.json` (Admin; the path is server-only). It is written after the transaction, so a rejected request leaves no file behind;
   6. launches the job (§9) and stores the `executionName`;
   7. answers `201 { renderId, costCredits, balanceAfter }`.

   If step 5 or 6 fails, the route runs `failRender(start-failed)`, which refunds, and answers 502. A job that starts before the snapshot exists can't happen, because the launch comes after the write.
4. **The job runs** (§8): `queued → rendering → encoding → done`, writing progress and heartbeats.
5. **The client watches** `renders/{renderId}`. The modal moves through progress, then ready or error. If nothing changes for 45 s, the client calls `POST /api/renders/{id}/check`, and the server runs `sweepIfStalled` (§7.3).
6. **Download.** `GET /api/renders/{id}/download` checks ownership and `status === 'done'`, then answers `{ url }`: a V4 signed URL valid 10 min with `response-content-disposition: attachment; filename="{title}.mp4"`. In emulator mode the route streams the bytes itself (`?stream=1`), because the Storage emulator can't check signed URLs.
7. **Share.** `POST /api/shares { renderId }` checks ownership and `done`, then in a transaction reuses `render.shareId` or creates `shares/{id}` and sets `render.shareId`. It answers `{ shareId, url }`.

Offline mode follows the same steps. The voice travels in the multipart body, the store is a `MemoryRenderStore`, and the job runs in-process.

## 4. Where the code goes

```
packages/schemas/src/render.ts            RenderOptions, RenderRequest, RenderDoc, RenderErrorCode, Share,
                                          transitions, exportCost, renderPaths, sanitizeFilename, progress mapping
packages/schemas/src/limits.ts            `planCloud` gets a default of 0; + optional `renders` counter on the day doc
packages/schemas/src/project.ts           `IntMsSchema` exported (used by render.ts)
packages/schemas/src/config.ts            + exportsEnabled, exportMaxMs, rendersPerUserPerDay, exportCredits
packages/motion/src/registry.ts           componentFor, sceneFor, isScene, schemaFor, lookFor   (moved from apps/web/lib/motion;
                                          lookFor(styleId) resolves `looks` then `stylePacks`, else editorialExplainer)
packages/motion/src/compiler/project.ts   isRenderable(slot, format), projectCompileInput(project, opts)
                                          (moved from apps/web/lib/composition/project-to-compile.ts; web re-exports)
services/render/src/
  ports.ts                                RenderStore, BlobStore, Producer, Preflight, Ffmpeg, Clock (interfaces)
  run-render.ts                           runRender(renderId, deps): the whole job, pure orchestration
  progress.ts                             producer status → our status/progress; throttle
  preflight.ts                            loads the composition in headless Chrome, reads __motionpop.errors
  thumbnail.ts                            ffmpeg frame grab at the key moment
  compile-assets.ts                       loads packages/motion/dist (runtime, fonts, textures)
  store/logic.ts                          pure decisions: decideExport, decideFail, isStalled (property tested)
  store/firestore.ts                      startExport, failRender, sweepIfStalled, FirestoreRenderStore
                                          (firebase-admin transactions; the ONLY copy of the credit logic)
  store/ids.ts                            renderIdFor, newShareId (Node crypto; server only)
  store/memory.ts                         MemoryRenderStore (offline mode and tests), same logic.ts
  store/index.ts                          subpath export `@motionpop/render/store`: imports firebase-admin and
                                          @motionpop/schemas only, never the producer (a test checks the imports)
  gcs-blobs.ts, fs-blobs.ts               BlobStore adapters (Storage via firebase-admin; local filesystem)
  job.ts                                  container entry: reads RENDER_ID, builds deps, runs, exits 0/1
  scripts/render-project.ts               CLI render of a project JSON (R7.5)
  Dockerfile, cloudbuild.yaml, README.md
apps/web/lib/renders/
  mode.server.ts                          renderMode()
  export-tx.server.ts                     wires @motionpop/render/store to adminDb() and serverConfig()
  launcher.server.ts                      cloudRunLauncher, childProcessLauncher, inProcessLauncher
  render-client.ts                        client: cloud/offline clients behind one interface
  voice-upload.ts                         resolveVoiceBlob + hashed upload
  use-render-job.ts, use-credit-balance.ts
apps/web/app/api/renders/route.ts                     POST create
apps/web/app/api/renders/[id]/download/route.ts       GET signed URL (or stream in emulator mode)
apps/web/app/api/renders/[id]/check/route.ts          POST stall check
apps/web/app/api/shares/route.ts                      POST create share
apps/web/app/api/local-renders/route.ts               POST multipart (offline only)
apps/web/app/api/local-renders/[id]/route.ts          GET status (offline only)
apps/web/app/api/local-renders/[id]/file/route.ts     GET file (offline only)
apps/web/app/share/[id]/page.tsx                      minimal share page (server component)
apps/web/components/export/                           export-modal.tsx, export-options.tsx, export-progress.tsx,
                                                      export-error.tsx, ready-modal.tsx, export-thumb.tsx, soon-pill.tsx
```

`services/render` already depends on `@motionpop/motion` and `@motionpop/schemas`. It gains `firebase-admin` (task 8), and `puppeteer` moves from a dev dependency to a dependency (the preflight uses it). `apps/web` gains `@motionpop/render` (`workspace:*`) for the `./store` subpath only. The route handlers are Node runtime and import nothing else from it.

## 5. Schemas (`packages/schemas/src/render.ts`)

```ts
// 4K and transparent WebM are "Later" (review F7): adding '4k' here and a container field is the
// whole schema change, so nothing in the shapes below blocks them.
export const ResolutionSchema = z.enum(['720p', '1080p']);
export const RenderStatusSchema = z.enum(['queued', 'rendering', 'encoding', 'done', 'error']);
export const RenderModeSchema = z.enum(['cloud', 'emulator', 'offline']);

export const RenderErrorCodeSchema = z.enum([
  'start-failed',   // the job could not be launched
  'stalled',        // no heartbeat (R4.6)
  'input-missing',  // snapshot or voice missing / unreadable
  'compile-failed', // compileProject threw
  'slot-failed',    // runtime reported a slot error in render mode
  'render-failed',  // producer failed
  'timeout',        // maxRenderMs or task timeout
  'upload-failed',
  'internal',
]);

export const RenderOptionsSchema = z.object({
  format: FormatSchema,
  resolution: ResolutionSchema,
  captions: z.boolean(),   // false until spec 12; the route rejects true as `invalid`
  music: z.boolean(),      // false until spec 12; same
}).strict();

/** Voice uploaded by the caller for this project (cloud + emulator). */
export const voicePathFor = (uid: string, projectId: string) =>
  new RegExp(`^users/${escape(uid)}/audio/${escape(projectId)}/voice-[0-9a-f]{16}\\.(wav|mp3|m4a|webm|ogg)$`);

export const RenderRequestSchema = z.object({
  requestId: z.uuid(),
  options: RenderOptionsSchema,
  expectedCost: z.number().int().nonnegative(),
  project: EditorProjectSchema,
  voicePath: z.string().min(1).max(300),   // checked against voicePathFor in the route
}).strict();

export const RenderDocSchema = z.object({
  schemaVersion: z.literal(1),
  ownerId: z.string().min(1),
  projectId: z.string().min(1),
  requestId: z.uuid(),
  title: z.string().max(120),
  format: FormatSchema,
  resolution: ResolutionSchema,
  captions: z.boolean(), music: z.boolean(),
  durationMs: IntMsSchema,
  slotCount: z.number().int().nonnegative(),       // slots that render
  status: RenderStatusSchema,
  progress: z.number().int().min(0).max(100),
  costCredits: z.number().int().nonnegative(),
  mode: RenderModeSchema,
  inputPath: z.string(), voicePath: z.string(),
  outputPath: z.string().optional(),
  thumbPath: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  executionName: z.string().optional(),
  error: RenderErrorCodeSchema.optional(),
  errorMessage: z.string().max(200).optional(),   // server-safe, shown nowhere verbatim
  shareId: z.string().optional(),
  createdAt: TimestampLikeSchema,
  startedAt: TimestampLikeSchema.optional(),
  heartbeatAt: TimestampLikeSchema.optional(),
  finishedAt: TimestampLikeSchema.optional(),
}).superRefine(renderDocInvariants);   // done ⇒ progress 100 ∧ outputPath; error ⇒ error code

export const ShareDocSchema = z.object({
  schemaVersion: z.literal(1),
  ownerId: z.string(), projectId: z.string(), renderId: z.string(),
  revoked: z.boolean(), createdAt: TimestampLikeSchema,
});

export const CreateRenderResponseSchema = z.object({
  renderId: z.string(), costCredits: z.number().int(), balanceAfter: z.number().int(),
});
export const RenderApiErrorSchema = z.object({
  error: z.enum(['invalid', 'too-large', 'too-long', 'nothing-to-render', 'voice-missing',
                 'cost-changed', 'insufficient-credits', 'render-active', 'daily-limit',
                 'disabled', 'start-failed', 'unauthorized']),
  cost: z.number().int().optional(),         // cost-changed
  renderId: z.string().optional(),           // render-active
  balance: z.number().int().optional(),      // insufficient-credits
});
```

**Pure helpers in the same file.** All are unit-tested and the properties in §19 cover them.

- `IntMsSchema` is exported from `project.ts` (it was a local `const`) and `render.ts` imports it (review F12). Frame counts use `msToFrame` from `time.ts`, never a hand-written `round(ms × 30 / 1000)` (review F13).
- `exportCost(resolution, durationMs, table = DEFAULT_EXPORT_CREDITS)` = `table[resolution] * max(1, ceil(durationMs / 60_000))`. `DEFAULT_EXPORT_CREDITS = { '720p': 3, '1080p': 5 }`.
- `renderIdFor(uid, requestId)` = `'r' + base64url(sha256(uid + ':' + requestId)).slice(0, 21)` and `newShareId()` = `randomBytes(16).toString('base64url')` (22 characters). Both need Node `crypto`, so they live in `services/render/src/store/ids.ts` (task 8) and not in `packages/schemas`, which the browser bundle imports. The id regex `isSafeId` stays in the schemas.
- `renderPaths(uid, projectId, renderId)` returns `{ dir, input, output, thumb }` (`output` is always `video.mp4`), all under `users/{uid}/projects/{projectId}/renders/{renderId}/`. Ids must match `^[A-Za-z0-9_-]{1,128}$`; anything else throws, and callers map that to `invalid`.
- `sanitizeFilename(title, ext)` NFC-normalises, removes control characters and `/\:*?"<>|`, collapses whitespace, trims dots and spaces, caps the length at 80, and falls back to "motionpop video". "Untitled Project" becomes "Untitled Project.mp4".
- `canTransition(from, to)` and `nextProgress(prev, candidate)` = `max(prev, clamp(candidate, 0, 100))`.
- `outputResolutionFor(format, resolution)` maps to the producer preset: 1080p gives `undefined` (native); 720p gives `landscape-720p`, `portrait-720p` or `square-720p`.
- `exportAvailability(project, options, ctx)` returns `{ renderable, leftOut, reasons[] }`. The modal and the route share it, so the "left out" count and "nothing to render" agree.

**Config keys** (Remote Config, typed defaults in `APP_CONFIG_DEFAULTS`; the server reads them through `serverConfig()`):

| Key | Default | |
|---|---|---|
| `exports_enabled` | `true` | Pause exports without the global kill switch |
| `export_max_ms` | `180000` | R1.11 |
| `renders_per_user_per_day` | `10` | R2.7 |
| `export_credits` | `{"720p":3,"1080p":5}` | R2.4 |

There are no 4K or transparent flags: those options are "Later" and the modal shows them disabled with "Soon" without any config (review F7). Export credits don't count toward `dailyBudgetCredits` (review F14).

**`DailyLimitsSchema` changes (review F1).** `planCloud` becomes `z.number().int().nonnegative().default(0)` and `renders: z.number().int().nonnegative().default(0)` is added. Without the default, a day doc created by an export (`{ schemaVersion, renders, updatedAt }`) would fail `DailyLimitsSchema.parse` in the next export transaction and in `/api/ai/plan-allowance`; and a doc created by a plan call would lack `renders`. Both writers use `merge`, and a unit test parses a doc written by either path.

## 6. Render state machine

```
            ┌────────────── error (final) ◄─────────────┐
            │                   ▲            ▲           │
 create ─► queued ──start──► rendering ──► encoding ──► done (final)
   (tx)      progress 0      1..85         85..99       100
```

| From → to | Who | Guard |
|---|---|---|
| (none) → `queued` | `startExport` transaction | balance, no active render, daily count |
| `queued` → `rendering` | job, `markStarted` | status is `queued`; sets `startedAt`, `heartbeatAt` |
| `rendering` → `encoding` | job | the producer reached `encoding` or `assembling`, or the upload started |
| `encoding` → `done` | job, `markDone` | the output is uploaded; sets `outputPath`, `thumbPath`, `sizeBytes`, `progress: 100`, `finishedAt` |
| active → `error` | job (`failRender`), route (`start-failed`), sweep (`stalled`) | the status is active; refund in the same transaction |

- **Progress.** Producer progress is mapped into the band of our current status: `rendering` = `1 + round(p × 0.84)`, `encoding` = `85 + round(p × 0.14)`. It is clamped so it never decreases (`nextProgress`).
- **Throttle (R4.2).** The job writes when at least 1000 ms have passed since its last write **and** the progress moved by 2 or more points, or immediately when the status changes. A separate 10 s heartbeat writes `heartbeatAt` only.
- **Status checks.** Each write is a transaction that re-reads the status. If the doc is no longer active (swept, or failed elsewhere), the job aborts the producer through its `AbortSignal`, deletes its outputs and exits 0.

## 7. Credits: deduct, refund, sweep (`services/render/src/store/`)

The decisions are pure functions in `store/logic.ts`. `store/firestore.ts` only does Firestore reads and writes inside `db.runTransaction`, so the transaction code stays small and the logic is property-tested without the emulator. The web routes (through `apps/web/lib/renders/export-tx.server.ts`) and the job import the same module.

### 7.1 `startExport(db, caller, req, cost, cfg, now)`

```ts
return db.runTransaction(async (t) => {
  const renderRef = db.doc(`renders/${renderId}`);
  const userRef = db.doc(`users/${uid}`);
  const dayRef = db.doc(`users/${uid}/limits/${utcDayKey(now)}`);
  const activeQ = db.collection('renders').where('ownerId', '==', uid)
                    .where('status', 'in', ['queued', 'rendering', 'encoding']).limit(1);
  // All reads first (Firestore transaction rule).
  const [existing, user, day, active] = await Promise.all([
    t.get(renderRef), t.get(userRef), t.get(dayRef), t.get(activeQ)]);
  const d = decideExport({                       // pure, store/logic.ts
    existing: existing.exists ? RenderDocSchema.parse(existing.data()) : null,
    balance: UserDocSchema.parse(user.data()).credits,
    rendersToday: day.exists ? DailyLimitsSchema.parse(day.data()).renders : 0,   // defaults to 0 (F1)
    active: active.docs[0] ? { id: active.docs[0].id } : null,
    cost, limit: cfg.rendersPerUserPerDay });
  if (d.kind === 'existing') return d;             // idempotent replay: nothing written
  if (d.kind === 'reject') return d;               // insufficient-credits | render-active | daily-limit
  t.update(userRef, { credits: d.balanceAfter });
  t.create(db.doc(`users/${uid}/credits/export-${renderId}`),
           { delta: -cost, reason: 'export', refId: renderId, balanceAfter: d.balanceAfter, at: serverTs });
  // `merge` keeps a `planCloud` written by another path; a doc with only `renders` still parses (F1).
  t.set(dayRef, { schemaVersion: 1, renders: d.rendersToday, updatedAt: serverTs }, { merge: true });
  t.create(renderRef, { ...newRenderDoc(...), status: 'queued', progress: 0, createdAt: serverTs });
  return d;                                        // { kind: 'created', balanceAfter }
});
```

- Before the transaction, the route sweeps the caller's stalled active renders (§7.3). One stuck job therefore never blocks a new export.
- The snapshot is written after this transaction, and the job is launched after the snapshot (§3).
- The active-render query needs a composite index on `renders (ownerId ASC, status ASC)`, added to `firestore.indexes.json`.
- Firestore retries the transaction on contention, so two concurrent different requests can't both pass the balance or active checks. Two identical requests map to the same `renderId`; the second sees `existing` and writes nothing.

### 7.2 `failRender(db, renderId, code, message)`

```ts
return db.runTransaction(async (t) => {
  const r = RenderDocSchema.parse((await t.get(renderRef)).data());
  const refundRef = db.doc(`users/${r.ownerId}/credits/refund-${renderId}`);
  const [user, refund] = await Promise.all([t.get(userRef), t.get(refundRef)]);
  const d = decideFail(r, refund.exists, code);    // pure: no-op if final or already refunded
  if (d.kind === 'noop') return d;
  t.update(renderRef, { status: 'error', error: code, errorMessage: message.slice(0, 200), finishedAt: serverTs });
  if (r.costCredits > 0 && !refund.exists) {
    const balanceAfter = user.data().credits + r.costCredits;   // `user` is a snapshot (F17)
    t.update(userRef, { credits: balanceAfter });
    t.create(refundRef, { delta: r.costCredits, reason: 'refund', refId: renderId, balanceAfter, at: serverTs });
  }
  return d;
});
```

- The refund doc has a fixed id, so a refund can never be paid twice, even if the job, the sweep and the route all try.
- The daily render counter is not given back. A failed render still counts toward the 10 per day; this keeps the counter simple and stops abuse through forced failures.
- A bad id (for example a `project.id` that fails the id regex in `renderPaths`) is `invalid` (400) before any transaction runs, never a 500 (F17).
- The job uses the same function through its `RenderStore` port (`FirestoreRenderStore.fail` calls `failRender`). The web route imports it from `@motionpop/render/store`. Refund logic therefore exists exactly once.

### 7.3 `sweepIfStalled(db, renderId, now)`

`isStalled(r, now)` (pure) is true in three cases:
- the render is `queued` and `now − createdAt > 5 min`;
- it is `rendering` or `encoding` and `now − heartbeatAt > 90 s`;
- it has been active for longer than the 20-minute task timeout plus 2 minutes.

When it is true, the sweep calls `failRender(renderId, 'stalled')`. The server clock decides; the client only asks.

## 8. The render job (`services/render/src/run-render.ts`)

```ts
export interface RenderDeps {
  store: RenderStore;        // get, markStarted, progress, heartbeat, markDone, fail (all transactional)
  blobs: BlobStore;          // read(path) → Buffer, write(path, file, { contentType, filename }), delete(prefix)
  preflight: Preflight;      // check(dir, samplesMs) → SlotError[]  (headless Chrome, our runtime's own errors)
  producer: Producer;        // render(dir, out, config, onProgress, signal) → { perf }  (wraps executeRenderJob)
  ffmpeg: Ffmpeg;            // frame(out, ms, jpg), probe(file) → { durationMs, width, height, frames, audioStreams }, toWav(src, wav)
  assets: CompileAssets;     // from packages/motion/dist
  clock: Clock;              // now(), setInterval for the heartbeat (service code, not compositions)
  workDir: string;           // os.tmpdir()/render-{id}
  log: Logger;
}

export async function runRender(renderId: string, deps: RenderDeps): Promise<'done' | 'error' | 'skipped'>
```

Steps (each failure maps to one error code, then `store.fail` with a refund, then cleanup):

1. **Load and claim.** `store.get(renderId)`; it must be `queued`, otherwise `skipped` (a duplicate execution or a swept render). Then `store.markStarted`. Start the 10 s heartbeat. Create an `AbortController` that fires when a store write finds the render no longer active.
2. **Inputs** (`input-missing`; review F8).
   - **Re-validate the paths first.** The doc is server-written, so this is cheap defence in depth against a bad doc or a code bug: `doc.inputPath` must equal `renderPaths(ownerId, projectId, renderId).input`, and `doc.voicePath` must match `voicePathFor(ownerId, projectId)`. Anything else fails the render without reading a byte, because the job's Storage grant spans every user's `users/` objects (R8.3).
   - Read `input/project.json` and parse it with `EditorProjectSchema`.
   - **Probe and normalise the voice.** The voice is any `audio/*` object the owner uploaded, so it is untrusted input to ffmpeg and Chrome. `ffprobe` must report exactly one audio stream and a duration of at most `durationMs + 5 s` (and at most 10 minutes); the job then re-encodes it to `workDir/composition/assets/voice.wav` (PCM, 48 kHz, stereo, with ffmpeg's `-map 0:a:0 -vn -sn -dn`), and only the WAV enters the composition. A file that isn't decodable audio fails as `input-missing`.
3. **Compile** (`compile-failed`). `projectCompileInput(project, { mode: 'render', format, background: 'style', voiceSrc: 'assets/voice.wav' })`, then `compileProject(input, assets)`, then write `composition/index.html`. **Image slots are left out of renders** (review F5, option a): `isRenderable` returns false for them, they count in the "left out" note (R1.8), and no asset file travels to the job. Assets live in the browser until spec 07 (tasks 25 and 26) defines storage; when it does, `RenderRequestSchema` gains `assetPaths` and this step fetches and validates them (see "Later").
4. **Produce** (`render-failed`, `slot-failed`, `timeout`).
   ```ts
   createRenderJob({ fps: 30, quality: 'high', format: 'mp4',
                     workers: 2, maxRenderMs: 15 * 60_000,
                     outputResolution: outputResolutionFor(format, resolution) })
   ```
   This is followed by `executeRenderJob(job, compDir, out, onProgress, signal)`.
   - `onProgress` maps `job.status` and `job.progress` to our status (`preprocessing` and `rendering` → `rendering`; `encoding` and `assembling` → `encoding`) and passes it through the throttle.
   - `quality: 'high'` and `workers: 2` are starting values. Task 1 measures them against `standard` and `workers` unset, and D-034 records the choice.

   **Preflight before step 4 (`slot-failed`).**
   - **Why it's needed.** The runtime collects slot errors in `window.__motionpop.errors`, and in render mode a failing slot leaves its clip empty (spec 03 contract). The producer knows nothing about our errors. The engine's comment "the producer reads `errors` and fails the job" describes this preflight; nothing does it yet.
   - **What it does.** Before the producer runs, `preflight.ts` loads `composition/index.html` in headless Chrome (puppeteer, as `scripts/parity.ts` does) at the composition size and awaits `__motionpop.ready`. It then seeks with `window.__motionpop.seek(ms)` (our runtime's own function, integer milliseconds; review F9) to each rendered slot's start + 1 frame, key moment and end − 1 frame, and reads `__motionpop.errors`. The preflight does not use `window.__player`, which comes from the HyperFrames runtime and is not ours.
   - **Result.** Any error fails the render as `slot-failed`, naming the slot id in `errorMessage`.
   - **Cost.** It adds about 1–3 s, which is cheaper than rendering a broken video, and it puts R3.4 in code we own.
5. **Check the output.** `ffmpeg.probe(out)` runs `ffprobe -print_format json`, and the JSON is parsed with zod. Frames must be `msToFrame(durationMs) ± 1` (from the stream's `nb_frames`, counted when it is missing), and the width and height must match the chosen resolution and format. A mismatch is `render-failed` (R3.6).
6. **Thumbnail.** Take a JPEG at `firstSlot.startMs + keyMoment` (or 1000 ms when there are no slots), 480 px on the long side, quality 80.
7. **Upload** (`upload-failed`). Write the video with content type `video/mp4`, content disposition `attachment; filename="{ascii fallback}"; filename*=UTF-8''{percent-encoded sanitized title}` (RFC 6266/5987, so non-ASCII titles survive and no header injection is possible), and cache control `private, max-age=0`. Write the thumbnail as `image/jpeg`. Then set status `encoding` → `done` with `outputPath`, `thumbPath`, `sizeBytes` and progress 100.
8. **Cleanup** (always, in `finally`): stop the heartbeat, `rm -rf workDir` (which holds the re-encoded voice), and `blobs.delete(input/)`.
9. **Log** one structured line per render: id, status, code, `wallMs`, `renderMs`, `perfSummary.totalElapsedMs`, `sizeBytes`, format, resolution. No transcript text, no URLs (R6.4, R9.3).

**`job.ts` (container entry).** It reads `RENDER_ID` from the env and validates it with the id regex. It builds the Firestore and GCS deps with Application Default Credentials (the job's service account), or with the emulator hosts when they are set. It runs `runRender` and exits 0, even after a handled failure, so Cloud Run never retries. It exits 1 only when it couldn't even record the failure; the sweep then catches it.

## 9. Launchers (`apps/web/lib/renders/launcher.server.ts`)

```ts
interface RenderLauncher { launch(renderId: string): Promise<{ executionName: string }> }
```

- **`cloudRunLauncher`.**
  - Gets an access token from the Admin SDK credential: `adminApp().options.credential.getAccessToken()`. The App Hosting service account has the cloud-platform scope. **Verify in task 11 that the token works for `run.googleapis.com`;** if not, use the metadata server (`http://metadata.google.internal/computeMetadata/v1/instance/service-account/token`, header `Metadata-Flavor: Google`).
  - Then it calls:
    ```
    POST https://run.googleapis.com/v2/projects/${PROJECT}/locations/us-central1/jobs/${RENDER_JOB}:run
    { "overrides": { "containerOverrides": [{ "env": [{ "name": "RENDER_ID", "value": renderId }] }] } }
    ```
  - The response is an Operation. The execution name is read from `metadata.name` and parsed with zod. A missing name is not an error: it is optional on the doc.
  - The call times out after 15 s. A timeout or a non-2xx answer becomes `start-failed`.
- **`childProcessLauncher`** (emulator). Spawns `node --import tsx services/render/src/job.ts` with `RENDER_ID` and the emulator env vars, detached, logs to `os.tmpdir()/motionpop-renders/{id}.log`. Returns `local-{pid}`.
- **`inProcessLauncher`** (offline). Calls `runRender(renderId, offlineDeps)` without awaiting it, with `MemoryRenderStore` and `FsBlobStore` singletons held on `globalThis`, so they survive Next dev hot reload.

## 10. API routes

All use `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`. All except the share page call `verifyRequest`. Bodies and responses are zod-parsed. Errors use `errorResponse` and `RenderApiErrorSchema`.

| Route | Does | Errors |
|---|---|---|
| `POST /api/renders` | §3 step 3 | 400 `invalid`, 413 `too-large` (> 2 MB), 422 `too-long` / `nothing-to-render` / `voice-missing`, 409 `cost-changed` / `render-active`, 402 `insufficient-credits`, 429 `daily-limit`, 503 `disabled`, 502 `start-failed` |
| `POST /api/renders/[id]/check` | owner only; `sweepIfStalled`; returns the parsed doc | 404 when not the owner's (no existence leak) |
| `GET /api/renders/[id]/download` | owner, `done`; signed URL (cloud) or stream (emulator) | 404, 409 when not done |
| `POST /api/shares` | owner, `done`; idempotent share | 404, 409 |
| `POST /api/local-renders` | offline only; multipart `request` (JSON without `voicePath`) + `voice` (≤ 50 MB, `audio/*`) | 404 outside offline |
| `GET /api/local-renders/[id]` | offline only; doc | 404 |
| `GET /api/local-renders/[id]/file` | offline only; streams the file with `Content-Disposition` | 404 |

## 11. Firestore, Storage and rules

- **`renders/{renderId}`.** `RenderDocSchema`. Owner read, no client write (the existing rule). The composite index `(ownerId, status)` is new.
- **Ledger.** `users/{uid}/credits/export-{renderId}` and `refund-{renderId}`, both server-only (existing rule).
- **`users/{uid}/limits/{day}.renders`.** Server-only (existing rule).
- **`shares/{shareId}`.** `ShareDocSchema`. Denied to clients (existing rule). Read by the share page through Admin.
- **Storage paths:**

  | Path | Writer | Reader |
  |---|---|---|
  | `users/{uid}/audio/{projectId}/voice-{hash16}.{ext}` | owner (existing rule: `audio/*`, ≤ 50 MB) | job (Admin) |
  | `users/{uid}/projects/{pid}/renders/{rid}/input/project.json` | route (Admin) | job |
  | `…/renders/{rid}/video.mp4` | job | owner, via signed URL |
  | `…/renders/{rid}/thumb.jpg` | job | owner, signed URL or Storage SDK |

- **No rule change is expected.** `users/{uid}/projects/{pid}/renders/{file=**}` already gives owner read and denies client writes, and the audio rule already covers the voice. Task 13 adds tests for each new path. If a test shows a gap, the rule is fixed in that task and the change is noted.

## 12. Client (`apps/web/lib/renders/`)

```ts
interface RenderClient {
  start(input: { requestId; options; expectedCost; project; voice: Blob }): Promise<CreateRenderResponse | RenderApiError>;
  watch(renderId, onDoc: (doc: RenderDoc) => void): () => void;   // onSnapshot or polling
  check(renderId): Promise<RenderDoc>;
  downloadUrl(renderId): Promise<string>;
  share(renderId): Promise<{ url: string }>;
}
```

- `cloudRenderClient` is used when Firebase is enabled: it uploads the voice, then POSTs, and watches with `onSnapshot`.
- `offlineRenderClient` POSTs multipart and polls.
- Requests carry the ID token and App Check headers through the existing helpers.
- **`useRenderJob(renderId)`** returns `{ doc, phase: 'idle' | 'starting' | 'progress' | 'ready' | 'error' }`. It runs a 45 s no-change timer that calls `check`. That timer is UI code, not composition code.
- **`useActiveRender(uid)`** queries the caller's active render on mount, so a reload during a render shows its progress again.
- **`useCreditBalance()`** reads `onSnapshot(users/{uid}).credits`. The top-bar credits chip uses it too, which replaces `CREDITS_PLACEHOLDER`; in offline mode the chip keeps the placeholder. This is the only spec 13 piece pulled forward, so the modal and the chip never disagree (NFR3).

## 13. UI (matches `export.png` and `export-ready.png`)

Values below are read from `design/figma-export.css` (frames "Export dialog" and "Success dialog"). The PNG wins if they disagree. Tokens from `design-system.md` are used where they match.

### 13.1 Export modal (R1)

- **Backdrop.** 1440×900, `rgba(5,5,9,0.79)`.
- **Dialog.** 560×768 at (440, 66), centred. Background `rgba(19,18,26,0.96)`, `backdrop-filter: blur(16px)`, border `1px rgba(204,194,255,0.19)`, radius 24, shadow `0 24px 64px rgba(0,0,0,0.6)`. It opens by scaling from 0.96 with a backdrop fade (`design-system.md`).
- **Header.** "Export video" (Geist 600, 24/31, `#F4F3F8`) at (32, 29). "A little voice. Ready for the world." (13/17, `#A09EAE`) at (32, 64). Close ✕ (20 px frame, `#A09EAE`) at (508, 30).
- **Project card.** 496×132 at (32, 104), background `#17151E`, border `1px #34303F`, radius 14.
  - Thumbnail 192×108 at (12, 12), radius 3.2, using the preview frame card gradient and shadow from the CSS.
  - Title (15/20, `#F4F3F8`) at (220, 30). "18 sec · 4 scenes" (Geist Mono 12/16, `#A09EAE`) at (220, 57). Look name (12/16, `#A09EAE`) at (220, 82).
- **"Format"** (13/17, `#F4F3F8`) at (32, 260). Three cards, each 160×48, at x = 32, 200 and 368, y = 286, radius 10.
  - Unselected: `#1B1823`, border `#34303F`, label and icon `#A09EAE`.
  - Selected: `#33252B`, border `#A7664E`, label and icon `#FFAD85`.
  - Each card has a mini frame icon (20×12 / 12×20 / 16×16, 1.5 px stroke, radius 2) at x = 39 and a label at x = 71, 13/17.
- **"Resolution"** at (32, 358). Three cards, each 160×42, at y = 384, with centred labels; same colours as the format cards.
- **Toggles.** Each label is 14/18 `#F4F3F8` at x = 32; each switch is 40×22, radius 11, at x = 488. On: `#A38AFF`, thumb 16 px white at x = 21. Off: `#3B354A`, thumb at x = 3.
  - "Captions" at y = 456.
  - "Transparent background (for editors)" at y = 500, with "Exports as WebM with alpha when enabled." (11/14 `#A09EAE`) at y = 523. Always off and disabled with a "Soon" pill in this spec (R1.5).
  - "Include music" at y = 563.
- **Footer divider.** 496×1 `#34303F` at (32, 608).
- **Cost line.** "Cost: 5 credits" (Geist Mono 12/16, `#FFAD85`) at (32, 629). "120 available" (Geist Mono 11/14, `#A09EAE`), right-aligned to x = 506.
- **Primary button.** "Export video": 496×48 at (32, 668), `ember-grad`, shadow `0 4px 20px rgba(255,122,61,0.18), 0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)`, radius 10. Upload icon 16 px (1.6 px white stroke) plus label (Geist 600; 12 px in the CSS, about 15 px in the PNG; **the PNG wins**, checked in task 18). Content is left-aligned at 16 px as in the PNG.
- **File meta.** "MP4 · H.264 · 30 fps" (Geist Mono 11/14, `#A09EAE`), centred at y = 731.
- **Option cards** are `role="radiogroup"` with arrow-key navigation. They lift 1 px on hover and press to 0.97, with a spring (`stiffness 400, damping 30`).
- **"Soon" pill** (R1.5–R1.7, not in the design; same language): 9 px uppercase, letter-spacing 0.8 px, `text-3` on `card-2`, border `border`, full radius, 6 px after the label. A disabled toggle uses `text-4` for its label and `opacity 0.5` for its switch, and has a tooltip ("Arrives with captions" / "Arrives with music" / "Transparent export is almost ready").
- **Messages in the cost row** replace "120 available" with:
  - "Not enough credits. Small edits stay free." in `error`, with the button disabled (R1.9);
  - "Local render · free" in `mint` in offline mode, with the cost hidden.
  The left-out note (R1.8) sits under the cost row, in 11/14 `text-2`. The dialog grows by 18 px when it shows.
- **Thumbnail.** A paused `<hyperframes-player>` with the same compiled preview HTML, seeked to the first rendered slot's key moment, in the chosen format (letterboxed in the 192×108 box for 9:16 and 1:1). It is a library-only composition, so the player's default sandbox applies (D-021); tier-2 slots never reach it (spec 15). **Deliberate deviation:** the design's thumbnail shows the editor's "Ready in 4.2s" badge and a frame note. Those are editor chrome, not part of the video, so the thumbnail shows the video frame only.

### 13.2 Progress, error (R4.3, R6.2)

These states are not designed; they use the same language and the same dialog. The options area (y 260–716) cross-fades over 240 ms into the content below.

- **Progress.**
  - Pip (`state="thinking"`, 120 px) on the ambient ember bloom.
  - The percentage in Geist Mono 40 px semibold, rolling as it changes (`NumberRoll`).
  - A 496×6 bar: `card-2` track and `violet-fill`, radius full, width eased over 200 ms. Violet, because a render is cloud work (colour discipline) and the dashboard's "Rendering 64%" chip is violet.
  - The stage line in 13/17 `text-2`. `queued` shows "Warming up…", `rendering` shows "Rendering frames…" and `encoding` shows "Encoding…".
  - "You can keep editing. Pip will tell you when it's ready." in 11/14 `text-3`.
  - Closing (✕ or Esc) keeps the render (R4.4).
- **Top-bar Export button during a render.** The button keeps its size, but switches to the status look of the dashboard's "Rendering 64%" chip: `card` background, a 1 px violet border, a 14 px violet spinner ring in place of the upload icon, and "Rendering 64%" (mono digits, `text`). A click reopens the modal in the progress state. The button goes back to the ember gradient when the render ends.
- **Toasts when the modal is closed.**
  - Done: mint "Your video is ready" with "Open" (opens the ready modal).
  - Failed: the error message from §15 with "Retry" (violet, because it retries cloud work). Retry starts a new request with the same options.
- **Error.**
  - Pip (`state="empty-pockets"` for `insufficient-credits`, otherwise `idle` with a small frown variant if one exists, else `idle`).
  - The title "That one didn't make it" (24/31).
  - The message from the table in §15.
  - "Try again" (ember gradient, a new request id) and "Close" (outline).

### 13.3 Ready modal (R5.1)

- **Dialog.** 560×638 at (440, 131), with the same surface, border, radius 24 and shadow as the export dialog. Close ✕ at (508, 26).
- **Pip.** The celebration glow is 270×166 at (145, 56): `radial-gradient(100% 100% at 50% 50%, rgba(255,122,61,0.16), transparent)` over the dark ember oval. Pip is `state="celebrating"`, 142.68 px, at (186.68, 58), with confetti in ember, violet, mint and pink. `prefers-reduced-motion` gives a static pose with no confetti.
- **Text.** "Your video is ready" (Geist 600, 28/36, `#F4F3F8`) centred at y = 245. "From your voice to something worth sharing." (14/18, `#A09EAE`) centred at y = 286.
- **File card.** 496×110 at (32, 328), `#1B1823`, border `#34303F`, radius 12.
  - Thumbnail 144×81 at (14, 14), radius 2.4: `thumb.jpg` through the Storage SDK `getBlob` (owner read is allowed), or the local file route in offline mode.
  - Filename (14/18 `#F4F3F8`) at (176, 26).
  - "1080p · 16:9 · 18 sec" (Geist Mono 11/14, `#F4F3F8`) at (176, 53).
  - "Ready to download" (11/14, `#BFE9D6`) at (176, 76).
- **"Download video".** 496×48 at (32, 462), ember gradient as in §13.1. It uses a **download** icon, the deliberate deviation already recorded in `screens.md`.
- **"Copy share link".** 496×44 at (32, 522), `#24202F`, border `#403849`, radius 10. A link icon (20 px, `#C4B3FF`) sits at (199, 534) and the label "Copy share link" (Geist 500, 13/17, `#F4F3F8`) is centred.
- **Footer.** "Made with your voice. Finished with motionpop." (11/14 `#A09EAE`) centred at y = 591.
- **Toasts.** "Link copied" (mint). "Download started" is not shown, because the browser shows its own.

### 13.4 Share page `/share/[id]` (R5.4, not designed)

- The page is centred on `bg`, with the Pip logo and "motionpop" at the top-left.
- The video sits in a `<video controls playsinline>` card using the preview frame gradient and the glass shadow, at most 960 px wide (9:16 at most 70 vh tall).
- Below it: the title (26 px semibold), the duration (mono `text-2`), "Made with motionpop" (`text-3`) and "Make your own" (ember button to `/`).
- `export const metadata = { robots: { index: false } }`. The page is server-rendered with Admin reads and signed URLs (1 h).
- **Not found.** Pip `idle`, "This video isn't here anymore.", "Make your own".

## 14. Formats and resolutions

| Option | Composition | Producer | Output |
|---|---|---|---|
| 16:9 · 1080p | 1920×1080 | native | 1920×1080 MP4 |
| 9:16 · 1080p | 1080×1920 | native | 1080×1920 MP4 |
| 1:1 · 1080p | 1080×1080 | native | 1080×1080 MP4 |
| any · 720p | same | `{landscape,portrait,square}-720p` (task 1 checks it; fallback is an ffmpeg `scale` pass, `-vf scale=-2:720:flags=lanczos`) | 1280×720 / 720×1280 / 720×720 |

4K (MP4 only, up to 60 s, producer presets `{landscape,portrait,square}-4k`, DPR 2) and transparent WebM (`format: 'webm'`, `background: 'transparent'`, native size, VP9 alpha + Opus) are "Later" (review F7). The modal shows both as disabled "Soon" cards.

Every format is a re-layout, never a crop: components lay themselves out per format. The modal's format choice compiles that format; the project keeps its own.

## 15. Failure handling

| Code | When | Modal copy | Refund |
|---|---|---|---|
| `insufficient-credits` (API) | balance < cost | "Not enough credits. Small edits stay free." (inline, R1.9) | nothing charged |
| `cost-changed` (API) | server cost ≠ shown | the cost updates, and "Prices just changed. Check the new cost." | nothing charged |
| `render-active` (API) | an active render exists | the modal switches to that render's progress | nothing charged |
| `daily-limit` (API) | 10 renders today | "That's today's exports. More tomorrow." | nothing charged |
| `disabled` (API) | flag or kill switch | "Exports are paused for a moment. Try again soon." | nothing charged |
| `start-failed` | launch failed | "Pip couldn't start the render. Your credits are back." | yes |
| `stalled`, `timeout` | sweep or `maxRenderMs` | "That render took too long. Your credits are back." | yes |
| `input-missing` | snapshot or voice unreadable | "Pip lost the voiceover on the way. Your credits are back." | yes |
| `compile-failed`, `slot-failed` | compile or slot error | "One graphic wouldn't render. Your credits are back." plus "Check slots" (closes and selects the first failed slot, if known) | yes |
| `render-failed`, `upload-failed`, `internal` | producer or Storage | "Pip dropped a frame. Your credits are back." | yes |

Offline (`navigator.onLine` false) disables the button with "Needs connection" (R1.12). An active render keeps going in the cloud; the modal reconnects through `onSnapshot` when the connection returns.

## 16. Cost (target ≈ $0)

- **Cloud Run job.** It runs only while a render runs, with nothing idle (instance-based billing for jobs, verified). Sizing: 4 vCPU, 8 GiB, 1 task, `maxRetries 0`, `taskTimeout 20m`, region us-central1. Estimate, from memory and **not verified**: about $0.000018 per vCPU-second and $0.000002 per GiB-second. A 60 s run is then 240 vCPU-s + 480 GiB-s ≈ **$0.005 per 18 s export**, probably inside the monthly free allowance. Task 22 replaces these numbers with the pricing page and a measured run.
- **Artifact Registry.** One image of about 1.5 GB (Chrome + ffmpeg + Node), roughly $0.10 a month above the free 0.5 GB. Only the last 2 images are kept (cleanup policy).
- **Cloud Build.** About 10 build minutes per deploy, within the free build minutes (unverified).
- **Storage.** About 5–10 MB per 18 s 1080p MP4. Snapshots are deleted after each render. Egress for downloads is small at judging volume.
- **Firestore.** About 60 writes per render (progress, heartbeats, transitions), far inside the free tier.
- **Guards.** One active render per user, 10 per day, `exportsEnabled`, the global `killSwitch`, the existing GCP budget alerts and the 20-minute task timeout. A runaway render can cost at most about 20 min × 4 vCPU ≈ $0.09.

## 17. Deploy and operations (tasks 6a, 20 and 22; deploying needs the founder's approval)

**Cloud walking skeleton first (review F2).** The cloud path carries most of the risk, so it is exercised right after the job core (task 6a), not after the whole UI. Task 6a writes the Dockerfile and `cloudbuild.yaml`, and, **only after the founder approves**, deploys the job with a command that runs the existing `scripts/skeleton.ts` flow, runs one execution by hand, and then calls `jobs:run` with the `RENDER_ID` override from the web service account. That meets the unverified items early: Chrome in the job image, the Admin credential's token for `run.googleapis.com` (the same check as task 11), IAM `signBlob` for signed URLs, the conditional Storage grant, and the first cold-start timing. Until the founder approves, everything runs locally (`offline` and `emulator` modes) and tasks 6a and 22 stay unchecked.

- **`services/render/Dockerfile`** (multi-stage):
  - Base: `node:24-bookworm-slim`, with `apt-get install ffmpeg` plus Chrome's shared libraries.
  - Build: `pnpm install --frozen-lockfile --filter @motionpop/render...`, then `pnpm --filter @motionpop/motion build:runtime`. Puppeteer's headless Chrome is baked in at build time (`PUPPETEER_CACHE_DIR=/app/.cache/puppeteer`).
  - Runtime: a non-root user and `CMD ["node", "--import", "tsx", "services/render/src/job.ts"]`, or a bundled build if tsx at run time proves slow (task 6a decides).
  - The HyperFrames repository's own Cloud Run Dockerfile (Apache-2.0) is the reference for the Chrome libraries. It is read in task 6a; nothing is copied without attribution in `docs/third-party.md`.
- **`services/render/cloudbuild.yaml`** builds from the repository root, pushes `us-central1-docker.pkg.dev/motionpop-48409/motionpop/render:$SHORT_SHA`, then runs `gcloud run jobs deploy motionpop-render --image … --region us-central1 --tasks 1 --max-retries 0 --task-timeout 20m --cpu 4 --memory 8Gi --service-account render-job@motionpop-48409.iam.gserviceaccount.com`.
- **IAM** (least privilege, R8.3):
  - `render-job@` gets `roles/datastore.user` and `roles/storage.objectUser` on the default bucket, with an IAM condition `resource.name.startsWith("projects/_/buckets/<bucket>/objects/users/")`. It holds nothing else.
  - The App Hosting backend's service account gets a custom role `motionpopRenderLauncher` (`run.jobs.run`, `run.jobs.runWithOverrides`, `run.executions.get`) on the `motionpop-render` job only. It also needs `roles/iam.serviceAccountTokenCreator` on itself, so `getSignedUrl` can sign through IAM `signBlob`.
  - Task 6a checks whether `roles/run.invoker` already covers the run-with-overrides permission and uses the smaller grant.
- **App Hosting.** `apps/web/apphosting.yaml` sets `RENDER_JOB=motionpop-render` and `RENDER_REGION=us-central1` (not secrets).
  - The web build depends on `@motionpop/motion#build:runtime` (turbo).
  - `next.config.ts` `outputFileTracingIncludes` adds `../../packages/motion/dist/**` for `/api/composition/assets`, so the hosted preview and the modal's still have their runtime (R9.4).
- **Rollback.** `gcloud run jobs update --image <previous>`. The web app and the job agree only on `RenderDocSchema` (`schemaVersion: 1`), so either can roll back alone.

## 18. Testing approach (`testing.md`)

| Layer | What | Where |
|---|---|---|
| Unit (Vitest) | `exportCost`, `renderIdFor` and `newShareId` (22 base64url characters, unique over many draws, F15), `renderPaths`, `sanitizeFilename`, `canTransition`, `outputResolutionFor`, `exportAvailability`, `lookFor`, `DailyLimitsSchema` parsing a doc written by either path (F1), progress mapping and throttle, `decideExport`, `decideFail`, `isStalled`, `renderMode`, launcher request shape (fetch mocked), route handlers with fakes, the share page (not-found state and `noindex` metadata, F6), the `./store` import check (no producer import) | `packages/schemas`, `services/render`, `apps/web/lib/renders` |
| Property (fast-check) | §19 P1–P9 and P11 (P10 is checked by the integration render) | same; P1–P3 and P5 also on the emulator |
| Job core | `runRender` with `MemoryRenderStore`, `FsBlobStore`, and a fake preflight and producer that can fail at any step, including a doc whose `voicePath` or `inputPath` points at another user's object, and a voice that `ffprobe` rejects (F8) | `services/render/src/run-render.test.ts` |
| Preflight | a composition with one slot whose params make `build` throw: the preflight returns its error; a good composition returns none | `services/render/src/preflight.integration.test.ts` (needs Chrome; runs in the CI `render` job) |
| Integration render | a real producer render of a 2 s, 2-slot fixture in 16:9, 9:16 and 1:1 at 1080p (and 720p): probe frames, size, duration; the voice beep lands within 1 frame (P10) | `services/render/src/render.integration.test.ts`, skipped when ffmpeg is missing locally, always run in CI |
| Emulator | `startExport`, `failRender` and `sweepIfStalled` against the Firestore emulator: idempotency, concurrent requests, refunds | `apps/web/rules/export-tx.emulator.test.ts` (next to `plan-allowance.emulator.test.ts`; the existing rules job runs it) |
| Rules | renders, shares, ledger, limits, Storage render paths and the voice path | `apps/web/rules/*.rules.test.ts` |
| Parity | the existing script, plus cases built through `projectCompileInput` from an `EditorProject` fixture in 16:9, 9:16 and 1:1 | `services/render/scripts/parity.ts` |
| E2E (Playwright, offline mode) | `/editor/demo` → Export → modal matches (format and resolution picks, cost hidden, "Local render · free") → Export video → progress → ready modal → Download → the file is an MP4 with the right duration and size (ffprobe) | `apps/web/e2e/export.spec.ts` |
| E2E (Playwright, emulator mode, review F6) | sign in against the Auth emulator → Export → the balance drops by the cost shown → progress → ready → Download (streamed) → Copy share link → open `/share/{id}` in a fresh context and see the video; a forced failure shows the error state and the balance comes back. Runs in the CI `rules` job, which already has the emulators, with the real job entry point as a child process | `apps/web/e2e/export-emulator.spec.ts` |
| Accessibility (component tests) | the export modal traps focus, closes on Esc and returns focus to the button, option cards are radio groups with arrow-key navigation, toggles are switches with accessible names, disabled "Soon" controls explain themselves, and reduced motion removes the springs and confetti (F18) | `apps/web/components/export/*.test.tsx` |
| Design check | screenshots at 1440×900 of the export, progress, ready and error states via Chrome DevTools MCP, compared side by side with `design/screens/export.png` and `export-ready.png` | task 18, results in KIRO_LOG |
| CI | new `render` job: ffmpeg, `build:runtime`, `@motionpop/render` tests (integration included), parity, offline export e2e; the `rules` job picks up the new emulator and rules tests and runs the emulator-mode export e2e | `.github/workflows/ci.yml` |
| Cloud skeleton (manual, approved) | task 6a: deploy the job, one execution by hand, one `jobs:run` with the `RENDER_ID` override from the web service account | task 6a, DEV_LOG / KIRO_LOG |
| Cloud smoke (manual, approved) | one export per format at 1080p and one at 720p: timings, size, cost | task 22, DEV_LOG / KIRO_LOG |

## 19. Correctness properties

1. **P1 Credits never go negative.** For any random sequence of concurrent `startExport`, `failRender`, `sweepIfStalled` and job completions over several users, every user's balance is ≥ 0 at every observed point (`data-model.md` invariant; `testing.md` "credits").
2. **P2 Charged once, refunded at most once.** For any number of concurrent identical requests (same uid and request id), exactly one render and one `export-` ledger entry exist. For any interleaving of failure paths, there is at most one `refund-` entry, and it exists if and only if the final status is `error` and the cost was above 0.
3. **P3 Ledger consistency.** After any sequence, `users/{uid}.credits` equals the sum of the user's ledger deltas, and every ledger `balanceAfter` equals the running sum at that entry.
4. **P4 State machine.** Over random event sequences, only the transitions in §6 happen. `done` and `error` are absorbing. Progress never decreases. `done` implies progress 100 and `outputPath` set; `error` implies an error code; `queued` implies progress 0.
5. **P5 Never more than shown.** For any request, the charged cost equals `expectedCost`, or the request is rejected with `cost-changed` and nothing is charged.
6. **P6 Cost function.** `exportCost` is ≥ 1 × base, monotonic in resolution (720p < 1080p) and in duration, constant within a started minute, and equals the table value for videos up to 60 s (an 18 s 1080p export costs 5, D-014).
7. **P7 Paths and names.** For any ids that pass the id regex, every path from `renderPaths` starts with `users/{uid}/projects/{pid}/renders/{rid}/` and contains no `..` or `//`. Ids that fail the regex throw. `sanitizeFilename` always returns 1–80 characters plus the extension, with no path separators, reserved characters or control characters, and is idempotent.
8. **P8 Progress throttle.** For any sequence of producer callbacks over a simulated duration T, the number of progress writes is at most `ceil(T / 1 s) + number of status changes + 1`, the written progress is non-decreasing, and the last write equals the final status and progress.
9. **P9 Preview–render input parity.** For any valid project and format, `projectCompileInput(p, { mode: 'render' })` and the preview input have the same slots with the same ids, times, params, words, stress, pauses and energy. They differ only in `mode`, `voiceSrc` and `background`. The style id is the project's: for any `styleId` that `looks` or `stylePacks` knows, `lookFor(styleId).id === styleId`, both inputs resolve the same look through `lookFor`, and an unknown id falls back to `editorialExplainer` in both (review F4).
10. **P10 Frame and sync accuracy** (integration, not random). The output has `msToFrame(durationMs) ± 1` frames at the chosen size, and a beep at t in the voice appears at t ± 1 frame in the muxed audio.
11. **P11 Mode safety.** With `NODE_ENV=production`, `renderMode()` is `cloud` whatever the other variables say, and the offline routes answer 404.

## 20. Edge cases

- **The creator edits during a render.** The snapshot is frozen, so the file matches the click. The ready modal's file card shows the render's title and duration, not the live project's.
- **Reload or a second tab during a render.** `useActiveRender` finds it and shows its progress. Starting another render answers `render-active` with that id.
- **The project is renamed to an empty or emoji-only title.** `sanitizeFilename` gives "motionpop video.mp4", or keeps the emoji (they are not reserved characters).
- **No renderable slots.** R1.8 blocks the export ("Add a graphic first."), because a voice over a blank frame is not a Motionpop video. The route enforces the same rule (`nothing-to-render`).
- **A slot's component doesn't support the chosen format.** It is left out and counted in the note. Scenes support every format.
- **A voice longer than `durationMs`.** The composition ends at `durationMs`, so the producer cuts the audio there. A shorter voice gives silence at the end, which is valid.
- **The same voice re-uploaded.** The hash name skips the upload.
- **The balance changes while the modal is open** (another tab spends). `useCreditBalance` updates the row live; the server check is still the authority.
- **The job runs twice for one render** (manual re-run). The second execution sees a status other than `queued` and exits `skipped` without touching the doc.
- **The sweep marks a slow but live job as stalled.** The job's next write finds `error`, aborts, deletes its outputs and exits. The creator has the refund and can try again. This is rare by construction: the heartbeat runs every 10 s against a 90 s limit.
- **Remote Config cost changes between modal open and click.** `cost-changed` (P5).
- **The Storage emulator and signed URLs.** In emulator mode the download is streamed instead (§3 step 6).
- **A client sends `captions` or `music` true, or a resolution that isn't offered.** The route rejects it as `invalid` (the schema only allows 720p and 1080p, and the toggles stay off until spec 12). The 4K-over-60-s rule of the first draft is gone with 4K (review F11).
- **A replayed request never relaunches the job** (review F16). If the web process dies after the transaction but before the launch, the retry returns `existing` and stops. The render is then swept as `stalled` after 5 minutes and refunded, and the creator tries again with a new request id. This is a decision: relaunching on replay would risk two executions for one render, and the cost of the rare crash is a 5-minute wait.

## 21. Decisions (proposed D-034; enter `docs/decisions.md` on approval)

1. **Cloud Run job, not a service.** Each render is one job execution started through the Admin API with `RENDER_ID` as the only override.
   - The job has no public HTTP endpoint to protect, no request that must stay open for minutes, and nothing idling: jobs bill only while they run.
   - Rejected: a Cloud Run service. It needs an authenticated endpoint and either a long-held request or instance-based billing after the response.
   - Rejected: Cloud Tasks plus a service (one more product).
   - Rejected: `@hyperframes/gcp-cloud-run` (Workflows and Terraform, made for long videos).
2. **The client sends a snapshot; the server compiles.** Projects live in IndexedDB today (spec 04 `idb-repository`; the Firestore repository isn't built), so the server can't read them. The route re-validates the snapshot with `EditorProjectSchema` and the job compiles it. Client HTML is never rendered (R8.2). When projects move to Firestore, the route can read the project instead and the job is unchanged.
3. **One shared compile input.** `projectCompileInput` and the registry move from `apps/web` to `packages/motion`, so the preview and the render cannot drift (P9). The web app keeps re-exports, so imports don't change. The project's look resolves in one place, `lookFor(styleId)` (`looks`, then `stylePacks`, then `editorialExplainer`), used by both the preview and the render input (review F4). The editor can set `styleId` through the `setStyle` command but has no look picker yet (the Styles panel is spec 14), so renders match the preview for whatever `styleId` the project holds.
4. **Charge before, refund on failure, in transactions with fixed ledger ids** (`export-{rid}`, `refund-{rid}`). Render ids come from a hash of the uid and the request id, which makes a double click free.
5. **No retries in Cloud Run** (`maxRetries 0`). "Try again" is the creator's call, with a new request id. A stalled render is detected lazily by heartbeat (on the next export, or when the client asks after 45 s). No scheduler is needed.
6. **Three render modes.** `offline` (no Firebase; in-process; for development and the e2e test), `emulator` (the full credits path locally, with the job in a child process), and `cloud`. Production refuses the first two.
7. **Scope for Nov 30.** MP4 at 720p and 1080p in all three formats. 4K and transparent WebM are not built (review F7, Claude Code's decision): their cards and toggle are shown disabled with "Soon", and the implementation, flags and tasks are in "Later". Captions and music toggles are shown as designed but disabled with "Soon" until spec 12.
8. **The format chosen in the modal is for this export only.** The project's format pills stay as they are.
9. **An export needs at least one rendered slot.**
10. **Share link: a minimal share page now**, polished in spec 16. Shares are server-read and `noindex`, with 1 h signed URLs and no revocation yet.
11. **The live credit balance is pulled forward from spec 13** (chip and modal), so the numbers on screen agree.
12. **Daily render counter:** 10 per user per UTC day (Remote Config). Failed renders still count.
13. **Thumbnails:** the export modal uses a paused player (live, exact). The ready modal uses the render's `thumb.jpg`. Neither shows editor chrome (a deviation from the PNG thumbnail, explained in §13.1).
14. **Render progress is violet** (the progress bar, the top-bar button's render state, the Retry toast action), as on the dashboard's "Rendering 64%" chip. Ember stays for the primary buttons and the cost.
15. **The cost line stays ember**, as in `export.png`. `hybrid-ai.md` says credited cloud actions use the violet `☁ N` chip; the design PNG wins (D-014) and an export is not an AI call (review F10). D-034 says so, so the next review doesn't flag it.
16. **Image slots are left out of renders** until spec 07 defines asset storage (review F5, option a). R1.10 is removed for now.
17. **A cloud walking skeleton right after the job core** (task 6a, **[approval]**), so the cloud risk is met early instead of in task 22 (review F2).
18. **The job distrusts its own inputs** (review F8): it re-validates `inputPath` and `voicePath` against the owner's paths, and re-encodes the voice to WAV after `ffprobe` before ffmpeg and Chrome see it.
19. **Export credits don't count toward `dailyBudgetCredits`**, the global AI-spend budget (review F14). `killSwitch` and `exportsEnabled` still pause exports.
20. **The preflight seeks with `window.__motionpop.seek(ms)`** (review F9), not the HyperFrames player object.
21. **`renderIdFor` and `newShareId` live in `services/render/src/store/ids.ts`**, not in `packages/schemas`, because they need Node `crypto` and the schemas package is bundled for the browser (found while applying review F15).

## 22. Founder defaults (applied 2026-11-16; the founder can overturn them)

These were open questions in the first draft. Claude Code answered them for the overnight run.

1. **4K and transparent WebM:** off. Not implemented now; the disabled "Soon" cards stay (R1.5, R1.6). They are in "Later" and the plan's §2.4 keeps transparent export for Kiroween polish.
2. **Captions and music toggles:** shown off and disabled with a "Soon" pill until spec 12 (R1.7).
3. **Limits:** 3 minutes per video and 10 renders per user per UTC day. The judge plan has 500 credits, enough for about 100 1080p exports of 18 s.
4. **Share page:** a minimal page now (R5.4), polished in spec 16.
5. **Approvals that cost money or touch production:** creating the Artifact Registry repository, the service account and the job; the first Cloud Build; the IAM grants on the App Hosting service account; the cloud skeleton (task 6a) and the smoke test (task 22), estimated well under $1 in total. Both tasks need the founder's go-ahead; until then everything runs locally.

## 23. Steering updates to make on approval (not done in this run)

- **`data-model.md`:**
  - `RenderJob` becomes the `RenderDoc` above (new fields `schemaVersion`, `requestId`, `title`, `durationMs`, `slotCount`, `mode`, `inputPath`, `voicePath`, `thumbPath`, `sizeBytes`, `executionName`, `errorMessage`, `shareId`, `startedAt`, `heartbeatAt`; `error` becomes the code enum).
  - `shares/{id}` gets `schemaVersion`.
  - `limits/{day}` gets `renders`, and `planCloud` defaults to 0 (review F1).
  - The Storage list gets `…/renders/{rid}/{input/project.json, video.*, thumb.jpg}` and `users/{uid}/audio/{pid}/voice-*`.
- **`ai-tasks.md` cost table:** export is the base cost per started minute (720p 3, 1080p 5); the 4K row stays for "Later" and is limited to 60 s when it lands.
- **`architecture.md` flow 6:** a Cloud Run **job** (not "signed call to Cloud Run"), plus the three render modes.
- **`tech.md` Environments:** `RENDER_JOB` and `RENDER_REGION`, and the render-job service account.
- **`structure.md`:** `services/render/` holds `src/job.ts` (a job entry), `src/run-render.ts` and `src/store/`, in place of the planned `src/server.ts` and `src/render.ts`, because the render runs as a Cloud Run job, not a service.
- **`screens.md`:** the not-designed progress and error states, the render state of the top-bar Export button, the "Soon" pill, and the thumbnail deviation.

## 24. Self-review against steering (same run, 2026-11-16)

I read the first draft against each steering file as a strict reviewer. These gaps were found and fixed before the commit:

- **`architecture.md` failure table** ("toast with Retry"). The draft only covered failures with the modal open. R6.2 and §13.2 now add an error toast with Retry for a closed modal.
- **`design-system.md` colour discipline.** The draft's progress bar was ember. Render progress is now violet, matching the dashboard's "Rendering 64%" chip (decision 14).
- **Orphan files.** The draft wrote the snapshot before the credits transaction, so a rejected request left a file in Storage. The snapshot is now written after the transaction and before the launch (§3).
- **R3.4 had no mechanism.** The producer doesn't read `__motionpop.errors`. A preflight in our own code now reads them (§8).
- **Producer dependency in the web app.** Sharing the credit transaction through `@motionpop/render` could have pulled the producer into Next. The shared code is now the `./store` subpath, with a test on its imports (§4).
- **Download filenames.** Non-ASCII titles and header injection: the job now writes an RFC 6266/5987 content disposition (§8 step 7).
- **`handoff.md` §9.**
  - Added the `spec-reviewer` pass before implementation (task 0).
  - Added the Firebase MCP note for emulator work (task 10).
  - Added an IDE hook for `services/render` (task 21).
  - Noted that the builder agent can't write `.github/` or `.kiro/hooks/`, so those tasks run from the IDE.
- **`testing.md`.** Added the regression-test rule for property-test bugs to the tasks header.
- **Playwright in CI.** No CI job runs Playwright today. The new `render` job installs the browser (task 21).
- **`structure.md`.** The draft didn't flag that `services/render` becomes a job. It is now in the steering updates (§23).

Still unverified (and owned by a task):
- the 720p downscale on 0.9.46 (task 1);
- the Admin credential token for the Cloud Run Admin API (task 11);
- the Cloud Run job prices and free tier, and the smallest IAM role (task 22).

## 25. Review applied (2026-11-16, headless run, claude-sonnet-5.5)

Every finding of `REVIEW.md` is applied. Where each one landed:

| Finding | Applied in |
|---|---|
| F1 `planCloud` default | §5 (DailyLimitsSchema changes), §7.1, §18, task 2 |
| F2 early cloud skeleton | §17 (first paragraph), §18, §21 decision 17, new task 6a, task 22 and the cut order in `tasks.md` |
| F3 root files are IDE work | tasks 8, 13, 22 |
| F4 one `lookFor` | §4, §21 decision 3, P9 (§19), task 4 |
| F5 image slots left out | R1.8, R1.10, scope in `requirements.md`; §8 step 3; §21 decision 16; "Later" |
| F6 emulator-mode e2e and share page tests | §18, tasks 17, 19 and 21 |
| F7 4K and WebM to Later | `requirements.md` R1.5, R1.6, R3.3; §5, §8, §14, §20, §21 decision 7; tasks 25 and 26 moved to "Later" |
| F8 job distrusts its inputs | R3.9, R8.3; §8 step 2; §18; tasks 6 and 7 |
| F9 preflight uses `__motionpop.seek` | §8 step 4, §21 decision 20 |
| F10 ember cost line | R1.4, §21 decision 15 |
| F11 4K over 60 s | moot with F7 (§20) |
| F12 export `IntMsSchema` | §4, §5, task 2 |
| F13 `msToFrame` | §5, §8 step 5, P10, tasks 6 and 9 |
| F14 global budget | R2.8, §21 decision 19 |
| F15 share id test, R9.1 check | R8.5, R9.1, §5, §18, tasks 2, 8 and 6a/22 |
| F16 replay never relaunches | §20 |
| F17 pseudo-code slip, bad id | §7.2, §3 step 3.2 |
| F18 accessibility test | R1.13, §18, task 15 |

One addition beyond the findings: `renderIdFor` and `newShareId` move to `services/render/src/store/ids.ts` (§21 decision 21), because they need Node `crypto` and `packages/schemas` is bundled for the browser.

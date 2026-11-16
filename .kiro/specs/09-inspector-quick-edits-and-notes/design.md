# Design: 09 inspector, quick edits and frame notes

Written headlessly by Kiro CLI (`motionpop-builder`, Opus 5.5), 2026-11-16. Revised the same day (headless run, claude-sonnet-5.5) to apply every finding of `REVIEW.md`; the mapping is in its "Resolved" section. Decisions made without the founder are listed in "Decisions" at the end, each with its reason, so they can be overturned in one place. Decision ids are the final `docs/decisions.md` ids (D-035 to D-049), with the draft label `D-09-N` kept beside each so the text above still reads.

## Overview

The inspector becomes the place where the hybrid story is visible on one slot:

| Action | Task | Route (default) | Cost | Where it lands |
|---|---|---|---|---|
| Content field edit | none (code) | local | 0 | version `user` |
| Ease, Fade, duration | none (code) | local | 0 | slot `timing`, ResizeSlot |
| Prompt pre-fill | `prompt.prefill` | device, else a template | 0 | `slot.prompt` |
| Quick edit | `edit.patch` | device; cloud only by a click | 0 / ☁ 1 | version `ai-device` / `ai-cloud` |
| Frame note | `note.fix` (text + JPEG crop) | device; cloud only by a click | 0 / ☁ 1 | version + note `fixed` |
| Generate | `component.fill` purpose `generate` | ONLY_IN_CLOUD | ☁ 3 | version `ai-cloud` |
| Use a template | none (code) | local | 0 | version `default` |

One pure function, `chooseRoute`, decides the route of every AI action from availability, connection, preference, kill switch and balance. The chip on screen and the router call both read its answer, which is how "a mint chip never costs credits" is enforced and property-tested.

```
              ┌──────────── useAIStatus (availability, online, setup progress) ───────────┐
              │                                                                           │
Inspector ── chooseRoute(task, status, prefs, killSwitch, balance) ──► chip (before click) │
   │                         │                                                            │
   │ click                   ▼                                                            │
   ├─ quick edit ──► editDoc(slot) ─► router.run(editPatch, {mode, allowCloud:false}) ────┤
   ├─ note ────────► captureRegion + regionText ─► router.run(noteFix, …) ────────────────┤
   └─ Generate ────► credits.spend('generate') ─► router.run(componentFill, ONLY_IN_CLOUD)│
                         │                                    │                           │
                    refund on failure            check: schema (+ gates for scenes)       │
                                                              ▼                           │
                                   applyVersion command (params + timing + version, 1 undo)
                                                              ▼
                                   store → autosave (ProjectRepository) → preview recompile
```

## What changes where

| Area | File | New / changed |
|---|---|---|
| Schemas | `packages/schemas/src/project.ts` | `SlotTimingSchema`, `Slot.timing?`, `Version.timing?`, `FrameNote.fixedVersionId?`, circle shape doc (no refine on the shape), `VERSIONS_PER_SLOT = 20` |
| Fixture | `apps/web/lib/projects/fixture.ts` | the demo note's `tMs` becomes slot-relative (5600 → 1400) |
| Router | `packages/ai/src/router.ts` | `run(…, { mode, allowCloud })`; `UsageEvent.cloudCost` |
| Tasks | `packages/ai/src/tasks/edit-patch.ts`, `prompts/edit-patch.v2.ts` | path enum, field guide, gate option; no schema text |
| Tasks | `packages/ai/src/tasks/note-fix.ts`, `prompts/note-fix.v1.ts` | new |
| Tasks | `packages/ai/src/tasks/prompt-prefill.ts`, `prompts/prompt-prefill.v1.ts` | new |
| Edit doc | `packages/ai/src/edit/edit-doc.ts` | `editDoc`, `splitEditDoc`, `editablePaths`, `fieldGuide` (pure, shared by both tasks) |
| Motion | `packages/motion/src/compiler/types.ts`, `runtime/`, `engine/stage.ts` | `CompileSlot.timing`; `withTiming(style, timing)`; stage `exit: 'none'` |
| App AI | `apps/web/lib/ai/route.ts`, `availability.ts`, `ai-status.ts`, `fake-router.ts` | new |
| Credits seam | `apps/web/lib/credits/client.ts`, `local-credits.ts`, `use-credits-client.ts` | `CreditsClient` interface, local implementation, the hook that picks one (spec 13 adds `ServerCredits`); `CreditAction` is imported from `@motionpop/schemas` (spec 13 task 1), not written here |
| Credits UI | `apps/web/components/editor/top-bar.tsx`, `apps/web/components/credits/out-of-credits-modal.tsx` (stub) | the chip reads the credits client; a stub modal that spec 13 task 9 replaces (task 11b) |
| Commands | `apps/web/lib/commands/versions.ts`, `notes.ts`, `timing.ts` | new commands |
| Generate | `apps/web/lib/slots/generate.ts`, `scene-fill.ts`, `component-fill-input.ts` | the flow, testable with fakes; `sceneFillInput` takes a `purpose` and the component input moves out of `use-auto-fill.ts` into one shared builder, so Generate and auto-fill share it |
| Content form | `apps/web/lib/inspector/content-form.ts` | schema → form model (pure) |
| Notes | `apps/web/lib/notes/geometry.ts`, `capture.ts`, `region-text.ts` | pure geometry; frame capture (spike) |
| UI | `apps/web/components/inspector/*` | sections split out of `components/editor/inspector.tsx` |
| UI | `apps/web/components/editor/generating-panel.tsx`, `frame-notes.tsx`, `offline-banner.tsx`, `preview-badge.tsx` | new |

`components/editor/inspector.tsx` keeps the shell and its animation; the sections move to `components/inspector/` (structure.md lists that folder).

## Schemas (zod, `packages/schemas`)

```ts
/** Per-slot timing overrides (component-library.md "timing", stored on the slot, not in params). */
export const SlotTimingSchema = z.object({
  speed: z.number().min(0.5).max(2).optional()
    .describe('Speed of entrances and exits. 0.8 = slower, 1.25 = faster. Landings stay on the spoken word'),
  ease: z.enum(['inOut', 'out', 'linear']).optional().describe("Main ease (inspector 'Ease in-out')"),
  fade: z.boolean().optional().describe("false = hold the last frame and cut at the end (inspector 'Fade')"),
});
export type SlotTiming = z.infer<typeof SlotTimingSchema>;

// SlotSchema gains:  timing: SlotTimingSchema.optional()
// Unset keys mean "the look's default"; an empty object is never stored (commands delete it).

// FrameNoteSchema gains: fixedVersionId: z.string().min(1).optional()
// Shape semantics (documented in the schema, no type change, so the demo fixture still parses):
//   kind 'circle': points = [cx, cy, rx, ry] in 0..1 of the frame; a 3-value [cx, cy, r] means rx = ry = r.
//   kind 'path':   points = [x1, y1, x2, y2, …] in 0..1, at most 64 points.
// The lengths (3 or 4 for circles; even and 4..128 for paths) and the 0..1 range are checked by the note
// commands (`addNote`, `updateNote`), not by a refine: `project.ts` documents that limits are enforced by
// commands so loading a saved project never fails because of a limit (review F11).

export const VERSIONS_PER_SLOT = 20;
```

`Version` gains one optional field, `timing: SlotTimingSchema.optional()` (D-09-4), so a restore brings back the feel too. `label` holds the instruction, the note text, "Generated", "Edited {field}" or "Template". `source` reuses the existing enum.

### The edit document

Quick edits and notes patch one JSON document per slot, so `/timing/*` paths work as `ai-tasks.md` §4 says without putting timing into scene scores:

```ts
// packages/ai/src/edit/edit-doc.ts (pure)
export type EditDoc = Record<string, unknown> & { timing: Required<SlotTiming> };

export function editDoc(params: Record<string, unknown>, timing: SlotTiming | undefined,
                        defaults: Required<SlotTiming>): EditDoc;
/** Inverse: params without `timing`, and only the timing keys that differ from the defaults. */
export function splitEditDoc(doc: EditDoc, defaults: Required<SlotTiming>):
  { params: Record<string, unknown>; timing: SlotTiming | undefined };
/** Editable JSON pointers, most useful first, at most 40 (enum limit). */
export function editablePaths(schema: z.ZodType, params: Record<string, unknown>): string[];
/** One line per editable path from `.describe()`: "/content/value: number. The number, exactly as spoken". */
export function fieldGuide(schema: z.ZodType, paths: readonly string[]): string;
```

- `defaults` come from the look: `speed 1`, `ease` from the look's `moveEase` (`inOut*` → `inOut`, `out*` → `out`, `linear` → `linear`), `fade true`.
- `editablePaths` order: `/content/*` leaves (scenes) or top-level leaves (components), including optional fields not yet present (so `add` works); array items of `{ label, value }` by index; `/variant` for scenes; then `/timing/speed`, `/timing/ease`, `/timing/fade`. It never lists `/beats…` or `/images…`: beats are anchors that code owns (spec 07 D-032), and images are assets (spec 07 tasks 25–26).
- A test asserts that no component or scene schema has a top-level `timing` key, so the merge can't collide.

## Router change (`packages/ai/src/router.ts`)

```ts
run<I, O>(task: TaskDef<I, O>, input: I,
          opts?: { mode?: InferenceMode; allowCloud?: boolean }): Promise<RunResult<O>>;
```

- `allowCloud: false` turns off the task's `cloudFallback` for this call. The app always passes it for device-routed edits and notes (D-09-1). Default: the task's own `cloudFallback`, so existing callers are unchanged.
- `UsageEvent` gains `cloudCost: number`: `task.cloudCost(input)` on every event, including device runs and failures. Spec 13 sums it into "credits saved". Existing listeners ignore the extra field.

## Tasks (`packages/ai/src/tasks`)

### `edit.patch` v2

```ts
export const EditPatchInputSchema = z.object({
  componentId: z.string().min(1),
  /** One line per editable path (fieldGuide). Replaces paramsSchemaSummary. */
  fieldGuide: z.string().max(2500),
  paths: z.array(z.string().regex(/^\/[A-Za-z0-9_\-/]*$/)).min(1).max(40),
  current: z.record(z.string(), z.unknown()),          // the EditDoc
  instruction: z.string().trim().min(1).max(500),
});
// Output: unchanged shape { patch: JsonPatchOp[] (max 8 for v2), escalate?, message? }
// jsonSchema(input): the output schema with op ∈ {replace, add, remove} and path ∈ input.paths (enums).
export function editPatchTask(
  schemaFor: (componentId: string) => z.ZodType | undefined,
  opts?: { gate?: (componentId: string, params: unknown) => string | null; timingDefaults?: Required<SlotTiming> },
): TaskDef<EditPatchInput, EditPatchOutput>;
```

- Mode `PREFER_ON_DEVICE` by default (routing table), but the app always passes the mode from `chooseRoute` (ONLY_ON_DEVICE or ONLY_IN_CLOUD). Cloud cost 1. `thinking: 'MINIMAL'`.
- **Check:** every op's path is in `input.paths` (or is an array index under a listed array) → apply to a copy (`applyParamsPatch`) → `splitEditDoc` → `SlotTimingSchema` parse → component/scene schema parse → for scenes, `opts.gate`. The first failure's message is the repair text (1 repair, router default).
- **Prompt v2** (`prompts/edit-patch.v2.ts`): the system text of v1 without the schema line, plus two examples; the user text is `component`, the field guide, `current` as compact JSON and the instruction. No JSON Schema text anywhere (removes the `edit.patch` entry from `KNOWN_VIOLATIONS` in `schema-rules.test.ts`). v1 stays exported for the dev skeleton page until it is updated in the same task.

### `note.fix` (new, ai-tasks.md §4b)

```ts
export const NoteFixInputSchema = z.object({
  componentId: z.string().min(1),
  fieldGuide: z.string().max(2500),
  paths: z.array(z.string()).min(1).max(40),
  current: z.record(z.string(), z.unknown()),
  note: z.object({
    text: z.string().trim().min(1).max(300),
    tMs: z.number().int().nonnegative(),                     // from the slot start
    region: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1),
                       w: z.number().min(0.01).max(1), h: z.number().min(0.01).max(1) }),
  }),
  /** Texts of the graphic's elements inside the region (data-text hooks), at most 8 × 80 chars. */
  regionText: z.array(z.string().max(80)).max(8),
  /** JPEG crop of the region, base64, longest side ≤ 512 px. Absent when capture is unavailable. */
  image: z.string().max(400_000).optional(),
});
```

- Output, check, repair and cost are the same as `edit.patch` (shared helper). `media: (i) => i.image ? { mimeType: 'image/jpeg', base64: i.image } : undefined`.
- Prompt v1 explains the region ("the user circled the area at x/y/w/h of the frame; inside it you see: …"), then the note, with two hand-written examples (one colour request with an image, one "slower" request without). It works without the image: the region text names what was circled ("$140k", "2022"). The image helps with colour and shape requests ("make this bar orange").
- `schema-rules.test.ts` measures it like the others, including prompt size against the on-device limit. The image's token cost is not counted there (unknown); task 23 records a real on-device run.

### `prompt.prefill` (new, ai-tasks.md §2)

Input `{ slot: { reason, componentId, skillId }, style: { id, name } }`, output `{ prompt: string ≤ 140 }`, ONLY_ON_DEVICE, cost 0, `cloudFallback: false`. Fallback (no Nano, failure): `templatePrompt(componentName, styleName, said)` → "A {style name} {component name} for “{first 8 spoken words}”." Pure and tested.

## Route decision (`apps/web/lib/ai/route.ts`, pure)

```ts
export type Availability = 'checking' | 'available' | 'downloadable' | 'downloading' | 'unavailable';
export type RoutedTask = 'edit.patch' | 'note.fix' | 'generate' | 'prompt.prefill';

export interface RouteInput {
  task: RoutedTask;
  availability: Availability;
  online: boolean;
  preferOnDevice: boolean;      // users/{uid}.settings.preferOnDevice (spec 13); true in local mode
  killSwitch: boolean;          // Remote Config
  cloudAvailable: boolean;      // false in local mode, signed out, or while ServerCredits does not exist (see the table above)
  cloudBlockedReason?: 'Sign in to use cloud AI' | 'Cloud AI is coming soon';   // copy when cloudAvailable is false
  override?: InferenceMode;     // Remote Config routingOverrides[task], if any
  balance: number | null;       // null while loading
  cloudCost: number;            // costOf('edit' | 'generate') from @motionpop/schemas (spec 13 task 2); 1 and 3 today
  forceCloud?: boolean;         // the user clicked "Try in the cloud"
}

export type Route =
  | { kind: 'device'; mode: 'ONLY_ON_DEVICE'; allowCloud: false }
  | { kind: 'cloud'; mode: 'ONLY_IN_CLOUD'; allowCloud: false; credits: number; insufficient: boolean }
  | { kind: 'local' }                                        // deterministic code (prefill template)
  | { kind: 'disabled'; reason: 'Needs connection' | 'Cloud AI is paused' | 'Sign in to use cloud AI' | 'Cloud AI is coming soon' | 'Needs on-device AI' };

export function chooseRoute(i: RouteInput): Route;
export function chipFor(r: Route): { route: 'device' } | { route: 'cloud'; credits: number } | null;
```

Rules, in order:
1. `prompt.prefill`: `available` → device; else local. Never cloud.
2. `generate`: offline → disabled "Needs connection"; no cloud → "Sign in to use cloud AI" (or "Cloud AI is coming soon" when Firebase is configured and the user is signed in but `ServerCredits` does not exist; `RouteInput` carries `cloudBlockedReason` for the copy); kill switch → "Cloud AI is paused"; else cloud with `insufficient = balance !== null && balance < cloudCost`.
3. `edit.patch` / `note.fix`: `available` and (`preferOnDevice` or offline or no cloud) and not `forceCloud` → device. Else offline → disabled "Needs connection". Else no cloud → "Sign in to use cloud AI". Else kill switch → "Cloud AI is paused". Else cloud(1).
4. `checking` counts as not available, so the first second after load shows ☁ 1 rather than a mint chip that could turn into a charge.
5. Remote Config overrides (hybrid-ai.md "Remote Config can override"): `PREFER_IN_CLOUD` / `ONLY_IN_CLOUD` for an edit or note act like `preferOnDevice: false`; `ONLY_ON_DEVICE` forbids the cloud for that task (no device → disabled "Needs on-device AI", and no "Try in the cloud"). Overrides never make `prompt.prefill` cloud or `generate` device.

The router always receives `allowCloud: false`; escalation is a new user action with `forceCloud: true` and its own chip (D-09-1).

## Availability and connection (`apps/web/lib/ai/availability.ts`, `ai-status.ts`)

- `useAIStatus` (small Zustand store): `{ availability, setupProgress: number | null, online }`.
- **Detection:** read the Prompt API global, `LanguageModel.availability({ expectedInputs: [{ type: 'text' }, { type: 'image' }] })`. Missing global → `unavailable`. The AI Logic SDK (3.1.0, read in `@firebase/ai` `ai-public.d.ts` on 2026-11-16) does not expose availability publicly; it exposes `GenerativeModel.initializeDeviceModel(onDownloadProgress)`, which must run after a user gesture. **Re-check both against current docs with Context7 at task time** (tech.md).
- **Setup:** the "Set up on-device AI" toast action calls `initializeDeviceModel` on a model created with `ONLY_ON_DEVICE`, streams progress into a persistent toast "Setting up on-device AI · 34 %", and switches to `available` at the end with the mint toast. Never blocks, never starts without the click.
- **Connection:** `navigator.onLine` plus `online` / `offline` events. Offline shows `OfflineBanner` over the preview (glass card, `warn` dot, exact copy from screens.md).
- **Toasts:** one per session (sessionStorage key), the exact strings in R9.1.
- **Local mode** (no Firebase): availability is `unavailable` unless the fake router is on. With no Firebase there is no cloud at all, so cloud actions are disabled with the tooltip "Sign in to use cloud AI" (D-09-11). `chooseRoute` gets this as `cloudAvailable: false`, which yields `disabled` with that reason. The same input is false while `ServerCredits` is missing, with the reason "Cloud AI is coming soon" (D-09-12).

## Credits seam (`apps/web/lib/credits/client.ts`)

```ts
import type { ClientCreditAction } from '@motionpop/schemas';   // spec 13 task 1; not written here
export type SpendResult =
  | { ok: true; txId: string; balance: number }
  | { ok: false; reason: 'insufficient' | 'rate-limit' | 'paused' | 'key-used' | 'offline' | 'unavailable'; balance?: number };

export interface CreditsClient {
  balance(): number | null;
  subscribe(fn: (balance: number | null) => void): () => void;
  spend(req: { action: ClientCreditAction; units?: number; key: string; refId?: string }): Promise<SpendResult>;
  refund(txId: string): Promise<void>;
}
```

- `LocalCredits` (this spec): in memory, starts at 120 (the design's chip; demo only, resets on reload), never below 0, idempotent by `key`. It behaves like the server: the spend id is `s-{key}`, the refund id `r-{key}`, a repeated key answers the first result, and **a key whose spend was refunded answers `key-used`** (review F14, F1). Used in local mode, with the fake router, and by unit tests.
- `ServerCredits` (spec 13 task 8): `/api/credits/spend` and `/refund`, balance from a Firestore snapshot.
- **Contract test.** One `describe.each([LocalCredits, ServerCredits-with-a-fake-fetch])` file runs the same cases against both (spend, replay, insufficient, refund once, spend-refund-spend with one key never `ok: true`). Task 11 writes it with `LocalCredits`; spec 13 task 8 adds the `ServerCredits` row, with the fake fetch backed by spec 13's pure `decideSpend` / `decideRefund`.
- **`useCreditsClient()`** (`use-credits-client.ts`):

  | Situation | Client | `cloudAvailable` | Cloud actions |
  |---|---|---|---|
  | Firebase not configured (local mode) | `LocalCredits` | false | disabled "Sign in to use cloud AI" |
  | `NEXT_PUBLIC_FAKE_AI=1` (tests, dev) | `LocalCredits` | true | run against local credits and the fake router |
  | Firebase configured, signed out | none | false | disabled "Sign in to use cloud AI" |
  | Firebase configured, signed in, `ServerCredits` not built yet | none | **false** | disabled "Cloud AI is coming soon" |
  | Firebase configured, signed in, `ServerCredits` available | `ServerCredits` | true | run |

  `LocalCredits` is never used with Firebase configured outside the fake-AI flag, so a hosted build can't run real cloud calls against fake credits (review F2, D-09-12). A unit test covers this table. Task 11b ships the hook, the chip wiring and the stub modal before spec 13 task 8 swaps in `ServerCredits`.
- The top bar's `CREDITS_PLACEHOLDER` goes away in task 11b (the chip reads `useCreditsClient().balance()`); spec 13 task 8 changes the source to `useCredits`.

## Flows

### Quick edit
1. Row shows `chipFor(chooseRoute({ task: 'edit.patch', … }))`. Disabled routes disable the input with the reason as tooltip.
2. Submit → `const doc = editDoc(slot.params, slot.timing, defaults)`, `paths = editablePaths(schema, slot.params)`.
3. Cloud route: `credits.spend({ action: 'edit', key })` first, with a new key per attempt (D-047); `insufficient` → out-of-credits modal (the stub from task 11b, then spec 13's), stop.
4. `router.run(editPatchTask(schemaFor, { gate, timingDefaults }), input, { mode: route.mode, allowCloud: false })`.
5. Success: `splitEditDoc(applied)` → `exec(applyVersion(slot.id, { params, timing, version }))`; badge "Ready in X.Xs"; the row clears.
6. `escalate` → message + "Generate ☁ 3" button (runs the Generate flow). Device failure → "Couldn't do that on your device." + "Try in the cloud ☁ 1" (`forceCloud`). Cloud failure → refund, toast "Couldn't make that edit" with Retry.
7. The slot changed meanwhile (`sameSlot` false or deleted) → discard, refund if charged, toast "The graphic changed. Try again."

### Frame note
1. Pen → `drawMode` in the store, playback paused, a transparent `FrameNotesLayer` over the player captures pointer events (the iframe itself never gets them). Keyboard: with draw mode on, Enter places an ellipse around the `data-focal` element's box (+12 % padding) and opens the bubble (R1.4, R8.2).
2. Release → `fitStroke(points)` (`lib/notes/geometry.ts`): closed-ish stroke (end within 15 % of the stroke's diagonal from the start) → ellipse from the bounding box; else a path simplified to ≤ 64 points (Ramer–Douglas–Peucker). Regions smaller than 4 % of the frame grow to 4 %.
3. Bubble: numbered (per slot, creation order), placed by `bubbleAnchor` on the side with room, leader line from the shape's edge (design: violet `#A995EF` 1.5 px ellipse, bubble on glass, 1.5 px connector). Input "What should change?", Enter saves.
4. Save → `exec(addNote(slotId, note))`, then `noteFix(note)`:
   - `regionText`: inside the same-origin player iframe (D-021), elements with `data-text` whose client rects intersect the region (frame coords → iframe coords).
   - `image`: `captureRegion(region)` (task 19 decides whether it ships); failures return `undefined`, never throw.
   - Route and run exactly as the quick edit with `noteFixTask`.
5. Success → `applyVersion` + `setNoteStatus(noteId, 'fixed', versionId)` as **one** composite command. "Still there?" → `setNoteStatus(noteId, 'open')` and the bubble offers "Fix again".

### Generate (`apps/web/lib/slots/generate.ts`)
```ts
export interface GenerateDeps { store; credits: CreditsClient; getRouter; now; doc?: Document; schemaFor; sceneFor; }
export async function generateSlot(deps: GenerateDeps, slotId: string): Promise<GenerateOutcome>;
type GenerateOutcome = 'ready' | 'failed' | 'kept' | 'discarded' | 'no-credits' | 'blocked';
```
1. Route check (`generate`); blocked → no call. `insufficient` → modal, `no-credits`.
2. `credits.spend({ action: 'generate', key: randomKey(), refId: slotId })`: a **new** 32-character random key for every attempt (a click, a Retry and a "Try again" each draw their own). The only reuse is a network resend of the same attempt when no response arrived. After a refund the same key can never be spent again (spec 13 answers `key-used`), so a retry can't be a free cloud call (D-09-13). Not ok → modal or toast by reason (`key-used` takes a fresh key once).
3. `store.setGenerating({ slotId, phase: 'preparing', startedAt })` (UI only, like `autoFilling`: the stored status stays as it was, so a reload mid-generate never strands a slot).
4. Build input: scenes via `sceneFillInput` (catalogue entry, indexed words, 2 exemplars) and `sceneGate`; components via the component input. `sceneFillInput` today hard-codes `purpose: 'autofill'`, and the component input is built inline in `use-auto-fill.ts`; task 18 adds a `purpose` parameter to the first and extracts the second into `component-fill-input.ts`, so Generate and auto-fill share one builder per kind (review F9). Generate passes `purpose: 'generate'`, `prompt: slot.prompt`, `currentParams: slot.params`. Phase `animating`. `router.run(task, input, { mode: 'ONLY_IN_CLOUD' })` (2 repairs inside the price, ai-tasks §3).
5. Before applying: the slot is gone, or its `componentId`, `wordStart` or `wordEnd` changed → refund, `discarded`. Else `validateParams` → `applyVersion` (source `ai-cloud`, `model`, `costCredits: 3`, label "Generated") → `ready`.
6. Failure → refund. Slot not ready → `exec(markFailed(slotId, "Couldn't generate"))` (persisted `status: 'failed'`, `error`), outcome `failed`. Slot ready → toast with Retry, outcome `kept`.
7. `finally` → `setGenerating(null)`. One Generate per project: a second click while one runs is refused with "Pip is on it".

## Commands (`apps/web/lib/commands/`)

All are `Command`s with `do`/`undo`, pure on `EditorProject`, and keep the timeline invariants (they never change ranges).

| Command | Does | Undo |
|---|---|---|
| `applyVersion(slotId, { params, timing?, version, status? })` | sets params and timing, pushes the version, sets `currentVersionId`, status `ready` unless given, prunes to `VERSIONS_PER_SLOT` | restores the slot and the versions array exactly |
| `restoreVersion(slotId, versionId)` | params and timing from the version (D-09-4), `currentVersionId` | restores |
| `setSlotTiming(slotId, patch: Partial<SlotTiming> \| null)` | merges, deletes unset keys, removes an empty object | restores |
| `markFailed(slotId, error)` | `status: 'failed'`, `error` | restores |
| `setSlotPrompt(slotId, prompt)` | trims, max 500 chars; a no-op change is rejected so it adds no undo step | restores |
| `addNote`, `updateNote`, `deleteNote`, `setNoteStatus(noteId, status, fixedVersionId?)` | notes array | restores |
| `composite([...])` | existing | existing |

**Timing in versions:** a version must restore timing too, so `VersionSchema` gains `timing` (D-09-4, additive, optional). Restoring a version without it clears the slot's timing.

**Pruning:** drop the oldest versions of that slot that are not current until the count is ≤ 20. Pruned versions are kept inside the command for undo.

## Motion engine: timing

- `CompileSlot.timing?: SlotTiming` (compiler types), filled from `slot.timing` in `project-to-compile.ts`.
- `withTiming(style, timing)` (pure, `packages/motion/src/runtime/timing.ts`): returns a style whose `motion.enterMs` and `motion.staggerMs` are divided by `speed` (rounded to integer ms), and whose `enterEase` / `moveEase` follow `ease` (`inOut` → `inOutCubic`, `out` → `outExpo` / `outCubic`, `linear` → `linear`). Unset fields leave the look's values. The runtime builds each clip with its own `withTiming` style; the background and texture still come from the project's look.
- `fade: false` (scenes only): `stage(ctx, { exit: 'none' })` passes `exitMs: 0` to `scheduleBeats`, so `exitStartMs = durationMs` and everything that landed holds until the clip ends. `MIN_EXIT_MS` only applies when the exit is not `none`. Library components ignore `fade`; the inspector disables the toggle for them (R4.3).
- Voice sync is unchanged: cues land on their word; a slower entrance starts earlier and is compressed by the existing scheduler when the slot start leaves no room (D-031). `look.personality.stepFps` still quantises motion.
- Determinism: `withTiming` and the stage option are pure; `assertSeekPure` covers random timings.

## UI (match `editor.png`, `editor-generating.png` and the CSS frames)

Inspector at x = 1080, 360 wide, 20 px side padding (content width 320). Positions below are from the "Graphic inspector" frame in `design/figma-export.css`, relative to the inspector's top; implement with flow layout that lands on them at 1440×900 rather than absolute positioning.

| Section | CSS frame | Key measurements |
|---|---|---|
| Header | "Graphic inspector" | label 10/13 px, letter-spacing 1.1, `#8B849A`; title 17/22 semibold; time mono 11/14 |
| You said | "You said" | card r10 `bg-reason`, violet 2 px bar, label 10 px `violet-ink-2`, quote 12/16 |
| Prompt + Generate | "Graphic prompt · editable", "✦ Generate", "Cloud cost on Generate" | box h72 r10; Generate 122×26 violet-fill; chip h18 r6 white/10, mono 9 px `#BFAFFF` |
| Quick edit | "Quick edit · free on-device", "Quick edit… e.g. make it slower" | row h32 r8 card; chip h19 r10 `#16251F`, 9 px `#78DDB0` |
| CONTENT | "Content", "Title text field", "Revenue data · editable", "Revenue data row · 2020" | label at y255; title field 320×28 r8 at y275, 12/16 `#E6E3EF`; table 320×60 r8 1 px border at y311, rows 20 px, label mono, value mono right-aligned, dot 4 px (violet; ember for the focal row) |
| STYLE | "Style" row | swatch tile 30×22 r6 with three dots; name 11/14 `style-ink`; ▾ |
| TIMING | "Timing", "Duration slider *", "Ease in-out", "Fade", "Fade switch" | label y443; track 190×3 at x83; handle 10 px `#D2C8FF`; value mono 11 px at x297; ease chip 127×25 r7 card + glass shadow at y466, curve 30×16 1.5 px `#B9A9FF`, label 10 px `text-2`; "Fade" 10 px at x167; switch 27×15 r8 violet, thumb 11 px |
| VERSIONS | "Versions", "Bar chart version" | label 9/12 at y517; ‹ at x89; tiles 58×32 r6 `#232130` + glass shadow from x105; current tile outlined (violet → ember border as on the selected slot); "v3" mono |

- **Ease picker:** a `Dropdown` opened from the chip, four rows each with its curve drawn as an SVG path from the ease function (Look default · Ease in-out · Ease out · Linear). The chip shows the effective ease's curve and name.
- **Version tiles:** a glyph per kind, drawn in SVG at 58×32: three bars (two `chart[0..1]`, one `accent`) for number and data kinds, two text lines for statements, two halves for `versus`, using the look's colours (thumbnails may use style colours, design-system.md). Tooltip: label · route · relative time ("Quick edit · on-device · 2 min ago"). Rendered stills are Later.
- **Generating panel** (`generating-panel.tsx`): copy and layout from `editor-generating.png`; reuses `StepCard` from processing and `<Pip state="thinking" props={["sparkles"]} />` at top-right. "YOUR NEXT MOMENT" shows the next suggested slot after this one (`slotCardText`), hidden when there is none. Step 3 is active during the call and turns failed (`StepCard` failed state) on failure before the inspector returns.
- **Preview additions:** the badge (`preview-badge.tsx`, top-right of the frame card, glass pill, mono): "● Ready in X.Xs" (mint dot) for the selected slot's last AI result in this session, "● Generating…" while generating, else hidden. The progress line: 2 px along the frame's top edge, violet→mint, filling to 90 % over the last measured Generate median (default 6 s), then to 100 % on success; a static 60 % under reduced motion.
- **Frame notes layer:** over the player inside the frame card. Ellipse/path stroke `#A995EF` 1.5 px, bubble 13 px text on glass with the violet number disc, connector 1.5 px. Draw mode cursor: crosshair; the pen button is `aria-pressed`.
- **Pip:** rail bubble "Pip is thinking…" during any AI action, "Done!" for 1.2 s after (`done` state), then the slot count. Out of credits → spec 13's modal with `empty-pockets`.

## Content form (`apps/web/lib/inspector/content-form.ts`, pure)

```ts
export type Field =
  | { kind: 'text'; path: string; label: string; value: string; max?: number; required: boolean; title: boolean }
  | { kind: 'number'; path: string; label: string; value: number | undefined; min?: number; max?: number; int: boolean; focal: boolean }
  | { kind: 'short'; path: string; label: string; value: string | undefined; max: number }   // ≤ 8 chars: prefix, suffix
  | { kind: 'enum'; path: string; label: string; value: string | undefined; options: string[] }
  | { kind: 'bool'; path: string; label: string; value: boolean | undefined }
  | { kind: 'rows'; path: string; label: string; rows: { label: string; value: number }[]; highlight?: number };

export function contentForm(schema: z.ZodType, params: Record<string, unknown>, focalPath?: string): Field[];
export function setField(params: Record<string, unknown>, path: string, value: unknown): Record<string, unknown>; // copy
```

- Root: `content` for scenes, the params for components. Labels: the key in sentence case ("countFrom" → "Count from").
- Title field: the first required string field whose max is ≥ 20 (stat-punch `label`, hook `line`, versus `left`); `text` fields after it render as compact fields. Numbers and short strings render as data-table rows; the focal number (the scene's focal cue field, else the first number) gets the ember dot.
- Commit: `setField` → schema parse → `applyVersion` with `source: 'user'`, label "Edited {label}". Number inputs accept "1,200", "1.2k", "40%" through the existing spoken-number parser for digits (`parseSpokenNumber`), else the error state.

## Frame capture (task 19 is a spike)

`captureRegion(region): Promise<string | undefined>` in `lib/notes/capture.ts`. Candidate: clone the paused composition's DOM from the same-origin iframe, inline the bundled font faces as data URLs, wrap it in an SVG `foreignObject`, draw it to a canvas at the frame size, crop the region (≤ 512 px longest side, aspect kept), and encode JPEG at quality 0.85. The spike measures time (target < 300 ms), checks that `toDataURL` does not throw (tainting), and compares the crop with the player visually on 3 stills. If it fails, `note.fix` ships with `regionText` only and the decision goes in DEV_LOG/KIRO_LOG and this file. There is no player capture API (checked `@hyperframes/player` 0.9.46 README and dist on 2026-11-16: only shader-transition capture settings).

## Fake AI for development and e2e (`apps/web/lib/ai/fake-router.ts`)

`NEXT_PUBLIC_FAKE_AI=1` (set only in the Playwright local env) makes `getRouter()` return a deterministic `Router` that parses the task's input, answers by rule, and runs the task's own `check`, so a bad fake answer fails like a real one:
- `edit.patch` / `note.fix`: "slower" → `/timing/speed 0.8`; "faster" → `1.25`; "change A to B" → the first number path whose value is A; "orange" / "red" → the focal colour field when the schema has one; else `escalate`.
- `component.fill` generate: the scene's safe default from the words, else the current params.
- `prompt.prefill`: the template.
- `ranOn`: `device` unless the URL has `?device=off`, then `cloud`; latency 300 ms.
- Failure injection (spec 13's e2e needs it): `?fakeFail=generate|edit|note|all` makes the matching calls throw after the latency, and `?fakeFailRate=0.3` with `?fakeSeed=7` fails a seeded fraction (task 11 builds it, with a unit test). The router's failure path then runs the real refund flow.
- It is ignored when `process.env.NODE_ENV === 'production'` (unit test, P9). `NEXT_PUBLIC_*` values are inlined at build, so the runtime guard alone is not enough: a unit test also reads `apphosting.yaml`, every `.env*` committed file and the CI build steps and fails if any of them sets `NEXT_PUBLIC_FAKE_AI`. Both Playwright web servers (`chromium` and `auth`) set it in their own env. When on, `availability` reads `available` from it (`unavailable` with `?device=off`), and `cloudAvailable` is true, so the cloud paths run against `LocalCredits`.

## Failure handling

| Failure | Behaviour |
|---|---|
| Nano unavailable | violet toast once; edit/note chips show ☁ 1; prefill uses the template |
| Nano download needed | "Set up on-device AI" action; progress toast; cloud route meanwhile |
| Offline | banner; Generate and cloud fallbacks disabled "Needs connection"; device edits work |
| Firebase on, `ServerCredits` not built | cloud actions disabled "Cloud AI is coming soon"; no call, no spend |
| Kill switch | cloud actions disabled "Cloud AI is paused"; device edits work |
| Device answer invalid after repair | "Couldn't do that on your device." + "Try in the cloud ☁ 1" |
| `escalate: true` | message + "Generate ☁ 3" |
| Cloud call fails | refund; quick edit/note: toast with Retry; Generate: failed slot or kept graphic + toast |
| Not enough credits | out-of-credits modal (spec 13); nothing charged |
| Slot changed during a call | discard, refund, "The graphic changed. Try again." |
| Content field invalid | field error state, nothing applied |
| Scene gate warns on a manual edit | applied, warning under CONTENT |
| Frame capture fails | `note.fix` without the image, no error shown |
| Save fails | existing autosave error state |

## Edge cases

- A slot with `componentId` not in the registry (planned components like `map-zoom` in the fixture): CONTENT shows "This graphic isn't available yet."; quick edit and notes disabled; Generate disabled with "Coming soon"; versions still listed.
- Notes on a slot that is then moved: `tMs` is relative to the slot start, so the note moves with it. A note whose `tMs` is beyond a shortened slot is clamped for display. Every other time in the project is absolute (`architecture.md`), so this is the one relative time; task 1 changes the demo fixture's note from 5600 to 1400 and a test checks the note shows at playhead 5600 (D-09-14).
- `regionText` reads `data-text` from the same-origin player iframe. Tier-2 previews are opaque-origin (D-021), so their region text is empty; spec 15 must provide another way (a `postMessage` from the composition) before notes work on custom graphics.
- Undo of a fixed note restores both the params and the note's `open` status (one composite).
- A quick edit that changes nothing (empty patch) is a check failure ("the patch is empty"), not a no-op version.
- A version restore on a slot whose component changed since (duplicate then swap): versions with another `componentId` are shown greyed and can't be restored.
- 9:16 and 1:1: frame notes are normalised to the frame, so they follow format changes; the crop uses the current format.

## Testing approach

- **Unit (Vitest):** edit doc, editable paths, field guide; `chooseRoute` table; content form; note geometry; commands; `generateSlot` with fake router and `LocalCredits`; `withTiming`; prefill template; fake router production guard.
- **Property (fast-check), required by testing.md:** quick-edit patches keep params valid (P1); commands `undo(do(s)) == s` and invariants (P3); plus the properties below.
- **Motion:** `assertSeekPure` with random timings; `motion:check stat-punch` and `hook-statement` with timing samples (`show-slow`, `show-fast`, `show-cut`) in 3 formats; contact sheet review of the new samples in plain and `field-notes`.
- **E2E (Playwright, local mode + fake AI):** `apps/web/e2e/inspector-hybrid.spec.ts` (task 21), run in CI by the Playwright job (task 24, IDE, done by Claude Code).
- **Design check:** inspector, generating panel and frame note against the PNGs at 1440×900 with the Chrome DevTools MCP, plus an `inspector` region in the existing Playwright design check (task 22).
- **Rules:** no new Firestore or Storage paths in this spec; the existing project subcollection tests cover versions and notes. Spec 13 tests `settings.preferOnDevice`.
- **Manual (founder, headed Chrome with the Nano flag):** task 23.

## Correctness properties

- **P1 Patch validity.** For any slot from the scene and component sample arbitraries and any patch the check accepts, `splitEditDoc(apply(editDoc(slot), patch))` parses with the slot's schema and `SlotTimingSchema`. Rejected patches change nothing.
- **P2 Edit doc round-trip.** `splitEditDoc(editDoc(p, t, d), d)` equals `{ p, t }` with default-valued timing keys removed; `editablePaths` never contains `/beats` or `/images` prefixes and has at most 40 entries.
- **P3 Commands.** For every new command and random valid projects: `undo(do(s)) == s`; random sequences keep the timeline invariants; every slot's `currentVersionId`, when set, names a version that exists; no slot has more than 20 versions.
- **P4 No surprise spend.** For every `RouteInput`: a `device` or `local` route has `allowCloud: false` and no credits; offline never yields `cloud`; `generate` is never `device`; a `cloud` route always carries `credits === cloudCost > 0`; `checking` never yields `device`.
- **P5 Generate accounting.** With a fake router that fails at random, and with **both** `LocalCredits` and a `ServerCredits` backed in memory by spec 13's pure `decideSpend` / `decideRefund` (a fake fetch), after any sequence of Generate calls the balance equals the start minus 3 × successes, is never negative, every failure or discard is refunded exactly once, and a spend, refund, spend with one key never returns `ok: true` (every attempt draws a new key).
- **P6 Content form round-trip.** For random valid content, committing every field with its current value leaves params deep-equal; `setField` never mutates its input.
- **P7 Note geometry.** For random strokes in the frame: the fitted shape's points are in [0, 1], the region has `w, h ≥ 0.04` and lies inside the frame, and the crop rectangle's longest side is ≤ 512 px with the region's aspect ratio within 1 px.
- **P8 Timing keeps voice sync.** For random scores, words and `speed` in [0.5, 2], anchored cues land within ± 80 ms of their word whenever the slot allows (as spec 07 task 10), and `fade: false` keeps every landed actor visible until the clip's last frame. `seek(t)` stays pure.
- **P9 Fake router guard.** In production mode `getRouter()` never returns the fake, and no committed hosting or build config sets `NEXT_PUBLIC_FAKE_AI`.
- **P10 Spend call sites.** A lint-style test scans `apps/web` and fails if any file other than `lib/slots/generate.ts` and the edit/note flow calls `credits.spend`, and checks that the edit/note flow only calls it inside a branch where `route.kind === 'cloud'`.

## Decisions (made headlessly, 2026-11-16; to log in `docs/decisions.md` as D-035 to D-049, task 25)

The draft label is kept in front of each final id. D-034 is spec 08's; spec 13 takes D-050 to D-064.

- **D-09-1 / D-035 Escalation to the cloud is a click, not automatic. Supersedes D-027's `edit.patch` escalation rule.** D-027 and `ai-tasks.md` §4 say "Invalid → repair once → cloud" (1 credit). That would charge after a mint "free · on-device" chip, which breaks `security-and-cost.md` ("show the cost before every credited action") and `hybrid-ai.md` ("show the route before the action"). The stricter rule wins: the router gets `allowCloud: false`, and the user sees "Try in the cloud ☁ 1". Also, a PREFER mode lets the SDK fall back to the cloud on its own when Nano is missing, so the app always passes an explicit ONLY_* mode. D-027 stays in force for everything else (the router contract, usage logging); the decisions entry for D-035 says "Supersedes D-027 (edit.patch escalation only)".
- **D-09-2 / D-036 One look per video.** The STYLE row changes the whole video's look (SetStyle). Per-slot looks (`Slot.styleId`, in the data model) need per-clip backgrounds and textures in the compiler and break the "consistent graphics" promise; moved to Later.
- **D-09-3 / D-037 Timing lives on the slot, not in params.** Scenes' params are scores (D-028); putting `timing` inside them would change every score schema and the AI's fill schema. The edit document merges `{ ...params, timing }` so `/timing/*` patch paths still work as ai-tasks.md describes. `component-library.md`'s shared `timing` block is updated on merge to say so.
- **D-09-4 / D-038 Versions carry timing.** `VersionSchema.timing` (optional) so restoring a version restores its feel.
- **D-09-5 / D-039 Fade = exit or cut.** On (default, today's behaviour) plays the scene's exit; off holds and cuts. Library components keep their exit (toggle disabled). Saved projects render unchanged.
- **D-09-6 / D-040 Ease choices are three plus "Look default".** `inOut`, `out`, `linear` from component-library.md, mapped onto the existing ease names.
- **D-09-7 / D-041 Version thumbnails are glyphs, not rendered stills,** for Nov 30. A still per version needs an off-screen player per tile.
- **D-09-8 / D-042 Edit and note share the edit-doc helper, and v2 of the prompt drops the schema text** (paths as an enum in the structured output). This retires the last known schema-rule violation.
- **D-09-9 / D-043 Frame notes always send region text; the JPEG crop ships only if the capture spike passes.** There is no player capture API.
- **D-09-10 / D-044 Generate lives in this spec** (spec 06 moved it here). On the hosted path it needs the spec 13 block (tasks 1, 2, 3, 4, 5, 8, 9); local mode and the fake-AI flag use `LocalCredits` at 120.
- **D-09-11 / D-045 Local mode cloud actions** show "Sign in to use cloud AI" (no Firebase, no cloud).
- **D-09-12 / D-046 The cloud route is disabled until `ServerCredits` exists.** `LocalCredits` is used only without Firebase or with `NEXT_PUBLIC_FAKE_AI=1`. With Firebase on and no `ServerCredits`, `cloudAvailable` is false with the copy "Cloud AI is coming soon". Reason: a hosted build with fake credits would run real, unmetered cloud calls on the Blaze account (review F2).
- **D-09-13 / D-047 Every spend attempt draws a new key; a refunded key answers `key-used` on the server.** A retry reusing a key after a refund would be a free cloud call (review F1). The client rule and spec 13's server rule are two halves of one guard, and P5 tests both.
- **D-09-14 / D-048 `FrameNote.tMs` is slot-relative** (notes move with their slot). It is the one relative time in a project that otherwise uses absolute milliseconds; the fixture's note becomes 1400 (review F4).
- **D-09-15 / D-049 Note shape limits are checked by the note commands, not the schema,** following `project.ts`'s policy that a saved project never fails to load because of a limit (review F11).

## Steering updates to make on merge (the headless agent can't write steering; task 25 lists each exact edit)

- `docs/decisions.md`: D-035 to D-049 as above. D-035 supersedes D-027's `edit.patch` escalation.
- `ai-tasks.md` §2: `prompt.prefill` is ONLY_ON_DEVICE with a template fallback, never cloud. §4: input becomes `{ componentId, fieldGuide, paths, current, instruction }`; "Invalid → repair once → cloud" becomes "→ offer the cloud (☁ 1) as a click" (D-035). §4b: add `regionText`; image optional (D-043).
- `hybrid-ai.md` routing table: `prompt.prefill` row becomes ONLY_ON_DEVICE (captions keeps its own fallback); `edit.patch` and `note.fix` run ONLY_ON_DEVICE or ONLY_IN_CLOUD as chosen by `chooseRoute`, never PREFER at call time.
- `component-library.md`: the shared `timing` block is slot-level (D-037), with `fade` meaning exit vs cut (D-039).
- `data-model.md`: `Slot.timing`, `Version.timing`, `FrameNote.fixedVersionId`, circle points `[cx, cy, rx, ry]`, and `FrameNote.tMs` is relative to the slot start (D-048).
- `architecture.md` flow 4 and its failure table: "Invalid → one repair → cloud" becomes "Invalid → one repair → offer the cloud (☁ 1, a click)" (D-035).
- `structure.md`: new folders `apps/web/lib/{credits,notes,inspector}`, `packages/ai/src/edit/`.
- `screens.md`: the new strings "Sign in to use cloud AI", "Cloud AI is coming soon", "Needs on-device AI", "Coming soon" (Generate on a planned component), "Pip is on it", "Couldn't do that on your device.", "Try in the cloud ☁ 1", "What should change?", "Still there?", and the setup toasts.

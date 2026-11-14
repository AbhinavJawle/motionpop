---
inclusion: fileMatch
fileMatchPattern: ["packages/schemas/**", "firestore.rules", "storage.rules", "apps/web/lib/firebase/**", "apps/web/app/api/**", "services/render/**"]
---

# Data model (Firestore + Storage)

```
users/{uid}                      profile, credits (int), plan, settings { preferOnDevice }, createdAt
users/{uid}/brandKits/{id}       name, logoPath, colors[], fonts { display, body }, sourceUrl
users/{uid}/styles/{id}          user style packs + saved director skills (copies with edits)
users/{uid}/usage/{eventId}      task, ranOn, model, credits, latencyMs, at
projects/{projectId}             ownerId, title, format, fps, durationMs, status, styleId, brandKitId,
                                 voiceover { storagePath, durationMs, cleanedPath, source: record|upload|tts },
                                 captions { enabled, presetId }, createdAt, updatedAt
projects/{id}/transcript/main    words: [{ i, text, startMs, endMs, conf, filler }], language
projects/{id}/slots/{slotId}     startMs, endMs, wordStart, wordEnd, reason, componentId, skillId, params,
                                 status: suggested|generating|ready|failed, currentVersionId, notes[]
projects/{id}/versions/{vid}     slotId, componentId, params, customHtmlPath?, source: ai-device|ai-cloud|ai-claude|user|plan, createdAt
renders/{renderId}               projectId, ownerId, format, resolution, transparent, status, progress, outputPath, error
```

Free plan starts at 20 credits (`plan: "free"`); the judge plan's grant comes from Remote Config and is applied server-side.

Storage: `users/{uid}/audio/*`, `users/{uid}/projects/{id}/renders/*`, `users/{uid}/brand/*`, `users/{uid}/media/*`.

Schemas for all docs live in `packages/schemas` and are the only way to read/write (parse on read).

## TypeScript shapes (implement as zod in packages/schemas; these are the contract)
```ts
type Format = "16:9" | "9:16" | "1:1";
type RanOn = "device" | "cloud";

interface UserDoc {
  displayName: string; email: string; photoURL?: string;
  credits: number;               // server-written only
  plan: "free" | "creator" | "pro" | "judge";
  settings: { preferOnDevice: boolean; captionsDefault: boolean; defaultFormat: Format };
  createdAt: Timestamp; lastSeenAt: Timestamp;
}

interface Word { i: number; text: string; startMs: number; endMs: number; conf: number; filler: boolean }
interface Transcript { words: Word[]; language: string; ranOn: RanOn; timingQuality: "word" | "approx"; cleaned: boolean }

interface Voiceover {
  source: "record" | "upload" | "tts";
  originalPath: string; cleanedPath?: string; activePath: string;
  durationMs: number; peaksPath?: string;
  cleanup: { fillersRemoved: number; pausesShortened: number; enabled: boolean };
  tts?: { voiceId: string; speed: number; script: string };
}

interface Project {
  ownerId: string; title: string; format: Format; fps: 30;
  status: "draft" | "processing" | "ready" | "rendering" | "exported";
  styleId: string; brandKitId?: string;
  voiceover?: Voiceover;
  captions: { enabled: boolean; presetId: "pop" | "clean" | "boxed" };
  audio: { musicId?: string; musicGainDb: number; ducking: boolean; autoSfx: boolean };
  slotCount: number; readySlotCount: number;          // denormalised for dashboard
  thumbnailPath?: string; lastRenderId?: string;
  createdAt: Timestamp; updatedAt: Timestamp;
}

interface Slot {
  id: string; startMs: number; endMs: number; wordStart: number; wordEnd: number;
  reason: string;                 // quoted words
  componentId: string | "custom"; skillId: string; styleId?: string;   // slot-level style override
  prompt: string; params: Record<string, unknown>;
  status: "suggested" | "generating" | "ready" | "failed";
  error?: string; needsInput?: string[];
  currentVersionId?: string;
  notes: FrameNote[];
  sfx?: { id: string; atMs: number }[];
}

interface FrameNote { id: string; tMs: number; shape: { kind: "circle" | "path"; points: number[] }; text: string; status: "open" | "fixed" }

interface Version {
  id: string;                     // = Firestore doc id; target of Slot.currentVersionId (spec 04)
  slotId: string; componentId: string; params: Record<string, unknown>;
  customPath?: string;            // tier-2 composition bundle in Storage
  source: "ai-device" | "ai-cloud" | "ai-claude" | "user" | "plan";
  model?: string; costCredits: number; createdAt: Timestamp; label?: string;
}

interface RenderJob {
  projectId: string; ownerId: string; format: Format; resolution: "720p" | "1080p" | "4k";
  transparent: boolean; captions: boolean; music: boolean;
  status: "queued" | "rendering" | "encoding" | "done" | "error";
  progress: number; outputPath?: string; error?: string; costCredits: number;
  createdAt: Timestamp; finishedAt?: Timestamp;
}

interface UsageEvent { task: string; ranOn: RanOn; model: string; credits: number; latencyMs: number; ok: boolean; at: Timestamp }
interface CreditTx { delta: number; reason: string; refId?: string; balanceAfter: number; at: Timestamp }  // users/{uid}/credits/{txId}
```

Additional collections: `users/{uid}/credits/{txId}` (ledger), `projects/{id}/chat/{msgId}` (Pip conversation: role, text, plan?, createdAt), `shares/{shareId}` (projectId, renderId, ownerId, createdAt, revoked).

## Invariants
- `credits` and the ledger are only written by server code (Admin SDK) inside transactions; `balanceAfter ≥ 0`.
- Slots satisfy the timeline invariants (editor-timeline.md).
- Every doc is parsed with its zod schema on read; unknown/old docs are migrated in the parser (`schemaVersion` field on every doc).

## Security rules (sketch; real files `firestore.rules`, `storage.rules`)
```
match /users/{uid} { allow read: if isOwner(uid); allow update: if isOwner(uid) && !changes(['credits','plan']); }
match /users/{uid}/{sub=**} { allow read: if isOwner(uid); allow write: if isOwner(uid) && sub != 'credits' && sub != 'usage'; }
match /projects/{pid} { allow read, write: if resource == null ? request.resource.data.ownerId == auth.uid : resource.data.ownerId == auth.uid; }
match /projects/{pid}/{sub=**} { allow read, write: if get(/databases/$(db)/documents/projects/$(pid)).data.ownerId == auth.uid; }
match /renders/{rid} { allow read: if resource.data.ownerId == auth.uid; allow write: if false; }  // server only
match /shares/{sid} { allow read: if false; }  // served via server route
```
Storage: `users/{uid}/**` owner-only, size/type limits (audio ≤ 50 MB `audio/*`, images ≤ 10 MB `image/*`).

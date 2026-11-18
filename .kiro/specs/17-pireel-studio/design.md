# Spec 17 · Pireel studio · design

The full comparison, the data-model mapping and the motion-graphics lessons are in `docs/research/pireel-integration.md`. This file records the decisions the tasks depend on.

## 1. Layout in the repository
- `vendor/pireel/{studio-engine,studio-ui,studio-kit,ui}`: Pireel's packages at commit `51fb487`, added to the pnpm workspace. Their names stay `@pireel/*`.
- `apps/web/app/(app)/studio/[id]/page.tsx`: a client page; the editor is loaded with `next/dynamic` and `ssr: false`.
- `apps/web/lib/studio/providers/*.ts`: one file per provider, each a thin adapter over existing Motionpop code.
- `apps/web/lib/studio/bridge.ts`: `toEditorDocument(project, transcript, slots, media) → EditorDocumentV2` (pure, tested).
- `packages/motion/src/runtime/block.ts`: `mountBlock`, bundled as `dist/block-runtime.js` next to the existing runtime.
- `next.config`: `transpilePackages` for `@pireel/*`; Tailwind 4 sources include `vendor/pireel/**`; Pireel's `theme.css` and `studio.css` imported on the studio page only.

## 2. Bridge: Motionpop project → EditorDocumentV2
- Canvas from the format (1080×1920 for 9:16), fps 30.
- Assets: the voice (audio) or the video, keyed by content hash.
- Primary narrative track: one clip per kept EDL segment, `sourceInSec/sourceOutSec` from the original-clock cut ranges (`buildEdl` already produces them), frames from the cumulative kept length.
- Transcripts: the original-clock words grouped into segments by sentence, under the asset id.
- Graphics track: one graphic clip per slot. `anchor = { type: 'word', assetId, segmentIndex, wordIndex, offsetFrames: 0 }` from the slot's `wordStart`; duration from the slot; `block.templateId = 'motionpop'`, slots carrying `{ componentId, params, styleId }`.
- Managed captions: Pireel's own caption derivation from the transcript (no bridge code).
- Time: integer ms in Motionpop, frames in Pireel; `frame = round(ms * 30 / 1000)` (existing helper).

## 3. Motionpop blocks inside Pireel
- `assembleHtml` (vendored) adds `<script src="/vendor/motionpop-block-runtime.js">` after GSAP (`// motionpop:` mark).
- The `motionpop` template's timeline body:
  `var p={t:0}, h=__mpBlocks.mount('#ID', DATA); tl.to(p,{t:D,duration:D/1000,ease:'none',onUpdate:function(){h.seek(p.t)}},0); h.seek(0);`
- `mountBlock` builds a one-slot `RuntimeProject` (slot 0..D, the block's words re-based to 0) and runs `createEngine` against the block element. It shares fonts and textures with the main runtime.

## 4. Providers (adapters)
| Provider | Adapter over | Route |
|---|---|---|
| transcriber | Whisper worker (`lib/transcribe`) → `AsrSegment[]` | device |
| speechCleanup | `buildEdl` + `retakes` task in `packages/ai` | PREFER_ON_DEVICE |
| autoHighlight / draftInsertPrompt / syncFill / translate | new small tasks in `packages/ai` (zod in/out, output caps) | PREFER_ON_DEVICE |
| composer | `custom.compose` with the R6 prompt changes | ONLY_IN_CLOUD, credited |
| brandTitles / editPlan | new tasks in `packages/ai` | PREFER_IN_CLOUD |
| chatEndpoint | `app/api/studio/chat` (AI SDK stream, Gemini) | cloud, credited |
| projects / vault / uploads | project repository (IDB → Firestore), audio store, Storage | device first |

## 5. Export
Pireel's browser export by default. A project whose graphics use canvas or WebGL (maps, raw films) exports through `services/render`, which gets the same assembled HTML.

## 6. Testing
- Bridge: property test that every graphic clip's anchor resolves to its slot's first word, and that clips stay in transcript bounds after random cleanup toggles.
- `mountBlock`: seek purity (same t twice → same DOM) and parity with the full runtime for one slot.
- Providers: zod round-trips; router `ranOn` logged; fake router in tests (no paid calls).
- E2E: start → video → processing → studio shows clips, captions and graphics (fake AI).

## 7. Edge cases
- Cleanup off: the bridge emits one narrative clip for the whole take; anchors still resolve.
- A slot whose first word was cut: the anchor moves to the next kept word.
- Voice-only projects: the narrative track is an audio clip on the narration track; graphics carry the picture.

# Spec 29 design

## Flow
```
pen (ReelTools) → setPlaying(false), drawMode
NotesOverlay (shared with slots)  stroke → shape {circle|path, points (0..1 of the 9:16 stage)}
  → addReelNote(sceneId, note)                      reel.scenes[i].notes (≤ 12, not in the engine key)
  → runReelNoteFixWithUi(sceneId, noteId, route)
      spendWithUi (cloud: 1 credit)
      look(region): readReelTarget(stage, region, plan, sceneId)   parts · texts · pictures · caption · hook
                    captureReelRegion(stage, crop)                  JPEG ≤ 512 px (video frame, blob imgs, reel fonts)
      reelNoteContext(scene, words, look)  →  Graphic (director language) + brands + cueOf
      reelNoteInput → router.run(reelNoteTask)       parse + checkReelNote + one repair
      stale check (scene data, hook, look)  → refund + "The scene changed while Pip worked"
      applyReelNote(ctx, out)  →  { scene, hook?, captions[], changed, message }
      unchanged → escalate (device) / message (cloud) + refund
      composite('Fix note', [fixReelScene, setReelNoteStatus fixed])
      fetchPictures (background) → setReel(next, 'Add the picture') if the scene is unchanged
```

## Schema (`packages/schemas/src/reel.ts`)
- `ReelNoteSchema { id, tMs, shape { kind: circle | path, points[] }, text, status: open | fixed, fixedVersionId? }`, `REEL_NOTES_PER_SCENE = 12`, `notes` optional on `ReelSceneSchema` (≤ 40).
- `reelSceneData(s)` = the scene without notes. The preview's engine key and the stale check use it, so adding a note never remounts the video.

## Reading the preview (`apps/web/lib/reel/note-look.ts`)
- `mountReel` tags its parts: `data-reel-part` = graphic | speaker | caption | tag | hook, `data-reel-scene=<id>` on scene hosts, `data-reel-asset=<assetId>` on pictures. The host carries `data-reel-stage`.
- `readReelTarget`: parts whose box meets the region, smallest first; texts grouped by parent element (≤ 80 chars); pictures described by their media request (`describeMedia`: "Acme logo", "photo: …").
- `captureReelRegion`: clones the 720×1280 stage, swaps the video for a frame and blob images for data URLs, inlines the reel font CSS, draws through an SVG foreignObject and crops.

## Mapping (`packages/ai/src/reel/note.ts`)
- `reelNoteContext` inverts `contentFor` for all 20 templates: cues → word indices (`cueOf` keeps the exact original ms per word), media → brand / subject / domain, `brands` map name → domain.
- `applyReelNote`:
  - `carryOver(old, next)` first (R2.3): same template → left-out optional scalars are kept; list / stack / flow items keep a left-out brand (and icon) by same text, else same word or position when the texts share a word; compare sides follow their text. If the carried answer rebuilds to the same scene as the untouched graphic, the drop was the edit and the answer is applied as sent.
  - Prompt: "optional fields you leave out keep their current value; "" removes" (shorter answers; a counter suffix with stray spaces made the model ramble inside the JSON for 30 s).
- `checkReelNote` also runs `cutTexts`: the answer is built, read back through `reelNoteContext`, and any text that came back shortened is returned to the model with its cut (R2.6).
- `providers/firebase.ts`: `response.text()` throws on a RECITATION stop; that becomes an empty answer so the router's repair runs (R2.7). Other blocks still throw.
- Director: counter prefix / suffix lose outer spaces (`" tools? "` → `" tools?"`).
  - `contentFor(graphic, at, brands)` (the director's own strict builder: cut lengths, icon fallback, logo requests) with `at(word)` = the kept cue, else the word's start inside the scene, else spread.
  - `withAssets(next, assetsOf(old))` re-attaches fetched assets by `reelMediaKey`.
  - Speaker rule: layout speaker with a non-speaker template → template none. Layout follows the template and the look. Tag only on mono, carry only when the template stays.
  - `changed` compares `canonical()` JSON (sorted keys).
- Prompt (`REEL_NOTE_SYSTEM_V1`): layouts and templates block shared with the director (`REEL_LAYOUTS_AND_TEMPLATES`), limits, how to answer (graphic complete, copy brands, captions only for transcription mistakes), rules (literal, closest version over refusing, one item left → show it alone, never invent facts).

## Commands (`apps/web/lib/commands/reel-notes.ts`)
- `fixReelScene(sceneId, { scene, hook?, captions? })`: keeps id, times and notes; caption fixes via `fixCaptionWords(transcript, fixes, window)` inside the scene window ±(1500 / 600 ms): same word count → one-for-one, else merged into one word; indices re-numbered, prosody stress kept aligned. Undo restores reel and transcript.

## Director bug found on the way
`contentFor`'s item filter read `x.text.trim()`; `logos` items have no text, so any cloud plan with a logos scene threw and the reel fell back to the free director. Fixed (`(x.text ?? '').trim()`) with a regression test. The founder's reel was a fallback reel because of it.

## Testing
- `note.test.ts`: round trip of all 20 templates, cue and asset carry, logo carry (retyped, swapped compare sides, new name, explicit ""), new brand request, layout rules, tags and carry, new item cues, none, hook, property test (200 runs: any valid answer → a valid scene inside the window), checks, prompt, `findWordRun`.
- `reel-notes.test.ts`: add / evict / delete / status, fix keeps notes and times, undo, caption property test.
- `note-fix.test.ts`: applied, stale, unchanged → escalate, failures and refunds, no credits, pictures attach only to an unchanged scene.
- Lab: `packages/ai/scripts/reel-note-lab.ts` (real cloud calls through a router adapter with the same parse, check and repair).

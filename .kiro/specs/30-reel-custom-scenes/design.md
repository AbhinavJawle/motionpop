# Spec 30 design

## Flow
```
pen → note → runReelNoteFix (cloud route only)
  spend edit (1) → look (parts, texts, pictures, JPEG) → reel.note (gemini-4-neon, LOW)
  applyReelNote → action:
    edit / none           → spec 29 path, unchanged
    compose {brief, layout}
      customAssets()  (dist/reel-custom.js + reel fonts, via /api/composition/reel-custom|reel-fonts)
      spend custom (3)
      reel.compose (gemini-4-neon, LOW, 24k tokens; lint + ids + key moment, 1 repair)
      applyReelCompose → candidate scene {template: custom, …, media: kept pictures + new requests}
      inspectCustomScene (hidden sandboxed frame: build, seek errors, film critic)
        problems → reel.compose again with fix {code, problems} → review again
        still broken → refund both, cloud-failed
      stale? budget? → refund both
      composite('Fix note', [fixReelScene, setReelNoteStatus fixed])
      new pictures → fetchPictures (background, as spec 29)
```

## Schema (`packages/schemas/src/reel.ts`)
`custom` member of `ReelTemplateSchema` (limits `REEL_CUSTOM_LIMITS`), `REEL_CUSTOM_BUDGET = 400 000`, `reelCustomSize(plan)`. `reelMediaOf` / `setReelMediaAssets` visit `media[]` generically, so custom pictures fetch like any other.

## Engine (`packages/motion/src/reel`)
- `custom.ts` (browser-safe; never runs generated code itself):
  - `reelCustomScene({ look, scene, words, pictures })` → area of the layout, palette (scene bg), seed from the id, words relative to the scene, pictures `m<i>` from `media[i].asset`. Preview, export and the review all use it.
  - `reelCustomDoc(scene, assets)` → the frame document: font CSS, `#mp-scene` W×H, `window.__MP_ALLOW_CUSTOM__ = true`, `window.__MP_SCENE__` (JSON escaped for `<`, U+2028/9), the runtime (`</script` escaped).
  - `customFrame({ doc, scene, assets, startMs, sandbox })` → `Tpl` + `ready`, `drawn()`, `error()`, `inspect()`, `destroy()`. Messages: `{mpReel, seek, ms}` → `{ack}` / `{seekError}`; `{mpReel, inspect}` → `{inspected, report}`; `{ready}` / `{error}`. Replies are accepted only from that frame's window with its token. 4 s give-up.
  - `inspectCustomScene` → builds a hidden sandboxed frame off screen at its real size, waits, asks for the review, destroys it.
- `custom-entry.ts` → `dist/reel-custom.js`: style pack from the scene palette and look fonts, `buildCustom` (lint + blocked globals) after `document.fonts.ready`, seek on message, `inspectBeat` on request.
- `mount.ts`: the `custom` builder in `TplCtx` makes a `customFrame` (sandbox unless `customSandbox === false`); `ready` waits for the frames; `drawn()` waits for frames on screen; off-screen custom scenes stay laid out (`keepLaidOut`: display block, visibility hidden, opacity 0).
- `compile.ts`: a plan with a custom scene requires `reelCustomJs` and sets `customSandbox: false`; `hf-entry.ts` waits on `drawn()` per frame.

## AI (`packages/ai/src/reel`)
- `note.ts`: action `compose` + `compose` brief (≤ 1 200 chars), cloud-only `modelStrong`, 8 192 tokens, prompt v2 ("never refuse a visual request: compose it"). `ReelNoteContext.custom` = `{title, brief}` for custom scenes (their `graphic` is `none`); the input shows `{template: custom, title, brief}`.
- `compose.ts`: schemas, `reelComposeSystemV1(KIT_DOC)` (note-first direction, area rules, contract, no sound), `reelComposePromptV1`, `checkReelCompose`, `reelComposeTask(lint, kitDoc)`, `applyReelCompose`.

## App
- `lib/reel/custom-assets.ts`: runtime + fonts fetched once; stored pictures as data URLs (an opaque frame can't read blob: URLs).
- `lib/reel/note-fix.ts`: the flow above (`composeScene`), injectable `customAssets`, `customPictures`, `inspect`, `onStage`.
- `lib/reel/use-reel-note-fix.ts`: cloud route always, the cost range, the stage toast.
- `components/editor/reel-preview.tsx`: loads the runtime when the reel has a custom scene, passes `custom`, `customImages`, `customSandbox: true`.
- `services/render/src/compile-assets.ts`: reads `reel-custom.js` when built (the Dockerfile runs `build:runtime`).

## Edge cases
- Runtime missing → the preview shows the title; a compose refuses before spending the 3 credits (the note credit is refunded).
- A hang in generated code → the frame is given up after 4 s (8 s for the review) and shows nothing; the review counts it as broken.
- The notes capture can't see inside the sandboxed frame; the model gets the scene's code and brief instead.

## Testing
See R7. The lab script lives outside the repo (scratchpad `compose-lab.mts`): note → compose → render in Chrome at 7 moments → review → repair.

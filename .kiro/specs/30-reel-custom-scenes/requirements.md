# Spec 30: Notes that rewrite the scene (AI-written reel scenes)

> Written in a Claude Code session (2026-11-22). Founder ask, after a note came back "Animations are fixed by the motion engine, but you can ask for a specific template…": "a user describes what they want, they should be able to get exactly that. since we are working with slots here, that slot should change if the note says it should change … there should be no limitations. use frontier models for everything including the notes feature. limitless. but don't accidentally break anything while you are at it." Test note: a circle around a graphic with "i dont like this its boring make it snappier and use better symbols and animations".

## Why
Spec 29 notes could only change a scene's template data (text, logos, layout). Anything about motion, style, symbols or design came back as `none`. Reel scenes are slots on the timeline, so a note can rebuild just its own scene: the strong model writes a new motion graphic for that scene with the film kit, and nothing else in the reel is touched.

## Requirements (EARS)
### R1 The note step
- **R1.1** THE `reel.note` task SHALL run on the strong model (`modelStrong`, `gemini-4-neon`) in the cloud only, for every note; a device route SHALL be refused without spending.
- **R1.2** THE answer SHALL add `action: "compose"` with a brief (what the graphic shows, the exact on-screen words, how it moves, what stays) and an optional layout, for anything the template data can't give: motion, timing, style, symbols, positions, sizes, custom diagrams. `none` SHALL be kept only for things outside the scene's graphic (voice, face, music, other scenes).
- **R1.3** Plain text, logo, caption and layout fixes on template graphics SHALL stay edits (spec 29 behaviour unchanged).

### R2 AI-written scenes
- **R2.1** THE reel plan SHALL accept a `custom` template: `title`, `brief`, `html`, `css`, `script` (the custom graphic's limits: 12 000 / 12 000 / 24 000 chars), `keyMomentMs?`, `media[]?` (pictures by `m0`, `m1`…). All custom code in a reel SHALL stay under 400 000 chars.
- **R2.2** Generated code SHALL never run in the app's origin. In the editor each custom scene SHALL be its own document in an `<iframe sandbox="allow-scripts">` (opaque origin), seeked from the reel clock by message with a per-frame token; a frame that never answers SHALL be given up after a timeout and never hold the reel.
- **R2.3** THE export SHALL run the same document, inlined in the composition, inside the isolated render container (unsandboxed so the capture sees it), so the preview is the export; a plan with a custom scene and no runtime SHALL fail to compile rather than render without it.
- **R2.4** Without the runtime (still loading, or missing) THE preview SHALL show the scene's title as a headline.
- **R2.5** Off screen, a scene with a custom frame SHALL stay laid out (hidden by opacity), so its graphic builds and measures with real layout.
- **R2.6** A note on a custom scene SHALL see it as "an AI-written motion graphic" by title and brief; any change to it except layout, background, tag or a named template SHALL be a compose that revises its code.
- **R2.7** THE director and auto edit SHALL never produce custom scenes.

### R3 `reel.compose` task
- **R3.1** Input: the note, the brief, look, layout, graphic area (px), palette, scene length, the scene's words (ms from the scene start), the tag the reel pins over the area, what is on screen now (template data, or the previous code), the pictures it may show, a layout-matched kit example, the JPEG crop, and on a repair the built code with the review's problems.
- **R3.2** Output: `{ title, brief, html, css, script, keyMomentMs, newPictures[≤ 2], message }`, checked by `lintCustom`, key moment inside the scene, `mp.image` ids that exist, no `mp.stage` / `mp.sheet` on painted layouts; one repair.
- **R3.3** Model `modelStrong`, cloud only, thinking LOW, 24 576 output tokens, priced at the custom cost (3); the review repair is logged at 0.

### R4 Fix flow
- **R4.1** A compose SHALL reserve the custom price (3) after the note's credit (1), before the call; every failure SHALL refund both.
- **R4.2** THE new graphic SHALL be built off screen in a sandboxed frame and reviewed by the film critic (build errors, seek errors, overflow, tiny text, contrast, late start…). Problems SHALL go back for one repair; a graphic that still fails to build SHALL NOT be applied; layout notes that survive the repair SHALL NOT block.
- **R4.3** THE result SHALL keep the scene's id, times, tag and notes, follow the look's layout rules, drop `carry`, and land as one composite "Fix note" step (scene + note fixed): one undo restores the template. New pictures SHALL be fetched afterwards like any note picture.
- **R4.4** IF the scene changed while Pip worked, or the reel's custom code would exceed the budget, THE fix SHALL NOT be applied and both spends SHALL be refunded.

### R5 Feedback
- **R5.1** THE draft chip SHALL show the range ("☁ 1–4") with what it means; one toast SHALL follow a compose ("Pip is writing a new graphic…" → "checking" → "polishing" → "New graphic ready").

### R6 Kit fixes found on the way
- **R6.1** `mp.image(id, { parent })` SHALL place the picture inside the parent, with x / y / w / h relative to it (CSS %), filling it by default; the kit doc says so.
- **R6.2** THE critic SHALL read text with its own solid fill (a badge) against that fill.

### R7 Verification
- **R7.1** Unit tests: schema, engine (scene builder, doc escaping, placeholder, sandbox attribute, laid-out off screen, export inline), compose task (checks, prompt, apply), note mapping (compose, custom scenes, model), fix flow (compose, repair, broken, no runtime, revise, refunds), kit image parent, critic badge.
- **R7.2** Lab: the founder's note on the founder's reel in the cloud, rendered and reviewed in Chrome. Real app: pen → circle → note → new graphic in the sandboxed frame → export frames show it.

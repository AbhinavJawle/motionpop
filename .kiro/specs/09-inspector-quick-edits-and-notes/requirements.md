# Requirements: 09 inspector, quick edits and frame notes

The full graphic inspector and the hybrid AI showcase. A creator selects a slot and can read what they said, edit the content, timing and look, step through versions, generate the slot in the cloud (☁ 3), type a quick edit that runs on their own device for free, or circle something on the frame and write a note that Gemini Nano fixes from the cropped image. Every AI action shows where it runs before it runs. Lands by **Mon Nov 23, 2026** (Generate needs spec 13 tasks 1–5 on the hosted path, see tasks.md).

Written headlessly by Kiro CLI (`motionpop-builder`, Opus 5.5) on 2026-11-16 from the steering, the code as built, and `design/screens/editor.png` and `editor-generating.png`. Not yet approved by the founder.

Sources: `screens.md` (Editor: inspector, generating state, variants, toasts, offline), `design-system.md`, `editor-timeline.md` (slot states, ⌘G), `hybrid-ai.md` (routing table and rules), `ai-tasks.md` §2, §3, §4, §4b, `data-model.md` (Slot, FrameNote, Version), `security-and-cost.md`, `architecture.md` flows 2 and 4, D-021, D-027, D-028, D-031.

**Already built, reused, not re-specified:** the 360 px inspector shell with the header, "You said", the prompt box, the static quick-edit row and the duration slider (spec 04 task 6); `UpdateParams` and the other commands with undo (spec 04 task 3); `edit.patch` with apply-and-validate (spec 00 task 10); `component.fill` with gates and 2 repairs (spec 07 task 16); auto-fill (spec 06 task 9, spec 07 task 27); the router (D-027); `CostChip`, `Toggle`, `Slider`, `Dropdown`, toasts, `StepCard`, `Shimmer`, `NumberRoll`; slot card states including failed and has-note.

**Out of scope here:** the Pip panel (spec 10); whole-video plans; the credit ledger, out-of-credits modal and Settings (spec 13, consumed through an interface defined here); export (spec 08); per-slot looks (Later); tier-2 custom graphics (spec 15).

## R1 Inspector layout
_As a creator, I want every control for one graphic in one calm column that looks exactly like the design._
1. **R1.1** WHEN a slot is selected and not generating THE SYSTEM SHALL show the inspector sections in this order, matching `editor.png` and the "Graphic inspector" frame in `design/figma-export.css`: header ("GRAPHIC", "Slot N · {component name}", mono time range, ⋯), "You said" card, prompt box with "✦ Generate" and the "☁ 3" chip, quick-edit row with its route chip, CONTENT ▾, STYLE, TIMING, VERSIONS.
2. **R1.2** THE SYSTEM SHALL open a ⋯ menu with "Duplicate" (⌘D), "Use a template" and "Delete", each running the matching undoable command.
3. **R1.3** WHILE the selected slot is generating THE SYSTEM SHALL replace the inspector with the generating panel (R6.4) instead of the sections above.
4. **R1.4** THE SYSTEM SHALL keep every inspector control keyboard reachable with the 2 px violet focus ring, label every input, and respect `prefers-reduced-motion`.

## R2 Content
_As a creator, I want to fix a word or a number myself, without asking anyone._
1. **R2.1** THE SYSTEM SHALL build the CONTENT form from the slot's params schema (a scene's `content`, or a component's top-level params): the first required text field of at least 20 characters as the design's title field, other text fields as compact fields, numbers and short texts (≤ 8 characters, e.g. a suffix) as rows of the data table (label, mono value, colour dot; ember for the focal number), enums as dropdowns and booleans as toggles. Arrays of `{ label, value }` objects render as data-table rows. Beats, images, the scene variant and nested objects are not shown.
2. **R2.2** WHEN the user commits a field (Enter, blur, or a dropdown choice) THE SYSTEM SHALL parse the new params with the slot's schema, and on success apply them and a new version (`source: "user"`) as one undo step.
3. **R2.3** IF the new value fails the schema THEN THE SYSTEM SHALL keep the field in an error state with the schema's message and change nothing.
4. **R2.4** WHERE the slot is a scene and the committed content fails the scene's gates THE SYSTEM SHALL still apply it and show a warning under CONTENT ("This may not fit. Try a quick edit."), because the user decides.
5. **R2.5** THE SYSTEM SHALL collapse and expand CONTENT with its chevron and remember the choice for the session.

## R3 Style
_As a creator, I want to see the look my video uses and change it from here._
1. **R3.1** THE SYSTEM SHALL show the STYLE row as the design does: a mini swatch (three colour dots from the look) and the look's name with a ▾ dropdown of the registered looks and style packs.
2. **R3.2** WHEN the user picks a look THE SYSTEM SHALL apply it to the whole video with the existing `SetStyle` command (one undo step), and the dropdown SHALL say so in its tooltip ("Applies to the whole video").

## R4 Timing
_As a creator, I want to make a graphic slower, smoother or cut, without breaking its sync to my voice._
1. **R4.1** THE SYSTEM SHALL keep the existing duration slider (ResizeSlot, one undo step per adjustment).
2. **R4.2** THE SYSTEM SHALL show the ease picker ("Ease in-out" with its curve icon) with the choices Ease in-out, Ease out and Linear, plus "Look default". The choice is stored on the slot as `timing.ease` and is undoable.
3. **R4.3** THE SYSTEM SHALL show the "Fade" toggle. On (the default) means the graphic plays its own exit before the slot ends. Off means it holds its last landed frame and cuts at the slot end. For library components that cannot skip their exit, the toggle shows on and disabled with the tooltip "This graphic always fades out".
4. **R4.4** WHERE `timing.speed` is set (by a quick edit, e.g. "slower") THE SYSTEM SHALL scale entrance and exit durations by `1 / speed` (speed in 0.5–2). Anchored cues SHALL still land on their spoken word (D-031).
5. **R4.5** THE SYSTEM SHALL render timing identically in the preview and the render (same compiled composition) and keep every frame a pure function of time.

## R5 Versions
_As a creator, I want to go back to the graphic I liked two edits ago._
1. **R5.1** THE SYSTEM SHALL create a version for every AI result (quick edit, frame note, Generate), every committed content edit and every template reset, with `source`, `model` when AI, `costCredits` and a short `label` (the instruction or the action).
2. **R5.2** THE SYSTEM SHALL show the slot's versions as thumbnails with ‹ › paging, three at a time, the current one outlined, and "vN" (mono) for the current version's position.
3. **R5.3** WHEN the user clicks a version thumbnail THE SYSTEM SHALL restore its params and timing as the current version with one undo step.
4. **R5.4** THE SYSTEM SHALL keep at most 20 versions per slot, dropping the oldest one that is not current.
5. **R5.5** WHEN the top bar's history button is clicked with a slot selected THE SYSTEM SHALL scroll the inspector to VERSIONS; without a selection it SHALL show the toast "Select a graphic to see its versions."

## R6 Generate (cloud, 3 credits)
_As a creator, I want a premium version of one graphic when I ask for it, and to know what it costs first._
1. **R6.1** WHEN a slot is selected and its prompt is empty THE SYSTEM SHALL pre-fill the prompt with `prompt.prefill` on the device (free), or with a deterministic template when on-device AI is unavailable, without ever reaching the cloud. WHEN the user edits the prompt and leaves the box THE SYSTEM SHALL save it on the slot (`setSlotPrompt`, undoable), so Generate, reloads and spec 10 see the same prompt.
2. **R6.2** THE SYSTEM SHALL show "✦ Generate" with the "☁ 3" chip before any call. WHEN the user clicks it or presses ⌘G THE SYSTEM SHALL reserve 3 credits through the credits client, then run `component.fill` with purpose `generate` ONLY_IN_CLOUD with the prompt, the current params, and for scenes the catalogue entry, indexed words, 2 exemplars and the gate.
3. **R6.3** IF the balance is below the cost THEN THE SYSTEM SHALL open the out-of-credits modal (spec 13) and make no AI call. IF the user is offline THEN Generate SHALL be disabled with the tooltip "Needs connection". IF the cloud is paused (kill switch) THEN it SHALL be disabled with "Cloud AI is paused". IF there is no cloud at all (local mode, signed out) THEN it SHALL be disabled with "Sign in to use cloud AI".
4. **R6.4** WHILE a Generate runs THE SYSTEM SHALL show the generating panel in place of the inspector (copy from `screens.md`: "MOTION IN THE MAKING", "Bringing it to life", "A few moments. A little magic.", step cards "Finding moments ✓", "Choosing graphics ✓", "N Animating slot N…", "YOUR NEXT MOMENT", the "Keep your ideas moving." card), Pip with sparkles, the slot card in its generating state ("Preparing motion…" then "Animating…"), a thin progress line on the preview frame's top edge, the badge "● Generating…", the footer "● Generating motion…" and the rail bubble "Pip is thinking…". The user can keep editing other slots.
5. **R6.5** WHEN the result passes the schema and gates THE SYSTEM SHALL apply it as a new version (`source: "ai-cloud"`, `costCredits: 3`) with one undo step, set the slot `ready`, and show "● Ready in X.Xs" (the measured latency) on the preview badge.
6. **R6.6** IF Generate fails after its repairs THEN THE SYSTEM SHALL refund the reserved credits. A slot that was not ready SHALL become `failed` ("Couldn't generate" with "Retry" and "Use a template"). A slot that was ready SHALL keep its graphic and show the toast "Couldn't generate" with Retry.
7. **R6.7** IF the slot is deleted, or its component or word range changes, while Generate runs THEN THE SYSTEM SHALL discard the result and refund. Other edits made meanwhile are superseded by the result, and ⌘Z restores them.
8. **R6.8** THE SYSTEM SHALL run at most one Generate at a time per project. Other slots' Generate buttons show "Pip is on it" until it ends.
9. **R6.9** WHEN the user picks "Use a template" THE SYSTEM SHALL apply the scene's safe default from the spoken words (`safeScoreFromWords`, else `sceneFallback`) or the component's defaults, as a version with `source: "default"`, free.

## R7 Quick edit (`edit.patch`, on-device first)
_As a creator, I want to type "make it slower" and see it happen instantly, for free, even offline._
1. **R7.1** THE SYSTEM SHALL show the quick-edit input ("Quick edit… e.g. make it slower") with the route chip computed before the action (R9.3): "⚡ free · on-device" when Nano is ready, "☁ 1" when the edit would run in the cloud, and disabled with "Needs connection" when offline without Nano.
2. **R7.2** WHEN the user submits an instruction THE SYSTEM SHALL run `edit.patch` through the router with the mode chosen in R9.3. The model returns an RFC 6902 patch with only `replace`, `add` and `remove` ops on the editable paths of the slot's edit document (its params plus `/timing/*`). Beats and images are never editable.
3. **R7.3** THE SYSTEM SHALL apply the patch to a copy, parse the result with the slot's schema (and, for scenes, the gates), and on failure send the error back once for repair. Only a valid result is applied, as a new version (`ai-device` or `ai-cloud`) with one undo step.
4. **R7.4** IF the device answer is still invalid after the repair THEN THE SYSTEM SHALL NOT escalate silently. It SHALL show "Couldn't do that on your device." with the action "Try in the cloud ☁ 1", which reserves 1 credit and runs the same edit ONLY_IN_CLOUD.
5. **R7.5** WHEN the model answers `escalate: true` THE SYSTEM SHALL show its message and offer "Generate ☁ 3" for that slot, applying nothing.
6. **R7.6** WHILE the edit runs THE SYSTEM SHALL show a shimmer on the row and Pip's rail bubble "Pip is thinking…". WHEN it lands THE SYSTEM SHALL recompile the slot in the preview and show "● Ready in X.Xs".
7. **R7.7** THE SYSTEM SHALL send the model no JSON Schema text. The patch's `path` is a string enum of the editable paths in the structured output, and the prompt describes each field in one line from the schema's `.describe()` text (ai-tasks.md schema rules).

## R8 Frame notes (`note.fix`, image on-device)
_As a creator, I want to circle the thing that's wrong and say what I want, like I would to a designer._
1. **R8.1** WHEN the user turns on the pen tool in the preview toolbar THE SYSTEM SHALL pause playback and enter draw mode on the frame. The pen is disabled with the tooltip "Notes go on a graphic. Move the playhead onto one." when no slot is under the playhead. Esc leaves draw mode.
2. **R8.2** WHEN the user draws and releases THE SYSTEM SHALL fit the stroke to an ellipse when it is roughly closed, else keep it as a simplified path, normalised to the frame (0..1), and show a numbered bubble with a leader line and the input "What should change?" (design: violet ellipse, numbered bubble "1 Make this bar slower", leader line). WHEN draw mode is on and the user presses Enter instead THE SYSTEM SHALL place the ellipse around the graphic's focal element (`data-focal`), so notes work from the keyboard.
3. **R8.3** WHEN the user submits the note text THE SYSTEM SHALL save the note on the slot under the playhead (`tMs` relative to the slot start, status `open`) as one undo step, and run `note.fix`.
4. **R8.4** THE SYSTEM SHALL send `note.fix` the note text, its region, the texts of the graphic's elements inside the region, and, when frame capture works (task 19 decides), a JPEG crop of the region at most 512 px on its longest side. The crop is never stored or uploaded except as part of an explicit cloud call.
5. **R8.5** THE SYSTEM SHALL route, validate, repair and escalate `note.fix` exactly like the quick edit (R7.2–R7.5, R9.3), and on success apply the patch as a version labelled with the note text and mark the note `fixed` with that version's id.
6. **R8.6** THE SYSTEM SHALL show open notes of the slot under the playhead while paused, hide them while playing, show a fixed note with a mint ✓ "Fixed" and a "Still there?" link for 4 s, and reopen it (status `open`, optional re-run) from that link. The slot card shows its red dot while any note is open.
7. **R8.7** THE SYSTEM SHALL let the user delete a note from its bubble (undoable).

## R9 Route, availability and offline
_As a creator, I want to always know where an action runs and what it costs, and never pay by surprise._
1. **R9.1** WHEN the editor opens THE SYSTEM SHALL detect on-device availability (`available`, `downloadable`, `downloading`, `unavailable`) and show one toast per session: "On-device AI ready · Small edits run instantly on your device, free and private." (mint) or "Using cloud AI · Your browser doesn't support on-device AI yet. Everything still works." (violet).
2. **R9.2** WHERE the model is downloadable THE SYSTEM SHALL offer "Set up on-device AI" in the toast and SHALL only call `initializeDeviceModel()` from that click (user gesture), showing download progress in a persistent toast ("Setting up on-device AI · 34 %"), never blocking the editor. Until it is ready, chips show the cloud route.
3. **R9.3** THE SYSTEM SHALL compute one route per AI action from availability, connection, the user's prefer-on-device setting (spec 13; default on), the Remote Config routing override for the task (`routingOverrides`), the kill switch and the balance, and use the same result for the chip shown before the action and for the router call. A chip that says "free · on-device" SHALL never lead to a cloud call or a charge.
4. **R9.4** WHILE offline THE SYSTEM SHALL show the banner over the preview "You're offline. On-device edits still work. New graphics will generate when you're back.", disable Generate and cloud fallbacks with "Needs connection", and keep on-device quick edits and notes working.
5. **R9.5** THE SYSTEM SHALL report every router call's usage event (task, ranOn, model, credits, latency, ok, attempts, and the credits the call would have cost in the cloud) to the usage sink that spec 13 persists.

## Non-functional
- On-device quick edit: median under 1.5 s from submit to the recompiled preview on an M-series laptop with Nano ready (measured in task 23, not assumed).
- No surprise spend: no code path charges credits without a violet chip with the amount on screen at the moment of the click (property-tested in task 3).
- No new Firestore or Storage paths. Notes, versions and timing live in the project through `ProjectRepository`; the existing `projects/{pid}/{sub}` owner rules cover them when Firestore sync lands.
- Frame-note crops never leave the device unless the user clicks a cloud action.
- Exact design copy; no third-party names; reduced motion respected (no shimmer, no Pip float).

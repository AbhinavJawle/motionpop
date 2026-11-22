# Spec 29: Frame notes on reels

> Written in a Claude Code session (2026-11-22). Founder ask: "where did the [pen] edit button go, which allowed me to circle around stuff or text on the preview and make a comment in the small input window … and the change would be immediately applied to the motion graphic or text? Would it work?" Then: "Implement this reliably. This feature is one of the most important parts of our prod. Implement it ruthlessly, it should be GOOD."

## Why
Frame notes (spec 09) only worked on slot graphics: the pen sat in the slot toolbar and `note.fix` patched slot params. Reels (specs 24–28) have their own engine (`mountReel`), plan (`ReelPlan` scenes) and toolbar, so the pen was simply missing there. Even if it had been shown, a note couldn't reach a reel scene: the scene's content is a strict template with ms cues and fetched pictures, not params with a component schema.

## Requirements (EARS)
### R1 Pen and drawing on the reel preview
- **R1.1** THE reel toolbar SHALL show the pen ("Draw a note") first, enabled whenever the reel has scenes; turning it on SHALL pause playback.
- **R1.2** WHILE the pen is on, THE user SHALL be able to circle or scribble on the reel preview, type the note in the small input that opens ("What should change?") with the route chip, Enter to send, Esc to cancel, exactly as on slots. Enter with no stroke SHALL circle the scene's graphic.
- **R1.3** A note SHALL belong to the scene under the playhead and store its time (integer ms), its shape in stage-relative coordinates, its text and its status. A scene holds at most 12 notes (oldest fixed note evicted first) and notes SHALL NOT remount the preview.
- **R1.4** THE system SHALL read what the note covers from the live preview: which parts (graphic, speaker, caption, tag, hook band, smallest first), the visible texts inside the region, the pictures inside it (by their media request), and a JPEG crop of the region (≤ 512 px, video frame included).

### R2 `reel.note` task (packages/ai)
- **R2.1** THE system SHALL give the model the scene in the director's language (`Graphic`: word indices, brand names, picture subjects) with the spoken words, the circled parts, texts and pictures, the caption and hook, and the note; the answer SHALL be `{ action: edit | none, message, layout?, bg?, tag?, hook?, graphic?, brands[], captions[] }`, zod-validated, with one repair.
- **R2.2** THE system SHALL map the answer back to the scene in code: every item that stays SHALL keep its exact ms cue, every picture that stays SHALL keep its fetched asset, new brands SHALL get a fresh logo request with their domain, layouts SHALL follow the look and template rules (speaker layout only with punch / cta / none; mono split, cream card), tags only on mono.
- **R2.3** WHEN the answer leaves out a field it meant to keep THE system SHALL keep it: optional scalar fields of the same template (kicker, sub, icon…), the brand and icon of an item it only retyped (same text, or same word / position with a shared word), and compare sides by their text (so swapped sides swap logos and icons). An explicit "" SHALL remove a field; a wholly new name SHALL NOT inherit the old logo. WHEN leaving fields out is the only difference ("remove this small text") THE system SHALL apply it as a removal.
- **R2.6** IF a text in the answer would be cut to fit its spot THE check SHALL send it back to the model with the cut it would get, so the repair shortens it ("Train my assistant" → "Train assistant", not "Train my assista").
- **R2.7** A cloud answer stopped for RECITATION SHALL count as an invalid answer and get the one repair, not fail the note.
- **R2.4** THE checks SHALL reject an edit that changes nothing, an invalid graphic, an unknown icon, a caption fix whose words aren't in the scene, and a hook edit on a scene without a hook. Equal scenes SHALL compare equal whatever the key order.
- **R2.5** THE task SHALL route like `note.fix`: PREFER_ON_DEVICE (free) with the cloud at 1 credit (`gemini-3.8-flash`, low thinking, 2,048 output tokens).

### R3 Commands
- **R3.1** `addReelNote`, `deleteReelNote`, `setReelNoteStatus` and `fixReelScene` SHALL be undoable commands; a fix SHALL keep the scene's id, times and notes, and apply the hook and caption fixes in the same step.
- **R3.2** Caption fixes SHALL rewrite the transcript words inside the scene window only (one-for-one when the counts match, merged into one word otherwise), keep word indices and prosody aligned, and undo SHALL restore both the reel and the transcript. The export reads the same transcript.

### R4 Fix flow
- **R4.1** Sending a note SHALL spend first (cloud), look at the preview, run `reel.note`, and apply the result as one composite command ("Fix note": scene + note marked fixed), so one undo reverts it.
- **R4.2** IF the scene, hook or look changed while the model worked THE system SHALL NOT apply the answer and SHALL say so. IF the answer changes nothing THE system SHALL show the model's message and offer the cloud (escalate) when it ran on the device. Any non-apply SHALL refund the credit.
- **R4.3** New pictures (a new logo, photo or illustration) SHALL be fetched in the background after the fix lands and attached only if the scene is still as fixed ("Picture added").

### R5 Feedback
- **R5.1** THE note bubble SHALL show "✓ Fixed" with the model's one-line message ("Changed the title to 'Work smarter'.") and "Still there?" to reopen, and the toasts SHALL cover working, failure with Retry, and "The scene changed while Pip worked".

### R6 Verification
- **R6.1** Unit and property tests SHALL cover the round trip of all 20 templates, cue and asset carry, layout rules, logo carry, checks, captions and the fix flow (stub router running the real parse and check).
- **R6.2** THE task SHALL be run against the founder's reel in the cloud (lab script) on realistic notes, and through the real app (sign in → editor → pen → circle → note → fixed → undo).

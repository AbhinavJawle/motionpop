# Spec 37: Pip works on video reels (requirements)

Written in a Claude Code session (claude-opus-5-5), 2026-11-22, after the founder's report: on a
video reel, Pip answered "there aren't any motion graphics on your video yet" to "add lots of
colours and gradients and make the animations better". Pip only saw voiceover slots; reel scenes,
the reel look, reel sound and reel colours were invisible to it and had no actions.

The founder: "the note and the ai pip chat are the single most important feature. Assume that a
user will spend most time chatting with pip. It should be able to do everything user wants,
including sound effects and what not."

## R1 Pip sees the reel
- R1.1 WHEN the project has a reel THE SYSTEM SHALL send Pip every scene (ref r1..rN in time
  order, template, layout, start and end, a short text summary), the look, the captions state, the
  colour theme, the sound state (effects on/off and level, music kind, added sounds) and the cuts.
- R1.2 THE prompt SHALL describe reel projects as scenes of motion graphics over the speaker, so
  Pip never says a reel has no graphics.
- R1.3 Scene refs SHALL be the only scene ids the model can name (structured output enum); code
  resolves them to scene ids and drops unknown ones with a reason.

## R2 Pip changes the reel
- R2.1 `editScene` (scene, instruction): changes one scene's graphic, text, layout or animation the
  way a frame note does (strong cloud model, sandbox review, one undo step). Cost: the note price,
  plus the custom price when it writes a new graphic.
- R2.2 `setReelTheme` (two colours, background plain / soft / bold): colours and a gradient
  background over the reel's look, in the preview, the export and AI-written graphics. Free.
- R2.3 `setReelLook` (mono / cream), `setCaptions` on/off for the reel. Free.
- R2.4 `clearScene` (scene): back to the speaker, no graphic. Free.
- R2.5 `regenerateReel` (optional direction): directs the whole reel again (director price).
- R2.6 Cuts and punch-ins keep working on reels.
- R2.7 A plan may hold up to 12 steps.

## R3 Pip runs the sound
- R3.1 `setSound`: effects on, off, louder or quieter; clears added sounds. Free.
- R3.2 `setMusic`: none, calm pad, steady pulse (synthesised, free), or AI music from a brief
  (charged at the music price).
- R3.3 `addSound` (kind whoosh / pop / tick / rise / impact, at a word): an extra hit on the reel.
  At most 40 added sounds. Free.
- R3.4 THE reel preview and the export SHALL play the project's sound settings (effects on/off,
  effects level, synthesised music and its level) and the added sounds. The preview and the
  export mix the same bed.

## R4 Honest and safe
- R4.1 Every step's cost is computed in code and shown before Apply all; a step that fails is
  skipped with a reason; Apply all's instant steps are one undo step.
- R4.2 Colours from the model are parsed as #RRGGBB and pushed to readable contrast in code.
- R4.3 Voiceover (slot) projects keep working exactly as before.

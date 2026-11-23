# Spec 32: Editor shine (calm studio pass)

> Written in a Claude Code session (2026-11-22). Founder ask, after comparing our editor with a competitor's calm, light editor: "lets make that editor shinnneeeeeeeeeeee. you are a professional designer … the ui images we have in the project are old you will have to take screenshots yourself." The `design/screens/editor.png` reference is superseded for the editor (decision D-080); new references are screenshots of this pass.

## Why
Screenshots of `/editor/demo` (1440×900) showed why the editor felt busy rather than premium: the preview was capped at 405 px tall in a large empty area, about eight accent colours competed (ember export, ember playhead, violet film button, violet add-graphic, mint synced pill, glowing green audio band, ember voice band, ember "Make picture"), track labels were tiny letter-spaced caps, two controls only showed "on its way" toasts, the editor opened on a blank frame and clicking a slot did not move the preview to it.

## Requirements (EARS)
### R1 The video is the hero
- **R1.1** THE preview frame SHALL be the largest box that fits its workspace at the project's aspect ratio (no fixed 405 px cap), with even padding.
- **R1.2** THE save status and the style name SHALL move out of the footer under the preview (the save status beside the project title, the style into the preview toolbar), so the frame gets the height. The "SCENE 00 / 04" counter SHALL be removed.
- **R1.3** THE ambient colour blobs behind the preview SHALL be removed; the workspace is a plain, slightly lifted surface.

### R2 One job per colour
- **R2.1** Ember SHALL mean "now / primary": the Export button and the playhead only.
- **R2.2** Violet SHALL mean "AI": Generate, Make it a film, selection. Secondary AI buttons use a violet tint, not a solid fill.
- **R2.3** Mint SHALL mean "on-device / free" chips only. "Synced" and "All changes saved" SHALL be plain text.
- **R2.4** Tracks SHALL be neutral: the voice waveform white (bright where played), the audio band a neutral surface without glows, effect pills neutral.
- **R2.5** Picture actions in the inspector SHALL be secondary (neutral) buttons.

### R3 Calm type and fewer controls
- **R3.1** Track labels SHALL be sentence case (Graphics, Video, Words, Voice, Sound), 11 px, regular weight.
- **R3.2** Controls that do nothing yet ("Fit" preview zoom, "Timeline settings") SHALL be removed.
- **R3.3** Slot cards SHALL use a neutral surface with a hairline border; selection SHALL be a violet ring, not a gradient border with bloom; ready is the default state and SHALL carry no dot.

### R4 The graphic is on screen
- **R4.1** WHEN the editor opens without `?t=`, THE playhead SHALL start at the first ready graphic's key moment (else the first slot's), so the first frame shows a graphic.
- **R4.2** WHEN the user clicks a slot while paused, THE playhead SHALL move to that slot's key moment.

### R5 Nothing else changes
- **R5.1** Behaviour, keyboard shortcuts, aria labels used by tests, and the reel editor keep working; typecheck, lint and the web unit suite stay green; the e2e editor specs that assert chrome pixels move to the new reference.

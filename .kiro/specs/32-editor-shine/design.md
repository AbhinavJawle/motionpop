# Spec 32 design

## Look ("calm studio")
- Surfaces: page `bg`, preview workspace `bg` with a soft inner vignette only; frame shadow `0 24px 60px rgb(0 0 0/.45)` plus a 1 px white/8 ring.
- Colour roles (R2): ember = Export + playhead; violet = AI + selection; mint = on-device chip; everything else neutral (`text`, `text-2`, `text-3`, white/x lines).
- Type: sentence case labels in `text-3`, 11 px; mono only for timecodes.

## Layout
- `PreviewPane`: a `useFitBox` hook measures the workspace (ResizeObserver) and sets the frame's width and height to the largest aspect-correct box (R1.1). Toolbar on top; the style name joins the toolbar; footer removed (R1.2).
- `TopBar`: `SaveIndicator` moves beside the title as quiet text.
- Timeline geometry (`TL`) unchanged, so drag, snapping and tests keep their numbers.

## Behaviour
- R4.1: in `EditorScreen`, after the voice loads and when `initialMs` is undefined, seek to `keyMomentOf(firstReady ?? first)`.
- R4.2: the slot click path (`slots-track.tsx`) calls `clock.seek(keyMoment)` when not playing and the pointer did not drag.

## Testing
Unit suite + typecheck + lint; screenshots at 1440×900 and 1920×1080 before and after; the editor design spec's chrome regions re-baselined against the new screenshot (D-080).

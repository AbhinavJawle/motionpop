# Spec 34 · Marketing site (design)

> Claude Code session, 2026-11-22.

## Tokens
| Name | Value | Role |
|---|---|---|
| ink | #000000 | outlines, type, primary buttons, nav |
| paper | #FFFFFF | page |
| ember | #FF6A3D | brand accent, highlights, sign-up |
| pip | #8DBCEB | Pip's blue: spots, the on-device panel |
| violet | #8B7CFF | AI and plans |
| mist | #F3F3F1 | panel insides |

Type: Bebas Neue (display, caps by design), Geist Mono (body, like capy's mono body), Patrick Hand (speech bubbles and frame notes only).

## Layout
1124 px column, left-aligned heads with a round ink "spot" above each, a call to action on the right of the head row (capy). Panels: white shapes outlined with a drop-shadow ink stroke; how-it-works panels slant like a storyboard. Section order: hero, ticker, product frame, how it works, looks, hybrid AI, Pip plans, features mosaic, audiences, stitched-together, pricing, FAQ, closing call, footer.

## Assets
- `public/pip/clapper.webm|webp`, `public/pip/juggle.webm|webp`: rendered from the founder's Rive projects (`~/Developer/pip-rive/pip-float`, `pip-states` Juggle) by difference matting (each frame rendered on white and on black; alpha = 1 − (W − B)/255), 30 fps, seamless loops. `.riv` files aren't played on the page (D-079 splash watermark).
- `public/landing/editor-studio.jpg`: the spec 33 editor at 1440×900, 1.5×.
- Fonts in `components/landing/fonts/` (OFL).

## Motion
One load sequence in the hero (headline lines, then the frame); the phrase ticker; Pip loops. Everything else is still; reduced motion stops the ticker and shows still Pips.

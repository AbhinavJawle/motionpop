# Spec 35 design: paper app screens

## Idea
The marketing site is a storyboard drawn in ink on white paper. Today the app behind it is a generic dark card kit, so signing in feels like walking into a different product. Spec 35 makes everything outside the editor one continuous storyboard. The editor stays the dark cutting room (spec 33): you leave the paper and step into the edit.

## Tokens
| Name | Hex | Role |
|---|---|---|
| Paper | `#ffffff` | page |
| Ink | `#000000` | text, 2 px rules, hard shadows, primary buttons |
| Mist | `#f3f3f1` | quiet fills (inputs, wells, list rows) |
| Ember | `#ff6a3d` | the one action colour: record, new project |
| Pip blue | `#8dbceb` | Pip's own highlight (selection, Pip notes) |
| Mint / violet | `#2fc48d` / `#6b5cf0` | on-device / cloud, as in the editor |

Type:
- **Bebas Neue** for titles and big numbers.
- **Geist Mono** for body text. Scripts are typewritten, so the app reads like a screenplay.
- **Patrick Hand** only where Pip speaks (notes, bubbles).

Shape:
- 2 px ink rules.
- 8 px radius on controls, 12 px on frames.
- Hard 3 px ink shadows on things you press or open, none on reading surfaces.

## Mechanism
- `globals.css` gains `html:has([data-paper])`. It redefines the shared tokens (`--color-bg`, `--color-text`, `--color-card`, `--color-line`, `--color-dialog`, the tints, …) to paper values and sets `color-scheme: light`. Every utility that already reads a token (menus, modals, dropdowns, toasts, chips) turns paper with no forks, including portals.
- The editor never mounts `[data-paper]`, so it stays dark.
- `@theme` gains `ink`, `paper`, `mist` and `pip` colours, `font-poster` (Bebas) and `font-scrawl` (Patrick Hand). The fonts' CSS variables move to `<html>`.
- `components/paper/`:
  - `PaperPage`: the marker and the base type.
  - `AppBar`: the film-strip bar used by dashboard, styles and settings.
  - `inkButton()`: class helper (ink / paper / ember, md / lg).
  - `Frame`: an ink-ruled panel.
  - `PipNote`: a handwritten note.
  - `Sprockets`: a film-strip edge.

## Screens (one bold thing each)
- **Dashboard** (the desk):
  - A poster greeting ("GOOD AFTERNOON, ABHINAV."), with Pip's clapper loop beside it.
  - Under it, the capture bar as a thick ink frame with a hard shadow and an ember record button. This frame is the boldest element on the page.
  - Then the lead frame: the last project's poster on a film strip, with its slot states as storyboard ticks and Resume.
  - A sentence of this week's numbers.
  - "Projects" as film frames.
  - The look strip.
  - The "Shared with me" tab is removed (nothing can be shared into an account).

  ```
  ▓▓ film strip bar ▓▓  motionpop  PROJECTS  STYLES        120 credits  [+ NEW PROJECT]  ◉
  GOOD AFTERNOON,                                   (Pip clapper)
  ABHINAV.                                          "what are we making today?"
  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓▀
  ┃ (● REC) Hold to record │ …or paste a script     ⌘K ┃▀
  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛▀
  PICK UP WHERE YOU LEFT OFF
  ┌ ▮▮▮▮▮▮▮▮▮▮▮▮▮▮ ┬────────────────────┐
  │   poster        │ SAMPLE VOICEOVER   │
  │ ▮▮▮▮▮▮▮▮▮▮▮▮▮▮ │ ▣▣▢  2 of 3 ready  │
  └─────────────────┴ [RESUME]──────────┘
  PROJECTS (2)                       [search] [sort] [▦ ≡]
  [frame] [frame] [frame]
  TRY A LOOK                                   All looks
  [poster] [poster] [poster] [poster] [poster]
  ```
- **Sign-in:** split. On the left, the sign-in form in an ink frame. On the right, a black panel with Pip juggling and the product's promise.
- **Start:** a poster headline and three takes side by side as slanted storyboard panels (Record, Upload, Script), the same slant as the marketing "How" section. "Try a sample" is visible.
- **Record:** the running clock in huge Bebas is the hero, with an ink meter and plain controls.
- **Script:** a writing sheet (ruled paper) on the left, with voice and pace choices as ink chips.
- **Processing:** the steps as a numbered shot list (it really is a sequence), the words filling in below, and Pip's note.
- **Styles:** look posters in ink frames.
- **Settings:** a left index and paper sections.
- **Share:** the video on a black stage with a paper caption.
- **Legal:** a readable paper column.

## Review against defaults
- Black and white with one hot accent is close to "near-black plus vermilion". Here it is white paper with ink, and it continues the site the founder approved, so the whole product reads as one thing. Ember is kept for recording and creating only.
- No all-caps eyebrows above headings. Bebas titles are the headings themselves. The "YOUR CREATIVE SPACE" eyebrow is removed.
- No middot meta strings or "→" in buttons. Numbered markers appear only in Processing, which is a real sequence.
- Motion: no entrance choreography. Pip's loops are the only ambient motion. Buttons press into their shadow.

## Testing
- Unit tests for settings, share and account menu keep their roles and names.
- `processing.spec`, `auth.spec` and `credits-design` keep their selectors.
- Screenshots at 1440 are compared with the before shots.

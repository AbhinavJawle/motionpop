# Looks: reference provenance

What each polished look took from where. Looks are original: no creator, channel or brand is named
or imitated, and no reference image ships in the product.

## Paper Collage (`paper-collage.json`, spec 07 task 22)

_Written in the Kiro IDE (Claude Opus 5.5), 2026-11-15._

**References.**

1. The design's own thumbnail of the style, frame "Preview · Paper Collage" in
   `design/figma-export.css` (the Projects and Styles screens).
2. The task 1 cutout spike (`docs/research/experiments/cutout-spike/`), for the image recipe. It
   held the look across 6 subjects without reference images (D-030).

Nothing else was used.

**Taken from the design thumbnail:**

- **Colours:**
  - kraft background `#DFCDB7`;
  - cream paper `#F7F0D8` (the `highlight` token);
  - coral paper `#D96648` (the `accent`, used as a fill for strips and cut pieces).
- **Tape.** The thumbnail's tape strip `#C4C49F` is rotated by about 14°. The `tape` material
  (shared with Field Notes) already gives a translucent cream tape at about ±5°; it stays shared
  rather than tinted per look.
- **Rotation.** The thumbnail turns its paper pieces by -4° and +5°. Here the `tilt` material
  turns them by 0.8°–2.4°, seeded per surface. The text turns with its paper, and the stage
  reduces or drops the tilt when the turned text would leave the safe area or touch other text.
  Larger angles made 9:16 lines run out of the safe area.
- **Type.** The thumbnail sets Geist 600 for display and Geist 500 for labels, so the look uses
  the bundled Geist. It adds no font, so `docs/third-party.md` has nothing new.
- **Copy tone.** "Cut. Paste. Make it move.", "A little rough around the edges" and
  "Unpolished. On purpose." informed the description, not the scenes.

**Changed from the design, and why:**

- **Ink is `#1F1A17`, not `#352F29`.** Text sits on coral strips and cut pieces, and `#352F29`
  on the coral is 3.7:1, under the 4.5:1 that `motion:check` requires. `#1F1A17` is 4.9:1 on
  the coral, 11.1:1 on the kraft and 15.1:1 on the cream.
- **Text on coral is ink, not the thumbnail's cream `#FFF5DE`.** Cream on that coral is 3.3:1.
  The coral itself is kept exactly.
- **Muted is `#5F4C40`, not `#6F5B4D`.** The thumbnail's labels are 4.1:1 on the kraft;
  `#5F4C40` gives 5.2:1.

**Motion (not in the thumbnail; from spec 07's design table):**

- **Stepped at 12 fps** (`personality.stepFps`). Entrances hold each pose for 1/12 s, and each
  paper piece wobbles by a seeded turn of up to 1.6° per step. The wobble is gone on landing,
  so landed text never moves during its read time (D-031).
- **Text slams in** like paper slapped down. Numbers count. Shapes pop.
- **Camera:** small pushes (1.00 → 1.03), layer parallax, no snap-zooms.
- **Emphasis is cut out** (the `cutout` mark):
  - one cut piece behind each emphasised word, with straight scissor cuts at seeded corners,
    turned up to ±2.5°;
  - the pieces alternate the coral and a darker kraft (`bg` mixed 12 % towards `ink`), because
    cream on cream would vanish;
  - a number gets one coral piece. This is the "torn coral strip behind it" of spec 07 R3.3.
- **Strips** (the stat label, the punch words) are coral colour strips with a torn edge and a
  soft shadow. **Cards** are cream paper, torn, taped and tilted.

**Image recipe** (from the spike): `{subject}, vintage 1970s magazine photo cut-out, visible
halftone print dots, slightly faded warm colours`. Treatment: key, white border, tilt, tape.

**Checked:**

- `motion:check stat-punch` and `hook-statement` in all three formats: 0 failures.
- Contact sheets reviewed for 16:9, 9:16 and 1:1.
- The parity test renders one scene project per polished look and compares the preview with
  the MP4 at 5 frames. Paper Collage's worst tile was 3.0 % against a 10 % limit.

## Field Notes (`field-notes.json`, spec 07 tasks 20–21)

_Written headless on Kiro CLI (claude-sonnet-5.5), 2026-11-16, from the repo's own records (the
look file, `DEV_LOG.md`, spec 07's `design.md`, the genre table in
`docs/research/motion-graphics-taxonomy.md`, and `docs/third-party.md`)._

**References.** No reference image, screenshot or design frame was used, and none ships in the
product. The look was written in a Claude Code session (Fable 5.2, commit `aceb703`) from a
description, not from a picture: the spec 07 table calls it "a reporter's desk: maps, documents,
taped photos, red marker". Two sources shaped it, both in general terms:

1. The genre row "Editorial / documentary explainer: paper textures, newspaper clippings,
   highlighted text, maps" in `docs/research/motion-graphics-taxonomy.md`.
2. The stock idea of a reporter's working desk: aged paper, heavy black ink, a red marker for
   circling what matters, and handwritten margin notes.

Nothing else was used. The name, tagline and tags are original; no creator, channel or brand is
named or imitated.

**Palette (all values are original choices; none was sampled from a reference):**

- **Paper `bg #ECE4D2`:** a warm, slightly aged off-white. Cards and clippings are this colour
  mixed 55 % toward white (`materials.ts`), so they read as a fresher sheet on the desk.
- **Ink `#1B1916`:** a warm near-black, 13.9:1 on the paper.
- **Muted `#62594D`:** secondary text, 5.4:1 on the paper.
- **Accent `#D62A1C`:** the marker red. 3.9:1 on the paper, so it is used for strokes (circles,
  underlines), not for body text.
- **Accent 2 `#1E5AA8`:** a ballpoint blue, 5.4:1 on the paper.
- **Highlight `#FFE04A`:** highlighter yellow behind ink text, 13.4:1.
- **Positive `#2C7A4B`, negative `#C2261A`, chart greys `#B9AE98` / `#877C68` plus the red:** data
  colours, also original choices. Their contrast was not measured separately; no chart scene uses
  this look yet.

The contrast figures were computed for this README (WCAG relative luminance) and agree with what
`motion:check` enforces (4.5:1 for text).

**Fonts (all bundled, all SIL OFL 1.1, recorded in `docs/third-party.md`):**

- **Geist** (display weight 800 and body) and **Geist Mono**: the product's own bundled faces,
  licence file `fonts/OFL-Geist.txt`.
- **Caveat** (hand font for notes and labels): latin subset of the variable woff2 from
  `@fontsource-variable/caveat` 5.3.0, licence file `fonts/OFL-Caveat.txt`.

**Libraries behind the marks (MIT):** `roughjs` (marker circle and underline, always given a
non-zero seed) and `perfect-freehand` (highlighter stroke). Both are recorded in
`docs/third-party.md`.

**Motion.** Snappy and lively: `outExpo` entrances of 480 ms, text masked in, strokes drawn on,
overshoot 5 %, camera push 1 → 1.05 with a quick snap, marker marks revealed by stroking on.
Landed text never moves during its read time (D-031).

**Deviations, and why:**

- **The marker circle is rare.** A circle needs about 1.45× the width of its text to clear the
  glyph corners. It fits only in the centred 16:9 variants. Everywhere else, and whenever it
  would leave the frame or cross other text or a VS disc, the mark falls back to a marker
  underline. Circling text and cutting through it were the first draft's flaw (DEV_LOG).
- **`marker-arrow`, `torn-rule` and `stamp` are mapped in the look file but not built yet** (task
  20 leftovers). Until they are, the pointer, divider and badge roles fall back to plain shapes,
  as the look contract allows. The `versus` divider is a plain muted line for this reason.
- **The `versus` "VS" disc is ink, not the red.** Paper-coloured text on the red reads 3.94:1 and
  ink on it 3.5:1, both under 4.5:1, so the disc takes the ink colour (KIRO_LOG, task 23). The
  look's `strip` surface is paper, so no red strips carry text here.
- **Photos are not taped yet.** The `photo` surface (white border, tape, tilt) is defined, but
  images arrive with tasks 25–26, so the look has not been reviewed with real photographs.
- **Not adopted:** grain, halftone, glow and grid effects (skipped as plain, handoff §3 item 7).
  Paper grain is the shared seeded texture tile (`grain 0.06`, vignette 0.14).

**Checked:**

- `motion:check` for `stat-punch`, `hook-statement` and `versus` in this look in all three
  formats: 0 failures (see `KIRO_LOG.md` for the latest counts).
- Contact sheets reviewed in 16:9, 9:16 and 1:1, plain and in this look.
- The parity test renders one scene project in this look and compares the preview with the MP4
  at 5 frames: worst tile 3.77 % against a 10 % limit.

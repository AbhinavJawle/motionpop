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

## Field Notes (`field-notes.json`)

Its provenance README is still open (spec 07 task 21).

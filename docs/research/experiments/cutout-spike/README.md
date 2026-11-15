# Cutout and image-style spike (spec 07 task 1, 2026-11-15)

Run in a Claude Code session. Prototype scripts, not product code. Result and decision: `docs/decisions.md` D-030.

- `gen.py`: generates the test images with `gemini-nano-banana-2.1` (and two with `gemini-3.1-flash-image`) through the Agent Platform REST endpoint, using the developer's own Google credentials. 22 images in total.
- `key.py`: the colour-key prototype (border-estimated key colour, soft matte, backdrop unmixing, despill). The product version will be TypeScript in a worker.
- `sheet-key-overview.jpg`: all 12 keyed images on dark and light surfaces.
- `sheet-key-crops2.jpg`: 100 % crops after unmixing and despill (hair, the green-tinted mug, glass).
- `sheet-compare.jpg`: top row: the mug with the neutral-light prompt line (light, dark), the "same subject on white" edit pass, glass with the neutral-light line. Bottom row: BiRefNet lite matte on hair and bicycle spokes (light, dark).
- `sheet-style.jpg`: top row: two reference images, then two new subjects from the text recipe alone. Bottom row: the same subjects with the two references, on `gemini-nano-banana-2.1` and on `gemini-3.1-flash-image`.

The people in the images are AI-generated and are not real.

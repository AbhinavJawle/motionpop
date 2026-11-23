# Pip — The Idea Machine (Rive source)

A 4.0 s seamless infinite character animation loop (`240` frames at `60 fps`) of Pip enthusiastically sketching in his open sketchbook.

- `source/pip-sketch-reference.png` is the reference illustration (1032 × 928 RGBA).
- `tools/cut.py` separates the flattened reference into 13 clean, texture-preserving painterly layers in `art/`:
  - `body`: Pip's impasto head and torso (eyes, smile, left paw, pencil overlap, and right arm removed and texture-filled; clean fur extension tucked behind the sketchbook).
  - `eye_l`, `eye_r`, `smile`: Painterly charcoal face features for blinks, active pencil tracking, expressions, and 2.5D head-turn parallax.
  - `arm_left`: Pip's free left paw resting on the left page for balancing shifts and celebratory pats.
  - `arm_right`: Pip's right drawing arm behind the pencil, rebuilt cleanly with matching impasto texture so it connects Pip's shoulder seamlessly to his paw.
  - `tail`: Pip's curled left ghost lobe behind the book for playful spring-driven wags.
  - `book`: Open sketchbook with left-paw overlap, pencil tip, shadow, bookmark, and original doodle cleanly texture-filled.
  - `page_l`: Left page's top sheet for organic 2-bone page curl and flutter.
  - `bookmark`: Curled white ribbon bookmark for secondary swing and bounce.
  - `pencil`, `paw`, `shadow`: Orange wooden pencil (barrel rebuilt cleanly behind the paw), drawing paw in front of the shaft, and soft brown cast shadow.
- `tools/mesh.py` builds outline-based Delaunay meshes and C1 bone weights (`tools/meshes.json`) for `body` (3 spine bones: `BodyRoot -> Head -> Crown`) and `page_l` (2 bones: `PageSpine -> PageTip`).
- `tools/build.py` writes `scene.rml`:
  - Arc-length-parameterized painterly 3-layer orange strokes synchronized 1:1 with the pencil tip across all 5 beats (rapid scribbling, curious thinking lift & head tilt, excited burst + popping star doodle, iconic original orange swirl + dot with celebration bounce, and quick finishing strokes).
  - Periodic splines and multi-lap periodic springs guarantee seamless loop continuity across frame 240 -> 0.
- `tools/render.py` renders frames via the Rive CLI on black and white to recover true alpha, measures loop seam error (`0.064` against `6.13` mean per-frame motion across 120 frames at 30 fps), builds `build/sheet.png`, and encodes `build/sketch.webm` (VP9 with alpha, `720 × 640`, 30 fps, ~1.5 MB), `build/sketch.webp` (still, ~54 kB), and `build/sketch.mp4` (2-loop preview on warm paper).

```bash
uv run --with opencv-python-headless --with numpy --with pillow python3 tools/cut.py
uv run --with opencv-python-headless --with numpy --with pillow python3 tools/mesh.py
python3 tools/build.py
rive . --verify
uv run --with numpy --with pillow python3 tools/render.py 2 --encode 26 --mp4
cp build/sketch.webm build/sketch.webp ../../public/pip/
```

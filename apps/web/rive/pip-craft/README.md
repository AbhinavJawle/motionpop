# Pip — The Craftsman (Rive source)

A 4.0 s seamless infinite character animation loop (`240` frames at `60 fps`) of knitted Pip busily cutting and advancing 35 mm film with articulated orange-handled scissors.

- `source/pip-craft-reference.png` is the reference artwork (`2000 × 2000` RGBA).
- `tools/cut.py` separates the reference at `SCALE = 0.5` (`1000 × 1000` artboard units) into 12 texture-preserving RGBA layers in `art/`:
  - `body`: Pip's fuzzy cream head and chunky brown knitted wool skirt (eyes, smile, left paw, and film-strip overlap cleanly reconstructed with matching wool/knit texture).
  - `eye_l`, `eye_r`, `smile`: Warm dark-brown oval eyes and curved smile.
  - `paw_left`, `paw_right`: Independent knitted mittens (orange scissor handles cleanly painted out of `paw_right` with knit texture).
  - `blade_front`, `blade_back`, `scissor_pivot`: Individually articulated scissor halves (clean transparent finger holes, hidden steel crossing reconstructed under `blade_front`, and central silver pivot screw).
  - `film_tile`, `film_offcut`, `film_chip`: Seamless repeating 5-frame 35 mm film strip (with transparent sprocket perforations on both sides), matching 1-frame rectangular offcut, and corner trim chip.
- `tools/mesh.py` builds an outline-based Delaunay mesh and C1 bone weights (`tools/meshes.json`) for `body` driven by 4 bones (`TorsoRoot -> Head -> Crown` upward, plus `HemBone` downward for springy knitted-hem follow-through).
- `tools/build.py` writes `scene.rml` with true two-blade scissor articulation straddling the film strip (`blade_front` in front of the film, `blade_back` behind it), metallic blade glints, +1-frame film advance with left-paw grip adjustment, detaching offcuts that conserve exact 4-frame length across the loop seam, and periodic splines/springs for seamless infinite looping.
- `tools/render.py` renders frames via the Rive CLI on black and white to recover true alpha, checks the loop seam (`0.097` against `6.37` mean per-frame motion across 120 frames at 30 fps), builds `build/sheet.png`, and encodes `build/craft.webm` (VP9 with alpha, `720 × 892`, 30 fps, ~1.52 MB), `build/craft.webp` (still, ~81 kB), and `build/craft.mp4` (2-loop preview on warm paper).

```bash
uv run --with opencv-python-headless --with numpy --with pillow python3 tools/cut.py
uv run --with opencv-python-headless --with numpy --with pillow python3 tools/mesh.py
python3 tools/build.py
rive . --verify
uv run --with numpy --with pillow python3 tools/render.py 2 --encode 26 --mp4
cp build/craft.webm build/craft.webp ../../public/pip/
```

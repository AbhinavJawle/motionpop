# Pip — The Soundweaver (Rive source)

A 4.0 s seamless infinite character animation loop (`240` frames at `60 fps`, exact `120 BPM`) of mint-green marker-styled Pip grooving in oversized pink-and-blue headphones while colorful hand-drawn sound waves and waveforms pulse outward.

- `source/pip-sound-reference.png` is the reference illustration (`1024 × 1024` RGBA).
- `tools/cut.py` separates the artwork at 1:1 into 16 marker-and-crayon RGBA layers in `art/`:
  - `body`: Mint-green ghost body with authentic irregular hot-pink and cobalt-blue marker outline and flowing scalloped bottom (eyes and smile painted out cleanly; clean mint/pink rim tucked behind ear cups).
  - `eye_l`, `eye_r`, `smile`: Cobalt-blue hand-drawn facial features.
  - `headband`, `ear_left`, `ear_right`: Independently animatable oversized headphone components.
  - `wave_l_1/2/3`, `wave_r_1/2/3`, `dot_l_pink`, `dot_l_mint`, `dot_r_mint`: Authentic hand-drawn marker sound-wave arcs and floating bubbles separated from the character.
- `tools/mesh.py` builds a 128-vertex outline-based Delaunay mesh (`0` missed pixels) with 6 bones (`Torso -> Head` upward, plus 4 independent downward scallop bones `Lobe1..Lobe4`) so the lower scalloped hem ripples organically in a traveling wave.
- `tools/build.py` writes `scene.rml`:
  - 120 BPM groove bounce, sway, alternating tilts, squash-and-stretch, Full Groove double bounce (`1.6–2.4 s`), and Rhythmic Flourish (`2.4–3.2 s`).
  - Overlapping damped-spring headphone bounce and opposing ear-cup bass thump/rotation.
  - Polyrhythmic 5-against-4 outward-traveling sound-wave trains (5 cycles/4 s left, 4 cycles/4 s right) + flourish double-arc pulse + floating marker bubbles, circular pulse rings, sound ticks, and hand-drawn marker audio waveforms.
- `tools/render.py` renders frames via the Rive CLI on black and white to recover true alpha, checks the loop seam, builds `build/sheet.png`, and encodes `build/sound.webm`, `build/sound.webp`, and `build/sound.mp4`.

## Verified Output Metrics

- **Rive verify (`rive . --verify`)**: `0` errors
- **Loop duration**: `4.00 s` (`240` frames @ `60 fps`, exported at `30 fps` / `120` frames)
- **Seam error (`frame 240` vs `frame 0`)**: `0.0452` (vs `4.955` mean step motion)
- **Content bounding box**: `(66, 140)–(953, 784)` (`887 × 644`, `clipped=False`)
- **Encoded assets**: `760 × 552 @ 30 fps` — `sound.webm` (`2.46 MB`, transparent VP9 `yuva420p`), `sound.webp` (`80 kB`), `sound.mp4` (`1.54 MB`, 2-loop H.264 preview)

```bash
uv run --with opencv-python-headless --with numpy --with pillow python3 tools/cut.py
uv run --with opencv-python-headless --with numpy --with pillow python3 tools/mesh.py
python3 tools/build.py
rive . --verify
uv run --with numpy --with pillow python3 tools/render.py 2 --encode 26 --mp4
cp build/sound.webm build/sound.webp ../../public/pip/
```

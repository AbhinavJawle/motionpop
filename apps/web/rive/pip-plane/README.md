# Pip on the paper plane (Rive source)

"Pip sends your story into the world": a 3 s seamless flight loop, shown in the landing page's closing section as `public/pip/plane.webm` (VP9 with alpha, 840 x 564, 30 fps) with `public/pip/plane.webp` as the still (reduced motion, Safari). The page plays the WebM through `PipLoop`, never the `.riv` (D-079: the workspace plan adds a splash watermark to published files).

- `source/pip-plane-reference.png` is the founder's reference picture.
- `tools/cut.py` cuts it into `art/` with a known-backdrop matte. The layers are the plane (rebuilt behind Pip: its top edge is one straight line from tail to nose), the smoke trail, Pip's body (with the left arm painted out), the waving arm (with a fur tube behind the body so it can turn at a hidden shoulder) and the left arm. It needs numpy, pillow and opencv-python-headless.
- `tools/build.py` writes `scene.rml`. The flight is a periodic spline through hand-placed poses (pull back, launch, swoop up and bank, turn, return), so the loop matches in value and velocity. Pip rides it on damped springs driven by the plane's own accelerations, simulated until they repeat. Pip leans back on the launch, squashes on the pull-up and sways through the turn. The raised arm waves three times and the other arm follows through. Ink speed streaks, swooshes and sparks start and finish inside the loop. The script warns if any of them would leave the artboard.
- `tools/render.py` renders every frame with the Rive CLI on white and on black, recovers the alpha and checks the seam: frame 180 against frame 0 differs by 0.04, against 1.4 for one frame of motion. With `--encode <crf>` it also writes `build/plane.webm` and `build/plane.webp`. `tools/strip.py` makes filmstrips around Pip.

```bash
python3 tools/cut.py            # only if the reference or the cut changes
python3 tools/build.py
rive . --verify
python3 tools/render.py 2 --encode 28
cp build/plane.webm build/plane.webp ../../public/pip/
```

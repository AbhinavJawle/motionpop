# Pip — The Caption Goblin (Rive source)

A 4.0 s seamless infinite pixel-art character animation loop (`240` frames @ `60 fps` quantized into `60` crisp `15 fps` pixel-art steps using `interpolationType="hold"`) of Pip frantically typing, grabbing, rearranging, and synchronizing flying caption blocks.

- `source/pip-caption-reference.svg` is the reference pixel-art illustration (`1024 × 1024`).
- `tools/cut.py` strips the 33 semi-transparent / `#FEFDFD` auto-trace background blobs, enforces strict binary hard-edged pixel alpha (zero anti-aliasing), and exports 33 crisp 1:1 pixel-art layers into `art/`:
  - `body_neutral`, `body_lean`, `body_squash`, `body_hop`: 4 discrete pixel-art body poses with reconstructed hidden torso behind the caption panel and arms.
  - `hem_0`, `hem_1`, `hem_2`: 3 discrete scalloped-hem pixel ripple frames.
  - `headset`: separated coral earpiece and boom microphone riding Pip's head with 1-step overlapping pixel lag.
  - `face_normal`, `face_blink`, `face_focus`, `face_wide`, `face_happy`: 5 crisp pixel-art facial expressions.
  - `arm_l_orig/type_up/type_dn/shove/cheer` and `arm_r_orig/type_up/type_dn/grab_mid/cheer`: 10 pixel-art arm poses for rapid 15 Hz alternating typing, grabbing/shoving captions, and celebratory gestures.
  - `panel_bg`, `panel_flash`, `keypad`, `cursor`, `bang`, and all 5 original floating pixel decorations (`deco_*`).
- `tools/build.py` writes `scene.rml` (`66` keyed objects, strictly stepped `hold` keyframes at `15 fps` on exact integer pixel coordinates with zero rotation/subpixel blur):
  - **0.0–0.7 s**: Rapid alternating typing + incoming coral caption block snaps into Slot 4.
  - **0.7–1.5 s**: Caption chaos — old Row 1 clears, new blocks pop in crooked, Pip physically shoves and grabs them into alignment.
  - **1.5–2.3 s**: Perfect synchronization — vertical timing playhead and pixel mouse cursor sweep across all 4 slots with rhythmic sync flashes and a left-hand micro-correction tap on Slot 3.
  - **2.3–3.2 s**: Speed burst — rapid live subtitle cascade at max 15 Hz typing speed with flashing keypad keys and dramatic final catch.
  - **3.2–3.6 s**: Satisfying finish — full panel sync flash, 8-particle pixel starburst, and proud `^ ^` arms-up celebratory double bounce.
  - **3.6–4.0 s**: New task — fresh coral block immediately spawns and Pip dives right back into typing seamlessly into frame 0.
- `tools/render.py` renders via Rive CLI on dark and light backdrops to recover strict hard-edged alpha, checks the loop seam, generates `build/sheet.png` (`NEAREST` resize), and encodes native 1:1 pixel art `build/caption.webm`, lossless `build/caption.webp`, and 2-loop `build/caption.mp4`.

## Verified Output Metrics

- **Rive verify (`rive . --verify`)**: `0` errors, `0` warnings
- **Loop duration**: `4.00 s` (`240` frames @ `60 fps` / `60` discrete `15 fps` pixel-art steps, exported @ `30 fps` / `120` frames)
- **Seam error (`frame 240` vs `frame 0`)**: `0.0892` (vs `17.701` mean 15 fps step motion)
- **Content bounding box**: `(66, 14)–(964, 942)` (`898 × 928`, `clipped=False`)
- **Encoded assets (1:1 native pixel art, zero scaling blur)**: `898 × 928 @ 30 fps` — `caption.webm` (`511 kB`, transparent VP9 `yuva420p`), `caption.webp` (`11 kB`, lossless WebP), `caption.mp4` (`747 kB`, 2-loop H.264 preview)

```bash
uv run --with resvg-py --with opencv-python-headless --with numpy --with pillow python3 tools/cut.py
python3 tools/build.py
rive . --verify
uv run --with numpy --with pillow python3 tools/render.py 2 --encode 22 --mp4
cp build/caption.webm build/caption.webp ../../public/pip/
```

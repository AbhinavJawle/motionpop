"""Make high-resolution cropped filmstrips for inspecting specific moments of the animation.

usage: uv run --with pillow python3 tools/strip.py <out.png> <crop: full|page|head|arm> <step> <60fps_frame...>
"""
import os, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1]
crop_mode = sys.argv[2]
step = int(sys.argv[3])
frames60 = [int(x) for x in sys.argv[4:]]

CROPS = {
    "full": (175, 140, 860, 830),
    "page": (440, 470, 815, 745),
    "head": (275, 145, 725, 575),
    "arm":  (540, 225, 845, 665),
}
box = CROPS[crop_mode]
tw = 360
th = round((box[3] - box[1]) * tw / (box[2] - box[0]))

tiles = []
for f60 in frames60:
    idx = f60 // step
    p = os.path.join(ROOT, "build", "frames", f"f{idx:03d}.png")
    im = Image.open(p).convert("RGBA").crop(box).resize((tw, th), Image.LANCZOS)
    tile = Image.new("RGB", (tw, th), (248, 246, 241))
    tile.paste(im, (0, 0), im)
    dr = ImageDraw.Draw(tile)
    dr.text((8, 6), f"f{f60:03d} ({f60 / 60:.2f}s)", fill=(70, 65, 60))
    dr.rectangle((0, 0, tw - 1, th - 1), outline=(215, 210, 200))
    tiles.append(tile)

cols = min(4, len(tiles))
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new("RGB", (tw * cols, th * rows), (248, 246, 241))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
sheet.save(os.path.join(ROOT, out) if not os.path.isabs(out) else out)
print(f"Saved {out} ({sheet.size[0]}x{sheet.size[1]}, {len(tiles)} tiles)")

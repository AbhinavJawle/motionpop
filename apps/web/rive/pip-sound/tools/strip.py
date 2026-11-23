"""Make cropped inspection filmstrips for Pip Soundweaver.

usage: uv run --with pillow python3 tools/strip.py <out.png> <crop: full|hem|head> <step> <60fps_frame...>
"""
import os, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out, mode, step = sys.argv[1], sys.argv[2], int(sys.argv[3])
frames60 = [int(x) for x in sys.argv[4:]]

CROPS = {
    "full": (45, 130, 975, 815),
    "hem":  (210, 480, 795, 810),
    "head": (250, 155, 765, 535),
}
box = CROPS[mode]
tw = 360
th = round((box[3] - box[1]) * tw / (box[2] - box[0]))
tiles = []
for f60 in frames60:
    idx = f60 // step
    p = os.path.join(ROOT, "build", "frames", f"f{idx:03d}.png")
    im = Image.open(p).convert("RGBA").crop(box).resize((tw, th), Image.LANCZOS)
    tile = Image.new("RGB", (tw, th), (250, 249, 246))
    tile.paste(im, (0, 0), im)
    dr = ImageDraw.Draw(tile)
    dr.text((8, 6), f"f{f60:03d} ({f60 / 60:.2f}s)", fill=(70, 65, 60))
    dr.rectangle((0, 0, tw - 1, th - 1), outline=(220, 215, 208))
    tiles.append(tile)

cols = min(4, len(tiles))
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new("RGB", (tw * cols, th * rows), (250, 249, 246))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
sheet.save(os.path.join(ROOT, out) if not os.path.isabs(out) else out)
print(f"Saved {out} ({sheet.size[0]}x{sheet.size[1]}, {len(tiles)} tiles)")

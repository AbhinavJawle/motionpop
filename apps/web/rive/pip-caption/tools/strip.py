"""Make cropped nearest-neighbor inspection filmstrips from build/frames/.

usage: uv run --with pillow python3 tools/strip.py <out.png> <panel|typing|full> <step> <f1> <f2> ...
"""
import os, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = os.path.join(ROOT, "build", "frames")
CROPS = {
    "panel":  (420, 400, 960, 770),
    "typing": (260, 260, 960, 820),
    "full":   (70,  60,  970, 950),
}
out_path, region, step = sys.argv[1], sys.argv[2], int(sys.argv[3])
frames = [int(a) for a in sys.argv[4:]]
box = CROPS[region]
bw, bh = box[2] - box[0], box[3] - box[1]
cols = 4
tw = 360
th = round(bh * tw / bw)
rows = (len(frames) + cols - 1) // cols
sheet = Image.new("RGB", (tw * cols, th * rows), (250, 249, 246))
for i, f in enumerate(frames):
    im = Image.open(os.path.join(FR, f"f{f // step:03d}.png")).convert("RGBA").crop(box).resize((tw, th), Image.NEAREST)
    tile = Image.new("RGB", (tw, th), (250, 249, 246))
    tile.paste(im, (0, 0), im)
    dr = ImageDraw.Draw(tile)
    dr.text((8, 6), f"f{f:03d} ({f / 60:.2f}s)", fill=(90, 84, 78))
    dr.rectangle((0, 0, tw - 1, th - 1), outline=(224, 220, 214))
    sheet.paste(tile, ((i % cols) * tw, (i // cols) * th))
sheet.save(out_path)
print(f"Saved {out_path} ({sheet.width}x{sheet.height}, {len(frames)} tiles)")

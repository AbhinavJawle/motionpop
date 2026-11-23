"""Filmstrip of rendered frames cropped around Pip. usage: strip.py <out.png> <frame indices (30 fps)...>"""
import sys
import numpy as np
from PIL import Image, ImageDraw
out, idx = sys.argv[1], [int(x) for x in sys.argv[2:]]
S = 300; tiles = []
for f in idx:
    im = Image.open(f"build/frames/f{f:03d}.png"); a = np.asarray(im).astype(int)
    pink = (a[..., 0] > 180) & (a[..., 1] < 90) & (a[..., 2] > 100) & (a[..., 3] > 200)
    ys, xs = np.nonzero(pink); cx, cy = int(xs.mean()), int(ys.mean()) + 120
    bg = Image.new("RGB", im.size, (255, 255, 255)); bg.paste(im, (0, 0), im)
    c = bg.crop((cx - 230, cy - 260, cx + 230, cy + 200)).resize((S, S), Image.LANCZOS)
    ImageDraw.Draw(c).text((4, 4), f"{f * 2 / 60:.2f}s", fill=(150, 150, 150)); tiles.append(c)
cols = min(6, len(tiles)); rows = (len(tiles) + cols - 1) // cols
s = Image.new("RGB", (S * cols, S * rows), "white")
for i, t in enumerate(tiles): s.paste(t, ((i % cols) * S, (i // cols) * S))
s.save(out)

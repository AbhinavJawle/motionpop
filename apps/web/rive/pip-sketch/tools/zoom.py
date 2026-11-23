"""Debug zoom of the reference: usage zoom.py x0 y0 x1 y1 scale out.png [src]"""
import sys
from PIL import Image, ImageDraw
x0, y0, x1, y1, s = map(int, sys.argv[1:6]); out = sys.argv[6]
src = sys.argv[7] if len(sys.argv) > 7 else "source/pip-sketch-reference.png"
im = Image.open(src).convert("RGBA")
bg = Image.new("RGBA", im.size, (60, 200, 120, 255)); bg.alpha_composite(im)
c = bg.crop((x0, y0, x1, y1)).resize(((x1 - x0) * s, (y1 - y0) * s), Image.NEAREST)
d = ImageDraw.Draw(c)
for x in range((x0 // 10 + 1) * 10, x1, 10):
    major = x % 50 == 0
    d.line([((x - x0) * s, 0), ((x - x0) * s, c.height)], fill=(255, 0, 255, 200) if major else (255, 255, 255, 70))
    if major: d.text(((x - x0) * s + 2, 2), str(x), fill=(255, 0, 0, 255))
for y in range((y0 // 10 + 1) * 10, y1, 10):
    major = y % 50 == 0
    d.line([(0, (y - y0) * s), (c.width, (y - y0) * s)], fill=(255, 0, 255, 200) if major else (255, 255, 255, 70))
    if major: d.text((2, (y - y0) * s + 2), str(y), fill=(255, 0, 0, 255))
c.save(out)

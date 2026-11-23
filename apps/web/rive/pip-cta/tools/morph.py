import numpy as np
from PIL import Image, ImageFilter, ImageDraw
def img(m): return Image.fromarray((m * 255).astype(np.uint8), "L").copy()
def arr(i): return np.asarray(i) > 127
def dil(m, r): return arr(img(m).filter(ImageFilter.MaxFilter(2 * r + 1))) if r > 0 else m.copy()
def ero(m, r): return arr(img(m).filter(ImageFilter.MinFilter(2 * r + 1))) if r > 0 else m.copy()
def close(m, r): return ero(dil(m, r), r)
def open_(m, r): return dil(ero(m, r), r)
def component(m, seed):
    i = img(m); ImageDraw.floodfill(i, seed, 128, thresh=0); return np.asarray(i) == 128
def fill_holes(m):
    i = img(~m); ImageDraw.floodfill(i, (0, 0), 128, thresh=0); return ~(np.asarray(i) == 128)
def poly(pts, shape=(960, 960)):
    i = Image.new("L", (shape[1], shape[0]), 0); ImageDraw.Draw(i).polygon(pts, fill=255); return np.asarray(i) > 127

"""Isolate the ghost from its gradient background with a colour-line matte (keeps the fur fibres)."""
import numpy as np
from PIL import Image
exec(open("morph.py").read())
I = np.asarray(Image.open("ghost_src.png").convert("RGB")).astype(np.float64)
H, W, _ = I.shape
Y, X = np.mgrid[0:H, 0:W]

def blur(a, s):
    r = max(1, int(round(s)))
    out = a.astype(np.float64)
    for _ in range(3):
        for axis in (0, 1):
            pad = [(r + 1, r) if i == axis else (0, 0) for i in range(out.ndim)]
            c = np.cumsum(np.pad(out, pad, mode="edge"), axis=axis)
            n = c.shape[axis]
            out = (np.take(c, range(2 * r + 1, n), axis=axis) - np.take(c, range(0, n - 2 * r - 1), axis=axis)) / (2 * r + 1)
    return out

# 1) background model: smooth polynomial fitted to confident background pixels
lum = I.mean(-1)
def polyfit_bg(mask, deg=3):
    xs, ys = X[mask] / W, Y[mask] / H
    terms = [xs ** i * ys ** j for i in range(deg + 1) for j in range(deg + 1 - i)]
    Amat = np.stack(terms, 1)
    out = np.zeros_like(I)
    xa, ya = X / W, Y / H
    full = np.stack([xa ** i * ya ** j for i in range(deg + 1) for j in range(deg + 1 - i)], -1)
    for ch in range(3):
        coef, *_ = np.linalg.lstsq(Amat, I[..., ch][mask], rcond=None)
        out[..., ch] = full @ coef
    return out
rough_bg = (X < 150) | (X > 880) | (Y < 50) | (Y > 968)
B = polyfit_bg(rough_bg[::1] & ((X + Y) % 3 == 0))
fgish = np.sqrt(((I - B) ** 2).sum(-1)) > 30
fgish = fill_holes(open_(close(fgish, 2), 2))
comp = component(fgish, (512, 500))
bg_conf = ~dil(comp, 14)
# the gradient is essentially vertical with a slight left/right tilt: per row, interpolate between
# the two side margins (smoothed), which is exact far from the ghost and stable inside it
lm = blur(I[:, 20:150].mean(1)[:, None, :].repeat(3, 1), 6)[:, 1]
rm = blur(I[:, 880:1004].mean(1)[:, None, :].repeat(3, 1), 6)[:, 1]
tt = (X / (W - 1))[..., None]
B = lm[:, None, :] * (1 - tt) + rm[:, None, :] * tt
print("bg residual on confident bg:", np.abs(I - B)[bg_conf].mean(0).round(2))
# the backdrop darkens near the ghost (contact shadow in the gaps): estimate it locally from
# backdrop-coloured pixels connected to the frame edge, by normalised convolution
lum2 = I.mean(-1)
bgcol = (lum2 < 80) & ((I[..., 2] - I[..., 0]) > 15)
seedmask = np.zeros((H, W), bool); seedmask[[0, H - 1], :] = True; seedmask[:, [0, W - 1]] = True
bgc = component(bgcol | seedmask, (0, H - 1)) & bgcol
bgc = ero(bgc, 3) & ~ero(fill_holes(comp), 6)
Bl = np.full_like(I, np.nan)
for s in (4, 10, 24, 60):
    num = blur(I * bgc[..., None], s); den = blur(bgc.astype(float), s)[..., None]
    Bl = np.where(np.isnan(Bl[..., :1]) & (den > 0.08), num / np.maximum(den, 1e-6), Bl)
B = np.where(np.isnan(Bl), B, Bl)
# refine the silhouette against the fitted background (keeps the gaps between the scallops open)
comp = component(open_(close(np.sqrt(((I - B) ** 2).sum(-1)) > 28, 1), 1), (512, 500))
comp = fill_holes(comp)
bg_conf = ~dil(comp, 14)

# 2) local foreground colour: normalised blur of confident interior, pushed outward
inner = ero(comp, 10)
F = np.full_like(I, np.nan)
for s in (6, 14, 30, 60):
    num = blur(I * inner[..., None], s); den = blur(inner.astype(float), s)[..., None]
    Fs = num / np.maximum(den, 1e-6)
    take = np.isnan(F[..., :1]) & (den > 0.05)
    F = np.where(take, Fs, F)
F = np.where(np.isnan(F), np.array([150.0, 200.0, 215.0]), F)
# where the local fur colour is too close to the background (deep shadow), fall back to a lit fur colour
dd = np.sqrt(((F - B) ** 2).sum(-1))
F = np.where((dd < 70)[..., None], B + (F - B) * (70 / np.maximum(dd, 1e-3))[..., None], F)

# 3) alpha along the colour line B -> F
d = F - B
alpha = ((I - B) * d).sum(-1) / np.maximum((d * d).sum(-1), 1e-6)
alpha = np.clip(alpha, 0, 1)
alpha[bg_conf & (alpha < 0.08)] = 0
alpha[inner] = 1
# remove isolated specks outside the silhouette band
band = dil(comp, 10)
alpha[~band] = 0
# backdrop-coloured pixels in the scallop gaps the local estimate couldn't reach
gapbg = (I.mean(-1) < 62) & ((I[..., 2] - I[..., 0]) > 15) & (Y > 780) & ~ero(comp, 7)
alpha[gapbg] = np.minimum(alpha[gapbg], np.clip((I.mean(-1)[gapbg] - 40) / 40, 0, 1) * 0)
# un-premultiply: colour that composites back to the source over B
a3 = np.maximum(alpha, 1e-3)[..., None]
C = (I - (1 - alpha)[..., None] * B) / a3
C = np.where(alpha[..., None] < 0.12, F, C)
C = np.clip(C, 0, 255)
out = np.dstack([C, alpha * 255]).round().astype(np.uint8)
Image.fromarray(out, "RGBA").save("ghost_rgba.png")
np.save("ghost_alpha.npy", alpha)
# checks: recomposite over the original background, and preview over dark navy + white
re = C * alpha[..., None] + B * (1 - alpha[..., None])
print("recomposite error mean", np.abs(re - I).mean().round(3), "max", np.abs(re - I).max().round(1))
ys, xs = np.nonzero(alpha > 0.02); print("bbox", xs.min(), xs.max(), ys.min(), ys.max())
for name, col in (("navy", (10, 11, 20)), ("white", (255, 255, 255)), ("pink", (255, 0, 160))):
    bgc = np.array(col, float)
    v = C * alpha[..., None] + bgc * (1 - alpha[..., None])
    Image.fromarray(v.astype(np.uint8)).save(f"prev_{name}.png")

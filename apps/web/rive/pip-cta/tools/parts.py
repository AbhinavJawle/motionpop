"""Split the matted ghost into animation parts: body (eyes filled with fur), eye L/R layers, two plush hands.
usage: parts.py <out_dir>"""
import numpy as np, sys, os, math, json
from PIL import Image
exec(open("morph.py").read())
src = open("matte.py").read()
exec(src[src.index("def blur"):src.index("# 1) background model")])
OUT = sys.argv[1]
G = np.asarray(Image.open("ghost_rgba.png")).astype(np.float64)
rgb, A = G[..., :3], G[..., 3] / 255
H, W = A.shape
Y, X = np.mgrid[0:H, 0:W]

# ---------------- eyes: matte by darkness against the local fur colour, then fill the fur under them
EYES = {"eye_l": (425, 312, 490, 440), "eye_r": (543, 312, 608, 440)}
lum = rgb.mean(-1)
dark = (lum < 95) & (A > 0.99)
eye_mask = np.zeros((H, W), bool)
for k, (x0, y0, x1, y1) in EYES.items():
    box = (X >= x0) & (X < x1) & (Y >= y0) & (Y < y1)
    eye_mask |= fill_holes(close(dark & box, 2))
eye_zone = dil(eye_mask, 20)
furok = (A > 0.99) & ~eye_zone & ~dil((lum < 95), 4)
# local fur colour from a ring just around each eye, spread inward (multi-scale normalised blur)
ring = furok & dil(eye_zone, 10)
fur = np.full_like(rgb, np.nan)
for s in (6, 12, 24, 48):
    num = blur(rgb * ring[..., None], s); den = blur(ring.astype(float), s)[..., None]
    fur = np.where(np.isnan(fur[..., :1]) & (den > 0.03), num / np.maximum(den, 1e-6), fur)
num = blur(rgb * furok[..., None], 20); den = blur(furok.astype(float), 20)[..., None]
fur = np.where(np.isnan(fur), num / np.maximum(den, 1e-6), fur)
E = np.array([22.0, 22.0, 34.0])
v = E - fur
m = np.clip(((rgb - fur) * v).sum(-1) / (v * v).sum(-1), 0, 1)
m[~eye_zone] = 0
# fur texture under the eyes: local colour + high-frequency detail copied from nearby plain fur
resid = rgb - blur(rgb, 2)
hy, hx = np.nonzero(eye_zone)
best = None
for dy in range(-200, 201, 4):
    for dx in range(-240, 241, 4):
        sy, sx = hy + dy, hx + dx
        if sy.min() < 0 or sx.min() < 0 or sy.max() >= H or sx.max() >= W: continue
        c = furok[sy, sx].mean()
        if best is None or c > best[0] or (c == best[0] and dx * dx + dy * dy < best[1] ** 2 + best[2] ** 2):
            best = (c, dx, dy)
print("eye fill donor", best)
_, dx, dy = best
body = rgb.copy()
fill = fur[hy, hx] + 1.25 * resid[hy + dy, hx + dx]
w = np.clip(blur(dil(eye_mask, 11).astype(float), 4)[hy, hx] * 1.4, 0, 1)[:, None]   # fill the eye and its socket rim (the eye layer carries the rim)
body[hy, hx] = fill * w + rgb[hy, hx] * (1 - w)
eye_col = np.clip((rgb - (1 - m)[..., None] * fur) / np.maximum(m, 0.05)[..., None], 0, 255)

def save(name, rgb_, a_, box=None, pad=3):
    a8 = np.clip(a_ * 255, 0, 255)
    if box is None:
        ys, xs = np.nonzero(a8 > 0)
        box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + 1 + pad, W), min(ys.max() + 1 + pad, H))
    x0, y0, x1, y1 = box
    im = np.dstack([np.clip(rgb_, 0, 255), a8])[y0:y1, x0:x1].round().astype(np.uint8)
    Image.fromarray(im, "RGBA").save(os.path.join(OUT, name + ".png"), optimize=True)
    return {"file": name + ".png", "x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0)}

parts = {}
BODY_CUT = 720   # the button covers everything below this; the Rive artboard ends here
Ab = A.copy(); Ab[Y >= BODY_CUT] = 0
parts["body"] = save("body", body, Ab)
# each eye layer carries the ORIGINAL pixels of its whole socket (eye + shading rim), opaque wherever the body
# was refilled: open eyes are pixel-exact, and a blink squashes the rim into a soft lid crease
wfull = np.zeros((H, W)); wfull[hy, hx] = w[:, 0]
for k, (x0, y0, x1, y1) in EYES.items():
    mk = np.clip(wfull * 6, 0, 1); mk[~((X >= x0 - 24) & (X < x1 + 24) & (Y >= y0 - 24) & (Y < y1 + 24))] = 0
    parts[k] = save(k, rgb, mk)

# ---------------- hands: plush balls made from the ghost's own fur and lighting
alpha_g = A
cx, cy = 512.0, 383.0
# dome radius per angle (alpha 0.5 crossing)
angs = np.radians(np.arange(180, 361, 0.5))
Rg = []
for t in angs:
    rr = np.arange(200, 420, 0.5)
    xs = np.clip((cx + rr * np.cos(t)).round().astype(int), 0, W - 1); ys = np.clip((cy + rr * np.sin(t)).round().astype(int), 0, H - 1)
    a = alpha_g[ys, xs]
    i = np.nonzero(a < 0.5)[0]
    Rg.append(rr[i[0]] if len(i) else 316.0)
Rg = np.array(Rg)
def bilinear(img, xs, ys):
    xs = np.clip(xs, 0, W - 1.001); ys = np.clip(ys, 0, H - 1.001)
    x0 = np.floor(xs).astype(int); y0 = np.floor(ys).astype(int); fx = xs - x0; fy = ys - y0
    if img.ndim == 2: img = img[..., None]
    o = (img[y0, x0] * ((1 - fx) * (1 - fy))[..., None] + img[y0, x0 + 1] * (fx * (1 - fy))[..., None]
         + img[y0 + 1, x0] * ((1 - fx) * fy)[..., None] + img[y0 + 1, x0 + 1] * (fx * fy)[..., None])
    return o
feat = dil((body.mean(-1) < 110) & (A > 0.99), 6)       # eyes, smile: keep them out of the lighting field
okl = (A > 0.99) & ~feat
light = np.full_like(body, np.nan)
for s_ in (14, 30, 60):
    num = blur(body * okl[..., None], s_); den = blur(okl.astype(float), s_)[..., None]
    light = np.where(np.isnan(light[..., :1]) & (den > 0.2), num / np.maximum(den, 1e-6), light)
light = np.where(np.isnan(light), body, light)
resid_body = body - blur(body, 3)

def hand(name, rx, ry, seed, thumb=None):
    S = int(max(rx, ry) * 2 + 40)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float64)
    u, v = xx - S / 2, yy - S / 2
    rho = np.hypot(u, v); phi = np.arctan2(v, u)
    r_edge = (rx * ry) / np.sqrt((ry * np.cos(phi)) ** 2 + (rx * np.sin(phi)) ** 2)
    if thumb is not None:   # a soft bump: (angle_deg, width_deg, extra_px)
        a0, wd, ex = thumb
        dang = np.angle(np.exp(1j * (phi - math.radians(a0))))
        r_edge = r_edge + ex * np.exp(-(dang / math.radians(wd)) ** 2)
    sd = rho - r_edge
    # mirror-mapped onto an arc of the dome so fibres keep their real size and direction
    psi = np.angle(np.exp(1j * (phi - math.pi / 2)))   # 0 at the bottom of the hand
    rng = np.random.default_rng(seed)
    base = math.radians(rng.uniform(236, 250))
    span = (math.pi * (rx + ry) / 2) / 316.0
    dome = base + np.abs(psi) / math.pi * span
    idx = np.clip(((np.degrees(dome) - 180) / 0.5).round().astype(int), 0, len(Rg) - 1)
    rad = Rg[idx] + sd * 0.72          # slightly longer fibres than the head: hands are shaggier
    sx, sy = cx + rad * np.cos(dome), cy + rad * np.sin(dome)
    a = bilinear(alpha_g, sx, sy)[..., 0]
    a[sd < -12] = 1
    det_rim = bilinear(resid_body, sx, sy)
    # interior detail: straight copy of plain fur, blended in away from the rim
    ox, oy = rng.uniform(600, 700), rng.uniform(520, 600)
    det_in = bilinear(resid_body, ox + u, oy + v)
    wr = np.clip((sd + 26) / 16, 0, 1)[..., None]
    det = det_rim * wr + det_in * (1 - wr)
    clump = bilinear(blur(body, 3) - blur(body, 9), ox + u * 0.8, oy + v * 0.8)
    # lighting: the head's own colour field, squeezed onto the ball (pink left, mint upper right)
    k = 300.0 / max(rx, ry)
    lc = bilinear(light, cx + u / max(rx, ry) * 245, cy - 60 + v / max(rx, ry) * 245)
    # round it: soft occlusion toward the lower rim, a touch of lift on the upper right
    nz = np.sqrt(np.clip(1 - (rho / np.maximum(r_edge, 1)) ** 2, 0, 1))
    shade = 0.86 + 0.20 * nz + 0.06 * np.clip((u - v) / (rx + ry), -1, 1)
    shade -= 0.10 * np.clip(v / ry, 0, 1) ** 2
    # the button's pink-violet border lights the hands from below (as in the reference)
    pinkw = np.clip((-0.55 * u + v) / (rx + ry) * 1.5 + 0.25, 0, 1) ** 1.4 * (0.55 + 0.45 * np.clip(rho / np.maximum(r_edge, 1), 0, 1) ** 2)
    lc = lc * (1 - 0.72 * pinkw[..., None]) + np.array([222.0, 172.0, 230.0]) * 0.72 * pinkw[..., None]
    lc = lc * 1.04 + 6
    rim = np.clip(rho / np.maximum(r_edge, 1), 0, 1) ** 5 * np.clip((u - v) / (rx + ry) + 0.4, 0, 1)
    shade = shade + 0.16 * rim
    col = lc * shade[..., None] + det * 1.7 + clump * 1.3
    out = np.dstack([np.clip(col, 0, 255), np.clip(a, 0, 1) * 255]).round().astype(np.uint8)
    Image.fromarray(out, "RGBA").save(os.path.join(OUT, name + ".png"), optimize=True)
    return {"file": name + ".png", "w": S, "h": S}

parts["hand_l"] = hand("hand_l", 66, 60, 3, thumb=(200, 22, 7))
parts["hand_r"] = hand("hand_r", 64, 60, 9)
json.dump(parts, open("parts.json", "w"), indent=1)
print(parts)
# full transparent mascot (original, no edits) for the deliverables
save("pip-plush", rgb, A)

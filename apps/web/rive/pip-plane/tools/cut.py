"""Cut the paper-airplane reference into animatable layers (one-time; the PNGs in art/ are the source after).

usage: python3 tools/cut.py            (needs numpy, pillow, opencv-python-headless)

The reference is Pip on a paper plane over a near-black backdrop (13, 14, 16) with pure-black side bars.
1. Matte with a known backdrop: opaque core (far from the backdrop, holes filled), and in the soft band
   alpha = projection of (C - B) on (F - B), where F is the foreground colour pushed out of the core.
2. Pip is the saturated part (chroma), extended over its fur where it meets the backdrop.
3. Layers: plane (Pip inpainted away, so Pip can lean and bounce over it), smoke trail, Pip's body
   (with the left arm inpainted away), the waving arm (with a tube extension behind the body, so it can
   rotate about a shoulder hidden behind the green patch), the left arm.
Writes art/<layer>.png at SCALE and tools/layers.json (box in artboard units, i.e. reference px * SCALE).
"""
import json, os
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "source", "pip-plane-reference.png")
ART = os.path.join(ROOT, "art")
SCALE = 0.5
os.makedirs(ART, exist_ok=True)

img = cv2.cvtColor(cv2.imread(SRC, cv2.IMREAD_UNCHANGED)[:, :, :3], cv2.COLOR_BGR2RGB)
H, W = img.shape[:2]
C = img.astype(np.float32)
B = np.broadcast_to(np.array([13, 14, 16], np.float32), C.shape).copy()
bars = (img.max(-1) == 0)
B[bars] = 0


def fill_holes(m):
    """True inside m plus every region of ~m not connected to the image border."""
    inv = (~m).astype(np.uint8)
    n, lab = cv2.connectedComponents(inv, connectivity=4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    holes = ~np.isin(lab, list(border)) & (inv > 0)
    return m | holes


def disk(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def poly(pts):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m > 0


# the shadowed gap between the left arm and the body: backdrop, though enclosed and a little red
POCKET = None


def matte(rgb_u8):
    """(colour, alpha) of an image over the known backdrop."""
    c = rgb_u8.astype(np.float32)
    d = np.abs(c - B).max(-1)
    core = d >= 46
    core = cv2.morphologyEx(core.astype(np.uint8), cv2.MORPH_OPEN, disk(1)) > 0
    # fill enclosed holes (eye sockets), except pockets of backdrop (the gap between arm and body)
    holes = fill_holes(core) & ~core
    n, lab = cv2.connectedComponents(holes.astype(np.uint8), connectivity=4)
    for i in range(1, n):
        m = lab == i
        if np.median(d[m]) >= 9 and not (m & POCKET).any(): core |= m
    # the outer rim of the core is where dark fur and half-covered backdrop look alike: estimate it too
    core = cv2.erode(core.astype(np.uint8), disk(2)) > 0
    band = cv2.dilate(core.astype(np.uint8), disk(22)) > 0
    fmask = (band & ~core).astype(np.uint8)
    F = cv2.inpaint(rgb_u8, fmask, 6, cv2.INPAINT_TELEA).astype(np.float32)
    F[~band] = (236, 232, 222)                      # far from any surface: the smoke is cream paper dust
    fb = F - B
    # a dark F (shaded fur) makes the projection unstable: never divide by less than a mid-grey's reach
    a = ((c - B) * fb).sum(-1) / np.maximum((fb * fb).sum(-1), 3 * 70.0 ** 2)
    a = np.clip((a - 0.015) / 0.985, 0, 1)
    a[core] = 1
    a[d <= 4] = 0
    unp = B + (c - B) / np.maximum(a[..., None], 1e-3)
    w = np.clip((a - 0.35) / 0.4, 0, 1)[..., None]  # trust the pixel where it is mostly foreground
    col = np.where(core[..., None], c, w * unp + (1 - w) * F)
    return np.clip(col, 0, 255), a


POCKET = poly([(780, 806), (803, 803), (803, 872), (780, 872)])

# ---------------------------------------------------------------- Pip mask
hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV).astype(np.float32)
chroma = hsv[..., 1] * hsv[..., 2] / 255
pip = (hsv[..., 1] > 66) & (hsv[..., 2] > 38)      # paper is S <= 35; every part of Pip is S >= 70
pip = cv2.morphologyEx(pip.astype(np.uint8), cv2.MORPH_OPEN, disk(2)) > 0
pip = fill_holes(pip)
n, lab, stats, _ = cv2.connectedComponentsWithStats(pip.astype(np.uint8), 8)
keep = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] > 1500
        and 640 < stats[i, cv2.CC_STAT_LEFT] + stats[i, cv2.CC_STAT_WIDTH] / 2 < 1320]
pip = np.isin(lab, keep)
# the shaded wing edge right of the patch and the fold shadow under the hem read as saturated: not Pip
FOOT = poly([(680, 975), (792, 975), (792, 1100), (680, 1100)])     # the stub lying on the plane stays with it
PIP_CLAMP = [(680, 300), (1310, 300), (1310, 700), (1292, 760), (1292, 1090), (830, 1085), (790, 1062),
             (760, 1050), (725, 1036), (680, 1030), (680, 980), (757, 980), (757, 890), (680, 890)]
pip = cv2.morphologyEx(pip.astype(np.uint8), cv2.MORPH_CLOSE, disk(3)) > 0
stub = FOOT & ((hsv[..., 0] < 28) | (hsv[..., 0] > 160))                 # orange, not the cyan hem
stub = cv2.dilate(stub.astype(np.uint8), disk(2)) > 0
pip = fill_holes(pip) & poly(PIP_CLAMP) & ~stub
col0, a0 = matte(img)
paper = (a0 > 0.5) & (hsv[..., 1] < 62) & (hsv[..., 2] > 90) & ~pip           # cream paper, never Pip
pip_soft = (cv2.dilate(pip.astype(np.uint8), disk(9)) > 0) & ~paper
pip_soft = cv2.GaussianBlur(pip_soft.astype(np.float32), (0, 0), 1.0)
pip_soft = np.maximum(pip_soft, pip.astype(np.float32) * (cv2.erode(pip.astype(np.uint8), disk(1)) > 0))

# ---------------------------------------------------------------- parts (reference px)
ARM_OUT = poly([(1140, 420), (1136, 560), (1133, 590), (1136, 615), (1148, 627), (1158, 645),
                (1166, 662), (1320, 700), (1320, 400)])
LARM = poly([(796, 698), (811, 703), (812, 760), (807, 800), (801, 808), (801, 872), (782, 882),
             (690, 884), (690, 795), (760, 735)])
ARM_HAND, ARM_BASE = np.array([1220.0, 470.0]), np.array([1146.0, 616.0])
AXIS = (ARM_BASE - ARM_HAND) / np.linalg.norm(ARM_BASE - ARM_HAND)   # hand -> shoulder
SHOULDER = ARM_BASE + 34 * AXIS                                       # hidden behind the green patch
LARM_PIVOT = np.array([808.0, 716.0])
BODY_PIVOT = np.array([1010.0, 1030.0])                               # middle of the skirt's hem


def rgba(col, a, m):
    return np.dstack([col, np.clip(a * m, 0, 1) * 255])


# waving arm: the visible arm, plus a tube swept back along its axis behind the body
arm_vis = ARM_OUT & (pip_soft > 0.01)
arm = rgba(col0, a0, pip_soft * ARM_OUT)
core_arm = arm_vis & (a0 > 0.9) & (cv2.erode(arm_vis.astype(np.uint8), disk(3)) > 0)
root_zone = poly([(1133, 586), (1136, 615), (1148, 627), (1160, 647), (1172, 668), (1150, 700),
                  (1100, 690), (1092, 620), (1108, 572), (1128, 560)]) & ~ARM_OUT
ys, xs = np.nonzero(root_zone)
filled = np.zeros(len(ys), bool)
for k in range(60, 200, 2):              # sample from mid-arm, where the fur is evenly lit
    sx = np.round(xs - k * AXIS[0]).astype(int); sy = np.round(ys - k * AXIS[1]).astype(int)
    ok = ~filled & (sy >= 0) & (sy < H) & (sx >= 0) & (sx < W)
    hit = np.zeros(len(ys), bool); hit[ok] = arm_vis[sy[ok], sx[ok]]
    # copy the whole cross-section (soft edges included) from the first row of the visible arm
    take = hit & ~filled
    arm[ys[take], xs[take]] = arm[sy[take], sx[take]]
    filled |= take

# left arm, and the body with the left arm inpainted away
larm = rgba(col0, a0, pip_soft * LARM)
fix = (cv2.dilate(LARM.astype(np.uint8), disk(4)) > 0) & (cv2.dilate(pip.astype(np.uint8), disk(6)) > 0)
img_noarm = cv2.inpaint(img, fix.astype(np.uint8), 7, cv2.INPAINT_TELEA)
col1, a1 = matte(img_noarm)
body_m = pip_soft * (~ARM_OUT)
body_col = np.where(LARM[..., None], col1, col0)
# behind the left arm the body's outline follows the purple stripe; left of it is backdrop
yy0, xx0 = np.mgrid[0:H, 0:W]
stripe_x = 806 + (yy0 - 705) * (800 - 806) / (870 - 705)
behind = np.clip((xx0 - stripe_x) / 2 + 0.5, 0, 1)
body_a = np.where(LARM, a1 * behind, a0)
body = rgba(body_col, body_a, body_m)

# plane: rebuilt behind Pip. Its top outline is one straight line from the tail tip to the nose (measured
# on the visible paper either side of Pip), so behind Pip the paper is everything below that line,
# filled with the surrounding paper colour (normalized convolution). Only a band near Pip's outline is
# ever revealed, when Pip leans or bounces.
hidden = cv2.dilate(pip.astype(np.uint8), disk(1)) > 0          # the soft fringe keeps its own paper
paper_px = ~hidden & (a0 > 0.97) & (hsv[..., 1] < 62)          # paper and its shadows, never Pip
xs_e, ys_e = [], []
for x in list(range(450, 790, 10)) + list(range(1220, 1660, 10)):
    col = np.nonzero((paper_px & (hsv[..., 2] > 150))[500:, x])[0]
    if len(col): xs_e.append(x); ys_e.append(500 + col[0])
k_e, b_e = np.polyfit(xs_e, ys_e, 1)
yy, xx = np.mgrid[0:H, 0:W]
below = np.clip(yy - (k_e * xx + b_e) + 0.5, 0, 1)            # 1 px anti-aliased edge
fill = np.zeros((H, W, 3), np.float32); wsum = np.zeros((H, W), np.float32)
w0 = paper_px.astype(np.float32)
for sig in (12, 30, 70):                                        # fine first, coarser where it is still empty
    num = cv2.GaussianBlur(C * w0[..., None], (0, 0), sig)
    den = cv2.GaussianBlur(w0, (0, 0), sig)
    ok = (wsum < 0.5) & (den > 1e-3)
    fill[ok] = num[ok] / den[ok, None]; wsum[ok] = 1
plane_a = np.where(hidden, below * (yy < 1100), a0)
plane_col = np.where(hidden[..., None], fill, col0)
TRAIL = poly([(150, 990), (600, 990), (600, 1150), (690, 1300), (690, 1420), (150, 1420)])
plane_core = fill_holes(plane_a > 0.85)
plane_core = cv2.morphologyEx(plane_core.astype(np.uint8), cv2.MORPH_OPEN, disk(3)) > 0
n, lab, stats, _ = cv2.connectedComponentsWithStats(plane_core.astype(np.uint8), 8)
big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
plane_m = cv2.dilate((lab == big).astype(np.uint8), disk(6)) > 0
plane_m = cv2.GaussianBlur(plane_m.astype(np.float32), (0, 0), 1.5)
near_plane = cv2.dilate((lab == big).astype(np.uint8), disk(16)).astype(np.float32)
trail_m = TRAIL.astype(np.float32) * (1 - cv2.GaussianBlur(near_plane, (0, 0), 4))
plane = rgba(plane_col, plane_a, plane_m)
# smoke is paper dust: one cream colour, alpha from how far each pixel is lifted toward it (the dark
# underside edge of the wing thereby becomes a faint haze, not an outline)
CREAM = np.array([236, 232, 222], np.float32)
smoke_a = np.clip(((C - B) * (CREAM - B)).sum(-1) / ((CREAM - B) ** 2).sum(-1), 0, 1)
smoke_a = np.clip((smoke_a - 0.01) / 0.99, 0, 1)
trail = rgba(np.broadcast_to(CREAM, C.shape), smoke_a, trail_m * (1 - hidden))

# ---------------------------------------------------------------- export
layers = {}
def save(name, im):
    a = im[..., 3]
    yy, xx = np.nonzero(a > 1)
    x0, x1, y0, y1 = xx.min() - 2, xx.max() + 3, yy.min() - 2, yy.max() + 3
    crop = im[y0:y1, x0:x1].astype(np.float32)
    # premultiplied resize, so soft edges don't pick up the backdrop
    pm = crop[..., :3] * (crop[..., 3:4] / 255)
    w, h = round((x1 - x0) * SCALE), round((y1 - y0) * SCALE)
    pm = cv2.resize(pm, (w, h), interpolation=cv2.INTER_AREA)
    al = cv2.resize(crop[..., 3], (w, h), interpolation=cv2.INTER_AREA)
    out = np.dstack([pm / np.maximum(al[..., None] / 255, 1e-3), al])
    out[al < 0.5] = 0
    cv2.imwrite(os.path.join(ART, f"{name}.png"),
                cv2.cvtColor(np.clip(out, 0, 255).round().astype(np.uint8), cv2.COLOR_RGBA2BGRA))
    layers[name] = {"x": x0 * SCALE, "y": y0 * SCALE, "w": w, "h": h}

cv2.imwrite(os.path.join(ROOT, "build", "pip_mask.png"), (np.dstack([pip * 255, img[..., 1] * 0.5, img[..., 2] * 0.5])).astype(np.uint8))
save("plane", plane)
save("trail", trail)
save("body", body)
save("arm_wave", arm)
save("arm_left", larm)
pts = {"shoulder": SHOULDER, "larm_pivot": LARM_PIVOT, "body_pivot": BODY_PIVOT}
layers["points"] = {k: [float(v[0]) * SCALE, float(v[1]) * SCALE] for k, v in pts.items()}
layers["scale"] = SCALE
json.dump(layers, open(os.path.join(ROOT, "tools", "layers.json"), "w"), indent=2)
print(json.dumps(layers, indent=1))

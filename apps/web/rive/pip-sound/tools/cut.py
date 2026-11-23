"""Cut the Soundweaver reference (1024x1024 RGBA) into clean, marker-textured animatable layers.

usage: uv run --with opencv-python-headless --with numpy --with pillow python3 tools/cut.py

Exports layers at 1:1 (1024x1024 artboard units) into art/*.png + tools/layers.json:
- body:       Mint-green ghost body + authentic hot-pink/cobalt hand-drawn outline + scalloped hem
              (eyes & smile painted out cleanly; subtle mint+pink margin extended behind headband & ear cups).
- eye_l, eye_r, smile: Cobalt-blue hand-drawn facial features.
- headband:   Hot-pink & cobalt-blue arched headphone band.
- ear_left:   Left oversized headphone ear cup.
- ear_right:  Right oversized headphone ear cup.
- wave_l_1, wave_l_2, wave_l_3: Authentic hand-drawn left sound-wave arcs (inner, middle, outer).
- wave_r_1, wave_r_2, wave_r_3: Authentic hand-drawn right sound-wave arcs (inner, middle, outer).
- dot_l_pink, dot_l_mint, dot_r_mint: Authentic hand-drawn floating sound pulse bubbles.
"""
import json, os
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "source", "pip-sound-reference.png")
ART = os.path.join(ROOT, "art")
DBG = os.path.join(ROOT, "build")
os.makedirs(ART, exist_ok=True)
os.makedirs(DBG, exist_ok=True)

bgra = cv2.imread(SRC, cv2.IMREAD_UNCHANGED)
H, W = bgra.shape[:2]  # 1024 x 1024
rgb = cv2.cvtColor(bgra[..., :3], cv2.COLOR_BGR2RGB).astype(np.float32)
A = bgra[..., 3].astype(np.float32) / 255.0
hsv = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W]


def poly(pts, soft=0.0):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.round(np.array(pts, np.float32) * 8).astype(np.int32)], 1, lineType=cv2.LINE_AA, shift=3)
    m = m.astype(np.float32)
    if soft > 0:
        m = cv2.GaussianBlur(m, (0, 0), soft)
    return m


def disk(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def dil(m, r):
    return cv2.dilate(m.astype(np.uint8), disk(r)) > 0 if r > 0 else m.astype(bool)


def fill_holes(m):
    inv = (~m).astype(np.uint8)
    _, lab = cv2.connectedComponents(inv, connectivity=4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    return m | (~np.isin(lab, list(border)) & (inv > 0))


# Clean away faint low-saturation white/grey paper halo around the floating sound waves while keeping
# vibrant pink, cobalt, and genuine pastel-mint marker strokes 100% rich!
is_vibrant = hsv[..., 1] > 50
is_mint = (rgb[..., 1] - rgb[..., 0] > 14) & (rgb[..., 1] > 185) & (A > 0.42)
wave_vibrant_a = np.where(dil(is_vibrant, 1), A, 0.0)
wave_vibrant_a = np.where(wave_vibrant_a < 0.05, 0.0, wave_vibrant_a)
wave_mint_a = np.where(dil(is_mint, 1), A, 0.0)
wave_mint_a = np.where(wave_mint_a < 0.05, 0.0, wave_mint_a)
wave_clean_a = np.where(dil(is_vibrant | is_mint, 1), A, 0.0)
wave_clean_a = np.where(wave_clean_a < 0.05, 0.0, wave_clean_a)

# ================================================================ 1. AUTHENTIC HAND-DRAWN SOUND WAVES & BUBBLES
# Traced strictly through the empty dark gaps between each arc (verified from build/z/waves_l.png & waves_r.png!)
WAVE_POLYS = {
    "wave_l_1": [(284, 394), (314, 394), (312, 458), (282, 458)],
    "wave_l_2": [
        (282, 332), (318, 326), (324, 354), (296, 384), (281, 398),
        (279, 455), (316, 474), (316, 498), (288, 498), (266, 480),
        (251, 450), (247, 412), (256, 368),
    ],
    "wave_l_3": [
        (196, 360), (230, 298), (296, 272), (312, 294), (278, 330),
        (256, 360), (245, 410), (249, 452), (257, 474), (275, 496),
        (304, 512), (314, 558), (242, 546), (195, 462),
    ],
    "dot_l_pink": [(146, 428), (196, 428), (196, 478), (146, 478)],
    "dot_l_mint": [(172, 474), (214, 474), (214, 520), (172, 520)],

    "wave_r_1": [(718, 384), (743, 384), (741, 418), (732, 441), (712, 441), (713, 412)],
    "wave_r_2": [
        (704, 284), (734, 285), (754, 312), (764, 342), (766, 368),
        (775, 408), (766, 446), (734, 472), (715, 462), (736, 442),
        (746, 412), (744, 378), (722, 336), (704, 304),
    ],
    "wave_r_3": [
        (704, 244), (758, 248), (806, 306), (809, 344), (812, 376),
        (820, 396), (792, 472), (736, 510), (714, 496), (758, 456),
        (784, 392), (766, 344), (754, 312), (734, 285), (706, 274),
    ],
    "dot_r_mint": [(811, 336), (848, 336), (848, 386), (811, 386)],
}

layers = {}
wave_centers = {}


def save(name, col, a, pad=8):
    a = np.clip(a, 0.0, 1.0)
    ys, xs = np.nonzero(a > 0.008)
    x0, x1 = max(0, int(xs.min()) - pad), min(W, int(xs.max()) + pad + 1)
    y0, y1 = max(0, int(ys.min()) - pad), min(H, int(ys.max()) + pad + 1)
    c = np.clip(col[y0:y1, x0:x1], 0, 255)
    al = a[y0:y1, x0:x1] * 255.0
    out = np.dstack([c, al]).round().astype(np.uint8)
    out[al < 1.0] = 0
    cv2.imwrite(os.path.join(ART, f"{name}.png"), cv2.cvtColor(out, cv2.COLOR_RGBA2BGRA))
    layers[name] = {"x": float(x0), "y": float(y0), "w": int(x1 - x0), "h": int(y1 - y0)}
    return (0.5 * (x0 + x1), 0.5 * (y0 + y1))


# Inner & middle wave arcs are strictly pink+blue (mint inner crescent belongs cleanly to outer wave_l_3 / wave_r_3)
NO_MINT_WAVES = {"wave_l_1", "wave_l_2", "wave_r_1", "wave_r_2"}
MINT_ONLY_WAVES = {"dot_l_mint", "dot_r_mint"}
SINGLE_CC_WAVES = {"wave_l_1", "wave_l_2", "wave_r_1", "wave_r_2", "dot_l_pink", "dot_l_mint", "dot_r_mint"}

for wname, pts in WAVE_POLYS.items():
    m = poly(pts, soft=0.8)
    if wname in NO_MINT_WAVES:
        base_a = wave_vibrant_a
    elif wname in MINT_ONLY_WAVES:
        base_a = wave_mint_a
    else:
        base_a = wave_clean_a
    wa = m * base_a
    # Keep single largest connected stroke on inner/mid waves & dots (zero clipped corner triangles!),
    # and meaningful components (>= 200 px) on outer composite arcs wave_l_3 / wave_r_3.
    n_cc, lab_cc, st_cc, _ = cv2.connectedComponentsWithStats((wa > 0.12).astype(np.uint8), 8)
    keep_cc = np.zeros((H, W), bool)
    if n_cc > 1:
        if wname in SINGLE_CC_WAVES:
            best = 1 + int(np.argmax(st_cc[1:, cv2.CC_STAT_AREA]))
            keep_cc = (lab_cc == best)
        else:
            for i in range(1, n_cc):
                if st_cc[i, cv2.CC_STAT_AREA] >= 200:
                    keep_cc |= (lab_cc == i)
    wa = wa * dil(keep_cc, 2)
    wave_centers[wname] = save(wname, rgb.copy(), wa)

# ================================================================ 2. HEADPHONES (HEADBAND + LEFT & RIGHT EAR CUPS)
# Measured precisely from build/z/head.png:
EAR_L_PTS = [
    (310, 386), (324, 360), (346, 344), (366, 342), (367, 466),
    (342, 466), (320, 444), (310, 414),
]
EAR_R_PTS = [
    (610, 376), (626, 348), (654, 336), (686, 344), (704, 378),
    (704, 424), (684, 456), (650, 458), (620, 442), (610, 412),
]
HEADBAND_PTS = [
    # Outer top contour of pink/blue headband
    (332, 366), (346, 326), (376, 282), (420, 244), (475, 224),
    (536, 224), (594, 242), (642, 280), (674, 332), (678, 352),
    # Inner scalp boundary right along the mint head!
    (636, 356), (622, 324), (592, 290), (546, 268), (492, 264),
    (444, 274), (402, 304), (374, 344), (364, 372),
]

ear_l_poly = poly(EAR_L_PTS, soft=0.7)
ear_r_poly = poly(EAR_R_PTS, soft=0.7)
band_poly = poly(HEADBAND_PTS, soft=0.7)

# Cleanly separate headband from ear cups so ear cups overlap smoothly in front of headband ends!
ear_l_a = ear_l_poly * A
ear_r_a = ear_r_poly * A
band_a = band_poly * A * (1.0 - np.clip(poly([(614, 354), (696, 350), (696, 450), (614, 450)], soft=1.5), 0, 1))
band_a *= (1.0 - np.clip(poly([(312, 364), (364, 364), (364, 460), (312, 460)], soft=1.5), 0, 1))

save("ear_left", rgb, ear_l_a)
save("ear_right", rgb, ear_r_a)
save("headband", rgb, band_a)

# ================================================================ 3. FACE (EYES & SMILE)
# Cobalt blue features inside the clean mint face region (x=415..590, y=350..470)
cobalt = (rgb[..., 2] > rgb[..., 0] + 45) & (rgb[..., 0] < 110) & (A > 0.3)
face_parts = {}
for name, box in (
    ("eye_l", (420, 352, 472, 434)),
    ("eye_r", (534, 354, 584, 434)),
    ("smile", (472, 428, 534, 468)),
):
    x0, y0, x1, y1 = box
    m = np.zeros((H, W), bool)
    m[y0:y1, x0:x1] = True
    core = fill_holes(m & cobalt)
    face_parts[name] = core
    zone = dil(core, 4)
    # Estimate soft alpha against surrounding mint (#BDF2DF -> mean ~218, green ~242)
    mint_ref = np.array([194.0, 241.0, 223.0], np.float32)
    fg_col = rgb[core].mean(0)
    dist_bg = np.linalg.norm(rgb - mint_ref[None, None, :], axis=-1)
    dist_fg = np.linalg.norm(fg_col - mint_ref)
    ea = np.clip(dist_bg / max(dist_fg * 0.85, 1.0), 0.0, 1.0) * zone
    ea = np.where(core, np.clip(ea * 1.25, 0.0, 1.0), ea)
    col_e = np.where(core[..., None], rgb, fg_col[None, None, :])
    save(name, col_e, ea)

# ================================================================ 4. MINT GHOST BODY (WITH AUTHENTIC MARKER OUTLINE & SCALLOPS!)
# Pip's full body mask excludes the floating sound waves (`x < 312` on left, `x > 708` on right above y=520)
# AND excludes the outer ears & headband protrusion while keeping a clean continuous mint+pink head rim tucked
# safely BEHIND the headband and ear cups so headphone bounce/rotation NEVER exposes a gap!
BODY_CLIP = poly([
    (330, 350), (370, 275), (430, 232), (512, 220), (595, 238),
    (652, 282), (684, 352), (694, 440), (702, 540), (732, 650),
    (755, 720), (660, 745), (500, 748), (340, 742), (254, 700),
    (264, 635), (308, 560), (332, 462),
], soft=0.8)

# Paint out eyes & smile smoothly with genuine local mint marker texture!
face_any = face_parts["eye_l"] | face_parts["eye_r"] | face_parts["smile"]
face_hole = dil(face_any, 6)
body_rgb = rgb.copy()
body_a = BODY_CLIP * A

# Smooth Telea inpaint for mint face behind eyes & smile
known_mint = (~face_hole) & (A > 0.8) & (xx > 390) & (xx < 610) & (yy > 300) & (yy < 520)
src_face = rgb.astype(np.uint8).copy()
body_face_fill = cv2.inpaint(src_face, face_hole.astype(np.uint8), 9, cv2.INPAINT_TELEA).astype(np.float32)
body_rgb[face_hole] = body_face_fill[face_hole]

# Keep Pip's authentic body (mint fill + hot-pink & cobalt hand-drawn outlines & scalloped hem),
# and inside the upper headband/ear-cup overlap keep Pip's rounded mint head + pink marker contour clean
# (removing only the outer protruding parts of the blue ear cups that stick outside Pip's silhouette so
# the moving ear cups don't leave a "double ear" ghost behind them!).
# Pip's clean rounded ghost silhouette WITHOUT the protruding ear cups (generously full behind ear cups!)
GHOST_CLEAN_SILH = poly([
    (508, 248), (568, 258), (616, 288), (650, 342), (668, 412),
    (680, 488), (700, 585), (734, 672), (746, 705), (680, 738),
    (512, 744), (350, 736), (260, 695), (266, 650), (314, 578),
    (340, 488), (344, 412), (360, 342), (396, 288), (446, 258),
], soft=1.4)

# Inside GHOST_CLEAN_SILH where ear_right / ear_left sat on Pip's edge, paint clean mint inside and a soft
# hot-pink marker outline along the edge so if an ear cup tilts/bounces, it reveals clean mint & pink!
ear_overlap = ((ear_l_poly > 0.25) | (ear_r_poly > 0.25)) & (GHOST_CLEAN_SILH > 0.35) & (yy < 458)
if ear_overlap.any():
    dist_in = cv2.distanceTransform((GHOST_CLEAN_SILH > 0.5).astype(np.uint8), cv2.DIST_L2, 5)
    mint_col = np.array([194.0, 241.0, 223.0], np.float32)
    pink_col = np.array([255.0, 44.0, 148.0], np.float32)
    t_rim = np.clip((13.0 - dist_in) / 5.5, 0.0, 1.0)[..., None]
    fill_ear = mint_col * (1.0 - t_rim) + pink_col * t_rim
    body_rgb[ear_overlap] = fill_ear[ear_overlap]

# Clip body alpha smoothly to GHOST_CLEAN_SILH above y=475 (eliminates double ear-cup & double headband shadow!)
# while keeping 100% of the authentic scalloped marker outline untouched below y=475!
upper_blend = np.clip((475.0 - yy) / 25.0, 0.0, 1.0)
body_a = body_a * (1.0 - upper_blend) + (GHOST_CLEAN_SILH * np.maximum(A, (GHOST_CLEAN_SILH > 0.5).astype(np.float32))) * upper_blend
# Preserve original outer alpha below y=475 (strictly no waves!)
body_a = np.where(yy >= 475, BODY_CLIP * A, body_a)

save("body", body_rgb, body_a, pad=10)

pts = {
    "headband_pivot": [506.0, 320.0],
    "ear_l_pivot": [346.0, 408.0],
    "ear_r_pivot": [654.0, 398.0],
    "eye_l": [float(v) for v in np.argwhere(face_parts["eye_l"]).mean(0)[::-1]],
    "eye_r": [float(v) for v in np.argwhere(face_parts["eye_r"]).mean(0)[::-1]],
    "smile": [float(v) for v in np.argwhere(face_parts["smile"]).mean(0)[::-1]],
    "torso_root": [502.0, 520.0],
    "head_bone": [502.0, 395.0],
    "lobe_roots": [[358.0, 560.0], [454.0, 575.0], [552.0, 575.0], [650.0, 560.0]],
    "waves": wave_centers,
}
layers["points"] = pts
layers["size"] = [W, H]
json.dump(layers, open(os.path.join(ROOT, "tools", "layers.json"), "w"), indent=2)


# ================================================================ 5. DEBUG COMPOSITES
def comp(order, bg_col=(248, 246, 241)):
    c = np.full((H, W, 3), bg_col, np.float32)
    for nm in order:
        b = layers[nm]
        im = cv2.cvtColor(cv2.imread(os.path.join(ART, nm + ".png"), cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA).astype(np.float32)
        x0, y0 = int(b["x"]), int(b["y"])
        hh, ww = im.shape[:2]
        a = im[..., 3:4] / 255.0
        c[y0:y0 + hh, x0:x0 + ww] = c[y0:y0 + hh, x0:x0 + ww] * (1.0 - a) + im[..., :3] * a
    return np.clip(c, 0, 255).astype(np.uint8)


all_waves = list(WAVE_POLYS.keys())
cv2.imwrite(os.path.join(DBG, "cut_comp.png"), cv2.cvtColor(
    comp(["body", "eye_l", "eye_r", "smile", "headband", "ear_left", "ear_right"] + all_waves),
    cv2.COLOR_RGB2BGR,
))
cv2.imwrite(os.path.join(DBG, "cut_body.png"), cv2.cvtColor(comp(["body"], (42, 48, 58)), cv2.COLOR_RGB2BGR))
cv2.imwrite(os.path.join(DBG, "cut_parts.png"), cv2.cvtColor(
    comp(["headband", "ear_left", "ear_right", "eye_l", "eye_r", "smile"] + all_waves, (42, 48, 58)),
    cv2.COLOR_RGB2BGR,
))
print("Exported layers:", [k for k in layers if k not in ("points", "size")])

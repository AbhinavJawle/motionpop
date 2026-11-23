"""Cut the Craftsman Pip reference (2000x2000 RGBA) into clean, texture-preserving animatable layers.

usage: uv run --with opencv-python-headless --with numpy --with pillow python3 tools/cut.py

Exports layers at SCALE = 0.5 (1000x1000 artboard units) into art/*.png + tools/layers.json:
- body:          Knitted beige/brown body (eyes, smile, left paw, and film overlap reconstructed with matching wool/knit).
- eye_l, eye_r, smile: Warm dark-brown oval eyes and curved smile.
- paw_left:      Knitted left mitten holding the film strip.
- paw_right:     Floating knitted right mitten (orange scissor handles cleanly painted out with knit texture).
- blade_front:   Vertical front steel blade + lower-right orange handle (clean transparent finger hole).
- blade_back:    Diagonal back steel blade + upper-left orange handle (clean transparent hole + steel rebuilt under pivot).
- scissor_pivot: Central silver rivet screw at the blade hinge.
- film_tile:     Seamless 5-frame 35mm film strip built from the original frames, with BOTH left & right sprockets transparent.
- film_offcut:   Exact 1-frame 35mm film offcut matching film_tile for clean detachment after cutting.
- film_chip:     Small rectangular trim sliver from the film edge for an understated mid-cycle snip detail.
"""
import json, math, os
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "source", "pip-craft-reference.png")
ART = os.path.join(ROOT, "art")
DBG = os.path.join(ROOT, "build")
os.makedirs(ART, exist_ok=True)
os.makedirs(DBG, exist_ok=True)
SCALE = 0.5

bgra = cv2.imread(SRC, cv2.IMREAD_UNCHANGED)
H, W = bgra.shape[:2]  # 2000 x 2000
rgb = cv2.cvtColor(bgra[..., :3], cv2.COLOR_BGR2RGB)
A = bgra[..., 3].astype(np.float32) / 255.0
hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)  # h: 0..180, s: 0..255, v: 0..255
L = rgb.astype(np.float32).mean(-1)
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


def ero(m, r):
    return cv2.erode(m.astype(np.uint8), disk(r)) > 0 if r > 0 else m.astype(bool)


def fill_holes(m):
    inv = (~m).astype(np.uint8)
    _, lab = cv2.connectedComponents(inv, connectivity=4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    return m | (~np.isin(lab, list(border)) & (inv > 0))


def textured_fill(img, known, hole, shifts, sigma=3.5, radius=13):
    """Fill `hole` strictly from `known` pixels: nearest-neighbor prefill + Telea color + high-frequency texture."""
    if isinstance(shifts[0], (int, float)):
        shifts = [shifts]
    known_u8 = known.astype(np.uint8)
    _, labels = cv2.distanceTransformWithLabels((~known).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    pts = np.argwhere(known)
    lut_y = np.zeros(labels.max() + 1, np.int32)
    lut_x = np.zeros(labels.max() + 1, np.int32)
    lut_y[1:len(pts) + 1] = pts[:, 0]
    lut_x[1:len(pts) + 1] = pts[:, 1]
    src = img.copy()
    unk = ~known
    src[unk] = img[lut_y[labels[unk]], lut_x[labels[unk]]]
    base = cv2.inpaint(src, hole.astype(np.uint8), radius, cv2.INPAINT_TELEA).astype(np.float32)

    f = src.astype(np.float32)
    detail = f - cv2.GaussianBlur(f, (0, 0), sigma)
    out = img.astype(np.float32).copy()
    rem = hole.copy()
    for sx, sy in shifts:
        M = np.float32([[1, 0, sx], [0, 1, sy]])
        det_s = cv2.warpAffine(detail, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        ok_s = cv2.warpAffine(known_u8, M, (W, H), flags=cv2.INTER_NEAREST) > 0
        take = rem & ok_s
        out[take] = base[take] + det_s[take] * 0.90
        rem &= ~take
    out[rem] = base[rem]
    return np.clip(out, 0, 255)


alpha = A > 0.02

# ================================================================ 1. SCISSORS & RIGHT PAW
# Measured from build/z/scissors.png (2000x2000):
PIVOT = np.array([1658.0, 811.0])

# Clean orange-handle mask (high saturation orange/amber strictly inside right-side scissors box)
SC_BOX = (xx >= 1460) & (xx <= 1810) & (yy >= 630) & (yy <= 1040)
orange_raw = SC_BOX & alpha & (hsv[..., 0] >= 4) & (hsv[..., 0] <= 24) & (hsv[..., 1] > 122) & (hsv[..., 2] > 80)
orange_raw = cv2.morphologyEx(orange_raw.astype(np.uint8), cv2.MORPH_CLOSE, disk(2)) > 0
orange_raw = cv2.morphologyEx(orange_raw.astype(np.uint8), cv2.MORPH_OPEN, disk(2)) > 0

# Split the two orange handles strictly by connected components (2 largest components: left=back, right=front!)
n_cc, lab_cc, st_cc, cen_cc = cv2.connectedComponentsWithStats(orange_raw.astype(np.uint8), 8)
top2 = sorted(range(1, n_cc), key=lambda i: -st_cc[i, cv2.CC_STAT_AREA])[:2]
top2.sort(key=lambda i: cen_cc[i][0])  # left centroid first = back handle, right centroid second = front handle
handle_back_m = (lab_cc == top2[0])
handle_front_m = (lab_cc == top2[1])
orange_clean = handle_back_m | handle_front_m

# Front blade: vertical blade from tip (1680, 643) down through pivot (1658, 811) to front handle join (1648..1675, 856)
BLADE_FRONT_POLY = poly([
    (1683, 639), (1668, 646), (1655, 672), (1648, 720), (1642, 775),
    (1635, 818), (1639, 836), (1648, 858), (1675, 858), (1676, 815),
    (1678, 740), (1682, 665),
], soft=0.6)
blade_front_steel_m = (BLADE_FRONT_POLY > 0.5) & alpha & ~orange_clean & (hsv[..., 1] < 70)
front_all_m = blade_front_steel_m | handle_front_m
blade_front_a = np.clip(cv2.GaussianBlur(front_all_m.astype(np.float32), (0, 0), 0.7) * 1.15, 0, 1) * A
blade_front_a = np.where(blade_front_steel_m & (yy < 770), A, blade_front_a)
blade_front_rgb = rgb.astype(np.float32).copy()

# Back blade: diagonal blade from tip (1778, 695) down-left through pivot (1658, 811) to upper-left handle (1618, 845)
BB_AXIS = np.array([1776.0 - 1658.0, 697.0 - 811.0])
BB_AXIS /= np.linalg.norm(BB_AXIS)
# Tight straight diagonal upper cutting edge from (1778, 693) straight through (1684, 779) -> (1644, 811) -> (1614, 832)!
BLADE_BACK_POLY = poly([
    (1781, 691), (1770, 695), (1732, 732), (1684, 779), (1644, 811),
    (1614, 830), (1625, 852), (1656, 834), (1692, 804), (1738, 762),
    (1768, 725), (1782, 700),
], soft=0.6)
blade_back_vis_steel = (BLADE_BACK_POLY > 0.5) & alpha & ~dil(blade_front_steel_m, 1) & ~orange_clean & (hsv[..., 1] < 72)
# Reconstruct the hidden crossing of the back blade behind the front blade strictly inside BLADE_BACK_POLY!
blade_back_hidden = (BLADE_BACK_POLY > 0.5) & dil(blade_front_steel_m, 2) & ~handle_back_m & ~handle_front_m
bb_rgb = rgb.astype(np.float32).copy()
hy, hx = np.nonzero(blade_back_hidden)
filled = np.zeros(len(hy), bool)
for step in range(4, 150, 2):
    for sgn in (1, -1):
        sx = np.round(hx + sgn * step * BB_AXIS[0]).astype(int)
        sy = np.round(hy + sgn * step * BB_AXIS[1]).astype(int)
        inb = (~filled) & (sx >= 0) & (sx < W) & (sy >= 0) & (sy < H)
        if not inb.any():
            continue
        ok = np.zeros(len(hy), bool)
        ok[inb] = blade_back_vis_steel[sy[inb], sx[inb]] & ~dil(blade_front_steel_m, 3)[sy[inb], sx[inb]]
        bb_rgb[hy[ok], hx[ok]] = rgb[sy[ok], sx[ok]]
        filled |= ok
if blade_back_hidden.any():
    blur_bb = cv2.GaussianBlur(bb_rgb, (0, 0), 1.0)
    bb_rgb[blade_back_hidden] = blur_bb[blade_back_hidden]

back_all_m = blade_back_vis_steel | blade_back_hidden | handle_back_m
blade_back_a = np.clip(cv2.GaussianBlur(back_all_m.astype(np.float32), (0, 0), 0.7) * 1.15, 0, 1) * np.where(blade_back_hidden, 1.0, A)
blade_back_a = np.where(blade_back_vis_steel & (xx > 1685), A, blade_back_a)

# Central silver pivot screw (circle centered at PIVOT = (1658, 811), radius 11 px)
dist_piv = np.hypot(xx - PIVOT[0], yy - PIVOT[1])
piv_a = np.clip((11.5 - dist_piv) / 2.2, 0.0, 1.0) * A

# Right knitted paw (floating mitten at x=1445..1680, y=865..1100), painting out BOTH orange handles cleanly!
PAW_R_BOX = (xx >= 1435) & (xx <= 1715) & (yy >= 845) & (yy <= 1115)
orange_on_paw = dil(orange_clean, 5) & PAW_R_BOX
PAW_R_POLY = poly([
    (1454, 1020), (1464, 976), (1498, 930), (1532, 892), (1566, 878),
    (1602, 884), (1638, 910), (1665, 946), (1668, 982), (1644, 1020),
    (1592, 1068), (1536, 1096), (1482, 1092), (1456, 1060),
], soft=1.6)
paw_r_m = PAW_R_POLY > 0.5
paw_r_hole = paw_r_m & orange_on_paw
paw_r_known = paw_r_m & alpha & ~orange_on_paw & (hsv[..., 1] < 92)
paw_r_rgb = textured_fill(rgb, paw_r_known, paw_r_hole, [(36, 44), (-34, 40), (0, 56), (-44, 10)], sigma=4.2, radius=15)
paw_r_a = np.where(paw_r_hole, PAW_R_POLY, PAW_R_POLY * A)
PAW_R_PIVOT = np.array([1560.0, 990.0])

# ================================================================ 2. FILM STRIP (5-FRAME TILE + OFFCUT + CHIP) & LEFT PAW
# Exact measurements from build/z/film.png:
# x = 320 .. 587 (width 267), frames pitch = 147.5 px:
# Bar 1-2 center = 1114.0, Bar 2-3 center = 1261.5, Bar 3-4 center = 1409.0, Bottom = 1545
FILM_X0, FILM_X1 = 319, 588
FILM_W = FILM_X1 - FILM_X0
PITCH = 148  # integer 148 px in 2000px = 74.0 px exact in 1000px artboard! (147.5 rounded cleanly for exact tile loop)
FILM_TOP_Y = 953  # 1545 - 4 * 148 = 953 (exact 4-frame top line right under Pip's left paw!)

# Extract a pristine 1-frame master tile from unobstructed Frame 2 & Frame 3 (y = 1114 .. 1262, height = 148)!
# Note: Frame 2 starts with half a black bar at y=1114..1126, sepia window 1126..1249, half black bar 1249..1262!
# Wait: align the tile top right to a black bar top so 4 tiles stack cleanly from y=953 to y=1545!
# In build/z/film.png:
#   Frame 2 top bar top: ~1102, Frame 3 top bar top: ~1250, Frame 4 top bar top: ~1398, bottom edge: 1545!
#   Check! 1545 - 1397 = 148; 1397 - 1249 = 148; 1249 - 1101 = 148; 1101 - 953 = 148!
#   EXACTLY 148.0 px PER FRAME!!
# Take the super-clean unobstructed Frame 3 block aligned strictly to the black bar center (y = 1258 .. 1406, 148 px)!
# Top rows 1258..1273 (15px solid black bar), window 1273..1397 (124px warm sepia frame), bottom rows 1397..1406 (9px solid black bar)!
tile1_rgb = rgb[1258:1406, FILM_X0:FILM_X1].astype(np.float32).copy()
tile1_a = A[1258:1406, FILM_X0:FILM_X1].copy()

# Punch out BOTH left AND right sprocket holes cleanly as TRUE transparent perforations!
# Measure exact left sprocket holes from tile1_a (they are ALREADY transparent in the reference!)
# Left sprocket band: x = 335..385 -> local lx = 16..66; Right sprocket band: x = 532..582 -> local lx = 213..263
left_strip_a = tile1_a[:, 0:72]
# Mirror the exact left sprocket mask symmetrically onto the right sprocket side!
# Check exact left & right outer edge centers in local coords (0..269):
# Left edge of film is at x=320 (lx=1), right edge is at x=586 (lx=267) -> symmetry center lx = 134!
right_from_left_a = left_strip_a[:, ::-1]
# Right strip occupies lx = (269 - 72) .. 269 = 197 .. 269!
# Actually align right sprocket x-center carefully: in build/z/film.png:
#   Left holes:  x = 342..374 (center 358, offset +38 from left edge x=320)
#   Right holes: x = 540..572 (center 556, offset -30 from right edge x=586 -> wait: 586-556=30, 358-320=38)
# Let's detect exact bright/non-black holes on the right strip directly AND intersect with clean rounded sprocket rows!
right_band_L = tile1_rgb[:, 218:258].mean(-1)
# In build/z/film.png, the black film border has L < 55 while the knitted body seen through right holes has L > 95!
# And the left holes have tile1_a < 0.5! Let's copy the EXACT shape of the left holes shifted to the right hole centers!
hole_left = (tile1_a[:, 15:65] < 0.5)
ys_h, xs_h = np.nonzero(hole_left)
# Find exact right hole x-center from right_band_L > 85
rh_mask = (tile1_rgb[:, 215:260].mean(-1) > 85)
_, rxs = np.nonzero(rh_mask)
lx_center = 15 + xs_h.mean()
rx_center = 215 + rxs.mean()
shift_x = int(round(rx_center - lx_center))
print(f"Sprocket hole centers: left lx={lx_center:.1f} (x={FILM_X0+lx_center:.1f}), right lx={rx_center:.1f} (x={FILM_X0+rx_center:.1f}), shift={shift_x}")

# Apply exact transparent sprocket holes on the right side by shifting the left sprocket alpha channel!
tile1_a_clean = tile1_a.copy()
for lx in range(15, 65):
    rx = lx + shift_x
    if 0 <= rx < FILM_W:
        tile1_a_clean[:, rx] = np.minimum(tile1_a_clean[:, rx], tile1_a[:, lx])
# Also ensure crisp black film outer right edge (no knitted wool bleed outside x=586 -> lx=267)
tile1_a_clean[:, 267:] = 0.0
tile1_a_clean[:, :1] = 0.0
# Slight darkening of any bright wool fringe right on the inner bevel of the right sprocket holes so they match left holes!
right_hole_rim = dil(tile1_a_clean[:, 205:266] < 0.5, 3) & (tile1_a_clean[:, 205:266] >= 0.5)
rh_col = tile1_rgb[:, 205:266]
rh_col[right_hole_rim] = np.minimum(rh_col[right_hole_rim], 42.0)
tile1_rgb[:, 205:266] = rh_col

# Build the 5-frame seamless film_tile (height = 5 * 148 = 740 px -> stacked seamlessly at y = 805 .. 1545!)
film_tile_rgb = np.tile(tile1_rgb, (5, 1, 1))
film_tile_a = np.tile(tile1_a_clean, (5, 1))

# Build the 1-frame film_offcut (height = 148 + 10 = 158 px: exact tile1 + clean thin black bottom edge bar!)
bot_bar_rgb = tile1_rgb[0:10, :, :].copy()
bot_bar_a = tile1_a_clean[0:10, :].copy()
film_offcut_rgb = np.vstack([tile1_rgb, bot_bar_rgb])
film_offcut_a = np.vstack([tile1_a_clean, bot_bar_a])

# Build a tiny rectangular film trim chip (a corner snip of black sprocket edge + warm sepia corner, 64x46 px in 2000px!)
film_chip_rgb = tile1_rgb[102:148, 202:266].copy()
film_chip_a = tile1_a_clean[102:148, 202:266].copy()

# Left knitted paw (holding the top of the film strip: x=355..552, y=840..1030 in build/z/film.png!)
PAW_L_POLY = poly([
    (360, 938), (366, 898), (390, 862), (425, 843), (468, 842),
    (508, 860), (538, 895), (552, 934), (546, 956), (528, 964),
    (515, 988), (496, 1016), (464, 1030), (424, 1028), (394, 1008),
    (374, 974),
], soft=0.9)
# Exclude the black film border peeking on the far left/right of the paw (L < 65)
black_film = (xx >= FILM_X0 - 4) & (xx <= FILM_X1 + 4) & (yy >= 942) & (yy <= 1552) & (L < 72)
paw_l_m = (PAW_L_POLY > 0.5) & alpha & ~black_film
paw_l_a = PAW_L_POLY * A * (~dil(black_film, 1))
# Restore clean smooth rounded edge where paw meets film (no jagged black notch!)
paw_l_a = np.where((PAW_L_POLY > 0.5) & ~black_film, PAW_L_POLY * A, 0.0)
paw_l_a = cv2.GaussianBlur(paw_l_a.astype(np.float32), (0, 0), 0.5)
PAW_L_PIVOT = np.array([452.0, 938.0])

# ================================================================ 3. FACE (EYES & SMILE)
face_parts = {}
for name, box, thr in (
    ("eye_l", (1005, 568, 1075, 702), 130),
    ("eye_r", (1202, 574, 1272, 704), 130),
    ("smile", (1096, 692, 1184, 750), 145),
):
    x0, y0, x1, y1 = box
    m = np.zeros((H, W), bool)
    m[y0:y1, x0:x1] = True
    dark = m & (L < thr)
    _, lab, st, _ = cv2.connectedComponentsWithStats(dark.astype(np.uint8), 8)
    core = fill_holes(lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])))
    face_parts[name] = core
face_any = face_parts["eye_l"] | face_parts["eye_r"] | face_parts["smile"]
face_zone = dil(face_any, 8)

# ================================================================ 4. KNITTED BODY (clean reconstruction!)
# Exclude right paw & scissors (x > 1425, y < 1140) and left film/paw outside body silhouette!
# Trace Pip's true symmetrical ghost body silhouette (matching the clean left head curve down to the left hem lobe!)
BODY_SILH = poly([
    (1000, 188), (1140, 202), (1260, 260), (1345, 360), (1395, 500),
    (1418, 720), (1435, 960), (1470, 1240), (1530, 1520), (1568, 1680),
    (1555, 1750), (1470, 1775), (1300, 1778), (1080, 1780), (800, 1780),
    (520, 1775), (448, 1745), (446, 1640), (476, 1540), (508, 1400),
    (538, 1240), (566, 1060), (582, 880), (595, 680), (618, 500),
    (672, 355), (765, 250), (880, 198),
], soft=1.2)
body_silh_m = BODY_SILH > 0.5

# Film strip + left paw region overlapping Pip's left knitted flank (include 16px margin to remove dark film shadow edge!)
film_box_m = (xx >= FILM_X0 - 4) & (xx <= FILM_X1 + 16) & (yy >= 936) & (yy <= 1558)
body_overlap_l = body_silh_m & (film_box_m | dil(paw_l_m, 6))
body_known = body_silh_m & alpha & ~body_overlap_l & ~face_zone & (xx < 1575)

body_rgb = rgb.astype(np.float32).copy()
# 1. Fill eyes & smile cleanly using adjacent vertical cream wool fur (horizontal shift preserves vertical fur grain!)
if face_zone.any():
    f_face = textured_fill(rgb, body_known, face_zone, [(85, 0), (-85, 0), (0, -90)], sigma=4.0, radius=13)
    body_rgb[face_zone] = f_face[face_zone]
# 2. Fill hidden left knitted flank behind the film strip using adjacent knitted wool columns with feathered transition!
if body_overlap_l.any():
    f_left = textured_fill(rgb, body_known, body_overlap_l, [(-115, 0), (-165, 25), (-90, -30)], sigma=5.0, radius=19)
    M_knit = np.float32([[1, 0, -118], [0, 1, 0]])
    knit_src = cv2.warpAffine(rgb.astype(np.float32), M_knit, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    knit_ok = cv2.warpAffine(body_known.astype(np.uint8), M_knit, (W, H), flags=cv2.INTER_NEAREST) > 0
    rebuilt = f_left.copy()
    blend_k = body_overlap_l & knit_ok
    rebuilt[blend_k] = 0.55 * knit_src[blend_k] + 0.45 * f_left[blend_k]
    dist_edge = cv2.distanceTransform(body_silh_m.astype(np.uint8), cv2.DIST_L2, 5)
    rim_shade = np.clip(dist_edge / 28.0, 0.88, 1.0)
    rebuilt *= rim_shade[..., None]
    # Smoothly feather the join at x ~ 588 so there is ZERO vertical seam between reconstructed flank & original body!
    feather = cv2.GaussianBlur(dil(body_overlap_l, 4).astype(np.float32), (0, 0), 7.0)
    feather = np.where(body_overlap_l, 1.0, feather * body_silh_m)
    body_rgb = body_rgb * (1.0 - feather[..., None]) + rebuilt * feather[..., None]

# Body alpha: real fuzzy wool alpha everywhere except the reconstructed left overlap where we use soft silhouette alpha!
body_a = np.where(body_overlap_l, BODY_SILH, BODY_SILH * A)
# Keep fuzzy wool edge on the reconstructed left edge soft like the right edge
edge_blur = cv2.GaussianBlur(body_a, (0, 0), 1.4)
body_a = np.where(dil(body_overlap_l, 4) & ~ero(body_silh_m, 4), edge_blur, body_a)

# ================================================================ 5. EXPORT AT SCALE = 0.5 (1000x1000 artboard)
layers = {}


def save_canvas(name, col, a, x0_force=None, y0_force=None):
    """Save a cropped full-canvas (H x W) layer at SCALE with 8px transparent padding."""
    a = np.clip(a, 0.0, 1.0)
    ys, xs = np.nonzero(a > 0.004)
    x0 = max(0, int(xs.min()) - 12) if x0_force is None else x0_force
    x1 = min(W, int(xs.max()) + 13)
    y0 = max(0, int(ys.min()) - 12) if y0_force is None else y0_force
    y1 = min(H, int(ys.max()) + 13)
    crop_c = np.clip(col[y0:y1, x0:x1], 0, 255).astype(np.float32)
    crop_a = a[y0:y1, x0:x1].astype(np.float32)
    save_patch(name, crop_c, crop_a, x0, y0)


def save_patch(name, crop_c, crop_a, ref_x0, ref_y0, pad=12):
    """Premultiplied resize of a local patch (with transparent border pad) at SCALE."""
    h0, w0 = crop_a.shape
    c_pad = cv2.copyMakeBorder(crop_c, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(0, 0, 0))
    a_pad = cv2.copyMakeBorder(crop_a, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0.0)
    x0, y0 = ref_x0 - pad, ref_y0 - pad
    w = max(2, int(round(c_pad.shape[1] * SCALE)))
    h = max(2, int(round(c_pad.shape[0] * SCALE)))
    pm = c_pad * a_pad[..., None]
    pm_s = cv2.resize(pm, (w, h), interpolation=cv2.INTER_AREA)
    al_s = cv2.resize(a_pad, (w, h), interpolation=cv2.INTER_AREA)
    rgb_s = np.where(al_s[..., None] > 1e-3, pm_s / np.maximum(al_s[..., None], 1e-3), 0.0)
    out = np.dstack([np.clip(rgb_s, 0, 255), np.clip(al_s * 255.0, 0, 255)]).round().astype(np.uint8)
    out[out[..., 3] < 1] = 0
    cv2.imwrite(os.path.join(ART, f"{name}.png"), cv2.cvtColor(out, cv2.COLOR_RGBA2BGRA))
    layers[name] = {"x": round(x0 * SCALE, 2), "y": round(y0 * SCALE, 2), "w": w, "h": h}


# Save eyes & smile (preserve exact warm brown colour + soft wool shadow edge!)
for name, core in face_parts.items():
    zone = dil(core, 9)
    # Estimate soft alpha against clean reconstructed cream wool behind the face
    bg_L = body_rgb.mean(-1)
    fg_col = rgb[core].mean(0) if name != "smile" else np.array([62.0, 44.0, 34.0], np.float32)
    ea = np.clip((bg_L - L) / np.maximum(bg_L - fg_col.mean(), 1.0), 0.0, 1.0) * zone
    ea = np.where(core, np.clip(ea * 1.25, 0.0, 1.0), ea)
    # Use actual reference eye/smile pixels where opaque, warm brown in soft halo
    col_e = np.where(core[..., None], rgb.astype(np.float32), fg_col[None, None, :])
    save_canvas(name, col_e, ea)

save_canvas("body", body_rgb, body_a)
save_canvas("paw_left", rgb.astype(np.float32), paw_l_a)
save_canvas("paw_right", paw_r_rgb, paw_r_a)
save_canvas("blade_front", blade_front_rgb, blade_front_a)
save_canvas("blade_back", bb_rgb, blade_back_a)
save_canvas("scissor_pivot", rgb.astype(np.float32), piv_a)

# Save film pieces at their exact reference positions (at SCALE = 0.5):
# film_tile (5 frames = 740 px tall): placed at y = 805 .. 1545 (so bottom 4 frames sit at y = 953 .. 1545!)
save_patch("film_tile", film_tile_rgb, film_tile_a, FILM_X0, FILM_TOP_Y - PITCH)
# film_offcut (1 frame + 10px bar): placed starting right at y = 1545 (the bottom cut line of frame 4!)
save_patch("film_offcut", film_offcut_rgb, film_offcut_a, FILM_X0, 1545)
# film_chip: small corner snip placed at bottom-right of frame 4
save_patch("film_chip", film_chip_rgb, film_chip_a, FILM_X0 + 202, 1545 - 46)

pts = {
    "scissor_pivot": (PIVOT * SCALE).tolist(),
    "paw_left": (PAW_L_PIVOT * SCALE).tolist(),
    "paw_right": (PAW_R_PIVOT * SCALE).tolist(),
    "eye_l": [float(v * SCALE) for v in np.argwhere(face_parts["eye_l"]).mean(0)[::-1]],
    "eye_r": [float(v * SCALE) for v in np.argwhere(face_parts["eye_r"]).mean(0)[::-1]],
    "smile": [float(v * SCALE) for v in np.argwhere(face_parts["smile"]).mean(0)[::-1]],
    "film_x0": FILM_X0 * SCALE,
    "film_x1": FILM_X1 * SCALE,
    "film_top_y": FILM_TOP_Y * SCALE,
    "film_bot_y": 1545.0 * SCALE,
    "film_pitch": PITCH * SCALE,
    "body_root": [508.0, 575.0],
    "head_bone": [508.0, 400.0],
    "crown_bone": [508.0, 225.0],
    "hem_bone": [508.0, 740.0],
}
layers["points"] = pts
layers["size"] = [int(W * SCALE), int(H * SCALE)]  # 1000 x 1000
layers["scale"] = SCALE
json.dump(layers, open(os.path.join(ROOT, "tools", "layers.json"), "w"), indent=2)


# ================================================================ 6. DEBUG COMPOSITES (1000x1000)
def comp(order, bg_col=(115, 130, 125)):
    AW, AH = layers["size"]
    c = np.full((AH, AW, 3), bg_col, np.float32)
    for nm in order:
        b = layers[nm]
        im = cv2.cvtColor(cv2.imread(os.path.join(ART, nm + ".png"), cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA).astype(np.float32)
        x0, y0 = int(round(b["x"])), int(round(b["y"]))
        hh, ww = im.shape[:2]
        # Clip to canvas safely
        sx0, sy0 = max(0, -x0), max(0, -y0)
        dx0, dy0 = max(0, x0), max(0, y0)
        cw, ch = min(ww - sx0, AW - dx0), min(hh - sy0, AH - dy0)
        if cw <= 0 or ch <= 0:
            continue
        sub_im = im[sy0:sy0 + ch, sx0:sx0 + cw]
        a = sub_im[..., 3:4] / 255.0
        c[dy0:dy0 + ch, dx0:dx0 + cw] = c[dy0:dy0 + ch, dx0:dx0 + cw] * (1.0 - a) + sub_im[..., :3] * a
    return np.clip(c, 0, 255).astype(np.uint8)


cv2.imwrite(os.path.join(DBG, "cut_comp.png"), cv2.cvtColor(
    comp(["body", "eye_l", "eye_r", "smile", "film_tile", "paw_left", "paw_right", "blade_back", "blade_front", "scissor_pivot"]),
    cv2.COLOR_RGB2BGR,
))
cv2.imwrite(os.path.join(DBG, "cut_body.png"), cv2.cvtColor(comp(["body"]), cv2.COLOR_RGB2BGR))
cv2.imwrite(os.path.join(DBG, "cut_scissors.png"), cv2.cvtColor(
    comp(["paw_right", "blade_back", "blade_front", "scissor_pivot"])[280:600, 680:950],
    cv2.COLOR_RGB2BGR,
))
# Also show blade_back ALONE + paw_right ALONE + blade_front ALONE side-by-side!
sb1 = comp(["paw_right"])[280:600, 680:950]
sb2 = comp(["blade_back"])[280:600, 680:950]
sb3 = comp(["blade_front", "scissor_pivot"])[280:600, 680:950]
cv2.imwrite(os.path.join(DBG, "cut_scissors_split.png"), cv2.cvtColor(np.hstack([sb1, sb2, sb3]), cv2.COLOR_RGB2BGR))

sf1 = comp(["film_tile"])[380:880, 120:330]
sf2 = comp(["film_offcut"])[720:920, 120:330]
sf3 = comp(["paw_left"])[380:580, 120:330]
# Pad sf2 & sf3 to stack cleanly beside sf1
sf_right = np.vstack([sf3, sf2, np.full((100, 210, 3), (115, 130, 125), np.uint8)])
cv2.imwrite(os.path.join(DBG, "cut_film_split.png"), cv2.cvtColor(np.hstack([sf1, sf_right]), cv2.COLOR_RGB2BGR))

print("Exported layers:", [k for k in layers if k not in ("points", "size", "scale")])

"""Cut the sketching-Pip reference into clean, independently animatable layers.

usage: uv run --with opencv-python-headless --with numpy --with pillow python3 tools/cut.py

Layers (reference px, 1032x928, RGBA):
- body:      Pip's plush white/grey head + torso (eyes, smile, left paw, pencil, right arm, and tail removed
             and texture-filled cleanly; clean fur extension tucked behind the book's top edge).
- tail:      Pip's curled left ghost lobe behind the left edge of the book (extended under the book).
- arm_right: Pip's right (drawing) arm behind the pencil (from shoulder behind body to the grip).
- arm_left:  Pip's free left paw resting on the left page (soft chest blend on top, crisp outline on bottom).
- eye_l, eye_r, smile: Pip's painterly charcoal face features for blinks, eye tracking, and expressions.
- book:      The open sketchbook with left-paw overlap, pencil tip, shadow, orange doodle, and bookmark
             cleanly painted out with matching impasto paper texture.
- page_l:    The left page's top sheet (from the clean restored book) for page flutter / curl.
- bookmark:  The curled white ribbon bookmark sticking out of the left pages.
- pencil:    The orange wooden pencil (barrel reconstructed cleanly behind the paw; clean wood cone & tip).
- paw:       Pip's round plush drawing paw in front of the pencil shaft.
- shadow:    The pencil's soft brown cast shadow on the right page.

Writes art/<layer>.png, tools/layers.json, and build/cut_*.png debug verification views.
"""
import json, os
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "source", "pip-sketch-reference.png")
ART = os.path.join(ROOT, "art")
DBG = os.path.join(ROOT, "build")
os.makedirs(ART, exist_ok=True)
os.makedirs(DBG, exist_ok=True)

bgra = cv2.imread(SRC, cv2.IMREAD_UNCHANGED)
H, W = bgra.shape[:2]
rgb = cv2.cvtColor(bgra[..., :3], cv2.COLOR_BGR2RGB)
A = bgra[..., 3].astype(np.float32) / 255.0
hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)   # h 0..180
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


def textured_fill(img, known, hole, shifts, sigma=2.5, radius=11):
    """Paint `hole` using only `known` pixels: smooth Telea inpaint for colour, plus high-frequency
    impasto brush detail copied from `known` pixels offset by the first valid shift in `shifts`."""
    if isinstance(shifts[0], (int, float)):
        shifts = [shifts]
    # Build a clean source image where unknown pixels are pre-filled by nearest known pixel so Telea
    # never bleeds black/orange fringes into the hole.
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
        out[take] = base[take] + det_s[take] * 0.85
        rem &= ~take
    out[rem] = base[rem]
    return np.clip(out, 0, 255)


def band(p0, p1, half, ext0=0.0, ext1=0.0):
    d = (p1 - p0) / np.linalg.norm(p1 - p0)
    n = np.array([-d[1], d[0]])
    a, b = p0 - d * ext0, p1 + d * ext1
    return [tuple(a + n * half), tuple(b + n * half), tuple(b - n * half), tuple(a - n * half)]


alpha = A > 0.02

# ---------------------------------------------------------------- 1. PENCIL & PAW
P_TOP = np.array([768.0, 267.0])
P_BOT = np.array([638.0, 515.0])
AXIS = (P_TOP - P_BOT) / np.linalg.norm(P_TOP - P_BOT)  # tip -> cap
TIP = np.array([602.0, 583.0])

# Clean polygonal envelope of the orange barrel + wood cone (excludes black book cover on right of cone!)
BARREL_POLY = poly(band(P_TOP, P_BOT, 28.0, 16.0, 2.0)) > 0.5
CONE_POLY = poly([(613, 502), (663, 524), (656, 535), (634, 559), (608, 584), (599, 583), (600, 558), (606, 525)]) > 0.5
orange = (hsv[..., 0] >= 3) & (hsv[..., 0] <= 26) & (hsv[..., 1] > 80) & (hsv[..., 2] > 65)
wood = (hsv[..., 0] >= 6) & (hsv[..., 0] <= 26) & (hsv[..., 1] > 42) & (hsv[..., 2] > 75)

# Paw in front of pencil (traced precisely from build/z/arm_r.png)
PAW_PTS = [
    (681, 434), (688, 418), (699, 408), (714, 404), (731, 408),
    (745, 420), (751, 437), (748, 454), (738, 466), (722, 474),
    (706, 472), (692, 462), (683, 449),
]
PAW_C = np.array([715.0, 440.0])
paw_poly_f = poly(PAW_PTS, soft=0.6)
paw_m = (paw_poly_f > 0.5) & alpha
paw_a = paw_poly_f * A

pencil_raw = ((orange & BARREL_POLY) | ((wood | orange) & CONE_POLY)) & alpha & ~paw_m
pencil_raw = cv2.morphologyEx(pencil_raw.astype(np.uint8), cv2.MORPH_CLOSE, disk(2)) > 0
pencil_raw = fill_holes(pencil_raw) & (BARREL_POLY | CONE_POLY) & alpha & ~paw_m
_, lab, st, _ = cv2.connectedComponentsWithStats(pencil_raw.astype(np.uint8), 8)
pencil_m = lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
# Soften pencil edges slightly while keeping sharp contour
pencil_soft = np.clip(cv2.GaussianBlur(pencil_m.astype(np.float32), (0, 0), 0.55) * 1.15, 0, 1) * A

# Reconstruct the small piece of pencil barrel hidden behind the paw by sweeping clean barrel cross-sections
# along AXIS from above (toward cap) and below (toward cone).
bar_strict = poly(band(P_TOP, P_BOT, 26.2, -10.0, -5.0)) > 0.5
hid_pen = bar_strict & dil(paw_m, 2) & ~ero(pencil_m, 2)
pen_rgb = rgb.astype(np.float32).copy()
pen_a = np.where(pencil_m, A, pencil_soft)
hy, hx = np.nonzero(hid_pen)
filled = np.zeros(len(hy), bool)
for step in range(4, 150, 2):
    for sgn in (1, -1):
        sx = np.round(hx + sgn * step * AXIS[0]).astype(int)
        sy = np.round(hy + sgn * step * AXIS[1]).astype(int)
        inb = (~filled) & (sx >= 0) & (sx < W) & (sy >= 0) & (sy < H)
        if not inb.any():
            continue
        ok = np.zeros(len(hy), bool)
        ok[inb] = pencil_m[sy[inb], sx[inb]] & ~dil(paw_m, 3)[sy[inb], sx[inb]] & orange[sy[inb], sx[inb]]
        pen_rgb[hy[ok], hx[ok]] = rgb[sy[ok], sx[ok]]
        pen_a[hy[ok], hx[ok]] = 1.0
        filled |= ok
# Clean any remaining thin dark halo on pencil next to paw
pen_edge_clean = dil(paw_m, 3) & pencil_m & (~orange) & (~wood)
if pen_edge_clean.any():
    pen_rgb = textured_fill(pen_rgb.astype(np.uint8), pencil_m & ~pen_edge_clean, pen_edge_clean, (int(round(20 * AXIS[0])), int(round(20 * AXIS[1]))), sigma=2.0, radius=6)

# ---------------------------------------------------------------- 2. RIGHT ARM (behind pencil & behind body)
# From build/z/arm_r.png: emerges from body around x=632..650, curves behind pencil to paw (715, 440)
ARM_R_PTS = [
    (616, 412), (650, 403), (682, 403), (714, 406), (745, 422),
    (751, 448), (744, 474), (724, 498), (698, 513), (668, 518),
    (620, 512), (612, 462),
]
arm_r_poly = poly(ARM_R_PTS, soft=0.7)
arm_r_m = arm_r_poly > 0.5
# Keep ONLY clean plush pixels (low saturation, non-orange, non-pencil, non-paw) plus the true outer dark
# contour on the far right/bottom wrist so no brown pencil fringe or black outline bleeds into the interior.
plush_col = (hsv[..., 1] < 48) & ~orange & ~wood
arm_r_outer_rim = arm_r_m & ~ero(arm_r_m, 7) & (xx > 646) & alpha & ~dil(pencil_m, 4) & ~dil(paw_m, 2) & ~orange
arm_r_interior_vis = arm_r_m & alpha & ~dil(pencil_m, 5) & ~dil(paw_m, 3) & plush_col & (L > 115)
body_flank_clean = arm_r_m & (xx < 646) & alpha & ~dil(pencil_m, 5) & plush_col & (L > 115)
arm_r_known_fill = (arm_r_interior_vis | body_flank_clean)
arm_r_hole = arm_r_m & ~(arm_r_interior_vis | arm_r_outer_rim | body_flank_clean)
# Paint the interior cleanly from bright grey-white plush fur (strictly excluding dark outlines!)
arm_r_rgb = textured_fill(rgb, arm_r_known_fill, arm_r_m & ~arm_r_known_fill, [(-65, -25), (-52, -5), (-38, 16)], sigma=3.2, radius=11)
# Stamp rich impasto brush detail from Pip's cheek/flank onto the reconstructed mid-arm so texture matches body!
flank_det = rgb.astype(np.float32) - cv2.GaussianBlur(rgb.astype(np.float32), (0, 0), 3.5)
M_arm = np.float32([[1, 0, 82], [0, 1, 24]])
det_arm = cv2.warpAffine(flank_det, M_arm, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
arm_r_rgb[arm_r_hole] = np.clip(arm_r_rgb[arm_r_hole] + det_arm[arm_r_hole] * 0.75, 0, 255)
# Restore the authentic painted outer wrist contour (dark ink edge on the right/bottom + top shoulder line)
arm_r_rgb[arm_r_outer_rim] = rgb[arm_r_outer_rim]
# Paint clean smooth hand-inked outline along top & bottom edges behind the pencil so it connects smoothly
arm_outline = np.zeros((H, W), np.uint8)
cv2.polylines(arm_outline, [np.array([[636, 405], [662, 404], [688, 405], [712, 407]], np.int32)], False, 1, 5, cv2.LINE_AA)
cv2.polylines(arm_outline, [np.array([[636, 513], [668, 517], [696, 512], [722, 496]], np.int32)], False, 1, 5, cv2.LINE_AA)
ao = cv2.GaussianBlur(arm_outline.astype(np.float32), (0, 0), 0.75) * arm_r_hole
arm_r_rgb = arm_r_rgb * (1 - ao[..., None] * 0.85) + np.array([28, 26, 32], np.float32) * (ao[..., None] * 0.85)
# Alpha: smooth silhouette inside ARM_R_PTS, soft-faded at far-left root hidden behind body
arm_r_a = np.where(arm_r_hole | (xx < 652), arm_r_poly, arm_r_poly * A)
arm_r_a[(A < 0.05) & (xx > 715)] = 0.0
arm_r_a *= np.clip((xx - 614.0) / 12.0, 0.0, 1.0)

# ---------------------------------------------------------------- 3. BOOK, PAGE_L & BOOKMARK
# Smooth true top edges of both pages (continuing cleanly behind arm_left and pencil!)
BOOK_TOP_L = [
    (245, 538), (268, 531), (298, 526), (332, 524), (366, 528),
    (398, 535), (430, 546), (460, 558), (484, 567),
]
BOOK_TOP_R = [
    (484, 567), (512, 554), (546, 544), (584, 536), (624, 530),
    (656, 527), (669, 527), (678, 534),
]
BOOK_OUTER = (
    BOOK_TOP_L
    + BOOK_TOP_R[1:]
    + [
        (710, 564), (760, 616), (812, 672), (835, 706), (820, 725),
        (640, 765), (580, 760), (520, 745), (382, 812), (355, 800),
        (232, 668), (235, 646), (244, 637), (252, 622), (274, 612),
        (301, 600), (288, 586), (271, 568), (256, 550),
    ]
)
book_poly_f = poly(BOOK_OUTER, soft=0.6)
book_m = book_poly_f > 0.5

# Bookmark ribbon (from build/z/bookmark.png)
BM_PTS = [
    (210, 694), (232, 703), (253, 705), (272, 698), (288, 682),
    (298, 665), (305, 682), (314, 684), (323, 678), (328, 687),
    (342, 680), (335, 695), (316, 717), (296, 736), (274, 741),
    (252, 735), (233, 720), (217, 706),
]
bm_poly_f = poly(BM_PTS, soft=0.5)
bm_m = (bm_poly_f > 0.5) & alpha
bm_a = bm_poly_f * A
BM_PIVOT = np.array([318.0, 696.0])

# Left paw polygon (from build/z/lpaw.png) — trimmed cleanly inside the dark groove on the left!
LPAW_PTS = [
    (382, 506), (386, 484), (398, 466), (418, 458), (440, 464),
    (455, 482), (464, 507), (465, 534), (454, 555), (434, 561),
    (410, 552), (392, 534), (384, 520),
]
lpaw_poly_f = poly(LPAW_PTS, soft=0.6)
lpaw_m = lpaw_poly_f > 0.5

# Right page cream interior mask
RPAGE_INTERIOR = poly([
    (492, 568), (522, 556), (562, 545), (608, 537), (664, 532),
    (680, 546), (735, 600), (795, 665), (618, 716), (576, 675), (492, 582),
]) > 0.5

# Shadow & orange doodle masks on right page
SHADOW_POLY = poly([(602, 544), (636, 536), (690, 540), (714, 557), (706, 574), (668, 588), (618, 593), (600, 584)]) > 0.5
DOODLE_POLY = poly([(596, 584), (642, 595), (714, 616), (715, 678), (612, 678), (595, 606)]) > 0.5

doodle_raw = DOODLE_POLY & (hsv[..., 1] > 55) & (hsv[..., 0] < 32)
doodle_m = dil(doodle_raw, 4) & DOODLE_POLY

shadow_raw = SHADOW_POLY & book_m & ~pencil_m & (L < 214)
shadow_m = dil(shadow_raw, 3) & SHADOW_POLY & RPAGE_INTERIOR

# Remove pencil + tip + shadow on right page, left paw + its dark rim on left page, and bookmark on lower-left page
pen_on_book = dil(pencil_m | paw_m, 7) & book_m
lpaw_on_book = (dil(lpaw_m, 5) | (dil(lpaw_m, 14) & (L < 175))) & book_m
bm_on_book = dil(bm_m, 3) & book_m

book_hole = (pen_on_book | shadow_m | doodle_m | lpaw_on_book | bm_on_book) & book_m
cream_paper = (L > 192) & (hsv[..., 1] < 50)
book_known_r = RPAGE_INTERIOR & ~book_hole & alpha & cream_paper
book_hole_r = book_hole & RPAGE_INTERIOR
book_rgb = rgb.astype(np.float32).copy()
if book_hole_r.any():
    filled_r = textured_fill(rgb, book_known_r, book_hole_r, [(55, 65), (-45, 55), (0, 65), (-55, 0)], sigma=2.2, radius=13)
    book_rgb[book_hole_r] = filled_r[book_hole_r]

# Fill top-right page rim right behind the pencil using strictly pure cream paper (no wood/peach leak!)
rim_r_hole = book_hole & ~RPAGE_INTERIOR & (xx > 540)
if rim_r_hole.any():
    rim_src_known = book_known_r
    filled_rim = textured_fill(book_rgb.astype(np.uint8), rim_src_known, rim_r_hole, [(-40, 12), (0, 18), (30, 30)], sigma=1.8, radius=9)
    book_rgb[rim_r_hole] = filled_rim[rim_r_hole]
    rim_line = np.zeros((H, W), np.uint8)
    cv2.polylines(rim_line, [np.array(BOOK_TOP_R, np.int32)], False, 1, 3, cv2.LINE_AA)
    rl = cv2.GaussianBlur(rim_line.astype(np.float32), (0, 0), 0.7) * rim_r_hole
    book_rgb = book_rgb * (1 - rl[..., None] * 0.55) + np.array([150, 140, 128], np.float32) * (rl[..., None] * 0.55)

# Fill left-page hole (where arm_left and its shadow overlapped the top edge of the left page)
LPAGE_POLY = poly(
    BOOK_TOP_L
    + [(484, 567), (588, 704), (550, 685), (520, 678), (490, 676), (460, 677), (438, 680), (414, 687), (388, 697),
       (344, 648), (301, 600), (288, 586), (271, 568), (256, 550)]
) > 0.5
book_hole_l = lpaw_on_book & book_m
book_known_l = LPAGE_POLY & ~book_hole_l & alpha & cream_paper
if book_hole_l.any():
    filled_l = textured_fill(book_rgb.astype(np.uint8), book_known_l, book_hole_l, [(0, 42), (-42, 24), (25, 45)], sigma=2.2, radius=11)
    book_rgb[book_hole_l] = filled_l[book_hole_l]
    lrim = np.zeros((H, W), np.uint8)
    cv2.polylines(lrim, [np.array(BOOK_TOP_L, np.int32)], False, 1, 3, cv2.LINE_AA)
    lr = cv2.GaussianBlur(lrim.astype(np.float32), (0, 0), 0.8) * book_hole_l
    book_rgb = book_rgb * (1 - lr[..., None] * 0.45) + np.array([175, 160, 140], np.float32) * (lr[..., None] * 0.45)

# Fill bookmark overlap on lower-left page stack of book (strictly along true book cover line!)
BOOK_NO_BM = poly(
    BOOK_TOP_L
    + BOOK_TOP_R[1:]
    + [
        (710, 564), (760, 616), (812, 672), (835, 706), (820, 725),
        (640, 765), (580, 760), (520, 745), (382, 812), (366, 804),
        (338, 770), (306, 732), (272, 694), (244, 662), (235, 646),
        (244, 637), (252, 622), (274, 612), (301, 600), (288, 586),
        (271, 568), (256, 550),
    ],
    soft=0.6,
)
book_hole_bm = bm_on_book & (BOOK_NO_BM > 0.5)
book_known_bm = (BOOK_NO_BM > 0.5) & ~book_hole & ~bm_m & (xx < 420) & (yy > 610) & alpha
if book_hole_bm.any():
    filled_bm = textured_fill(book_rgb.astype(np.uint8), book_known_bm, book_hole_bm, [(28, 32), (-24, -26)], sigma=2.0, radius=11)
    book_rgb[book_hole_bm] = filled_bm[book_hole_bm]

book_a = BOOK_NO_BM * np.where(book_hole & (BOOK_NO_BM > 0.5), 1.0, A)
book_a[BOOK_NO_BM < 0.02] = 0.0

# Pencil shadow layer (soft warm brown over restored right page)
SH_COL = np.array([104, 76, 52], np.float32)
Lp = book_rgb.mean(-1)
sh_raw_a = np.clip((Lp - L) / np.maximum(Lp - SH_COL.mean(), 1.0), 0.0, 1.0)
sh_mask = poly([(602, 548), (636, 540), (684, 544), (708, 558), (702, 572), (666, 584), (620, 588), (602, 580)], soft=3.0)
sh_a = sh_raw_a * sh_mask * (~dil(pencil_m, 1))
sh_a = cv2.GaussianBlur(sh_a.astype(np.float32), (0, 0), 1.6)
sh_a = np.clip(sh_a * 1.15, 0.0, 0.85)

# Left page top sheet (cut cleanly from the restored book!)
PAGE_TOP = BOOK_TOP_L[::-1]  # spine -> outer
PAGE_BOT = [(588, 704), (550, 685), (520, 678), (490, 676), (460, 677), (438, 680), (414, 687), (388, 697)]
PAGE_POLY_PTS = PAGE_TOP + [(256, 550), (271, 568), (288, 586), (301, 600), (344, 648)] + PAGE_BOT[::-1]
page_l_a = poly(PAGE_POLY_PTS, soft=0.6) * book_a

# ---------------------------------------------------------------- 4. EYES & SMILE
face_parts = {}
for name, box, thr in (
    ("eye_l", (450, 322, 496, 396), 85),
    ("eye_r", (544, 330, 588, 402), 85),
    ("smile", (492, 398, 540, 432), 125),
):
    x0, y0, x1, y1 = box
    m = np.zeros((H, W), bool)
    m[y0:y1, x0:x1] = True
    dark = m & (L < thr)
    _, lab, st, _ = cv2.connectedComponentsWithStats(dark.astype(np.uint8), 8)
    core = fill_holes(lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])))
    face_parts[name] = core
face_any = face_parts["eye_l"] | face_parts["eye_r"] | face_parts["smile"]
face_zone = dil(face_any, 4)

# ---------------------------------------------------------------- 5. TAIL (curled left lobe behind book)
TAIL_PTS = [
    (194, 594), (202, 578), (222, 573), (242, 560), (256, 546),
    (284, 566), (312, 598), (300, 616), (272, 622), (252, 637),
    (226, 635), (204, 616),
]
tail_vis_m = (poly(TAIL_PTS) > 0.5) & alpha & ~dil(book_m, 2) & (hsv[..., 1] < 38)
# Extend tail slightly up-right under the left page so it never separates when wagging
TAIL_EXT_POLY = poly([
    (194, 594), (202, 578), (222, 573), (242, 560), (256, 546),
    (272, 540), (308, 560), (326, 592), (312, 616), (272, 622),
    (252, 637), (226, 635), (204, 616),
], soft=0.6)
tail_ext_hole = (TAIL_EXT_POLY > 0.5) & ~tail_vis_m
tail_known_plush = tail_vis_m & (L > 105)
tail_rgb = textured_fill(rgb, tail_known_plush, tail_ext_hole, [(18, -14), (12, -8)], sigma=2.0, radius=9)
tail_rgb[tail_vis_m] = rgb[tail_vis_m]
tail_a = np.where(tail_ext_hole, TAIL_EXT_POLY, TAIL_EXT_POLY * A)
# Ensure outside original silhouette on left is transparent
tail_a[(A < 0.03) & (xx < 252)] = 0.0
TAIL_PIVOT = np.array([282.0, 586.0])

# ---------------------------------------------------------------- 6. BODY & FREE LEFT ARM (arm_left)
# Clean right-side silhouette of Pip's body (ends smoothly behind pencil — NO brown arm/pencil bleed!)
BODY_SILH = poly([
    (240, 548), (295, 445), (345, 290), (410, 195), (495, 165),
    (580, 185), (632, 245), (650, 315), (651, 392), (648, 445),
    (636, 505), (618, 548), (484, 578), (270, 562),
], soft=0.6)
body_silh_m = BODY_SILH > 0.5

# Strict known body pixels: exclude book, pencil (generously dilated!), paw, orange pixels, face features, and tail
body_hole_pen = body_silh_m & dil(pencil_m | paw_m, 6) & ~book_m
body_known_base = body_silh_m & alpha & ~book_m & ~dil(pencil_m | paw_m, 6) & ~orange & ~face_zone & ~tail_vis_m
# Also exclude dark book-contact shadow along very bottom of body from being used as fill source
book_rim_band = dil(book_m, 5) & ~book_m

# First, build clean body WITHOUT eyes/smile and WITHOUT pencil overlap (keeping arm_left for extracting arm_left!)
body_clean_rgb = rgb.astype(np.float32).copy()
if body_hole_pen.any():
    f_pen = textured_fill(rgb, body_known_base & ~book_rim_band & (L > 120), body_hole_pen, [(-48, 0), (-70, -15), (-35, -35)], sigma=2.5, radius=13)
    body_clean_rgb[body_hole_pen] = f_pen[body_hole_pen]
if face_zone.any():
    f_face = textured_fill(rgb, body_known_base, face_zone, [(0, 62), (-46, 0), (46, 0)], sigma=2.5, radius=7)
    body_clean_rgb[face_zone] = f_face[face_zone]

# Extract arm_left (free left paw) with soft blend at top chest join & crisp dark outline along bottom/right!
lpaw_top_fade = np.clip((yy - 458.0) / 18.0, 0.0, 1.0)
lpaw_crisp = np.maximum(lpaw_top_fade, ((xx > 444) | (yy > 512)).astype(np.float32))
lpaw_crisp = cv2.GaussianBlur(lpaw_crisp, (0, 0), 2.5)
arm_left_a = lpaw_poly_f * np.clip(lpaw_crisp, 0.0, 1.0) * A
ARM_LEFT_PIVOT = np.array([416.0, 480.0])

# Now paint out arm_left + its dark contour/groove cleanly on body using ONLY bright plush chest pixels!
lpaw_body_hole = (dil(lpaw_m, 5) | (dil(lpaw_m, 16) & (L < 145))) & body_silh_m & ~book_m
body_known_nolpaw = body_known_base & ~lpaw_body_hole & ~book_rim_band & (L > 135)
body_rgb = body_clean_rgb.copy()
if lpaw_body_hole.any():
    f_lpaw = textured_fill(body_clean_rgb.astype(np.uint8), body_known_nolpaw, lpaw_body_hole, [(75, -24), (0, -78), (-48, -42)], sigma=2.5, radius=15)
    body_rgb[lpaw_body_hole] = f_lpaw[lpaw_body_hole]

# Subtle crisp dark outline along the rebuilt right edge of body (behind the pencil) so it matches the rest of Pip
r_edge = np.zeros((H, W), np.uint8)
cv2.polylines(r_edge, [np.array([[650, 390], [648, 435], [639, 485], [625, 535]], np.int32)], False, 1, 5, cv2.LINE_AA)
re = cv2.GaussianBlur(r_edge.astype(np.float32), (0, 0), 0.9) * body_hole_pen
body_rgb = body_rgb * (1 - re[..., None] * 0.75) + np.array([34, 32, 38], np.float32) * (re[..., None] * 0.75)

# Clean body alpha above book
body_a = np.where(body_hole_pen | face_zone | lpaw_body_hole, BODY_SILH, BODY_SILH * A)
body_a[book_m] = 0.0
# Extend body cleanly downward BEHIND the book's top edge by ~36 px using clean plush fur from 16..52 px ABOVE
# (avoids reflecting any dark contact line!)
have_body = (body_a > 0.5) & ~book_m
# Find bottom-most clean body pixel for each column x
EXT = 38
for x in range(260, 628):
    col = np.nonzero(have_body[:, x])[0]
    if len(col) == 0:
        continue
    yb = col[-1]
    # Sample from well above the dark contact seam (yb - 16 going upward) so bounces never pull dark shadow up
    for dy in range(1, EXT + 1):
        yt = yb + dy
        if yt >= H:
            break
        ysrc = max(col[0], yb - 16 - (dy % 26))
        fade = np.clip((EXT - dy) / 10.0, 0.0, 1.0)
        body_rgb[yt, x] = body_rgb[ysrc, x] * 0.985
        body_a[yt, x] = max(body_a[yt, x], fade)

# ---------------------------------------------------------------- 7. EXPORT ALL LAYERS
layers = {}


def save(name, col, a):
    a = np.clip(a, 0.0, 1.0)
    ys, xs = np.nonzero(a > 0.005)
    x0, x1 = max(0, int(xs.min()) - 8), min(W, int(xs.max()) + 9)
    y0, y1 = max(0, int(ys.min()) - 8), min(H, int(ys.max()) + 9)
    c = np.clip(col[y0:y1, x0:x1], 0, 255)
    al = a[y0:y1, x0:x1] * 255.0
    out = np.dstack([c, al]).round().astype(np.uint8)
    out[al < 0.5] = 0
    cv2.imwrite(os.path.join(ART, f"{name}.png"), cv2.cvtColor(out, cv2.COLOR_RGBA2BGRA))
    layers[name] = {"x": float(x0), "y": float(y0), "w": int(x1 - x0), "h": int(y1 - y0)}


DARK_EYE = np.broadcast_to(np.array([26, 24, 30], np.float32), (H, W, 3))
DARK_SMILE = np.broadcast_to(np.array([38, 36, 42], np.float32), (H, W, 3))
for name, core in face_parts.items():
    zone = dil(core, 4)
    col_ref = DARK_SMILE if name == "smile" else DARK_EYE
    bg_L = body_clean_rgb.mean(-1)
    ea = np.clip((bg_L - L) / np.maximum(bg_L - col_ref.mean(), 1.0), 0.0, 1.0) * zone
    # Boost core slightly so eyes stay rich and crisp
    ea = np.where(core, np.clip(ea * 1.15, 0.0, 1.0), ea)
    save(name, col_ref, ea)

save("body", body_rgb, body_a)
save("tail", tail_rgb, tail_a)
save("arm_right", arm_r_rgb, arm_r_a)
save("arm_left", body_clean_rgb, arm_left_a)
save("book", book_rgb, book_a)
save("page_l", book_rgb, page_l_a)
save("bookmark", rgb.astype(np.float32), bm_a)
save("pencil", pen_rgb, pen_a)
save("paw", rgb.astype(np.float32), paw_a)
save("shadow", np.broadcast_to(SH_COL, (H, W, 3)), sh_a)

pts = {
    "paw": PAW_C.tolist(),
    "tip": TIP.tolist(),
    "shoulder_r": [632.0, 448.0],
    "arm_left_pivot": ARM_LEFT_PIVOT.tolist(),
    "tail_pivot": TAIL_PIVOT.tolist(),
    "bookmark_pivot": BM_PIVOT.tolist(),
    "eye_l": [float(v) for v in np.argwhere(face_parts["eye_l"]).mean(0)[::-1]],
    "eye_r": [float(v) for v in np.argwhere(face_parts["eye_r"]).mean(0)[::-1]],
    "smile": [float(v) for v in np.argwhere(face_parts["smile"]).mean(0)[::-1]],
    "body_pivot": [482.0, 520.0],
    "head_pivot": [498.0, 400.0],
    "book_pivot": [520.0, 665.0],
    "spine_top": [484.0, 567.0],
    "spine_bot": [588.0, 704.0],
}
layers["points"] = pts
layers["page_top"] = PAGE_TOP
layers["page_bot"] = PAGE_BOT
layers["size"] = [W, H]
json.dump(layers, open(os.path.join(ROOT, "tools", "layers.json"), "w"), indent=2)


# ---------------------------------------------------------------- 8. DEBUG COMPOSITES
def comp(order, bg_col=(118, 128, 124)):
    c = np.full((H, W, 3), bg_col, np.float32)
    for nm in order:
        b = layers[nm]
        im = cv2.cvtColor(cv2.imread(os.path.join(ART, nm + ".png"), cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA).astype(np.float32)
        x0, y0 = int(b["x"]), int(b["y"])
        h, w = im.shape[:2]
        a = im[..., 3:4] / 255.0
        c[y0:y0 + h, x0:x0 + w] = c[y0:y0 + h, x0:x0 + w] * (1.0 - a) + im[..., :3] * a
    return np.clip(c, 0, 255).astype(np.uint8)


cv2.imwrite(os.path.join(DBG, "cut_comp.png"), cv2.cvtColor(comp(["tail", "arm_right", "body", "eye_l", "eye_r", "smile", "book", "page_l", "bookmark", "shadow", "arm_left", "pencil", "paw"]), cv2.COLOR_RGB2BGR))
cv2.imwrite(os.path.join(DBG, "cut_body.png"), cv2.cvtColor(comp(["tail", "arm_right", "body"]), cv2.COLOR_RGB2BGR))
cv2.imwrite(os.path.join(DBG, "cut_book.png"), cv2.cvtColor(comp(["book"]), cv2.COLOR_RGB2BGR))
cv2.imwrite(os.path.join(DBG, "cut_parts.png"), cv2.cvtColor(comp(["page_l", "bookmark", "arm_left", "shadow", "pencil", "paw", "eye_l", "eye_r", "smile"]), cv2.COLOR_RGB2BGR))
cv2.imwrite(os.path.join(DBG, "cut_arm_r.png"), cv2.cvtColor(comp(["arm_right", "paw"]), cv2.COLOR_RGB2BGR))
print("Exported layers:", [k for k in layers if k not in ("points", "page_top", "page_bot", "size")])

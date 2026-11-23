"""Extract & build 100% hard-edged pixel-art layers for Pip — The Caption Goblin.

usage: uv run --with resvg-py --with opencv-python-headless --with numpy --with pillow python3 tools/cut.py

Preserves the exact original pixel-art character, colors, proportions, and hard pixel edges:
- Strips the 33 semi-transparent / #FEFDFD auto-trace background blobs from the source SVG.
- Separates body, scalloped hem (3 pixel ripple frames), headset, 5 facial expressions,
  5 left-arm poses, 5 right-arm poses, empty caption panel + sync flash border,
  compact native-palette editing keypad bar, pixel mouse cursor, exclamation mark,
  and all 5 original floating pixel decorations.
- Outputs 1:1 hard-edged RGBA sprites in art/*.png + tools/layers.json + debug sheets.
"""
import json, os, re
import cv2
import numpy as np
import resvg_py
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG_SRC = os.path.join(ROOT, "source", "pip-caption-reference.svg")
ART = os.path.join(ROOT, "art")
DBG = os.path.join(ROOT, "build")
os.makedirs(ART, exist_ok=True)
os.makedirs(DBG, exist_ok=True)

W = H = 1024
P = 18  # Native pixel-art unit (~18-20 px in the 1024x1024 reference)

# Exact color palette sampled straight from source/pip-caption-reference.svg
C_NAVY    = np.array([50,  62, 118, 255], np.uint8)   # #323E76
C_NAVY2   = np.array([69,  78, 136, 255], np.uint8)   # #454E88
C_CORAL   = np.array([244, 120, 119, 255], np.uint8)  # #F47877
C_CRIMSON = np.array([202,  92, 100, 255], np.uint8)  # #CA5C64
C_PINK    = np.array([250, 217, 218, 255], np.uint8)  # #FAD9DA
C_PINK2   = np.array([251, 195, 198, 255], np.uint8)  # #FBC3C6
C_SILVER  = np.array([209, 209, 210, 255], np.uint8)  # #D1D1D2
C_SLATE   = np.array([175, 193, 202, 255], np.uint8)  # #AFC1CA
C_SLATE2  = np.array([160, 182, 197, 255], np.uint8)  # #A0B6C5
C_LAV     = np.array([151, 155, 196, 255], np.uint8)  # #979BC4
C_INDIGO  = np.array([124, 126, 180, 255], np.uint8)  # #7C7EB4
C_CREAM   = np.array([254, 245, 242, 255], np.uint8)  # crisp bright highlight flash

# ================================================================ 1. CLEAN HARD-EDGED RASTER FROM SVG
svg_txt = open(SVG_SRC).read()
paths = re.findall(r"<path [^>]+/>", svg_txt)
kept = [p for p in paths if ("fill-opacity=" not in p) and ('fill="#FEFDFD"' not in p)]
clean_svg = (
    '<?xml version="1.0" encoding="utf-8" ?>'
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
    + "".join(kept)
    + "</svg>"
)
png_bytes = resvg_py.svg_to_bytes(svg_string=clean_svg, width=W, height=H)
clean_path = os.path.join(DBG, "clean_ref.png")
open(clean_path, "wb").write(png_bytes)

src = np.array(Image.open(clean_path).convert("RGBA"))
# Enforce strict 100% hard-edged alpha (zero anti-aliased fringes!)
src[..., 3] = np.where(src[..., 3] >= 128, 255, 0).astype(np.uint8)
src[src[..., 3] == 0] = 0

# Patch the tiny 2-cell pale-pink shine inside the leftmost scallop where #FEFDFD was stripped
# (visible in build/z_hem.png at x=128..172, y=756..796)
hole_box = np.zeros((H, W), bool)
hole_box[756:796, 128:172] = True
src[hole_box & (src[..., 3] == 0)] = C_PINK


def poly_mask(pts):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m > 0


def box_mask(x0, y0, x1, y1):
    m = np.zeros((H, W), bool)
    m[y0:y1, x0:x1] = True
    return m


def is_color_near(arr, col, tol=30):
    d = np.abs(arr[..., :3].astype(np.int16) - col[:3].astype(np.int16)).max(axis=-1)
    return (arr[..., 3] > 0) & (d <= tol)


def is_navy(arr):
    return is_color_near(arr, C_NAVY, 32) | is_color_near(arr, C_NAVY2, 32)


def is_coral(arr):
    return is_color_near(arr, C_CORAL, 36) | is_color_near(arr, C_CRIMSON, 36) | is_color_near(arr, C_PINK, 32) | is_color_near(arr, C_PINK2, 32)


layers = {}


def save(name, rgba, pad=0):
    ys, xs = np.nonzero(rgba[..., 3] > 0)
    if len(xs) == 0:
        raise RuntimeError(f"Empty layer: {name}")
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(W, int(xs.max()) + 1 + pad)
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(H, int(ys.max()) + 1 + pad)
    crop = rgba[y0:y1, x0:x1].copy()
    # Keep strict binary alpha!
    crop[..., 3] = np.where(crop[..., 3] >= 128, 255, 0).astype(np.uint8)
    crop[crop[..., 3] == 0] = 0
    Image.fromarray(crop, "RGBA").save(os.path.join(ART, f"{name}.png"))
    layers[name] = {"x": float(x0), "y": float(y0), "w": int(x1 - x0), "h": int(y1 - y0)}
    return (x0, y0, x1, y1)


def extract(name, mask):
    out = np.zeros_like(src)
    out[mask] = src[mask]
    return save(name, out)


# ================================================================ 2. FLOATING DECORATIONS, CURSOR & EXCLAMATION MARK
m_deco_coral = box_mask(144, 224, 244, 336)
m_deco_swirl = box_mask(112, 376, 240, 514)
m_deco_bot_l = box_mask(110, 856, 198, 936)
m_deco_top_r = box_mask(762, 118, 824, 178)
m_deco_bot_r = box_mask(782, 756, 844, 850)
m_bang       = box_mask(852, 356, 916, 516)
# Separate pixel mouse cursor cleanly from right-arm tip (keep ONLY largest connected component so zero corner speck!)
m_cursor_raw = poly_mask([(872, 220), (952, 220), (952, 322), (866, 322), (866, 240)]) & (src[..., 3] > 0)
n_cc, lab_cc, st_cc, _ = cv2.connectedComponentsWithStats(m_cursor_raw.astype(np.uint8), 8)
m_cursor = (lab_cc == (1 + int(np.argmax(st_cc[1:, cv2.CC_STAT_AREA])))) if n_cc > 1 else m_cursor_raw

extract("deco_coral_loop", m_deco_coral)
extract("deco_indigo_swirl", m_deco_swirl)
extract("deco_bottom_l", m_deco_bot_l)
extract("deco_top_r", m_deco_top_r)
extract("deco_bot_r", m_deco_bot_r)
extract("bang", m_bang)
extract("cursor", m_cursor)

# ================================================================ 3. CAPTION PANEL (EMPTY SCREEN + SYNC FLASH + MINI KEYPAD)
# Panel outer bounds measured from build/z_panel.png: x=524..860, y=516..685
m_panel_raw = box_mask(524, 516, 860, 686)
panel = np.zeros_like(src)
panel[m_panel_raw] = src[m_panel_raw]

# Cleanly erase the 4 interior bars inside the screen (x=548..832, y=540..660) with the EXACT two-tone screen fill!
# From z_panel.png: top silver #D1D1D2 down to y=587 (full width) and y=612 (left of x=704); lower #AFC1CA below!
screen = np.zeros((H, W), bool)
screen[542:660, 550:830] = True
panel[screen] = C_SLATE
panel[542:588, 550:830] = C_SILVER
panel[588:612, 550:704] = C_SILVER
save("panel_bg", panel)

# Crisp 1-frame sync-flash border matching panel's EXACT outer bbox & coral/crimson bezel — pops on BOTH light & dark!
panel_flash = np.zeros_like(src)
bezel = (panel[..., 3] > 0) & (~screen)
panel_flash[bezel] = C_CREAM
# Crisp vivid coral 8px outer pixel border strictly inside panel_bg's exact alpha silhouette!
bezel_eroded = cv2.erode(bezel.astype(np.uint8), np.ones((11, 11), np.uint8)) > 0
panel_flash[bezel & (~bezel_eroded)] = C_CORAL
# Soft pink inner rim highlight strictly inside screen border
inner_rim = np.zeros((H, W), bool)
inner_rim[542:552, 550:830] = True
inner_rim[650:660, 550:830] = True
inner_rim[542:660, 550:560] = True
inner_rim[542:660, 820:830] = True
panel_flash[inner_rim] = C_PINK
# Ensure exact same bounding box as panel_bg so zero 1px registration offset!
pb_ys, pb_xs = np.nonzero(panel[..., 3] > 0)
panel_flash[pb_ys.min(), pb_xs.min()] = panel[pb_ys.min(), pb_xs.min()]
panel_flash[pb_ys.max(), pb_xs.max()] = panel[pb_ys.max(), pb_xs.max()]
save("panel_flash", panel_flash)

# Compact native-palette pixel-art editing keypad strip right under the caption panel (x=544..836, y=696..740)!
# Matches exact coral/crimson/navy/silver/slate pixel language of the caption panel so Pip visibly slams real keys!
keypad = np.zeros_like(src)
kx0, ky0, kw, kh = 544, 694, 290, 44
# Crisp navy outer chassis with crimson bottom lip
keypad[ky0:ky0 + kh, kx0:kx0 + kw] = C_NAVY
keypad[ky0 + kh - 8:ky0 + kh, kx0 + 8:kx0 + kw - 8] = C_CRIMSON
# Cut 1-block pixel corners so it matches the notched corners of the caption panel!
keypad[ky0:ky0 + 8, kx0:kx0 + 8] = 0
keypad[ky0:ky0 + 8, kx0 + kw - 8:kx0 + kw] = 0
keypad[ky0 + kh - 8:ky0 + kh, kx0:kx0 + 8] = 0
keypad[ky0 + kh - 8:ky0 + kh, kx0 + kw - 8:kx0 + kw] = 0
# 6 crisp pixel keys across the strip (x centers saved in layers.json for animated key-press highlights!)
key_rects = []
for i in range(6):
    rx0 = kx0 + 16 + i * 44
    rx1 = rx0 + 34
    ry0 = ky0 + 8
    ry1 = ky0 + 28
    keypad[ry0:ry1, rx0:rx1] = C_SILVER if i % 2 == 0 else C_SLATE
    # Crisp 6px coral accent on key 2 & key 5 (sync/snap action keys!)
    if i in (2, 5):
        keypad[ry0:ry1, rx0:rx1] = C_CORAL
    key_rects.append([rx0, ry0, rx1 - rx0, ry1 - ry0])
save("keypad", keypad)

# ================================================================ 4. FACE EXPRESSIONS (ORIGINAL + 4 CRISP PIXEL POSES)
# Original eyes & smile extracted directly from clean source!
m_eye_l = box_mask(490, 312, 560, 410) & is_navy(src)
m_eye_r = box_mask(600, 312, 672, 410) & is_navy(src)
m_smile = box_mask(514, 424, 628, 472) & (is_navy(src) | is_color_near(src, C_LAV, 25))
m_face_orig = m_eye_l | m_eye_r | m_smile
extract("face_normal", m_face_orig)


def draw_px(canvas, x0, y0, grid, cmap, cell_w=20, cell_h=18):
    """Stamp a crisp pixel-art ASCII grid onto an RGBA canvas at exact hard-edged pixel cells."""
    for r, row in enumerate(grid):
        for c, ch in enumerate(row):
            if ch in cmap:
                y_a = y0 + r * cell_h
                x_a = x0 + c * cell_w
                canvas[y_a:y_a + cell_h, x_a:x_a + cell_w] = cmap[ch]


CMAP_FACE = {"N": C_NAVY, "H": C_NAVY2, "C": C_CORAL, "P": C_PINK, "S": C_SILVER, "L": C_LAV}

# 4a. Blink: crisp horizontal closed pixel eyes + original smile
f_blink = np.zeros_like(src)
f_blink[m_smile] = src[m_smile]
draw_px(f_blink, 495, 356, ["NNN"], CMAP_FACE, 20, 18)
draw_px(f_blink, 606, 356, ["NNN"], CMAP_FACE, 20, 18)
save("face_blink", f_blink)

# 4b. Focused / Locked-In Editor: narrowed brow eyes + determined tight pixel smirk!
f_focus = np.zeros_like(src)
draw_px(f_focus, 495, 344, [
    "NN.",
    "NHN",
    "NNN",
    ".N.",
], CMAP_FACE, 20, 16)
draw_px(f_focus, 606, 344, [
    ".NN",
    "NHN",
    "NNN",
    ".N.",
], CMAP_FACE, 20, 16)
draw_px(f_focus, 526, 444, ["NNNN."], CMAP_FACE, 18, 16)
draw_px(f_focus, 600, 434, ["N"], CMAP_FACE, 18, 16)
save("face_focus", f_focus)

# 4c. Wide-eyed / Surprised Alert (when a sudden caption chaos burst pops in!)
f_wide = np.zeros_like(src)
draw_px(f_wide, 495, 314, [
    ".N.",
    "NSN",
    "NHN",
    "NNN",
    ".N.",
], CMAP_FACE, 20, 18)
draw_px(f_wide, 606, 314, [
    ".N.",
    "NSN",
    "NHN",
    "NNN",
    ".N.",
], CMAP_FACE, 20, 18)
# Cute tiny pixel 'o' mouth!
draw_px(f_wide, 554, 426, [
    ".N.",
    "NCN",
    ".N.",
], CMAP_FACE, 16, 15)
save("face_wide", f_wide)

# 4d. Happy / Proud Celebratory (^ ^ pixel eyes + joyful grin + cute coral cheek pixels!)
f_happy = np.zeros_like(src)
draw_px(f_happy, 495, 336, [
    ".N.",
    "N.N",
], CMAP_FACE, 20, 20)
draw_px(f_happy, 606, 336, [
    ".N.",
    "N.N",
], CMAP_FACE, 20, 20)
# Big happy smile + coral pixel blush dots on cheeks!
draw_px(f_happy, 518, 424, [
    "N....N",
    "LNNNNL",
    "..NN..",
], CMAP_FACE, 17, 16)
draw_px(f_happy, 466, 404, ["CC"], CMAP_FACE, 14, 14)
draw_px(f_happy, 650, 404, ["CC"], CMAP_FACE, 14, 14)
save("face_happy", f_happy)

# ================================================================ 5. HEADSET (EARPIECE + BOOM MIC SEPARATED CLEANLY!)
# Extract the ear cup + boom mic arm + mic tip cleanly (x=326..482, y=244..424) so it can bob with 1-step pixel lag!
m_ear_mic = poly_mask([
    (326, 244), (398, 244), (398, 368), (476, 368),
    (476, 424), (396, 424), (344, 392), (326, 370),
])
# Keep only coral/crimson/pink/navy/lav pixels of the ear cup & boom mic (NOT the silver/slate cheek behind!)
m_headset_px = m_ear_mic & (is_coral(src) | is_navy(src) | is_color_near(src, C_LAV, 22))
# Exclude the body's main vertical left navy border below y=366 (at x < 350)
m_headset_px &= ~box_mask(300, 366, 349, 430)
# Also exclude the outer vertical coral glow bar at x < 332
m_headset_px &= ~box_mask(300, 240, 332, 430)
extract("headset", m_headset_px)

# ================================================================ 6. ORIGINAL LEFT & RIGHT ARMS + SYNTHESIZED PIXEL ARM POSES
# Original Left Arm: extends down-left from Pip's side (measured from build/z_arms.png)
m_arm_l_orig = poly_mask([
    (112, 600), (242, 476), (356, 476), (356, 540), (274, 622), (192, 682), (112, 682),
]) & (src[..., 3] > 0)
# Trim the body interior pixels inside the shoulder triangle so only the protruding left arm + crease stay!
# Actually keep clean shoulder overlap so arm_l_orig blends invisibly into body_neutral!
m_arm_l_cut = poly_mask([
    (112, 608), (220, 504), (308, 496), (356, 514), (356, 546), (274, 618), (190, 676), (112, 676),
]) & (src[..., 3] > 0)
extract("arm_l_orig", m_arm_l_cut)

# Original Right Arm: reaches up-right (x=698..892, y=150..508, cleanly excluding cursor!)
m_arm_r_orig = poly_mask([
    (714, 310), (816, 150), (894, 150), (886, 224), (848, 336), (788, 466), (714, 514),
]) & (src[..., 3] > 0) & (~m_cursor)
extract("arm_r_orig", m_arm_r_orig)

# Synthesized crisp pixel-art arm poses on exact 18x18 pixel grid using ONLY the original palette!
CMAP_ARM = {
    "N": C_NAVY,
    "R": C_CORAL,
    "C": C_CRIMSON,
    "S": C_SILVER,
    "A": C_SLATE,
    "L": C_LAV,
    "P": C_PINK,
}


def make_arm(name, x0, y0, grid, cell=18):
    canvas = np.zeros_like(src)
    draw_px(canvas, x0, y0, grid, CMAP_ARM, cell, cell)
    return save(name, canvas)


# Left Arm poses (anchored around left shoulder x~306, y~512, reaching cleanly below caption panel to keys 1-3!)
# 1) arm_l_type_up: bent eagerly forward, paw poised UP right above keys 1-2 (x~555, y~664)!
make_arm("arm_l_type_up", 306, 512, [
    ".RNS...........",
    "RNSSA..........",
    ".RNSSAN........",
    "..RNSSAN.......",
    "...RNSSAN......",
    "....RNSSAN.....",
    ".....RNSSANNNN.",
    "......RNSSSSSAN",
    ".......RNNNNNNN",
    "..........NNNN.",
], 18)

# 2) arm_l_type_dn: paw SMACKED DOWN 2 pixel-units right onto keys 1-2 (x~560, y~702)!
make_arm("arm_l_type_dn", 306, 520, [
    ".RNS...........",
    "RNSSA..........",
    ".RNSSAN........",
    "..RNSSAN.......",
    "...RNSSAN......",
    "....RNSSAN.....",
    ".....RNSSAN....",
    "......RNSSAN...",
    ".......RNSSAN..",
    "........RNSSAN.",
    ".........NNNNN.",
], 18)

# 3) arm_l_shove: reaching horizontally toward left edge of caption panel to nudge a caption block!
make_arm("arm_l_shove", 306, 496, [
    ".RNS..........",
    "RNSSAN........",
    ".RNSSANNN.....",
    "..RNSSSSSNNNN.",
    "...RNNNNSSSSSN",
    "........NNNNNN",
], 18)

# 4) arm_l_cheer: thrown triumphantly UP-LEFT from left shoulder for celebratory bounce!
make_arm("arm_l_cheer", 186, 324, [
    ".RN....",
    "RNAN...",
    "RNSSN..",
    ".RNSSN.",
    "..RNSSN",
    "..RNSSN",
    "...RNSS",
    "....RNS",
    ".....RN",
    "......R",
], 18)

# Right Arm poses (anchored at right shoulder x~704, y~474 — curves CLEANLY around outside right bezel of caption panel
# below `!` so ZERO pixels of the caption panel screen are covered while typing!)
# 1) arm_r_type_up: sweeps outside right bezel (x=858..894) with paw poised UP right over keys 5-6 (x~800, y~672)!
make_arm("arm_r_type_up", 704, 474, [
    "LANNNN.....",
    "LLLLLANNN..",
    ".NNNNLLLAN.",
    "......NLLAN",
    ".......NLAN",
    ".......NLAN",
    ".......NLAN",
    ".......NLAN",
    ".......NLAN",
    "......NLLAN",
    ".....NLLAN.",
    "....NLLAN..",
    "....NNNN...",
], 18)

# 2) arm_r_type_dn: right paw SMACKED DOWN 2 pixel-units right onto keys 5-6 (x~786, y~706)!
make_arm("arm_r_type_dn", 704, 480, [
    "LANNNN.....",
    "LLLLLANNN..",
    ".NNNNLLLAN.",
    "......NLLAN",
    ".......NLAN",
    ".......NLAN",
    ".......NLAN",
    ".......NLAN",
    ".......NLAN",
    ".......NLAN",
    "......NLLAN",
    ".....NLLAN.",
    "....NLLAN..",
    "....NNNN...",
], 18)

# 3) arm_r_grab_mid: reaching diagonally down-right toward top-right corner of caption panel to slam/shove blocks cleanly (clear of `!`)!
make_arm("arm_r_grab_mid", 698, 434, [
    "LAN......",
    "LLANNN...",
    ".NLLLLAN.",
    "..NNNLLAN",
    ".....NSSAN",
    "......NNNN",
], 18)

# 4) arm_r_cheer: stretched high UP-RIGHT in victory!
make_arm("arm_r_cheer", 714, 134, [
    ".....NNN.",
    "....NSSSN",
    "....NAAAN",
    "...NAAAN.",
    "...NAAAN.",
    "..NAAAN..",
    "..NLLAN..",
    ".NLLAN...",
    ".NLLAN...",
    "NLLAN....",
    "LLAN.....",
    "LAN......",
], 18)

# ================================================================ 7. CLEAN BODY RECONSTRUCTION + 4 BODY POSES + 3 HEM FRAMES!
body = src.copy()

# 7a. Remove all floating decorations, cursor, bang, caption panel, and right arm (+ any stray right-side pixels!)
remove_all = (
    m_deco_coral | m_deco_swirl | m_deco_bot_l | m_deco_top_r | m_deco_bot_r
    | m_bang | m_cursor | m_panel_raw | m_arm_r_orig
    | ((np.arange(W)[None, :] >= 738) & (np.arange(H)[:, None] < 520))
)
body[remove_all] = 0

# 7b. Paint out eyes & smile cleanly (dilated by 3px so ZERO 1px dark fringe remains!)
k3 = np.ones((7, 7), np.uint8)
d_eye_l = cv2.dilate(m_eye_l.astype(np.uint8), k3) > 0
d_eye_r = cv2.dilate(m_eye_r.astype(np.uint8), k3) > 0
d_smile = cv2.dilate(m_smile.astype(np.uint8), k3) > 0
body[d_eye_l] = C_SLATE
body[d_eye_r] = C_SLATE
body[d_smile] = C_SLATE
body[d_smile & (np.arange(W)[None, :] < 530)] = C_SILVER

# 7c. Paint out the separated headset ear cup & boom mic cleanly (dilated 3px so ZERO dark/pink hairlines remain!)
d_headset = cv2.dilate(m_headset_px.astype(np.uint8), k3) > 0
mic_zone = d_headset & box_mask(350, 362, 484, 430)
body[mic_zone & (np.arange(W)[None, :] < 430)] = C_SILVER
body[mic_zone & (np.arange(W)[None, :] >= 430)] = C_SLATE
ear_zone = d_headset & box_mask(332, 240, 404, 372)
body[ear_zone & (np.arange(W)[None, :] >= 352)] = C_SILVER
body[ear_zone & (np.arange(W)[None, :] < 352)] = C_NAVY
# Clean any remaining coral/navy inner headset shadow pixel in x=352..424, y=244..372
inner_cheek_fix = box_mask(352, 244, 424, 372) & (is_navy(body) | is_coral(body) | is_color_near(body, C_LAV, 26))
body[inner_cheek_fix] = C_SILVER

# 7d. Cleanly detach the protruding Left Arm & reconstruct Pip's smooth stepped left ghost slope!
yy, xx = np.mgrid[0:H, 0:W]
step_row = ((yy - 480) // 18)
slope_x_q = np.round((302.0 - step_row * 10.0) / 18.0) * 18.0
# Erase outside left coral border
body[(yy >= 484) & (yy < 738) & (xx < slope_x_q)] = 0
# Paint clean pixel-stepped left coral border + navy inner border + silver interior along the shoulder seam (y=484..672)!
in_l_seam = (yy >= 484) & (yy < 672) & (xx >= slope_x_q) & (xx < 368)
body[in_l_seam & (xx < slope_x_q + 20)] = C_CORAL
body[in_l_seam & (xx >= slope_x_q + 20) & (xx < slope_x_q + 40)] = C_NAVY
body[in_l_seam & (xx >= slope_x_q + 40)] = C_SILVER

# 7e. Reconstruct Pip's clean right vertical outline behind the Right Arm (y=290..520) AND behind the Caption Panel (y=514..690)!
# 1) Patch right shoulder (y=302..520, x=686..738):
r_sh = (yy >= 302) & (yy < 520) & (xx >= 686) & (xx < 740)
body[r_sh] = 0
body[(yy >= 302) & (yy < 520) & (xx >= 686) & (xx < 704)] = C_LAV
body[(yy >= 302) & (yy < 520) & (xx >= 704) & (xx < 722)] = C_NAVY
body[(yy >= 302) & (yy < 520) & (xx >= 722) & (xx < 738)] = C_CORAL
# 2) Patch occluded torso behind Caption Panel (y=516..690, x=516..740) with stepped 18px pixel contour!
for r_y0 in range(516, 690, 18):
    r_y1 = min(690, r_y0 + 18)
    t = (r_y0 - 516) / (690.0 - 516.0)
    # Right navy edge steps cleanly from 704 -> 644 in discrete ~15px pixel steps!
    navy_x = int(round((704 - 60 * t) / 16.0) * 16)
    lav_x = navy_x - 38
    sl2_x = lav_x - 16
    body[r_y0:r_y1, 516:sl2_x] = C_SLATE
    body[r_y0:r_y1, sl2_x:lav_x] = C_SLATE2
    body[r_y0:r_y1, lav_x:navy_x] = C_LAV
    body[r_y0:r_y1, navy_x:navy_x + 18] = C_NAVY
    body[r_y0:r_y1, navy_x + 18:navy_x + 36] = C_CORAL
    body[r_y0:r_y1, navy_x + 36:740] = 0
# Keep clean upper silver light-beam contour on upper-left of panel area (y=516..556, x=516..540)
body[516:546, 516:534] = C_SLATE

# Save full clean reconstructed body for debug check!
Image.fromarray(body, "RGBA").save(os.path.join(DBG, "body_clean_full.png"))

# 7f. Split Upper Body (y < 756) & Scalloped Hem (y >= 728) so Hem ripples independently while Upper Body leans/squashes/hops!
HEM_SPLIT_Y = 744  # Clean flat band just above the pink scallop crests!

body_upper_neutral = body.copy()
body_upper_neutral[HEM_SPLIT_Y + 8:, :] = 0
save("body_neutral", body_upper_neutral)

# Pose 2: body_lean — crisp pixel-stepped lean forward (+18 px upper dome, +9 px mid chest, 0 px waist!)
body_lean = np.zeros_like(body_upper_neutral)
for y in range(0, HEM_SPLIT_Y + 8):
    if y < 380:
        dx = 18
    elif y < 560:
        dx = 10
    else:
        dx = 0
    if dx > 0:
        body_lean[y, dx:] = body_upper_neutral[y, :-dx]
    else:
        body_lean[y] = body_upper_neutral[y]
save("body_lean", body_lean)

# Pose 3: body_squash — crisp nearest-neighbor pixel-art squash (+18 px down on top, +16 px wider!)
def pixel_resample_upper(src_im, sx, sy, anchor_x=500, anchor_y=744):
    ys, xs = np.nonzero(src_im[..., 3] > 0)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    crop = Image.fromarray(src_im[y0:y1, x0:x1], "RGBA")
    nw = max(1, int(round((x1 - x0) * sx)))
    nh = max(1, int(round((y1 - y0) * sy)))
    res = crop.resize((nw, nh), Image.NEAREST)
    out = np.zeros_like(src_im)
    nx0 = int(round(anchor_x - (anchor_x - x0) * sx))
    ny0 = int(round(anchor_y - (anchor_y - y0) * sy))
    # Clip cleanly into canvas
    dx0, dy0 = max(0, nx0), max(0, ny0)
    sx0, sy0 = dx0 - nx0, dy0 - ny0
    cw, ch = min(W - dx0, nw - sx0), min(H - dy0, nh - sy0)
    out[dy0:dy0 + ch, dx0:dx0 + cw] = np.array(res)[sy0:sy0 + ch, sx0:sx0 + cw]
    return out

save("body_squash", pixel_resample_upper(body_upper_neutral, 1.045, 0.945))
save("body_hop", pixel_resample_upper(body_upper_neutral, 0.96, 1.045))

# 7g. 3 Crisp Pixel-Art Scalloped Hem Ripple Frames (hem_0, hem_1, hem_2)!
# 5 distinct scallop columns measured from build/z_hem.png:
# Scallop 0: x=96..218, Scallop 1: x=218..328, Scallop 2: x=328..436, Scallop 3: x=436..542, Scallop 4: x=542..680
hem_base = np.zeros_like(body)
hem_base[HEM_SPLIT_Y - 12:868, :] = body[HEM_SPLIT_Y - 12:868, :]
save("hem_0", hem_base)

SCALLOP_XS = [(96, 218), (218, 328), (328, 436), (436, 542), (542, 686)]


def make_hem_wave(shifts):
    out = np.zeros_like(body)
    for (xa, xb), dy in zip(SCALLOP_XS, shifts):
        # Copy column slice shifted vertically by crisp pixel step `dy`!
        col = hem_base[HEM_SPLIT_Y - 12:868, xa:xb]
        ny0 = HEM_SPLIT_Y - 12 + dy
        ny1 = ny0 + col.shape[0]
        out[ny0:ny1, xa:xb] = col
        # If shifted DOWN (dy > 0), cleanly fill the tiny gap at top with exact top-row body colors so zero crack!
        if dy > 0:
            top_row = body[HEM_SPLIT_Y - 4:HEM_SPLIT_Y - 3, xa:xb]
            out[HEM_SPLIT_Y - 12:ny0, xa:xb] = top_row
    return out


save("hem_1", make_hem_wave([-14, +10, -14, +10, -12]))
save("hem_2", make_hem_wave([+10, -14, +10, -14, +10]))

# ================================================================ 8. SAVE METADATA & DEBUG COMPOSITE SHEET
layers["key_rects"] = key_rects
layers["panel_slots"] = [
    # Exact slot centers & sizes matching the 4 caption blocks in build/z_panel.png!
    {"name": "slot_1", "x": 609.0, "y": 577.0, "w": 74.0,  "h": 20.0},
    {"name": "slot_2", "x": 736.0, "y": 577.0, "w": 130.0, "h": 20.0},
    {"name": "slot_3", "x": 644.0, "y": 623.0, "w": 144.0, "h": 22.0},
    {"name": "slot_4", "x": 770.0, "y": 623.0, "w": 62.0,  "h": 22.0},
]
layers["size"] = [W, H]
json.dump(layers, open(os.path.join(ROOT, "tools", "layers.json"), "w"), indent=2)

# Visual QA sprite contact sheet + rest-pose composite!
def comp(order, bg=(248, 246, 242)):
    c = Image.new("RGBA", (W, H), bg + (255,))
    for nm in order:
        b = layers[nm]
        im = Image.open(os.path.join(ART, nm + ".png")).convert("RGBA")
        c.alpha_composite(im, (int(b["x"]), int(b["y"])))
    return c.convert("RGB")

comp([
    "body_neutral", "hem_0", "headset", "face_normal",
    "arm_l_orig", "arm_r_orig", "panel_bg", "keypad",
    "cursor", "bang", "deco_coral_loop", "deco_indigo_swirl",
    "deco_bottom_l", "deco_top_r", "deco_bot_r",
]).save(os.path.join(DBG, "cut_comp_orig.png"))

comp([
    "body_lean", "hem_1", "headset", "face_focus",
    "panel_bg", "keypad", "arm_l_type_dn", "arm_r_type_up",
    "cursor", "bang", "deco_coral_loop", "deco_indigo_swirl",
    "deco_bottom_l", "deco_top_r", "deco_bot_r",
]).save(os.path.join(DBG, "cut_comp_typing.png"))

comp([
    "body_hop", "hem_2", "headset", "face_happy",
    "arm_l_cheer", "arm_r_cheer", "panel_bg", "panel_flash", "keypad",
    "cursor", "bang", "deco_coral_loop", "deco_indigo_swirl",
    "deco_bottom_l", "deco_top_r", "deco_bot_r",
]).save(os.path.join(DBG, "cut_comp_cheer.png"))

print("Exported layers:", [k for k in layers if k not in ("size", "key_rects", "panel_slots")])

"""Generate the Rive scene (`scene.rml`) for Pip — The Caption Goblin (4.0 s seamless infinite pixel-art loop).

usage: python3 tools/build.py

STRICT PIXEL-ART RIVE ARCHITECTURE:
- 4.00 s seamless infinite loop (240 frames @ 60 fps = 60 crisp pixel-art steps @ 15 fps, step = 4 frames).
- EVERY keyframe uses `interpolationType="hold"` on exact integer pixel-grid coordinates (`scaleX=1, scaleY=1, rotation=0`
  on all sprite layers) -> ZERO blur, ZERO anti-aliasing, ZERO subpixel interpolation, ZERO dense-keys warnings, and
  0.0000 seam error across frame 240 -> 0!
- 6-beat chaotic caption-editing choreography:
    0.0–0.7 s (s=0..10):  Rapid typing burst; incoming coral caption snaps into Slot 4.
    0.7–1.5 s (s=11..22): Caption chaos; old Row 1 clears, new blocks pop in crooked, Pip physically shoves & snaps them.
    1.5–2.3 s (s=23..34): Perfect synchronization; vertical timing playhead + pixel cursor sweep across all 4 slots
                          with rhythmic sync flashes & a lightning-fast left-hand micro-correction on Slot 3.
    2.3–3.2 s (s=35..47): Speed burst; live subtitle cascade as Pip leans hard forward and types at max 15 Hz speed.
    3.2–3.6 s (s=48..54): Satisfying finish; full panel flash, pixel sparkle explosion, proud `^ ^` double jump cheer!
    3.6–4.0 s (s=55..60): New task; next coral block immediately pops in and Pip dives right back into typing (s=60 == s=0).
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LAY = json.load(open(os.path.join(HERE, "layers.json")))
OUT = os.path.join(ROOT, "scene.rml")

FPS = 60
STEP_F = 4       # 15 fps authentic crisp pixel-art sprite timing (4 Rive frames per pixel step!)
STEPS = 60       # 60 * 4 = 240 frames = exact 4.00 s loop!
L = STEPS * STEP_F
AW, AH = LAY["size"]  # 1024 x 1024

# Exact hex palette (ARGB with FF alpha) from source/pip-caption-reference.svg
COL_NAVY    = "FF323E76"
COL_NAVY2   = "FF454E88"
COL_CORAL   = "FFF47877"
COL_CRIMSON = "FFCA5C64"
COL_PINK    = "FFFAD9DA"
COL_PINK2   = "FFFBC3C6"
COL_SILVER  = "FFD1D1D2"
COL_SLATE   = "FFAFC1CA"
COL_LAV     = "FF979BC4"
COL_INDIGO  = "FF7C7EB4"
COL_CREAM   = "FFFEF5F2"

# Exact caption slot geometry inside panel_bg
SLOTS = {
    1: (609, 577, 74,  20),   # Top-Left (navy)
    2: (736, 577, 130, 20),   # Top-Right (navy)
    3: (644, 623, 144, 22),   # Bottom-Left (navy)
    4: (770, 623, 62,  22),   # Bottom-Right (coral highlight!)
}
KEY_RECTS = LAY["key_rects"]  # 6 crisp pixel keys along bottom editing keypad bar

# ================================================================ 1. RML HELPERS (STRICT STEPPED HOLD KEYS!)
_id = [5000]
def nid():
    _id[0] += 1
    return f"0:{_id[0]}"


TRACKS = []
def track(oid, prop, vals, fmt="{:.0f}"):
    """Emit minimal strictly stepped `interpolationType="hold"` keyframes for a 60-step periodic list `vals`.
    Places step transitions at `s * STEP_F - 1` (`3, 7, 11, ..., 235, 239`) with `s = 0` at frame `0`
    and `s = 60 (= 0)` at frame `239` & `240`:
      - Every single step `s = 0..59` holds for an identical 4.000 Rive frames (`1/15 s`).
      - Zero sample points at 15 fps (`0,4,8..240`) or 30 fps (`0,2,4..240`) ever land on a transition edge!
      - Completely immune to float32 `advance` rounding -> EXACT 0.0000 seam error (frame 240 vs frame 0)!"""
    assert len(vals) == STEPS
    # Build (frame, formatted_value) timeline: frame 0 -> vals[0], frame 4*s - 1 -> vals[s] (s=1..59), frame 239 -> vals[0], frame 240 -> vals[0]
    pts = [(0, fmt.format(vals[0]))]
    for s in range(1, STEPS):
        pts.append((s * STEP_F - 1, fmt.format(vals[s])))
    pts.append((L - 1, fmt.format(vals[0])))
    pts.append((L, fmt.format(vals[0])))

    # Deduplicate consecutive identical values while always keeping frame 0 and frame L!
    ks = []
    ind = "                    "
    last_s = None
    for idx, (fr, s_val) in enumerate(pts):
        if idx == 0 or idx == len(pts) - 1 or s_val != last_s:
            if idx == len(pts) - 1:
                ks.append(f'{ind}<KeyFrameDouble value="{s_val}" frame="{fr}"/>')
            else:
                ks.append(f'{ind}<KeyFrameDouble value="{s_val}" frame="{fr}" interpolationType="hold"/>')
            last_s = s_val
    if len(ks) == 2 and pts[0][1] == pts[-1][1]:
        return
    TRACKS.append((oid, prop, ks))


def center(name):
    b = LAY[name]
    return (b["x"] + b["w"] * 0.5, b["y"] + b["h"] * 0.5)


SPRITE_NAMES = [
    "body_neutral", "body_lean", "body_squash", "body_hop",
    "hem_0", "hem_1", "hem_2",
    "headset",
    "face_normal", "face_blink", "face_focus", "face_wide", "face_happy",
    "arm_l_orig", "arm_l_type_up", "arm_l_type_dn", "arm_l_shove", "arm_l_cheer",
    "arm_r_orig", "arm_r_type_up", "arm_r_type_dn", "arm_r_grab_mid", "arm_r_cheer",
    "panel_bg", "panel_flash", "keypad",
    "cursor", "bang",
    "deco_coral_loop", "deco_indigo_swirl", "deco_bottom_l", "deco_top_r", "deco_bot_r",
]
ASSETS = {nm: f"0:{900 + i}" for i, nm in enumerate(SPRITE_NAMES)}


def sprite_node(name, node_id, ind, op=1, x_off=0, y_off=0, label=None):
    cx, cy = center(name)
    lbl = label or name
    return [
        f'{ind}<Node x="{cx + x_off:.0f}" y="{cy + y_off:.0f}" opacity="{op}" name="{lbl}" id="{node_id}">',
        f'{ind}    <Image x="0" y="0" assetId="{ASSETS[name]}" name="{lbl}_img"/>',
        f'{ind}</Node>',
    ]


def rect_node(name, node_id, x, y, w, h, col, ind, op=1, sx=1.0, sy=1.0, outline_col=None, out_pad=0):
    out = [f'{ind}<Node x="{x:.0f}" y="{y:.0f}" scaleX="{sx:.4f}" scaleY="{sy:.4f}" opacity="{op}" name="{name}" id="{node_id}">']
    if outline_col and out_pad > 0:
        out.append(
            f'{ind}    <Shape name="Out"><Rectangle width="{w + 2 * out_pad:.0f}" height="{h + 2 * out_pad:.0f}" name="R"/>'
            f'<Fill name="F"><SolidColor colorValue="{outline_col}" name="C"/></Fill></Shape>'
        )
    out.append(
        f'{ind}    <Shape name="Box"><Rectangle width="{w:.0f}" height="{h:.0f}" name="R"/>'
        f'<Fill name="F"><SolidColor colorValue="{col}" name="C"/></Fill></Shape>'
    )
    out.append(f'{ind}</Node>')
    return out


# ================================================================ 2. 60-STEP PIXEL-ART CHOREOGRAPHY TABLES!
# ---- 2a. Pip Body Pose, Offset (dx, dy), Hem Frame, Face Expression, Left/Right Arm Pose ----
body_pose = ["neutral"] * STEPS
body_dx   = [0] * STEPS
body_dy   = [0] * STEPS
hem_pose  = [0] * STEPS
face_pose = ["normal"] * STEPS
face_dx   = [0] * STEPS
face_dy   = [0] * STEPS
hs_dy     = [0] * STEPS   # Headset 1-step overlapping vertical bounce!
arm_l     = ["type_up"] * STEPS
arm_r     = ["type_dn"] * STEPS
key_flash = [[0] * STEPS for _ in range(6)]  # 6 crisp pixel keypad key highlights!

# Helper to register typing alternating hands + keypad key flashes!
def set_typing(s_range, turbo=False):
    for s in s_range:
        if s % 2 == 0:
            arm_l[s] = "type_dn"
            arm_r[s] = "type_up"
            key_flash[(s // 2) % 3][s] = 1         # Left keys 0, 1, 2
            if turbo:
                key_flash[(s // 2 + 1) % 3][s] = 1
        else:
            arm_l[s] = "type_up"
            arm_r[s] = "type_dn"
            key_flash[3 + ((s // 2) % 3)][s] = 1   # Right keys 3, 4, 5
            if turbo:
                key_flash[3 + ((s // 2 + 1) % 3)][s] = 1

# --- BEAT 1: 0.0–0.7 s (s = 0..10) — RAPID TYPING ---
set_typing(range(0, 11))
for s in range(0, 11):
    body_pose[s] = "lean" if s in (0, 1, 2, 3, 4, 5, 8, 9, 10) else "squash"
    body_dx[s] = 16 if (s % 4 in (1, 2)) else 0
    body_dy[s] = 16 if (s % 2 == 1) else 0
    face_pose[s] = "focus" if s in (2, 3, 4, 5, 9, 10) else ("blink" if s == 7 else "normal")
    face_dx[s] = 16 if s in (0, 1, 2, 3, 4, 5, 9, 10) else 0
    face_dy[s] = 16 if s in (3, 4, 5, 6) else 0
# Brief right-arm grab at s=3..5 to yank incoming coral Cap_4 into Slot 4!
arm_r[3] = "orig"
arm_r[4] = "grab_mid"
arm_r[5] = "type_dn"
key_flash[5][6] = 1  # Snap punch!
body_pose[6] = "squash"
body_dy[6] = 16

# --- BEAT 2: 0.7–1.5 s (s = 11..22) — CAPTION CHAOS! ---
for s in range(11, 23):
    # Chaotic side-to-side wiggle & rapid bounces!
    body_dx[s] = [-16, -16, 0, 16, 16, 0, -16, 16, 16, 0, -16, 16][s - 11]
    body_dy[s] = [0, -16, 16, 0, -16, 16, 0, 16, -16, 16, 0, 16][s - 11]
    body_pose[s] = "hop" if body_dy[s] < 0 else ("squash" if body_dy[s] > 0 else "lean")
    face_pose[s] = "wide" if s in (11, 12, 16, 17) else "focus"
    face_dx[s] = -16 if s in (11, 12, 15, 16) else 16
    face_dy[s] = -16 if s in (11, 12, 13) else 16
# Chaotic arm choreography: flick old top blocks, grab & shove crooked Cap_5 & Cap_6!
arm_l[11], arm_r[11] = "orig",    "orig"       # Both wide as blocks fly in!
arm_l[12], arm_r[12] = "orig",    "orig"       # Swatting old Row 1 away!
arm_l[13], arm_r[13] = "type_up", "orig"       # Right catches Cap_6 up high!
arm_l[14], arm_r[14] = "shove",   "grab_mid"   # Shoving Cap_5 right, pulling Cap_6 down!
arm_l[15], arm_r[15] = "type_dn", "grab_mid"
arm_l[16], arm_r[16] = "orig",    "grab_mid"   # Wide-eyed shock at crooked Cap_5!
arm_l[17], arm_r[17] = "shove",   "type_up"    # Left SHOVES Cap_5 into Slot 1!
arm_l[18], arm_r[18] = "shove",   "grab_mid"   # SNAP S1! Right grabs Cap_6!
arm_l[19], arm_r[19] = "type_up", "grab_mid"   # Right SHOVES Cap_6 into Slot 2!
arm_l[20], arm_r[20] = "type_dn", "type_up"    # SNAP S2!
arm_l[21], arm_r[21] = "type_up", "type_dn"
arm_l[22], arm_r[22] = "type_dn", "type_up"
key_flash[0][15] = key_flash[2][18] = key_flash[5][20] = key_flash[3][21] = key_flash[1][22] = 1

# --- BEAT 3: 1.5–2.3 s (s = 23..34) — PERFECT SYNCHRONIZATION! ---
for s in range(23, 35):
    # Deliberate, crisp rhythmic head/body ticks locked to each sync beat (s=24, 27, 30, 33)!
    is_tick = s in (24, 27, 30, 33)
    body_pose[s] = "squash" if is_tick else "lean"
    body_dx[s] = 16 if s >= 26 else 0
    body_dy[s] = 16 if is_tick else 0
    face_pose[s] = "blink" if s == 34 else "focus"
    face_dx[s] = 0 if s < 26 else 16
    face_dy[s] = 0 if s < 29 else 16
# Alternating precision sync taps + lightning micro-correction shove on Slot 3 (s=29..30)!
set_typing(range(23, 35))
arm_l[29] = "shove"
arm_l[30] = "shove"
arm_r[30] = "type_up"
arm_r[33] = "grab_mid"  # Crisp final right-hand lock-in on Slot 4!
key_flash[2][24] = key_flash[5][27] = key_flash[2][30] = key_flash[5][33] = 1

# --- BEAT 4: 2.3–3.2 s (s = 35..47) — SPEED BURST (TURBO TYPING!) ---
set_typing(range(35, 48), turbo=True)
for s in range(35, 48):
    # Aggressive forward lean + hyperactive bouncing every step!
    body_pose[s] = "lean" if s % 3 != 2 else "squash"
    body_dx[s] = 16 if s % 2 == 0 else 32
    body_dy[s] = 16 if s % 2 == 1 else -16 if s in (38, 44) else 0
    face_pose[s] = "wide" if s in (35, 45) else "focus"
    face_dx[s] = 16
    face_dy[s] = 16 if s % 2 == 0 else 0
# Dramatic reach & grab on the final coral caption block (s=45..47)!
arm_r[45] = "orig"
arm_r[46] = "orig"
arm_r[47] = "grab_mid"
body_pose[46] = "hop"
body_dy[46] = -16
body_pose[47] = "lean"

# --- BEAT 5: 3.2–3.6 s (s = 48..54) — SATISFYING FINISH (PROUD CELEBRATORY DOUBLE BOUNCE!) ---
# s=48: SLAM impact into Slot 4! s=49..54: celebratory arms-up ^ ^ proud double hop!
body_pose[48], body_dx[48], body_dy[48] = "squash", 16,  16
arm_l[48], arm_r[48], face_pose[48]     = "type_dn", "grab_mid", "focus"
key_flash[2][48] = key_flash[5][48] = 1

for s, (bp, dx, dy) in zip(
    range(49, 55),
    [
        ("hop",     0, -32),   # s=49: Big proud jump UP!
        ("hop",     0, -32),   # s=50: Brief freeze in satisfied victory pose!
        ("squash",  0,   0),   # s=51: Crisp landing squash!
        ("hop",     0, -16),   # s=52: Second proud little bounce!
        ("neutral", 0,   0),   # s=53: Settle proud!
        ("neutral", 0,   0),   # s=54: Hold smile!
    ],
):
    body_pose[s] = bp
    body_dx[s] = dx
    body_dy[s] = dy
    arm_l[s] = "cheer"
    arm_r[s] = "cheer"
    face_pose[s] = "happy"
    face_dx[s] = 0
    face_dy[s] = -16 if dy < 0 else 0

# --- BEAT 6: 3.6–4.0 s (s = 55..59) — NEW TASK (SEAMLESS HANDOFF INTO s=0!) ---
# s=55: alert reaction as fresh caption pops in! s=56..59: straight back into typing momentum matching s=0!
body_pose[55], body_dx[55], body_dy[55] = "neutral", 0, 0
face_pose[55], face_dx[55], face_dy[55] = "wide", 16, -16
arm_l[55], arm_r[55] = "orig", "orig"

body_pose[56], body_dx[56], body_dy[56] = "squash", 0, 16
face_pose[56], face_dx[56], face_dy[56] = "wide", 16, 0
arm_l[56], arm_r[56] = "type_dn", "type_up"
key_flash[0][56] = 1

set_typing(range(57, 60))
for s in range(57, 60):
    body_pose[s] = "lean" if s in (57, 59) else "squash"
    body_dx[s] = 16 if s == 58 else 0
    body_dy[s] = 16 if s % 2 == 1 else 0
    face_pose[s] = "blink" if s == 57 else "normal"
    face_dx[s] = 16 if s >= 58 else 0
    face_dy[s] = 0

# Scalloped hem traveling pixel ripple (period = 3 -> exact divisor of 60!)
for s in range(STEPS):
    if 35 <= s <= 47 or 11 <= s <= 22:
        hem_pose[s] = s % 3          # Fast 15 Hz chaotic flutter!
    else:
        hem_pose[s] = (s // 2) % 3   # Snappy 7.5 Hz groove flutter!

# Headset 1-step overlapping lag bounce (`hs_dy` lags behind `body_dy` by 1 pixel step!)
for s in range(STEPS):
    prev_dy = body_dy[(s - 1) % STEPS]
    diff = body_dy[s] - prev_dy
    if diff >= 16:
        hs_dy[s] = -16   # Body dropped down -> headset pops UP 1 pixel behind!
    elif diff <= -16:
        hs_dy[s] = 16    # Body hopped up -> headset drags DOWN 1 pixel!
    elif s in (49, 50):
        hs_dy[s] = -16   # Joyful headset pop at jump apex!
    else:
        hs_dy[s] = 0


# ---- 2b. 6 INDEPENDENTLY ANIMATED CAPTION BLOCKS (`Cap_1..Cap_6`) ----
# Each block returns per-step tuple: (x, y, sx, sy, opacity)
# Remember: pure Rive `<Rectangle>` shapes keep razor-sharp edges at ANY width/height!
def make_cap_tracks():
    # Initialize all 6 blocks hidden by default, then explicitly paint every active step!
    # Block colors & base sizes match the 4 slots in z_panel.png!
    # Cap_1: S1 (74x20 navy), Cap_2: S2 (130x20 navy), Cap_3: S3 (144x22 navy), Cap_4: S4 (62x22 coral)
    # Cap_5: S1 replacement (74x20 navy), Cap_6: S2 replacement (130x20 navy)
    caps = {k: [(0, 0, 1.0, 1.0, 0) for _ in range(STEPS)] for k in range(1, 7)}

    def hold(k, s0, s1, x, y, sx=1.0, sy=1.0, op=1):
        for s in range(s0, s1 + 1):
            caps[k][s % STEPS] = (x, y, sx, sy, op)

    def path(k, pts):
        """pts: list of (s, x, y, sx, sy, op)"""
        for s, x, y, sx, sy, op in pts:
            caps[k][s % STEPS] = (x, y, sx, sy, op)

    # --- CAP_1 (Row 1 Left, 74x20, Navy) ---
    # s=0..10: Locked cleanly in S1 (609, 577)
    hold(1, 0, 10, 609, 577)
    # s=11..13: Flicked out up-left to make room for Chaos incoming blocks!
    path(1, [
        (11, 569, 545, 1.0,  1.0,  1),
        (12, 505, 497, 0.85, 0.85, 1),
        (13, 449, 449, 0.65, 0.65, 1),
    ])
    # s=36..39: Speed Burst! Pops in oversized upper-left IMMEDIATELY as old blocks exit (panel NEVER goes blank!) -> SNAPS into S1 at s=39!
    path(1, [
        (36, 449, 433, 1.24, 1.30, 1),
        (37, 505, 489, 1.16, 1.18, 1),
        (38, 569, 545, 1.08, 1.08, 1),
        (39, 609, 585, 1.05, 0.90, 1),  # Crisp 8px impact overshoot!
    ])
    # s=40..59: Locked cleanly in S1 (with celebration pop at s=48!) -> matches s=0 identically!
    hold(1, 40, 59, 609, 577)
    caps[1][48] = (609, 571, 1.0, 1.0, 1)  # Celebration crisp jump!

    # --- CAP_2 (Row 1 Right, 130x20, Navy) ---
    # s=0..10: Locked cleanly in S2 (736, 577)
    hold(2, 0, 10, 736, 577)
    # s=11..13: Shoved right-up out of the way!
    path(2, [
        (11, 784, 545, 1.0,  1.0,  1),
        (12, 840, 497, 0.85, 0.85, 1),
        (13, 888, 457, 0.65, 0.65, 1),
    ])
    # s=38..42: Speed Burst! Pops in upper-right -> rockets down -> SNAPS into S2 at s=42!
    path(2, [
        (38, 864, 385, 1.20, 1.30, 1),
        (39, 832, 433, 1.16, 1.20, 1),
        (40, 792, 489, 1.10, 1.12, 1),
        (41, 760, 537, 1.06, 1.06, 1),
        (42, 736, 585, 1.04, 0.90, 1),  # Crisp impact overshoot!
    ])
    # s=43..59: Locked cleanly in S2 -> matches s=0 identically!
    hold(2, 43, 59, 736, 577)
    caps[2][48] = (736, 571, 1.0, 1.0, 1)

    # --- CAP_3 (Row 2 Left, 144x22, Navy) ---
    # s=0..19: Locked cleanly in S3 (644, 623)
    hold(3, 0, 19, 644, 623)
    # s=20..29: Slight chaotic nudge misaligned -16px left (628, 623) waiting for Pip's sync micro-correction!
    hold(3, 20, 29, 628, 623)
    # s=30: Pip left-hand micro-correction taps it right as Playhead hits -> SNAPS dead-on (644, 623)!
    caps[3][30] = (650, 623, 1.0, 1.0, 1)  # 6px horizontal snap overshoot!
    hold(3, 31, 35, 644, 623)
    # s=36..37: Speed Burst clear — scrolls swiftly up & exits!
    path(3, [
        (36, 644, 575, 0.90, 0.90, 1),
        (37, 644, 519, 0.70, 0.70, 1),
    ])
    # s=41..45: Speed Burst fresh Cap_3 pops in from left -> SNAPS into S3 at s=45!
    path(3, [
        (41, 444, 543, 1.16, 1.26, 1),
        (42, 492, 575, 1.12, 1.18, 1),
        (43, 548, 599, 1.08, 1.10, 1),
        (44, 604, 615, 1.05, 1.05, 1),
        (45, 644, 631, 1.04, 0.90, 1),  # Crisp impact overshoot!
    ])
    # s=46..59: Locked cleanly in S3 -> matches s=0 identically!
    hold(3, 46, 59, 644, 623)
    caps[3][48] = (644, 617, 1.0, 1.0, 1)

    # --- CAP_4 (Row 2 Right, 62x22, BRIGHT CORAL HIGHLIGHT!) ---
    # s=0: Oversized pop hovering clearly above-right ready for rapid-typing grab!
    # s=1..6: Sweeps rapidly down -> SNAPS into S4 (770, 623) at s=6!
    path(4, [
        (0, 818, 439, 1.28, 1.32, 1),
        (1, 818, 455, 1.22, 1.22, 1),
        (2, 810, 487, 1.14, 1.14, 1),
        (3, 794, 535, 1.08, 1.08, 1),
        (4, 782, 583, 1.04, 1.04, 1),
        (5, 770, 631, 1.08, 0.88, 1),  # Impact squash-bounce!
    ])
    hold(4, 6, 20, 770, 623)
    # s=21..32: Slightly jostled +12px right (782, 623) during chaos -> snaps dead-on at s=33 Playhead hit!
    hold(4, 21, 32, 782, 623)
    caps[4][33] = (766, 623, 1.06, 1.06, 1)  # Snap overshoot!
    hold(4, 34, 35, 770, 623)
    # s=36..37: Speed Burst clear — scrolls up & exits!
    path(4, [
        (36, 770, 575, 0.90, 0.90, 1),
        (37, 770, 519, 0.70, 0.70, 1),
    ])
    # s=44..48: Speed Burst FINALE! Pops HUGE above-right -> Pip grabs & SLAMS into S4 at s=48!
    path(4, [
        (44, 858, 359, 1.30, 1.36, 1),
        (45, 842, 407, 1.26, 1.30, 1),
        (46, 818, 471, 1.18, 1.20, 1),
        (47, 794, 559, 1.10, 1.10, 1),
        (48, 770, 631, 1.12, 0.86, 1),  # BIG celebratory snap impact!
    ])
    # s=49..54: Gleams perfectly aligned during Satisfying Finish!
    hold(4, 49, 54, 770, 623)
    # s=55..59: Old block zips swiftly right-down out (s=55..56), brand-new coral block POPS IN above-right (s=58..59 -> s=0)!
    path(4, [
        (55, 826, 647, 0.85, 0.85, 1),
        (56, 874, 671, 0.60, 0.60, 1),
        # s=57 hidden 1 step while new task spawns!
        (58, 834, 399, 0.80, 0.85, 1),  # New task popping in!
        (59, 826, 423, 1.14, 1.18, 1),  # Growing right into s=0 (818, 439, 1.28)!
    ])

    # --- CAP_5 (Chaos Row 1 Left replacement, 74x20, Navy) ---
    # Pops in at s=9..10 upper-left, drops crooked at s=14..16, shoved & snapped into S1 at s=18, synced at s=24, scrolls out s=35..36!
    path(5, [
        (9,  449, 433, 0.85, 0.85, 1),
        (10, 449, 449, 1.24, 1.28, 1),
        (11, 465, 473, 1.16, 1.16, 1),
        (12, 497, 505, 1.10, 1.10, 1),
        (13, 537, 537, 1.05, 1.05, 1),
        (14, 577, 561, 1.0,  1.0,  1),  # Lands crooked (-32px left, -16px high)!
        (15, 585, 565, 1.0,  1.0,  1),
        (16, 585, 565, 1.0,  1.0,  1),  # Pip stares shocked!
        (17, 597, 573, 1.0,  1.0,  1),  # Left arm SHOVES it!
        (18, 615, 577, 1.06, 0.90, 1),  # SNAP overshoot into S1!
    ])
    hold(5, 19, 34, 609, 577)
    caps[5][24] = (609, 569, 1.06, 1.06, 1)  # Sync pulse bounce when Playhead hits S1!
    path(5, [
        (35, 609, 529, 0.88, 0.88, 1),
        (36, 609, 473, 0.65, 0.65, 1),
    ])

    # --- CAP_6 (Chaos Row 1 Right replacement, 130x20, Navy) ---
    # Pops in upper-right at s=10, dives crooked at s=15..18, yanked & snapped into S2 at s=20, synced at s=27, scrolls out s=35..36!
    path(6, [
        (10, 848, 369, 0.85, 0.85, 1),
        (11, 848, 385, 1.20, 1.28, 1),
        (12, 840, 417, 1.14, 1.14, 1),
        (13, 824, 465, 1.08, 1.08, 1),
        (14, 800, 505, 1.05, 1.05, 1),
        (15, 768, 553, 1.0,  1.0,  1),  # Lands crooked (+32px right, -24px high)!
        (16, 768, 553, 1.0,  1.0,  1),
        (17, 768, 553, 1.0,  1.0,  1),
        (18, 760, 561, 1.0,  1.0,  1),  # Right arm + cursor grab it!
        (19, 744, 571, 1.0,  1.0,  1),
        (20, 736, 585, 1.05, 0.90, 1),  # SNAP overshoot into S2!
    ])
    hold(6, 21, 34, 736, 577)
    caps[6][27] = (736, 569, 1.06, 1.06, 1)  # Sync pulse bounce when Playhead hits S2!
    path(6, [
        (35, 736, 529, 0.88, 0.88, 1),
        (36, 736, 473, 0.65, 0.65, 1),
    ])

    return caps

CAPS = make_cap_tracks()

# ---- 2c. SNAP FLASHES, PANEL RECOIL, PANEL SYNC FLASH, TIMING PLAYHEAD & PIXEL CURSOR ----
slot_flash = {k: [0] * STEPS for k in range(1, 5)}
# Mark exact 1–2 step crisp pixel snap/sync flashes on each slot!
for s in (18, 24, 39, 48, 49): slot_flash[1][s] = 1
for s in (20, 27, 42, 48, 49): slot_flash[2][s] = 1
for s in (30, 45, 48, 49):     slot_flash[3][s] = 1
for s in (5, 6, 33, 48, 49):   slot_flash[4][s] = 1

panel_flash_op = [1 if s in (33, 48, 49) else 0 for s in range(STEPS)]
# Subtle crisp pixel-recoil on the caption panel when blocks slam in!
panel_dy = [8 if s in (5, 18, 20, 30, 33, 39, 42, 45, 48) else (-8 if s == 49 else 0) for s in range(STEPS)]

# Vertical Timing Playhead bar inside panel screen (sweeps crisp pixel steps left->right across S1->S2->S3->S4!)
playhead_x  = [558] * STEPS
playhead_op = [0] * STEPS
# Primary sync sweep during Beat 3 (s=23..34): Row 1 sweep (s=23..28) -> Row 2 sweep (s=29..34)!
sweep_xs = [560, 608, 656, 704, 736, 792, 576, 644, 692, 740, 770, 816]
for idx, s in enumerate(range(23, 35)):
    playhead_x[s] = sweep_xs[idx]
    playhead_op[s] = 1
# Secondary quick confirm sweep during Speed Burst finish (s=46..48)!
for s, px in ((46, 644), (47, 736), (48, 788)):
    playhead_x[s] = px
    playhead_op[s] = 1

# Pixel Mouse Cursor (original artwork sprite!) — actively drags captions & tracks timing sweep!
cur_cx, cur_cy = center("cursor")  # approx (909, 266)
cur_x = [int(round(cur_cx))] * STEPS
cur_y = [int(round(cur_cy))] * STEPS

def set_cur(pts):
    for s, x, y in pts:
        cur_x[s % STEPS] = x
        cur_y[s % STEPS] = y

# Smooth stepped pixel-grid jumps following every caption interaction!
set_cur([
    # Beat 1: Grabs Cap_4 & snaps it into S4!
    (0,  864, 432), (1,  856, 464), (2,  848, 504), (3,  832, 544),
    (4,  816, 592), (5,  800, 640), (6,  808, 632), (7,  848, 560),
    (8,  880, 480), (9,  896, 400), (10, 888, 368),
    # Beat 2: Darts across Chaos grabbing Cap_6 & clicking snaps!
    (11, 888, 384), (12, 880, 424), (13, 864, 464), (14, 840, 512),
    (15, 808, 560), (16, 800, 560), (17, 792, 568), (18, 784, 576),
    (19, 768, 584), (20, 768, 592), (21, 784, 576), (22, 640, 576),
    # Beat 3: Sweeps right alongside the Timing Playhead across all 4 slots!
    (23, 592, 592), (24, 632, 592), (25, 672, 592), (26, 720, 592),
    (27, 760, 592), (28, 808, 592), (29, 608, 640), (30, 672, 640),
    (31, 712, 640), (32, 760, 640), (33, 792, 640), (34, 840, 608),
    # Beat 4: Speed Burst! Rapidly darts to each incoming block!
    (35, 872, 512), (36, 888, 448), (37, 640, 528), (38, 640, 576),
    (39, 640, 592), (40, 864, 448), (41, 808, 528), (42, 768, 592),
    (43, 688, 624), (44, 680, 640), (45, 880, 400), (46, 864, 464),
    (47, 824, 568), (48, 808, 640),
    # Beat 5: Celebratory hop up-right near its iconic resting spot!
    (49, 896, 288), (50, 912, 240), (51, 912, 256), (52, 912, 240),
    (53, 912, 256), (54, 904, 272),
    # Beat 6: Snaps right back to intercept the freshly spawned coral block -> matches s=0!
    (55, 896, 304), (56, 888, 352), (57, 880, 384), (58, 880, 416), (59, 872, 424),
])

# ---- 2d. FLOATING PIXEL ACCENTS (BANG `!`, SWIRLS, DOTS) ----
# `!` Exclamation mark bounces frantically during Chaos/Burst and stays cleanly clear of Pip's reaching right arm!
bang_cx, bang_cy = center("bang")
bang_dx = [0] * STEPS
bang_dy = [0] * STEPS
for s in range(STEPS):
    if 11 <= s <= 22:
        bang_dy[s] = -48 if s % 2 == 0 else -16
        bang_dx[s] = 32 if s % 4 < 2 else 16
    elif 35 <= s <= 47:
        bang_dy[s] = -64 if s % 2 == 0 else -32
        bang_dx[s] = 32
    elif 48 <= s <= 53:
        bang_dy[s] = -64 if s in (49, 50, 52) else -32
        bang_dx[s] = 32 if s in (49, 50) else 16
    else:
        bang_dy[s] = -32 if (s % 6 < 3) else -16
        bang_dx[s] = 32 if (arm_r[s] in ("type_up", "type_dn", "grab_mid")) else 16

# Left decorations (coral loop & indigo swirl) kick outward cleanly when Pip cheers (s=49..54) & bob rhythmically!
coral_dx = [-32 if 49 <= s <= 54 else (-16 if (s % 12 < 6) else 0) for s in range(STEPS)]
coral_dy = [-16 if (s % 6 < 3) else 0 for s in range(STEPS)]
swirl_dx = [-32 if 49 <= s <= 54 else (0 if (s % 10 < 5) else -16) for s in range(STEPS)]
swirl_dy = [0 if (s % 10 < 5) else -16 for s in range(STEPS)]
botl_dy  = [-16 if (s % 12 < 6) else 0 for s in range(STEPS)]
topr_dy  = [-16 if (s % 6 < 3) else 0 for s in range(STEPS)]
botr_dy  = [-16 if (s in (5, 6, 18, 20, 30, 33, 39, 42, 45, 48, 49, 50)) else 0 for s in range(STEPS)]

# ---- 2e. CRISP PIXEL BURST PARTICLES (8 independent 14x14 px squares for snaps, typing sparks & finale!) ----
SPARK_CFG = [
    # (name, color, size)
    ("Spark_1", COL_CORAL,  14),
    ("Spark_2", COL_PINK,   14),
    ("Spark_3", COL_NAVY,   12),
    ("Spark_4", COL_CREAM,  14),
    ("Spark_5", COL_CORAL,  14),
    ("Spark_6", COL_INDIGO, 14),
    ("Spark_7", COL_PINK,   12),
    ("Spark_8", COL_CORAL,  16),
]
spark_x  = [[500] * STEPS for _ in range(8)]
spark_y  = [[500] * STEPS for _ in range(8)]
spark_op = [[0] * STEPS for _ in range(8)]

def burst4(s, cx, cy, idxs=(0, 1, 2, 3), r1=26, r2=46):
    """Crisp 2-step 4-corner pixel particle pop centered at (cx, cy)!"""
    dirs = [(-1, -1), (1, -1), (-1, 1), (1, 1)]
    for k, (dx, dy) in zip(idxs, dirs):
        spark_x[k][s % STEPS] = int(cx + dx * r1)
        spark_y[k][s % STEPS] = int(cy + dy * r1)
        spark_op[k][s % STEPS] = 1
        spark_x[k][(s + 1) % STEPS] = int(cx + dx * r2)
        spark_y[k][(s + 1) % STEPS] = int(cy + dy * r2)
        spark_op[k][(s + 1) % STEPS] = 1

# Snap impact bursts on EVERY caption lock-in!
burst4(5,  770, 623, (0, 1, 2, 3), 28, 48)  # Beat 1 S4 snap!
burst4(18, 609, 577, (0, 1, 2, 3), 26, 44)  # Beat 2 S1 shove-snap!
burst4(20, 736, 577, (4, 5, 6, 7), 30, 50)  # Beat 2 S2 grab-snap!
# Sync tick bursts during Beat 3 Playhead Sweep!
burst4(24, 609, 555, (0, 1),       16, 30)  # Sync S1!
burst4(27, 736, 555, (2, 3),       16, 30)  # Sync S2!
burst4(30, 644, 601, (0, 1, 2, 3), 22, 38)  # Sync S3 micro-correction!
burst4(33, 770, 601, (4, 5, 6, 7), 26, 44)  # Sync S4 complete!
# Speed burst snap pops!
burst4(39, 609, 577, (0, 1),       24, 42)  # S1 fast snap!
burst4(42, 736, 577, (2, 3),       24, 42)  # S2 fast snap!
burst4(45, 644, 623, (4, 5),       24, 42)  # S3 fast snap!
# BIG 8-particle celebratory starburst around the entire caption panel on Satisfying Finish (s=48..51)!
burst4(48, 692, 600, (0, 1, 2, 3), 160, 200)
burst4(49, 692, 580, (4, 5, 6, 7), 130, 175)

# Crisp 1-step typing tap sparks popping right above the keypad keys during typing bursts!
for s in range(STEPS):
    if spark_op[6][s] == 0 and arm_l[s] == "type_dn":
        spark_x[6][s] = 576 + ((s * 16) % 64)
        spark_y[6][s] = 682
        spark_op[6][s] = 1
    if spark_op[7][s] == 0 and arm_r[s] == "type_dn":
        spark_x[7][s] = 748 + ((s * 16) % 64)
        spark_y[7][s] = 682
        spark_op[7][s] = 1


# ================================================================ 3. EMIT RML SCENE GRAPH (FRONT-TO-BACK!)
lines = [
    '<Rive version="1" kind="fragment">',
    f'    <Artboard defaultStateMachineId="0:3" styleId="0:4" width="{AW}" height="{AH}" name="Pip Caption Goblin" id="0:1">',
    '        <LayoutComponentStyle name="Artboard Style" id="0:4"/>',
    '',
    '        <StateMachine name="CaptionLoop" id="0:3">',
    '            <StateMachineLayer name="Loop" id="0:5">',
    '                <AnyState x="0" y="-160"/>',
    '                <ExitState x="400" y="-160"/>',
    '                <EntryState x="0" y="0"><StateTransition stateToId="0:6"/></EntryState>',
    '                <AnimationState animationId="0:2" x="200" y="0" id="0:6"/>',
    '            </StateMachineLayer>',
    '        </StateMachine>',
    '',
]

# ---- LAYER 1 (TOPMOST): PIXEL SPARKLES, MOUSE CURSOR, TIMING PLAYHEAD ----
lines.append('        <Node name="FX Top" id="0:2100">')
for k, (sname, scol, ssz) in enumerate(SPARK_CFG):
    sid = nid()
    lines += rect_node(sname, sid, spark_x[k][0], spark_y[k][0], ssz, ssz, scol, "            ", op=spark_op[k][0])
    track(sid, "x", spark_x[k], "{:.0f}")
    track(sid, "y", spark_y[k], "{:.0f}")
    track(sid, "opacity", spark_op[k], "{:.0f}")

id_cursor = nid()
lines += [
    f'            <Node x="{cur_x[0]:.0f}" y="{cur_y[0]:.0f}" name="Pixel Cursor" id="{id_cursor}">',
    f'                <Image x="0" y="0" assetId="{ASSETS["cursor"]}" name="cursor_img"/>',
    '            </Node>',
]
track(id_cursor, "x", cur_x, "{:.0f}")
track(id_cursor, "y", cur_y, "{:.0f}")

# Vertical crisp pixel timing playhead bar inside the panel screen!
id_playhead = nid()
lines += [
    f'            <Node x="{playhead_x[0]:.0f}" y="600" opacity="{playhead_op[0]}" name="Timing Playhead" id="{id_playhead}">',
    f'                <Shape name="Bar"><Rectangle width="10" height="114" name="R"/><Fill name="F"><SolidColor colorValue="{COL_CORAL}" name="C"/></Fill></Shape>',
    f'                <Shape name="Core"><Rectangle width="4" height="114" name="R"/><Fill name="F"><SolidColor colorValue="{COL_CREAM}" name="C"/></Fill></Shape>',
    f'                <Shape name="Head"><Rectangle width="18" height="10" name="R"/><Fill name="F"><SolidColor colorValue="{COL_NAVY}" name="C"/></Fill></Shape>',
    '            </Node>',
]
track(id_playhead, "x", playhead_x, "{:.0f}")
track(id_playhead, "opacity", playhead_op, "{:.0f}")
lines.append('        </Node>')

# ---- LAYER 2: PIP FOREGROUND TYPING/SHOVING ARMS (ride Pip body motion, draw cleanly over keypad & panel edge!) ----
id_arms_front = nid()
lines.append(f'        <Node x="{body_dx[0]:.0f}" y="{body_dy[0]:.0f}" name="Arms Front" id="{id_arms_front}">')
track(id_arms_front, "x", body_dx, "{:.0f}")
track(id_arms_front, "y", body_dy, "{:.0f}")

for aname, key_val in (
    ("arm_l_type_up", "type_up"),
    ("arm_l_type_dn", "type_dn"),
    ("arm_l_shove",   "shove"),
):
    aid = nid()
    ops = [1 if arm_l[s] == key_val else 0 for s in range(STEPS)]
    lines += sprite_node(aname, aid, "            ", op=ops[0])
    track(aid, "opacity", ops, "{:.0f}")

for aname, key_val in (
    ("arm_r_type_up",  "type_up"),
    ("arm_r_type_dn",  "type_dn"),
    ("arm_r_grab_mid", "grab_mid"),
):
    aid = nid()
    ops = [1 if arm_r[s] == key_val else 0 for s in range(STEPS)]
    lines += sprite_node(aname, aid, "            ", op=ops[0])
    track(aid, "opacity", ops, "{:.0f}")
lines.append('        </Node>')

# ---- LAYER 3: CAPTION PANEL + 6 INDEPENDENTLY ANIMATED CAPTION BLOCKS + FLASHES + EDITING KEYPAD ----
id_panel_grp = nid()
lines.append(f'        <Node x="0" y="{panel_dy[0]:.0f}" name="Caption Console" id="{id_panel_grp}">')
track(id_panel_grp, "y", panel_dy, "{:.0f}")

# 3a. 4 crisp Slot Sync-Flash overlays (on top of blocks!)
for k in range(1, 5):
    sx, sy, sw, sh = SLOTS[k]
    fid = nid()
    fcol = COL_CREAM if k < 4 else COL_PINK
    lines += rect_node(f"SlotFlash_{k}", fid, sx, sy, sw + 10, sh + 10, fcol, "            ", op=slot_flash[k][0])
    track(fid, "opacity", slot_flash[k], "{:.0f}")

# 3b. 6 Independent Pixel-Art Caption Blocks (`Cap_1..Cap_6`) with crisp airborne highlight outline!
CAP_SPECS = {
    1: (74,  20, COL_NAVY,  COL_CORAL, 609, 577),
    2: (130, 20, COL_NAVY,  COL_CORAL, 736, 577),
    3: (144, 22, COL_NAVY,  COL_CORAL, 644, 623),
    4: (62,  22, COL_CORAL, COL_NAVY,  770, 623),
    5: (74,  20, COL_NAVY,  COL_CORAL, 609, 577),
    6: (130, 20, COL_NAVY,  COL_CORAL, 736, 577),
}
for k, (cw, ch, ccol, ocol, sx0, sy0) in CAP_SPECS.items():
    cid = nid()
    oid_out = nid()
    xs = [CAPS[k][s][0] for s in range(STEPS)]
    ys = [CAPS[k][s][1] for s in range(STEPS)]
    sxs = [CAPS[k][s][2] for s in range(STEPS)]
    sys_ = [CAPS[k][s][3] for s in range(STEPS)]
    ops = [CAPS[k][s][4] for s in range(STEPS)]
    # Show crisp 4px pixel highlight rim ONLY while block is airborne/unsnapped so flying blocks POP!
    out_ops = [1 if (ops[s] == 1 and (abs(xs[s] - sx0) > 10 or abs(ys[s] - sy0) > 10)) else 0 for s in range(STEPS)]
    lines += [
        f'            <Node x="{xs[0]:.0f}" y="{ys[0]:.0f}" scaleX="{sxs[0]:.4f}" scaleY="{sys_[0]:.4f}" opacity="{ops[0]}" name="CaptionBlock_{k}" id="{cid}">',
        f'                <Shape name="Box"><Rectangle width="{cw:.0f}" height="{ch:.0f}" name="R"/><Fill name="F"><SolidColor colorValue="{ccol}" name="C"/></Fill></Shape>',
        f'                <Node opacity="{out_ops[0]}" name="AirOutline_{k}" id="{oid_out}">',
        f'                    <Shape name="Out"><Rectangle width="{cw + 12:.0f}" height="{ch + 12:.0f}" name="R"/><Fill name="F"><SolidColor colorValue="{ocol}" name="C"/></Fill></Shape>',
        f'                </Node>',
        '            </Node>',
    ]
    track(cid, "x", xs, "{:.0f}")
    track(cid, "y", ys, "{:.0f}")
    track(cid, "scaleX", sxs, "{:.4f}")
    track(cid, "scaleY", sys_, "{:.4f}")
    track(cid, "opacity", ops, "{:.0f}")
    track(oid_out, "opacity", out_ops, "{:.0f}")

# 3c. Panel sync-flash border overlay + empty caption panel screen!
id_pflash = nid()
lines += sprite_node("panel_flash", id_pflash, "            ", op=panel_flash_op[0])
track(id_pflash, "opacity", panel_flash_op, "{:.0f}")
lines += sprite_node("panel_bg", nid(), "            ", op=1)

# 3d. 6 illuminated pixel keypad key-press highlights + compact editing keypad bar!
for i, (rx, ry, rw, rh) in enumerate(KEY_RECTS):
    kid = nid()
    kcol = COL_CREAM if i in (2, 5) else COL_CORAL
    lines += rect_node(f"KeyLight_{i + 1}", kid, rx + rw * 0.5, ry + rh * 0.5, rw, rh, kcol, "            ", op=key_flash[i][0])
    track(kid, "opacity", key_flash[i], "{:.0f}")
lines += sprite_node("keypad", nid(), "            ", op=1)
lines.append('        </Node>')

# ---- LAYER 4: PIP THE CAPTION GOBLIN (BODY, HEM, HEADSET, FACE & BACK/CHEER/ORIG ARMS) ----
id_pip = nid()
lines.append(f'        <Node x="{body_dx[0]:.0f}" y="{body_dy[0]:.0f}" name="Pip Goblin" id="{id_pip}">')
track(id_pip, "x", body_dx, "{:.0f}")
track(id_pip, "y", body_dy, "{:.0f}")

# 4a. Face expressions (shift +18px when body_lean is active so face stays dead-centered on Pip's leaning head!)
id_face_grp = nid()
face_tot_x = [face_dx[s] + (18 if body_pose[s] == "lean" else 0) for s in range(STEPS)]
face_tot_y = [face_dy[s] + (10 if body_pose[s] == "squash" else (-10 if body_pose[s] == "hop" else 0)) for s in range(STEPS)]
lines.append(f'            <Node x="{face_tot_x[0]:.0f}" y="{face_tot_y[0]:.0f}" name="Face" id="{id_face_grp}">')
track(id_face_grp, "x", face_tot_x, "{:.0f}")
track(id_face_grp, "y", face_tot_y, "{:.0f}")
for fname in ("normal", "blink", "focus", "wide", "happy"):
    fid = nid()
    ops = [1 if face_pose[s] == fname else 0 for s in range(STEPS)]
    lines += sprite_node(f"face_{fname}", fid, "                ", op=ops[0])
    track(fid, "opacity", ops, "{:.0f}")
lines.append('            </Node>')

# 4b. Headset (earpiece + boom mic, tracks body_lean + 1-step overlapping vertical lag bounce!)
id_hs = nid()
hs_x = [18 if body_pose[s] == "lean" else 0 for s in range(STEPS)]
hs_y = [hs_dy[s] + (10 if body_pose[s] == "squash" else (-10 if body_pose[s] == "hop" else 0)) for s in range(STEPS)]
hs_cx, hs_cy = center("headset")
lines += [
    f'            <Node x="{hs_cx + hs_x[0]:.0f}" y="{hs_cy + hs_y[0]:.0f}" name="Headset" id="{id_hs}">',
    f'                <Image x="0" y="0" assetId="{ASSETS["headset"]}" name="headset_img"/>',
    '            </Node>',
]
track(id_hs, "x", [hs_cx + v for v in hs_x], "{:.0f}")
track(id_hs, "y", [hs_cy + v for v in hs_y], "{:.0f}")

# 4c. 4 Crisp Pixel-Art Body Poses (neutral, lean, squash, hop)
for bname in ("neutral", "lean", "squash", "hop"):
    bid = nid()
    ops = [1 if body_pose[s] == bname else 0 for s in range(STEPS)]
    lines += sprite_node(f"body_{bname}", bid, "            ", op=ops[0])
    track(bid, "opacity", ops, "{:.0f}")

# 4d. 3 Crisp Scalloped Hem Pixel-Wave Frames (hem_0, hem_1, hem_2)
for h_i in range(3):
    hid = nid()
    ops = [1 if hem_pose[s] == h_i else 0 for s in range(STEPS)]
    lines += sprite_node(f"hem_{h_i}", hid, "            ", op=ops[0])
    track(hid, "opacity", ops, "{:.0f}")

# 4e. Back / Reaching / Cheer Arms (blend seamlessly behind Pip's shoulder outline!)
for aname, key_val in (("arm_l_orig", "orig"), ("arm_l_cheer", "cheer")):
    aid = nid()
    ops = [1 if arm_l[s] == key_val else 0 for s in range(STEPS)]
    lines += sprite_node(aname, aid, "            ", op=ops[0])
    track(aid, "opacity", ops, "{:.0f}")

for aname, key_val in (("arm_r_orig", "orig"), ("arm_r_cheer", "cheer")):
    aid = nid()
    ops = [1 if arm_r[s] == key_val else 0 for s in range(STEPS)]
    lines += sprite_node(aname, aid, "            ", op=ops[0])
    track(aid, "opacity", ops, "{:.0f}")

lines.append('        </Node>')

# ---- LAYER 5: FLOATING PIXEL-ART DECORATIONS & EXCLAMATION MARK ----
lines.append('        <Node name="Pixel Accents" id="0:2200">')
for dname, dxs, dys in (
    ("bang",              bang_dx,  bang_dy),
    ("deco_coral_loop",   coral_dx, coral_dy),
    ("deco_indigo_swirl", swirl_dx, swirl_dy),
    ("deco_bottom_l",     [0] * STEPS, botl_dy),
    ("deco_top_r",        [0] * STEPS, topr_dy),
    ("deco_bot_r",        [0] * STEPS, botr_dy),
):
    did = nid()
    cx, cy = center(dname)
    lines += [
        f'            <Node x="{cx + dxs[0]:.0f}" y="{cy + dys[0]:.0f}" name="{dname}" id="{did}">',
        f'                <Image x="0" y="0" assetId="{ASSETS[dname]}" name="{dname}_img"/>',
        '            </Node>',
    ]
    track(did, "x", [cx + v for v in dxs], "{:.0f}")
    track(did, "y", [cy + v for v in dys], "{:.0f}")
lines.append('        </Node>')

# ---- EMIT LINEAR ANIMATION (60 fps, 240 frames = 4.00 s, strictly stepped hold-key pixel-art loop!) ----
lines.append('')
lines.append(f'        <LinearAnimation fps="{FPS}" duration="{L}" loopValue="loop" name="Caption Chaos Loop" id="0:2">')
by_obj = {}
for oid, prop, ks in TRACKS:
    by_obj.setdefault(oid, []).append((prop, ks))
for oid, props in by_obj.items():
    lines.append(f'            <KeyedObject objectId="{oid}">')
    for prop, ks in props:
        lines.append(f'                <KeyedProperty property="{prop}">')
        lines += ks
        lines.append('                </KeyedProperty>')
    lines.append('            </KeyedObject>')
lines.append('        </LinearAnimation>')
lines.append('    </Artboard>')
lines.append('')
for nm, aid in ASSETS.items():
    lines.append(f'    <ImageAsset file="art/{nm}.png" name="{nm}" id="{aid}"/>')
lines.append('</Rive>')

open(OUT, "w").write("\n".join(lines) + "\n")
print(f"Wrote scene.rml ({len(lines)} lines, {len(by_obj)} keyed objects, {STEPS} pixel-art steps @ {FPS // STEP_F} fps)")

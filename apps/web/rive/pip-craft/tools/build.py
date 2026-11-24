"""Generate the Rive scene (`scene.rml`) for Pip — The Craftsman (4.0 s seamless infinite loop).

usage: python3 tools/build.py

4.0 s seamless loop (240 frames at 60 fps) on a 1000x1000 artboard:
- 4-bone skinned mesh on Pip's knitted body (`TorsoRoot -> Head -> Crown`, plus downward `HemBone` for
  springy knitted-skirt sway and follow-through).
- Face (`eye_l`, `eye_r`, `smile`) rides `HeadBone` with 2.5D look parallax toward the cutting action,
  focused snip squints, natural blinks, and a joyful grin on the satisfied bounce.
- TRUE articulated two-blade scissors around the central silver pivot (`blade_front` in front of the
  film strip + `blade_back` behind the film strip so the film literally passes between the two blades!):
  4 sharp, snappy snips with wide anticipation, 3-frame snap closure, metallic blade glint flash, and
  synchronized orange-handle / knitted right-paw squeeze!
- Active 35mm film strip: flexes & jiggles on every snip, flicks a tiny edge trim chip on Snip 2,
  genuinely advances downward by +1 full frame (+74.0 px) during 1.2-1.8 s while the left paw adjusts
  its grip, hinges on Snip 3, and cleanly drops a full 1-frame rectangular offcut on Snip 4 — returning
  strictly to the original 4-frame strip with zero reset or seam jump!
"""
import base64, json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LAY = json.load(open(os.path.join(HERE, "layers.json")))
MESH = json.load(open(os.path.join(HERE, "meshes.json")))
OUT = os.path.join(ROOT, "scene.rml")

FPS, L = 60, 240
AW, AH = LAY["size"]  # 1000 x 1000
PTS = LAY["points"]

SC_PIV0 = tuple(PTS["scissor_pivot"])    # (829.0, 405.5)
PAW_L0 = tuple(PTS["paw_left"])          # (226.0, 469.0)
PAW_R0 = tuple(PTS["paw_right"])         # (780.0, 495.0)
EYE_L0 = tuple(PTS["eye_l"])
EYE_R0 = tuple(PTS["eye_r"])
SMILE0 = tuple(PTS["smile"])
FILM_X0 = PTS["film_x0"]                 # 159.5
FILM_X1 = PTS["film_x1"]                 # 294.0
FILM_CX = 0.5 * (FILM_X0 + FILM_X1)      # 226.75
FILM_TOP = PTS["film_top_y"]             # 476.5
FILM_BOT = PTS["film_bot_y"]             # 772.5
PITCH = PTS["film_pitch"]                # 74.0 (exact 1-frame height!)
BODY_ROOT = tuple(PTS["body_root"])      # (508.0, 575.0)
HEAD_POS = tuple(PTS["head_bone"])       # (508.0, 400.0)
CROWN_POS = tuple(PTS["crown_bone"])     # (508.0, 225.0)

deg = math.radians
W1 = 2.0 * math.pi / L


def center(name):
    b = LAY[name]
    return (b["x"] + b["w"] * 0.5, b["y"] + b["h"] * 0.5)


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def rot2(v, a):
    c, s = math.cos(a), math.sin(a)
    return (c * v[0] - s * v[1], s * v[0] + c * v[1])


def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3.0 - 2.0 * x)


def smoother(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0)


def bump(t, f0, dur, amp=1.0, p=1.0):
    u = ((t - f0) % L) / dur
    if u <= 0.0 or u >= 1.0:
        return 0.0
    return amp * (math.sin(math.pi * u) ** p)


def env(t, f_in0, f_in1, f_out0, f_out1):
    t = t % L
    def in_r(a, b):
        return (a <= t <= b) if a <= b else (t >= a or t <= b)
    def frac(a, b):
        return ((t - a) % L) / max((b - a) % L, 1e-6)
    if in_r(f_in0, f_in1):
        return smoother(frac(f_in0, f_in1))
    if in_r(f_in1, f_out0):
        return 1.0
    if in_r(f_out0, f_out1):
        return 1.0 - smoother(frac(f_out0, f_out1))
    return 0.0


def periodic(keys):
    F = [k[0] for k in keys]
    V = [k[1] for k in keys]
    n = len(keys)
    def fr(i): return F[i % n] + L * (i // n)
    def val(i): return V[i % n]
    M = [(val(i + 1) - val(i - 1)) / (fr(i + 1) - fr(i - 1)) for i in range(n)]
    def f(t):
        t %= L
        i = max(j for j in range(n) if F[j] <= t)
        f0, f1 = fr(i), fr(i + 1)
        h = f1 - f0
        s = (t - f0) / h
        v0, v1, m0, m1 = val(i), val(i + 1), M[i], M[(i + 1) % n]
        return ((2 * s**3 - 3 * s**2 + 1) * v0 + (s**3 - 2 * s**2 + s) * h * m0
                + (-2 * s**3 + 3 * s**2) * v1 + (s**3 - s**2) * h * m1)
    return f


def sampled(vals):
    return periodic([(i, v) for i, v in enumerate(vals)])


def D(f, t, e=0.4):
    return (f(t + e) - f(t - e)) / (2.0 * e)


def D2(f, t, e=0.6):
    return (f(t + e) - 2.0 * f(t) + f(t - e)) / (e * e)


def spring(force, hz, zeta, peak=None, gain=1.0, loops=12, sub_steps=8):
    """Normalized periodic damped spring (DC gain = 1.0 when peak is None)."""
    w = 2.0 * math.pi * hz / FPS
    w2 = w * w
    x = v = 0.0
    out = [0.0] * L
    dt = 1.0 / sub_steps
    for lap in range(loops):
        for fr in range(L):
            for k in range(sub_steps):
                a = w2 * (force(fr + k * dt) - x) - 2.0 * zeta * w * v
                v += a * dt
                x += v * dt
            if lap == loops - 1:
                out[fr] = x
    if peak is not None:
        m = max(abs(u) for u in out) or 1.0
        out = [u * peak / m for u in out]
    else:
        out = [u * gain for u in out]
    return sampled(out)


# ================================================================ 1. SNIP TIMING & ARTICULATED SCISSOR BLADES
# 4 crisp, snappy snips across the 4.0 s cycle:
#   SNIP 1 @ f=39  (0.65 s): quick first precision trim on lower right edge of film strip
#   SNIP 2 @ f=62  (1.03 s): second crisp trim -> tiny film corner chip flicks off!
#   [f=74..108 (1.23-1.80 s): film advances +1 full frame downward; left paw adjusts grip!]
#   SNIP 3 @ f=124 (2.07 s): sharp scoring cut on the seam above the hanging 5th frame (offcut hinges!)
#   SNIP 4 @ f=150 (2.50 s): decisive final CHOMP -> 1-frame rectangular offcut detaches & tumbles away!
SNIPS = [39, 62, 124, 150]


def snip_close_amount(t):
    """Return blade closure fraction c(t):
      c =  0.0 -> rest open angle (42 deg between blades)
      c = -0.36 -> wide anticipation open (~57 deg)
      c = +1.00 -> fully CLOSED flush blade-on-blade (+21 deg front, -21 deg back!)
    Snappy anticipation -> lightning 3-frame snap closure -> brief crisp hold -> springy rebound open!
    """
    t = t % L
    val = 0.0
    # Slight lively opening/closing anticipation around each snip
    for s in SNIPS:
        d = t - s
        if d > L * 0.5:
            d -= L
        elif d < -L * 0.5:
            d += L
        # Anticipation open wide: d in [-12 .. -3.5]
        if -12.0 <= d < -3.5:
            u = (d + 12.0) / 8.5
            # Smoothly widen to -0.36 then hold poised right before snap
            c = -0.36 * math.sin(math.pi * min(u * 1.15, 0.5))
            val = min(val, c) if val <= 0 else c
        # Lightning SNAP SHUT: d in [-3.5 .. 0.0] (3.5 frames = 58 ms — crisp & sharp!)
        elif -3.5 <= d < 0.0:
            u = (d + 3.5) / 3.5
            # Fast accelerating ease-in snap from -0.36 to +1.00!
            e = u * u * u
            val = -0.36 + 1.36 * e
        # Crisp bite hold + springy follow-through release: d in [0.0 .. +11.0]
        elif 0.0 <= d <= 11.0:
            if d <= 2.2:
                val = 1.00
            else:
                u = (d - 2.2) / 8.8
                # Rebound slightly past 0 to -0.10 then settle cleanly
                val = (1.0 - smooth(u)) - 0.08 * math.sin(math.pi * u)
    # Also add a tiny playful happy click-bounce at f=176 (during satisfied bounce!) — small half-snip!
    d_hap = ((t - 176.0 + L * 0.5) % L) - L * 0.5
    if -8.0 <= d_hap <= 10.0:
        if d_hap < 0:
            val += 0.45 * smooth((d_hap + 8.0) / 8.0) ** 2
        else:
            val += 0.45 * (1.0 - smooth(d_hap / 10.0))
    return val


blade_close = sampled([snip_close_amount(fr) for fr in range(L)])

# Actual blade rotations around central pivot (degrees):
# Rest opening = 42 deg -> front blade rotates +21 deg CW to close, back blade rotates -21 deg CCW to close!
def blade_front_deg(t):
    return 21.0 * blade_close(t)

def blade_back_deg(t):
    return -21.0 * blade_close(t)

# Crisp metallic blade glint on each sharp snip closure!
def glint_opacity(t):
    t = t % L
    best = 0.0
    for s in SNIPS:
        d = (t - (s - 1.0)) % L
        if 0.0 <= d <= 8.0:
            best = max(best, math.sin(math.pi * d / 8.0) ** 0.7)
    return best * 0.92

def glint_slide(t):
    """Slides glint smoothly from pivot out toward the blade tips right as the blades shear shut!"""
    t = t % L
    for s in SNIPS:
        d = (t - (s - 1.0)) % L
        if 0.0 <= d <= 8.0:
            return smooth(d / 8.0)
    return 0.0


# ================================================================ 2. FILM STRIP MOTION, ADVANCE & OFFCUTS
# Film strip + left paw shift inward-right during cutting (0.3-2.7 s) so scissors interact naturally right in
# front of Pip, then return smoothly to the iconic pose at f=0 / f=240!
FILM_POSES = [
    # (frame,  dx,    dy,    rot_deg)
    (0,        0.0,    0.0,   0.0),    # iconic reference pose (easing smoothly inward!)
    (12,      38.0,   -8.0,  -2.5),
    (28,      92.0,  -16.0,  -5.5),    # brought cleanly inward-center to meet scissors
    (52,      96.0,  -14.0,  -5.8),    # steady through Snips 1 & 2
    (74,      88.0,  -22.0,  -4.0),    # lifts slightly to begin film advance
    (92,      90.0,  -14.0,  -4.5),    # feeding film downward!
    (110,     94.0,  -18.0,  -5.5),    # positioned cleanly for Snips 3 & 4
    (148,     96.0,  -15.0,  -6.0),    # right through decisive final Snip 4!
    (168,     78.0,  -30.0,  -2.0),    # happy lift on satisfied bounce!
    (194,     44.0,  -12.0,  -1.5),    # gliding smoothly back toward start
    (220,     14.0,   -3.0,  -0.6),
]
film_base_dx = periodic([(p[0], p[1]) for p in FILM_POSES])
film_base_dy = periodic([(p[0], p[2]) for p in FILM_POSES])
film_base_rot = periodic([(p[0], p[3]) for p in FILM_POSES])

# Crisp physical snip impacts on the film strip (sharp downward jiggle + flexible pendulum sway!)
def snip_impulse(t):
    v = 0.0
    for idx, s in enumerate(SNIPS):
        amp = 1.35 if idx == 3 else (1.15 if idx == 2 else 1.0)
        v += amp * bump(t, s - 1, 6, 1.0, 1.2)
    return v

film_jiggle_y = spring(lambda t: 22.0 * snip_impulse(t) + 2.5 * math.sin(4 * W1 * t), hz=6.5, zeta=0.26, peak=13.5)
film_flex_deg = spring(
    lambda t: -18.0 * snip_impulse(t) - 0.55 * D2(film_base_dx, t) + 1.8 * math.sin(3 * W1 * t + 0.7),
    hz=3.8, zeta=0.22, peak=7.5,
)

# Left paw grip adjustment during film advance (f=74..108): paw loosens & slides slightly up, grabs, pulls down!
def paw_l_grip_dy(t):
    lift_regrip = -12.0 * bump(t, 73, 14, 1.0, 1.1) + 7.0 * bump(t, 86, 20, 1.0, 1.2)
    snip_press = 4.0 * snip_impulse(t)
    return lift_regrip + snip_press

def paw_l_grip_rot(t):
    return -7.5 * bump(t, 73, 16, 1.0, 1.1) + 5.0 * bump(t, 88, 18, 1.0, 1.2) + 4.0 * snip_impulse(t)

# Exact +1-frame film scroll (advances 0 -> +PITCH = +74.0 px during f=76..108, wraps invisibly to 0 at f=114!)
# Because film_tile has 5 IDENTICAL repeating frames of height PITCH = 74.0 px, y=74.0 and y=0.0 are BIT-FOR-BIT IDENTICAL!
def film_scroll_y(t):
    t = t % L
    if t < 76.0:
        return 0.0
    if t <= 108.0:
        # Smooth organic pull with a tiny crisp settle!
        u = (t - 76.0) / 32.0
        return PITCH * smoother(u)
    if t <= 112.0:
        return PITCH
    # Reset seamlessly from PITCH -> 0 while identical tile phase holds!
    return 0.0


def film_world_pos(px, py, t):
    """Map a reference-artboard point on the film strip to exact world coordinates at frame t."""
    # FilmAndLeftPawGroup is anchored at PAW_L0; FilmFlexGroup rotates around PAW_L0!
    gx = PAW_L0[0] + film_base_dx(t)
    gy = PAW_L0[1] + film_base_dy(t) + film_jiggle_y(t) * 0.55
    tot_rot = deg(film_base_rot(t) + film_flex_deg(t))
    r = rot2((px - PAW_L0[0], py - PAW_L0[1]), tot_rot)
    return (gx + r[0], gy + r[1])


# ================================================================ 3. SCISSORS TRAJECTORY (LOCKS TO FILM CUT LINE!)
# Compute the EXACT world coordinates of the film strip's cut zone right at each snip so the scissor blades
# genuinely straddle & cut the film strip — NEVER cutting empty air!
# On the film strip: right edge is FILM_X1 = 294.0, center is FILM_CX = 226.75, bottom edge is FILM_BOT = 772.5.
# When scissors rotate -110 deg from rest (-65 deg bisector -> -175 deg pointing LEFT):
#   blade tips extend ~85 px LEFT of the scissor pivot!
#   Putting pivot at (FILM_X1 + 26, cut_y) = (320, cut_y) in film-local coords puts:
#     - pivot cleanly 26 px to the right of the film strip (ZERO overlap at pivot!)
#     - blades reaching from x = 320 across to x = 235 (deep across the right 60% of the film strip!)
#     - orange handles & paw_right cleanly at x = 380..450 in front of Pip's knitted tummy!
def cut_target_world(local_x, local_y, t):
    return film_world_pos(local_x, local_y, t)

# Pre-sample key target world coordinates at the exact snip frames so our periodic spline hits them dead-on!
T_SNIP1 = cut_target_world(FILM_X1 + 24.0, FILM_BOT - 24.0, 39)
T_SNIP2 = cut_target_world(FILM_X1 + 16.0, FILM_BOT - 12.0, 62)
T_ADV   = cut_target_world(FILM_X1 + 78.0, FILM_BOT - 38.0, 92)
T_SNIP3 = cut_target_world(FILM_X1 + 22.0, FILM_BOT - 2.0, 124)
T_SNIP4 = cut_target_world(FILM_X1 + 10.0, FILM_BOT + 1.0, 150)

SC_POSES = [
    # (frame,   x,                y,                rot_deg)
    (0,         SC_PIV0[0],       SC_PIV0[1],        0.0),      # iconic original pose!
    (12,        685.0,            535.0,           -52.0),      # brisk sweep inward across Pip's tummy
    (26,        T_SNIP1[0] + 34,  T_SNIP1[1] - 12, -104.0),     # poised right at film edge, opening wide!
    (39,        T_SNIP1[0],       T_SNIP1[1],      -111.0),     # SNIP 1!
    (50,        T_SNIP2[0] + 24,  T_SNIP2[1] - 10, -105.0),     # quick reposition & open
    (62,        T_SNIP2[0],       T_SNIP2[1],      -113.0),     # SNIP 2! (corner chip flicks off!)
    (78,        T_ADV[0],         T_ADV[1],        -88.0),      # pulls back nicely so film can advance!
    (98,        T_ADV[0] - 8,     T_ADV[1] + 10,   -94.0),      # tracking the advancing film
    (113,       T_SNIP3[0] + 28,  T_SNIP3[1] - 10, -106.0),     # darts back onto the cut seam!
    (124,       T_SNIP3[0],       T_SNIP3[1],      -111.0),     # SNIP 3! (scores cut, offcut hinges!)
    (138,       T_SNIP4[0] + 22,  T_SNIP4[1] - 12, -105.0),     # wide anticipation open!
    (150,       T_SNIP4[0],       T_SNIP4[1],      -114.0),     # SNIP 4! (DECISIVE CHOMP -> offcut detaches!)
    (168,       625.0,            560.0,           -46.0),      # joyful sweep outward on satisfied bounce!
    (184,       745.0,            435.0,           -16.0),      # happy flourish & poise
    (206,       815.0,            396.0,            -3.0),      # graceful arc back to rest
    (226,       834.0,            402.0,             1.5),      # subtle settle overshoot flowing smoothly into f=0!
]
sc_x_base = periodic([(p[0], p[1]) for p in SC_POSES])
sc_y_base = periodic([(p[0], p[2]) for p in SC_POSES])
sc_rot_base = periodic([(p[0], p[3]) for p in SC_POSES])

# Add tiny crisp wrist-punch follow-through right on each snip closure!
def sc_x(t):
    return sc_x_base(t) - 6.5 * snip_impulse(t)

def sc_y(t):
    return sc_y_base(t) + 4.5 * snip_impulse(t) - 10.0 * bump(t, 160, 22, 1.0, 1.15)

def sc_rot_deg(t):
    return sc_rot_base(t) - 4.0 * snip_impulse(t) + 5.0 * bump(t, 166, 20, 1.0, 1.2)

# Right paw squeeze/flex synchronized with scissor handles squeezing shut!
def paw_r_scale_x(t):
    return 1.0 - 0.065 * max(blade_close(t), -0.3)

def paw_r_scale_y(t):
    return 1.0 + 0.05 * max(blade_close(t), -0.3)

def paw_r_local_rot(t):
    return 5.5 * blade_close(t)


# ================================================================ 4. DETACHING OFFCUTS (1-FRAME OFFCUT + TRIM CHIP)
# A. Full 1-frame rectangular offcut (film_offcut.png):
#    - Hidden above clip y = FILM_BOT before f=76 (opacity = 0)
#    - Slides cleanly out below FILM_BOT during f=76..108 (in exact sync with film_scroll_y!)
#    - Hangs steadily at dy = 0 during f=108..124
#    - On Snip 3 (f=124): hinges/bends downward +11 deg around its left edge!
#    - On Snip 4 (f=150): DETACHES! Falls downward with gravity, spins +56 deg, drifts slightly left, fades f=176..198!
def offcut_opacity(t):
    t = t % L
    if t < 76.0 or t > 190.0:
        return 0.0
    if t < 79.0:
        return smooth((t - 76.0) / 3.0)
    if t <= 168.0:
        return 1.0
    return 1.0 - smoother((t - 168.0) / 22.0)

def offcut_dy(t):
    """Vertical offset relative to attached hanging position (top edge right at FILM_BOT = 772.5)."""
    t = t % L
    if t < 76.0:
        return -PITCH  # tucked strictly above clip line FILM_BOT!
    if t <= 108.0:
        # Slides smoothly downward from -PITCH to 0.0 in EXACT lockstep with film_scroll_y!
        return -PITCH + film_scroll_y(t)
    if t < 150.0:
        # Attached! Tiny jiggle on Snip 3 (f=124)
        return 3.5 * bump(t, 123, 8, 1.0, 1.2)
    # Free-falling under gravity after Snip 4 (f=150..190), fading out well before bottom artboard edge!
    dt = min((t - 150.0) / 40.0, 1.0)
    return 10.0 * dt + 148.0 * (dt ** 1.95)

def offcut_dx(t):
    t = t % L
    if t < 150.0:
        return 0.0
    dt = min((t - 150.0) / 40.0, 1.0)
    return -26.0 * dt + 8.0 * math.sin(math.pi * dt)

def offcut_rot_deg(t):
    """Pivoted near top-left of offcut (FILM_X0 + 18, FILM_BOT) so Snip 3 hinges it naturally from the right!"""
    t = t % L
    if t < 123.0:
        return 0.0
    if t < 150.0:
        # Snip 3 nicks the right side so the offcut tilts & wobbles ~11 deg waiting for the final chop!
        u = min((t - 123.0) / 7.0, 1.0)
        wob = 3.5 * math.sin(2.0 * math.pi * (t - 123.0) / 14.0) * math.exp(-(t - 123.0) / 14.0)
        return 11.5 * smooth(u) + wob
    dt = min((t - 150.0) / 40.0, 1.0)
    return 11.5 + 48.0 * (dt ** 1.35)

# B. Tiny corner trim chip (film_chip.png): pops cleanly off bottom-right on Snip 2 (f=62..100)!
def chip_opacity(t):
    t = t % L
    if t < 61.5 or t > 100.0:
        return 0.0
    if t < 63.0:
        return smooth((t - 61.5) / 1.5)
    if t <= 84.0:
        return 1.0
    return 1.0 - smoother((t - 84.0) / 16.0)

def chip_dx(t):
    t = t % L
    if t < 62.0:
        return 0.0
    dt = min((t - 62.0) / 38.0, 1.0)
    return 24.0 * dt

def chip_dy(t):
    t = t % L
    if t < 62.0:
        return 0.0
    dt = min((t - 62.0) / 38.0, 1.0)
    return -14.0 * dt + 195.0 * (dt ** 2.0)

def chip_rot_deg(t):
    t = t % L
    if t < 62.0:
        return 0.0
    dt = min((t - 62.0) / 38.0, 1.0)
    return 145.0 * dt


# ================================================================ 5. LIVELY KNITTED BODY, HEAD, HEM & FACE
# Pip is focused, busy, energetic, wiggling gently, leaning into cuts, and bouncing with pride after cutting!
def body_dx_fn(t):
    # Calm, controlled craftsman sway + lean slightly left toward film during cuts!
    wiggle = 6.5 * math.sin(4 * W1 * t + 0.3) + 1.8 * math.sin(7 * W1 * t)
    lean_l = -12.0 * env(t, 12, 28, 152, 174)
    snip_jolt = -4.0 * snip_impulse(t)
    happy_sway = 9.0 * bump(t, 166, 24, 1.0, 1.15)
    return wiggle + lean_l + snip_jolt + happy_sway

def body_dy_fn(t):
    # Buoyant mini-bounces + lean down/focused during snips + satisfied celebration bounce!
    bounce = -5.5 * abs(math.sin(5 * W1 * t + 0.15)) + 2.5
    focus_dip = 9.5 * env(t, 20, 32, 66, 76) + 11.0 * env(t, 110, 120, 152, 160)
    snip_dip = 7.0 * snip_impulse(t)
    # Satisfied craft bounce after final Snip 4 + offcut drop (f=154..194)!
    antic = 9.0 * bump(t, 151, 9, 1.0, 1.4)
    jump = -20.5 * bump(t, 159, 20, 1.0, 1.05)
    rebound = 5.5 * bump(t, 177, 13, 1.0, 1.3) - 6.0 * bump(t, 188, 14, 1.0, 1.3)
    return bounce + focus_dip + snip_dip + antic + jump + rebound

body_dx = sampled([body_dx_fn(fr) for fr in range(L)])
body_dy = sampled([body_dy_fn(fr) for fr in range(L)])

# Torso sway rotation (degrees, - = CCW leaning toward screen-left film strip!)
def body_rot_deg_fn(t):
    wiggle = 2.4 * math.sin(4 * W1 * t + 0.6) + 0.6 * math.sin(8 * W1 * t)
    lean_cut = -4.2 * env(t, 14, 30, 150, 168)
    snip_nod = -2.2 * snip_impulse(t)
    happy_tilt = 4.2 * bump(t, 162, 22, 1.0, 1.15)
    return wiggle + lean_cut + snip_nod + happy_tilt

body_rot_deg = sampled([body_rot_deg_fn(fr) for fr in range(L)])

# Juicy squash & stretch driven by vertical acceleration + snip punch + celebration pop!
squash_spr = spring(lambda t: -D2(body_dy, t), hz=3.8, zeta=0.32, peak=0.045)
def body_scale_y(t):
    s = (1.0 + squash_spr(t)
         - 0.040 * snip_impulse(t)
         - 0.055 * bump(t, 151, 9, 1.0, 1.4)
         + 0.075 * bump(t, 159, 18, 1.0, 1.1))
    return min(max(s, 0.90), 1.10)

def body_scale_x(t):
    return 1.0 / math.sqrt(body_scale_y(t))

# Subtle, charming HEAD tilt & focused nods (HeadBone local rotation in degrees — calm & natural, zero scary wobble!)
def head_rot_deg_fn(t):
    wiggle = 1.2 * math.sin(3 * W1 * t + 0.8)
    # Gentle focused head tilt toward the film strip while cutting + tiny focused nod on every snip!
    focus_tilt = -2.8 * env(t, 16, 30, 68, 78) - 3.4 * env(t, 110, 120, 152, 160)
    # Curious gentle right-tilt inspecting the advancing film strip (f=76..106)!
    inspect = 2.4 * bump(t, 76, 30, 1.0, 1.1)
    snip_nod = -2.2 * snip_impulse(t)
    # Gentle happy head tilt on satisfied bounce!
    happy = 3.5 * bump(t, 161, 16, 1.0, 1.15) - 2.5 * bump(t, 175, 16, 1.0, 1.2)
    return wiggle + focus_tilt + inspect + snip_nod + happy

head_rot_deg = sampled([head_rot_deg_fn(fr) for fr in range(L)])

# Subtle plush wool crown settle (firm & cute, never floppy!) + gentle knitted hem sway!
crown_rot_deg = spring(
    lambda t: -1.0 * D2(head_rot_deg, t) - 0.5 * D2(body_rot_deg, t) - 0.2 * D2(body_dx, t),
    hz=3.2, zeta=0.48, peak=1.8,
)
hem_rot_deg = spring(
    lambda t: 0.8 * D2(body_dx, t) - 1.0 * D2(body_rot_deg, t) + 1.4 * math.sin(4 * W1 * t - 0.9),
    hz=2.8, zeta=0.30, peak=5.8,
)

# 2.5D Face parallax + focused eye tracking + blinks + satisfied smile!
def face_dx(t):
    # Looks intently down-left toward the film strip while cutting!
    look_cut = -14.5 * env(t, 12, 28, 154, 174)
    tilt_par = (head_rot_deg(t) + body_rot_deg(t)) * 0.35
    return min(max(look_cut + tilt_par, -20.0), 12.0)

def face_dy(t):
    # Looks down toward the scissor blades during snips, perks up during satisfied bounce!
    look_down = 12.0 * env(t, 14, 30, 152, 166)
    snip_bob = 4.5 * snip_impulse(t)
    happy_up = -8.5 * bump(t, 160, 22, 1.0, 1.15)
    return min(max(look_down + snip_bob + happy_up, -12.0), 18.0)

def eye_scale_y(t):
    # Two natural blinks: during film-advance grip adjust (f=82..89) and smooth return (f=208..215)
    v = 1.0
    for bf, dur in ((82, 7), (208, 7)):
        b = bump(t, bf, dur, 1.0, 1.2)
        if b > 0:
            v = min(v, 1.0 - 0.92 * b)
    # Focused slight squint on each snip closure!
    v -= 0.16 * snip_impulse(t)
    # Happy cute bounce-squint on satisfied celebration!
    v -= 0.24 * bump(t, 162, 18, 1.0, 1.1)
    return max(v, 0.06)

def eye_scale_x(t):
    return 1.0 + 0.08 * snip_impulse(t) + 0.14 * bump(t, 162, 18, 1.0, 1.1)

def smile_scale_x(t):
    # Focused tiny concentrated smile while snipping -> BIG proud grin on satisfied bounce!
    return 1.0 - 0.12 * env(t, 26, 36, 150, 158) + 0.28 * bump(t, 158, 28, 1.0, 1.08)

def smile_scale_y(t):
    return 1.0 - 0.08 * env(t, 26, 36, 150, 158) + 0.20 * bump(t, 158, 28, 1.0, 1.08)


# ================================================================ 6. RML HELPERS
_id = [5000]
def nid():
    _id[0] += 1
    return f"0:{_id[0]}"


TRACKS = []
def track(oid, prop, ks):
    TRACKS.append((oid, prop, ks))


def prune_constant(f, frames, eps=1e-4):
    vals = [f(fr) for fr in frames]
    keep = [frames[0]]
    for i in range(1, len(frames) - 1):
        if abs(vals[i] - vals[i - 1]) > eps or abs(vals[i + 1] - vals[i]) > eps:
            keep.append(frames[i])
    if frames[-1] != keep[-1]:
        keep.append(frames[-1])
    return keep


def hermite_keys(f, frames, fmt="{:.4f}", ind="                    "):
    frames = prune_constant(f, frames)
    out = []
    for i, fr in enumerate(frames):
        v = f(fr)
        if i == len(frames) - 1:
            out.append(f'{ind}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}"/>')
            break
        nx = frames[i + 1]
        h = nx - fr
        if abs(f(nx) - v) < 1e-5 and abs(D(f, fr, 0.25)) < 1e-4 and abs(D(f, nx, 0.25)) < 1e-4:
            out.append(f'{ind}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}" interpolationType="hold"/>')
            continue
        y1 = v + D(f, fr, 0.25) * h / 3.0
        y2 = f(nx) - D(f, nx, 0.25) * h / 3.0
        out.append(
            f'{ind}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}" interpolationType="cubicValue">'
            f'<CubicValueInterpolator x1="0.33333334" y1="{fmt.format(y1)}" x2="0.6666667" y2="{fmt.format(y2)}"/></KeyFrameDouble>'
        )
    return out


def linear_keys(f, frames, fmt="{:.4f}", ind="                    ", hold_jumps=False):
    frames = prune_constant(f, frames)
    out = []
    for i, fr in enumerate(frames):
        v = f(fr)
        if hold_jumps and i + 1 < len(frames) and abs(f(frames[i + 1]) - v) > 30.0:
            out.append(f'{ind}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}" interpolationType="hold"/>')
        else:
            out.append(f'{ind}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}"/>')
    return out


def varuint(n):
    b = bytearray()
    while True:
        x = n & 0x7F
        n >>= 7
        if n:
            b.append(x | 0x80)
        else:
            b.append(x)
            return bytes(b)


def image_tag(name, origin, label, ind, extra=""):
    c = sub(center(name), origin)
    return f'{ind}<Image x="{c[0]:.2f}" y="{c[1]:.2f}" assetId="{ASSETS[name]}" name="{label}"{extra}/>'


def mesh_image_lines(name, origin, label, ind, mesh_data, skin_world, tendons):
    lay = LAY[name]
    cx, cy = center(name)
    tri_b = base64.b64encode(b"".join(varuint(k) for t in mesh_data["tris"] for k in t)).decode()
    out = [
        f'{ind}<Image x="{cx - origin[0]:.2f}" y="{cy - origin[1]:.2f}" assetId="{ASSETS[name]}" name="{label}" id="{nid()}">',
        f'{ind}    <Mesh triangleIndexBytes="{tri_b}" name="{label} Mesh" id="{nid()}">',
    ]
    for i, v in enumerate(mesh_data["verts"]):
        tag = "ContourMeshVertex" if v["ring"] else "MeshVertex"
        u = min(max((v["x"] - lay["x"]) / lay["w"], 0.0), 1.0)
        vv = min(max((v["y"] - lay["y"]) / lay["h"], 0.0), 1.0)
        out.append(f'{ind}        <{tag} x="{v["x"] - cx:.2f}" y="{v["y"] - cy:.2f}" u="{u:.5f}" v="{vv:.5f}" name="V{i}">')
        out.append(f'{ind}            <Weight values="{v["values"]}" indices="{v["indices"]}"/>')
        out.append(f'{ind}        </{tag}>')
    out.append(f'{ind}        <Skin tx="{skin_world[0]:.3f}" ty="{skin_world[1]:.3f}" name="{label} Skin">')
    for bid, xx_, xy_, yx_, yy_, tx_, ty_, tname in tendons:
        out.append(
            f'{ind}            <Tendon boneId="{bid}" xx="{xx_:.6f}" xy="{xy_:.6f}" yx="{yx_:.6f}" yy="{yy_:.6f}" '
            f'tx="{tx_:.3f}" ty="{ty_:.3f}" name="{tname}"/>'
        )
    out.append(f'{ind}        </Skin>')
    out.append(f'{ind}    </Mesh>')
    out.append(f'{ind}</Image>')
    return out


# ================================================================ 7. SCENE GRAPH (FRONT-TO-BACK DRAW ORDER!)
ASSETS = {
    "body": "0:900",
    "eye_l": "0:901",
    "eye_r": "0:902",
    "smile": "0:903",
    "paw_left": "0:904",
    "paw_right": "0:905",
    "blade_front": "0:906",
    "blade_back": "0:907",
    "scissor_pivot": "0:908",
    "film_tile": "0:909",
    "film_offcut": "0:910",
    "film_chip": "0:911",
}

EVERY2 = list(range(0, L + 1, 2))
EVERY3 = list(range(0, L + 1, 3))

ID_SC_FRONT = "0:2000"
ID_BLADE_F = "0:2001"
ID_GLINT = "0:2002"
ID_FILM_GRP = "0:2100"
ID_PAW_L = "0:2101"
ID_FILM_FLEX = "0:2102"
ID_FILM_SCROLL = "0:2103"
ID_OFFCUT = "0:2104"
ID_CHIP = "0:2105"
ID_CLIP_UPPER = "0:2110"
ID_CLIP_OFFCUT = "0:2111"
ID_SC_BACK = "0:2200"
ID_BLADE_B = "0:2201"
ID_PAW_R = "0:2202"
ID_PIP_RIG = "0:2300"
ID_TORSO_BONE = "0:2301"
ID_HEAD_BONE = "0:2302"
ID_CROWN_BONE = "0:2303"
ID_HEM_BONE = "0:2304"
ID_FACE = "0:2310"
ID_EYE_L = "0:2311"
ID_EYE_R = "0:2312"
ID_SMILE = "0:2313"

lines = [
    '<Rive version="1" kind="fragment">',
    f'    <Artboard defaultStateMachineId="0:3" styleId="0:4" width="{AW}" height="{AH}" name="Pip Craftsman" id="0:1">',
    '        <LayoutComponentStyle name="Artboard Style" id="0:4"/>',
    '',
    '        <StateMachine name="Craft" id="0:3">',
    '            <StateMachineLayer name="Loop" id="0:5">',
    '                <AnyState x="0" y="-160"/>',
    '                <ExitState x="400" y="-160"/>',
    '                <EntryState x="0" y="0"><StateTransition stateToId="0:6"/></EntryState>',
    '                <AnimationState animationId="0:2" x="200" y="0" id="0:6"/>',
    '            </StateMachineLayer>',
    '        </StateMachine>',
    '',
]

# ---- 1. SCISSOR FRONT (Blade Front + Silver Pivot + Crisp Metallic Glint — IN FRONT of Film Strip!) ----
lines += [
    f'        <Node x="{SC_PIV0[0]:.2f}" y="{SC_PIV0[1]:.2f}" name="Scissor Front" id="{ID_SC_FRONT}">',
    # Subtle metallic highlight gliding along the closed blade edge on each snip!
    f'            <Node x="12.0" y="-26.0" rotation="{deg(20.0):.5f}" opacity="0" name="Blade Glint" id="{ID_GLINT}">',
    '                <Shape name="Glint">',
    '                    <PointsPath isClosed="false" name="Path"><StraightVertex x="0" y="0"/><StraightVertex x="0" y="-34"/></PointsPath>',
    '                    <Stroke thickness="4.5" cap="round" name="S"><SolidColor colorValue="E8FFFFFF" name="C"/></Stroke>',
    '                </Shape>',
    '            </Node>',
    image_tag("scissor_pivot", SC_PIV0, "Pivot Rivet", "            "),
    f'            <Node name="Blade Front" id="{ID_BLADE_F}">',
    image_tag("blade_front", SC_PIV0, "Blade Front", "                "),
    '            </Node>',
    '        </Node>',
]

# ---- 2. FILM STRIP & LEFT KNITTED PAW (Passes BETWEEN Blade Front and Blade Back!) ----
# Clip rectangles inside FilmFlexGroup so clips ride the film's exact flex & swing!
# Upper 4-frame window: x in [FILM_X0 - 10, FILM_X1 + 10], y in [FILM_TOP, FILM_BOT] (height = 4 * 74 = 296.0 exact!)
clip_u_cx = FILM_CX - PAW_L0[0]
clip_u_cy = 0.5 * (FILM_TOP + FILM_BOT) - PAW_L0[1]
clip_u_h = FILM_BOT - FILM_TOP  # 296.0 exact
# Offcut window: y in [FILM_BOT - 1.0, FILM_BOT + 519] (1px overlap kills AA hairline seam during advance!)
clip_o_cy = (FILM_BOT - 1.0 + 260.0) - PAW_L0[1]

# Offcut hinges around its top-left corner at (FILM_X0 + 18, FILM_BOT)
OFFCUT_PIV = (FILM_X0 + 18.0, FILM_BOT)
off_rel = sub(OFFCUT_PIV, PAW_L0)
chip_piv = center("film_chip")
chip_rel = sub(chip_piv, PAW_L0)

lines += [
    f'        <Node x="{PAW_L0[0]:.2f}" y="{PAW_L0[1]:.2f}" name="Film And Left Paw" id="{ID_FILM_GRP}">',
    # Left knitted paw sits in front of the top of the film strip
    f'            <Node name="Left Paw" id="{ID_PAW_L}">',
    image_tag("paw_left", PAW_L0, "Left Paw", "                "),
    '            </Node>',
    # Flexible film assembly swinging slightly around Pip's grip
    f'            <Node name="Film Flex" id="{ID_FILM_FLEX}">',
    # Paintless clip shapes (invisible, referenced by ClippingShape)
    f'                <Shape x="{clip_u_cx:.2f}" y="{clip_u_cy:.2f}" name="Upper Clip Rect" id="{ID_CLIP_UPPER}">',
    f'                    <Rectangle width="180" height="{clip_u_h:.2f}" name="Path"/>',
    '                </Shape>',
    f'                <Shape x="{clip_u_cx:.2f}" y="{clip_o_cy:.2f}" name="Offcut Clip Rect" id="{ID_CLIP_OFFCUT}">',
    '                    <Rectangle width="420" height="520" name="Path"/>',
    '                </Shape>',
    # Small corner trim chip (flicks off on Snip 2!)
    f'                <Node x="{chip_rel[0]:.2f}" y="{chip_rel[1]:.2f}" opacity="0" name="Film Chip" id="{ID_CHIP}">',
    image_tag("film_chip", chip_piv, "Film Chip", "                    "),
    '                </Node>',
    # Detaching 1-frame offcut (clipped strictly below FILM_BOT so it emerges cleanly during advance & falls freely!)
    '                <Node name="Offcut Clipped">',
    f'                    <ClippingShape sourceId="{ID_CLIP_OFFCUT}" name="Offcut Clip"/>',
    f'                    <Node x="{off_rel[0]:.2f}" y="{off_rel[1]:.2f}" opacity="0" name="Film Offcut" id="{ID_OFFCUT}">',
    image_tag("film_offcut", OFFCUT_PIV, "Film Offcut", "                        "),
    '                    </Node>',
    '                </Node>',
    # Main 4-frame scrolling film strip (clipped cleanly to y in [FILM_TOP, FILM_BOT])
    '                <Node name="Film Upper Clipped">',
    f'                    <ClippingShape sourceId="{ID_CLIP_UPPER}" name="Upper Clip"/>',
    f'                    <Node x="0" y="0" name="Film Scroll" id="{ID_FILM_SCROLL}">',
    image_tag("film_tile", PAW_L0, "Film Tile", "                        "),
    '                    </Node>',
    '                </Node>',
    '            </Node>',
    '        </Node>',
]

# ---- 3. SCISSOR BACK + RIGHT KNITTED PAW (BEHIND Film Strip, IN FRONT of Pip's Body!) ----
paw_r_rel = sub(PAW_R0, SC_PIV0)
lines += [
    f'        <Node x="{SC_PIV0[0]:.2f}" y="{SC_PIV0[1]:.2f}" name="Scissor Back" id="{ID_SC_BACK}">',
    f'            <Node name="Blade Back" id="{ID_BLADE_B}">',
    image_tag("blade_back", SC_PIV0, "Blade Back", "                "),
    '            </Node>',
    f'            <Node x="{paw_r_rel[0]:.2f}" y="{paw_r_rel[1]:.2f}" name="Right Paw" id="{ID_PAW_R}">',
    image_tag("paw_right", PAW_R0, "Right Paw", "                "),
    '            </Node>',
    '        </Node>',
]

# ---- 4. PIP SKELETON + FACE (Face draws IN FRONT of Body, BEHIND Film & Scissors!) ----
el_rel = sub(EYE_L0, HEAD_POS)
er_rel = sub(EYE_R0, HEAD_POS)
sm_rel = sub(SMILE0, HEAD_POS)
lines += [
    f'        <Node x="{BODY_ROOT[0]:.2f}" y="{BODY_ROOT[1]:.2f}" name="Pip Rig" id="{ID_PIP_RIG}">',
    f'            <RootBone x="0" y="0" rotation="{-math.pi / 2:.7f}" length="175" name="Torso Root Bone" id="{ID_TORSO_BONE}">',
    f'                <Bone length="175" name="Head Bone" id="{ID_HEAD_BONE}">',
    f'                    <Bone length="120" name="Crown Bone" id="{ID_CROWN_BONE}"/>',
    f'                    <Node rotation="{math.pi / 2:.7f}" name="Face Level">',
    f'                        <Node x="0" y="0" name="Face" id="{ID_FACE}">',
    f'                            <Node x="{el_rel[0]:.2f}" y="{el_rel[1]:.2f}" name="Eye L" id="{ID_EYE_L}">',
    image_tag("eye_l", EYE_L0, "Eye L", "                                "),
    '                            </Node>',
    f'                            <Node x="{er_rel[0]:.2f}" y="{er_rel[1]:.2f}" name="Eye R" id="{ID_EYE_R}">',
    image_tag("eye_r", EYE_R0, "Eye R", "                                "),
    '                            </Node>',
    f'                            <Node x="{sm_rel[0]:.2f}" y="{sm_rel[1]:.2f}" name="Smile" id="{ID_SMILE}">',
    image_tag("smile", SMILE0, "Smile", "                                "),
    '                            </Node>',
    '                        </Node>',
    '                    </Node>',
    '                </Bone>',
    '            </RootBone>',
    # Downward sibling RootBone driving cozy springy sway on Pip's 5-lobe knitted hem!
    f'            <RootBone x="0" y="0" rotation="{math.pi / 2:.7f}" length="240" name="Hem Bone" id="{ID_HEM_BONE}"/>',
    '        </Node>',
]

# ---- 5. PIP KNITTED BODY (4-bone skinned mesh) ----
lines += mesh_image_lines(
    "body", (0.0, 0.0), "Pip Body", "        ", MESH["body"], center("body"),
    [
        (ID_TORSO_BONE, 0.0, -1.0,  1.0, 0.0, BODY_ROOT[0], BODY_ROOT[1], "Torso"),
        (ID_HEAD_BONE,  0.0, -1.0,  1.0, 0.0, HEAD_POS[0],  HEAD_POS[1],  "Head"),
        (ID_CROWN_BONE, 0.0, -1.0,  1.0, 0.0, CROWN_POS[0], CROWN_POS[1], "Crown"),
        (ID_HEM_BONE,   0.0,  1.0, -1.0, 0.0, BODY_ROOT[0], BODY_ROOT[1], "Hem"),
    ],
)


# ================================================================ 8. KEYFRAME ALL TRACKS
# Synchronize ScissorFront & ScissorBack transforms identically!
SNIP_DENSE = sorted(set(EVERY2 + [f for s in SNIPS for f in range(s - 5, s + 5) if 0 <= f <= L]))
for sid in (ID_SC_FRONT, ID_SC_BACK):
    track(sid, "x", hermite_keys(sc_x, EVERY2, "{:.2f}"))
    track(sid, "y", hermite_keys(sc_y, EVERY2, "{:.2f}"))
    track(sid, "rotation", hermite_keys(lambda t: deg(sc_rot_deg(t)), EVERY2, "{:.5f}"))

track(ID_BLADE_F, "rotation", linear_keys(lambda t: deg(blade_front_deg(t)), SNIP_DENSE, "{:.5f}"))
track(ID_BLADE_B, "rotation", linear_keys(lambda t: deg(blade_back_deg(t)), SNIP_DENSE, "{:.5f}"))
track(ID_PAW_R, "scaleX", hermite_keys(paw_r_scale_x, EVERY2, "{:.4f}"))
track(ID_PAW_R, "scaleY", hermite_keys(paw_r_scale_y, EVERY2, "{:.4f}"))
track(ID_PAW_R, "rotation", hermite_keys(lambda t: deg(paw_r_local_rot(t)), EVERY2, "{:.5f}"))

# Metallic glint gliding out along the sheared blades (rest bisector = -65 deg -> angle +25 deg from vertical up)
GLINT_FRAMES = sorted(set([0, L] + [f for s in SNIPS for f in range(s - 2, s + 9) if 0 <= f <= L]))
track(ID_GLINT, "opacity", linear_keys(glint_opacity, GLINT_FRAMES, "{:.4f}"))
track(ID_GLINT, "x", linear_keys(lambda t: 10.0 + 26.0 * glint_slide(t), GLINT_FRAMES, "{:.2f}"))
track(ID_GLINT, "y", linear_keys(lambda t: -16.0 - 52.0 * glint_slide(t), GLINT_FRAMES, "{:.2f}"))

# Film strip & Left Paw
track(ID_FILM_GRP, "x", hermite_keys(lambda t: PAW_L0[0] + film_base_dx(t), EVERY2, "{:.2f}"))
track(ID_FILM_GRP, "y", hermite_keys(lambda t: PAW_L0[1] + film_base_dy(t) + film_jiggle_y(t) * 0.55, EVERY2, "{:.2f}"))
track(ID_FILM_GRP, "rotation", hermite_keys(lambda t: deg(film_base_rot(t)), EVERY2, "{:.5f}"))

track(ID_PAW_L, "y", hermite_keys(paw_l_grip_dy, EVERY2, "{:.2f}"))
track(ID_PAW_L, "rotation", hermite_keys(lambda t: deg(paw_l_grip_rot(t)), EVERY2, "{:.5f}"))
track(ID_FILM_FLEX, "rotation", hermite_keys(lambda t: deg(film_flex_deg(t)), EVERY2, "{:.5f}"))

# Film scroll (+74.0 px advance over f=76..108, clean invisible hold-jump reset at f=112 -> 113!)
SCROLL_FRAMES = sorted(set([0, 74, 76] + list(range(78, 110, 2)) + [110, 112, 113, L]))
track(ID_FILM_SCROLL, "y", linear_keys(film_scroll_y, SCROLL_FRAMES, "{:.2f}", hold_jumps=True))

# Offcut (emerges f=76..108, hinges on Snip 3 f=124, detaches & falls on Snip 4 f=150..198!)
OFF_FRAMES = sorted(set([0, 74, 76] + list(range(76, 200, 2)) + [123, 125, 149, 150, 151, 200, L]))
track(ID_OFFCUT, "opacity", linear_keys(offcut_opacity, OFF_FRAMES, "{:.4f}"))
track(ID_OFFCUT, "x", linear_keys(lambda t: off_rel[0] + offcut_dx(t), OFF_FRAMES, "{:.2f}"))
track(ID_OFFCUT, "y", linear_keys(lambda t: off_rel[1] + offcut_dy(t), OFF_FRAMES, "{:.2f}"))
track(ID_OFFCUT, "rotation", linear_keys(lambda t: deg(offcut_rot_deg(t)), OFF_FRAMES, "{:.5f}"))

# Tiny trim chip (flicks off on Snip 2 f=62..100!)
CHIP_FRAMES = sorted(set([0, 60, 61, 62] + list(range(62, 102, 2)) + [102, L]))
track(ID_CHIP, "opacity", linear_keys(chip_opacity, CHIP_FRAMES, "{:.4f}"))
track(ID_CHIP, "x", linear_keys(lambda t: chip_rel[0] + chip_dx(t), CHIP_FRAMES, "{:.2f}"))
track(ID_CHIP, "y", linear_keys(lambda t: chip_rel[1] + chip_dy(t), CHIP_FRAMES, "{:.2f}"))
track(ID_CHIP, "rotation", linear_keys(lambda t: deg(chip_rot_deg(t)), CHIP_FRAMES, "{:.5f}"))

# Pip Knitted Body Rig, Head, Crown, Hem & Face
track(ID_PIP_RIG, "x", hermite_keys(lambda t: BODY_ROOT[0] + body_dx(t), EVERY2, "{:.2f}"))
track(ID_PIP_RIG, "y", hermite_keys(lambda t: BODY_ROOT[1] + body_dy(t), EVERY2, "{:.2f}"))
track(ID_PIP_RIG, "rotation", hermite_keys(lambda t: deg(body_rot_deg(t)), EVERY2, "{:.5f}"))
track(ID_PIP_RIG, "scaleX", hermite_keys(body_scale_x, EVERY2, "{:.4f}"))
track(ID_PIP_RIG, "scaleY", hermite_keys(body_scale_y, EVERY2, "{:.4f}"))

track(ID_HEAD_BONE, "rotation", hermite_keys(lambda t: deg(head_rot_deg(t)), EVERY2, "{:.5f}"))
track(ID_CROWN_BONE, "rotation", hermite_keys(lambda t: deg(crown_rot_deg(t)), EVERY2, "{:.5f}"))
track(ID_HEM_BONE, "rotation", hermite_keys(lambda t: math.pi / 2.0 + deg(hem_rot_deg(t)), EVERY2, "{:.5f}"))

track(ID_FACE, "x", hermite_keys(face_dx, EVERY2, "{:.2f}"))
track(ID_FACE, "y", hermite_keys(face_dy, EVERY2, "{:.2f}"))
EYE_FRAMES = sorted(set(EVERY3 + list(range(81, 91)) + list(range(207, 217)) + list(range(160, 182)) + [f for s in SNIPS for f in range(s - 2, s + 5)]))
track(ID_EYE_L, "scaleY", linear_keys(eye_scale_y, EYE_FRAMES, "{:.4f}"))
track(ID_EYE_R, "scaleY", linear_keys(eye_scale_y, EYE_FRAMES, "{:.4f}"))
track(ID_EYE_L, "scaleX", linear_keys(eye_scale_x, EYE_FRAMES, "{:.4f}"))
track(ID_EYE_R, "scaleX", linear_keys(eye_scale_x, EYE_FRAMES, "{:.4f}"))
track(ID_SMILE, "scaleX", hermite_keys(smile_scale_x, EVERY3, "{:.4f}"))
track(ID_SMILE, "scaleY", hermite_keys(smile_scale_y, EVERY3, "{:.4f}"))

# ---- Emit LinearAnimation (50 fps over 240 keys = 4.80 s — slightly calmer craftsman cadence!) ----
lines.append('')
lines.append(f'        <LinearAnimation fps="50" duration="{L}" loopValue="loop" name="Craft Loop" id="0:2">')
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
for name, aid in ASSETS.items():
    lines.append(f'    <ImageAsset file="art/{name}.png" name="{name}" id="{aid}"/>')
lines.append('</Rive>')

open(OUT, "w").write("\n".join(lines) + "\n")
print(
    f"Wrote scene.rml ({len(lines)} lines, {len(by_obj)} keyed objects)\n"
    f"  snip targets: S1=({T_SNIP1[0]:.0f},{T_SNIP1[1]:.0f}), S2=({T_SNIP2[0]:.0f},{T_SNIP2[1]:.0f}), "
    f"S3=({T_SNIP3[0]:.0f},{T_SNIP3[1]:.0f}), S4=({T_SNIP4[0]:.0f},{T_SNIP4[1]:.0f})\n"
    f"  blade front rot: {min(blade_front_deg(t) for t in range(L)):.1f}..{max(blade_front_deg(t) for t in range(L)):.1f} deg; "
    f"body dy: {min(body_dy(t) for t in range(L)):.1f}..{max(body_dy(t) for t in range(L)):.1f}; "
    f"seam sc={math.hypot(sc_x(L)-sc_x(0), sc_y(L)-sc_y(0)):.4f}"
)

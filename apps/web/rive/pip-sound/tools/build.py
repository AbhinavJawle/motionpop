"""Generate the Rive scene (`scene.rml`) for Pip — The Soundweaver (4.0 s seamless infinite loop).

usage: python3 tools/build.py

4.0 s seamless loop (240 frames @ 60 fps = 120 BPM, 8 crisp beats) on a 1024x1024 artboard:
- 6-bone groove mesh on Pip's mint-green marker-outlined body (`TorsoRoot -> HeadBone` upward, plus
  4 independent downward scallop bones `Lobe1..Lobe4` riding a traveling wave + spring lag so the
  hot-pink & cobalt scalloped hem visibly ripples and wiggles to the beat!).
- Oversized headphones (`headband`, `ear_left`, `ear_right`) ride `HeadBone` with overlapping spring lag,
  bass-beat ear-cup thump, and independent ear-cup rotation — always visually attached to Pip's head.
- Face (`eye_l`, `eye_r`, `smile`) rides `HeadBone` with 2.5D head-turn parallax, natural blinks,
  and subtle beat-synced joy.
- Authentic hand-drawn marker sound-wave arcs (`wave_l_1/2/3`, `wave_r_1/2/3`) propagate continuously
  outward in an asymmetric 5-against-4 polyrhythm (5 cycles/4s Left, 4 cycles/4s Right), plus a big
  rhythmic flourish burst (2.4-3.2 s), floating marker bubbles, pulse rings, and short hand-drawn sound marks.
- Dynamic hand-drawn marker audio waveforms near the headphones with rapidly pulsing irregular rounded bars.
"""
import base64, json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LAY = json.load(open(os.path.join(HERE, "layers.json")))
MESH = json.load(open(os.path.join(HERE, "meshes.json")))
OUT = os.path.join(ROOT, "scene.rml")

FPS, L = 60, 240  # 4.00 s @ 60 fps = exact 120 BPM (30 frames per beat, 8 beats per loop!)
AW, AH = LAY["size"]  # 1024 x 1024
PTS = LAY["points"]

TORSO_ROOT = tuple(PTS["torso_root"])         # (502, 520)
HEAD_POS = tuple(PTS["head_bone"])            # (502, 395)
LOBE_ROOTS = [tuple(p) for p in PTS["lobe_roots"]]
BAND_PIV = tuple(PTS["headband_pivot"])       # (506, 320)
EAR_L_PIV = tuple(PTS["ear_l_pivot"])         # (346, 408)
EAR_R_PIV = tuple(PTS["ear_r_pivot"])         # (654, 398)
EYE_L0 = tuple(PTS["eye_l"])
EYE_R0 = tuple(PTS["eye_r"])
SMILE0 = tuple(PTS["smile"])

deg = math.radians
W1 = 2.0 * math.pi / L


def center(name):
    b = LAY[name]
    return (b["x"] + b["w"] * 0.5, b["y"] + b["h"] * 0.5)


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


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


# ================================================================ 1. MUSICAL BEAT ENGINE (120 BPM = 8 BEATS / 4.0 s)
# Downbeats at f = 0, 30, 60, 90, 120, 150, 180, 210!
#   0.0-0.8 s (f=0..48):   Catching the beat (clean bounce & sway)
#   0.8-1.6 s (f=48..96):  Getting into it (wider groove sway, lively headphones)
#   1.6-2.4 s (f=96..144): FULL GROOVE (energetic double bounce + wild scallop ripple!)
#   2.4-3.2 s (f=144..192):RHYTHMIC FLOURISH (expressive head tilt + big pink/blue sound-wave pulse!)
#   3.2-4.0 s (f=192..240):Smooth continuous groove back into Beat 1!
BEATS = [0, 30, 60, 90, 120, 150, 180, 210]


def beat_pulse(t, width=10.0):
    """Crisp rhythmic kick-drum pulse peaking on every downbeat + extra double-bounce kick at f=105, 135!"""
    v = 0.0
    for b in BEATS:
        amp = 1.30 if b in (120, 150) else (1.15 if b in (60, 90) else 0.95)
        v += amp * bump(t, b - 2, width, 1.0, 1.3)
    # Extra syncopated offbeat pop during the Full Groove double bounce (f=96..144)!
    v += 0.95 * bump(t, 104, 9.0, 1.0, 1.3) + 1.00 * bump(t, 134, 9.0, 1.0, 1.3)
    return v


# Body vertical groove bounce: bouncy anticipation dip right ON each beat -> buoyant joyful pop UP between beats!
def body_dy_fn(t):
    # Base 120 BPM bouncy groove (8 bounces per 4s, sharper at bottom like a real bouncy ball!)
    base_groove = -21.0 * (abs(math.sin(4.0 * W1 * t + 0.15)) ** 0.78) + 11.0
    # Slight groove intensity swell during Getting Into It (0.8-1.6s) & Full Groove (1.6-2.4s)
    swell = 1.0 + 0.25 * env(t, 48, 66, 178, 198)
    # Energetic double-bounce kick during Full Groove (1.6-2.4s, f=96..144)!
    double_b = (
        10.0 * bump(t, 97, 8, 1.0, 1.3)
        - 16.0 * bump(t, 104, 12, 1.0, 1.1)
        + 12.0 * bump(t, 116, 8, 1.0, 1.3)
        - 20.0 * bump(t, 123, 14, 1.0, 1.05)
    )
    # Big flourish lift during Rhythmic Flourish (2.4-3.2s, f=144..192)
    flourish_dip = 11.0 * bump(t, 145, 9, 1.0, 1.4) - 18.0 * bump(t, 153, 18, 1.0, 1.1)
    return base_groove * swell + double_b + flourish_dip


# Continuous musical side-to-side body sway (4 sway cycles / 4s = swaying left/right on alternating beats!)
def body_dx_fn(t):
    base_sway = 18.0 * math.sin(2.0 * W1 * t + 0.25) + 7.5 * math.sin(4.0 * W1 * t - 0.3)
    # Wider, juicier groove sway during 0.8-2.4s
    extra_sway = 11.0 * math.sin(4.0 * W1 * t + 0.4) * env(t, 44, 62, 140, 156)
    # Expressive flourish swing during 2.4-3.2s
    flourish_sway = -18.0 * bump(t, 146, 22, 1.0, 1.1) + 20.0 * bump(t, 166, 24, 1.0, 1.1)
    return base_sway + extra_sway + flourish_sway


body_dx = sampled([body_dx_fn(fr) for fr in range(L)])
body_dy = sampled([body_dy_fn(fr) for fr in range(L)])

# Alternating body tilts synced with sway + rhythmic groove!
def body_rot_deg_fn(t):
    sway_tilt = 6.2 * math.sin(2.0 * W1 * t + 0.55) + 3.4 * math.sin(4.0 * W1 * t - 0.2)
    groove_tilt = 3.8 * math.sin(4.0 * W1 * t + 0.6) * env(t, 52, 68, 140, 154)
    flourish_tilt = -8.5 * bump(t, 146, 22, 1.0, 1.1) + 8.0 * bump(t, 166, 24, 1.0, 1.1)
    return sway_tilt + groove_tilt + flourish_tilt

body_rot_deg = sampled([body_rot_deg_fn(fr) for fr in range(L)])

# Juicy squash & stretch on every downbeat + natural overshoot & follow-through!
squash_spr = spring(lambda t: -D2(body_dy, t), hz=4.2, zeta=0.28, peak=0.085)
def body_scale_y(t):
    # Explicit crisp downbeat squash + upbeat pop stretch!
    s = 1.0 + squash_spr(t) - 0.045 * beat_pulse(t, 8.0) + 0.055 * bump(t, 152, 16, 1.0, 1.15)
    return min(max(s, 0.86), 1.13)

def body_scale_x(t):
    return 1.0 / math.sqrt(body_scale_y(t))

# Independent HEAD groove tilts & enthusiastic tiny nods!
def head_rot_deg_fn(t):
    groove = 5.5 * math.sin(2.0 * W1 * t + 0.95) + 4.5 * math.sin(4.0 * W1 * t + 0.35)
    # Enthusiastic double-nod during Full Groove (1.6-2.4s)
    nods = -5.5 * bump(t, 102, 12, 1.0, 1.2) + 6.5 * bump(t, 114, 12, 1.0, 1.2) - 5.5 * bump(t, 128, 12, 1.0, 1.2)
    # Expressive flourish head tilt (2.4-3.2s)
    flourish = -10.5 * bump(t, 148, 22, 1.0, 1.05) + 9.5 * bump(t, 168, 22, 1.0, 1.1)
    return groove + nods + flourish

head_rot_deg = sampled([head_rot_deg_fn(fr) for fr in range(L)])

# 4 INDEPENDENT LOWER SCALLOP LOBE BONES — organic traveling groove wave + spring follow-through!
# Each scallop has its own phase offset so the pink & blue scalloped hem ripples continuously!
lobe_rots = []
lobe_scales = []
for k in range(4):
    phase = k * 1.25
    # Traveling wave surges strongly during Full Groove (1.6-2.4s) & Rhythmic Flourish (2.4-3.2s)!
    def _lobe_force(t, ph=phase, idx=k):
        surge = 1.0 + 0.55 * env(t, 92, 108, 176, 194)
        travel = (8.5 * math.sin(4.0 * W1 * t - ph) + 4.2 * math.sin(6.0 * W1 * t - 1.5 * ph)) * surge
        # Lag behind body sway & rotation so the skirt trails organically like soft fabric/jelly!
        drag = 0.85 * D2(body_dx, t) - 1.4 * D2(body_rot_deg, t)
        # Outward flare on downbeat squash!
        flare = (idx - 1.5) * 4.5 * beat_pulse(t, 9.0)
        return travel + drag + flare

    lobe_rots.append(spring(_lobe_force, hz=3.4 + 0.2 * k, zeta=0.22, peak=14.5))
    lobe_scales.append(
        sampled([1.0 + (0.065 + 0.03 * env(fr, 92, 108, 176, 194)) * math.sin(4.0 * W1 * fr - phase + 0.7) for fr in range(L)])
    )

# ================================================================ 2. OVERSIZED HEADPHONES (LAGGING SPRING MOTION!)
# Headphones ride HeadBone (always visually attached!) PLUS independent damped springs lagging behind bounce/tilt!
hp_lag_y = spring(lambda t: -1.6 * D2(body_dy, t) - 4.0 * beat_pulse(t, 9.0), hz=4.2, zeta=0.28, peak=6.8)
hp_lag_rot = spring(lambda t: -1.4 * D2(head_rot_deg, t) - 0.8 * D2(body_rot_deg, t), hz=3.8, zeta=0.28, peak=4.5)
hp_flex_sx = spring(lambda t: 0.9 * D2(body_dy, t) + 3.5 * beat_pulse(t, 8.0), hz=4.4, zeta=0.28, peak=0.05)

# Independent ear-cup bounce, bass thump & subtle rotation (slightly different phase L vs R!)
ear_l_rot = spring(lambda t: -1.6 * D2(head_rot_deg, t) + 5.5 * math.sin(4 * W1 * t + 0.3) - 6.0 * beat_pulse(t, 8.0), hz=4.2, zeta=0.24, peak=9.5)
ear_r_rot = spring(lambda t: -1.6 * D2(head_rot_deg, t) - 5.5 * math.sin(4 * W1 * t + 1.1) + 6.0 * beat_pulse(t, 8.0), hz=4.0, zeta=0.24, peak=9.5)

def ear_l_scale(t):
    return 1.0 + 0.085 * beat_pulse(t, 8.0) + 0.035 * math.sin(5 * W1 * t)

def ear_r_scale(t):
    return 1.0 + 0.085 * beat_pulse(t, 8.0) + 0.035 * math.sin(4 * W1 * t + 1.2)

# ================================================================ 3. FACE (2.5D PARALLAX, NATURAL BLINKS & BEAT JOY)
def face_dx(t):
    return min(max((head_rot_deg(t) + body_rot_deg(t)) * 0.55 + 4.0 * math.sin(2 * W1 * t + 0.4), -14.0), 14.0)

def face_dy(t):
    # Subtle energetic beat nods + joyful perk on flourish!
    return min(max(3.5 * beat_pulse(t, 9.0) - 4.5 * math.sin(4 * W1 * t) - 4.0 * bump(t, 152, 20, 1.0, 1.1), -9.0), 10.0)

def eye_scale_y(t):
    # Two natural musical blinks (f=66..73 and f=204..211) + happy subtle music-squint on the big flourish (f=154..174)!
    v = 1.0
    for bf, dur in ((66, 7), (204, 7)):
        b = bump(t, bf, dur, 1.0, 1.2)
        if b > 0:
            v = min(v, 1.0 - 0.90 * b)
    # Subtle relaxed musical groove squint on the double bounce & flourish peak
    v -= 0.14 * bump(t, 122, 16, 1.0, 1.1) + 0.20 * bump(t, 154, 22, 1.0, 1.1)
    return max(v, 0.08)

def eye_scale_x(t):
    return 1.0 + 0.08 * bump(t, 122, 16, 1.0, 1.1) + 0.12 * bump(t, 154, 22, 1.0, 1.1)

def smile_scale_x(t):
    return 1.0 + 0.07 * beat_pulse(t, 10.0) + 0.14 * bump(t, 118, 24, 1.0, 1.1) + 0.18 * bump(t, 152, 28, 1.0, 1.1)

def smile_scale_y(t):
    return 1.0 + 0.05 * beat_pulse(t, 10.0) + 0.12 * bump(t, 152, 28, 1.0, 1.1)


# ================================================================ 4. TRAVELING HAND-DRAWN SOUND WAVES (5:4 POLYRHYTHM!)
# We reuse the AUTHENTIC hand-drawn marker arc PNGs (`wave_l_1/2/3`, `wave_r_1/2/3`) to create continuous,
# outwardly traveling wave trains!
# - LEFT SIDE:  period = 48 frames (5 full waves / 4.0 s!) — 3 staggered arcs at offsets 0, 16, 32
# - RIGHT SIDE: period = 60 frames (4 full waves / 4.0 s!) — 3 staggered arcs at offsets 9, 29, 49
# Asymmetric 5-against-4 polyrhythm -> NEVER looks mechanically symmetrical, ALWAYS loops with 0.000 seam error!
# PLUS during the Rhythmic Flourish (2.4-3.2 s, f=144..192), a dedicated extra-big pink & blue wave surge!

def wave_train_motion(t, period, phase_f, side, base_x, base_y, travel_dx, start_off, scale0, scale1, rot_amp):
    """Return (x, y, scale, rot_deg, opacity) for a continuously traveling periodic wave."""
    u = ((t - phase_f) % period) / float(period)  # 0.0 -> 1.0 smoothly per wave cycle!
    # Ease-out propagation: bursts briskly out of the headphone ear cup, then glides and dissipates!
    e = 1.0 - (1.0 - u) ** 1.65
    # Slight boost in travel distance during Full Groove (1.6-2.4s) & Flourish (2.4-3.2s)!
    boost = 1.0 + 0.22 * env(t, 96, 112, 180, 198)
    x = base_x + side * (start_off + travel_dx * boost * e)
    # Follow Pip's gentle vertical groove + tiny buoyant rise as the wave travels outward
    y = base_y + 0.35 * body_dy(t) - 10.0 * e + 4.5 * math.sin(2.0 * math.pi * u)
    sc = scale0 + (scale1 - scale0) * e
    rot = side * rot_amp * math.sin(math.pi * u)
    # Crisp fade-in right as wave emerges (u in 0..0.16), full vibrant hold (0.16..0.62), smooth fade-out (0.62..1.0)
    if u < 0.16:
        op = smooth(u / 0.16)
    elif u < 0.62:
        op = 1.0
    else:
        op = 1.0 - smoother((u - 0.62) / 0.38)
    return x, y, sc, rot, op


# Wave train specs: (layer_name, period, phase_f, side[-1=L/+1=R], start_off, travel_dx, sc0, sc1, rot_amp)
# Note: all phase_f are strictly away from 0/240 mod period so zero wave wraps sit on the loop seam!
WAVE_TRAINS = [
    # LEFT side (period 48 = 5 waves/4s, staggered by 16 frames!)
    ("wave_l_1", 48,  6.0, -1, -8.0,  68.0, 0.78, 1.18,  6.0),
    ("wave_l_2", 48, 22.0, -1, -24.0, 88.0, 0.72, 1.20, -5.0),
    ("wave_l_3", 48, 38.0, -1, -46.0, 104.0, 0.68, 1.18,  5.5),
    # Second inner-mid overlap on Left for rich layered audio energy (period 80 = 3 waves/4s!)
    ("wave_l_2", 80, 44.0, -1, -18.0, 96.0, 0.74, 1.24,  7.0),

    # RIGHT side (period 60 = 4 waves/4s, staggered by 20 frames — asymmetric 5:4 polyrhythm!)
    ("wave_r_1", 60, 10.0,  1, -8.0,  66.0, 0.78, 1.18,  6.0),
    ("wave_r_2", 60, 30.0,  1, -22.0, 86.0, 0.72, 1.20, -5.5),
    ("wave_r_3", 60, 50.0,  1, -44.0, 102.0, 0.68, 1.18,  5.0),
    # Second overlap on Right (period 80 = 3 waves/4s, offset from Left!)
    ("wave_r_2", 80, 14.0,  1, -18.0, 94.0, 0.74, 1.24, -6.5),
]

# Floating marker bubbles (using authentic dot_l_pink, dot_l_mint, dot_r_mint PNGs!)
# (layer_name, period, phase_f, side, travel_dx, drift_y, sc0, sc1)
BUBBLE_TRAINS = [
    ("dot_l_pink", 60,  6.0, -1, 78.0, -24.0, 0.60, 1.22),
    ("dot_l_mint", 80, 34.0, -1, 68.0,  20.0, 0.65, 1.25),
    ("dot_r_mint", 60, 24.0,  1, 76.0, -28.0, 0.62, 1.25),
    ("dot_l_pink", 80, 56.0,  1, 72.0,  26.0, 0.55, 1.15),  # reused on right side too for extra pink balance!
]


# ================================================================ 5. RML GENERATION HELPERS
_id = [6000]
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


def linear_keys(f, frames, fmt="{:.4f}", ind="                    ", hold_jumps=False, jump_thr=25.0):
    frames = prune_constant(f, frames)
    out = []
    for i, fr in enumerate(frames):
        v = f(fr)
        if i == len(frames) - 1:
            out.append(f'{ind}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}"/>')
        elif hold_jumps and abs(f(frames[i + 1]) - v) > jump_thr:
            out.append(f'{ind}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}" interpolationType="hold"/>')
        else:
            out.append(f'{ind}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}" interpolationType="linear"/>')
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


# ================================================================ 6. HAND-DRAWN MARKER WAVEFORMS, PULSE RINGS & SOUND MARKS
PINK = "FF2494"
COBALT = "0B55C6"
MINT = "A8EDD6"


def build_waveform_cluster(name, gx, gy, tilt_deg, bars_cfg, ind):
    """Emit a playful hand-drawn marker audio waveform cluster (slightly irregular rounded vertical bars
    with soft marker bleed strokes, pulsing at distinct periodic rhythms + big beat surges!).
    bars_cfg: [(dx, base_h, thick, col_core, col_bleed, freq1, freq2, phase, skew_x), ...]
    """
    grp_id = nid()
    out = [f'{ind}<Node x="{gx:.2f}" y="{gy:.2f}" rotation="{deg(tilt_deg):.5f}" name="{name}" id="{grp_id}">']
    for i, (dx, bh, th, col_c, col_b, f1, f2, ph, sk) in enumerate(bars_cfg):
        bid = nid()
        hh = bh * 0.5
        # Slightly imperfect hand-drawn curved vertical marker stroke (never robotic!)
        out.append(f'{ind}    <Node x="{dx:.2f}" y="0" name="Bar {i + 1}" id="{bid}">')
        out.append(f'{ind}        <Shape name="BarCore">')
        out.append(f'{ind}            <PointsPath isClosed="false" name="Path">')
        out.append(f'{ind}                <StraightVertex x="{-sk:.2f}" y="{-hh:.2f}"/>')
        out.append(f'{ind}                <StraightVertex x="{sk * 0.7:.2f}" y="0"/>')
        out.append(f'{ind}                <StraightVertex x="{-sk * 0.5:.2f}" y="{hh:.2f}"/>')
        out.append(f'{ind}            </PointsPath>')
        out.append(f'{ind}            <Stroke thickness="{th:.1f}" cap="round" join="round" name="Core"><SolidColor colorValue="F2{col_c}" name="C"/></Stroke>')
        out.append(f'{ind}            <Stroke thickness="{th + 5.0:.1f}" cap="round" join="round" name="Bleed"><SolidColor colorValue="45{col_b}" name="C"/></Stroke>')
        out.append(f'{ind}        </Shape>')
        out.append(f'{ind}    </Node>')

        def bar_sy(t, f1=f1, f2=f2, ph=ph):
            # Active, snappy rhythmic EQ expansion & contraction + extra surge on Full Groove & Flourish!
            wave = (0.50 * math.sin(f1 * W1 * t + ph)
                    + 0.30 * math.sin(f2 * W1 * t + 1.7 * ph)
                    + 0.22 * math.cos((f1 + 3) * W1 * t - ph))
            surge = (0.32 * beat_pulse(t, 9.0)
                     + 0.38 * bump(t, 120, 22, 1.0, 1.1)
                     + 0.45 * bump(t, 152, 26, 1.0, 1.1))
            return min(max(0.85 + 0.52 * wave + surge, 0.28), 1.85)

        def bar_sx(t, f1=f1, f2=f2, ph=ph):
            # Subtle marker squash-stretch when bars shoot tall
            return 1.0 / (bar_sy(t, f1, f2, ph) ** 0.14)

        track(bid, "scaleY", hermite_keys(bar_sy, EVERY2, "{:.4f}"))
        track(bid, "scaleX", hermite_keys(bar_sx, EVERY3, "{:.4f}"))
    out.append(f'{ind}</Node>')
    # Gentle floating rhythm on the cluster itself
    track(grp_id, "y", hermite_keys(lambda t: gy + 0.30 * body_dy(t) + 4.5 * math.sin(2 * W1 * t + (0.0 if gx > 500 else 1.8)), EVERY3, "{:.2f}"))
    return out


def build_pulse_rings_and_marks(ind):
    """Secondary hand-drawn circular pulse rings + short energetic marker sound ticks traveling outward."""
    out = []
    # (name, x0, y0, dx, dy, period, phase_f, size, thick, col, kind['ring'|'tick'])
    ITEMS = [
        # Circular marker pulse rings expanding outward on both sides!
        ("Ring_L1", 215, 340, -52, -32,  80, 12.0, 22, 4.5, PINK,   "ring"),
        ("Ring_L2", 200, 498, -58,  28, 120, 68.0, 26, 4.5, COBALT, "ring"),
        ("Ring_R1", 792, 290,  56, -34,  80, 42.0, 24, 4.5, COBALT, "ring"),
        ("Ring_R2", 806, 456,  54,  26, 120, 16.0, 22, 4.5, PINK,   "ring"),
        # Short hand-drawn marker sound marks / pops!
        ("Mark_L1", 232, 286, -42, -36,  60, 22.0, 18, 5.2, COBALT, "tick"),
        ("Mark_R1", 772, 492,  44,  34,  60, 46.0, 18, 5.2, PINK,   "tick"),
        ("Mark_TopL", 316, 250, -32, -38, 120, 146.0, 20, 5.0, PINK,   "tick"),  # Flourish burst!
        ("Mark_TopR", 708, 226,  36, -36, 120, 148.0, 20, 5.0, COBALT, "tick"),  # Flourish burst!
    ]
    for name, x0, y0, ddx, ddy, per, ph, sz, th, col, kind in ITEMS:
        iid = nid()
        out.append(f'{ind}<Node x="{x0:.2f}" y="{y0:.2f}" scaleX="0" scaleY="0" opacity="0" name="{name}" id="{iid}">')
        if kind == "ring":
            out.append(f'{ind}    <Shape name="S"><Ellipse width="{sz}" height="{sz * 0.88:.1f}" name="Path"/>'
                       f'<Stroke thickness="{th:.1f}" name="St"><SolidColor colorValue="EC{col}" name="C"/></Stroke></Shape>')
        else:
            ang = math.atan2(ddy, ddx)
            lx, ly = math.cos(ang) * sz, math.sin(ang) * sz
            out.append(f'{ind}    <Shape name="S"><PointsPath isClosed="false" name="Path">'
                       f'<StraightVertex x="0" y="0"/><StraightVertex x="{lx:.1f}" y="{ly:.1f}"/></PointsPath>'
                       f'<Stroke thickness="{th:.1f}" cap="round" name="St"><SolidColor colorValue="F0{col}" name="C"/></Stroke></Shape>')
        out.append(f'{ind}</Node>')

        def _u(t, per=per, ph=ph):
            return ((t - ph) % per) / float(per)

        def _x(t, x0=x0, ddx=ddx, per=per, ph=ph):
            e = 1.0 - (1.0 - _u(t, per, ph)) ** 1.7
            return x0 + ddx * e

        def _y(t, y0=y0, ddy=ddy, per=per, ph=ph):
            e = 1.0 - (1.0 - _u(t, per, ph)) ** 1.7
            return y0 + ddy * e + 0.25 * body_dy(t)

        def _sc(t, per=per, ph=ph):
            u = _u(t, per, ph)
            return 0.45 + 0.95 * (1.0 - (1.0 - u) ** 1.6)

        def _op(t, per=per, ph=ph):
            u = _u(t, per, ph)
            if u < 0.16:
                return smooth(u / 0.16)
            if u < 0.56:
                return 1.0
            return 1.0 - smoother((u - 0.56) / 0.44)

        # Sample carefully right around wrap points of `per` so resets happen cleanly while opacity == 0!
        wraps = []
        f = ph % per
        while f < L:
            wraps += [int(round(f - 1)) % L, int(round(f)) % L, int(round(f + 1)) % L]
            f += per
        frames = sorted(set(EVERY3 + wraps + [0, L]))
        track(iid, "x", linear_keys(_x, frames, "{:.2f}", hold_jumps=True, jump_thr=18.0))
        track(iid, "y", linear_keys(_y, frames, "{:.2f}", hold_jumps=True, jump_thr=18.0))
        track(iid, "scaleX", linear_keys(_sc, frames, "{:.4f}", hold_jumps=True, jump_thr=0.35))
        track(iid, "scaleY", linear_keys(_sc, frames, "{:.4f}", hold_jumps=True, jump_thr=0.35))
        track(iid, "opacity", linear_keys(_op, frames, "{:.4f}"))
    return out


# ================================================================ 7. SCENE GRAPH (FRONT-TO-BACK!)
ASSETS = {
    "body": "0:900",
    "eye_l": "0:901",
    "eye_r": "0:902",
    "smile": "0:903",
    "headband": "0:904",
    "ear_left": "0:905",
    "ear_right": "0:906",
    "wave_l_1": "0:907",
    "wave_l_2": "0:908",
    "wave_l_3": "0:909",
    "wave_r_1": "0:910",
    "wave_r_2": "0:911",
    "wave_r_3": "0:912",
    "dot_l_pink": "0:913",
    "dot_l_mint": "0:914",
    "dot_r_mint": "0:915",
}

EVERY2 = list(range(0, L + 1, 2))
EVERY3 = list(range(0, L + 1, 3))

ID_PIP_RIG = "0:2000"
ID_TORSO = "0:2001"
ID_HEAD = "0:2002"
ID_LOBES = ["0:2003", "0:2004", "0:2005", "0:2006"]
ID_HP_GRP = "0:2010"
ID_BAND = "0:2011"
ID_EAR_L = "0:2012"
ID_EAR_R = "0:2013"
ID_FACE = "0:2020"
ID_EYE_L = "0:2021"
ID_EYE_R = "0:2022"
ID_SMILE = "0:2023"

lines = [
    '<Rive version="1" kind="fragment">',
    f'    <Artboard defaultStateMachineId="0:3" styleId="0:4" width="{AW}" height="{AH}" name="Pip Soundweaver" id="0:1">',
    '        <LayoutComponentStyle name="Artboard Style" id="0:4"/>',
    '',
    '        <StateMachine name="Groove" id="0:3">',
    '            <StateMachineLayer name="Loop" id="0:5">',
    '                <AnyState x="0" y="-160"/>',
    '                <ExitState x="400" y="-160"/>',
    '                <EntryState x="0" y="0"><StateTransition stateToId="0:6"/></EntryState>',
    '                <AnimationState animationId="0:2" x="200" y="0" id="0:6"/>',
    '            </StateMachineLayer>',
    '        </StateMachine>',
    '',
]

# ---- 1. PIP SKELETON + HEADPHONES + FACE (declared BEFORE BodyMesh so Headphones & Face draw IN FRONT of Body!) ----
el_rel = sub(EYE_L0, HEAD_POS)
er_rel = sub(EYE_R0, HEAD_POS)
sm_rel = sub(SMILE0, HEAD_POS)
band_rel = sub(BAND_PIV, HEAD_POS)
earl_rel = sub(EAR_L_PIV, BAND_PIV)
earr_rel = sub(EAR_R_PIV, BAND_PIV)

lines += [
    f'        <Node x="{TORSO_ROOT[0]:.2f}" y="{TORSO_ROOT[1]:.2f}" name="Pip Rig" id="{ID_PIP_RIG}">',
    f'            <RootBone x="0" y="0" rotation="{-math.pi / 2:.7f}" length="125" name="Torso Bone" id="{ID_TORSO}">',
    f'                <Bone length="125" name="Head Bone" id="{ID_HEAD}">',
    # Counter-rotate +pi/2 so Headphones & Face operate in clean screen X/Y coordinates while riding HeadBone!
    f'                    <Node rotation="{math.pi / 2:.7f}" name="Head Level">',
    # 1a. Oversized Headphones (in front of face & body, with spring lag relative to HeadBone!)
    f'                        <Node x="{band_rel[0]:.2f}" y="{band_rel[1]:.2f}" name="Headphones" id="{ID_HP_GRP}">',
    f'                            <Node x="{earl_rel[0]:.2f}" y="{earl_rel[1]:.2f}" name="Ear Cup Left" id="{ID_EAR_L}">',
    image_tag("ear_left", EAR_L_PIV, "Ear Left", "                                "),
    '                            </Node>',
    f'                            <Node x="{earr_rel[0]:.2f}" y="{earr_rel[1]:.2f}" name="Ear Cup Right" id="{ID_EAR_R}">',
    image_tag("ear_right", EAR_R_PIV, "Ear Right", "                                "),
    '                            </Node>',
    f'                            <Node name="Headband" id="{ID_BAND}">',
    image_tag("headband", BAND_PIV, "Headband", "                                "),
    '                            </Node>',
    '                        </Node>',
    # 1b. Face (eyes + smile with 2.5D parallax & blinks)
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
]
# 4 downward sibling scallop lobe bones anchored inside PipRig so they ride Pip's bounce/sway AND ripple independently!
for k, lr in enumerate(LOBE_ROOTS):
    lrel = sub(lr, TORSO_ROOT)
    lines.append(
        f'            <RootBone x="{lrel[0]:.2f}" y="{lrel[1]:.2f}" rotation="{math.pi / 2:.7f}" length="140" '
        f'name="Scallop Lobe {k + 1}" id="{ID_LOBES[k]}"/>'
    )
lines.append('        </Node>')

# ---- 2. PIP BODY (6-bone skinned marker-outlined mesh!) ----
tendons = [
    (ID_TORSO, 0.0, -1.0,  1.0, 0.0, TORSO_ROOT[0], TORSO_ROOT[1], "Torso"),
    (ID_HEAD,  0.0, -1.0,  1.0, 0.0, HEAD_POS[0],   HEAD_POS[1],   "Head"),
] + [
    (ID_LOBES[k], 0.0, 1.0, -1.0, 0.0, LOBE_ROOTS[k][0], LOBE_ROOTS[k][1], f"Lobe{k + 1}")
    for k in range(4)
]
lines += mesh_image_lines("body", (0.0, 0.0), "Pip Body", "        ", MESH["body"], center("body"), tendons)

# ---- 3. TRAVELING HAND-DRAWN SOUND WAVES, BUBBLES, PULSE RINGS & WAVEFORMS (separate from body, behind ear cups!) ----
lines.append('        <Node name="Sound Waves" id="0:2100">')

# 3a. Dynamic hand-drawn marker audio waveforms near the headphones!
# Right-upper waveform (5 expressive irregular bars) + Left-lower companion waveform (4 bars)!
lines += build_waveform_cluster(
    "Waveform Right", 848.0, 214.0, 13.0,
    [
        # (dx, base_h, thick, core_col, bleed_col, f1, f2, phase, skew)
        (-36, 26, 9.5, PINK,   MINT,   4, 7, 0.2,  1.0),
        (-18, 44, 10.5, COBALT, PINK,  5, 8, 1.4, -0.8),
        (  0, 56, 11.0, PINK,   COBALT,4, 9, 2.5,  1.2),
        ( 18, 38, 10.0, MINT,   COBALT,6, 8, 3.8, -1.0),
        ( 35, 24, 9.0, COBALT, PINK,   5, 7, 5.0,  0.9),
    ],
    "            ",
)
lines += build_waveform_cluster(
    "Waveform Left", 196.0, 588.0, -14.0,
    [
        (-26, 22, 8.8, COBALT, PINK,   5, 8, 0.9, -0.9),
        ( -9, 40, 10.0, PINK,  MINT,   4, 7, 2.2,  1.0),
        (  9, 48, 10.5, COBALT,MINT,   6, 9, 3.6, -1.1),
        ( 26, 28, 9.2, PINK,   COBALT, 4, 8, 4.9,  0.8),
    ],
    "            ",
)

# 3b. Primary continuously expanding authentic hand-drawn marker wave arcs (5:4 polyrhythm!)
for idx, (wname, per, ph, side, st_off, trav_dx, sc0, sc1, rot_a) in enumerate(WAVE_TRAINS):
    wid = nid()
    wc = center(wname)
    lines.append(f'            <Node x="{wc[0]:.2f}" y="{wc[1]:.2f}" name="Wave_{idx + 1}_{wname}" id="{wid}">')
    lines.append(image_tag(wname, wc, wname, "                "))
    lines.append('            </Node>')

    wraps = []
    f = ph % per
    while f < L:
        wraps += [int(round(f - 1)) % L, int(round(f)) % L, int(round(f + 1)) % L]
        f += per
    wframes = sorted(set(EVERY2 + wraps + [0, L]))

    def _fn(k, wname=wname, per=per, ph=ph, side=side, wc=wc, trav_dx=trav_dx, st_off=st_off, sc0=sc0, sc1=sc1, rot_a=rot_a):
        return lambda t: wave_train_motion(t, per, ph, side, wc[0], wc[1], trav_dx, st_off, sc0, sc1, rot_a)[k]

    track(wid, "x", linear_keys(_fn(0), wframes, "{:.2f}", hold_jumps=True, jump_thr=25.0))
    track(wid, "y", linear_keys(_fn(1), wframes, "{:.2f}", hold_jumps=True, jump_thr=25.0))
    track(wid, "scaleX", linear_keys(_fn(2), wframes, "{:.4f}", hold_jumps=True, jump_thr=0.25))
    track(wid, "scaleY", linear_keys(_fn(2), wframes, "{:.4f}", hold_jumps=True, jump_thr=0.25))
    track(wid, "rotation", linear_keys(lambda t, f=_fn(3): deg(f(t)), wframes, "{:.5f}", hold_jumps=True, jump_thr=0.15))
    track(wid, "opacity", linear_keys(_fn(4), wframes, "{:.4f}"))

# 3c. Rhythmic Flourish BIG pink & blue sound-wave pulse (2.4-3.2 s, f=146..196)!
for wname, side in (("wave_l_3", -1), ("wave_r_3", 1)):
    fid = nid()
    wc = center(wname)
    lines.append(f'            <Node x="{wc[0]:.2f}" y="{wc[1]:.2f}" opacity="0" name="Flourish_{wname}" id="{fid}">')
    lines.append(image_tag(wname, wc, wname, "                "))
    lines.append('            </Node>')

    def _fu(t):
        if t < 146.0 or t > 196.0:
            return 0.0
        return (t - 146.0) / 50.0

    fframes = sorted(set([0, 144, 146] + list(range(146, 198, 2)) + [198, L]))
    track(fid, "x", linear_keys(lambda t, wc=wc, side=side: wc[0] + side * (-30.0 + 135.0 * (1.0 - (1.0 - _fu(t)) ** 1.65)), fframes, "{:.2f}"))
    track(fid, "y", linear_keys(lambda t, wc=wc: wc[1] + 0.3 * body_dy(t) - 18.0 * _fu(t), fframes, "{:.2f}"))
    track(fid, "scaleX", linear_keys(lambda t: 0.85 + 0.50 * (1.0 - (1.0 - _fu(t)) ** 1.5), fframes, "{:.4f}"))
    track(fid, "scaleY", linear_keys(lambda t: 0.85 + 0.50 * (1.0 - (1.0 - _fu(t)) ** 1.5), fframes, "{:.4f}"))
    track(fid, "opacity", linear_keys(lambda t: (smooth(_fu(t) / 0.14) if _fu(t) < 0.14 else (1.0 - smoother((_fu(t) - 0.50) / 0.50) if _fu(t) > 0.50 else 1.0)) if 146.0 <= t <= 196.0 else 0.0, fframes, "{:.4f}"))

# 3d. Authentic hand-drawn floating marker bubbles!
for idx, (bname, per, ph, side, trav_dx, drift_y, sc0, sc1) in enumerate(BUBBLE_TRAINS):
    bid = nid()
    bc = center(bname)
    # If reusing dot_l_pink on the right side, anchor it near the right waves!
    bx0 = 786.0 if (side == 1 and bname == "dot_l_pink") else bc[0]
    by0 = 468.0 if (side == 1 and bname == "dot_l_pink") else bc[1]
    lines.append(f'            <Node x="{bx0:.2f}" y="{by0:.2f}" name="Bubble_{idx + 1}_{bname}" id="{bid}">')
    lines.append(image_tag(bname, bc, bname, "                "))
    lines.append('            </Node>')

    wraps = []
    f = ph % per
    while f < L:
        wraps += [int(round(f - 1)) % L, int(round(f)) % L, int(round(f + 1)) % L]
        f += per
    bframes = sorted(set(EVERY3 + wraps + [0, L]))

    def _bu(t, per=per, ph=ph):
        return ((t - ph) % per) / float(per)

    track(bid, "x", linear_keys(lambda t, bx0=bx0, side=side, trav_dx=trav_dx, per=per, ph=ph: bx0 + side * (-18.0 + trav_dx * (1.0 - (1.0 - _bu(t, per, ph)) ** 1.6)), bframes, "{:.2f}", hold_jumps=True, jump_thr=22.0))
    track(bid, "y", linear_keys(lambda t, by0=by0, drift_y=drift_y, per=per, ph=ph: by0 + drift_y * _bu(t, per, ph) + 10.0 * math.sin(2.0 * math.pi * _bu(t, per, ph)) + 0.25 * body_dy(t), bframes, "{:.2f}", hold_jumps=True, jump_thr=22.0))
    track(bid, "scaleX", linear_keys(lambda t, sc0=sc0, sc1=sc1, per=per, ph=ph: sc0 + (sc1 - sc0) * _bu(t, per, ph), bframes, "{:.4f}", hold_jumps=True, jump_thr=0.25))
    track(bid, "scaleY", linear_keys(lambda t, sc0=sc0, sc1=sc1, per=per, ph=ph: sc0 + (sc1 - sc0) * _bu(t, per, ph), bframes, "{:.4f}", hold_jumps=True, jump_thr=0.25))
    track(bid, "opacity", linear_keys(lambda t, per=per, ph=ph: smooth(_bu(t, per, ph) / 0.18) if _bu(t, per, ph) < 0.18 else (1.0 - smoother((_bu(t, per, ph) - 0.58) / 0.42) if _bu(t, per, ph) > 0.58 else 1.0), bframes, "{:.4f}"))

# 3e. Secondary circular pulse rings & short hand-drawn sound marks!
lines += build_pulse_rings_and_marks("            ")
lines.append('        </Node>')


# ================================================================ 8. KEYFRAME PIP BODY, SCALLOPS, HEADPHONES & FACE
track(ID_PIP_RIG, "x", hermite_keys(lambda t: TORSO_ROOT[0] + body_dx(t), EVERY2, "{:.2f}"))
track(ID_PIP_RIG, "y", hermite_keys(lambda t: TORSO_ROOT[1] + body_dy(t), EVERY2, "{:.2f}"))
track(ID_PIP_RIG, "rotation", hermite_keys(lambda t: deg(body_rot_deg(t)), EVERY2, "{:.5f}"))
track(ID_PIP_RIG, "scaleX", hermite_keys(body_scale_x, EVERY2, "{:.4f}"))
track(ID_PIP_RIG, "scaleY", hermite_keys(body_scale_y, EVERY2, "{:.4f}"))

track(ID_HEAD, "rotation", hermite_keys(lambda t: deg(head_rot_deg(t)), EVERY2, "{:.5f}"))

for k in range(4):
    track(ID_LOBES[k], "rotation", hermite_keys(lambda t, f=lobe_rots[k]: math.pi / 2.0 + deg(f(t)), EVERY2, "{:.5f}"))
    track(ID_LOBES[k], "scaleX", hermite_keys(lobe_scales[k], EVERY3, "{:.4f}"))

# Oversized Headphones (overlapping spring lag + bass bounce!)
track(ID_HP_GRP, "y", hermite_keys(lambda t: band_rel[1] + hp_lag_y(t), EVERY2, "{:.2f}"))
track(ID_HP_GRP, "rotation", hermite_keys(lambda t: deg(hp_lag_rot(t)), EVERY2, "{:.5f}"))
track(ID_BAND, "scaleX", hermite_keys(lambda t: 1.0 + hp_flex_sx(t), EVERY2, "{:.4f}"))
track(ID_BAND, "scaleY", hermite_keys(lambda t: 1.0 - 0.75 * hp_flex_sx(t), EVERY2, "{:.4f}"))

track(ID_EAR_L, "rotation", hermite_keys(lambda t: deg(ear_l_rot(t)), EVERY2, "{:.5f}"))
track(ID_EAR_L, "scaleX", hermite_keys(ear_l_scale, EVERY2, "{:.4f}"))
track(ID_EAR_L, "scaleY", hermite_keys(ear_l_scale, EVERY2, "{:.4f}"))

track(ID_EAR_R, "rotation", hermite_keys(lambda t: deg(ear_r_rot(t)), EVERY2, "{:.5f}"))
track(ID_EAR_R, "scaleX", hermite_keys(ear_r_scale, EVERY2, "{:.4f}"))
track(ID_EAR_R, "scaleY", hermite_keys(ear_r_scale, EVERY2, "{:.4f}"))

# Face
track(ID_FACE, "x", hermite_keys(face_dx, EVERY2, "{:.2f}"))
track(ID_FACE, "y", hermite_keys(face_dy, EVERY2, "{:.2f}"))
EYE_FRAMES = sorted(set(EVERY3 + list(range(65, 75)) + list(range(203, 213)) + list(range(120, 140)) + list(range(152, 178))))
track(ID_EYE_L, "scaleY", linear_keys(eye_scale_y, EYE_FRAMES, "{:.4f}"))
track(ID_EYE_R, "scaleY", linear_keys(eye_scale_y, EYE_FRAMES, "{:.4f}"))
track(ID_EYE_L, "scaleX", linear_keys(eye_scale_x, EYE_FRAMES, "{:.4f}"))
track(ID_EYE_R, "scaleX", linear_keys(eye_scale_x, EYE_FRAMES, "{:.4f}"))
track(ID_SMILE, "scaleX", hermite_keys(smile_scale_x, EVERY2, "{:.4f}"))
track(ID_SMILE, "scaleY", hermite_keys(smile_scale_y, EVERY2, "{:.4f}"))

# ---- Emit LinearAnimation ----
lines.append('')
lines.append(f'        <LinearAnimation fps="{FPS}" duration="{L}" loopValue="loop" name="Groove Loop" id="0:2">')
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
    f"  body dx={min(body_dx(t) for t in range(L)):.1f}..{max(body_dx(t) for t in range(L)):.1f}, "
    f"dy={min(body_dy(t) for t in range(L)):.1f}..{max(body_dy(t) for t in range(L)):.1f}, "
    f"rot={min(body_rot_deg(t) for t in range(L)):.1f}..{max(body_rot_deg(t) for t in range(L)):.1f} deg\n"
    f"  head rot={min(head_rot_deg(t) for t in range(L)):.1f}..{max(head_rot_deg(t) for t in range(L)):.1f} deg, "
    f"hp lag y={min(hp_lag_y(t) for t in range(L)):.1f}..{max(hp_lag_y(t) for t in range(L)):.1f} px"
)

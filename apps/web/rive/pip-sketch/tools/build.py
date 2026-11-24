"""Generate the Rive scene (`scene.rml`) for Pip — The Idea Machine (4.0 s seamless infinite loop).

usage: python3 tools/build.py

4.0 s seamless loop (240 frames at 60 fps):
- 3-bone skinned mesh on Pip's body (BodyRoot -> Head -> Crown with spring follow-through)
- 2-bone skinned mesh on the left sketchbook page (PageSpine -> PageTip) for organic page flutter
- Independent layers for eyes + smile (2.5D head-turn parallax, pencil eye-tracking, blinks, expressions),
  free left paw, right drawing arm (exact shoulder-to-paw kinematic tracking), drawing paw, orange pencil
  (pivoted at tip so tip stays glued to the moving page), soft cast shadow, bookmark ribbon, and ghost tail.
- Arc-length-parameterized painterly multi-layer orange strokes synchronized 1:1 with the pencil tip,
  including the iconic original orange swirl + dot, rapid scribbling bursts, restrained pop-up doodles,
  and subtle hand-drawn orange sparkles.
- Mathematically seamless loop: periodic splines + multi-lap periodic springs + staggered stroke lifecycles.
"""
import base64, json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LAY = json.load(open(os.path.join(HERE, "layers.json")))
MESH = json.load(open(os.path.join(HERE, "meshes.json")))
OUT = os.path.join(ROOT, "scene.rml")

FPS, L = 60, 240
AW, AH = LAY["size"]  # 1032 x 928
PTS = LAY["points"]
TIP0 = tuple(PTS["tip"])                # (602, 583)
PAW0 = tuple(PTS["paw"])                # (715, 440)
SHOULDER0 = tuple(PTS["shoulder_r"])    # (632, 448)
LARM0 = tuple(PTS["arm_left_pivot"])    # (416, 480)
TAIL0 = tuple(PTS["tail_pivot"])        # (282, 586)
BM0 = tuple(PTS["bookmark_pivot"])      # (318, 696)
BOOK0 = tuple(PTS["book_pivot"])        # (520, 665)
EYE_L0 = tuple(PTS["eye_l"])
EYE_R0 = tuple(PTS["eye_r"])
SMILE0 = tuple(PTS["smile"])
BODY_ROOT = (482.0, 535.0)
HEAD_BONE_POS = (482.0, 405.0)
CROWN_BONE_POS = (482.0, 270.0)
PAGE_ROOT = (536.0, 635.0)
PAGE_ANG = math.atan2(-40.0, -210.0)
PAGE_LEN = 115.0
PAGE_TIP = (PAGE_ROOT[0] + PAGE_LEN * math.cos(PAGE_ANG), PAGE_ROOT[1] + PAGE_LEN * math.sin(PAGE_ANG))

deg = math.radians


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


def periodic_dist(t, center_f):
    """Signed shortest distance from center_f to t on the periodic [0, L) circle."""
    d = (t - center_f) % L
    if d > L * 0.5:
        d -= L
    return d


def bump(t, f0, dur, amp=1.0, p=1.0):
    """Smooth C1 pulse starting at f0 of length dur (wraps cleanly mod L)."""
    u = ((t - f0) % L) / dur
    if u <= 0.0 or u >= 1.0:
        return 0.0
    return amp * (math.sin(math.pi * u) ** p)


def env(t, f_in0, f_in1, f_out0, f_out1):
    """Smooth trapezoidal envelope in [0, 1] wrapping cleanly mod L."""
    t = t % L
    def in_range(a, b):
        if a <= b:
            return a <= t <= b
        return t >= a or t <= b
    def frac(a, b):
        span = (b - a) % L
        return ((t - a) % L) / max(span, 1e-6)
    if in_range(f_in0, f_in1):
        return smoother(frac(f_in0, f_in1))
    if in_range(f_in1, f_out0):
        return 1.0
    if in_range(f_out0, f_out1):
        return 1.0 - smoother(frac(f_out0, f_out1))
    return 0.0


def periodic(keys):
    """Periodic Catmull-Rom spline over [0, L)."""
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
    """Simulate a damped spring driven by periodic `force(t)` until strictly periodic.
    Normalized so DC gain = 1.0 when peak is None (i.e. a constant force C settles to x = C * gain)."""
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


# ================================================================ 1. ARC-LENGTH STROKES
def catmull_samples(pts, per_seg=14, closed=False):
    """Smooth dense Catmull-Rom curve through `pts`."""
    P = list(pts)
    if closed:
        P = [P[-1]] + P + [P[0], P[1]]
        n_seg = len(pts)
    else:
        # Extrapolate smooth virtual end points
        p_pre = (2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1])
        p_post = (2 * P[-1][0] - P[-2][0], 2 * P[-1][1] - P[-2][1])
        P = [p_pre] + P + [p_post]
        n_seg = len(pts) - 1
    out = []
    for i in range(n_seg):
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        steps = per_seg + (1 if i == n_seg - 1 else 0)
        for k in range(steps):
            t = k / per_seg
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    return out


class StrokeCurve:
    """Arc-length-parameterized polyline used identically for Rive PointsPath AND pencil tip tracking."""
    def __init__(self, name, ctrl_pts, f0, f1, fade0, fade1, thick=6.0, closed=False,
                 per_seg=10, ease="snappy", pop=None):
        self.name = name
        self.pts = catmull_samples(ctrl_pts, per_seg=per_seg, closed=closed)
        self.f0, self.f1 = f0, f1
        self.fade0, self.fade1 = fade0, fade1
        self.thick = thick
        self.ease = ease
        self.pop = pop  # None or (pop_f0, pop_dur, pop_dy, pop_scale)
        s = [0.0]
        for a, b in zip(self.pts[:-1], self.pts[1:]):
            s.append(s[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        self.total = s[-1]
        self.s = [v / max(self.total, 1e-6) for v in s]

    def at(self, u):
        u = min(max(u, 0.0), 1.0)
        lo, hi = 0, len(self.s) - 1
        while lo + 1 < hi:
            mid = (lo + hi) // 2
            if self.s[mid] <= u:
                lo = mid
            else:
                hi = mid
        span = max(self.s[hi] - self.s[lo], 1e-9)
        f = (u - self.s[lo]) / span
        a, b = self.pts[lo], self.pts[hi]
        return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)

    def progress(self, t):
        """Non-linear drawing speed with lively acceleration & deceleration."""
        u = (t - self.f0) / max(self.f1 - self.f0, 1e-6)
        u = min(max(u, 0.0), 1.0)
        if self.ease == "flourish":
            # Slow dramatic launch -> rapid exhilarating sweep -> smooth settle
            return u * u * (3.0 - 2.0 * u) * 0.65 + (0.5 - 0.5 * math.cos(math.pi * u)) * 0.35
        if self.ease == "burst":
            # Zippy energetic pace with slight mid-stroke surge
            return smooth(u) * 0.75 + u * 0.25 + 0.03 * math.sin(2.0 * math.pi * u)
        return smooth(u) * 0.8 + u * 0.2

    def trim_end(self, t):
        """TrimPath end ∈ [0, 1] across the full periodic loop."""
        t = t % L
        # Active window from f0 -> fade1 (possibly wrapping mod L)
        if self.f0 <= t <= self.f1:
            return self.progress(t)
        # Check if t is between f1 and fade1 (mod L)
        after_draw = (t - self.f1) % L
        hold_to_fade_end = (self.fade1 - self.f1) % L
        if after_draw <= hold_to_fade_end + 3:
            return 1.0
        return 0.0

    def opacity(self, t):
        t = t % L
        # Turn on crisply right at f0, stay at 1.0 until fade0, fade smoothly fade0 -> fade1
        since_start = (t - self.f0) % L
        life_until_fade0 = (self.fade0 - self.f0) % L
        fade_len = (self.fade1 - self.fade0) % L
        if since_start < 1.0:
            return smooth(since_start / 1.0)
        if since_start <= life_until_fade0:
            return 1.0
        if since_start <= life_until_fade0 + fade_len:
            return 1.0 - smoother((since_start - life_until_fade0) / max(fade_len, 1e-6))
        return 0.0

    def centroid(self):
        return (sum(p[0] for p in self.pts) / len(self.pts),
                sum(p[1] for p in self.pts) / len(self.pts))


# All coordinates strictly inside the right sketchbook page:
# Top-left (512,570), Top-right (660,545), Bot-right (755,658), Bot-left (610,692)
STROKES = [
    # ACT 1 (0.0–0.8s, f=2..45): Rapid initial scribbling on upper-left of right page
    StrokeCurve(
        "A1_Scribble",
        [(546, 588), (576, 574), (556, 598), (594, 578), (570, 608), (608, 590)],
        f0=2, f1=22, fade0=100, fade1=142, thick=5.2, per_seg=6, ease="burst",
    ),
    StrokeCurve(
        "A2_MiniSwirl",
        [(554, 616), (578, 628), (608, 620), (602, 606), (586, 610), (592, 618)],
        f0=26, f1=45, fade0=106, fade1=146, thick=5.0, per_seg=8, ease="snappy",
    ),

    # ACT 3 (1.15–2.25s, f=70..128): Excited burst of faster drawing + popping star doodle!
    StrokeCurve(
        "B1_FastBurst",
        [(612, 568), (646, 554), (624, 582), (668, 558), (642, 594), (684, 574), (666, 598)],
        f0=70, f1=96, fade0=164, fade1=198, thick=5.2, per_seg=6, ease="burst",
    ),
    # Continuous hand-drawn 4-point star doodle positioned in clear upper-right page view; pops gently upward!
    StrokeCurve(
        "B2_StarDoodle",
        [(696, 572), (703, 587), (719, 594), (703, 601), (696, 616), (689, 601), (673, 594), (689, 587), (696, 572)],
        f0=101, f1=128, fade0=166, fade1=200, thick=5.0, per_seg=5, ease="snappy",
        pop=(128, 44, -28.0, 1.20),
    ),

    # ACT 4 (2.25–3.15s, f=136..182): LARGE CIRCULAR FLOURISH — THE ICONIC ORIGINAL SWIRL + DOT!
    # Exact coordinates traced from build/z/doodle.png! Persists across f=240 -> f=0!
    StrokeCurve(
        "C1_IconicSwirl",
        [(680, 642), (671, 633), (677, 624), (692, 624), (703, 636),
         (696, 653), (674, 666), (646, 667), (624, 654), (621, 636),
         (636, 619), (634, 608), (626, 604)],
        f0=136, f1=170, fade0=26, fade1=72, thick=6.4, per_seg=9, ease="flourish",
        pop=(181, 38, -18.0, 1.10),
    ),
    StrokeCurve(
        "C2_IconicDot",
        [(614, 592), (620, 595), (619, 601), (612, 602), (609, 597), (614, 592)],
        f0=174, f1=182, fade0=26, fade1=72, thick=5.4, per_seg=5, ease="snappy",
        pop=(181, 38, -18.0, 1.10),
    ),

    # ACT 5 (3.15–4.0s, f=192..236): Quick energetic finishing strokes returning naturally to A1!
    StrokeCurve(
        "D1_FinishArc",
        [(574, 644), (588, 658), (608, 666)],
        f0=192, f1=204, fade0=14, fade1=54, thick=4.8, per_seg=7, ease="snappy",
    ),
    StrokeCurve(
        "D2_FinishTick",
        [(552, 626), (576, 634), (562, 648)],
        f0=208, f1=219, fade0=14, fade1=54, thick=4.6, per_seg=6, ease="burst",
    ),
    StrokeCurve(
        "D3_ReturnFlourish",
        [(542, 608), (564, 598), (546, 588)],
        f0=223, f1=236, fade0=14, fade1=54, thick=4.6, per_seg=6, ease="snappy",
    ),
]


# ================================================================ 2. PENCIL TIP TRAJECTORY (PAGE SPACE)
def _build_pencil_page_path():
    """Return (tip_page_x(t), tip_page_y(t), lift(t), active_draw(t)) over [0, L)."""
    # Build per-frame values at 1-frame resolution for crisp transitions, then periodic spline!
    px = [0.0] * L
    py = [0.0] * L
    lift = [0.0] * L
    drawing = [0.0] * L

    # Map each stroke interval and each inter-stroke transition (including wrap D3 -> A1!)
    intervals = []
    for i, st in enumerate(STROKES):
        intervals.append(("draw", st.f0, st.f1, st))
        nxt = STROKES[(i + 1) % len(STROKES)]
        f_a = st.f1
        f_b = nxt.f0 if i + 1 < len(STROKES) else nxt.f0 + L
        intervals.append(("hop", f_a, f_b, (st, nxt)))

    for fr in range(L):
        t = float(fr)
        placed = False
        for kind, a, b, data in intervals:
            if kind == "draw" and a <= t <= b:
                u = data.progress(t)
                x, y = data.at(u)
                px[fr], py[fr], lift[fr], drawing[fr] = x, y, 0.0, 1.0
                placed = True
                break
        if placed:
            continue
        # Must be inside a hop/lift transition
        for kind, a, b, data in intervals:
            if kind != "hop":
                continue
            tt = t + L if (b > L and t < a and t + L <= b) else t
            if a <= tt <= b:
                st0, st1 = data
                p0 = st0.at(1.0)
                p1 = st1.at(0.0)
                span = b - a
                s = (tt - a) / max(span, 1e-6)
                # Special thinking pause between A2 (f=45) and B1 (f=70)!
                if st0.name == "A2_MiniSwirl":
                    # Pull pencil slightly up and slightly back toward Pip like an artist pausing to ponder, then swoop!
                    u = smoother(s)
                    wiggle_x = 4.0 * math.sin(2.0 * math.pi * s) * math.sin(math.pi * s)
                    wiggle_y = -4.0 * math.sin(3.0 * math.pi * s) * math.sin(math.pi * s)
                    px[fr] = p0[0] + (p1[0] - p0[0]) * u - 6.0 * math.sin(math.pi * s) + wiggle_x
                    py[fr] = p0[1] + (p1[1] - p0[1]) * u + wiggle_y
                    # Distinct expressive thinking lift peaking at ~38 px!
                    lift[fr] = 38.0 * (math.sin(math.pi * s) ** 0.78)
                elif st0.name == "C2_IconicDot":
                    # Brief joyful bounce-lift after tapping the dot before finishing strokes!
                    u = smoother(s)
                    px[fr] = p0[0] + (p1[0] - p0[0]) * u
                    py[fr] = p0[1] + (p1[1] - p0[1]) * u
                    lift[fr] = 24.0 * (math.sin(math.pi * s) ** 1.1)
                elif st0.name == "B2_StarDoodle":
                    # Sweeping reposition lift into the iconic swirl!
                    u = smoother(s)
                    px[fr] = p0[0] + (p1[0] - p0[0]) * u
                    py[fr] = p0[1] + (p1[1] - p0[1]) * u
                    lift[fr] = 20.0 * (math.sin(math.pi * s) ** 1.1)
                elif st0.name == "D3_ReturnFlourish":
                    # Ultra-tight, nearly continuous wrap into A1 (barely lifts 4 px!)
                    u = smooth(s)
                    px[fr] = p0[0] + (p1[0] - p0[0]) * u
                    py[fr] = p0[1] + (p1[1] - p0[1]) * u
                    lift[fr] = 4.0 * math.sin(math.pi * s)
                else:
                    # Quick crisp hop between sub-strokes
                    u = smooth(s)
                    px[fr] = p0[0] + (p1[0] - p0[0]) * u
                    py[fr] = p0[1] + (p1[1] - p0[1]) * u
                    lift[fr] = (10.0 if span <= 5 else 15.0) * (math.sin(math.pi * s) ** 1.1)
                drawing[fr] = 0.0
                placed = True
                break
        assert placed, f"Unassigned frame {fr}"

    return sampled(px), sampled(py), sampled(lift), sampled(drawing)


tip_pg_x, tip_pg_y, pen_lift, is_drawing = _build_pencil_page_path()

# ================================================================ 3. NOTEBOOK, PAGE & BOOKMARK MOTION
# The notebook bounces & rocks gently in direct reaction to Pip's scribble energy and flourish bounce!
def draw_energy(t):
    """Instantaneous pencil speed on the page (px/frame)."""
    return math.hypot(D(tip_pg_x, t), D(tip_pg_y, t)) * is_drawing(t)

# Book vertical bounce: reacts to scribbling beats + celebration bounce after C2 dot (f=182)
def book_dy_raw(t):
    w = 2.0 * math.pi / L
    base = 2.2 * math.sin(4 * w * t + 0.4) + 1.5 * math.sin(7 * w * t)
    # Energetic micro-jolt during Act 1 & Act 3 rapid scribbling
    scrib = (3.4 * math.sin(14 * w * t) * env(t, 0, 6, 42, 48)
             + 4.5 * math.sin(18 * w * t + 0.5) * env(t, 68, 74, 124, 132))
    # Press down on the iconic dot boop (f=174..183), then joyful springy lift!
    boop = 6.5 * bump(t, 174, 10, 1.0, 1.4) - 9.0 * bump(t, 183, 18, 1.0, 1.2) + 3.5 * bump(t, 198, 14, 1.0, 1.3)
    return base + scrib + boop

def book_rot_deg_raw(t):
    # Subtle tilt toward the side Pip is pressing on + lively micro-rock!
    press = (tip_pg_x(t) - 625.0) * 0.025 * is_drawing(t)
    w = 2.0 * math.pi / L
    rock = 1.3 * math.sin(5 * w * t) + 1.8 * math.sin(13 * w * t) * env(t, 68, 74, 128, 134)
    boop_tilt = 2.6 * bump(t, 174, 12, 1.0, 1.3) - 3.2 * bump(t, 184, 20, 1.0, 1.2)
    return press + rock + boop_tilt

book_dy = spring(book_dy_raw, hz=5.5, zeta=0.40, gain=1.0)
book_dx = spring(lambda t: (tip_pg_x(t) - 620.0) * 0.055 * is_drawing(t), hz=5.0, zeta=0.50, gain=1.0)
book_rot_deg = spring(book_rot_deg_raw, hz=5.2, zeta=0.38, gain=1.0)


def book_to_world(px, py, t):
    """Map a point authored in reference coordinates on the sketchbook to artboard world coordinates at frame t."""
    loc = (px - BOOK0[0], py - BOOK0[1])
    r = rot2(loc, deg(book_rot_deg(t)))
    return (BOOK0[0] + book_dx(t) + r[0], BOOK0[1] + book_dy(t) + r[1])


# Left page flutter (PageRootBone & PageTipBone rotations in degrees)
def page_flutter_force(t):
    w = 2.0 * math.pi / L
    # Continuous subtle breeze/vibration + distinct lively flutter during Act 3 burst & Act 4 flourish completion!
    gentle = 1.8 * math.sin(3 * w * t + 0.8) + 1.3 * math.sin(6 * w * t)
    burst_flut = (5.5 * math.sin(14 * w * t) + 3.2 * math.sin(22 * w * t)) * env(t, 76, 86, 122, 134)
    flourish_flut = (7.5 * math.sin(12 * w * (t - 176))) * env(t, 176, 182, 206, 222)
    return gentle + burst_flut + flourish_flut

page_root_deg = spring(page_flutter_force, hz=3.6, zeta=0.28, peak=5.6)
page_tip_deg = spring(lambda t: page_flutter_force(t) + 1.8 * D(page_root_deg, t), hz=4.4, zeta=0.22, peak=9.5)

# Bookmark ribbon spring reacting to book vertical acceleration + horizontal jolt
bm_rot_deg = spring(lambda t: -16.0 * D2(book_dy, t) - 10.0 * D2(book_dx, t) + 1.5 * math.sin(4 * math.pi * t / L),
                    hz=2.5, zeta=0.20, peak=14.0)


# ================================================================ 4. BODY, HEAD, CROWN, FACE, ARMS & TAIL
# Make Pip unmistakably energetic, bouncy, expressive, and full of creative joy!
W1 = 2.0 * math.pi / L

# Horizontal body wiggle: tracks pencil roughly + lively rhythmic side-to-side wiggles!
def body_dx_fn(t):
    follow = (tip_pg_x(t) - 615.0) * 0.16
    wiggle = (11.5 * math.sin(4 * W1 * t + 0.3)
              + 8.0 * math.sin(9 * W1 * t) * env(t, 0, 5, 44, 48)
              + 10.5 * math.sin(12 * W1 * t + 0.8) * env(t, 68, 74, 128, 134)
              + 11.5 * math.sin(6 * W1 * t) * env(t, 134, 140, 182, 192))
    # Pull slightly left during curious thinking tilt, lean right-in toward book during intense Act 3 burst!
    think_shift = -7.0 * bump(t, 47, 22, 1.0, 1.05)
    lean_in = 14.0 * env(t, 70, 82, 122, 134) + 9.0 * env(t, 138, 150, 174, 184)
    return follow + wiggle + think_shift + lean_in

# Vertical body bounce: constant joyful energy + leaning down toward book + big happy bounce after flourish!
def body_dy_fn(t):
    # Continuous lively rhythmic bounce (approx 2–3 bounces/sec!)
    bounce = -10.5 * abs(math.sin(5 * W1 * t + 0.2)) + 5.0
    # Rapid energetic nods/bounces during Act 1 & Act 3 scribbling
    scrib_hop = (-7.5 * abs(math.sin(10 * W1 * t)) * env(t, 0, 4, 43, 48)
                 - 9.5 * abs(math.sin(13 * W1 * t)) * env(t, 70, 76, 125, 132))
    # Lean closer to the notebook during Act 3 burst and Act 4 big flourish!
    lean_down = 15.5 * env(t, 70, 80, 122, 134) + 10.0 * env(t, 138, 148, 174, 180)
    # Curious upright perk during thinking lift (f=48..68)
    think_up = -14.5 * bump(t, 48, 20, 1.0, 1.05)
    # Big excited celebration bounce right after completing the iconic swirl + dot (f=173..216)!
    antic = 11.5 * bump(t, 173, 10, 1.0, 1.4)
    jump = -26.5 * bump(t, 181, 18, 1.0, 1.08)
    rebound = 6.5 * bump(t, 197, 12, 1.0, 1.4) - 7.5 * bump(t, 206, 12, 1.0, 1.3)
    return bounce + scrib_hop + lean_down + think_up + antic + jump + rebound

body_dx = sampled([body_dx_fn(fr) for fr in range(L)])
body_dy = sampled([body_dy_fn(fr) for fr in range(L)])

# Lower-body sway rotation (degrees, + = clockwise = leaning toward the right page!)
def body_rot_deg_fn(t):
    wiggle = (5.0 * math.sin(4 * W1 * t + 0.5)
              + 4.4 * math.sin(10 * W1 * t) * env(t, 0, 5, 44, 48)
              + 5.8 * math.sin(12 * W1 * t + 0.4) * env(t, 68, 75, 126, 134))
    think_lean = -6.8 * bump(t, 48, 21, 1.0, 1.05)
    lean_in = 6.8 * env(t, 70, 82, 122, 134) + 5.2 * env(t, 138, 148, 174, 182)
    flourish_sway = 6.2 * math.sin(2 * math.pi * ((t - 136) % L) / 38.0) * env(t, 136, 142, 172, 180)
    return wiggle + think_lean + lean_in + flourish_sway

body_rot_deg = sampled([body_rot_deg_fn(fr) for fr in range(L)])

# Squash & stretch on body (driven by vertical acceleration + explicit anticipation/pop punches!)
squash_spring = spring(lambda t: -D2(body_dy, t), hz=3.8, zeta=0.28, peak=0.075)
def body_scale_y(t):
    s = (1.0 + squash_spring(t)
         - 0.08 * bump(t, 173, 10, 1.0, 1.4)
         + 0.105 * bump(t, 181, 16, 1.0, 1.12)
         + 0.045 * bump(t, 49, 18, 1.0, 1.15)
         - 0.042 * env(t, 74, 82, 122, 132))
    return min(max(s, 0.87), 1.13)

def body_scale_x(t):
    return 1.0 / math.sqrt(body_scale_y(t))

# Independent HEAD tilt & excited nods (HeadBone local rotation in degrees!)
def head_rot_deg_fn(t):
    nod_wiggle = (6.0 * math.sin(5 * W1 * t + 0.9)
                  + 6.5 * math.sin(11 * W1 * t) * env(t, 0, 5, 44, 48)
                  + 8.2 * math.sin(14 * W1 * t + 0.3) * env(t, 70, 76, 126, 132))
    # SIGNATURE PERSONALITY MOMENT: Curious head tilt to the left during thinking pause (0.8–1.15s)!
    curious_tilt = -17.5 * bump(t, 48, 18, 1.0, 0.92)
    # Snappy "AHA!" forward excited nod right as Pip gets the idea (f=63..74)!
    aha_nod = 11.5 * bump(t, 63, 12, 1.0, 1.25)
    # Expressive circular sweep follow during Act 4 big flourish!
    swirl_tilt = -8.5 * bump(t, 136, 18, 1.0, 1.2) + 12.0 * bump(t, 152, 22, 1.0, 1.2)
    # Happy celebratory double-wiggle tilt on flourish completion!
    happy = -10.5 * bump(t, 181, 13, 1.0, 1.18) + 9.5 * bump(t, 192, 13, 1.0, 1.18)
    return nod_wiggle + curious_tilt + aha_nod + swirl_tilt + happy

head_rot_deg = sampled([head_rot_deg_fn(fr) for fr in range(L)])

# Plush crown follow-through spring (CrownBone local rotation in degrees)
crown_rot_deg = spring(
    lambda t: -1.4 * D2(head_rot_deg, t) - 0.8 * D2(body_rot_deg, t) - 0.35 * D2(body_dx, t),
    hz=3.1, zeta=0.24, peak=11.0,
)

# 2.5D Face parallax + active eye tracking + blinks + smile expressiveness!
def face_dx(t):
    # Shifts right when leaning/looking toward right page, slightly left during curious tilt!
    look_pen = (tip_pg_x(t) - 610.0) * 0.085
    tilt_par = (head_rot_deg(t) + body_rot_deg(t)) * 0.42
    think_glance = -7.0 * bump(t, 50, 15, 1.0, 1.1)
    return min(max(look_pen + tilt_par + think_glance, -13.0), 15.0)

def face_dy(t):
    # Nods down toward sketchbook when drawing intensely, glances up curiously when thinking!
    look_pen = (tip_pg_y(t) - 610.0) * 0.06
    lean_nod = 6.5 * env(t, 70, 80, 122, 134) + 4.5 * env(t, 138, 148, 174, 182)
    think_up = -8.5 * bump(t, 50, 16, 1.0, 1.1)
    happy_up = -5.5 * bump(t, 181, 16, 1.0, 1.2)
    nod_bob = 3.2 * math.sin(10 * W1 * t) * env(t, 0, 6, 44, 48) + 3.8 * math.sin(14 * W1 * t) * env(t, 70, 76, 126, 134)
    return min(max(look_pen + lean_nod + think_up + happy_up + nod_bob, -12.0), 11.0)

def eye_scale_y(t):
    # Blink 1 during curious thinking lift (f=50..57), Blink 2 during finishing strokes (f=212..219)
    v = 1.0
    for bf, dur in ((50, 7), (212, 7)):
        b = bump(t, bf, dur, 1.0, 1.2)
        if b > 0:
            v = min(v, 1.0 - 0.92 * b)
    # "AHA!" eager wide eyes (f=63..74)
    v += 0.09 * bump(t, 63, 11, 1.0, 1.2)
    # Happy cute squint on celebration bounce (f=182..196)
    v -= 0.24 * bump(t, 182, 15, 1.0, 1.1)
    return max(v, 0.06)

def eye_scale_x(t):
    # Subtle volume preservation during blinks & happy squint
    return 1.0 + 0.14 * bump(t, 182, 15, 1.0, 1.1)

def smile_scale_x(t):
    # Slightly pursed/tiny during thinking pause, BIG cheerful grin during burst & celebration bounce!
    return (1.0 - 0.16 * bump(t, 49, 17, 1.0, 1.1)
            + 0.14 * env(t, 72, 82, 124, 132)
            + 0.24 * bump(t, 179, 22, 1.0, 1.1))

def smile_scale_y(t):
    return (1.0 - 0.10 * bump(t, 49, 17, 1.0, 1.1)
            + 0.18 * bump(t, 179, 22, 1.0, 1.1))

# Free left arm (arm_left): shifts, balances, presses on page, and gives an excited pat on celebration!
larm_spring = spring(lambda t: -0.7 * D2(body_dx, t) - 1.2 * D2(body_rot_deg, t), hz=2.8, zeta=0.28, peak=7.5)
def larm_rot_deg(t):
    # Counter-balances wiggles + playful pat lift during celebration + presses during intense burst
    pat = -13.0 * bump(t, 181, 18, 1.0, 1.1)
    think = 7.0 * bump(t, 49, 19, 1.0, 1.1)
    return larm_spring(t) + pat + think + 3.5 * math.sin(6 * W1 * t)

def larm_dy(t):
    return (4.5 * env(t, 70, 80, 124, 132)
            - 9.0 * bump(t, 181, 17, 1.0, 1.15)
            + 2.5 * math.sin(8 * W1 * t))

# Ghost tail behind left edge of book: joyful wagging spring!
tail_rot_deg = spring(
    lambda t: -1.1 * D2(body_dx, t) - 0.8 * D2(body_dy, t) + 1.8 * math.sin(5 * W1 * t),
    hz=2.7, zeta=0.22, peak=13.5,
)

# ================================================================ 5. PENCIL WORLD POSE & EXACT ARM TRACKING
def tip_world(t):
    """Exact artboard world position of the pencil tip: glued to moving page when drawing, arc-lifted otherwise."""
    wx, wy = book_to_world(tip_pg_x(t), tip_pg_y(t), t)
    lf = pen_lift(t)
    # Lift moves up and slightly right along the pencil barrel axis
    return (wx + lf * 0.30, wy - lf)

# Pencil rotation (degrees, around the tip!):
# Natural wrist flicks into stroke velocity + snappy direction changes + poised tilt on lifts!
# Strictly bounded within [-15°, +18°] so the pencil NEVER goes horizontal or over-extends Pip's arm!
def pen_rot_target(t):
    vx = D(tip_pg_x, t)
    vy = D(tip_pg_y, t)
    # Dynamic wrist tilt matching horizontal/vertical scribble velocity!
    wrist = max(min(vx * 0.85 - vy * 0.35, 11.5), -11.5) * is_drawing(t)
    # Expressive flourish wrist sweep during big circular swirl!
    swirl_wrist = 7.5 * math.sin(2.0 * math.pi * ((t - 136) % L) / 34.0) * env(t, 136, 140, 168, 173)
    # Poised slight back-tilt when lifted to think (max ~14°) or on crisp hops!
    lift_tilt = min(pen_lift(t) * 0.32, 12.5)
    # Cute little inquisitive pencil tilt-wiggle at peak of thinking lift
    think_wiggle = 5.5 * math.sin(4.0 * math.pi * ((t - 48) % L) / 20.0) * bump(t, 49, 18, 1.0, 1.2)
    return max(min(wrist + swirl_wrist + lift_tilt + think_wiggle, 17.5), -14.5)

pen_rot_deg = spring(pen_rot_target, hz=5.8, zeta=0.45, gain=1.0)
# Subtle local grip flex on the paw holding the pencil
paw_local_rot_deg = spring(lambda t: -0.6 * D(pen_rot_deg, t), hz=4.2, zeta=0.30, peak=5.5)


def body_root_world(pt, t):
    """Transform a reference-space point attached to BodyRoot (PipRig) into artboard world space."""
    loc = (pt[0] - BODY_ROOT[0], pt[1] - BODY_ROOT[1])
    loc = (loc[0] * body_scale_x(t), loc[1] * body_scale_y(t))
    r = rot2(loc, deg(body_rot_deg(t)))
    return (BODY_ROOT[0] + body_dx(t) + r[0], BODY_ROOT[1] + body_dy(t) + r[1])


def paw_world(t):
    """Exact artboard world position of the drawing paw center (attached to PencilGroup at PAW0 - TIP0)."""
    tx, ty = tip_world(t)
    r = rot2(sub(PAW0, TIP0), deg(pen_rot_deg(t)))
    return (tx + r[0], ty + r[1])


# Exact arm_right shoulder -> paw kinematics (always connected seamlessly behind body & pencil!)
ARM_REST_VEC = sub(PAW0, SHOULDER0)
ARM_REST_LEN = math.hypot(*ARM_REST_VEC)
ARM_REST_ANG = math.atan2(ARM_REST_VEC[1], ARM_REST_VEC[0])

# Compute overlapping follow-through lag on arm elbow/angle
arm_over_deg = spring(lambda t: -0.5 * D2(pen_rot_deg, t), hz=3.5, zeta=0.30, peak=4.0)


def arm_r_pose(t):
    """Returns (sx, sy, rot_rad, stretch_x, stretch_y) for ArmRightOuter -> ArmRightStretch."""
    sx, sy = body_root_world(SHOULDER0, t)
    px, py = paw_world(t)
    vx, vy = px - sx, py - sy
    dist = math.hypot(vx, vy)
    ang = math.atan2(vy, vx) + deg(arm_over_deg(t)) * 0.45
    st = min(max(dist / ARM_REST_LEN, 0.72), 1.48)
    # Volume-preserving subtle perpendicular squeeze when arm stretches
    sy_sc = 1.0 / (st ** 0.35)
    return (sx, sy, ang, st, sy_sc)


# Pencil shadow on page (inside BookGroup!): tracks tip_pg + shifts softly down-right & fades when lifted!
def shadow_pos(t):
    lf = pen_lift(t)
    return (tip_pg_x(t) - BOOK0[0] + lf * 0.55, tip_pg_y(t) - BOOK0[1] + lf * 0.28)

def shadow_opacity(t):
    return max(0.28, 1.0 - pen_lift(t) / 72.0)

def shadow_scale(t):
    return 1.0 + pen_lift(t) / 140.0


# ================================================================ 6. RML GENERATION HELPERS
_id = [4000]
def nid():
    _id[0] += 1
    return f"0:{_id[0]}"


TRACKS = []
def track(oid, prop, ks):
    TRACKS.append((oid, prop, ks))


def prune_constant(f, frames, eps=1e-4):
    """Drop redundant interior keys where value is constant across neighbors."""
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
        # If segment is flat, emit a clean hold key instead of cubic
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


def linear_keys(f, frames, fmt="{:.4f}", ind="                    "):
    frames = prune_constant(f, frames)
    out = []
    for fr in frames:
        out.append(f'{ind}<KeyFrameDouble value="{fmt.format(f(fr))}" frame="{fr}"/>')
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
    """Emit a skinned <Image><Mesh>...</Mesh></Image>."""
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


# Painterly impasto multi-stroke builder (matches the original oil-painted orange doodle!)
def impasto_stroke_node(st, ind):
    """Emit a Node inside BookGroup holding a 3-layer painterly orange stroke with synchronized TrimPaths
    and optional restrained pop-up motion (lifting gently off the page and settling back down!)."""
    cx, cy = st.centroid()
    node_id = nid()
    tids = [nid(), nid(), nid()]
    out = [f'{ind}<Node x="{cx - BOOK0[0]:.2f}" y="{cy - BOOK0[1]:.2f}" name="{st.name}" id="{node_id}">']
    out.append(f'{ind}    <Shape name="{st.name} Shape">')
    out.append(f'{ind}        <PointsPath isClosed="false" name="Path">')
    for x, y in st.pts:
        out.append(f'{ind}            <StraightVertex x="{x - cx:.2f}" y="{y - cy:.2f}"/>')
    out.append(f'{ind}        </PointsPath>')
    # Front-to-back inside Shape:
    # 1. Warm creamy-gold center highlight ridge (matching build/z/doodle.png!)
    # 2. Rich burnt-orange impasto core
    # 3. Soft warm golden-ochre outer wash
    layers_cfg = [
        (st.thick * 0.38, "C0F4CE80", tids[0], "Highlight"),
        (st.thick * 1.00, "EBC66816", tids[1], "Core"),
        (st.thick * 1.62, "52DF9A3E", tids[2], "Wash"),
    ]
    for th, col, tid, lname in layers_cfg:
        out.append(
            f'{ind}        <Stroke thickness="{th:.2f}" cap="round" join="round" name="{lname}">'
            f'<SolidColor colorValue="{col}" name="C"/>'
            f'<TrimPath start="0" end="0" modeValue="1" name="Trim" id="{tid}"/></Stroke>'
        )
    out.append(f'{ind}    </Shape>')
    out.append(f'{ind}</Node>')

    # Animate trim_end with smooth Hermite keys spaced ~4 frames during drawing + crisp hold resets while invisible!
    step_t = max(3, (st.f1 - st.f0) // 6)
    draw_fs = list(range(st.f0, st.f1, step_t)) + [st.f1]
    trim_frames = sorted(set(
        [0, L]
        + draw_fs
        + [max(0, st.f0 - 1), min(L, st.f1 + 1)]
        + [(st.fade1 + 2) % L, (st.fade1 + 4) % L]
    ))
    op_frames = sorted(set([0, L] + list(range(0, L + 1, 4))))
    for tid in tids:
        track(tid, "end", linear_keys(st.trim_end, trim_frames, "{:.4f}"))
    track(node_id, "opacity", linear_keys(st.opacity, op_frames, "{:.4f}"))

    # Optional restrained doodle pop-up! Briefly floats upward off the notebook page then settles back!
    if st.pop is not None:
        pf0, pdur, pdy, psc = st.pop
        def pop_arc(t):
            u = ((t - pf0) % L) / pdur
            if u <= 0.0 or u >= 1.0:
                return 0.0
            # Snappy elastic pop upward, smooth float at peak, gentle settle back onto paper!
            return math.sin(math.pi * u) ** 0.85 * (1.0 + 0.14 * math.sin(2.5 * math.pi * u))
        pframes = sorted(set([0, L] + list(range(0, L + 1, 2))))
        track(node_id, "y", hermite_keys(lambda t: (cy - BOOK0[1]) + pdy * pop_arc(t), pframes, "{:.2f}"))
        track(node_id, "scaleX", hermite_keys(lambda t: 1.0 + (psc - 1.0) * pop_arc(t), pframes, "{:.4f}"))
        track(node_id, "scaleY", hermite_keys(lambda t: 1.0 + (psc - 1.0) * pop_arc(t), pframes, "{:.4f}"))
        track(node_id, "rotation", hermite_keys(lambda t: deg(-4.5 * pop_arc(t)), pframes, "{:.5f}"))
    return out


# ================================================================ 7. HAND-DRAWN SPARKLE ACCENTS
# Restrained warm orange-gold 4-point sparkles & tiny dots popping clearly around key creative moments!
SPARKLES = [
    # (name, x, y, f0, dur, size, drift_y, col, is_star)
    # 1. "AHA!" idea sparkles in clear open air beside Pip's head/shoulder at the end of the curious thinking tilt!
    ("Spark_Aha1",    668, 330,  58, 28, 28, -24, "DF7B1E", True),
    ("Spark_Aha2",    644, 304,  61, 24, 15, -18, "F2B552", True),
    ("Spark_AhaDot",  686, 354,  62, 22,  9, -15, "C86614", False),
    # 2. Tiny sparkles twinkling in clear view as B2 star doodle pops upward off the page!
    ("Spark_Pop1",    724, 558, 128, 34, 22, -26, "E28526", True),
    ("Spark_Pop2",    674, 558, 132, 28, 13, -18, "F3BA58", True),
    ("Spark_PopDot",  736, 586, 134, 24,  8, -16, "CA6816", False),
    # 3. Celebratory sparkles around the iconic circular flourish!
    ("Spark_Fl1",     724, 620, 179, 36, 24, -26, "DC7A1E", True),
    ("Spark_Fl2",     592, 616, 182, 32, 18, -22, "F0B14E", True),
    ("Spark_Fl3",     664, 582, 184, 30, 14, -20, "E58C2C", True),
    ("Spark_Fl4",     712, 666, 186, 28,  9, -16, "C86816", False),
]


def sparkle_nodes(ind):
    out = []
    for name, sx, sy, f0, dur, size, drift_y, col, is_star in SPARKLES:
        sid = nid()
        assert 2 <= f0 and f0 + dur <= L - 2, f"Sparkle {name} crosses loop seam"
        shape = (
            f'<Star width="{size}" height="{size}" points="4" innerRadius="0.28" cornerRadius="1" name="Path"/>'
            if is_star else f'<Ellipse width="{size}" height="{size}" name="Path"/>'
        )
        out.append(f'{ind}<Node x="{sx - BOOK0[0]:.2f}" y="{sy - BOOK0[1]:.2f}" scaleX="0" scaleY="0" opacity="0" name="{name}" id="{sid}">')
        out.append(f'{ind}    <Shape name="S">{shape}<Fill name="F"><SolidColor colorValue="FF{col}" name="C"/></Fill></Shape>')
        out.append(f'{ind}</Node>')

        def sp_sc(t, f0=f0, dur=dur):
            u = (t - f0) / dur
            if u <= 0.0 or u >= 1.0:
                return 0.0
            # Snappy elastic pop-in, twinkle, gentle fade-shrink
            return (math.sin(math.pi * u) ** 0.55) * (1.0 + 0.16 * math.sin(3.0 * math.pi * u))

        def sp_op(t, f0=f0, dur=dur):
            u = (t - f0) / dur
            if u <= 0.0 or u >= 1.0:
                return 0.0
            return min(1.0, math.sin(math.pi * u) * 1.65)

        def sp_y(t, sy=sy, f0=f0, dur=dur, dy=drift_y):
            u = min(max((t - f0) / dur, 0.0), 1.0)
            e = 1.0 - (1.0 - u) ** 2.2
            return (sy - BOOK0[1]) + dy * e

        def sp_rot(t, f0=f0, dur=dur):
            u = min(max((t - f0) / dur, 0.0), 1.0)
            return deg(35.0 * u)

        frames = sorted(set([0, L] + list(range(max(0, f0 - 2), min(L, f0 + dur + 3), 2))))
        track(sid, "scaleX", linear_keys(sp_sc, frames, "{:.4f}"))
        track(sid, "scaleY", linear_keys(sp_sc, frames, "{:.4f}"))
        track(sid, "opacity", linear_keys(sp_op, frames, "{:.4f}"))
        track(sid, "y", linear_keys(sp_y, frames, "{:.2f}"))
        if is_star:
            track(sid, "rotation", linear_keys(sp_rot, frames, "{:.4f}"))
    return out


# ================================================================ 8. ASSEMBLE SCENE GRAPH (FRONT-TO-BACK!)
ASSETS = {
    "body": "0:900",
    "eye_l": "0:901",
    "eye_r": "0:902",
    "smile": "0:903",
    "arm_left": "0:904",
    "arm_right": "0:905",
    "tail": "0:906",
    "book": "0:907",
    "page_l": "0:908",
    "bookmark": "0:909",
    "pencil": "0:910",
    "paw": "0:911",
    "shadow": "0:912",
}

EVERY2 = list(range(0, L + 1, 2))
EVERY3 = list(range(0, L + 1, 3))

# Key IDs
ID_PENCIL = "0:2000"
ID_PAW = "0:2010"
ID_LARM = "0:2020"
ID_BOOK = "0:2100"
ID_SHADOW = "0:2110"
ID_BM = "0:2120"
ID_PAGE_ROOT = "0:2130"
ID_PAGE_TIP = "0:2131"
ID_PIP_RIG = "0:2200"
ID_BODY_ROOT = "0:2201"
ID_HEAD_BONE = "0:2202"
ID_CROWN_BONE = "0:2203"
ID_FACE = "0:2210"
ID_EYE_L = "0:2211"
ID_EYE_R = "0:2212"
ID_SMILE = "0:2213"
ID_ARM_R_POS = "0:2300"
ID_ARM_R_STRETCH = "0:2301"
ID_TAIL = "0:2400"

lines = [
    '<Rive version="1" kind="fragment">',
    f'    <Artboard defaultStateMachineId="0:3" styleId="0:4" width="{AW}" height="{AH}" name="Pip Sketch" id="0:1">',
    '        <LayoutComponentStyle name="Artboard Style" id="0:4"/>',
    '',
    '        <StateMachine name="Sketch" id="0:3">',
    '            <StateMachineLayer name="Loop" id="0:5">',
    '                <AnyState x="0" y="-160"/>',
    '                <ExitState x="400" y="-160"/>',
    '                <EntryState x="0" y="0"><StateTransition stateToId="0:6"/></EntryState>',
    '                <AnimationState animationId="0:2" x="200" y="0" id="0:6"/>',
    '            </StateMachineLayer>',
    '        </StateMachine>',
    '',
]

# ---- FRONT-TO-BACK DRAW ORDER ----
# 1. PENCIL + DRAWING PAW (topmost — paw sits in front of pencil barrel!)
paw_rel = sub(PAW0, TIP0)
lines += [
    f'        <Node x="{TIP0[0]:.2f}" y="{TIP0[1]:.2f}" name="Pencil Group" id="{ID_PENCIL}">',
    f'            <Node x="{paw_rel[0]:.2f}" y="{paw_rel[1]:.2f}" name="Drawing Paw" id="{ID_PAW}">',
    image_tag("paw", PAW0, "Paw", "                "),
    '            </Node>',
    image_tag("pencil", TIP0, "Pencil", "            "),
    '        </Node>',
]

# 2. FREE LEFT ARM (rests in front of the left page's top edge, tracks Pip's body!)
lines += [
    f'        <Node x="{LARM0[0]:.2f}" y="{LARM0[1]:.2f}" name="Free Left Arm" id="{ID_LARM}">',
    image_tag("arm_left", LARM0, "Left Paw", "            "),
    '        </Node>',
]

# 3. NOTEBOOK GROUP (sparkles + painterly doodles + pencil shadow + bookmark + fluttering left page + book base!)
sh_rel = sub(center("shadow"), TIP0)
bm_rel = sub(BM0, BOOK0)
pr_rel = sub(PAGE_ROOT, BOOK0)
lines.append(f'        <Node x="{BOOK0[0]:.2f}" y="{BOOK0[1]:.2f}" name="Book Group" id="{ID_BOOK}">')
# 3a. Sparkles (in front of strokes & page)
lines += sparkle_nodes("            ")
# 3b. Animated painterly orange strokes (in front of shadow & page)
for st in STROKES:
    lines += impasto_stroke_node(st, "            ")
# 3c. Pencil cast shadow on right page
lines += [
    f'            <Node x="{TIP0[0] - BOOK0[0]:.2f}" y="{TIP0[1] - BOOK0[1]:.2f}" name="Pencil Shadow" id="{ID_SHADOW}">',
    image_tag("shadow", TIP0, "Shadow", "                "),
    '            </Node>',
]
# 3d. Curled ribbon bookmark
lines += [
    f'            <Node x="{bm_rel[0]:.2f}" y="{bm_rel[1]:.2f}" name="Bookmark" id="{ID_BM}">',
    image_tag("bookmark", BM0, "Bookmark", "                "),
    '            </Node>',
]
# 3e. Left page skeleton (2 bones) + skinned left page mesh!
pc, ps = math.cos(PAGE_ANG), math.sin(PAGE_ANG)
lines += [
    f'            <RootBone x="{pr_rel[0]:.2f}" y="{pr_rel[1]:.2f}" rotation="{PAGE_ANG:.6f}" length="{PAGE_LEN:.2f}" name="Page Spine Bone" id="{ID_PAGE_ROOT}">',
    f'                <Bone length="{PAGE_LEN:.2f}" name="Page Tip Bone" id="{ID_PAGE_TIP}"/>',
    '            </RootBone>',
]
lines += mesh_image_lines(
    "page_l", BOOK0, "Left Page", "            ", MESH["page_l"], center("page_l"),
    [
        (ID_PAGE_ROOT, pc, ps, -ps, pc, PAGE_ROOT[0], PAGE_ROOT[1], "PageSpine"),
        (ID_PAGE_TIP,  pc, ps, -ps, pc, PAGE_TIP[0],  PAGE_TIP[1],  "PageTip"),
    ],
)
# 3f. Open sketchbook base
lines.append(image_tag("book", BOOK0, "Sketchbook", "            "))
lines.append('        </Node>')

# 4. PIP SKELETON + FACE (declared BEFORE Body mesh so Face draws IN FRONT of Body, BEHIND Book!)
el_rel = sub(EYE_L0, HEAD_BONE_POS)
er_rel = sub(EYE_R0, HEAD_BONE_POS)
sm_rel = sub(SMILE0, HEAD_BONE_POS)
lines += [
    f'        <Node x="{BODY_ROOT[0]:.2f}" y="{BODY_ROOT[1]:.2f}" name="Pip Rig" id="{ID_PIP_RIG}">',
    f'            <RootBone x="0" y="0" rotation="{-math.pi / 2:.7f}" length="130" name="Body Root Bone" id="{ID_BODY_ROOT}">',
    f'                <Bone length="135" name="Head Bone" id="{ID_HEAD_BONE}">',
    f'                    <Bone length="100" name="Crown Bone" id="{ID_CROWN_BONE}"/>',
    # Counter-rotate +pi/2 so Face children stay in normal screen X/Y axes while riding HeadBone!
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
    '        </Node>',
]

# 5. PIP BODY (3-bone skinned mesh, in front of arm_right and tail, behind face and book!)
lines += mesh_image_lines(
    "body", (0.0, 0.0), "Pip Body", "        ", MESH["body"], center("body"),
    [
        (ID_BODY_ROOT,  0.0, -1.0, 1.0, 0.0, BODY_ROOT[0],      BODY_ROOT[1],      "BodyRoot"),
        (ID_HEAD_BONE,  0.0, -1.0, 1.0, 0.0, HEAD_BONE_POS[0],  HEAD_BONE_POS[1],  "Head"),
        (ID_CROWN_BONE, 0.0, -1.0, 1.0, 0.0, CROWN_BONE_POS[0], CROWN_BONE_POS[1], "Crown"),
    ],
)

# 6. RIGHT DRAWING ARM (behind body & behind pencil, smoothly stretching from shoulder to paw!)
lines += [
    f'        <Node x="{SHOULDER0[0]:.2f}" y="{SHOULDER0[1]:.2f}" rotation="{ARM_REST_ANG:.6f}" name="Right Arm Aim" id="{ID_ARM_R_POS}">',
    f'            <Node name="Right Arm Stretch" id="{ID_ARM_R_STRETCH}">',
    f'                <Node rotation="{-ARM_REST_ANG:.6f}" name="Right Arm Unrot">',
    image_tag("arm_right", SHOULDER0, "Right Arm", "                    "),
    '                </Node>',
    '            </Node>',
    '        </Node>',
]

# 7. GHOST TAIL (behind far-left edge of sketchbook!)
lines += [
    f'        <Node x="{TAIL0[0]:.2f}" y="{TAIL0[1]:.2f}" name="Ghost Tail" id="{ID_TAIL}">',
    image_tag("tail", TAIL0, "Tail", "            "),
    '        </Node>',
]

# ================================================================ 9. KEYFRAME ALL TRACKS
# Pencil & Drawing Paw (every 1 frame during drawing for rock-solid ink-to-tip lock? Every 2 frames with Hermite
# + exact 1-frame keys at stroke start/end gives sub-0.2px accuracy!)
PEN_FRAMES = sorted(set(EVERY2 + [st.f0 for st in STROKES] + [st.f1 for st in STROKES]))
track(ID_PENCIL, "x", hermite_keys(lambda t: tip_world(t)[0], PEN_FRAMES, "{:.2f}"))
track(ID_PENCIL, "y", hermite_keys(lambda t: tip_world(t)[1], PEN_FRAMES, "{:.2f}"))
track(ID_PENCIL, "rotation", hermite_keys(lambda t: deg(pen_rot_deg(t)), EVERY2, "{:.5f}"))
track(ID_PAW, "rotation", hermite_keys(lambda t: deg(paw_local_rot_deg(t)), EVERY3, "{:.5f}"))

# Free Left Arm (rides body root transform + independent balancing shift & pat!)
def larm_world_pos(t):
    wx, wy = body_root_world(LARM0, t)
    # Keep slightly grounded near the left page while letting Pip's wiggle shift it organically!
    bx, by = book_dx(t), book_dy(t)
    return (0.65 * wx + 0.35 * (LARM0[0] + bx), 0.55 * wy + 0.45 * (LARM0[1] + by) + larm_dy(t))

track(ID_LARM, "x", hermite_keys(lambda t: larm_world_pos(t)[0], EVERY3, "{:.2f}"))
track(ID_LARM, "y", hermite_keys(lambda t: larm_world_pos(t)[1], EVERY3, "{:.2f}"))
track(ID_LARM, "rotation", hermite_keys(lambda t: deg(larm_rot_deg(t) + 0.45 * body_rot_deg(t)), EVERY3, "{:.5f}"))

# Notebook, Shadow, Bookmark, Left Page Bones
track(ID_BOOK, "x", hermite_keys(lambda t: BOOK0[0] + book_dx(t), EVERY3, "{:.2f}"))
track(ID_BOOK, "y", hermite_keys(lambda t: BOOK0[1] + book_dy(t), EVERY2, "{:.2f}"))
track(ID_BOOK, "rotation", hermite_keys(lambda t: deg(book_rot_deg(t)), EVERY2, "{:.5f}"))

track(ID_SHADOW, "x", hermite_keys(lambda t: shadow_pos(t)[0], EVERY2, "{:.2f}"))
track(ID_SHADOW, "y", hermite_keys(lambda t: shadow_pos(t)[1], EVERY2, "{:.2f}"))
track(ID_SHADOW, "opacity", hermite_keys(shadow_opacity, EVERY3, "{:.4f}"))
track(ID_SHADOW, "scaleX", hermite_keys(shadow_scale, EVERY3, "{:.4f}"))
track(ID_SHADOW, "scaleY", hermite_keys(shadow_scale, EVERY3, "{:.4f}"))

track(ID_BM, "rotation", hermite_keys(lambda t: deg(bm_rot_deg(t)), EVERY2, "{:.5f}"))
track(ID_PAGE_ROOT, "rotation", hermite_keys(lambda t: PAGE_ANG + deg(page_root_deg(t)), EVERY2, "{:.5f}"))
track(ID_PAGE_TIP, "rotation", hermite_keys(lambda t: deg(page_tip_deg(t)), EVERY2, "{:.5f}"))

# Pip Body Rig, Head, Crown & Face
track(ID_PIP_RIG, "x", hermite_keys(lambda t: BODY_ROOT[0] + body_dx(t), EVERY2, "{:.2f}"))
track(ID_PIP_RIG, "y", hermite_keys(lambda t: BODY_ROOT[1] + body_dy(t), EVERY2, "{:.2f}"))
track(ID_PIP_RIG, "rotation", hermite_keys(lambda t: deg(body_rot_deg(t)), EVERY2, "{:.5f}"))
track(ID_PIP_RIG, "scaleX", hermite_keys(body_scale_x, EVERY2, "{:.4f}"))
track(ID_PIP_RIG, "scaleY", hermite_keys(body_scale_y, EVERY2, "{:.4f}"))

track(ID_HEAD_BONE, "rotation", hermite_keys(lambda t: deg(head_rot_deg(t)), EVERY2, "{:.5f}"))
track(ID_CROWN_BONE, "rotation", hermite_keys(lambda t: deg(crown_rot_deg(t)), EVERY2, "{:.5f}"))

track(ID_FACE, "x", hermite_keys(face_dx, EVERY2, "{:.2f}"))
track(ID_FACE, "y", hermite_keys(face_dy, EVERY2, "{:.2f}"))
EYE_FRAMES = sorted(set(EVERY3 + list(range(49, 59)) + list(range(211, 221)) + list(range(180, 198))))
track(ID_EYE_L, "scaleY", linear_keys(eye_scale_y, EYE_FRAMES, "{:.4f}"))
track(ID_EYE_R, "scaleY", linear_keys(eye_scale_y, EYE_FRAMES, "{:.4f}"))
track(ID_EYE_L, "scaleX", linear_keys(eye_scale_x, EYE_FRAMES, "{:.4f}"))
track(ID_EYE_R, "scaleX", linear_keys(eye_scale_x, EYE_FRAMES, "{:.4f}"))
track(ID_SMILE, "scaleX", hermite_keys(smile_scale_x, EVERY3, "{:.4f}"))
track(ID_SMILE, "scaleY", hermite_keys(smile_scale_y, EVERY3, "{:.4f}"))

# Right Drawing Arm (shoulder -> paw exact tracking)
track(ID_ARM_R_POS, "x", hermite_keys(lambda t: arm_r_pose(t)[0], EVERY2, "{:.2f}"))
track(ID_ARM_R_POS, "y", hermite_keys(lambda t: arm_r_pose(t)[1], EVERY2, "{:.2f}"))
track(ID_ARM_R_POS, "rotation", hermite_keys(lambda t: arm_r_pose(t)[2], EVERY2, "{:.5f}"))
track(ID_ARM_R_STRETCH, "scaleX", hermite_keys(lambda t: arm_r_pose(t)[3], EVERY2, "{:.4f}"))
track(ID_ARM_R_STRETCH, "scaleY", hermite_keys(lambda t: arm_r_pose(t)[4], EVERY2, "{:.4f}"))

# Ghost Tail
track(ID_TAIL, "x", hermite_keys(lambda t: TAIL0[0] + 0.55 * body_dx(t), EVERY3, "{:.2f}"))
track(ID_TAIL, "y", hermite_keys(lambda t: TAIL0[1] + 0.45 * body_dy(t), EVERY3, "{:.2f}"))
track(ID_TAIL, "rotation", hermite_keys(lambda t: deg(tail_rot_deg(t)), EVERY2, "{:.5f}"))

# ---- Emit LinearAnimation (45 fps over 240 keys = 5.33 s — natural readable sketching cadence!) ----
lines.append('')
lines.append(f'        <LinearAnimation fps="45" duration="{L}" loopValue="loop" name="Sketch Loop" id="0:2">')
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

# Sanity summary
tip_xs = [tip_world(t)[0] for t in range(L)]
tip_ys = [tip_world(t)[1] for t in range(L)]
print(
    f"Wrote scene.rml ({len(lines)} lines, {len(by_obj)} keyed objects)\n"
    f"  pencil tip range: x={min(tip_xs):.1f}..{max(tip_xs):.1f}, y={min(tip_ys):.1f}..{max(tip_ys):.1f}, max lift={max(pen_lift(t) for t in range(L)):.1f}px\n"
    f"  body dx={min(body_dx(t) for t in range(L)):.1f}..{max(body_dx(t) for t in range(L)):.1f}, "
    f"dy={min(body_dy(t) for t in range(L)):.1f}..{max(body_dy(t) for t in range(L)):.1f}, "
    f"head rot={min(head_rot_deg(t) for t in range(L)):.1f}..{max(head_rot_deg(t) for t in range(L)):.1f} deg\n"
    f"  arm stretch={min(arm_r_pose(t)[3] for t in range(L)):.2f}..{max(arm_r_pose(t)[3] for t in range(L)):.2f}, "
    f"seam check tip={math.hypot(tip_world(L)[0]-tip_world(0)[0], tip_world(L)[1]-tip_world(0)[1]):.4f}"
)

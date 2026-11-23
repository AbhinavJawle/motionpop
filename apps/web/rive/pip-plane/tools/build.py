"""Write the paper-plane flight scene (scene.rml) from the cut layers (tools/layers.json, art/*.png).

usage: python3 tools/build.py

One 3 s loop (180 frames at 60 fps), seamless by construction:
- The flight (x, y, pitch, roll) is a periodic Catmull-Rom spline through hand-placed poses, so the last
  frame meets the first in value and velocity.
- Pip rides it as damped springs driven by the plane's own accelerations (lean back on the launch,
  squash on the pull-up, sway through the turn), simulated until periodic, so it settles the same way
  every lap. The raised arm waves three times through the turn; the other arm follows through.
- Speed streaks, two air swooshes and sparks are born and die inside the loop.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LAY = json.load(open(f"{HERE}/layers.json"))
OUT = os.path.join(ROOT, "scene.rml")

FPS, L = 60, 180
AW, AH = 1160, 800
OFF = (35.0, 75.0)                                  # art units -> artboard
PIV = (505.0, 500.0)                                # flight pivot (art): the plane's middle, under Pip
HEAD = math.radians(-22.0)                          # the plane's nose direction (screen, y down)
UX, UY = math.cos(HEAD), math.sin(HEAD)
BODY_PIVOT = tuple(LAY["points"]["body_pivot"])
SHOULDER = tuple(LAY["points"]["shoulder"])
LARM_PIVOT = tuple(LAY["points"]["larm_pivot"])
TRAIL_ATTACH = (338.0, 578.0)                       # where the smoke leaves the tail (art)


def center(n):
    b = LAY[n]; return (b["x"] + b["w"] / 2, b["y"] + b["h"] / 2)


def sub(a, b): return (a[0] - b[0], a[1] - b[1])


# ---------------------------------------------------------------- periodic splines
def periodic(keys):
    """keys: [(frame, value)] with frame 0 first; Catmull-Rom tangents, wrapping at L."""
    F = [k[0] for k in keys]; V = [k[1] for k in keys]; n = len(keys)
    def fr(i): return F[i % n] + L * (i // n)
    def val(i): return V[i % n]
    M = [(val(i + 1) - val(i - 1)) / (fr(i + 1) - fr(i - 1)) for i in range(n)]
    def f(t):
        t %= L
        i = max(j for j in range(n) if F[j] <= t)
        f0, f1 = fr(i), fr(i + 1); h = f1 - f0; s = (t - f0) / h
        v0, v1, m0, m1 = val(i), val(i + 1), M[i], M[(i + 1) % n]
        return ((2 * s**3 - 3 * s**2 + 1) * v0 + (s**3 - 2 * s**2 + s) * h * m0
                + (-2 * s**3 + 3 * s**2) * v1 + (s**3 - s**2) * h * m1)
    return f


def sampled(vals):
    """A periodic function through one value per frame."""
    return periodic([(i, v) for i, v in enumerate(vals)])


def D(f, t, e=0.5): return (f(t + e) - f(t - e)) / (2 * e)
def D2(f, t, e=0.75): return (f(t + e) - 2 * f(t) + f(t - e)) / (e * e)
def smooth(x): x = min(max(x, 0.0), 1.0); return x * x * (3 - 2 * x)


# ---------------------------------------------------------------- the flight
#   frame    dx     dy    pitch°  roll (scale across the wings)
POSES = [
    (0,     -16,    10,    2.5,   1.00),   # still easing back from the last lap: the anticipation
    (14,    -38,    22,    5.0,   1.00),   # pulled back, nose down
    (26,    -20,     8,    1.0,   0.99),   # launch
    (44,     44,   -66,  -14.0,   0.95),   # fast swoop up and across, nose high
    (70,    112,  -138,   -6.0,   0.86),   # climbing into the bank
    (96,     92,  -156,    5.0,   0.80),   # over the top of the curve, the nose drops into the turn
    (122,    30,   -98,   12.0,   0.89),   # carving down
    (148,    -4,   -22,    5.0,   0.98),   # levelling out
    (166,   -10,    -2,    3.0,   1.00),   # slowing, settling back for the next launch
]
fdx = periodic([(p[0], p[1]) for p in POSES])
fdy = periodic([(p[0], p[2]) for p in POSES])
fpitch = periodic([(p[0], p[3]) for p in POSES])
froll = periodic([(p[0], p[4]) for p in POSES])


def axes(t):
    a = HEAD + math.radians(fpitch(t))
    return (math.cos(a), math.sin(a)), (math.sin(a), -math.cos(a))     # forward, up (off the wings)


def acc_fwd(t):
    (ux, uy), _ = axes(t); return D2(fdx, t) * ux + D2(fdy, t) * uy


def acc_up(t):
    _, (nx, ny) = axes(t); return D2(fdx, t) * nx + D2(fdy, t) * ny


def vel_fwd(t):
    (ux, uy), _ = axes(t); return D(fdx, t) * ux + D(fdy, t) * uy


VF = [vel_fwd(t) for t in range(L)]
VMIN, VMAX = min(VF), max(VF)
def speed(t): return min(max((vel_fwd(t) - VMIN) / (VMAX - VMIN), 0.0), 1.0)


# ---------------------------------------------------------------- springs (simulated until periodic)
def spring(force, hz, zeta, peak, loops=10, sub=8):
    w = 2 * math.pi * hz / FPS
    x = v = 0.0; out = [0.0] * L; dt = 1.0 / sub
    for lap in range(loops):
        for fr in range(L):
            for k in range(sub):
                a = force(fr + k * dt) - w * w * x - 2 * zeta * w * v
                v += a * dt; x += v * dt
            if lap == loops - 1: out[fr] = x
    m = max(abs(x) for x in out) or 1.0
    return sampled([x * peak / m for x in out])


# lean (degrees, + = clockwise = forward): back on the launch, through the turn the other way
lean_a = spring(lambda t: -acc_fwd(t), 1.9, 0.32, 6.5)
lean_b = spring(lambda t: -D2(fpitch, t), 2.4, 0.30, 2.6)
def lean(t): return lean_a(t) + lean_b(t)
# squash (scaleY - 1): heavier on the pull-up, a light bounce after
squash = spring(lambda t: -acc_up(t), 2.6, 0.26, 0.07)
# the hanging arm swings back on the launch and follows the body through the turn
larm = spring(lambda t: acc_fwd(t) * 1.0 - 0.6 * D2(lean, t), 1.6, 0.22, 9.0)

# the wave: three happy waves through the turn (1.03 s .. 2.13 s), outward = clockwise
W0, W1, WP = 62, 128, 22
def wave_env(t):
    t %= L; return smooth((t - W0) / 8) * (1 - smooth((t - (W1 - 10)) / 10))
def wave(t): return wave_env(t) * (15 * math.sin(2 * math.pi * (t % L - W0) / WP) - 3)
arm_follow = spring(lambda t: -1.2 * D2(lean, t) - 40 * acc_up(t), 2.0, 0.28, 5.0)
def arm(t): return wave(t) + arm_follow(t)


# ---------------------------------------------------------------- RML writers
_id = [3000]
def nid():
    _id[0] += 1; return f"0:{_id[0]}"


def hermite_keys(f, frames, fmt="{:.4f}", ind="                    "):
    out = []
    for i, fr in enumerate(frames):
        v = f(fr)
        if i == len(frames) - 1:
            out.append(f'{ind}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}"/>'); break
        nx = frames[i + 1]; h = nx - fr
        y1 = v + D(f, fr, 0.25) * h / 3
        y2 = f(nx) - D(f, nx, 0.25) * h / 3
        out.append(f'{ind}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}" interpolationType="cubicValue">'
                   f'<CubicValueInterpolator x1="0.33333334" y1="{fmt.format(y1)}" x2="0.6666667" y2="{fmt.format(y2)}"/></KeyFrameDouble>')
    return out


def step_keys(points, ind="                    "):
    """points: [(frame, value, 'ease'|'hold')] -> explicit keys (cubic ease or hold)."""
    out = []
    for fr, v, kind in points:
        if kind == "hold":
            out.append(f'{ind}<KeyFrameDouble value="{v:.4f}" frame="{fr}" interpolationType="hold"/>')
        else:
            x1, y1, x2, y2 = {"ease": (0.42, 0, 0.58, 1), "out": (0.2, 0.7, 0.4, 1), "in": (0.6, 0, 0.8, 0.4)}[kind]
            out.append(f'{ind}<KeyFrameDouble value="{v:.4f}" frame="{fr}" interpolationType="cubic">'
                       f'<CubicEaseInterpolator x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/></KeyFrameDouble>')
    return out


TRACKS = []
def track(obj_id, prop, lines): TRACKS.append((obj_id, prop, lines))


EVERY2 = list(range(0, L + 1, 2))
EVERY3 = list(range(0, L + 1, 3))
deg = math.radians

# ---------------------------------------------------------------- scene graph
ASSETS = {"plane": "0:900", "trail": "0:901", "body": "0:902", "arm_wave": "0:903", "arm_left": "0:904"}
def image(name, at, origin, label, ind):
    c = sub(center(name), origin)
    return f'{ind}<Image x="{c[0] - at[0]:.2f}" y="{c[1] - at[1]:.2f}" assetId="{ASSETS[name]}" name="{label}"/>'


INK = "111111"
def line_shape(length, thick, color, alpha, ind, trim_id, name):
    """A straight streak from (0,0) back to (-length,0), drawn by animating its trim."""
    a = f"{round(alpha * 255):02X}"
    return [f'{ind}<Shape name="{name}">',
            f'{ind}    <PointsPath isClosed="false" name="Path"><StraightVertex x="0" y="0"/><StraightVertex x="{-length}" y="0"/></PointsPath>',
            f'{ind}    <Stroke thickness="{thick}" cap="round" name="S"><SolidColor colorValue="{a}{color}" name="C"/>'
            f'<TrimPath start="0" end="0" modeValue="1" name="Trim" id="{trim_id}"/></Stroke>',
            f'{ind}</Shape>']


def trim_tracks(trim_id, f0, life):
    """Head sweeps back over 55 % of the life, the tail follows; invisible (start == end) otherwise."""
    assert 1 <= f0 and f0 + life + 1 < L
    e1, s0, s1 = f0 + round(0.55 * life), f0 + round(0.18 * life), f0 + life
    end = [(0, 0, "hold"), (f0, 0, "out"), (e1, 1, "hold"), (s1, 1, "hold"), (s1 + 1, 0, "hold"), (L, 0, "hold")]
    start = [(0, 0, "hold"), (s0, 0, "in"), (s1, 1, "hold"), (s1 + 1, 0, "hold"), (L, 0, "hold")]
    track(trim_id, "end", step_keys(end)); track(trim_id, "start", step_keys(start))


def flight_point(t, local):
    """A point given in flight-local coordinates (art units, relative to PIV), in artboard space at t."""
    a = deg(fpitch(t)); c, s = math.cos(a), math.sin(a)
    return (OFF[0] + PIV[0] + fdx(t) + c * local[0] - s * local[1],
            OFF[1] + PIV[1] + fdy(t) + s * local[0] + c * local[1])


lines = []
lines.append('<Rive version="1" kind="fragment">')
lines.append(f'    <Artboard defaultStateMachineId="0:3" styleId="0:4" width="{AW}" height="{AH}" name="Pip Plane" id="0:1">')
lines.append('        <LayoutComponentStyle name="Artboard Style" id="0:4"/>')
lines.append('''
        <StateMachine name="Flight" id="0:3">
            <StateMachineLayer name="Loop" id="0:5">
                <AnyState x="0" y="-160"/>
                <ExitState x="400" y="-160"/>
                <EntryState x="0" y="0"><StateTransition stateToId="0:6"/></EntryState>
                <AnimationState animationId="0:2" x="200" y="0" id="0:6"/>
            </StateMachineLayer>
        </StateMachine>
''')

# --- speed streaks, placed in the flight's own axes (u forward, n up off the wings) so they pass above,
# below and behind the plane and Pip without crossing them: the plane spans n -100..135, u -330..510;
# Pip sits at u -160..120, n 50..390.
#   (spawn, life, u start, n, length, thickness, colour, alpha, in front?)
STREAKS = [
    (18, 20, 520, 200, 280, 6, INK, 0.70, False),       # ahead, above the wing
    (24, 18, -230, 190, 130, 5, INK, 0.55, False),      # behind, over the smoke
    (30, 20, 560, 260, 320, 7, INK, 0.80, False),
    (36, 18, 140, 400, 260, 5, "8DBCEB", 1.0, False),   # over Pip's head
    (44, 16, 470, -190, 300, 6, INK, 0.65, True),       # under the plane, while it is high
    (50, 18, 520, -170, 260, 5, "8B7CFF", 0.95, False),
    (56, 20, 330, -180, 200, 6, INK, 0.60, False),
    (64, 18, 250, -200, 240, 5, INK, 0.50, False),
    (72, 18, 320, -165, 200, 5, INK, 0.55, True),
    (84, 20, 420, -180, 220, 5, "FF6A3D", 0.9, True),
    (98, 20, 500, 220, 200, 5, INK, 0.45, False),
    (116, 20, 480, 230, 180, 5, INK, 0.40, False),
    (138, 22, -240, 170, 120, 4, INK, 0.35, False),
]
NX, NY = math.sin(HEAD), -math.cos(HEAD)
def streak_nodes(front):
    out = []
    for i, (f0, life, u0, n0, length, thick, col, alpha, fr) in enumerate(STREAKS):
        if fr != front: continue
        # born beside the plane at f0, then the head sweeps back along the flight line
        a = HEAD + deg(fpitch(f0))
        x, y = flight_point(f0, (u0 * UX + n0 * NX, u0 * UY + n0 * NY))
        x2, y2 = x - math.cos(a) * length, y - math.sin(a) * length
        if not all(12 <= v <= lim - 12 for v, lim in ((x, AW), (x2, AW), (y, AH), (y2, AH))):
            print(f"  streak {i + 1} leaves the artboard: ({x:.0f},{y:.0f}) -> ({x2:.0f},{y2:.0f})")
        tid = nid()
        out.append(f'            <Node x="{x:.2f}" y="{y:.2f}" rotation="{a:.5f}" name="Streak {i + 1}">')
        out += line_shape(length, thick, col, alpha, "                ", tid, "Streak")
        out.append('            </Node>')
        trim_tracks(tid, f0, life)
    return out

lines.append('        <Node name="Wind Front" id="0:10">')
lines += streak_nodes(True)
lines.append('        </Node>')

# --- the flight
FLIGHT = "0:1000"
lines.append(f'        <Node x="{OFF[0] + PIV[0]:.2f}" y="{OFF[1] + PIV[1]:.2f}" name="Flight" id="{FLIGHT}">')
track(FLIGHT, "x", hermite_keys(lambda t: OFF[0] + PIV[0] + fdx(t), EVERY3, "{:.3f}"))
track(FLIGHT, "y", hermite_keys(lambda t: OFF[1] + PIV[1] + fdy(t), EVERY3, "{:.3f}"))
track(FLIGHT, "rotation", hermite_keys(lambda t: deg(fpitch(t)), EVERY3, "{:.5f}"))


def whoosh(name, pts, thick, alpha, spawns, life):
    """An air line curving past Pip (flight-local), swept on by its trim at each spawn."""
    out = [f'            <Shape name="{name}">', '                <PointsPath isClosed="false" name="Path">']
    for x, y, ir, idist, orr, odist in pts:
        out.append(f'                    <CubicDetachedVertex x="{x}" y="{y}" inRotation="{ir}" inDistance="{idist}" outRotation="{orr}" outDistance="{odist}"/>')
    out.append('                </PointsPath>')
    ids = []
    for k, f0 in enumerate(spawns):
        tid = nid(); ids.append((tid, f0))
    # one stroke per spawn (each with its own trim), so the swooshes can overlap in time
    for tid, f0 in ids:
        out.append(f'                <Stroke thickness="{thick}" cap="round" name="S"><SolidColor colorValue="{round(alpha * 255):02X}{INK}" name="C"/>'
                   f'<TrimPath start="0" end="0" modeValue="1" name="Trim" id="{tid}"/></Stroke>')
        trim_tracks(tid, f0, life)
    out.append('            </Shape>')
    return out

# over Pip's head, from the front back (local coords relative to the flight pivot)
pi = math.pi
lines += whoosh("Whoosh Over", [(70, -365, 0, 0, pi + 0.25, 40), (-40, -392, 0.0, 40, pi, 40), (-150, -350, -0.5, 40, 0, 0)],
                5, 0.75, [36, 60, 88], 20)

# Pip
SEAT = "0:1100"; WAVE = "0:1110"; LEFT = "0:1120"; PECHO = "0:1130"; BODY = "0:1140"
seat_local = sub(BODY_PIVOT, PIV)
lines.append(f'            <Node x="{seat_local[0]:.2f}" y="{seat_local[1]:.2f}" name="Pip Seat" id="{SEAT}">')
lp = sub(LARM_PIVOT, BODY_PIVOT)
lines.append(f'                <Node x="{lp[0]:.2f}" y="{lp[1]:.2f}" name="Left Arm" id="{LEFT}">')
lines.append(image("arm_left", (0, 0), LARM_PIVOT, "Left Arm", "                    "))
lines.append('                </Node>')
lines.append(f'                <Node name="Body" id="{BODY}">')
lines.append(image("body", (0, 0), BODY_PIVOT, "Body", "                    "))
lines.append('                </Node>')
sp = sub(SHOULDER, BODY_PIVOT)
lines.append(f'                <Node x="{sp[0]:.2f}" y="{sp[1]:.2f}" name="Waving Arm" id="{WAVE}">')
lines.append(image("arm_wave", (0, 0), SHOULDER, "Waving Arm", "                    "))
lines.append('                </Node>')
lines.append(f'                <Node opacity="0" name="Pip Echo" id="{PECHO}">')
lines.append(image("body", (0, 0), BODY_PIVOT, "Body Echo", "                    "))
lines.append('                </Node>')
lines.append('            </Node>')

# roll: scale across the wings about the flight axis (Heading > Roll > Level)
_whoosh_back = whoosh("Whoosh Behind", [(-150, -250, 0, 0, pi + 0.35, 45), (-270, -190, -0.2, 45, 0, 0)],
                      4, 0.55, [44, 74], 20)
lines += _whoosh_back
ROLL = "0:1200"; PLECHO = "0:1210"; TRAILN = "0:1220"
lines.append(f'            <Node rotation="{HEAD:.5f}" name="Heading">')
lines.append(f'                <Node name="Roll" id="{ROLL}">')
lines.append(f'                    <Node rotation="{-HEAD:.5f}" name="Level">')
lines.append(image("plane", (0, 0), PIV, "Plane", "                        "))
lines.append(f'                        <Node opacity="0" name="Plane Echo" id="{PLECHO}">')
lines.append(image("plane", (0, 0), PIV, "Plane Echo", "                            "))
lines.append('                        </Node>')
ta = sub(TRAIL_ATTACH, PIV)
lines.append(f'                        <Node x="{ta[0]:.2f}" y="{ta[1]:.2f}" name="Smoke Trail" id="{TRAILN}">')
lines.append(image("trail", (0, 0), TRAIL_ATTACH, "Smoke", "                            "))
lines.append('                        </Node>')
lines.append('                    </Node>')
lines.append('                </Node>')
lines.append('            </Node>')
lines.append('        </Node>')

# Pip's springs and the arms
def roll_fix(t):
    """Pip sits outside the roll, so follow where the roll moves the seat on the paper."""
    b = froll(t); v = seat_local
    c, s = math.cos(HEAD), math.sin(HEAD)
    lx, ly = c * v[0] + s * v[1], -s * v[0] + c * v[1]          # into the flight axis frame
    ly *= b
    return (c * lx - s * ly, s * lx + c * ly)
track(SEAT, "x", hermite_keys(lambda t: roll_fix(t)[0], EVERY3, "{:.3f}"))
track(SEAT, "y", hermite_keys(lambda t: roll_fix(t)[1], EVERY3, "{:.3f}"))
track(SEAT, "rotation", hermite_keys(lambda t: deg(lean(t)), EVERY2, "{:.5f}"))
track(SEAT, "scaleY", hermite_keys(lambda t: 1 + squash(t), EVERY2))
track(SEAT, "scaleX", hermite_keys(lambda t: 1 - 0.6 * squash(t), EVERY2))
track(WAVE, "rotation", hermite_keys(lambda t: deg(arm(t)), EVERY2, "{:.5f}"))
track(LEFT, "rotation", hermite_keys(lambda t: deg(larm(t)), EVERY2, "{:.5f}"))
track(ROLL, "scaleY", hermite_keys(froll, EVERY3))

# speed: the smoke stretches and thickens, a faint echo trails the plane and Pip
track(TRAILN, "opacity", hermite_keys(lambda t: 0.3 + 0.7 * speed(t), EVERY3))
track(TRAILN, "scaleX", hermite_keys(lambda t: 0.75 + 0.75 * speed(t), EVERY3))
def echo_off(t): return 34 * speed(t) ** 2
track(PLECHO, "x", hermite_keys(lambda t: -echo_off(t) * UX, EVERY3, "{:.3f}"))
track(PLECHO, "y", hermite_keys(lambda t: -echo_off(t) * UY, EVERY3, "{:.3f}"))
track(PLECHO, "opacity", hermite_keys(lambda t: 0.16 * speed(t) ** 2, EVERY3))
track(BODY, "x", [f'                    <KeyFrameDouble value="0" frame="0"/>'])
track(PECHO, "x", hermite_keys(lambda t: -echo_off(t) * 0.8 * UX, EVERY3, "{:.3f}"))
track(PECHO, "y", hermite_keys(lambda t: -echo_off(t) * 0.8 * UY, EVERY3, "{:.3f}"))
track(PECHO, "opacity", hermite_keys(lambda t: 0.12 * speed(t) ** 2, EVERY3))

# --- sparks behind the plane: (spawn, life, tail-local offset, drift, size, colour, star?)
SPARKS = [   # (spawn, life, (u, n) off the tail in flight axes, drift, size, colour, star?)
    (26, 34, (-290, 90), 150, 18, "FF6A3D", True),
    (34, 30, (-250, 170), 130, 12, "8DBCEB", False),
    (42, 34, (-320, 60), 160, 16, "8B7CFF", True),
    (52, 30, (-270, 140), 130, 11, "2FC48D", False),
    (62, 34, (-300, 100), 150, 17, "FF6A3D", False),
    (76, 32, (-260, 180), 130, 14, "8DBCEB", True),
    (96, 34, (-290, 120), 130, 12, "8B7CFF", False),
    (120, 36, (-280, 150), 120, 15, "2FC48D", True),
]
lines.append('        <Node name="Sparks" id="0:20">')
for i, (f0, life, loc, drift, size, col, star) in enumerate(SPARKS):
    sid = nid()
    p0 = flight_point(f0, (loc[0] * UX + loc[1] * NX, loc[0] * UY + loc[1] * NY))
    if not (20 <= p0[0] - drift <= AW - 20 and 20 <= p0[1] <= AH - 20):
        print(f"  spark {i + 1} near the edge: ({p0[0]:.0f},{p0[1]:.0f})")
    a = HEAD + deg(fpitch(f0)); ux, uy = math.cos(a), math.sin(a); nx, ny = math.sin(a), -math.cos(a)
    jitter = (-1) ** i * 28
    def pos(t, p0=p0, f0=f0, life=life, ux=ux, uy=uy, nx=nx, ny=ny, drift=drift, jitter=jitter):
        tau = min(max((t % L - f0) / life, 0.0), 1.0); e = 1 - (1 - tau) ** 2
        return (p0[0] - ux * drift * e + nx * jitter * tau, p0[1] - uy * drift * e + ny * jitter * tau)
    def scale(t, f0=f0, life=life):
        tau = (t % L - f0) / life
        if tau <= 0 or tau >= 1: return 0.0
        return math.sin(math.pi * tau) ** 0.6 * (1 - 0.25 * tau)
    shape = (f'<Star width="{size * 2}" height="{size * 2}" points="4" innerRadius="0.35" cornerRadius="1" name="Path"/>' if star
             else f'<Ellipse width="{size}" height="{size}" name="Path"/>')
    lines.append(f'            <Node x="{p0[0]:.2f}" y="{p0[1]:.2f}" scaleX="0" scaleY="0" name="Spark {i + 1}" id="{sid}">')
    lines.append(f'                <Shape name="Bit">{shape}<Fill name="F"><SolidColor colorValue="FF{col}" name="C"/></Fill></Shape>')
    lines.append('            </Node>')
    frames = sorted(set([0, L] + [f for f in range(f0 - 3, f0 + life + 4, 3) if 0 <= f <= L]))
    track(sid, "x", hermite_keys(lambda t, pos=pos: pos(t)[0], frames, "{:.2f}"))
    track(sid, "y", hermite_keys(lambda t, pos=pos: pos(t)[1], frames, "{:.2f}"))
    track(sid, "scaleX", hermite_keys(scale, frames))
    track(sid, "scaleY", hermite_keys(scale, frames))
lines.append('        </Node>')

lines.append('        <Node name="Wind Back" id="0:30">')
lines += streak_nodes(False)
lines.append('        </Node>')

# --- the animation
lines.append('')
lines.append(f'        <LinearAnimation fps="{FPS}" duration="{L}" loopValue="loop" name="Flight Loop" id="0:2">')
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

print(f"scene.rml: {len(lines)} lines; speed range {VMIN:.2f}..{VMAX:.2f} px/frame;"
      f" lean {min(lean(t) for t in range(L)):.1f}..{max(lean(t) for t in range(L)):.1f} deg;"
      f" squash {min(squash(t) for t in range(L)):.3f}..{max(squash(t) for t in range(L)):.3f};"
      f" left arm {min(larm(t) for t in range(L)):.1f}..{max(larm(t) for t in range(L)):.1f};"
      f" wave {min(arm(t) for t in range(L)):.1f}..{max(arm(t) for t in range(L)):.1f}")

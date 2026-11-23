"""Write the sign-up CTA mascot scene (scene.rml) and its downscaled art (art/*.webp).

Two artboards share one coordinate space (800 x 760, the button's top edge at y = 640):
  "Pip Body"  is drawn on a canvas BEHIND the button surface (the button hides everything below the edge);
  "Pip Hands" is drawn on a canvas IN FRONT of the button, so the paws rest over the border.
Each has the state machine "Pip" with three layers that key separate nodes, so they never fight:
  Idle  -> Float / eyes / hand nodes  (a seamless 6 s loop, always playing)
  Hover -> Perk nodes                 (view model boolean `hover`)
  Press -> Bounce nodes               (view model trigger `press`)
Hover and press therefore layer on top of the idle loop without restarting it.

usage: python3 tools/build.py      (from the project folder; then `rive . --verify`)"""
import json, math, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PARTS = json.load(open(f"{HERE}/parts.json"))

# ---------------------------------------------------------------- geometry (ghost px -> artboard units)
OFF = (112.0, -40.0)                # artboard = ghost - OFF (headroom above the head for perk + hop)
AW, AH = 800, 760
EDGE = 640.0                        # the button's top edge, in artboard units (ghost y 600)
PIV = (400.0, EDGE)                 # every top node pivots on the edge, under the ghost's centre
ART_SCALE = 0.7                     # art is stored at 70 % (the canvas never shows it larger than that)
HAND_SCALE = 1.18
HANDS = {"hand_l": (240.0, 597.0), "hand_r": (766.0, 597.0)}    # paw centres, ghost px (sitting on the edge)
HAND_CONTACT = 18.0                 # paws squash about a point this far below their centre

def art(gx, gy): return gx - OFF[0], gy - OFF[1]
def rel(p, o): return p[0] - o[0], p[1] - o[1]
def centre(k): p = PARTS[k]; return art(p["x"] + p["w"] / 2, p["y"] + p["h"] / 2)

# ---------------------------------------------------------------- idle motion (sums of whole-loop sinusoids)
FPS, L = 60, 360
W1, W2 = 2 * math.pi / L, 4 * math.pi / L
def by(t): return -9.0 * math.sin(W2 * t) - 3.0 * math.sin(W1 * t + 0.7)
def btilt(t): return 1.2 * math.sin(W1 * t + 0.3) + 0.35 * math.sin(W2 * t + 1.4)          # degrees
def bsy(t): return 1 + 0.014 * math.sin(W2 * t - 0.5)        # compresses just after the low point: settling
def bsx(t): return 1 - 0.6 * (bsy(t) - 1)
LAG = 8.0
def hand_y(dx):
    # the paw follows the body a beat late, a third as far, and lifts or presses with the tilt
    return lambda t: 0.3 * by(t - LAG) - 0.35 * dx * math.sin(math.radians(btilt(t - LAG)))
def hand_rot(sign, ph): return lambda t: math.radians(0.6 * btilt(t - 10) + sign * 1.4 * math.sin(W1 * t + ph))
def hand_sy(t): return 1 + 0.7 * (bsy(t - 6) - 1)
def hand_sx(t): return 1 - 0.5 * (hand_sy(t) - 1)
BLINK = 214

# ---------------------------------------------------------------- keyframe writers
IND = "                    "
def deriv(f, t, e=0.25): return (f(t + e) - f(t - e)) / (2 * e)
def hermite(f, frames, fmt="{:.4f}"):
    out = []
    for i, fr in enumerate(frames):
        v = f(fr)
        if i == len(frames) - 1:
            out.append(f'{IND}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}"/>'); break
        nx = frames[i + 1]; h = nx - fr
        y1 = v + deriv(f, fr) * h / 3; y2 = f(nx) - deriv(f, nx) * h / 3
        out.append(f'{IND}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}" interpolationType="cubicValue">'
                   f'<CubicValueInterpolator x1="0.33333334" y1="{fmt.format(y1)}" x2="0.6666667" y2="{fmt.format(y2)}"/></KeyFrameDouble>')
    return out
EASE = {"io": (0.45, 0, 0.55, 1), "out": (0.22, 1, 0.36, 1), "in": (0.55, 0, 0.9, 0.45), "soft": (0.3, 0, 0.5, 1)}
def eased(keys, fmt="{:.4f}"):
    """keys: (frame, value, ease-into-next)"""
    out = []
    for i, (fr, v, e) in enumerate(keys):
        if i == len(keys) - 1 or e is None:
            out.append(f'{IND}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}"/>'); continue
        x1, y1, x2, y2 = EASE[e]
        out.append(f'{IND}<KeyFrameDouble value="{fmt.format(v)}" frame="{fr}" interpolationType="cubic">'
                   f'<CubicEaseInterpolator x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/></KeyFrameDouble>')
    return out
def hold(v, fmt="{:.4f}"): return [f'{IND}<KeyFrameDouble value="{fmt.format(v)}" frame="0"/>']
def track(obj, props):
    out = [f'            <KeyedObject objectId="{obj}">']
    for name, lines in props:
        out += [f'                <KeyedProperty property="{name}">', *lines, '                </KeyedProperty>']
    return out + ['            </KeyedObject>']
def anim(aid, name, dur, loop, tracks):
    return "\n".join([f'        <LinearAnimation fps="{FPS}" duration="{dur}" loopValue="{loop}" name="{name}" id="{aid}">',
                      *tracks, '        </LinearAnimation>'])

# ---------------------------------------------------------------- view model + state machine
VM, VM_HOVER, VM_PRESS, VMI = "0:40", "0:41", "0:42", "0:43"
VIEW_MODEL = f'''    <ViewModel defaultInstanceId="{VMI}" name="PipCta" id="{VM}">
        <ViewModelPropertyBoolean name="hover" id="{VM_HOVER}"/>
        <ViewModelPropertyTrigger name="press" id="{VM_PRESS}"/>
        <ViewModelInstance exports="true" name="Default" id="{VMI}">
            <ViewModelInstanceBoolean propertyValue="false" viewModelPropertyId="{VM_HOVER}"/>
            <ViewModelInstanceTrigger viewModelPropertyId="{VM_PRESS}"/>
        </ViewModelInstance>
    </ViewModel>'''

def cond_hover(value):
    return f'''<TransitionViewModelCondition>
                        <TransitionPropertyViewModelComparator>
                            <BindablePropertyBoolean>
                                <DataBindContext sourcePathIds="{VM}-{VM_HOVER}" propertyKey="634"/>
                            </BindablePropertyBoolean>
                        </TransitionPropertyViewModelComparator>
                        <TransitionValueBooleanComparator value="{value}"/>
                    </TransitionViewModelCondition>'''
COND_PRESS = f'''<TransitionViewModelCondition>
                        <TransitionPropertyViewModelComparator>
                            <BindablePropertyTrigger propertyValue="1">
                                <DataBindContext sourcePathIds="{VM}-{VM_PRESS}" propertyKey="686"/>
                            </BindablePropertyTrigger>
                        </TransitionPropertyViewModelComparator>
                        <TransitionValueTriggerComparator/>
                    </TransitionViewModelCondition>'''

def state_machine(p, a):
    """p: id prefix (artboard number); a: animation ids dict"""
    perk_in = '<CubicEaseInterpolator x1="0.22" y1="1" x2="0.36" y2="1"/>'
    perk_out = '<CubicEaseInterpolator x1="0.45" y1="0" x2="0.55" y2="1"/>'
    return f'''        <StateMachine name="Pip" id="{p}:3">
            <StateMachineLayer name="Idle" id="{p}:4">
                <AnyState x="160" y="-120"/>
                <ExitState x="480" y="-120"/>
                <EntryState x="0" y="0"><StateTransition stateToId="{p}:10"/></EntryState>
                <AnimationState animationId="{a["idle"]}" x="160" y="0" id="{p}:10"/>
            </StateMachineLayer>
            <StateMachineLayer name="Hover" id="{p}:5">
                <AnyState x="160" y="-120"/>
                <ExitState x="640" y="-120"/>
                <EntryState x="0" y="0"><StateTransition stateToId="{p}:11"/></EntryState>
                <AnimationState animationId="{a["rest"]}" x="160" y="0" id="{p}:11">
                    <StateTransition stateToId="{p}:12" duration="300" interpolationType="cubic" enableEarlyExit="true">
                    {perk_in}
                    {cond_hover("true")}
                    </StateTransition>
                </AnimationState>
                <AnimationState animationId="{a["perked"]}" x="400" y="0" id="{p}:12">
                    <StateTransition stateToId="{p}:11" duration="420" interpolationType="cubic" enableEarlyExit="true">
                    {perk_out}
                    {cond_hover("false")}
                    </StateTransition>
                </AnimationState>
            </StateMachineLayer>
            <StateMachineLayer name="Press" id="{p}:6">
                <AnyState x="160" y="-120">
                    <StateTransition stateToId="{p}:14" duration="0">
                    {COND_PRESS}
                    </StateTransition>
                </AnyState>
                <ExitState x="640" y="-120"/>
                <EntryState x="0" y="0"><StateTransition stateToId="{p}:13"/></EntryState>
                <AnimationState animationId="{a["still"]}" x="160" y="0" id="{p}:13"/>
                <AnimationState animationId="{a["bounce"]}" reset="true" x="400" y="0" id="{p}:14">
                    <StateTransition stateToId="{p}:13" duration="0" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100"/>
                </AnimationState>
            </StateMachineLayer>
        </StateMachine>'''

# ---------------------------------------------------------------- art (downscaled webp; alpha kept lossless)
ASSETS = {"body": "0:900", "eye_l": "0:901", "eye_r": "0:902", "hand_l": "0:903", "hand_r": "0:904"}
os.makedirs(f"{ROOT}/art", exist_ok=True)
for k in ASSETS:
    im = Image.open(f"{ROOT}/source/layers/{k}.png").convert("RGBA")
    im = im.resize((round(im.width * ART_SCALE), round(im.height * ART_SCALE)), Image.LANCZOS)
    im.save(f"{ROOT}/art/{k}.webp", "WEBP", quality=92, alpha_quality=100, method=6)
S = 1 / ART_SCALE
def image(name, key, x, y, scale=1.0):
    s = S * scale
    return f'<Image x="{x:.2f}" y="{y:.2f}" scaleX="{s:.5f}" scaleY="{s:.5f}" assetId="{ASSETS[key]}" name="{name}"/>'

# ---------------------------------------------------------------- "Pip Body"
KF = list(range(0, L + 1, 45))
bc = rel(centre("body"), PIV)
eyes = {k: centre(k) for k in ("eye_l", "eye_r")}
EYE_PIV = {k: (c[0], c[1] + 0.1 * PARTS[k]["h"]) for k, c in eyes.items()}     # lids close a touch below centre
eyes_mid = ((EYE_PIV["eye_l"][0] + EYE_PIV["eye_r"][0]) / 2, (EYE_PIV["eye_l"][1] + EYE_PIV["eye_r"][1]) / 2)
em = rel(eyes_mid, PIV)
def eye_node(name, key, nid):
    ep = rel(EYE_PIV[key], eyes_mid); img = rel(eyes[key], EYE_PIV[key])
    return (f'                        <Node x="{ep[0]:.2f}" y="{ep[1]:.2f}" name="{name}" id="{nid}">\n'
            f'                            {image(name + " Art", key, *img)}\n'
            f'                        </Node>')
B = dict(bounce="1:100", perk="1:101", float="1:102", eyes="1:103", eye_l="1:104", eye_r="1:105")
BA = dict(idle="1:20", rest="1:21", perked="1:22", still="1:23", bounce="1:24")
body_tree = f'''        <Node x="{PIV[0]:.2f}" y="{PIV[1]:.2f}" name="Bounce" id="{B["bounce"]}">
            <Node name="Perk" id="{B["perk"]}">
                <Node name="Float" id="{B["float"]}">
                    <Node x="{em[0]:.2f}" y="{em[1]:.2f}" name="Eyes" id="{B["eyes"]}">
{eye_node("Eye L", "eye_l", B["eye_l"])}
{eye_node("Eye R", "eye_r", B["eye_r"])}
                    </Node>
                    {image("Body", "body", *bc)}
                </Node>
            </Node>
        </Node>'''
blink = eased([(0, 1, None), (BLINK, 1, "in"), (BLINK + 5, 0.14, None), (BLINK + 7, 0.14, "out"), (BLINK + 17, 1, None), (L, 1, None)])
body_anims = [
    anim(BA["idle"], "Idle", L, "loop",
         track(B["float"], [("y", hermite(by, KF, "{:.3f}")), ("rotation", hermite(lambda t: math.radians(btilt(t)), KF, "{:.5f}")),
                            ("scaleX", hermite(bsx, KF, "{:.5f}")), ("scaleY", hermite(bsy, KF, "{:.5f}"))])
         + track(B["eye_l"], [("scaleY", blink)]) + track(B["eye_r"], [("scaleY", blink)])),
    anim(BA["rest"], "Rest", 1, "oneShot",
         track(B["perk"], [("y", hold(0)), ("scaleX", hold(1)), ("scaleY", hold(1))])
         + track(B["eyes"], [("y", hold(em[1])), ("scaleX", hold(1)), ("scaleY", hold(1))])),
    anim(BA["perked"], "Perked", 1, "oneShot",
         track(B["perk"], [("y", hold(-12)), ("scaleX", hold(0.988)), ("scaleY", hold(1.024))])
         + track(B["eyes"], [("y", hold(em[1] - 4)), ("scaleX", hold(1.07)), ("scaleY", hold(1.08))])),
    anim(BA["still"], "Still", 1, "oneShot",
         track(B["bounce"], [("y", hold(PIV[1])), ("scaleX", hold(1)), ("scaleY", hold(1))])),
]
# press: a small dip with the button, a happy hop, a soft landing, settle  (every key is a turning point)
BOUNCE = [(0, 0, 1.0, "soft"), (6, 6, 0.962, "out"), (18, -20, 1.026, "in"), (29, 3, 0.982, "io"), (37, -3, 1.006, "io"), (46, 0, 1.0, None)]
body_anims.append(anim(BA["bounce"], "Bounce", 48, "oneShot", track(B["bounce"], [
    ("y", eased([(f, PIV[1] + y, e) for f, y, _, e in BOUNCE])),
    ("scaleY", eased([(f, s, e) for f, _, s, e in BOUNCE], "{:.4f}")),
    ("scaleX", eased([(f, 1 - 0.65 * (s - 1), e) for f, _, s, e in BOUNCE], "{:.4f}"))])))

# ---------------------------------------------------------------- "Pip Hands"
H = dict(bounce="2:100", perk="2:101", grip_l="2:102", hand_l="2:103", grip_r="2:104", hand_r="2:105")
HA = dict(idle="2:20", rest="2:21", perked="2:22", still="2:23", bounce="2:24")
def hand_tree(name, key, grip, node):
    c = art(*HANDS[key]); contact = (c[0], c[1] + HAND_CONTACT)
    g = rel(contact, PIV)
    return f'''                <Node x="{g[0]:.2f}" y="{g[1]:.2f}" name="{name} Grip" id="{grip}">
                    <Node name="{name}" id="{node}">
                        {image(name + " Art", key, 0, -HAND_CONTACT, HAND_SCALE)}
                    </Node>
                </Node>'''
hands_tree = f'''        <Node x="{PIV[0]:.2f}" y="{PIV[1]:.2f}" name="Bounce" id="{H["bounce"]}">
            <Node name="Perk" id="{H["perk"]}">
{hand_tree("Hand L", "hand_l", H["grip_l"], H["hand_l"])}
{hand_tree("Hand R", "hand_r", H["grip_r"], H["hand_r"])}
            </Node>
        </Node>'''
dxl = art(*HANDS["hand_l"])[0] - PIV[0]; dxr = art(*HANDS["hand_r"])[0] - PIV[0]
hands_anims = [
    anim(HA["idle"], "Idle", L, "loop",
         track(H["hand_l"], [("y", hermite(hand_y(dxl), KF, "{:.3f}")), ("rotation", hermite(hand_rot(1, 2.0), KF, "{:.5f}")),
                             ("scaleX", hermite(hand_sx, KF, "{:.5f}")), ("scaleY", hermite(hand_sy, KF, "{:.5f}"))])
         + track(H["hand_r"], [("y", hermite(hand_y(dxr), KF, "{:.3f}")), ("rotation", hermite(hand_rot(-1, 0.6), KF, "{:.5f}")),
                               ("scaleX", hermite(hand_sx, KF, "{:.5f}")), ("scaleY", hermite(hand_sy, KF, "{:.5f}"))])),
    anim(HA["rest"], "Rest", 1, "oneShot",
         track(H["perk"], [("y", hold(0))])
         + track(H["grip_l"], [("scaleX", hold(1)), ("scaleY", hold(1)), ("rotation", hold(0))])
         + track(H["grip_r"], [("scaleX", hold(1)), ("scaleY", hold(1)), ("rotation", hold(0))])),
    anim(HA["perked"], "Perked", 1, "oneShot",       # paws grip the edge as the body lifts
         track(H["perk"], [("y", hold(-3))])
         + track(H["grip_l"], [("scaleX", hold(1.035)), ("scaleY", hold(0.955)), ("rotation", hold(math.radians(4)))])
         + track(H["grip_r"], [("scaleX", hold(1.035)), ("scaleY", hold(0.955)), ("rotation", hold(math.radians(-4)))])),
    anim(HA["still"], "Still", 1, "oneShot", track(H["bounce"], [("y", hold(PIV[1]))])),
    anim(HA["bounce"], "Bounce", 48, "oneShot", track(H["bounce"], [
        ("y", eased([(0, PIV[1], "soft"), (6, PIV[1] + 4, "out"), (19, PIV[1] - 6, "in"), (30, PIV[1] + 1.5, "io"), (38, PIV[1] - 1, "io"), (46, PIV[1], None)]))])),
]

# ---------------------------------------------------------------- write
def artboard(num, name, tree, anims, a):
    return f'''    <Artboard defaultStateMachineId="{num}:3" styleId="{num}:2" width="{AW}" height="{AH}" clip="true" x="{(num - 1) * 900}" y="0" viewModelId="{VM}" viewModelInstanceId="{VMI}" name="{name}" id="{num}:1">
        <LayoutComponentStyle name="Artboard Style" id="{num}:2"/>
{state_machine(num, a)}
{tree}
{chr(10).join(anims)}
    </Artboard>'''
scene = "\n".join([
    '<Rive version="1" kind="fragment">',
    artboard(1, "Pip Body", body_tree, body_anims, BA),
    "",
    artboard(2, "Pip Hands", hands_tree, hands_anims, HA),
    "",
    VIEW_MODEL,
    *[f'    <ImageAsset file="art/{k}.webp" name="{k}" id="{aid}"/>' for k, aid in ASSETS.items()],
    "</Rive>", ""])
open(f"{ROOT}/scene.rml", "w").write(scene)
print("scene.rml", len(scene), "bytes; art", {k: os.path.getsize(f"{ROOT}/art/{k}.webp") // 1024 for k in ASSETS}, "KB")

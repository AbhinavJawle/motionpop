"""Headless check of the CTA mascot: renders both artboards with the Rive CLI, recovers true alpha
(black and white backdrops), and composites body | button mock | hands the way the page stacks them.

usage: python3 tools/preview.py <out_dir> <steps>
  steps: space-separated; "sN" captures after advancing to frame N (60 fps), "hover=1"/"hover=0"/"press"
  write view model data at that point.  e.g.  "s0 s90 s180 hover=1 s200 press s206 s220"
Writes <out_dir>/<label>.png (composited) and <out_dir>/sheet.png."""
import os, re, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT, STEPS = os.path.abspath(sys.argv[1]), sys.argv[2].split()
os.makedirs(OUT, exist_ok=True)
ENV = dict(os.environ, PATH=os.path.expanduser("~/.rive/bin") + ":" + os.environ["PATH"], RIVE_NO_TUI="1")
PV = os.path.join(ROOT, "build", "pv")

def project(variant, colour):
    d = os.path.join(PV, variant); os.makedirs(d, exist_ok=True)
    if not os.path.exists(os.path.join(d, "art")): os.symlink(os.path.join(ROOT, "art"), os.path.join(d, "art"))
    open(os.path.join(d, "rive.yaml"), "w").write(f"name: pip-cta-{variant}\n")
    s = open(os.path.join(ROOT, "scene.rml")).read()
    s = re.sub(r'(<LayoutComponentStyle name="Artboard Style" id="\d:2"/>)',
               rf'\1\n        <Fill name="Backdrop"><SolidColor colorValue="{colour}" name="C"/></Fill>', s)
    open(os.path.join(d, "scene.rml"), "w").write(s)
    return d

def capture(d, artboard, tag):
    cmds, frame, shots = [f"artboard {artboard}"], 0, []
    for st in STEPS:
        if st.startswith("s"):
            n = int(st[1:]); cmds.append(f"advance {n - frame}") if n > frame else None; frame = n
            p = os.path.join(d, f"{tag}_{artboard.split()[-1]}_{len(shots):02d}.png"); shots.append((st, p))
            cmds.append(f"screenshot {p}")
        elif st == "press": cmds.append("data press=1"); frame += 1     # a data step advances one frame
        else: k, v = st.split("="); cmds.append(f"data {k}={'true' if v == '1' else 'false'}"); frame += 1
    cmds.append("quit")
    r = subprocess.run(["rive", ".", "--commands"], cwd=d, input="\n".join(cmds) + "\n", text=True, capture_output=True, env=ENV)
    if r.returncode: sys.exit(r.stdout[-2000:] + r.stderr[-2000:])
    return shots

dark, light = project("dark", "FF000000"), project("light", "FFFFFFFF")
layers = {}
for ab in ("Pip Body", "Pip Hands"):
    a = capture(dark, ab, "k"); b = capture(light, ab, "w")
    for (lab, pk), (_, pw) in zip(a, b):
        K = np.asarray(Image.open(pk).convert("RGB")).astype(float); Wt = np.asarray(Image.open(pw).convert("RGB")).astype(float)
        al = np.clip(1 - (Wt - K).mean(-1) / 255, 0, 1)
        rgb = np.where(al[..., None] > 1e-3, K / np.maximum(al[..., None], 1e-3), 0)
        layers.setdefault(lab, {})[ab] = \
            Image.fromarray(np.dstack([np.clip(rgb, 0, 255), al * 255]).round().astype(np.uint8), "RGBA")

# button mock in the page's proportions: one artboard unit = 5.4224e-4 Bw, the ghost's centre (x 400.5) at 0.646 Bw
AH, EDGE, U = 760, 640, 5.4224e-4
SC = 0.5; CW = round(800 * SC); Bw = CW / (800 * U)
pad = 40; cx0 = pad + round((0.646 - 400.5 * U) * Bw); top = pad + round(EDGE * U * Bw)
Wd, Hd = round(Bw) + 2 * pad, top + round(0.1884 * Bw) + pad
def button():
    im = Image.new("RGBA", (Wd, Hd), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    r = round(0.031 * Bw); bw = max(2, round(0.0031 * Bw))
    box = (pad, top, pad + round(Bw), top + round(0.1884 * Bw))
    grad = Image.new("RGBA", (Wd, Hd)); g = np.zeros((Hd, Wd, 4), np.uint8)
    xs = np.linspace(0, 1, Wd)[None, :, None]
    g[..., :3] = ((1 - xs) * np.array([213, 189, 229]) + xs * np.array([170, 205, 245])).astype(np.uint8); g[..., 3] = 255
    grad = Image.fromarray(g, "RGBA")
    m = Image.new("L", (Wd, Hd), 0); ImageDraw.Draw(m).rounded_rectangle(box, r, fill=255)
    im.paste(grad, (0, 0), m)
    m2 = Image.new("L", (Wd, Hd), 0); ImageDraw.Draw(m2).rounded_rectangle((box[0] + bw, box[1] + bw, box[2] - bw, box[3] - bw), r - bw, fill=255)
    im.paste((9, 10, 16, 255), (0, 0), m2)
    return im
BTN = button()
frames = []
for lab, ly in layers.items():
    ly["Pip Body"].save(os.path.join(OUT, f"{lab}_body.png")); ly["Pip Hands"].save(os.path.join(OUT, f"{lab}_hands.png"))
    canvas = Image.new("RGBA", (Wd, Hd), (6, 6, 12, 255))
    body = ly["Pip Body"].resize((CW, round(AH * SC)), Image.LANCZOS)
    hands = ly["Pip Hands"].resize((CW, round(AH * SC)), Image.LANCZOS)
    oy = top - round(EDGE * SC)
    canvas.alpha_composite(body, (cx0, oy)); canvas.alpha_composite(BTN); canvas.alpha_composite(hands, (cx0, oy))
    ImageDraw.Draw(canvas).text((8, 6), lab, fill=(200, 200, 220, 255))
    canvas.save(os.path.join(OUT, f"{lab}.png")); frames.append(canvas)
cols = 3; rows = (len(frames) + cols - 1) // cols
sheet = Image.new("RGBA", (Wd * cols, Hd * rows), (0, 0, 0, 255))
for i, f in enumerate(frames): sheet.paste(f, ((i % cols) * Wd, (i // cols) * Hd))
sheet.save(os.path.join(OUT, "sheet.png"))
print("wrote", len(frames), "frames ->", OUT)

"""Render the loop with the Rive CLI and recover true alpha (each frame on white and on black).

usage: python3 tools/render.py [step]        (step in 60 fps frames; default 2 -> a 30 fps loop)
Writes build/frames/fNNN.png (RGBA, one per output frame), build/sheet.png (frames on paper),
and prints the seam error (frame 180 against frame 0, which must match for a seamless loop).
"""
import os, re, shutil, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STEP = int(sys.argv[1]) if len(sys.argv) > 1 else 2
L = 180
ENV = dict(os.environ, PATH=os.path.expanduser("~/.rive/bin") + ":" + os.environ["PATH"], RIVE_NO_TUI="1")
PV = os.path.join(ROOT, "build", "pv")
FR = os.path.join(ROOT, "build", "frames")


def project(variant, colour):
    d = os.path.join(PV, variant); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    os.symlink(os.path.join(ROOT, "art"), os.path.join(d, "art"))
    open(os.path.join(d, "rive.yaml"), "w").write(f"name: pip-plane-{variant}\n")
    s = open(os.path.join(ROOT, "scene.rml")).read()
    s = s.replace('<LayoutComponentStyle name="Artboard Style" id="0:4"/>',
                  f'<LayoutComponentStyle name="Artboard Style" id="0:4"/>\n        <Fill name="Backdrop"><SolidColor colorValue="{colour}" name="C"/></Fill>', 1)
    open(os.path.join(d, "scene.rml"), "w").write(s)
    frames = list(range(0, L + 1, STEP))
    cmds = ["artboard Pip Plane", "advance 0"]
    for i, f in enumerate(frames):
        if i: cmds.append(f"advance {f - frames[i - 1]}")
        cmds.append(f"screenshot {os.path.join(d, f'f{f:03d}.png')}")
    cmds.append("quit")
    r = subprocess.run(["rive", ".", "--commands"], cwd=d, input="\n".join(cmds) + "\n", text=True, capture_output=True, env=ENV)
    if r.returncode: sys.exit(r.stdout[-3000:] + r.stderr[-3000:])
    return d, frames


(dk, frames), (wt, _) = project("dark", "FF000000"), project("light", "FFFFFFFF")
shutil.rmtree(FR, ignore_errors=True); os.makedirs(FR)
out = {}
for f in frames:
    K = np.asarray(Image.open(os.path.join(dk, f"f{f:03d}.png")).convert("RGB")).astype(np.float32)
    W = np.asarray(Image.open(os.path.join(wt, f"f{f:03d}.png")).convert("RGB")).astype(np.float32)
    a = np.clip(1 - (W - K).mean(-1) / 255, 0, 1)
    rgb = np.where(a[..., None] > 1e-3, K / np.maximum(a[..., None], 1e-3), 0)
    im = np.dstack([np.clip(rgb, 0, 255), a * 255]).round().astype(np.uint8)
    out[f] = im
    if f < L: Image.fromarray(im, "RGBA").save(os.path.join(FR, f"f{f // STEP:03d}.png"))
pm = lambda im: im[..., :3].astype(float) * im[..., 3:4] / 255
seam = np.abs(pm(out[0]) - pm(out[L])).mean(); step = np.abs(pm(out[0]) - pm(out[STEP])).mean()
print(f"frames: {len([f for f in frames if f < L])}, seam error (frame {L} vs 0): {seam:.3f} (one step of motion: {step:.3f})")

# contact sheet on paper
pick = frames[:-1][:: max(1, len(frames) // 16)][:16]
h, w = out[0].shape[:2]; tw = 290; th = round(h * tw / w)
sheet = Image.new("RGB", (tw * 4, th * ((len(pick) + 3) // 4)), (255, 255, 255))
for i, f in enumerate(pick):
    im = Image.fromarray(out[f], "RGBA").resize((tw, th), Image.LANCZOS)
    tile = Image.new("RGB", (tw, th), (255, 255, 255)); tile.paste(im, (0, 0), im)
    ImageDraw.Draw(tile).text((6, 4), f"{f / 60:.2f}s", fill=(120, 120, 120))
    ImageDraw.Draw(tile).rectangle((0, 0, tw - 1, th - 1), outline=(225, 225, 225))
    sheet.paste(tile, ((i % 4) * tw, (i // 4) * th))
sheet.save(os.path.join(ROOT, "build", "sheet.png"))

# ---------------------------------------------------------------- web loop: crop to what ever moves, encode
if "--encode" in sys.argv:
    import glob
    fs = sorted(glob.glob(os.path.join(FR, "f*.png")))
    union = np.max([np.asarray(Image.open(f))[..., 3] for f in fs], axis=0)
    ys, xs = np.nonzero(union > 4)
    m = 10; x0, x1 = max(xs.min() - m, 0), min(xs.max() + m, union.shape[1]); y0, y1 = max(ys.min() - m, 0), min(ys.max() + m, union.shape[0])
    w, h = x1 - x0, y1 - y0; W = 840; H = round(h * W / w / 2) * 2
    dst = os.path.join(ROOT, "build", "plane.webm")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "30", "-i", os.path.join(FR, "f%03d.png"),
                    "-vf", f"crop={w}:{h}:{x0}:{y0},scale={W}:{H}:flags=lanczos", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
                    "-b:v", "0", "-crf", sys.argv[sys.argv.index("--encode") + 1] if len(sys.argv) > sys.argv.index("--encode") + 1 else "34",
                    "-row-mt", "1", "-deadline", "good", "-cpu-used", "1", "-auto-alt-ref", "0", "-an", dst], check=True)
    still = Image.open(fs[0]).crop((x0, y0, x1, y1)).resize((W, H), Image.LANCZOS)
    still.save(os.path.join(ROOT, "build", "plane.webp"), "WEBP", quality=88, method=6)
    print(f"crop {w}x{h}+{x0}+{y0} -> {W}x{H}; webm {os.path.getsize(dst) / 1e6:.2f} MB; still {os.path.getsize(os.path.join(ROOT, 'build', 'plane.webp')) / 1e3:.0f} kB")

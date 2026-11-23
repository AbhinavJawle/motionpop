"""Render the 4.0 s Caption Goblin pixel-art loop via Rive CLI, recover alpha, check seam, and encode 1:1 crisp pixel art.

usage: uv run --with numpy --with pillow python3 tools/render.py [step] [--encode [crf]] [--mp4]
"""
import glob, os, shutil, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STEP = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 2
L = 240
ENV = dict(os.environ, PATH=os.path.expanduser("~/.rive/bin") + ":" + os.environ["PATH"], RIVE_NO_TUI="1")
PV = os.path.join(ROOT, "build", "pv")
FR = os.path.join(ROOT, "build", "frames")


def project(variant, colour):
    d = os.path.join(PV, variant)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    os.symlink(os.path.join(ROOT, "art"), os.path.join(d, "art"))
    open(os.path.join(d, "rive.yaml"), "w").write(f"name: pip-caption-{variant}\n")
    s = open(os.path.join(ROOT, "scene.rml")).read()
    s = s.replace(
        '<LayoutComponentStyle name="Artboard Style" id="0:4"/>',
        f'<LayoutComponentStyle name="Artboard Style" id="0:4"/>\n        <Fill name="Backdrop"><SolidColor colorValue="{colour}" name="C"/></Fill>',
        1,
    )
    open(os.path.join(d, "scene.rml"), "w").write(s)
    frames = list(range(0, L + 1, STEP))
    cmds = ["artboard Pip Caption Goblin", "advance 0"]
    for i, f in enumerate(frames):
        if i:
            cmds.append(f"advance {f - frames[i - 1]}")
        cmds.append(f"screenshot {os.path.join(d, f'f{f:03d}.png')}")
    cmds.append("quit")
    r = subprocess.run(["rive", ".", "--commands"], cwd=d, input="\n".join(cmds) + "\n",
                       text=True, capture_output=True, env=ENV)
    if r.returncode:
        sys.exit(r.stdout[-3000:] + r.stderr[-3000:])
    return d, frames


(dk, frames), (wt, _) = project("dark", "FF000000"), project("light", "FFFFFFFF")
shutil.rmtree(FR, ignore_errors=True)
os.makedirs(FR)
out = {}
for f in frames:
    K = np.asarray(Image.open(os.path.join(dk, f"f{f:03d}.png")).convert("RGB")).astype(np.float32)
    W = np.asarray(Image.open(os.path.join(wt, f"f{f:03d}.png")).convert("RGB")).astype(np.float32)
    a = np.clip(1.0 - (W - K).mean(-1) / 255.0, 0.0, 1.0)
    # Enforce hard-edged pixel-art alpha cleanly!
    a = np.where(a >= 0.5, 1.0, 0.0)
    rgb = np.where(a[..., None] > 0.5, K, 0.0)
    im = np.dstack([np.clip(rgb, 0, 255), a * 255.0]).round().astype(np.uint8)
    out[f] = im
    if f < L:
        Image.fromarray(im, "RGBA").save(os.path.join(FR, f"f{f // STEP:03d}.png"))

pm = lambda im: im[..., :3].astype(float) * im[..., 3:4] / 255.0
seam = np.abs(pm(out[0]) - pm(out[L])).mean()
# Measure motion across pixel-art step changes (every 4 frames = 15 fps beat!)
beat_steps = [np.abs(pm(out[f]) - pm(out[f + 4])).mean() for f in range(0, L, 4) if f in out and (f + 4) in out]
print(
    f"frames: {len([f for f in frames if f < L])}, "
    f"seam error (frame {L} vs 0): {seam:.4f} "
    f"(mean 15fps step motion: {np.mean(beat_steps):.3f}, min: {np.min(beat_steps):.3f}, max: {np.max(beat_steps):.3f})"
)

pick = [0, 16, 24, 44, 56, 72, 80, 96, 108, 120, 132, 148, 168, 184, 196, 224]
pick = [min(frames[:-1], key=lambda x: abs(x - p)) for p in pick]
union_a = np.max([out[f][..., 3] for f in frames[:-1]], axis=0)
ys, xs = np.nonzero(union_a > 128)
pad = 16
cx0 = max(0, (int(xs.min()) - pad) // 2 * 2)
cy0 = max(0, (int(ys.min()) - pad) // 2 * 2)
cx1 = min(union_a.shape[1], ((int(xs.max()) + pad + 1) // 2) * 2)
cy1 = min(union_a.shape[0], ((int(ys.max()) + pad + 1) // 2) * 2)
clipped = (xs.min() <= 2 or xs.max() >= union_a.shape[1] - 3 or ys.min() <= 2 or ys.max() >= union_a.shape[0] - 3)
print(f"content bbox: ({cx0},{cy0})-({cx1},{cy1}) [{cx1-cx0}x{cy1-cy0}], clipped={clipped}")

tw = 360
th = round((cy1 - cy0) * tw / (cx1 - cx0))
sheet = Image.new("RGB", (tw * 4, th * 4), (250, 249, 246))
for i, f in enumerate(pick):
    # NEAREST resize preserves crisp hard pixel-art edges on the contact sheet!
    im = Image.fromarray(out[f], "RGBA").crop((cx0, cy0, cx1, cy1)).resize((tw, th), Image.NEAREST)
    tile = Image.new("RGB", (tw, th), (250, 249, 246))
    tile.paste(im, (0, 0), im)
    dr = ImageDraw.Draw(tile)
    dr.text((8, 6), f"f{f:03d} ({f / 60:.2f}s)", fill=(90, 84, 78))
    dr.rectangle((0, 0, tw - 1, th - 1), outline=(224, 220, 214))
    sheet.paste(tile, ((i % 4) * tw, (i // 4) * th))
sheet.save(os.path.join(ROOT, "build", "sheet.png"))

if "--encode" in sys.argv:
    idx = sys.argv.index("--encode")
    crf = sys.argv[idx + 1] if len(sys.argv) > idx + 1 and sys.argv[idx + 1].isdigit() else "22"
    fs = sorted(glob.glob(os.path.join(FR, "f*.png")))
    # Encode at EXACT 1:1 cropped native pixel dimensions (ZERO scaling blur, ZERO uneven nearest-neighbor stretch!)
    w, h = cx1 - cx0, cy1 - cy0
    dst = os.path.join(ROOT, "build", "caption.webm")
    fps_out = str(60 // STEP)
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-framerate", fps_out, "-i", os.path.join(FR, "f%03d.png"),
        "-vf", f"crop={w}:{h}:{cx0}:{cy0}",
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", crf,
        "-row-mt", "1", "-deadline", "good", "-cpu-used", "1", "-auto-alt-ref", "0", "-an", dst,
    ], check=True)
    still = Image.open(fs[0]).crop((cx0, cy0, cx1, cy1))
    still.save(os.path.join(ROOT, "build", "caption.webp"), "WEBP", lossless=True, method=6)
    print(f"encoded 1:1 native pixel art: {w}x{h} @ {fps_out}fps; webm {os.path.getsize(dst) / 1e6:.2f} MB; webp {os.path.getsize(os.path.join(ROOT, 'build', 'caption.webp')) / 1e3:.0f} kB")

if "--mp4" in sys.argv:
    w, h = cx1 - cx0, cy1 - cy0
    dst_mp4 = os.path.join(ROOT, "build", "caption.mp4")
    fps_out = str(60 // STEP)
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-stream_loop", "1", "-framerate", fps_out,
        "-i", os.path.join(FR, "f%03d.png"),
        "-filter_complex",
        f"color=c=0xFAF9F6:s={w}x{h}:r={fps_out}[bg];"
        f"[0:v]crop={w}:{h}:{cx0}:{cy0}[fg];"
        f"[bg][fg]overlay=shortest=1:format=auto,format=yuv420p",
        "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-an", dst_mp4,
    ], check=True)
    print(f"preview mp4 (2 loops): {dst_mp4} ({os.path.getsize(dst_mp4) / 1e6:.2f} MB)")

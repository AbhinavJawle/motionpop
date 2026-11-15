"""Prototype of the colour-key cutout (the product version will be TypeScript in a worker)."""
import sys, os, time, numpy as np
from PIL import Image
def key(rgb):
    """rgb: HxWx3 uint8 -> (rgba uint8, info). Background colour estimated from the border."""
    a = rgb.astype(np.float32)
    h, w, _ = a.shape; b = max(4, h // 64)
    border = np.concatenate([a[:b].reshape(-1,3), a[-b:].reshape(-1,3), a[:, :b].reshape(-1,3), a[:, -b:].reshape(-1,3)])
    bg = np.median(border, axis=0)
    near = np.linalg.norm(border - bg, axis=1) < 30          # robust: the subject may touch an edge
    share = float(near.mean()); bg = border[near].mean(axis=0); spread = float(np.linalg.norm(border[near] - bg, axis=1).mean())
    # chroma distance: compare colour direction and distance, tolerant of brightness changes on the backdrop
    d = np.linalg.norm(a - bg, axis=2)
    dom = int(np.argmax(bg)); others = [i for i in range(3) if i != dom]
    excess = a[..., dom] - np.maximum(a[..., others[0]], a[..., others[1]])   # how "key coloured" a pixel is
    bg_excess = bg[dom] - max(bg[others[0]], bg[others[1]])
    k = np.clip(excess / max(bg_excess, 1), 0, 1)                             # 1 = pure key colour
    alpha = np.clip((1 - k) * 1.6 - 0.1, 0, 1) * np.clip((d - 30) / 60, 0, 1) ** 0.5
    alpha = np.where(d < 30, 0, alpha)
    # unmix the backdrop out of soft edge pixels: pixel = alpha*fg + (1-alpha)*bg  =>  fg
    al = alpha[..., None]
    out = np.where(al > 0.02, (a - (1 - al) * bg) / np.maximum(al, 0.02), a)
    out = np.clip(out, 0, 255)
    # despill (bounce light and leftovers): cap the key channel at the average of the other two (+ small slack)
    cap = (out[..., others[0]] + out[..., others[1]]) / 2 + 6
    out[..., dom] = np.minimum(out[..., dom], cap)
    kept = float((alpha > 0.5).mean())
    ok = share > 0.55 and spread < 18 and bg_excess > 60 and 0.05 < kept < 0.90
    rgba = np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)
    return rgba, dict(bg=[int(x) for x in bg], spread=round(spread,1), share=round(share,2), kept=round(kept,3), keyed=ok)
def over(rgba, colour):
    a = rgba[..., 3:4].astype(np.float32) / 255
    return (rgba[..., :3] * a + np.array(colour, np.float32) * (1 - a)).astype(np.uint8)
if __name__ == '__main__':
    os.makedirs('key', exist_ok=True)
    for f in sorted(os.listdir('img')):
        if not f.endswith('.png') or 'white' in f: continue
        rgb = np.array(Image.open(os.path.join('img', f)).convert('RGB')); t0 = time.time()
        rgba, info = key(rgb); ms = (time.time() - t0) * 1000
        Image.fromarray(rgba).save(os.path.join('key', f))
        print(f, rgb.shape[:2], info, f'{ms:.0f} ms')

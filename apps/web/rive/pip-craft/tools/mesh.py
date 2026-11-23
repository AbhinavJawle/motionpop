"""Build clean outline-based Rive mesh and 4-bone weights for Craftsman Pip's knitted `body`.

usage: uv run --with opencv-python-headless --with numpy --with pillow python3 tools/mesh.py

Bones (tendons 1..4):
  1: TorsoRoot (508, 575) pointing UP (-90 deg)
  2: HeadBone  (508, 400) pointing UP (-90 deg)
  3: CrownBone (508, 225) pointing UP (-90 deg)
  4: HemBone   (508, 575) pointing DOWN (+90 deg)

Writes tools/meshes.json and build/mesh_debug.png.
"""
import json, math, os
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art")
TOOLS = os.path.join(ROOT, "tools")
DBG = os.path.join(ROOT, "build")
LAY = json.load(open(os.path.join(TOOLS, "layers.json")))


def resample_ring(pts, step):
    pts = list(pts) + [pts[0]]
    out, carry = [], 0.0
    for a, b in zip(pts[:-1], pts[1:]):
        seg = math.hypot(b[0] - a[0], b[1] - a[1])
        if seg < 1e-6:
            continue
        t = carry
        while t < seg:
            u = t / seg
            out.append((a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u))
            t += step
        carry = t - seg
    return out


def delaunay(pts):
    pts = list(pts)
    n = len(pts)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    d = max(max(xs) - min(xs), max(ys) - min(ys)) * 10.0
    cx, cy = (min(xs) + max(xs)) * 0.5, (min(ys) + max(ys)) * 0.5
    pts += [(cx - d, cy - d), (cx + d, cy - d), (cx, cy + d)]
    tris = [(n, n + 1, n + 2)]

    def circ(t):
        (ax, ay), (bx, by), (cx_, cy_) = pts[t[0]], pts[t[1]], pts[t[2]]
        dd = 2.0 * (ax * (by - cy_) + bx * (cy_ - ay) + cx_ * (ay - by))
        if abs(dd) < 1e-9:
            return (0.0, 0.0, 1e30)
        ux = ((ax * ax + ay * ay) * (by - cy_) + (bx * bx + by * by) * (cy_ - ay) + (cx_ * cx_ + cy_ * cy_) * (ay - by)) / dd
        uy = ((ax * ax + ay * ay) * (cx_ - bx) + (bx * bx + by * by) * (ax - cx_) + (cx_ * cx_ + cy_ * cy_) * (bx - ax)) / dd
        return ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2

    cc = {tris[0]: circ(tris[0])}
    for i in range(n):
        px, py = pts[i]
        bad = [t for t in tris if (px - cc[t][0]) ** 2 + (py - cc[t][1]) ** 2 < cc[t][2]]
        edges = {}
        for t in bad:
            for e in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
                k = tuple(sorted(e))
                edges[k] = edges.get(k, 0) + 1
        tris = [t for t in tris if t not in bad]
        for t in bad:
            cc.pop(t, None)
        for e, c in edges.items():
            if c == 1:
                t = (e[0], e[1], i)
                tris.append(t)
                cc[t] = circ(t)
    return [t for t in tris if max(t) < n]


def smoothstep(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3.0 - 2.0 * x)


def pack_weights(pairs):
    pairs = [(idx, w) for idx, w in pairs if w > 1e-4]
    pairs.sort(key=lambda p: -p[1])
    pairs = pairs[:4]
    s = sum(w for _, w in pairs)
    raw = [w * 255.0 / s for _, w in pairs]
    ints = [int(math.floor(v)) for v in raw]
    rem = 255 - sum(ints)
    order = sorted(range(len(raw)), key=lambda i: -(raw[i] - ints[i]))
    for i in order[:rem]:
        ints[i] += 1
    kept = [(pairs[i][0], ints[i]) for i in range(len(pairs)) if ints[i] > 0]
    vals = idxs = 0
    for slot, (idx, val) in enumerate(kept):
        vals |= (val & 0xFF) << (8 * slot)
        idxs |= (idx & 0xFF) << (8 * slot)
    assert sum((vals >> (8 * k)) & 0xFF for k in range(4)) == 255
    return vals, idxs


lay = LAY["body"]
im = cv2.imread(os.path.join(ART, "body.png"), cv2.IMREAD_UNCHANGED)
h, w = im.shape[:2]
a = im[..., 3]
expand_px = 5
pad = expand_px + 4
ap = cv2.copyMakeBorder((a > 8).astype(np.uint8), pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * expand_px + 1, 2 * expand_px + 1))
exp = cv2.morphologyEx(cv2.dilate(ap, kern), cv2.MORPH_CLOSE, kern)
cnts, _ = cv2.findContours(exp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
cnt = max(cnts, key=cv2.contourArea)
approx = cv2.approxPolyDP(cnt, 2.5, True).reshape(-1, 2)
ring_local = resample_ring([(float(p[0] - pad), float(p[1] - pad)) for p in approx], 34.0)
ring_world = [(lay["x"] + min(max(x, 0.0), float(w)), lay["y"] + min(max(y, 0.0), float(h))) for x, y in ring_local]

ero_m = cv2.erode(ap, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19))) > 0
inner = []
for y in range(155, 865, 58):
    for x in range(255, 765, 56):
        lx, ly = int(round(x - lay["x"] + pad)), int(round(y - lay["y"] + pad))
        if 0 <= lx < ero_m.shape[1] and 0 <= ly < ero_m.shape[0] and ero_m[ly, lx]:
            if all(math.hypot(x - px, y - py) >= 24.0 for px, py in ring_world + inner):
                inner.append((float(x), float(y)))

pts = ring_world + inner
n_ring = len(ring_world)
tris = []
for t in delaunay(pts):
    tri_w = [pts[k] for k in t]
    cx = sum(p[0] for p in tri_w) / 3.0 - lay["x"] + pad
    cy = sum(p[1] for p in tri_w) / 3.0 - lay["y"] + pad
    ci, cj = int(round(cx)), int(round(cy))
    if 0 <= ci < exp.shape[1] and 0 <= cj < exp.shape[0] and exp[cj, ci] > 0:
        tris.append(list(t))

cov = np.zeros((h, w), np.uint8)
for t in tris:
    tri_l = np.array([[round(pts[k][0] - lay["x"]), round(pts[k][1] - lay["y"])] for k in t], np.int32)
    cv2.fillPoly(cov, [tri_l], 1)
missed = ((a > 12) & (cov == 0)).sum()
print(f"body: {len(pts)} verts ({n_ring} contour, {len(inner)} inner), {len(tris)} tris, missed art px: {int(missed)}")

verts = []
for i, (wx, wy) in enumerate(pts):
    if wy <= 575.0:
        t_head = smoothstep((545.0 - wy) / 165.0)
        t_crown = 0.55 * smoothstep((365.0 - wy) / 215.0)
        w1 = 1.0 - t_head
        w2 = t_head * (1.0 - t_crown)
        w3 = t_head * t_crown
        w4 = 0.0
    else:
        t_hem = 0.88 * smoothstep((wy - 575.0) / 260.0)
        w1 = 1.0 - t_hem
        w2 = 0.0
        w3 = 0.0
        w4 = t_hem
    vals, idxs = pack_weights([(1, w1), (2, w2), (3, w3), (4, w4)])
    verts.append({
        "x": wx, "y": wy, "ring": i < n_ring, "values": vals, "indices": idxs,
        "w": [round(w1, 3), round(w2, 3), round(w3, 3), round(w4, 3)],
    })

json.dump({"body": {"verts": verts, "tris": tris}}, open(os.path.join(TOOLS, "meshes.json"), "w"), indent=1)

AW, AH = LAY["size"]
dbg = np.full((AH, AW, 3), 235, np.uint8)
x0, y0 = int(round(lay["x"])), int(round(lay["y"]))
al = im[..., 3:4].astype(np.float32) / 255.0
dbg[y0:y0 + h, x0:x0 + w] = (dbg[y0:y0 + h, x0:x0 + w] * (1 - al) + im[..., :3] * al).astype(np.uint8)
for t in tris:
    pts_i = np.array([[round(verts[k]["x"]), round(verts[k]["y"])] for k in t], np.int32)
    cv2.polylines(dbg, [pts_i], True, (80, 130, 230), 1, cv2.LINE_AA)
for v in verts:
    col = (int(255 * v["w"][0]), int(255 * v["w"][1] + 200 * v["w"][3]), int(255 * v["w"][2] + 180 * v["w"][3]))
    cv2.circle(dbg, (round(v["x"]), round(v["y"])), 4, col, -1)
cv2.imwrite(os.path.join(DBG, "mesh_debug.png"), dbg)
print("Wrote tools/meshes.json and build/mesh_debug.png")

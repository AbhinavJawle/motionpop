"""Build clean outline-based Rive meshes and bone weights for `body` and `page_l`.

usage: uv run --with opencv-python-headless --with numpy --with pillow python3 tools/mesh.py

Writes tools/meshes.json and build/mesh_debug.png for visual verification.
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


def build_mesh(name, ring_step, interior_pts, expand_px=4):
    lay = LAY[name]
    im = cv2.imread(os.path.join(ART, f"{name}.png"), cv2.IMREAD_UNCHANGED)
    h, w = im.shape[:2]
    a = im[..., 3]
    # Pad image slightly so expanded contour stays inside [0..w-1, 0..h-1] safely
    pad = expand_px + 4
    ap = cv2.copyMakeBorder((a > 12).astype(np.uint8), pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
    kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * expand_px + 1, 2 * expand_px + 1))
    exp = cv2.dilate(ap, kern)
    exp = cv2.morphologyEx(exp, cv2.MORPH_CLOSE, kern)
    cnts, _ = cv2.findContours(exp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cnt = max(cnts, key=cv2.contourArea)
    approx = cv2.approxPolyDP(cnt, 2.2, True).reshape(-1, 2)
    ring_local = [(float(p[0] - pad), float(p[1] - pad)) for p in approx]
    ring_local = resample_ring(ring_local, ring_step)
    # Clamp ring points gently to image texture bounds (slightly inset/clamped to [0..w, 0..h])
    ring_world = [(lay["x"] + min(max(x, 0.0), float(w)), lay["y"] + min(max(y, 0.0), float(h))) for x, y in ring_local]

    # Filter interior points strictly inside the eroded mask and not too close to ring or each other
    ero_m = cv2.erode(ap, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))) > 0
    inner = []
    min_d = ring_step * 0.55
    for wx, wy in interior_pts:
        lx, ly = int(round(wx - lay["x"] + pad)), int(round(wy - lay["y"] + pad))
        if 0 <= lx < ero_m.shape[1] and 0 <= ly < ero_m.shape[0] and ero_m[ly, lx]:
            if all(math.hypot(wx - px, wy - py) >= min_d for px, py in ring_world + inner):
                inner.append((float(wx), float(wy)))

    # Contour vertices MUST come first for Rive ContourMeshVertex!
    pts = ring_world + inner
    n_ring = len(ring_world)
    tris_raw = delaunay(pts)

    # Filter triangles whose centroid & area are inside the expanded mask
    tris = []
    for t in tris_raw:
        tri_w = [pts[k] for k in t]
        cx = sum(p[0] for p in tri_w) / 3.0 - lay["x"] + pad
        cy = sum(p[1] for p in tri_w) / 3.0 - lay["y"] + pad
        ci, cj = int(round(cx)), int(round(cy))
        if 0 <= ci < exp.shape[1] and 0 <= cj < exp.shape[0] and exp[cj, ci] > 0:
            tris.append(list(t))

    # Coverage check against opaque pixels (alpha > 8)
    cov = np.zeros((h, w), np.uint8)
    for t in tris:
        tri_l = np.array([[round(pts[k][0] - lay["x"]), round(pts[k][1] - lay["y"])] for k in t], np.int32)
        cv2.fillPoly(cov, [tri_l], 1)
    missed = ((a > 8) & (cov == 0)).sum()
    print(f"{name}: {len(pts)} verts ({n_ring} contour, {len(inner)} inner), {len(tris)} tris, missed art px: {int(missed)}")
    return pts, n_ring, tris


def smoothstep(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3.0 - 2.0 * x)


def pack_weights(pairs):
    """pairs: [(tendon_1based, float_weight), ...] -> (values_packed, indices_packed) summing strictly to 255."""
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
    # drop any 0 slots
    kept = [(pairs[i][0], ints[i]) for i in range(len(pairs)) if ints[i] > 0]
    vals = 0
    idxs = 0
    for slot, (idx, val) in enumerate(kept):
        vals |= (val & 0xFF) << (8 * slot)
        idxs |= (idx & 0xFF) << (8 * slot)
    assert sum((vals >> (8 * k)) & 0xFF for k in range(4)) == 255
    return vals, idxs, kept


# ---------------- 1. BODY MESH (3 bones: 1=BodyRoot, 2=HeadBone, 3=CrownBone)
# Joint lines: BodyRoot->Head at y=410, Head->Crown at y=280
body_inner = []
for y in (535, 485, 440, 405, 365, 325, 280, 235):
    for x in range(290, 640, 44):
        body_inner.append((float(x), float(y)))
b_pts, b_nring, b_tris = build_mesh("body", ring_step=28.0, interior_pts=body_inner, expand_px=6)

body_verts = []
for i, (wx, wy) in enumerate(b_pts):
    # Smooth C1 vertical weights:
    # y >= 480: 100% BodyRoot (1)
    # y 480 -> 365: blend BodyRoot (1) -> HeadBone (2)
    # y 365 -> 205: blend HeadBone (2) -> CrownBone (3, max 0.55 so crown stays squishy & never pinches)
    t_head = smoothstep((485.0 - wy) / 120.0)
    t_crown = 0.58 * smoothstep((355.0 - wy) / 150.0)
    w1 = 1.0 - t_head
    w2 = t_head * (1.0 - t_crown)
    w3 = t_head * t_crown
    vals, idxs, kept = pack_weights([(1, w1), (2, w2), (3, w3)])
    body_verts.append({"x": wx, "y": wy, "ring": i < b_nring, "values": vals, "indices": idxs, "w": [round(w1, 3), round(w2, 3), round(w3, 3)]})

# ---------------- 2. PAGE_L MESH (2 bones: 1=PageSpineBone, 2=PageTipBone)
# Spine line runs from (484, 567) to (588, 704); outer left edge is ~220 px away in direction (-0.82, -0.57)... wait:
# vector along spine: s = (104, 137) / 172 = (0.605, 0.796); outward perpendicular toward left page: n = (-0.796, 0.605)
# Actually let's measure perpendicular distance from spine line (484,567)-(588,704) directly!
sp0 = np.array([484.0, 567.0])
sp1 = np.array([588.0, 704.0])
sp_dir = (sp1 - sp0) / np.linalg.norm(sp1 - sp0)
page_inner = []
for y in range(545, 695, 36):
    for x in range(275, 565, 40):
        page_inner.append((float(x), float(y)))
p_pts, p_nring, p_tris = build_mesh("page_l", ring_step=26.0, interior_pts=page_inner, expand_px=6)

page_verts = []
for i, (wx, wy) in enumerate(p_pts):
    p = np.array([wx, wy])
    proj = sp0 + np.dot(p - sp0, sp_dir) * sp_dir
    dist = float(np.linalg.norm(p - proj))
    # 0..35 px from spine: locked 100% to spine (1); 35..200 px: smoothly bends with PageTipBone (2)
    w2 = smoothstep((dist - 28.0) / 165.0)
    w1 = 1.0 - w2
    vals, idxs, kept = pack_weights([(1, w1), (2, w2)])
    page_verts.append({"x": wx, "y": wy, "ring": i < p_nring, "values": vals, "indices": idxs, "w": [round(w1, 3), round(w2, 3)]})

out = {
    "body": {"verts": body_verts, "tris": b_tris},
    "page_l": {"verts": page_verts, "tris": p_tris},
}
json.dump(out, open(os.path.join(TOOLS, "meshes.json"), "w"), indent=1)

# Debug visualization
W, H = LAY["size"]
dbg = np.full((H, W, 3), 235, np.uint8)
for nm in ("book", "body", "page_l"):
    b = LAY[nm]
    im = cv2.imread(os.path.join(ART, nm + ".png"), cv2.IMREAD_UNCHANGED)
    x0, y0 = int(b["x"]), int(b["y"])
    hh, ww = im.shape[:2]
    al = im[..., 3:4].astype(np.float32) / 255.0
    dbg[y0:y0 + hh, x0:x0 + ww] = (dbg[y0:y0 + hh, x0:x0 + ww] * (1 - al) + im[..., :3] * al).astype(np.uint8)

for nm, data in out.items():
    vs = data["verts"]
    for t in data["tris"]:
        pts_i = np.array([[round(vs[k]["x"]), round(vs[k]["y"])] for k in t], np.int32)
        cv2.polylines(dbg, [pts_i], True, (60, 120, 255) if nm == "body" else (40, 180, 90), 1, cv2.LINE_AA)
    for v in vs:
        if nm == "body":
            col = (int(255 * v["w"][0]), int(255 * v["w"][1]), int(255 * v["w"][2]))
        else:
            col = (int(255 * v["w"][0]), int(255 * v["w"][1]), 80)
        cv2.circle(dbg, (round(v["x"]), round(v["y"])), 4, col, -1)

cv2.imwrite(os.path.join(DBG, "mesh_debug.png"), dbg)
print("Wrote tools/meshes.json and build/mesh_debug.png")

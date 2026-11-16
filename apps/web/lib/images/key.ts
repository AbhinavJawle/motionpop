/**
 * Colour-key cutout (D-030, spec 07 task 25): a TypeScript port of the spike's `key.py`. The
 * backdrop colour is estimated from the border (the model never paints exact #00FF00), a soft
 * matte comes from how "key coloured" each pixel is, the backdrop is unmixed out of edge pixels
 * (no olive halo on hair), then any leftover spill is capped. Pure: RGBA bytes in, RGBA out.
 */
export interface KeyResult {
  rgba: Uint8ClampedArray<ArrayBuffer>;
  /** False when the backdrop isn't clearly one key colour: use the picture framed instead. */
  keyed: boolean;
  info: { bg: [number, number, number]; share: number; spread: number; kept: number };
}

export function keyOut(src: Uint8ClampedArray, w: number, h: number): KeyResult {
  const b = Math.max(4, Math.floor(h / 64));
  // Border pixels.
  const border: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    border.push(src[i] as number, src[i + 1] as number, src[i + 2] as number);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (y < b || y >= h - b || x < b || x >= w - b) push(x, y);
  const n = border.length / 3;
  // Median per channel.
  const med = [0, 1, 2].map((c) => {
    const v: number[] = [];
    for (let i = 0; i < n; i++) v.push(border[i * 3 + c] as number);
    v.sort((a, z) => a - z);
    return v[Math.floor(v.length / 2)] as number;
  }) as [number, number, number];
  // Robust mean over the border pixels that agree with the median (the subject may touch an edge).
  let cnt = 0;
  const sum = [0, 0, 0];
  const near: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const r = border[i * 3] as number;
    const g = border[i * 3 + 1] as number;
    const bl = border[i * 3 + 2] as number;
    const d = Math.hypot(r - med[0], g - med[1], bl - med[2]);
    const ok = d < 30;
    near.push(ok);
    if (ok) {
      cnt++;
      sum[0]! += r;
      sum[1]! += g;
      sum[2]! += bl;
    }
  }
  const share = cnt / Math.max(1, n);
  const bg: [number, number, number] =
    cnt > 0 ? [sum[0]! / cnt, sum[1]! / cnt, sum[2]! / cnt] : med;
  let spread = 0;
  for (let i = 0; i < n; i++)
    if (near[i])
      spread += Math.hypot(
        (border[i * 3] as number) - bg[0],
        (border[i * 3 + 1] as number) - bg[1],
        (border[i * 3 + 2] as number) - bg[2],
      );
  spread /= Math.max(1, cnt);

  const dom = bg[0] >= bg[1] && bg[0] >= bg[2] ? 0 : bg[1] >= bg[2] ? 1 : 2;
  const o1 = dom === 0 ? 1 : 0;
  const o2 = dom === 2 ? 1 : 2;
  const bgExcess = bg[dom] - Math.max(bg[o1], bg[o2]);
  const out = new Uint8ClampedArray(new ArrayBuffer(src.length));
  let kept = 0;
  const px = w * h;
  for (let p = 0; p < px; p++) {
    const i = p * 4;
    const a = [src[i] as number, src[i + 1] as number, src[i + 2] as number];
    const d = Math.hypot(a[0]! - bg[0], a[1]! - bg[1], a[2]! - bg[2]);
    const excess = a[dom]! - Math.max(a[o1]!, a[o2]!);
    const k = Math.min(1, Math.max(0, excess / Math.max(bgExcess, 1)));
    let alpha =
      d < 30
        ? 0
        : Math.min(1, Math.max(0, (1 - k) * 1.6 - 0.1)) *
          Math.sqrt(Math.min(1, Math.max(0, (d - 30) / 60)));
    alpha = Math.min(1, Math.max(0, alpha));
    const fg = [0, 0, 0];
    for (let c = 0; c < 3; c++)
      fg[c] =
        alpha > 0.02
          ? Math.min(255, Math.max(0, (a[c]! - (1 - alpha) * bg[c]!) / Math.max(alpha, 0.02)))
          : a[c]!;
    // Despill: cap the key channel at the average of the other two (+ small slack).
    fg[dom] = Math.min(fg[dom]!, (fg[o1]! + fg[o2]!) / 2 + 6);
    out[i] = fg[0]!;
    out[i + 1] = fg[1]!;
    out[i + 2] = fg[2]!;
    out[i + 3] = alpha * 255;
    if (alpha > 0.5) kept++;
  }
  const keptShare = kept / px;
  const keyed = share > 0.55 && spread < 18 && bgExcess > 60 && keptShare > 0.05 && keptShare < 0.9;
  return {
    rgba: out,
    keyed,
    info: {
      bg: [Math.round(bg[0]), Math.round(bg[1]), Math.round(bg[2])],
      share: Math.round(share * 100) / 100,
      spread: Math.round(spread * 10) / 10,
      kept: Math.round(keptShare * 1000) / 1000,
    },
  };
}

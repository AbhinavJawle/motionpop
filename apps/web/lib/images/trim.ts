/**
 * Paper trim (spec 26): generated illustrations come back with wide blank paper around the
 * subject, which makes the drawing tiny on screen. This finds the drawing's box against the
 * paper colour (read from the corners) and crops to it with a small even margin.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Average colour of the four corner pixels (the paper). */
export function paperColour(rgba: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const at = [0, w - 1, (h - 1) * w, h * w - 1];
  const sum = [0, 0, 0];
  for (const p of at) for (let c = 0; c < 3; c++) sum[c]! += rgba[p * 4 + c]!;
  return [sum[0]! / 4, sum[1]! / 4, sum[2]! / 4];
}

/**
 * The smallest box holding every pixel that differs from the paper by more than `threshold`
 * (max channel difference), or null when the whole picture is paper.
 */
export function contentBox(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  paper: readonly [number, number, number],
  threshold = 18,
): Box | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (rgba[i + 3]! < 16) continue;
      const d = Math.max(
        Math.abs(rgba[i]! - paper[0]),
        Math.abs(rgba[i + 1]! - paper[1]),
        Math.abs(rgba[i + 2]! - paper[2]),
      );
      if (d <= threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The crop for a content box: padded by `pad` × its longer side, clamped to the picture. */
export function paddedCrop(box: Box, w: number, h: number, pad = 0.06): Box {
  const m = Math.round(Math.max(box.w, box.h) * pad);
  const x = Math.max(0, box.x - m);
  const y = Math.max(0, box.y - m);
  return { x, y, w: Math.min(w, box.x + box.w + m) - x, h: Math.min(h, box.y + box.h + m) - y };
}

/**
 * Scales each channel so the paper becomes pure white (the drawing keeps its proportions).
 * Reels multiply illustrations onto the panel, so white paper vanishes on any panel colour.
 */
export function whitenPaper(rgba: Uint8ClampedArray, paper: readonly [number, number, number]): void {
  const k = paper.map((c) => 255 / Math.max(1, c));
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = rgba[i]! * k[0]!;
    rgba[i + 1] = rgba[i + 1]! * k[1]!;
    rgba[i + 2] = rgba[i + 2]! * k[2]!;
  }
}

/**
 * White paper → transparency ("colour to alpha"): each pixel keeps exactly how it looks over
 * white, but the panel (grid, cream, texture) now shows through the paper. Run after whitenPaper.
 */
export function paperToAlpha(rgba: Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const a = Math.max(255 - r, 255 - g, 255 - b) / 255;
    if (a <= 0) {
      rgba[i + 3] = 0;
      continue;
    }
    rgba[i] = 255 - (255 - r) / a;
    rgba[i + 1] = 255 - (255 - g) / a;
    rgba[i + 2] = 255 - (255 - b) / a;
    rgba[i + 3] = Math.round(a * rgba[i + 3]!);
  }
}

/** The picture cropped to its drawing, paper made transparent; the original when it is blank. */
export async function trimPaper(blob: Blob, pad = 0.06): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  try {
    // Measure on a small copy (fast), crop the full-size picture.
    const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
    const sw = Math.max(1, Math.round(bmp.width * k));
    const sh = Math.max(1, Math.round(bmp.height * k));
    const small = new OffscreenCanvas(sw, sh);
    const sctx = small.getContext('2d', { willReadFrequently: true })!;
    sctx.drawImage(bmp, 0, 0, sw, sh);
    const data = sctx.getImageData(0, 0, sw, sh).data;
    const box = contentBox(data, sw, sh, paperColour(data, sw, sh));
    if (!box) return blob;
    let crop = paddedCrop(box, sw, sh, pad);
    // No crop when the drawing already fills ≥ 85% of the picture both ways (still whitened).
    if (crop.w >= sw * 0.85 && crop.h >= sh * 0.85) crop = { x: 0, y: 0, w: sw, h: sh };
    const full = {
      x: Math.floor(crop.x / k),
      y: Math.floor(crop.y / k),
      w: Math.min(bmp.width, Math.ceil(crop.w / k)),
      h: Math.min(bmp.height, Math.ceil(crop.h / k)),
    };
    const out = new OffscreenCanvas(full.w, full.h);
    const octx = out.getContext('2d', { willReadFrequently: true })!;
    octx.drawImage(bmp, full.x, full.y, full.w, full.h, 0, 0, full.w, full.h);
    const px = octx.getImageData(0, 0, full.w, full.h);
    whitenPaper(px.data, paperColour(data, sw, sh));
    paperToAlpha(px.data);
    octx.putImageData(px, 0, 0);
    return await out.convertToBlob({ type: 'image/png' });
  } finally {
    bmp.close();
  }
}
